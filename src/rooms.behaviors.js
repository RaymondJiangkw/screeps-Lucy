/**
 * @module rooms.prototype
 * Define some Special Behaviors within a Room
 * @typedef {CentralSpawnUnit} CentralSpawnUnit
 * @typedef {CentralTransferUnit} CentralTransferUnit
 * NOTICE : Whenever functions in `mount` use rooms' units, they should be delayed because of dependence on planning!
 */
const Task = require('./task.prototype').Task;
const TaskDescriptor = require('./task.prototype').TaskDescriptor;
const Transaction = require('./money.prototype').Transaction;
const getPrice = require('./util').getPrice;
const checkForStore = require('./util').checkForStore;
const checkForFreeStore = require('./util').checkForFreeStore;
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
     * @param {number | "all"} index
     * @param {"extensions" | "fromLink" | "toLink"} key
     * @param {boolean} value
     */
    SetSignal(index, key, value) {
        console.log(`<p style="display:inline;color:gray;">[Log]</p> CentralSpawnUnit of ${this.room.name} : Set ${key}:${index} into ${value}`);
        if (index === "all") {
            this.signals[key] = [value, value, value, value];
        } else this.signals[key][index] = value;
    }
    /**
     * @param {number} index
     * @param {"extensions" | "fromLink" | "toLink"} key
     */
    GetSignal(index, key) {
        return this.signals[key][index];
    }
    /** @returns {Array<StructureContainer>} */
    get Containers() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.SPAWN_ONLY, STRUCTURE_CONTAINER);
    }
    /** @returns {StructureLink | null} */
    get Link() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.SPAWN_ONLY, STRUCTURE_LINK)[0] || null;
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
            new Task(`[${this.room.name}:CentralSpawnUnit:${i}]`, this.room.name, {id : null, pos : poses[i]}, new TaskDescriptor("default", {
                worker : {
                    minimumNumber : 1,
                    maximumNumber : 1,
                    estimateProfitPerTurn : () => 0,
                    estimateWorkingTicks : (object) => object.ticksToLive || CREEP_LIFE_TIME,
                    tag : `centralSpawn-${i}`,
                    bodyMinimumRequirements : {
                        [CARRY] : 4,
                        [MOVE] : 1
                    },
                    expandFunction : function(room) {
                        if (room.controller.level <= 3) return {[CARRY] : 1, [MOVE] : 1};
                        else if (room.controller.level <= 5) return {[CARRY] : 3, [MOVE] : 1};
                        else return {[CARRY] : 4, [MOVE] : 1};
                    },
                    mode : "expand",
                    workingPos : poses[i],
                    confinedInRoom : true
                }
            }), {
                selfCheck : function () {
                    /** @type {CentralSpawnUnit} */
                    const centralSpawn = this.taskData.centralSpawn;
                    if (centralSpawn.Containers.length === 0) {
                        const NEXT_CENTRAL_SPAWN_TIMEOUT = 100;
                        const NEXT_CENTRAL_SPAWN_OFFSET  = 5;
                        const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_CENTRAL_SPAWN_TIMEOUT, NEXT_CENTRAL_SPAWN_OFFSET);
                        Lucy.Timer.add(nextTaskStartedTick, centralSpawn.issueTasks, centralSpawn, [], `CentralSpawnUnit of ${centralSpawn.room.name}`);
                        return "dead";
                    }
                    return "working";
                },
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
                    /** Tweak Signals */
                    let isActionDone = false;
                    if (!isActionDone && centralSpawn.GetSignal(index, "extensions") === true) { // High Priority : Exhaust Container
                        /** @type {Array<StructureExtension>} */
                        const extensions = extensionPoses.map(p => global.MapMonitorManager.FetchStructure(p.roomName, p.y, p.x).filter(s => s.structureType !== STRUCTURE_RAMPART)[0] || null).filter(e => e && e.store.getFreeCapacity(RESOURCE_ENERGY) > 0 && !e._hasBeenTransferred);
                        /** @type {StructureContainer | null} */
                        const container = global.MapMonitorManager.FetchStructure(containerPos.roomName, containerPos.y, containerPos.x)[0] || null;
                        /** @type {StructureLink | null} */
                        const link = global.MapMonitorManager.FetchStructure(linkPos.roomName, linkPos.y, linkPos.x)[0] || null;
                        if (extensions.length === 0) {
                            if (worker.store[RESOURCE_ENERGY] > 0) {
                                if (container && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                                    worker.transfer(container, RESOURCE_ENERGY);
                                    isActionDone = true;
                                } else if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                                    worker.transfer(link, RESOURCE_ENERGY);
                                    isActionDone = true;
                                }
                            }
                            centralSpawn.SetSignal(index, "extensions", false);
                        } else if (container) {
                            if (container.store.getUsedCapacity() > 0 || worker.store[RESOURCE_ENERGY] > 0) {
                                if (worker.memory.flags.working && worker.store[RESOURCE_ENERGY] === 0) worker.memory.flags.working = false;
                                if (!worker.memory.flags.working && worker.store[RESOURCE_ENERGY] > 0) worker.memory.flags.working = true; // NOTICE : Full is not required.
                                if (!worker.memory.flags.working) {
                                    worker.withdraw(container, RESOURCE_ENERGY);
                                    centralSpawn.SetSignal(index, "fromLink", true);
                                }
                                if (worker.memory.flags.working) worker.transfer(extensions[0], RESOURCE_ENERGY);
                                isActionDone = true;
                            } else centralSpawn.SetSignal(index, "fromLink", true);
                        }
                    }
                    if (!isActionDone && centralSpawn.GetSignal(index, "fromLink") === true) { // Low Priority : Fill Container
                        /** @type {StructureLink | null} */
                        const link = global.MapMonitorManager.FetchStructure(linkPos.roomName, linkPos.y, linkPos.x)[0] || null;
                        /** @type {StructureContainer | null} */
                        const container = global.MapMonitorManager.FetchStructure(containerPos.roomName, containerPos.y, containerPos.x)[0] || null;
                        if (!link || (link.store[RESOURCE_ENERGY] === 0 && worker.store[RESOURCE_ENERGY] === 0) || (container.store.getFreeCapacity(RESOURCE_ENERGY) === 0 && centralSpawn.GetSignal(index, "extensions") === false)) {
                            if (worker.store[RESOURCE_ENERGY] > 0) {
                                if (container && container.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                                    worker.transfer(container, RESOURCE_ENERGY);
                                    isActionDone = true;
                                } else if (link && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                                    worker.transfer(link, RESOURCE_ENERGY);
                                    isActionDone = true;
                                }
                            }
                            centralSpawn.SetSignal(index, "fromLink", false);
                        } else {
                            if (container.store.getFreeCapacity() > 0) {
                                if (worker.memory.flags.working && worker.store[RESOURCE_ENERGY] === 0) worker.memory.flags.working = false;
                                if (!worker.memory.flags.working && worker.store[RESOURCE_ENERGY] > 0) worker.memory.flags.working = true; // NOTICE : Full is not required.
                                if (!worker.memory.flags.working) worker.withdraw(link, RESOURCE_ENERGY);
                                if (worker.memory.flags.working) worker.transfer(container, RESOURCE_ENERGY);
                                isActionDone = true;
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
            fromLink : [false, false, false, false],
            toLink : [false, false, false, false]
        };
        this.issueTasks();
    }
}
/**
 * @typedef {STRUCTURE_LINK | STRUCTURE_TERMINAL | STRUCTURE_STORAGE | STRUCTURE_FACTORY | "any"} FromTarget
 * @typedef {STRUCTURE_LINK | STRUCTURE_TERMINAL | STRUCTURE_STORAGE | STRUCTURE_FACTORY | STRUCTURE_EXTENSION | STRUCTURE_NUKER | STRUCTURE_POWER_SPAWN | "any"} ToTarget
 * @typedef { {from : FromTarget, to : ToTarget, resourceType : ResourceConstant, amount : number, callback ? : Function} } TransferOrder
 * NOTICE : There is no Transaction in CentralTransferUnit. It should be confirmed before issuing order.
 */
class CentralTransferUnit {
    /** @private */
    issueTasks() {
        const pos = new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 1, this.LeftTopPos.roomName);
        new Task(`[${this.room.name}:CentralTransfer]`, this.room.name, {id : null, pos : pos}, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn : () => 0,
                estimateWorkingTicks : (object) => object.ticksToLive || CREEP_LIFE_TIME,
                tag : `centralTransfer`,
                mode : "expand",
                expandFunction : (room) => {
                    const ret = {};
                    ret[MOVE] = 1;
                    ret[CARRY] = 1;
                    if (global.MapMonitorManager.FetchStructureWithTag(room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_LINK).length > 0) ret[CARRY] = LINK_CAPACITY / CARRY_CAPACITY;
                    if (room.terminal) ret[CARRY] = 20;
                    if (room.factory) ret[CARRY] = 32;
                    if (room.powerSpawn) ret[CARRY] = 49;
                    ret[CARRY] = Math.min(ret[CARRY], Math.floor((room.energyAvailable - BODYPART_COST[MOVE] * ret[MOVE]) / BODYPART_COST[CARRY]));
                    return ret;
                },
                workingPos : pos,
                confinedInRoom : true
            }
        }), {
            selfCheck : () => "working",
            run : function() {
                /** @type {Creep} */
                const worker = Object.keys(this.employee2role).map(Game.getObjectById)[0];
                if (!worker) return [];
                if (!worker.memory.flags) worker.memory.flags = {};
                /** @type {RoomPosition} */
                const pos = this.taskData.pos;
                if (worker.pos.getRangeTo(pos) !== 0) {
                    worker.moveTo(pos);
                    return [];
                }
                /** @type {CentralTransferUnit} */
                const centralTransferUnit = this.taskData.centralTransferUnit;
                // Since Resources transferred among CentralTransferUnit are usually valuable, it is important
                // to make sure creep carries nothing, when it is going to die.
                if (!worker.memory.dying && Object.keys(worker.store).length + 1 >= worker.ticksToLive) {
                    if (worker.memory.flags.order) {
                        centralTransferUnit.PushOrder(worker.memory.flags.order);
                        worker.memory.flags = {};
                    }
                    worker.memory.dying = true;
                }
                if (worker.memory.dying) {
                    for (const resourceType in worker.store) if (worker.transfer(centralTransferUnit.GetStoreStructure(), resourceType) === OK) return [];
                    return [];
                }
                if (!worker.memory.flags.order && !worker.memory.dying) worker.memory.flags.order = centralTransferUnit.FetchOrder();
                // Check Validity
                while (worker.memory.flags.order) {
                    /** @type {TransferOrder} */
                    const order = worker.memory.flags.order;
                    if (!worker.memory.flags.fromTargetId) {
                        let fromTarget = null;
                        if (order.from === "any") fromTarget = centralTransferUnit.GetFetchStructure(order.resourceType, order.amount);
                        else fromTarget = centralTransferUnit.GetStructure(order.from);
                        if (fromTarget) worker.memory.flags.fromTargetId = fromTarget.id;
                    }
                    if (!worker.memory.flags.toTargetId) {
                        let toTarget = null;
                        if (order.to === "any") toTarget = centralTransferUnit.GetStoreStructure(order.amount, order.from);
                        else toTarget = centralTransferUnit.GetStructure(order.to);
                        if (toTarget) worker.memory.flags.toTargetId = toTarget.id;
                    }
                    const fromTarget = Game.getObjectById(worker.memory.flags.fromTargetId);
                    const toTarget = Game.getObjectById(worker.memory.flags.toTargetId);
                    if (order.amount === 0 && !worker.memory.flags.working) {
                        if (order.callback) order.callback();
                        worker.memory.flags = {};
                    } else if ((!worker.memory.flags.working && !fromTarget) || !toTarget) {
                        console.log(`<p style="display:inline;color:red;">Error: </p>Unable to carry out "Transfer" task of ${centralTransferUnit.room.name} from ${order.from} to ${order.to}`);
                        if (order.callback) order.callback();
                        worker.memory.flags = {};
                    } else if (checkForFreeStore(toTarget) === 0) {
                        if (order.to === "any") {
                            const toTarget = centralTransferUnit.GetStoreStructure(order.amount, order.from);
                            if (toTarget) worker.memory.flags.toTargetId = toTarget.id;
                            else {
                                if (order.callback) order.callback();
                                worker.memory.flags = {};
                            }
                        } else {
                            if (order.callback) order.callback();
                            worker.memory.flags = {};
                        }
                    } else if (worker.store[order.resourceType] === 0 && (fromTarget.store.getUsedCapacity(order.resourceType) || 0) === 0) {
                        // Potential Switch
                        if (order.from === "any") {
                            const fromTarget = centralTransferUnit.GetFetchStructure(order.resourceType, order.amount);
                            if (fromTarget) worker.memory.flags.fromTargetId = fromTarget.id;
                            else {
                                if (order.callback) order.callback();
                                worker.memory.flags = {};
                            }
                        } else {
                            if (order.callback) order.callback();
                            worker.memory.flags = {};
                        }
                    }
                    if (!worker.memory.flags.order && !worker.memory.dying) worker.memory.flags.order = centralTransferUnit.FetchOrder();
                    else break;
                }
                if (worker.memory.flags.order) {
                    /** @type {TransferOrder} */
                    const order = worker.memory.flags.order;
                    /** Store Irrelated Resources */
                    if (worker.store[order.resourceType] !== worker.store.getUsedCapacity()) for (const resourceType in worker.store) if (resourceType !== order.resourceType && worker.transfer(centralTransferUnit.GetStoreStructure(), resourceType) === OK) return [];
                    /** Special Case for Having Stored resourceType */
                    if (!worker.memory.flags.working && (worker.store.getFreeCapacity(order.resourceType) === 0 || worker.store[order.resourceType] >= order.amount)) worker.memory.flags.working = true;
                    if (!worker.memory.flags.working) {
                        const fromTarget = Game.getObjectById(worker.memory.flags.fromTargetId);
                        // Special Case of fromTarget : fromTarget is link, and has executed transferEnergy.
                        if (fromTarget._hasTransferred) return [];
                        const amount = Math.min(fromTarget.store[order.resourceType], order.amount, worker.store.getFreeCapacity());
                        const retCode = worker.withdraw(fromTarget, order.resourceType, amount);
                        if (retCode !== OK) {
                            console.log(`<p style="display:inline;color:red;">Error: </p>Fail to carry out "Transfer" Task of ${centralTransferUnit.room.name} with ${JSON.stringify(order)} while Withdrawing with return Code ${retCode}`);
                            if (order.callback) order.callback();
                            worker.memory.flags = {};
                            return [];
                        }
                        worker.memory.flags.working = true;
                        return [];
                    }
                    if (worker.memory.flags.working) {
                        const toTarget = Game.getObjectById(worker.memory.flags.toTargetId);
                        const amount = Math.min(worker.store[order.resourceType], checkForFreeStore(toTarget), order.amount);
                        const retCode = worker.transfer(toTarget, order.resourceType, amount);
                        if (retCode !== OK) {
                            console.log(`<p style="display:inline;color:red;">Error: </p>Fail to carry out "Transfer" Task of ${centralTransferUnit.room.name} with ${JSON.stringify(order)} while Transfering with return Code ${retCode}`);
                            if (order.callback) order.callback();
                            worker.memory.flags = {};
                            return [];
                        }
                        order.amount -= amount;
                        worker.memory.flags.working = false;
                        return [];
                    }
                }
                return [];
            }
        }, {pos : pos, centralTransferUnit : this});
    }
    /** @returns {StructureStorage | null} */
    get Storage() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_STORAGE)[0] || null;
    }
    /** @returns {StructureNuker | null} */
    get Nuker() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_NUKER)[0] || null;
    }
    /** @returns {StructureTerminal | null} */
    get Terminal() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_TERMINAL)[0] || null;
    }
    /** @returns {StructureExtension | null} */
    get Extension() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_EXTENSION)[0] || null;
    }
    /** @returns {StructureLink | null} */
    get Link() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_LINK)[0] || null;
    }
    /** @returns {StructureFactory | null} */
    get Factory() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_FACTORY)[0] || null;
    }
    /** @returns {StructurePowerSpawn | null} */
    get PowerSpawn() {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, STRUCTURE_POWER_SPAWN)[0] || null;
    }
    /**
     * @param {STRUCTURE_LINK | STRUCTURE_TERMINAL | STRUCTURE_STORAGE | STRUCTURE_FACTORY | STRUCTURE_EXTENSION | STRUCTURE_NUKER | STRUCTURE_POWER_SPAWN} structureType
     * @returns {Structure<structureType>}
     */
    GetStructure(structureType) {
        return global.MapMonitorManager.FetchStructureWithTag(this.room.name, global.Lucy.Rules.arrangements.TRANSFER_ONLY, structureType)[0] || null;
    }
    /**
     * @param {number} amount
     * @param {STRUCTURE_STORAGE | STRUCTURE_TERMINAL | null} [self = null]
     * @returns {StructureStorage | StructureTerminal | null}
     */
    GetStoreStructure(amount = 1, self = null) {
        if (self !== STRUCTURE_STORAGE && this.Storage && this.Storage.store.getFreeCapacity() >= amount) return this.Storage;
        else if (self !== STRUCTURE_TERMINAL && this.Terminal && this.Terminal.store.getFreeCapacity() >= amount) return this.Terminal;
        if (self !== STRUCTURE_STORAGE && this.Storage && this.Storage.store.getFreeCapacity() > 0) return this.Storage;
        else if (self !== STRUCTURE_TERMINAL && this.Terminal && this.Terminal.store.getFreeCapacity() > 0) return this.Terminal;
        return null;
    }
    /**
     * Used to respond to `any`
     * @param {ResourceConstant} resourceType
     * @param {number} [amount = 1]
     * @param {STRUCTURE_STORAGE | STRUCTURE_TERMINAL | STRUCTURE_FACTORY | null} [self = null]
     * @returns {StructureStorage | StructureTerminal | StructureFactory | null}
     */
    GetFetchStructure(resourceType, amount = 1, self = null) {
        if (self !== STRUCTURE_STORAGE && this.Storage && this.Storage.store[resourceType] >= amount) return this.Storage;
        else if (self !== STRUCTURE_TERMINAL && this.Terminal && this.Terminal.store[resourceType] >= amount) return this.Terminal;
        else if (self !== STRUCTURE_FACTORY && this.Factory && this.Factory.store[resourceType] >= amount) return this.Factory;
        if (self !== STRUCTURE_STORAGE && this.Storage && this.Storage.store[resourceType] > 0) return this.Storage;
        else if (self !== STRUCTURE_TERMINAL && this.Terminal && this.Terminal.store[resourceType] > 0) return this.Terminal;
        else if (self !== STRUCTURE_FACTORY && this.Factory && this.Factory.store[resourceType] > 0) return this.Factory;
        return null;
    }
    /**
     * @param {TransferOrder} order
     */
    PushOrder(order) {
        this.orderQueue.push(order);
        console.log(`<p style="display:inline;color:gray;">[Log]</p> CentralTransfer of ${this.room.name} receives Order from ${order.from} to ${order.to} with resourceType ${order.resourceType} and amount ${order.amount}`);
    }
    /**
     * @returns {TransferOrder} 
     */
    FetchOrder() {
        return this.orderQueue.shift() || null;
    }
    /**
     * @param {Structure} structure
     * @returns {boolean}
     */
    IsBelongTo(structure) {
        if (!structure || !structure.structureType) return false;
        if (structure.room.name !== this.room.name) return false;
        const structureType = structure.structureType;
        if (structureType === STRUCTURE_STORAGE || structureType === STRUCTURE_TERMINAL || structureType === STRUCTURE_POWER_SPAWN || structureType === STRUCTURE_FACTORY) return true;
        if (this.Link && structure.id === this.Link.id) return true;
        if (this.Extension && structure.id === this.Extension.id) return true;
        return false;
    }
    initParam() {
        /** @type { [number, number, number, number] } @private */
        this._y1_x1_y2_x2 = Memory.autoPlan[this.room.name]["centralTransfer"][0];
        this.LeftTopPos = new RoomPosition(this._y1_x1_y2_x2[1], this._y1_x1_y2_x2[0], this.room.name);
        this.RightBottomPos = new RoomPosition(this._y1_x1_y2_x2[3], this._y1_x1_y2_x2[2], this.room.name);
    }
    /** @param {Room} room */
    constructor(room) {
        /** @private */
        this.room = room;
        this.initParam();
        /** @type {Array<TransferOrder>} @private */
        this.orderQueue = [];
        this.issueTasks();
    }
}
/** @type { {[roomName : string] : CentralSpawnUnit} } */
const centralSpawnUnits = {};
/** @type { {[roomName : string] : CentralTransferUnit} } */
const centralTransferUnits = {};
function mount() {
    Room.prototype.init = function() {
        /** Calling for Construction */
        this.centralSpawn;
        this.centralTransfer;
    }
    Room.prototype.Detect = function() {
        console.log(`<p style="display:inline;color:red;">[Detect]</p> ${this.name}`);
        this.memory._lastCheckingTick = Game.time;
        this.memory.owner = this.controller ? this.controller.owner ? this.controller.owner.username : this.controller.reservation? this.controller.reservation.username : null : null;
        /** Detect InvaderCore */
        const OriginalHostileStructures = this.memory.hostileStructures || [];
        this.memory.hostileStructures = this.find(FIND_HOSTILE_STRUCTURES).map(s => s.id);
        const differenceHostileStructures = _.difference(this.memory.hostileStructures, OriginalHostileStructures);
        /** Avoid Room */
        if (this.find(FIND_HOSTILE_STRUCTURES, {filter : {structureType : STRUCTURE_TOWER}}).length > 0) this.memory.avoid = true;
        else delete this.memory.avoid;
        if (!this.memory.sourceAmount) this.memory.sourceAmount = this.find(FIND_SOURCES).length;
        this.memory.sourceCapacities = this.find(FIND_SOURCES).map(s => s.energyCapacity > SOURCE_ENERGY_CAPACITY ? s.energyCapacity : SOURCE_ENERGY_CAPACITY);
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
    Object.defineProperty(Room.prototype, "centralTransfer", {
        configurable : false,
        enumerable : false,
        get : function() {
            if (centralTransferUnits[this.name]) return centralTransferUnits[this.name];
            if (!Memory.autoPlan[this.name] || !Memory.autoPlan[this.name]["centralTransfer"]) return null;
            if (!centralTransferUnits[this.name]) centralTransferUnits[this.name] = new CentralTransferUnit(this);
            return centralTransferUnits[this.name];
        }
    });
    Object.defineProperty(Room.prototype, "controllerLink", {
        configurable : false,
        enumerable : false,
        get : function() {
            return global.MapMonitorManager.FetchStructureWithTag(this.name, "forController", STRUCTURE_LINK)[0] || null;
        }
    })
}
module.exports = {
    mount : mount
};