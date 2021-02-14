/**
 * @module manager.creeps
 * 
 * @typedef {CreepSpawnManager} CreepSpawnManager
 * @typedef {SpecialCreepScheme} SpecialCreepScheme
 */
const getCacheExpiration            = require('./util').getCacheExpiration;
const isMyRoom                      = require('./util').isMyRoom;
const evaluateCost                  = require('./util').evaluateCost;
const calcInRoomDistance            = require('./util').calcInRoomDistance;
const parseBodyPartsConfiguration   = require('./util').parseBodyPartsConfiguration;
const profiler = require("./screeps-profiler");
const CREEP_SPAWN_CACHE_TIMEOUT =   50;
const CREEP_SPAWN_CACHE_OFFSET  =   5;
/**
 * Class Representation for CreepSpawn
 * Single Class
 * @TODO
 * Currently, the spawning of creeps is controlled rather regidly by following the principle that every task should be run sufficiently, namely for every role, minimum amount is satisfied.
 */
class CreepSpawnManager {
    /**
     * @private
     * @param {string} roomName
     */
    updateRoomCache(roomName) {
        if (this._roomCheckTick[roomName] && this._roomCheckTick[roomName] === Game.time) return;
        this._roomCheckTick[roomName] = Game.time;
        /* Updating Instant Energy Cost At Current Tick */
        if (Game.rooms[roomName] && isMyRoom(Game.rooms[roomName])) {
            if (!Game.rooms[roomName]._instantEnergyCost) Game.rooms[roomName]._instantEnergyCost = 0;
        }
        /* Because of the potential dying of Task and the linking before using TaskDescriptor, the checking should be done at every tick. */
        if (this.room2creepSpawns[roomName]) this.room2creepSpawns[roomName] = _.filter(this.room2creepSpawns[roomName], a => a.IsFunctioning);
        else this.room2creepSpawns[roomName] = [];
        if (this.room2creepSpawnsPatch[roomName]) for (const groupTag in this.room2creepSpawnsPatch[roomName]) {
            /* Preprossessing */
            this.room2creepSpawnsPatch[roomName][groupTag] = _.filter(this.room2creepSpawnsPatch[roomName][groupTag], a => a.IsFunctioning);
            this.room2creepSpawnsPatch[roomName][groupTag].CurrentAmount = _.sum(this.room2creepSpawnsPatch[roomName][groupTag].map(a => a.CurrentAmount));
            // console.log(this.room2creepSpawnsPatch[roomName][groupTag].CurrentAmount, "|", this.room2creepSpawnsPatch[roomName][groupTag].map(a => a.CurrentAmount));
            this.room2creepSpawnsPatch[roomName][groupTag].MinimumAmount = _.sum(this.room2creepSpawnsPatch[roomName][groupTag].map(a => a.MinimumAmount));
        } else this.room2creepSpawnsPatch[roomName] = {};
    }
    /**
     * Register self into CreepSpawnManager
     * Grouped TaskCreepDescriptor will be taken into account as a unity. The amount is controlled by the regulation of population growth.
     * @param { {creepDescriptor : import("./task.prototype").TaskCreepDescriptor, roomName : string} } descriptor
     */
    Register(descriptor) {
        if (descriptor.roomName) {
            // console.log(`<p style="color:lightyellow;display:inline;">[Register]</p> Registering into CreepManager with tag "${descriptor.creepDescriptor.Tag}" and groupTag "${descriptor.creepDescriptor.GroupTag}" ...`);
            if (!descriptor.creepDescriptor.GroupTag) {
                this.room2creepSpawns[descriptor.roomName] = this.room2creepSpawns[descriptor.roomName] || [];
                this.room2creepSpawns[descriptor.roomName].push(descriptor.creepDescriptor);
            } else {
                if (!this.room2creepSpawnsPatch[descriptor.roomName]) this.room2creepSpawnsPatch[descriptor.roomName] = {};
                if (!this.room2creepSpawnsPatch[descriptor.roomName][descriptor.creepDescriptor.GroupTag]) this.room2creepSpawnsPatch[descriptor.roomName][descriptor.creepDescriptor.GroupTag] = [];
                this.room2creepSpawnsPatch[descriptor.roomName][descriptor.creepDescriptor.GroupTag].push(descriptor.creepDescriptor);
            }
        }
    }
    /**
     * Query returns the spawnable creep.
     * After querying, specific role from which the returned configuration is gotten will be ignored in the same tick in order to avoid over-production.
     * @param {string} roomName - Room Under Control
     * @returns { {} | { body : {[body in BodyPartConstant]? : number}, memory : {}, workingPos? : RoomPosition} }
     */
    Query(roomName) {
        /**
         * @type {Array<string>}
         * NOTICE: Neutral or Hostile rooms are also included in `adjacentRooms`.
         * Thus, as long as the TaskCreepDescriptors from those rooms are registered, they could be accessed, which allowing for much more flexibility.
         */
        const adjacentRooms = global.Map.Query(roomName);
        /**
         * @type { (body : {[body in BodyPartConstant]? : number}) => {[body in BodyPartConstant]? : number} }
         * If there is no `MOVE` elements in `body`, `MOVE` elements whose amount is equal to the sum of other bodyparts will be supplemented.
         */
        const supplyMoveBodyParts = (body) => {
            if (body.move !== undefined) return body;
            let sum = 0;
            for (const part in body) sum += body[part];
            body.move = Math.min(sum, 50 - sum);
            return body;
        };
        /**
         * @param {{[body in BodyPartConstant]? : number}} body
         * @param {number} maximumEnergy
         * @returns {{[body in BodyPartConstant]? : number}}
         */
        const shrinkBodyParts = (body, maximumEnergy) => {
            if (evaluateCost(body) <= maximumEnergy) return body;
            let sumOfEnergy = evaluateCost(body);
            if (sumOfEnergy <= maximumEnergy) return body;
            const ret = {};
            for (const bodyPart in body) {
                ret[bodyPart] = Math.max(1, Math.min(body[bodyPart], Math.floor((maximumEnergy / sumOfEnergy) * body[bodyPart])));
            }
            return ret;
        };
        /**
         * @param {import("./task.prototype").TaskCreepDescriptor} creepDescriptor
         * @param {Room} room
         * @returns {{[body in BodyPartConstant]? : number}}
         */
        const parseBodyParts = (creepDescriptor, room) => {
            if (creepDescriptor.Mode === "static") return supplyMoveBodyParts(creepDescriptor.BodyRequirements);
            else if (creepDescriptor.Mode === "shrinkToEnergyAvailable") return shrinkBodyParts(supplyMoveBodyParts(creepDescriptor.BodyRequirements), room.energyAvailable);
            else if (creepDescriptor.Mode === "shrinkToEnergyCapacity") return shrinkBodyParts(supplyMoveBodyParts(creepDescriptor.BodyRequirements), room.energyCapacityAvailable);
            else if (creepDescriptor.Mode === "expand") return shrinkBodyParts( creepDescriptor.ExpandFunction(room), room.energyAvailable);
        };
        let chosen = {};
        for (const room of adjacentRooms) {
            if (room !== roomName && Memory.rooms[room] && Memory.rooms[room].rejectHelp) continue;
            this.updateRoomCache(room);
            // console.log(`Querying ${roomName}->${room}`);
            /**
             * @type {Array<import("./task.prototype").TaskCreepDescriptor>}
             */
            let totalRequestingRoles = this.room2creepSpawns[room]
                .filter(a => room === roomName || !a.IsConfinedInRoom)
                .filter(a => a.CurrentAmount < a.MinimumAmount)
                .filter(a => evaluateCost(parseBodyParts(a, Game.rooms[roomName])) <= (Game.rooms[roomName].energyAvailable - Game.rooms[roomName]._instantEnergyCost));
            for (const groupTag in this.room2creepSpawnsPatch[room]) {
                /**
                 * I expect the following property :
                 *  - expectedNum should be logorithm-like.
                 *  - When MinimumAmount = 1, expectedNum should be 1.
                 *  - When MinimumAmount = e^2, expectedNum should be 2.
                 */
                const expectedNum = Math.floor(Math.log(this.room2creepSpawnsPatch[room][groupTag].MinimumAmount) * 0.5 + 1);
                if (this.room2creepSpawnsPatch[room][groupTag].CurrentAmount >= expectedNum) continue;
                // console.log(`[${room}] ${groupTag} is not saturated ${this.room2creepSpawnsPatch[room][groupTag].CurrentAmount}:${expectedNum}.`);
                totalRequestingRoles = totalRequestingRoles.concat(
                    this.room2creepSpawnsPatch[room][groupTag]
                        .filter(a => room === roomName || !a.IsConfinedInRoom)
                        .filter(a => a.CurrentAmount < a.MinimumAmount)
                        .filter(a => evaluateCost(parseBodyParts(a, Game.rooms[roomName])) <= (Game.rooms[roomName].energyAvailable - Game.rooms[roomName]._instantEnergyCost))
                );
            }
            totalRequestingRoles = _.shuffle(totalRequestingRoles);
            // console.log(totalRequestingRoles.map(v => `${v.GroupTag}:${v.Tag}, ${v.MinimumAmount}:${v.CurrentAmount}\n`));
            for (const descriptor of totalRequestingRoles) {
                if (descriptor._spawnTick && descriptor._spawnTick === Game.time) continue;
                chosen.body = parseBodyParts(descriptor, Game.rooms[roomName]);
                /* Prepare Initial Memory */
                chosen.memory = {};
                chosen.workingPos = descriptor.WorkingPos || undefined;
                if (descriptor.Tag) chosen.memory.tag = descriptor.Tag;
                descriptor._spawnTick = Game.time;
                break;
            }
            if (chosen.body) break;
        }
        return chosen;
    }
    constructor() {
        /**
         * @type { {[roomName : string] : Array<import("./task.prototype").TaskCreepDescriptor>} }
         * @private
         */
        this.room2creepSpawns = {};
        /**
         * @type { {[roomName : string] : {[patchTag : string] : Array<import("./task.prototype").TaskCreepDescriptor>}} }
         * @private
         */
        this.room2creepSpawnsPatch = {};
        /**
         * @type { {[roomName : string] : number} }
         * @private
         */
        this._roomCheckTick   = {};
    }
};
const _creepSpawnManager = new CreepSpawnManager();
profiler.registerClass(CreepSpawnManager, "CreepSpawnManager");
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const CreepSpawnManagerPlugin = {
    init : () => global.CreepSpawnManager = _creepSpawnManager,
    tickEnd : () => {
        const _cpuUsed = Game.cpu.getUsed();
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!isMyRoom(room)) continue;
            // NOTICE : Query Creep is time-consuming, and it is unnecessary when no spawn is available.
            /** @type {Array<StructureSpawn>} */
            const candidateSpawns = room.spawns.filter(s => !s.spawning);
            if (candidateSpawns.length === 0) continue;
            // NOTICE : In order to avoid energy-consumption-overlapping, for each tick, only one Spawn will be allowed to spawn Creep.
            /** @type {{} | { body : {[body in BodyPartConstant]? : number}, memory : {}, workingPos? : RoomPosition} } */
            const spawnedCreep = global.CreepSpawnManager.Query(roomName);
            if (!spawnedCreep.body) continue;
            /** Record Spawn Room Name */
            spawnedCreep.memory.spawnRoomName = roomName;
            if (spawnedCreep.workingPos) candidateSpawns.sort((a, b) => calcInRoomDistance(a.pos, spawnedCreep.workingPos) - calcInRoomDistance(b.pos, spawnedCreep.workingPos));
            candidateSpawns[0].spawnCreep(
                parseBodyPartsConfiguration(spawnedCreep.body),
                `@${Game.shard.name}-${roomName}-${Game.time}`,
                {
                    memory : spawnedCreep.memory,
                    directions:
                        [
                            spawnedCreep.workingPos ?
                                (candidateSpawns[0].pos.getRangeTo(spawnedCreep.workingPos) === 1 ?
                                    candidateSpawns[0].pos.getDirectionTo(spawnedCreep.workingPos):
                                    candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])) :
                                candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])
                        ]
                }
            );
        }
        // console.log(`Spawn -> ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
    }
};
global.Lucy.App.on(CreepSpawnManagerPlugin);