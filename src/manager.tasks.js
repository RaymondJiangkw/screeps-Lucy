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
const Task                  = require('./task.prototype').Task;
const TaskDescriptor        = require('./task.prototype').TaskDescriptor;
const Constructors          = require('./task.modules').Constructors;
const Builders              = require('./task.modules').Builders;
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
        const NEXT_CONSTRUCTION_TIMEOUT = 50;
        const NEXT_CONSTRUCTION_OFFSET = 5;
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep", {type : "worker", energyConsumptionPerUnitPerTick : 5, function : "build", availableEnergy : (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : Lucy.Rules.arrangements.BUILD_ONLY})});
        roleDescriptor
            .set("worker", {key : "number", value : [1, Infinity]})
            .set("worker", {key : "profit", value : function (object) {
                if (this.EmployeeAmount === 0) return 5 * getPrice("energy") * object.store.getCapacity() + object.store.getCapacity() * (this.mountObj.progress / this.mountObj.progressTotal) * getPrice("energy");
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
                    if (Game.rooms[this.taskData.constructionSitePos.roomName] && (!this.mountObj || this.mountObj.progress === this.mountObj.progressTotal)) return "dead";
                    /** Lacking Resources @TODO */
                    return "working";
                },
                run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), {targetId :  constructionSiteId, targetPos : constructionSitePos}, 3, Creep.prototype.build)
            },
            taskData : {constructionSitePos : constructionSitePos}
        });
    }
    /**
     * @param {Id<Structure>} structureId
     * @param {RoomPosition} structurePos
     * @param {(hits : number, hitsMax : number) => boolean} hitsUpperBound
     */
    RepairTask(structureId, structurePos, hitsUpperBound = (hits, hitsMax) => hitsMax - hits <= 1) {
        const NEXT_REPAIR_TIMEOUT = 500;
        const NEXT_REPAIR_OFFSET  = 50;
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep", {type : "worker", energyConsumptionPerUnitPerTick : 1, function : "repair", availableEnergy : (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false})});
        roleDescriptor
            .set("worker", {key : "number", value : [1, 1]})
            .set("worker", {key : "profit", value : function (object) {
                return getPrice("energy") * object.store.getCapacity() * (1 + 1 - this.mountObj.hits / this.mountObj.hitsMax);
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
            taskData : {hitsUpperBound : hitsUpperBound, structurePos : structurePos}
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
     * @param {(room : Room) => number} availableEnergy
     * @param {(object : import("./task.prototype").GameObject) => number} profitFunc
     * @param {(structure : Structure, resourceType : ResourceConstant) => boolean} storeCheckFunc
     */
    RequestTask(structure, resourceType, triggerFillingFunctionName, fillAmount, taskType, maximumWorkerAmount, requestResource, strictRequestResource, availableEnergy, profitFunc, storeCheckFunc) {
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
                run : Builders.BuildFetchResourceAndDoSomethingProject(resourceType, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(resourceType), structure, 1, Creep.prototype.transfer, [resourceType])
            },
            taskData : {storeCheckFunc : storeCheckFunc, triggerFillingFunctionName : triggerFillingFunctionName, resourceType : resourceType, requestResource : requestResource},
            taskKey : `FILLING_${resourceType}`
        });
    }
    TransferTask() {}
    /**
     * Claim Task does not take the responsibility of checking the reachability of targetRoom.
     * @param {string} targetRoom
     * @returns {boolean}
     */
    ClaimTask(targetRoom) {
        if (global.TaskManager.Fetch("default", `CLAIM_${targetRoom}`).length > 0) return true;
        const roomName = Object.keys(Game.rooms).filter(roomName => isMyRoom(roomName) && Game.rooms[roomName].controller.level >= 4).sort((u, v) => calcRoomDistance(u, targetRoom) - calcRoomDistance(v, targetRoom))[0];
        if (!roomName) return false;
        console.log(`<p style="color:gray;display:inline;">[Log]</p> Claiming ${targetRoom} from ${roomName}`);
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep");
        roleDescriptor
            .set("worker", {key : "static", value : {bodyRequirements : {[CLAIM]:1,[MOVE]:1}}})
            .set("worker", {key : "memoryTag", value : {tagName : "claimer", whetherAllowEmptyTag : false}})
            .set("worker", {key : "profit", value : function (object) { return -Game.map.getRoomLinearDistance(this.taskData.targetRoom, this.taskData.roomName) * 50 * getPrice("cpu"); }})
            .set("worker", {key : "workingTicks", value : () => 0})
            .set("worker", {key : "spawnConstraint", value : {tag : "claimPatch", mountRoomSpawnOnly : true}})
            .set("worker", {key:"number", value : [1,1]});
        this.Construct({taskName : `[Claim:${roomName}->${targetRoom}]`, taskType : "Claim"}, {mountRoomName : roomName, mountObj : {id : null}}, roleDescriptor, {
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
                    const worker = Object.keys(this.employee2role).map(Game.getObjectById)[0];
                    if (!worker) return [];
                    if (worker.room.name === this.taskData.targetRoom) {
                        if (worker.claimController(worker.room.controller) === ERR_NOT_IN_RANGE) worker.travelTo(worker.room.controller);
                        else return [worker];
                    } else {
                        if (worker.travelTo(global.MapMonitorManager.FetchVacantSpace(this.taskData.targetRoom)[0], {forbidInComplete : true}) === ERR_NO_PATH) {
                            this.taskData[ERR_NO_PATH] = true;
                            this.taskData.fromRoom = worker.room.name;
                            return [worker];
                        }
                    }
                    return [];
                }
            },
            taskData : {targetRoom : targetRoom, roomName : roomName, fromRoom : null, [ERR_NO_PATH] : false},
            taskKey : `CLAIM_${targetRoom}`
        })
    }
    /**
     * @param {string} targetRoom
     * @param { {default? : boolean} } [options = {}]
     * @returns {boolean}
     */
    ScoutTask(targetRoom, options = {}) {
        const status = Game.map.getRoomStatus(targetRoom).status;
        if (status === "closed") {
            global.Map.SetAsUnreachable(targetRoom);
            return false;
        }
        /** Could be detected by Observer */
        if (Object.keys(Game.rooms).filter((roomName) => Game.map.getRoomLinearDistance(roomName, targetRoom) <= OBSERVER_RANGE && Game.rooms[roomName][STRUCTURE_OBSERVER]).length > 0) return true;
        if (global.TaskManager.Fetch("default", `SCOUT_${targetRoom}`).length > 0) return true;
        const NEXT_SCOUT_TIMEOUT = CONTROLLER_RESERVE_MAX;
        const NEXT_SCOUT_OFFSET  = Math.floor(CONTROLLER_RESERVE_MAX / 10);
        const roomName = Object.keys(Game.rooms).filter(roomName => Game.map.getRoomStatus(roomName).status === status && isMyRoom(roomName)).sort((u, v) => calcRoomDistance(u, targetRoom) - calcRoomDistance(v, targetRoom))[0];
        if (!roomName) {
            global.Map.SetAsUnreachable(targetRoom, Object.keys(Game.rooms)[0]);
            return false;
        }
        console.log(`<p style="color:gray;display:inline;">[Log]</p> Scouting ${targetRoom} from ${roomName}.`);
        const roleDescriptor = new RoleConstructor();
        roleDescriptor.Register("worker", "creep");
        roleDescriptor
            .set("worker", {key : "static", value : {bodyRequirements : {[MOVE] : 1}}})
            .set("worker", {key : "memoryTag", value : {tagName : "scouter", whetherAllowEmptyTag : false}})
            .set("worker", {key : "profit", value : function (object) { return -Game.map.getRoomLinearDistance(this.taskData.targetRoom, this.taskData.roomName) * 50 * getPrice("cpu"); }})
            .set("worker", {key : "workingTicks", value : () => 0})
            .set("worker", {key : "spawnConstraint", value : {tag : "scoutPatch", mountRoomSpawnOnly : true}})
            .set("worker", {key : "number", value : [1,1]});
        this.Construct({taskName : `[Scout:${roomName}->${targetRoom}]`, taskType : options.default? "default" : "Scout"}, {mountRoomName : roomName, mountObj : {id : null}}, roleDescriptor, {
            funcs : {
                selfCheck : function() {
                    if (this.taskData[ERR_NO_PATH]) {
                        global.Map.SetAsUnreachable(this.taskData.targetRoom, this.taskData.fromRoom);
                        return "dead";
                    }
                    if (Memory.rooms[this.taskData.targetRoom] && Memory.rooms[this.taskData.targetRoom]._lastCheckingTick && Math.abs(Memory.rooms[this.taskData.targetRoom]._lastCheckingTick - Game.time) <= 1) {
                        global.Lucy.Timer.add(Game.time + getCacheExpiration(NEXT_SCOUT_TIMEOUT, NEXT_SCOUT_OFFSET), this.taskData.taskConstructor.ScoutTask, undefined, [this.taskData.targetRoom], `Scout ${this.taskData.targetRoom} because of updating`);
                        return "dead";
                    }
                    return "working";
                },
                run : function() {
                    /** @type {Creep} */
                    const worker = Object.keys(this.employee2role).map(Game.getObjectById)[0];
                    if (!worker) return [];
                    if (!worker.memory.flags) worker.memory.flags = {};
                    if (worker.room.name === this.taskData.targetRoom) return [worker];
                    else {
                        if (worker.travelTo(global.MapMonitorManager.FetchVacantSpace(this.taskData.targetRoom)[0], {forbidInComplete : true}) === ERR_NO_PATH) {
                            this.taskData[ERR_NO_PATH] = true;
                            this.taskData.fromRoom = worker.room.name;
                            return [worker];
                        }
                        return [];
                    }
                }
            },
            taskData : {targetRoom : targetRoom, fromRoom : null, taskConstructor : _taskConstructor, [ERR_NO_PATH] : false, roomName : roomName},
            taskKey : `SCOUT_${targetRoom}`
        });
        return true;
    }
    constructor() {}
}
/**
 * Class Representation for TaskManager
 */
class TaskManager {
    /**
     * @param {string} roomName
     * @param {string} tag
     */
    updateTasks(roomName, tag) {
        if (!this.room2tag2tasks[roomName] || !this.room2tag2tasks[roomName][tag]) return;
        if (!this.room2tag2tasks[roomName][tag]._lastCheckingTick || this.room2tag2tasks[roomName][tag]._lastCheckingTick < Game.time) {
            this.room2tag2tasks[roomName][tag] = _.filter(this.room2tag2tasks[roomName][tag], task => task.State !== "dead");
            this.room2tag2tasks[roomName][tag]._lastCheckingTick = Game.time;
        }
    }
    /**
     * @param {string} id
     * @param {key}
     */
    updateIdTasks(id, key) {
        if (!this.id2key2tasks[id] || !this.id2key2tasks[id][key]) return;
        if (!this.id2key2tasks[id][key]._lastCheckingTick || this.id2key2tasks[id][key]._lastCheckingTick < Game.time) {
            this.id2key2tasks[id][key] = _.filter(this.id2key2tasks[id][key], task => task.State !== "dead");
            this.id2key2tasks[id][key]._lastCheckingTick = Game.time;
        }
    }
    /**
     * @param {string} roomName
     * @param {import("./task.prototype").Task} task
     */
    Register(roomName, task) {
        if (!this.room2tag2tasks[roomName]) this.room2tag2tasks[roomName] = {};
        if (!this.room2tag2tasks[roomName][task.Type]) this.room2tag2tasks[roomName][task.Type] = [];
        this.room2tag2tasks[roomName][task.Type].push(task);
        /** Register into Id Controller */
        if (task.Descriptor.Key) {
            if (task.mountObj) {
                if (!this.id2key2tasks[task.mountObj.id]) this.id2key2tasks[task.mountObj.id] = {};
                if (!this.id2key2tasks[task.mountObj.id][task.Descriptor.Key]) this.id2key2tasks[task.mountObj.id][task.Descriptor.Key] = [];
                this.id2key2tasks[task.mountObj.id][task.Descriptor.Key].push(task);
            } else {
                if (!this.id2key2tasks["default"]) this.id2key2tasks["default"] = {};
                if (!this.id2key2tasks["default"][task.Descriptor.Key]) this.id2key2tasks["default"][task.Descriptor.Key] = [];
                this.id2key2tasks["default"][task.Descriptor.Key].push(task);
            }
        }
    }
    /**
     * @param {string} roomName
     * @param {string} tag
     * @returns {Array<import("./task.prototype").Task>}
     */
    fetchTasks(roomName, tag) {
        this.updateTasks(roomName, tag);
        if (!this.room2tag2tasks[roomName] || !this.room2tag2tasks[roomName][tag]) return [];
        return this.room2tag2tasks[roomName][tag];
    }
    /**
     * @param {string} roomName
     * @returns {Array<string>}
     */
    fetchTags(roomName) {
        if (!this.room2tag2tasks[roomName]) return [];
        return Object.keys(this.room2tag2tasks[roomName]);
    }
    /**
     * Ensure that under the same tag, only a portion of total tasks could be active.
     * NOTICE : Cache is not implemented here, since, in a single tick, state of saturation
     * could change.
     * @param {string} roomName
     * @param {string} tag
     * @returns {boolean}
     */
    IsSaturated(roomName, tag) {
        const tasks = this.fetchTasks(roomName, tag);
        if (tasks.length === 0) return true;
        /**
         * I expect the following property :
         *  - expectedNum should be logorithm-like.
         *  - When # working tasks = 1, expectedNum should be 1.
         *  - When # working tasks = e^2, expectedNum should be 2.
         */
        const expectedNum = Math.floor(Math.log(tasks.length) * 0.5 + 1);
        const workingNum = tasks.filter(task => task.State === "working").length;
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
        this.updateIdTasks(id, key);
        if (!this.id2key2tasks[id] || !this.id2key2tasks[id][key]) return [];
        return this.id2key2tasks[id][key];
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
        /** Subject with physical position */
        if (subject.pos && subject.pos.roomName) {
            /**
             * @type {RoomPosition}
             */
            const pos = subject.pos;
            const roomName = pos.roomName;
            /**
             * @type {Array<string>}
             * NOTICE : Neutral or Hostile rooms are also included in `adjacentRooms`.
             * Thus, as long as the tasks from those rooms are registered, they could be accessed, which allowing for much more flexibility.
             */
            const adjacentRooms = global.Map.Query(roomName);
            /**
             * @type { import("./task.prototype").Task | null}
             */
            let chosen = null;
            for (const roomName of adjacentRooms) {
                /**
                 * @type {Array<import("./task.prototype").Task>}
                 */
                let totalTasks = [];
                for (const tag of this.fetchTags(roomName)) {
                    this.updateTasks(roomName, tag);
                    /* Saturated Tasks are excluded, since there could be much more important tasks in other rooms */
                    if (tag === DEFAULT || !this.IsSaturated(roomName, tag)) totalTasks = totalTasks.concat(this.fetchTasks(roomName, tag).select(o => (-(o.commutingTicks + o.workingTicks) * getPrice("cpu") + o.moneyPerTurn), t => t.Identity(subject)["info"]) || []);
                }
                if (totalTasks.length === 0) continue;
                // console.log(`${subject} -> ${totalTasks.map(t => `${t.mountObj}-${-(t.Identity(subject)["info"].commutingTicks + t.Identity(subject)["info"].workingTicks) * getPrice("cpu") + t.Identity(subject)["info"].moneyPerTurn}`)}`);
                chosen = totalTasks.select(o => (-(o.commutingTicks + o.workingTicks) * getPrice("cpu") + o.moneyPerTurn), t => t.Identity(subject)["info"]);
                break;
            }
            return chosen;
        }
    }
    /**
     * Run all the Tasks
     */
    Run() {
        for (const roomName in this.room2tag2tasks) {
            for (const tag in this.room2tag2tasks[roomName]) {
                // const tagStartTime = Game.cpu.getUsed();
                // const singleTime = [];
                // this.updateTasks is cancelled here.
                // this.updateTasks(roomName, tag);
                /* `waiting` task still could Run. */
                for (const task of this.room2tag2tasks[roomName][tag]) {
                    // const startTime = Game.cpu.getUsed();
                    task.Run();
                    // if (Game.cpu.getUsed() - startTime > 0) singleTime.push({name : task.name, tick : Game.cpu.getUsed() - startTime});
                }
                // console.log(`${roomName}:${tag}:${Game.cpu.getUsed() - tagStartTime}:${JSON.stringify(singleTime)}`);
            }
        }
    }
    constructor() {
        /**
         * @private
         * @type { {[roomName : string] : {[tag : string] : Array<import("./task.prototype").Task>}} }
         */
        this.room2tag2tasks = {};
        /**
         * @private
         * @type { {[id : string] : {[key : string] : Array<import("./task.prototype").Task>}} }
         */
        this.id2key2tasks = {};
    }
};
const _taskManager = new TaskManager();
profiler.registerClass(TaskManager, 'TaskManager');
const _taskConstructor = new TaskConstructor();
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const TaskManagerPlugin = {
    init: () => global.TaskManager = _taskManager,
    tickStart : () => {
        /* Creep */
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
        global.TaskManager.Run();
    }
};
global.Lucy.App.on(TaskManagerPlugin);
module.exports = {
    TaskConstructor : _taskConstructor
};