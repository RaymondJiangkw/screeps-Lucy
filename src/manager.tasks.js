/**
 * @module manager.tasks
 *
 * @typedef {TaskManager} TaskManager
 */
const DEFAULT = "default";
const getPrice              = require('./util').getPrice;
const PrintErr              = require('./util').PrintErr;
const bodyPartDetermination = require('./util').bodyPartDetermination;
const evaluateAbility       = require('./util').evaluateAbility;
const isHarvestable         = require('./util').isHarvestable;
const getCacheExpiration    = require('./util').getCacheExpiration;
const calcRoomDistance      = require('./util').calcRoomDistance;
const isMyRoom              = require('./util').isMyRoom;
const username              = require('./util').username;
const Task                  = require('./task.prototype').Task;
const TaskDescriptor        = require('./task.prototype').TaskDescriptor;
const Constructors          = require('./task.modules').Constructors;
const Builders              = require('./task.modules').Builders;
const Notifier              = require("./visual.notifier").Notifier;
const profiler              = require("./screeps-profiler");
/**
 * A Constructor, which aims at helping to construct role.
 */
class RoleConstructor {
    /**
     * 
     * @param {string} role
     * @param {import('./task.prototype').RoleType} type
     * @param { {type : "worker", availableEnergy : (room : Room) => number, energyConsumptionPerUnitPerTick : number, function : "build" | "repair" | "harvest"} | {type : "transferer", transferAmount : number} } [roleType]
     */
    Register(role, type, roleType = {}) {
        this.roleDescriptions[role] = {};
        this.roleType[role] = type;
        if (roleType.type === "worker") {
            this
                .set(role, {
                    key : "expand",
                    value : function (room) {
                        return bodyPartDetermination({type : "exhuastEnergy", availableEnergy : roleType.availableEnergy(room), energyConsumptionPerUnitPerTick : roleType.energyConsumptionPerUnitPerTick});
                    }
                })
                .set(role, {
                    key : "memoryTag",
                    value : {
                        tagName : `${roleType.energyConsumptionPerUnitPerTick}-worker`,
                        whetherAllowEmptyTag : true
                    }
                })
                .set(role, {
                    key : "spawnConstraint",
                    value : {
                        tag : `${roleType.function}Patch`,
                        mountRoomSpawnOnly : false
                    }
                })
                .set(role, {
                    key : "workingTicks",
                    value : roleType.function === "harvest"? (object) => object.store.getCapacity() /  (2 * evaluateAbility(object, roleType.function)) : (object) => object.store.getCapacity() / evaluateAbility(object, roleType.function)
                });
        } else if (roleType.type === "transferer") {
            this
                .set(role, {
                    key : "shrinkToEnergyAvailable",
                    value : {
                        bodyMaximumRequirements : bodyPartDetermination({
                            type : "transfer",
                            transferAmount : roleType.transferAmount
                        })
                    }
                })
                .set(role, {
                    key : "memoryTag",
                    value : {
                        tagName : "transferer",
                        whetherAllowEmptyTag : true
                    }
                })
                .set(role, {
                    key : "spawnConstraint",
                    value : {
                        tag : "transferPatch"
                    }
                })
                .set(role, {
                    key : "workingTicks",
                    value : () => 1
                });
        }
    }
    /**
     * @param {string} role
     * @param { {key : "number", value : [number, number]} | {key : "profit", value : (object : import("./task.prototype").GameObject) => number} | {key : "workingTicks", value : (object : import("./task.prototype").GameObject) => number} | {key:"memoryTag", value : {tagName? : string, whetherAllowEmptyTag? : boolean, otherAllowedTags? : string[]}} | {key:"spawnConstraint", value : {tag?:string, mountRoomSpawnOnly?:boolean}} | {key : "static", value : {bodyRequirements : {[body in BodyPartConstant]? : number}, bodyBoostRequirements? : {[body in BodyPartConstant]? : { [compound in ResourceConstant]? : number }}}} | {key : "shrinkToEnergyAvailable" | "shrinkToEnergyCapacity", value : {bodyMaximumRequirements : {[body in BodyPartConstant]? : number}, bodyBoostRequirements? : {[body in BodyPartConstant]? : { [compound in ResourceConstant]? : number }}}} | {key : "expand", value : {expandFunction : (room : Room) => {[body in BodyPartConstant]? : number}, bodyBoostRequirements? : {[body in BodyPartConstant]? : { [compound in ResourceConstant]? : number }}}} | {key : "workingPos", value : RoomPosition} | {key : "objectRequirement", value : (object : import("./task.prototype").GameObject) => boolean}} pair
     */
    set(role, pair) {
        const NotifyRoleKeyUnmatch = () => PrintErr(`${role} could not be set with ${pair.key}`);
        if (!this.roleType[role] || !this.roleDescriptions[role]) PrintErr(`${role} set before defined.`);
        if (pair.key === "number") {
            this.roleDescriptions[role].minimumNumber = pair.value[0];
            this.roleDescriptions[role].maximumNumber = pair.value[1];
        } else if (pair.key === "profit") {
            this.roleDescriptions[role].estimateProfitPerTurn = pair.value;
        } else if (pair.key === "workingTicks") {
            this.roleDescriptions[role].estimateWorkingTicks = pair.value;
        } else if (pair.key === "workingPos") {
            this.roleDescriptions[role].workingPos = pair.value;
        } else if (pair.key === "memoryTag") {
            if (pair.value.tagName) this.roleDescriptions[role].tag = pair.value.tagName;
            if (pair.value.whetherAllowEmptyTag !== undefined) this.roleDescriptions[role].allowEmptyTag = pair.value.whetherAllowEmptyTag;
            if (pair.value.otherAllowedTags !== undefined) this.roleDescriptions[role].allowOtherTags = pair.value.otherAllowedTags;
        } else if (pair.key === "objectRequirement") {
            if (this.roleType[role] !== "common") NotifyRoleKeyUnmatch();
            else this.roleDescriptions[role].isSatisfied = pair.value;
        } else if (pair.key === "spawnConstraint") {
            if (this.roleType[role] !== "creep") NotifyRoleKeyUnmatch();
            else {
                if (pair.value.tag) this.roleDescriptions[role].groupTag = pair.value.tag;
                if (pair.value.mountRoomSpawnOnly !== undefined) this.roleDescriptions[role].confinedInRoom = pair.value.mountRoomSpawnOnly;
            }
        } else if (pair.key === "expand") {
            if (this.roleType[role] !== "creep") NotifyRoleKeyUnmatch();
            else {
                this.roleDescriptions[role].mode = pair.key;
                this.roleDescriptions[role].expandFunction = pair.value;
            }
        } else if (pair.key === "static") {
            if (this.roleType[role] !== "creep") NotifyRoleKeyUnmatch();
            else {
                this.roleDescriptions[role].mode = pair.key;
                if (pair.value.bodyRequirements) this.roleDescriptions[role].bodyMinimumRequirements = pair.value.bodyRequirements;
                if (pair.value.bodyBoostRequirements) this.roleDescriptions[role].bodyBoostRequirements = pair.value.bodyBoostRequirements;
            }
        } else if (pair.key === "shrinkToEnergyAvailable" || pair.key === "shrinkToEnergyCapacity") {
            if (this.roleType[role] !== "creep") NotifyRoleKeyUnmatch();
            else {
                this.roleDescriptions[role].mode = pair.key;
                if (pair.value.bodyMaximumRequirements) this.roleDescriptions[role].bodyMinimumRequirements = pair.value.bodyMaximumRequirements;
                if (pair.value.bodyBoostRequirements) this.roleDescriptions[role].bodyBoostRequirements = pair.value.bodyBoostRequirements;
            }
        }
        return this;
    }
    Output() {
        return this.roleDescriptions;
    }
    constructor() {
        /** @type { {[role : string] : import('./task.prototype').CreepRoleDescription | import("./task.prototype").ObjectRoleDescription} } */
        this.roleDescriptions = {};
        /** @type { {[role : string] : import("./task.prototype").RoleType} } */
        this.roleType = {};
    }
}
/**
 * A Constructor, which aims at helping to issue tasks.
 */
class TaskConstructor {
    /**
     * @private
     * @param {string} name Name of Task
     * @param {string} mountRoomName Name of Room in which task is issued
     * @param {import("./task.prototype").GameObject} mountObj
     * @param {import("./task.prototype").TaskDescriptor} taskDescriptor
     * @param {{selfCheck: () => "working" | "dead", run: import("./task.modules").Project | () => Array<GameObject>, calcCommutingTicks? : (obj : GameObject) => number }} funcs
     * @param {{}} taskData
     */
    taskConstructor(name, mountRoomName, mountObj, taskDescriptor, funcs, taskData) {
        new Task(name, mountRoomName, mountObj, taskDescriptor, funcs, taskData);
    }
    /**
     * @private
     * @param {string} taskType Type of Task, used to control executing number.
     * @param {RoleConstructor} roleDescriptor
     * @param {string} taskKey Used to identify task.
     */
    taskDescriptorConstructor(taskType, roleDescriptor, taskKey = undefined) {
        return new TaskDescriptor(taskType, roleDescriptor.Output(), {taskKey : taskKey});
    }
    /**
     * @private
     * @param { {taskName : string, taskType : string} } param0
     * @param { {mountRoomName : string, mountObj : import("./task.prototype").GameObject} } param1
     * @param {RoleConstructor} roleDescriptor
     * @param { {funcs : {selfCheck: () => "working" | "dead", run: import("./task.modules").Project | () => Array<GameObject>, calcCommutingTicks? : (obj : GameObject) => number }, taskData? : {}, taskKey? : string} } param3
     */
    Construct({taskName, taskType}, {mountRoomName, mountObj}, roleDescriptor, {funcs, taskData, taskKey}) {
        this.taskConstructor(taskName, mountRoomName, mountObj, this.taskDescriptorConstructor(taskType, roleDescriptor, taskKey), funcs, taskData);
    }
    /**
     * @param {Id<ConstructionSite>} constructionSiteId
     * @param {RoomPosition} constructionSitePos
     */
    BuildTask(constructionSiteId, constructionSitePos) {
        /** Potential Redundant Trigger in Neutral Room when visibility varies */
        if (global.TaskManager.Fetch(constructionSiteId, `BUILD_${constructionSiteId}`).length > 0) return true;
        const NEXT_CONSTRUCTION_TIMEOUT = 50;
        const NEXT_CONSTRUCTION_OFFSET = 5;
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep", {type : "worker", energyConsumptionPerUnitPerTick : 5, function : "build", availableEnergy : (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : Lucy.Rules.arrangements.BUILD_ONLY})});
        roleDescriptor
            .set("worker", {key : "spawnConstraint", value : {mountRoomSpawnOnly : false}})
            .set("worker", {key : "number", value : [1, Infinity]})
            .set("worker", {key : "profit", value : function (object) {
                if (this.EmployeeAmount === 0) return 5 * getPrice("energy") * object.store.getCapacity() + object.store.getCapacity() * (this.mountObj? this.mountObj.progress / this.mountObj.progressTotal : 0) * getPrice("energy");
                /* Serve as a collect-up task, but with least privilege */
                else return -Infinity;
            }});
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : false, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : false, confinedInRoom : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            return resource;
        }.bind(constructionSitePos);
        /**
         * @param {number} amount
         * @param {ResourceConstant} resourceType
         */
        const requestStoreResources = function(amount, resourceType) {
            return global.ResourceManager.Query(this, resourceType, amount, {type : "store"});
        }.bind(constructionSitePos);
        if (!requestResource(1)) {
            Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_CONSTRUCTION_TIMEOUT, NEXT_CONSTRUCTION_OFFSET), this.BuildTask, this, [constructionSiteId, constructionSitePos], `Build ${constructionSiteId} of Room ${constructionSitePos.roomName} because of shortage of energy`);
            return;
        }
        this.Construct({taskName : `[${constructionSitePos.roomName}:ConstructionSitesBuild]`, taskType : "Construct"}, {mountRoomName : constructionSitePos.roomName, mountObj : {pos : constructionSitePos, id : constructionSiteId}}, roleDescriptor, {
            funcs : {
                selfCheck : function() {
                    if (Game.rooms[this.taskData.constructionSitePos.roomName] && (!this.mountObj || this.mountObj.progress === this.mountObj.progressTotal)) {
                        global.Lucy.Timer.add(Game.time + 1, (roomName) => {
                            global.signals.IsConstructionSiteCancel[roomName] = true;
                            global.signals.IsAnyConstructionSiteCancel = true;
                        }, undefined, [this.taskData.constructionSitePos.roomName], `Signal ConstructionSite disappears`);
                        return "dead";
                    }
                    /** Lacking Resources @TODO */
                    return "working";
                },
                run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), {targetId :  constructionSiteId, targetPos : constructionSitePos}, 3, Creep.prototype.build)
            },
            taskData : {constructionSitePos : constructionSitePos},
            taskKey : `BUILD_${constructionSiteId}`
        });
    }
    /**
     * @param {Id<Structure>} structureId
     * @param {RoomPosition} structurePos
     * @param {(hits : number, hitsMax : number) => boolean} hitsUpperBound
     */
    RepairTask(structureId, structurePos, hitsUpperBound = (hits, hitsMax) => hitsMax - hits <= 1) {
        /** Potential Redundant Trigger in Neutral Room when visibility varies */
        if (global.TaskManager.Fetch(structureId, `REPAIR_${structureId}`).length > 0) return true;
        const NEXT_REPAIR_TIMEOUT = 500;
        const NEXT_REPAIR_OFFSET  = 50;
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep", {type : "worker", energyConsumptionPerUnitPerTick : 1, function : "repair", availableEnergy : (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false})});
        roleDescriptor
            .set("worker", {key : "spawnConstraint", value : {mountRoomSpawnOnly : false}})
            .set("worker", {key : "number", value : [1, 1]})
            .set("worker", {key : "profit", value : function (object) {
                return getPrice("energy") * object.store.getCapacity() * (1 + 1 - (this.mountObj ? this.mountObj.hits / this.mountObj.hitsMax : 1));
            }});
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : false, confinedInRoom : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            return resource;
        }.bind(structurePos);
        /**
         * @param {number} amount
         * @param {ResourceConstant} resourceType
         */
        const requestStoreResources = function(amount, resourceType) {
            return global.ResourceManager.Query(this, resourceType, amount, {type : "store"});
        }.bind(structurePos);
        if (!requestResource(1)) {
            Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_REPAIR_TIMEOUT, NEXT_REPAIR_OFFSET), this.RepairTask, this, [structureId, structurePos, hitsUpperBound], `Repair ${structureId} of Room ${structurePos.roomName} because of shortage of energy`);
            return;
        }
        this.Construct({taskName : `[${structurePos.roomName}:Repair]`, taskType : "Repair"}, {mountRoomName : structurePos.roomName, mountObj : {id : structureId, pos : structurePos}}, roleDescriptor, {
            funcs:{
                selfCheck : function() {
                    if (Game.rooms[this.taskData.structurePos.roomName] && !this.mountObj) return "dead";
                    /* Repairing Target is stricter */
                    if (Game.rooms[this.taskData.structurePos.roomName] && this.taskData.hitsUpperBound(this.mountObj.hits, this.mountObj.hitsMax)) {
                        /* Since decaying is constant and dynamic, the checking should be too. */
                        const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(NEXT_REPAIR_TIMEOUT, this.mountObj.ticksToDecay * 2), Math.min(this.mountObj.ticksToDecay, NEXT_REPAIR_OFFSET));
                        /** At this time, this.mountObj.triggerRepairing is reachable. */
                        Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerRepairing, this.mountObj.id, [], `Repair ${this.mountObj} of Room ${this.mountObj.room.name} because of completion`);
                        return "dead";
                    }
                    /** Lacking Resources @TODO */
                    return "working";
                },
                run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), {targetId : structureId, targetPos : structurePos}, 3, Creep.prototype.repair)
            },
            taskData : {hitsUpperBound : hitsUpperBound, structurePos : structurePos},
            taskKey : `REPAIR_${structureId}`
        });
    }
    /**
     * @param {Structure} structure
     * @param {ResourceConstant} resourceType
     * @param {string} triggerFillingFunctionName
     * @param {number} fillAmount
     * @param {string} taskType
     * @param {number} maximumWorkerAmount
     * @param {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink} requestResource
     * @param {(amount : number) => StructureContainer | StructureStorage | StructureLink} strictRequestResource
     * @param {(object : import("./task.prototype").GameObject) => number} amountFunc
     * @param {(room : Room) => number} availableEnergy
     * @param {(object : import("./task.prototype").GameObject) => number} profitFunc
     * @param {(structure : Structure, resourceType : ResourceConstant) => boolean} storeCheckFunc
     */
    RequestTask(structure, resourceType, triggerFillingFunctionName, fillAmount, taskType, maximumWorkerAmount, requestResource, strictRequestResource, amountFunc, availableEnergy, profitFunc, storeCheckFunc) {
        const NEXT_FILLING_TIMEOUT = 50;
        const NEXT_FILLING_OFFSET  = 5;
        const roleDescriptor = new RoleConstructor();
        const resourceIndicator = requestResource(1);
        if (!resourceIndicator) {
            Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_FILLING_TIMEOUT, NEXT_FILLING_OFFSET), structure[triggerFillingFunctionName], structure.id, [], `Filling ${resourceType} for ${structure} because of shortage of resources`);
            return;
        }
        if (isHarvestable(resourceIndicator)) {
            roleDescriptor.Register("worker", "creep", {type : "worker", availableEnergy : availableEnergy, energyConsumptionPerUnitPerTick : 5, function : "harvest"});
            roleDescriptor
                .set("worker", {key : "number", value : [1, maximumWorkerAmount]})
                .set("worker", {key : "profit", value : profitFunc});
        } else {
            requestResource = strictRequestResource;
            roleDescriptor.Register("worker", "creep", {type : "transferer", transferAmount : fillAmount});
            roleDescriptor
                .set("worker", {key : "number", value : [1, maximumWorkerAmount]})
                .set("worker", {key : "profit", value : profitFunc});
        }
        /**
         * @param {number} amount
         * @param {ResourceConstant} resourceType
         */
        const requestStoreResources = function(amount, resourceType) {
            return global.ResourceManager.Query(this, resourceType, amount, {type : "store"});
        }.bind(structure.pos);
        this.Construct({taskName : `[${structure.room.name}:Filling${resourceType}]`, taskType : taskType}, {mountRoomName : structure.room.name, mountObj : structure}, roleDescriptor, {
            funcs: {
                selfCheck : function() {
                    if (!this.mountObj) return "dead";
                    if (this.EmployeeAmount === 0 && !this.taskData.requestResource(1)) {
                        Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_FILLING_TIMEOUT, NEXT_FILLING_OFFSET), this.mountObj[this.taskData.triggerFillingFunctionName], this.mountObj.id, [], `Filling ${this.taskData.resourceType} for ${this.mountObj} because of shortage of ${this.taskData.resourceType}`);
                        return "dead";
                    }
                    /** Schedule For Next One */
                    if (this.taskData.storeCheckFunc(this.mountObj, this.taskData.resourceType)) {
                        Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_FILLING_TIMEOUT, NEXT_FILLING_OFFSET), this.mountObj[this.taskData.triggerFillingFunctionName], this.mountObj.id, [], `Filling ${this.taskData.resourceType} for ${this.mountObj} because of completion`);
                        return "dead";
                    }
                    return "working";
                },
                run : Builders.BuildFetchResourceAndDoSomethingProject(resourceType, requestResource, requestStoreResources, amountFunc, structure, 1, Creep.prototype.transfer, [resourceType])
            },
            taskData : {storeCheckFunc : storeCheckFunc, triggerFillingFunctionName : triggerFillingFunctionName, resourceType : resourceType, requestResource : requestResource},
            taskKey : `FILLING_${resourceType}`
        });
    }
    /**
     * @danger When it comes to the case that `options.merge` becomes an important choice, subtle issues could occur when
     * transfering happens inside the `CentralTransferUnit`. Despite its relatively quick speed of transfering, some edge
     * cases including `transferer` not available and blocking of `transfer` queue could result in undesired duplications
     * when `merge` is designed to be avoided. This can be solved in some ways by "take over the task without delay".
     * @param {{fromId : Id, fromPos : RoomPosition}} param0
     * @param {{toId : Id, toPos : RoomPosition}} param1
     * @param {{list : {[resourceType in ResourceConstant]? : number}, transactions : {[resourceType in ResourceConstant]? : import("./money.prototype").Transaction[] | import("./money.prototype").Transaction}}} param2
     * @param {{merge? : boolean, callback? : Function}} [options] `callback` is disabled in the case of transfering among the CentralTransferUnit because of the existence of transfering queue, which makes life easier and is much more advanced than `callback`.
     */
    TransferTask({fromId, fromPos}, {toId, toPos}, {list = {}, transactions = {}}, options = {}) {
        _.defaults(options, {merge : true});
        for (const resourceType in transactions) if (!Array.isArray(transactions[resourceType])) transactions[resourceType] = [transactions[resourceType]];
        console.log(`[Transfer] ${fromId} ${fromPos} => ${toId} ${toPos} : ${JSON.stringify(list)} `);
        // At the same time, only one transfer task between `from` and `to` is allowed to exist, which is used to control amount.
        // Additional request will be added.
        if (global.TaskManager.Fetch(toId, `${fromId}->${toId}`).length > 0) {
            let func = Math.max;
            if (options.merge) func = (a, b) => a + b;
            /** @type {import("./task.prototype").Task} */
            const task = global.TaskManager.Fetch(toId, `${fromId}->${toId}`)[0];
            /** Merge List */
            for (const resourceType in list) {
                if (!task.taskData.list[resourceType]) task.taskData.list[resourceType] = 0;
                task.taskData.list[resourceType] = func(list[resourceType], task.taskData.list[resourceType]);
            }
            /** Merge Transactions */
            for (const resourceType in transactions) {
                if (!task.taskData.transactions[resourceType]) task.taskData.transactions[resourceType] = transactions[resourceType];
                else {
                    if (options.merge) task.taskData.transactions[resourceType] = task.taskData.transactions[resourceType].concat(transactions[resourceType]);
                    else {
                        task.taskData.transactions[resourceType].forEach(t => t.Done());
                        task.taskData.transactions[resourceType] = transactions[resourceType];
                    }
                }
            }
            return true;
        }
        const transferRun = function() {
            /** @type {Creep} */
            const worker = this.FetchEmployees("worker")[0];
            if (!worker) return [];
            /** @type {{[resourceType in ResourceConstant]? : number}} */
            const list = this.taskData.list;
            /** @type {{[resourceType in ResourceConstant]? : import("./money.prototype").Transaction[]}} */
            const transactions = this.taskData.transactions;
            if (!worker.memory.flags) worker.memory.flags = {};
            /**
             * Ensure irrelevant resources are "dropped".
             */
            if (!worker.memory.flags.init) {
                if (worker.store.getUsedCapacity() === 0) worker.memory.flags.init = true;
                else if (worker.storeResources() === "fail") worker.memory.flags.init = true;
            }
            if (!worker.memory.flags.init) return [];
            /**
             * Status Switching
             */
            if (!worker.memory.flags.working && (worker.store.getFreeCapacity() === 0 || Object.keys(list).length === 0)) worker.memory.flags.working = true;
            if (worker.memory.flags.working && worker.store.getUsedCapacity() === 0) {
                worker.memory.flags.working = false;
                /**
                 * Finish Task
                 */
                if (Object.keys(list).length === 0) {
                    this.taskData[OK] = true;
                    console.log(`Transfer Task ${this.taskData.fromPos}=>${this.taskData.toPos} finish.`);
                    return [worker];
                }
            }
            if (!worker.memory.flags.working) {
                /** @type {RoomPosition} */
                const fromPos = this.taskData.fromPos;
                /** @type {Id<Structure & {store : Store<StoreDefinitionUnlimited, true>}>} */
                const fromId = this.taskData.fromId;
                if (worker.pos.roomName !== fromPos.roomName || worker.pos.getRangeTo(fromPos) !== 1) worker.travelTo(fromPos);
                else {
                    const from = Game.getObjectById(fromId);
                    for (const resourceType in list) {
                        /**
                         * Special Case : exhausted
                         */
                        if (from.store[resourceType] === 0) {
                            delete list[resourceType];
                            if (transactions[resourceType]) {
                                transactions[resourceType].forEach(t => t.Done());
                                delete transactions[resourceType];
                            }
                            continue;
                        }
                        const amount = Math.min(list[resourceType], from.store[resourceType], worker.store.getFreeCapacity());
                        list[resourceType] -= amount;
                        if (list[resourceType] <= 0) {
                            delete list[resourceType];
                            if (transactions[resourceType]) {
                                transactions[resourceType].forEach(t => t.Done());
                                delete transactions[resourceType];
                            }
                        }
                        if (amount > 0) {
                            worker.withdraw(from, resourceType, amount);
                            break;
                        }
                    }
                }
            }
            if (worker.memory.flags.working) {
                /** @type {RoomPosition} */
                const toPos = this.taskData.toPos;
                /** @type {Id<Structure & {store : Store<StoreDefinitionUnlimited, true>}>} */
                const toId = this.taskData.toId;
                if (worker.pos.roomName !== toPos.roomName || worker.pos.getRangeTo(toPos) !== 1) worker.travelTo(toPos);
                else {
                    const to = Game.getObjectById(toId);
                    /**
                     * Special Case : Full
                     */
                    if (to.store.getFreeCapacity() === 0) {
                        worker.memory.flags.working = false;
                        return [worker];
                    }
                    for (const resourceType in worker.store) {
                        worker.transfer(to, resourceType);
                        break;
                    }
                }
            }
            return [];
        };
        if (fromPos.roomName === toPos.roomName) {
            // Transfer in the same room
            const roomName = fromPos.roomName;
            if (isMyRoom(roomName)) {
                console.log(`Transfer ${roomName} from ${fromPos} to ${toPos} (${JSON.stringify(list)})`);
                // Controlled Room
                /** @type {import("./rooms.behaviors").CentralTransferUnit} */
                const centralTransfer = Game.rooms[roomName].centralTransfer;
                const from = Game.getObjectById(fromId), to = Game.getObjectById(toId);
                if (!centralTransfer || !centralTransfer.IsBelongTo(from) || !centralTransfer.IsBelongTo(to)) {
                    const totalTransferAmount = Math.min(_.sum(Object.values(list)), CONTAINER_CAPACITY / 2);
                    const roleDescriptor = new RoleConstructor();
                    roleDescriptor.Register("worker", "creep", {type : "transferer", transferAmount : totalTransferAmount});
                    roleDescriptor
                        .set("worker", {key : "number", value : [1, 1]})
                        .set("worker", {key : "profit", value : (object) => Math.max(...Object.keys(list).map(getPrice)) * object.store.getCapacity()});
                    this.Construct({taskName : `[Transfer:${fromId},${fromPos}->${toId},${toPos}]`, taskType : "Transfer"}, {mountRoomName : roomName, mountObj : to}, roleDescriptor, {
                        funcs : {
                            selfCheck : function() {
                                /**
                                 * Since `from` and `to` are in the room, which is controlled and, thus, always visible, pure check of `Game.getObjectById` is enough.
                                 */
                                if (this.taskData[OK]) {
                                    console.log(`Calling callback => ${this.taskData.callback}`);
                                    if (this.taskData.callback) this.taskData.callback();
                                    return "dead";
                                }
                                if (!Game.getObjectById(this.taskData.fromId) || !Game.getObjectById(this.taskData.toId)) return "dead";
                                return "working";
                            },
                            run : transferRun
                        },
                        taskData : {[OK] : false, fromId, fromPos, toId, toPos, list, transactions, callback : options.callback},
                        taskKey : `${fromId}->${toId}`
                    });
                } else {
                    // Transfer in the CentralTransferUnit, which means that it could be solved by pushing order.
                    Object.entries(list).forEach(([resourceType, amount]) => centralTransfer.PushOrder({from : from.structureType, to : to.structureType, resourceType, amount, callback : () => {transactions[resourceType].forEach(t => t.Done());}}));
                    return true;
                }
            } else {
                /**
                 * @TODO
                 * I think this branch does not exist in practice.
                 */
            }
        } else {
            // Transfer in the different room
            const totalTransferAmount = Math.min(_.sum(Object.values(list)));
            const roleDescriptor = new RoleConstructor();
            roleDescriptor.Register("worker", "creep", {type : "transferer", transferAmount : totalTransferAmount});
            roleDescriptor
                .set("worker", {key : "number", value : [1, 1]})
                .set("worker", {key : "profit", value : (object) => Math.max(...Object.keys(list).map(getPrice)) * object.store.getCapacity()});
            this.Construct({taskName : `[Transfer:${fromId},${fromPos}->${toId},${toPos}]`, taskType : "CrossTransfer"}, {mountRoomName : toPos.roomName, mountObj : {id : null, pos : toPos}}, roleDescriptor, {
                funcs : {
                    selfCheck : function() {
                        if (this.taskData[OK]) {
                            console.log(`Calling callback => ${this.taskData.callback}`);
                            if (this.taskData.callback) this.taskData.callback();
                            return "dead";
                        }
                        if ((Game.rooms[this.taskData.fromPos.roomName] && !Game.getObjectById(this.taskData.fromId)) || (Game.rooms[this.taskData.toPos.roomName] && !Game.getObjectById(this.taskData.toId))) return "dead";
                        return "working";
                    },
                    run : transferRun,
                },
                taskData : {[OK] : false, fromId, fromPos, toId, toPos, list, transactions, callback : options.callback},
                taskKey : `${fromId}->${toId}`
            });
        }
        return true;
    }
    /**
     * Claim Task does not take the responsibility of checking the reachability of targetRoom.
     * @param {string} targetRoom
     * @returns {boolean}
     */
    ClaimTask(targetRoom) {
        if (global.TaskManager.Fetch("default", `CLAIM_${targetRoom}`).length > 0) return true;
        global.Log.room(targetRoom, global.Dye.red("Claiming starts"));
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep");
        roleDescriptor
            .set("worker", {key : "static", value : {bodyRequirements : {[CLAIM]:1,[MOVE]:1}}})
            .set("worker", {key : "memoryTag", value : {tagName : "claimer", whetherAllowEmptyTag : false}})
            .set("worker", {key : "profit", value : function (object) { return -Game.map.getRoomLinearDistance(this.taskData.targetRoom, object.pos.roomName) * 50 * getPrice("cpu"); }})
            .set("worker", {key : "workingTicks", value : () => 0})
            .set("worker", {key : "spawnConstraint", value : {tag : "claimPatch", mountRoomSpawnOnly : false}})
            .set("worker", {key:"number", value : [1,1]});
        this.Construct({taskName : `[Claim:${targetRoom}]`, taskType : "Claim"}, {mountRoomName : targetRoom, mountObj : {id : null}}, roleDescriptor, {
            funcs : {
                selfCheck : function() {
                    if (Game.rooms[this.taskData.targetRoom] && Game.rooms[this.taskData.targetRoom].controller.my) return "dead";
                    if (this.taskData[ERR_NO_PATH]) {
                        global.Map.SetAsUnreachable(this.taskData.targetRoom, this.taskData.fromRoom);
                        return "dead";
                    }
                    return "working";
                },
                run : function() {
                    /** @type {Creep} */
                    const worker = this.FetchEmployees("worker")[0];
                    if (!worker) return [];
                    if (worker.room.name === this.taskData.targetRoom) {
                        if (worker.claimController(worker.room.controller) === ERR_NOT_IN_RANGE) worker.travelTo(worker.room.controller);
                        else return [worker];
                    } else {
                        if (worker.travelTo(new RoomPosition(25, 25, this.taskData.targetRoom), {forbidInComplete : true}) === ERR_NO_PATH) {
                            this.taskData[ERR_NO_PATH] = true;
                            this.taskData.fromRoom = worker.room.name;
                            return [worker];
                        }
                    }
                    return [];
                }
            },
            taskData : {targetRoom : targetRoom, fromRoom : null, [ERR_NO_PATH] : false},
            taskKey : `CLAIM_${targetRoom}`
        })
    }
    /**
     * Reserve Task does not take the responsibility of checking the reachability of targetRoom.
     * @param {string} targetRoom
     * @returns {boolean}
     */
    ReserveTask(targetRoom) {
        if (global.TaskManager.Fetch("default", `Reserve_${targetRoom}`).length > 0) return true;
        global.Log.room(targetRoom, global.Dye.blue("Reservation starts"));
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep");
        roleDescriptor
            .set("worker", {key : "static", value : {bodyRequirements : {[CLAIM]:2,[MOVE]:2}}}) // 2 CLAIM is the maximum based on the minimum controller level 4
            // Specific Task here considers that the distance between targetRoom and spawnRoom could be large
            // and it would be inefficient if some creep suddenly turns its way to B while heading for A because
            // of global reset.
            // Additionally, `reserve` is a permanent task which is not same with `claim` or `scout`.
            .set("worker", {key : "memoryTag", value : {tagName : `reserver-${targetRoom}`, whetherAllowEmptyTag : false}})
            .set("worker", {key : "profit", value : function (object) { return -Game.map.getRoomLinearDistance(this.taskData.targetRoom, object.pos.roomName) * 50 * getPrice("cpu"); }})
            .set("worker", {key : "workingTicks", value : () => 0})
            .set("worker", {key : "spawnConstraint", value : {tag : "default", mountRoomSpawnOnly : false}})
            .set("worker", {key:"number", value : [1, 1]}); // NOTICE : When Global Reset, `new` Creep could be hired while `old` creep is abandoned.
        this.Construct({taskName : `[Reserve:${targetRoom}]`, taskType : "default"}, {mountRoomName : targetRoom, mountObj : {id : null}}, roleDescriptor, {
            funcs : {
                selfCheck : function() {
                    if (this.taskData[ERR_NO_PATH]) {
                        global.Map.SetAsUnreachable(this.taskData.targetRoom, this.taskData.fromRoom);
                        return "dead";
                    }
                    return "working";
                },
                run : function() {
                    /** @type {Creep[]} */
                    const workers = this.FetchEmployees("worker");
                    /** @type {Creep[]} */
                    const firedEmployees = [];
                    /** Reserve Status Switching */
                    if (Game.rooms[this.taskData.targetRoom]) {
                        const room = Game.rooms[this.taskData.targetRoom];
                        if (!this.taskData.whetherToReserve && (!room.controller.reservation || room.controller.reservation.username !== username || room.controller.reservation.ticksToEnd <= 5000 - 2500)) this.taskData.whetherToReserve = true;
                        if (this.taskData.whetherToReserve && (room.controller.reservation && room.controller.reservation.username === username && room.controller.reservation.ticksToEnd >= 5000 - 5)) this.taskData.whetherToReserve = false;
                    }
                    workers.forEach(worker => {
                        if (!worker.memory.temporaryFlags) worker.memory.temporaryFlags = {};
                        if (!worker.memory.permanentFlags) worker.memory.permanentFlags = {};
                        if (!worker.memory.permanentFlags.employedTick) worker.memory.permanentFlags.employedTick = Game.time;
                        if (worker.room.name === this.taskData.targetRoom) {
                            
                            if (worker.pos.getRangeTo(worker.room.controller) > 1) worker.moveTo(worker.room.controller);
                            else {
                                // In this case, `worker` has moved to the position of `target`
                                if (!worker.memory.permanentFlags.startWorkingTick) worker.memory.permanentFlags.startWorkingTick = Game.time;
                                if (this.taskData.whetherToReserve) worker.reserveController(worker.room.controller);
                            }
                            /** Trigger Attack if InvaderCore is found */
                            if (!this.taskData[FIND_HOSTILE_STRUCTURES] && Game.time % 17 === 0 && worker.room.find(FIND_HOSTILE_STRUCTURES).length > 0) {
                                global.AttackManager.Add(worker.room.name, "Stronghold", 0);
                                this.taskData[FIND_HOSTILE_STRUCTURES] = true;
                            } else if (this.taskData[FIND_HOSTILE_STRUCTURES] && global.AttackManager.Query(worker.room.name) === "completed") {
                                this.taskData[FIND_HOSTILE_STRUCTURES] = false;
                            }
                            /** Trigger Defend if NPC or other player's hostile creeps are found */
                            if (!this.taskData[FIND_HOSTILE_CREEPS] && Game.time % 31 === 0 && worker.room.find(FIND_HOSTILE_CREEPS, {filter : (creep) => _.some(creep.body, y => [ATTACK, WORK, RANGED_ATTACK, CARRY].includes(y.type))}).length > 0) {
                                global.DefendManager.Add(worker.room.name, "Remote", 0);
                                this.taskData[FIND_HOSTILE_CREEPS] = true;
                            } else if (this.taskData[FIND_HOSTILE_CREEPS] && global.DefendManager.Query(worker.room.name) === "completed") {
                                this.taskData[FIND_HOSTILE_CREEPS] = false;
                            }
                            /** Issue Succession */
                            if (!worker.memory.temporaryFlags.isSuccessionIssued && worker.memory.permanentFlags.startWorkingTick && worker.ticksToLive < (worker.memory.permanentFlags.startWorkingTick - worker.memory.permanentFlags.employedTick + worker.body.length * 3)) {
                                worker.memory.temporaryFlags.isSuccessionIssued = true;
                                this.SignalReplacement(worker);
                                global.Log.room(this.taskData.targetRoom, global.Emoji.skull, global.Dye.black(`${worker.name} (${worker.memory.tag}) is near death and asks for successor ...`));
                            }
                        } else {
                            if (worker.travelTo(new RoomPosition(25, 25, this.taskData.targetRoom), {forbidInComplete : true}) === ERR_NO_PATH) {
                                this.taskData[ERR_NO_PATH] = true;
                                this.taskData.fromRoom = worker.room.name;
                                firedEmployees.push(worker);
                                return;
                            }
                        }
                    });
                    return firedEmployees;
                }
            },
            taskData : {targetRoom : targetRoom, fromRoom : null, [ERR_NO_PATH] : false, [FIND_HOSTILE_STRUCTURES] : false, [FIND_HOSTILE_CREEPS] : false, whetherToReserve : true},
            taskKey : `RESERVE_${targetRoom}`
        })
    }
    /**
     * @param {string} targetRoom
     * @param { {default? : boolean, dryRun? : boolean} } [options = {}]
     * @returns {boolean}
     */
    ScoutTask(targetRoom, options = {}) {
        if (global.TaskManager.Fetch("default", `SCOUT_${targetRoom}`).length > 0) return true;
        const status = Game.map.getRoomStatus(targetRoom).status;
        if (status === "closed") {
            global.Map.SetAsUnreachable(targetRoom);
            return false;
        }
        /** Could be detected by Observer */
        if (Object.keys(Game.rooms).filter((roomName) => Game.map.getRoomLinearDistance(roomName, targetRoom) <= OBSERVER_RANGE && Game.rooms[roomName][STRUCTURE_OBSERVER]).length > 0) {
            /**
             * @TODO
             * Add to Observer Matrix
             */
            return true;
        }
        /** DryRun Preprocess */
        if (options.dryRun) {
            /**
             * It is plausible that all controlled rooms are under the same state : `respawn`, `novice`
             * or `normal`.
             */
            const selfRoom = _.sample(Game.spawns).room.name;
            const selfStatus = Game.map.getRoomStatus(selfRoom).status;
            if (status !== selfStatus) {
                global.Map.SetAsUnreachable(targetRoom, selfRoom);
                return false;
            }
            return true;
        }
        global.Log.room(targetRoom, global.Dye.green("Scouting starts"));
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep");
        roleDescriptor
            .set("worker", {key : "static", value : {bodyRequirements : {[MOVE] : 1}}})
            .set("worker", {key : "memoryTag", value : {tagName : "scouter", whetherAllowEmptyTag : false}})
            .set("worker", {key : "profit", value : function (object) { return -Game.map.getRoomLinearDistance(this.taskData.targetRoom, object.pos.roomName) * 50 * getPrice("cpu"); }})
            .set("worker", {key : "workingTicks", value : () => 0})
            .set("worker", {key : "spawnConstraint", value : {tag : "scoutPatch", mountRoomSpawnOnly : false}})
            .set("worker", {key : "number", value : [1,1]});
        this.Construct({taskName : `[Scout:${targetRoom}]`, taskType : options.default? "default" : "Scout"}, {mountRoomName : targetRoom, mountObj : {id : null}}, roleDescriptor, {
            funcs : {
                selfCheck : function() {
                    if (this.taskData[ERR_NO_PATH]) {
                        global.Map.SetAsUnreachable(this.taskData.targetRoom, this.taskData.fromRoom);
                        return "dead";
                    }
                    if (this.taskData[OK]) return "dead";
                    return "working";
                },
                run : function() {
                    /** @type {Creep} */
                    const worker = this.FetchEmployees("worker")[0];
                    if (!worker) return [];
                    if (!worker.memory.flags) worker.memory.flags = {};
                    if (worker.room.name === this.taskData.targetRoom) {
                        if (worker.pos.x === 0 || worker.pos.x === 49 || worker.pos.y === 0 || worker.pos.y === 49) worker.moveTo(new RoomPosition(25, 25, worker.room.name));
                        else {
                            this.taskData[OK] = true;
                            return [worker];
                        }
                    } else {
                        if (worker.travelTo(new RoomPosition(25, 25, this.taskData.targetRoom), {forbidInComplete : true, maxOps : 20000, ignoreRoads : true, offRoad : true, ignoreCreeps : false}) === ERR_NO_PATH) {
                            this.taskData[ERR_NO_PATH] = true;
                            this.taskData.fromRoom = worker.room.name;
                            return [worker];
                        }
                        return [];
                    }
                    return [];
                }
            },
            taskData : {targetRoom : targetRoom, fromRoom : null, taskConstructor : _taskConstructor, [ERR_NO_PATH] : false, [OK] : false},
            taskKey : `SCOUT_${targetRoom}`
        });
        return true;
    }
    constructor() {}
}
/**
 * Class Representation for TaskManager
 * @TODO Double-Selection
 */
class TaskManager {
    /**
     * @private
     */
    getIndex() {
        return `${this.taskIndex++}`;
    }
    /**
     * @private
     * @param {string} index
     */
    remove(index) {
        // console.log(`Remove ${index}->${this.index2status[index].status}`);
        if (this.index2status[index].id && this.index2status[index].key) {
            const idTaskPools = this.id2key2tasks[this.index2status[index].id][this.index2status[index].key];
            idTaskPools.splice(idTaskPools.indexOf(index), 1);
        }
        --this.roomName2information[this.index2status[index].roomName].tags[this.index2status[index].tag].total;
        this.taskPools[index].spawnTags.forEach(v => --this.roomName2information[this.index2status[index].roomName].tags[this.index2status[index].tag].spawnTags[v]);
        const statusTaskPools = this.roomName2information[this.index2status[index].roomName].tags[this.index2status[index].tag][this.index2status[index].status];
        // console.log(statusTaskPools, index, statusTaskPools.indexOf(index));
        statusTaskPools.splice(statusTaskPools.indexOf(index), 1);
        // console.log(statusTaskPools);
        delete this.index2status[index];
        delete this.taskPools[index];
    }
    /**
     * @param {string} index
     * @param {"working" | "waiting"} status
     */
    Switch(index, status) {
        const originalStatus = this.index2status[index].status;
        if (originalStatus === status) return;
        const pool = this.roomName2information[this.index2status[index].roomName].tags[this.index2status[index].tag];
        pool[originalStatus].splice(pool[originalStatus].indexOf(index), 1);
        pool[status].push(index);
        this.index2status[index].status = status;
    }
    /**
     * `Check` checks validity of all tasks, which should be run at the start of `Task` module.
     */
    Check() {
        for (const index in this.taskPools) {
            const state = this.taskPools[index].State;
            if (state === "dead") this.remove(index);
        }
    }
    /**
     * @param {string} roomName
     * @param {import("./task.prototype").Task} task
     */
    Register(roomName, task) {
        if (!this.roomName2information[roomName]) {
            this.roomName2information[roomName] = {tags : {}};
            /** Visual */
            this.room2tag2ticks[roomName] = {};
            Notifier.register(roomName, `Grouped Tasks`, "Total", () => `${this.room2ticks[roomName] || 0.00}`);
        }
        if (!this.roomName2information[roomName].tags[task.Type]) {
            this.roomName2information[roomName].tags[task.Type] = {total : 0, working : [], waiting : [], spawnTags : {}};
            /** Visual */
            this.room2tag2ticks[roomName][task.Type] = 0.00;
            Notifier.register(roomName, `Grouped Tasks`, task.Type, () => `[${this.roomName2information[roomName].tags[task.Type].total}] ${_.sum(this.roomName2information[roomName].tags[task.Type].working.map(i => this.taskPools[i].EmployeeAmount)) || 0} => ${this.room2tag2ticks[roomName][task.Type]}`);
        }
        const index = this.getIndex();
        this.taskPools[index] = task;
        ++this.roomName2information[roomName].tags[task.Type].total;
        this.roomName2information[roomName].tags[task.Type].waiting.push(index);
        task.spawnTags.forEach(v => this.roomName2information[roomName].tags[task.Type].spawnTags[v] = (this.roomName2information[roomName].tags[task.Type].spawnTags[v] || 0) + 1);
        this.index2status[index] = {roomName : roomName, tag : task.Type, status : "waiting"};
        /** Register into Id Controller */
        if (task.Descriptor.Key) {
            const id = task.mountObj ? task.mountObj.id : "default";
            this.index2status[index].id = id;
            this.index2status[index].key = task.Descriptor.Key;
            if (!this.id2key2tasks[id]) this.id2key2tasks[id] = {};
            if (!this.id2key2tasks[id][task.Descriptor.Key]) this.id2key2tasks[id][task.Descriptor.Key] = [];
            this.id2key2tasks[id][task.Descriptor.Key].push(index);
        }
        return index;
    }
    /**
     * @TODO Special Optimization for Controller Level 8 ?
     * Ensure that under the same tag, only a portion of total tasks could be active.
     * NOTICE : Cache is not implemented here, since, in a single tick, state of saturation
     * could change.
     * @param {string} roomName
     * @param {string} tag
     * @returns {boolean}
     */
    IsSaturated(roomName, tag) {
        const tasks = this.roomName2information[roomName].tags[tag];
        if (tasks.total === 0) return true;
        /**
         * I expect the following property :
         *  - expectedNum should be logorithm-like.
         *  - When # working tasks = 1, expectedNum should be 1.
         *  - When # working tasks = e^2, expectedNum should be 2.
         */
        const expectedNum = Math.floor(Math.log(tasks.total) * 0.5 + 1);
        const workingNum = tasks.working.length;
        /**
         * NOTICE : For a group of Task, there could be the case that some of them still needs more workers and, when
         * they employee more workers, the total workingNum remains the same.
         */
        if (workingNum <= expectedNum) return false;
        else return true;
    }
    /**
     * @param {string} id
     * @param {string} key
     * @returns {Array<import("./task.prototype").Task>}
     */
    Fetch(id, key) {
        return _.get(this.id2key2tasks, [id, key], []).map(i => this.taskPools[i]);
    }
    /**
     * Query returns the best task to be chosen.
     * @param {import("./task.prototype").GameObject} subject
     * @returns {import("./task.prototype").Task | null}
     */
    Query(subject) {
        /**
         * Query will first check out whether `subject` has physical location.
         * If so, it will go through, several standards orderly to return the first matched:
         *      - Profit.
         *      - Location.
         */
        const roomName = subject.pos.roomName;
        const adjacentRooms = Object.keys(this.roomName2information).sort((u, v) => calcRoomDistance(roomName, u) - calcRoomDistance(roomName, v));
        /** @type {number | null} */
        let chosen = null;
        for (const roomName of adjacentRooms) {
            if (roomName !== subject.pos.roomName && Memory.rooms[roomName] && Memory.rooms[roomName].rejectHelp) continue;
            /** @type {number[]} */
            let totalTasks = [];
            for (const tag in this.roomName2information[roomName].tags) {
                /* Saturated Tasks are excluded, since there could be much more important tasks in other rooms */
                if (tag === DEFAULT || !this.IsSaturated(roomName, tag))
                    if (this.roomName2information[roomName].tags[tag].spawnTags[subject.memory.tag || ""]) {
                        // console.log(`${roomName}->${tag}->${this.roomName2information[roomName].tags[tag].waiting}`);
                        totalTasks = totalTasks
                                        .concat(
                                            this.roomName2information[roomName].tags[tag].waiting
                                                .select(
                                                    o =>
                                                        (-(o.commutingTicks + o.workingTicks) * getPrice("cpu") + o.moneyPerTurn),
                                                    i =>
                                                        this.taskPools[i].Identity(subject)["info"]
                                                )
                                            || []);
                    }
            }
            chosen = totalTasks.select(o => (-(o.commutingTicks + o.workingTicks) * getPrice("cpu") + o.moneyPerTurn), i => this.taskPools[i].Identity(subject)["info"]);
            if (chosen) break;
        }
        return this.taskPools[chosen] || null;
    }
    /**
     * Run all the Tasks
     */
    Run() {
        for (const roomName in this.roomName2information) {
            const _cpuUsed = Game.cpu.getUsed();
            for (const tag in this.roomName2information[roomName].tags) {
                const _cpuUsed = Game.cpu.getUsed();
                for (const index of this.roomName2information[roomName].tags[tag].working) this.taskPools[index].Run();
                // `waiting` Task still gets chance to run.
                for (const index of this.roomName2information[roomName].tags[tag].waiting) if (this.taskPools[index].EmployeeAmount > 0) this.taskPools[index].Run();
                this.room2tag2ticks[roomName][tag] = `${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`;
            }
            this.room2ticks[roomName] = `${(Game.cpu.getUsed() - _cpuUsed).toFixed(3)}`;
        }
    }
    constructor() {
        /** @type { {[id : string] : {[key : string] : Array<string>}} } @private */
        this.id2key2tasks = {};
        /** @private */
        this.taskIndex = 0;
        /** @type { {[index : string] : {roomName : string, tag : string, id? : string, key? : string, status : "working" | "waiting"}} } */
        this.index2status = {};
        /** @type { {[roomName : string] : {tags : {[tag : string] : {total : number, waiting : Array<string>, working : Array<string>, spawnTags : {[spawnTag : string] : number}}}}} } @private */
        this.roomName2information = {};
        /** @type {{[index : string] : Task}} @private*/
        this.taskPools = {};
        /** Used for Calculation of Ticks */
        /** @type { {[roomName : string] : number} } @private */
        this.room2ticks = {};
        /** @type { {[roomName : string] : {[tag : string] : number}} } @private */
        this.room2tag2ticks = {};
    }
};
const _taskManager = new TaskManager();
profiler.registerClass(TaskManager, 'TaskManager');
const _taskConstructor = new TaskConstructor();
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const TaskManagerPlugin = {
    init: () => global.TaskManager = _taskManager,
    beforeTickStart : () => global.TaskManager.Check(),
    tickStart : () => {
        const _cpuUsed = Game.cpu.getUsed();
        /**
         * Before `Run`
         * It is very useful that Creeps are visited by the order of spawning, so for those seeking successors,
         * they could still be hired!
         */
        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            if (!creep.task) creep.task = global.TaskManager.Query(creep);
        }
        // console.log(`Creep's Tasks -> ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
        global.TaskManager.Run();
        /** After `Run` : Deal with those fired and requested successors ... */
        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            if (!creep.task) {
                const ret = global.TaskManager.Query(creep);
                if (ret) creep.task = ret;
                else {
                    creep.say("🚬");
                    creep.checkIn();
                }
            }
        }
    }
};
global.Lucy.App.on(TaskManagerPlugin);
module.exports = {
    TaskConstructor : _taskConstructor
};