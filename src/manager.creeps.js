/**
 * @module manager.creeps
 * 
 * @typedef {CreepSpawnManager} CreepSpawnManager
 * @typedef {SpecialCreepScheme} SpecialCreepScheme
 */
const isMyRoom                      = require('./util').isMyRoom;
const evaluateCost                  = require('./util').evaluateCost;
const calcInRoomDistance            = require('./util').calcInRoomDistance;
const calcRoomDistance              = require('./util').calcRoomDistance;
const parseBodyPartsConfiguration   = require('./util').parseBodyPartsConfiguration;
const { Notifier } = require("./visual.notifier");
const profiler = require("./screeps-profiler");

const DEFAULT = "default";

/**
 * Class Representation for CreepSpawn
 * Single Class
 */
class CreepSpawnManager {
    /**
     * @private
     */
    getIndex() {
        return `${this.descriptorIndex++}`;
    }
    /**
     * @param {string} index
     */
    Remove(index) {
        const roomName = this.index2status[index].roomName;
        const tag = this.index2status[index].tag;
        var info = this.roomName2information[roomName][this.index2status[index].type];
        --info[tag].total;
        const statusDescriptorPools = info[tag][this.index2status[index].status];
        statusDescriptorPools.splice(statusDescriptorPools.indexOf(index), 1);
        delete this.index2status[index];
        delete this.descriptorPools[index];
    }
    /**
     * Register self into CreepSpawnManager
     * Grouped TaskCreepDescriptor will be taken into account as a unity. The amount is controlled by the regulation of population growth.
     * @param { {creepDescriptor : import("./task.prototype").TaskCreepDescriptor, roomName : string} } descriptor
     */
    Register(descriptor) {
        if (!this.roomName2information[descriptor.roomName]) {
            this.roomName2information[descriptor.roomName] = {tags : {}, inRoomTags : {}};
        }
        const tag = descriptor.creepDescriptor.GroupTag || "default";
        /** @type {{[tag : string] : {working : Array<string>, waiting : Array<string>, total : number}} */
        var info;
        if (descriptor.creepDescriptor.IsConfinedInRoom) info = this.roomName2information[descriptor.roomName].inRoomTags;
        else info = this.roomName2information[descriptor.roomName].tags;
        if (!info[tag]) {
            info[tag] = {total : 0, working : [], waiting : []};
            /** Visual */
            Notifier.register(descriptor.roomName, `Grouped Creeps`, `${descriptor.creepDescriptor.IsConfinedInRoom? "[*]" : "[ ]"} ${tag}`, () => `${_.sum(info[tag].waiting.map(index => this.descriptorPools[index].CurrentAmount)) + _.sum(info[tag].working.map(index => this.descriptorPools[index].CurrentAmount))}/${_.sum(info[tag].waiting.map(index => this.descriptorPools[index].MinimumAmount)) + _.sum(info[tag].working.map(index => this.descriptorPools[index].MinimumAmount))}`)
        }
        const index = this.getIndex();
        this.descriptorPools[index] = descriptor.creepDescriptor;
        ++info[tag].total;
        info[tag].waiting.push(index);
        this.index2status[index] = {roomName : descriptor.roomName, tag : tag, type : descriptor.creepDescriptor.IsConfinedInRoom? "inRoomTags" : "tags", "status" : "waiting"};
        return index;
    }
    /**
     * @param {string} index
     * @param {"working" | "waiting"} status
     */
    Switch(index, status) {
        const originalStatus = this.index2status[index].status;
        if (originalStatus === status) return;
        const pool = this.roomName2information[this.index2status[index].roomName][this.index2status[index].type][this.index2status[index].tag];
        pool[originalStatus].splice(pool[originalStatus].indexOf(index), 1);
        pool[status].push(index);
        this.index2status[index].status = status;
    }
    /**
     * @TODO Special Optimization for Controller Level 8 ?
     * NOTICE : Cache is not implemented here, since, in a single tick, state of saturation
     * could change.
     * @param {string} roomName
     * @param {"tags" | "inRoomTags"} type
     * @param {string} tag
     * @returns {boolean}
     */
    IsSaturated(roomName, type, tag) {
        const descriptors = this.roomName2information[roomName][type][tag];
        if (descriptors.total === 0) return true;
        /**
         * I expect the following property :
         *  - expectedNum should be logorithm-like.
         *  - When MinimumAmount = 1, expectedNum should be 1.
         *  - When MinimumAmount = e^2, expectedNum should be 2.
         */
        const expectedNum = Math.floor(Math.log(descriptors.total) * 0.5 + 1);
        const workingNum = descriptors.working.length;
        /**
         * NOTICE : For a group of Task, there could be the case that some of them still needs more workers and, when
         * they employee more workers, the total workingNum remains the same.
         */
        if (workingNum < expectedNum) return false;
        else return true;
    }
    /**
     * @private
     * @param {string} roomName
     */
    ableToHelp(roomName) {
        const storedEnergy = global.ResourceManager.Sum(roomName, RESOURCE_ENERGY, {key : "default", type : "retrieve", allowStructureTypes : [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY], allowStore : true, allowToHarvest : false, confinedInRoom : true});
        return storedEnergy >= Math.max(Game.rooms[roomName].energyCapacityAvailable, CONTROLLER_STRUCTURES[STRUCTURE_EXTENSION][6] * EXTENSION_ENERGY_CAPACITY[6] + CONTROLLER_STRUCTURES[STRUCTURE_SPAWN][6] * SPAWN_ENERGY_CAPACITY);
    }
    /**
     * Query returns the spawnable creep.
     * After querying, specific role from which the returned configuration is gotten will be ignored in the same tick in order to avoid over-production.
     * @param {string} roomName - Room Under Control
     * @returns { null | { body : {[body in BodyPartConstant]? : number}, memory : {}, workingPos? : RoomPosition} }
     */
    Query(roomName) {
        /**
         * @type {Array<string>}
         * NOTICE: Neutral or Hostile rooms are also included in `adjacentRooms`.
         * Thus, as long as the TaskCreepDescriptors from those rooms are registered, they could be accessed, which allowing for much more flexibility.
         */
        const adjacentRooms = Object.keys(this.roomName2information).sort((u, v) => calcRoomDistance(roomName, u) - calcRoomDistance(roomName, v));
        const ableToHelp = this.ableToHelp(roomName);
        let index = null;
        for (const room of adjacentRooms) {
            if (room !== roomName && (!ableToHelp || (Memory.rooms[room] && Memory.rooms[room].rejectHelp && Game.rooms[room] && Game.rooms[room].spawns.length > 0))) continue;
            /** @type { ["inRoomTags", "tags"] | ["tags"] } */
            var candidates;
            if (room === roomName) candidates = ["inRoomTags", "tags"];
            else candidates = ["tags"];
            for (const candidate of candidates) { // 1~2
                for (const tag in this.roomName2information[room][candidate]) { // 1~5
                    if ((tag === DEFAULT && this.roomName2information[room][candidate][tag].waiting.length > 0) || !this.IsSaturated(room, candidate, tag)) {
                        const target = this.roomName2information[room][candidate][tag].waiting.filter(index => this.descriptorPools[index].Cost(Game.rooms[roomName]) <= Game.rooms[roomName].energyAvailable).select(v => v, index => this.descriptorPools[index].SpawnPriority);
                        if (target && this.descriptorPools[target]._spawnTick !== Game.time) {
                            if (!index || this.descriptorPools[index].SpawnPriority < this.descriptorPools[target].SpawnPriority) index = target;
                        }
                    }
                }
            }
            if (index) {
                this.descriptorPools[index]._spawnTick = Game.time;
                return {body : this.descriptorPools[index].BodyRequirements(Game.rooms[roomName]), memory : {tag : this.descriptorPools[index].Tag || undefined}, workingPos : this.descriptorPools[index].WorkingPos || undefined};
            }
        }
        return null;
    }
    constructor() {
        /** @type { {[roomName : string] : {tags : {[tag : string] : {working : Array<string>, waiting : Array<string>, total : number}}, inRoomTags : {[tag : string] : {working : Array<string>, waiting : Array<string>, total : number}}}} } @private */
        this.roomName2information = {};
        /** @type { {[index : string] : import("./task.prototype").TaskCreepDescriptor} } @private */
        this.descriptorPools      = {};
        this.descriptorIndex      = 0;
        /** @type { {[index : string] : {roomName : string, type : "inRoomTags" | "tags", tag : string, status : "working" | "waiting"}} } @private */
        this.index2status         = {};
    }
};
const _creepSpawnManager = new CreepSpawnManager();
profiler.registerClass(CreepSpawnManager, "CreepSpawnManager");
/** @type {[roomName : string] : string} */
const ticks = {};
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const CreepSpawnManagerPlugin = {
    init : () => global.CreepSpawnManager = _creepSpawnManager,
    tickEnd : () => {
        for (const room of global.Lucy.Collector.colonies) {
            const roomName = room.name;
            /** Visual */
            const _cpuUsed = Game.cpu.getUsed();
            if (!ticks[roomName]) Notifier.register(roomName, `Ticks Consumption`, `Spawn`, () => `${ticks[roomName] || 0}`);
            ticks[roomName] = `0.00`;
            // NOTICE : Query Creep is time-consuming, and it is unnecessary when no spawn is available.
            const candidateSpawns = room.spawns.filter(s => !s.spawning);
            if (candidateSpawns.length === 0) continue;
            // NOTICE : In order to avoid energy-consumption-overlapping, for each tick, only one Spawn will be allowed to spawn Creep.
            const spawnedCreep = global.CreepSpawnManager.Query(roomName);
            ticks[roomName] = `${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`;
            if (!spawnedCreep) continue;
            global.Log.room(roomName, global.Emoji.baby, global.Dye.yellow(`Spawning ${spawnedCreep.memory.tag}!`));
            /** Record Spawn Room Name */
            spawnedCreep.memory.spawnRoomName = roomName;
            if (spawnedCreep.workingPos) candidateSpawns.sort((a, b) => calcInRoomDistance(a.pos, spawnedCreep.workingPos) - calcInRoomDistance(b.pos, spawnedCreep.workingPos));
            candidateSpawns[0].spawnCreep(
                parseBodyPartsConfiguration(spawnedCreep.body),
                `@${Game.shard.name}-${roomName}-${Game.time}`,
                {
                    memory : spawnedCreep.memory,
                    directions:
                        spawnedCreep.workingPos ?
                            (candidateSpawns[0].pos.getRangeTo(spawnedCreep.workingPos) === 1 ?
                                [candidateSpawns[0].pos.getDirectionTo(spawnedCreep.workingPos)]:
                                candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])) :
                            candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])
                }
            );
            ticks[roomName] = `${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`;
        }
    }
};
global.Lucy.App.on(CreepSpawnManagerPlugin);