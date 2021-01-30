/**
 * @module rooms.prototype
 * Define some Special Behaviors within a Room
 * @typedef {CentralSpawnUnit} CentralSpawnUnit
 */
const Task = require('./task.prototype').Task;
const TaskDescriptor = require('./task.prototype').TaskDescriptor;
const Transaction = require('./money.prototype').Transaction;
const getPrice = require('./util').getPrice;
const checkForStore = require('./util').checkForStore;
/**
 * Class Representation for CentralSpawn
 * @hardcode @see {native.enhancement#centralSpawn}
 */
class CentralSpawnUnit {
    /** @private @returns {boolean} */
    needUpdate() {
        return global.signals.IsNewStructure[this.room.name] || false;
    }
    /**
     * @param {"extensions" | "fromLink" | "toLink" | 0 | 1 | 2 | 3} key
     * @param {boolean} value
     */
    SetSignal(key, value) {
        console.log(`<p style="display:inline;color:gray;">[Log]</p> CentralSpawnUnit of ${this.room.name} : Set ${key} into ${value}`);
        if (key === "fromLink" || key === "toLink") this.signals[key] = value;
        else if (key === "extensions") this.signals.extensions = [value, value, value, value];
        else this.signals.extensions[key] = value;
    }
    /**
     * @param {"extensions" | "fromLink" | "toLink" | 0 | 1 | 2 | 3} key
     */
    GetSignal(key) {
        if (key === "fromLink" || key === "toLink") return this.signals[key];
        else if (key === "extensions") return this.signals.extensions;
        else return this.signals.extensions[key];
    }
    /** @private */
    issueTasks() {
        const poses = [
            new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 2 ,this.room.name),
            new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 2, this.room.name),
            new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 4, this.room.name),
            new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 4, this.room.name)
        ];
        const containerPoses = [
            new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 3, this.room.name),
            new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 3, this.room.name),
            new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 3, this.room.name),
            new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 3, this.room.name)
        ];
        const linkPos = new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 3, this.room.name);
        const extensionPoses = [
            [
                new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 1 ,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 1 ,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 2,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 2,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 3,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 1,this.room.name)
            ],
            [
                new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 1,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 1,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 2,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 2,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 3,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 1,this.room.name)
            ],
            [
                new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 3,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 4,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 2, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 4,this.room.name)
            ],
            [
                new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 3,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 4,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 3, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 4, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 5,this.room.name),
                new RoomPosition(this.LeftTopPos.x + 5, this.LeftTopPos.y + 4,this.room.name)
            ]
        ];
        for (let i = 0; i < poses.length; ++i) {
            new Task(this.room.name, {id : null, pos : poses[i]}, new TaskDescriptor("default", {
                worker : {
                    minimumNumber : 1,
                    maximumNumber : 1,
                    estimateProfitPerTurn : () => 0,
                    estimateWorkingTicks : (object) => object.ticksToLive,
                    tag : `centralSpawn-${i}`,
                    bodyMinimumRequirements : {
                        [CARRY] : 3,
                        [MOVE] : 1
                    },
                    mode : "static",
                    workingPos : poses[i],
                    confinedInRoom : true
                }
            }), {
                selfCheck : () => "working",
                run : function() {
                    /** @type {Creep} */
                    const worker = Object.keys(this.employee2role).map(Game.getObjectById)[0];
                    if (!worker) return [];
                    /** @type {number} */
                    const index = this.taskData.index;
                    /** @type {CentralSpawnUnit} */
                    const centralSpawn = this.taskData.centralSpawn;
                    /** @type {RoomPosition} */
                    const targetPos = this.taskData.pos;
                    const room = Game.rooms[targetPos.roomName];
                    /** @type {RoomPosition} */
                    const containerPos = this.taskData.containerPos;
                    /** @type {Array<RoomPosition>} */
                    const extensionPoses = this.taskData.extensionPoses;
                    /** @type {RoomPosition} */
                    const linkPos = this.taskData.linkPos;
                    /** @type {StructureLink | null} */
                    // const link = global.MapMonitorManager.FetchStructure(linkPos.roomName, linkPos.y, linkPos.x)[0] || null;
                    if (worker.pos.getRangeTo(targetPos) !== 0) {
                        worker.moveTo(targetPos);
                        return [];
                    }
                    if (!worker.memory.flags) worker.memory.flags = {};
                    /** Tweak Signals @TODO */
                    if (centralSpawn.GetSignal(index) === true) {
                        /** @type {Array<StructureExtension>} */
                        const extensions = extensionPoses.map(p => global.MapMonitorManager.FetchStructure(p.roomName, p.y, p.x)[0] || null).filter(e => e && e.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !e._transfered);
                        /** @type {StructureContainer | null} */
                        const container = global.MapMonitorManager.FetchStructure(containerPos.roomName, containerPos.y, containerPos.x)[0] || null;
                        if (extensions.length === 0) {
                            if (container && worker.store[RESOURCE_ENERGY] > 0) worker.transfer(container, RESOURCE_ENERGY);
                            centralSpawn.SetSignal(index, false);
                        } else if (container) {
                            if (worker.memory.flags.working && worker.store[RESOURCE_ENERGY] === 0) worker.memory.flags.working = false;
                            if (!worker.memory.flags.working && worker.store[RESOURCE_ENERGY] > 0) worker.memory.flags.working = true; // NOTICE : Full is not required.
                            if (!worker.memory.flags.working) worker.withdraw(container, RESOURCE_ENERGY);
                            if (worker.memory.flags.working) {
                                worker.transfer(extensions[0], RESOURCE_ENERGY);
                                extensions[0]._transfered = true;
                            }
                        }
                    }
                    return [];
                }
            }, {pos : poses[i], containerPos : containerPoses[i], linkPos : linkPos, extensionPoses : extensionPoses[i], index : i, centralSpawn : this});
        }
    }
    /** @returns { {[TOP] : StructureSpawn | null, [BOTTOM_LEFT] : StructureSpawn | null, [BOTTOM_RIGHT] : StructureSpawn | null} } */
    get Spawns() {
        if (!this._Spawns || (this.needUpdate() && (!this._Spawns_lastUpdatingTick || this._Spawns_lastUpdatingTick < Game.time))) {
            this._Spawns_lastUpdatingTick = Game.time;
            this._Spawns = {
                [TOP] : null,
                [BOTTOM_LEFT] : null,
                [BOTTOM_RIGHT] : null
            };
            for (const spawn of this.room.spawns) {
                const pos = spawn.pos;
                if (pos.y === this.LeftTopPos.y + 1) this._Spawns[TOP] = spawn.id;
                else if (pos.x === this.LeftTopPos.x + 1) this._Spawns[BOTTOM_LEFT] = spawn.id;
                else if (pos.x === this.RightBottomPos.x - 1) this._Spawns[BOTTOM_RIGHT] = spawn.id;
                else {
                    console.log(`<p style="display:inline;color:red;">Error: </p>Unable to fit ${spawn} into "centralSpawn" Unit.`);
                    return undefined;
                }
            }
        }
        if (!this._spawns_lastUpdatingTick || this._spawns_lastUpdatingTick < Game.time) {
            this._spawns_lastUpdatingTick = Game.time;
            this._spawns = {
                [TOP] : Game.getObjectById(this._Spawns[TOP]),
                [BOTTOM_LEFT] : Game.getObjectById(this._Spawns[BOTTOM_LEFT]),
                [BOTTOM_RIGHT] : Game.getObjectById(this._Spawns[BOTTOM_RIGHT])
            };
        }
        return this._spawns;
    }
    /**
     * @param {StructureSpawn} spawn
     * @returns {DirectionConstant}
     */
    SpawnDirection(spawn) {
        if (!this[`_${spawn.id}:Direction`]) {
            const pos = spawn.pos;
            if (pos.y === this.LeftTopPos.y + 1) this[`_${spawn.id}:Direction`] = TOP;
            else if (pos.x === this.LeftTopPos.x + 1) this[`_${spawn.id}:Direction`] = LEFT;
            else if (pos.x === this.RightBottomPos.x - 1) this[`_${spawn.id}:Direction`] = RIGHT;
            else {
                console.log(`<p style="display:inline;color:red;">Error: </p>Unable to fit ${spawn} into "centralSpawn" Unit.`);
                return undefined;
            }
        }
        return this[`_${spawn.id}:Direction`];
    }
    /**
     * @param {Room} room
     */
    constructor(room) {
        /** @private */
        this.room = room;
        /** @type { [number, number, number, number] } @private */
        this._y1_x1_y2_x2 = Memory.autoPlan[this.room.name]["centralSpawn"][0];
        this.LeftTopPos = new RoomPosition(this._y1_x1_y2_x2[1], this._y1_x1_y2_x2[0], this.room.name);
        this.RightBottomPos = new RoomPosition(this._y1_x1_y2_x2[3], this._y1_x1_y2_x2[2], this.room.name);
        /** @private */
        this.signals = {
            extensions : [false, false, false, false],
            fromLink : false,
            toLink : false
        };
        this.issueTasks();
    }
}
/** @type { {[roomName : string] : CentralSpawnUnit} } */
const centralSpawnUnits = {};
function mount() {
    Room.prototype.init = function() {
        /** Calling for Construction */
        this.centralSpawn;
    }
    Object.defineProperty(Room.prototype, "centralSpawn", {
        configurable : false,
        enumerable : false,
        get: function() {
            if (centralSpawnUnits[this.name]) return centralSpawnUnits[this.name];
            if (!Memory.autoPlan[this.name] || !Memory.autoPlan[this.name]["centralSpawn"]) return null;
            if (!centralSpawnUnits[this.name]) centralSpawnUnits[this.name] = new CentralSpawnUnit(this);
            return centralSpawnUnits[this.name];
        }
    });
}

module.exports = {
    mount : mount
};