/** 
 * @module task
 * 
 * @typedef { {id: string, memory : {}, pos : RoomPosition, store? : Store<StoreDefinitionUnlimited, true> | Store<StoreDefinition, false> } } GameObject
 * @typedef { {pos : RoomPosition} } HasPositionObject
 * @typedef {Task} Task
 * @typedef {TaskDescriptor} TaskDescriptor
 * @typedef {TaskCreepDescriptor} TaskCreepDescriptor
 */
const EventTaskOfObjectStatusChange = require("./lucy.log").EventTaskOfObjectStatusChange;
const EventTaskStatusChange         = require("./lucy.log").EventTaskStatusChange;
const getPrice                      = require('./util').getPrice;
const calcRoomDistance              = require('./util').calcRoomDistance;
const calcInRoomDistance            = require('./util').calcInRoomDistance;
const isCreep                       = require('./util').isCreep;
const isStructure                   = require('./util').isStructure;
const isConstructionSite            = require('./util').isConstructionSite;
const calcBoost                     = require("./util").calcBoost;
const Project                       = require("./task.modules").Project;
const profiler = require("./screeps-profiler");
/**
 * @type { {[id : string] : Task} }
 */
const tasks         = {};
/**
 * @template T
 * @param {Id<T>} id
 */
function CleanTaskById(id) {
    if (tasks[id]) {
        const object = Game.getObjectById(id);
        if (object) {
            // NOTICE: `HotPush` here despite potential reemployment. Thus, `recheck` is absolutely necessary.
            Lucy.Logs.HotPush(new EventTaskOfObjectStatusChange("fired", tasks[id], {obj: object}));
            /* State indicators in Memory are flushed here. */
            object.memory.flags = {};
        }
        tasks[id].Fire(id);
        delete tasks[id];
    }
}
/**
 * Class representing a Descriptor for Task.
 * @typedef {"creep" | "common"} RoleType
 * @typedef {{[body in BodyPartConstant]? : {boostCompound : MineralBoostConstant, ratio : number, mode : "stubborn" | "once"}[] }} BoostRequirements
 * Support abstract task-taken objects.
 * @typedef {"static" | "expand" | "shrinkToEnergyAvailable" | "shrinkToEnergyCapacity"} CreepSpawnMode Notice that in "expand" mode, only `tag` will be considered.
 * @typedef { { minimumNumber : number, maximumNumber : number, estimateProfitPerTurn : (object : GameObject) => number, estimateWorkingTicks : (object : GameObject) => number, tag : string, groupTag ? : string, allowEmptyTag ? : boolean, allowOtherTags ? : Array<string>} } CommonRoleDescription `tag` is used for hiring specific `creep`. Those creeps with defined tag will not be hired into `role` without tag. `groupTag` is used to control the spawning of creeps.
 * @typedef { { bodyMinimumRequirements : {[body in BodyPartConstant]? : number}, bodyBoostRequirements? : BoostRequirements, expandFunction? : (room : Room) => {[body in BodyPartConstant]? : number}, mode? : CreepSpawnMode, confinedInRoom? : boolean, workingPos? : RoomPosition} & CommonRoleDescription } CreepRoleDescription
 * `expandFunction` allows much more flexibility into the setup for bodies of creeps, since it sets up the upper line instead of the bottom line and can adjust the body settings according to instant condition in the room. NOTICE : `move` parts should be specified. Values in `bodyBoostRequirements` are interpreted as ratio between satisfied bodyparts and total bodyparts. Higher level compound is calculated at higher priority, while bodypart with higher level compound is compatible with requirement of lower level compound, if it is not counted.
 * @typedef { {[role : string] : CreepRoleDescription | CommonRoleDescription } } RoleDescription
 */
class TaskDescriptor {
    /**
     * Check whether `object` is qualified for role.
     * @param {GameObject} object
     * @param {string} role
     * @private
     * @returns {Boolean}
     */
    isRoleQualified(object, role) {
        if (this.boundTask.FetchEmployeeLength(role) >= this.roleDescription[role].maximumNumber) return false;
        /* Checking Tags */
        if (object.memory.tag !== this.roleDescription[role].tag && (this.roleDescription[role].allowOtherTags || []).indexOf(object.memory.tag) === -1) return false;
        return true;
    }
    /**
     * @param {GameObject} object
     * @returns { {role : string | null, info : {moneyPerTurn : number, workingTicks : number} }}
     */
    DetermineBestRole(object) {
        let ret = { role : null, info : {"moneyPerTurn" : 0, "workingTicks" : Infinity} };
        let maximumProfit = null;
        for (const role in this.roleDescription) {
            if (!this.isRoleQualified(object, role)) continue;
            const profit = this.roleDescription[role].estimateProfitPerTurn(object);
            if (maximumProfit === null || profit > maximumProfit) {
                maximumProfit = profit;
                ret.role = role;
                ret.info.moneyPerTurn = profit;
                ret.info.workingTicks = Infinity; // The computation for `workingTicks` is delayed.
            }
        }
        if (ret.role) ret.info.workingTicks = this.roleDescription[ret.role].estimateWorkingTicks(object);
        return ret;
    }
    get RoleDescription() {
        return this.roleDescription;
    }
    get Type() {
        return this.type;
    }
    /** @returns {string | null} */
    get Key() {
        return this.descriptions.taskKey || null;
    }
    /**
     * Must be called before usage.
     * @param {Task} task
     */
    BindTask(task) {
        this.boundTask = task;
        /* Bind Function's this to Task */
        for (const role in this.roleDescription) {
            for (const key in this.roleDescription[role]) {
                if (typeof this.roleDescription[role][key] === "function") this.roleDescription[role][key] = this.roleDescription[role][key].bind(this.boundTask);
            }
        }
    }
    /**
     * @param { string } [type = "default"] identifier for Task Type
     * @param { RoleDescription } [roleDescription = {}]
     * @param { {taskKey : string} } [descriptions = {}] If `taskKey` is provided, this kind of tasks will be recorded based on mountObj's id and Key, which in turn will enable amount-checking.
     */
    constructor(type = "default", roleDescription = {}, descriptions = {}) {
        /** @private */
        this.type = type;
        /** @private */
        this.roleDescription = roleDescription;
        /** @type {Task | null} @private */
        this.boundTask = null;
        /** @private */
        this.descriptions = descriptions;
    }
}
/**
 * Class Representation for Descriptor of Task
 * @interface
 */
class TaskCreepDescriptor {
    get BodyRequirements() {
        return this.roleDescription.bodyMinimumRequirements;
    }
    get MinimumAmount() {
        return this.roleDescription.minimumNumber;
    }
    get MaximumAmount() {
        return this.roleDescription.maximumNumber;
    }
    get CurrentAmount() {
        return this.boundTask.FetchEmployeeLength(this.role);
    }
    get IsFunctioning() {
        if (!this.boundTask || this.boundTask.State === "dead") return false;
        return true;
    }
    get Tag() {
        return this.roleDescription.tag;
    }
    get GroupTag() {
        return this.groupTag;
    }
    get ExpandFunction() {
        return this.roleDescription.expandFunction;
    }
    get Mode() {
        return this.roleDescription.mode || "static";
    }
    get IsConfinedInRoom() {
        if (typeof this.roleDescription.confinedInRoom === "boolean") return this.roleDescription.confinedInRoom;
        else return true;
    }
    get WorkingPos() {
        return this.roleDescription.workingPos;
    }
    /**
     * @param {Task} task
     * @param {string} role
     * @param {string | undefined} groupTag
     */
    constructor(task, role, groupTag) {
        /** @private */
        this.boundTask = task;
        if (!this.boundTask.Descriptor.RoleDescription[role] || (!this.boundTask.Descriptor.RoleDescription[role].bodyMinimumRequirements && !this.boundTask.Descriptor.RoleDescription[role].expandFunction)) console.log(`<p style="color:red;display:inline;">Fail to create creep descriptor for Role : ${role} of Task : ${task}</p>`);
        /** @private */
        this.role = role;
        /** @type {CreepRoleDescription} @private */
        this.roleDescription = this.boundTask.Descriptor.RoleDescription[role];
        /** @private */
        this.groupTag = groupTag;
    }
}
/** 
 * Class representing a Task.
 * In order to describe a task, generally, we need to know whether this task could
 * be taken by more objects, whether specific object is qualified for taking this task
 * and how they work.
 * From the perspective of object, we need to know how much profit it can bring, how much
 * cost it requires.
 * 
 * Task needs to delete those died creeps and finish those transactions.
 * 
 * @typedef { ("working" | "waiting" | "dead") } TaskStatus
 * @typedef { {commutingTicks: number, workingTicks: number, moneyPerTurn: number} } ProfitInfo
 * @typedef { {"role" : string | null, info : ProfitInfo} } EmployeeIdentity
 */
class Task {
    /**
     * @returns {TaskStatus} - describe the status of task
     * `working`: running normally. `Run` is called, and it will affect the taking of other same type tasks.
     * `waiting`: running insufficiently. `Run` still is called, but it will not affect the taking of other same tasks.
     * `dead`   : invalid or finished.
     * NOTICE : Multiply Calling at one moment, in which `State` becomes "dead" and takes action to issue scheduled new task, could potentially lead to duplicate new tasks. Thus, `dead` state needs to be cached.
     */
    get State() {
        /* "dead" state is cached so that duplicate triggered tasks are checked. */
        if (this._status === "dead") return "dead";
        /* "dead" has a higher priority */
        if (this.selfCheck() === "dead") this._status = "dead";
        return this._status;
    }
    get EmployeeAmount() {
        return this._numOfEmployees;
    }
    get Descriptor() {
        return this.descriptor;
    }
    get Type() {
        return this.descriptor.Type;
    }
    /**
     * `Fire` will not change `obj.task`.
     * @param { GameObject | string } obj
     * @returns {boolean}
     */
    Fire(obj) {
        const indicater = (typeof obj === "string") ? obj : obj.id;
        if (indicater in this.employee2role) {
            const role = this.employee2role[indicater];
            Lucy.Logs.Push(new EventTaskStatusChange("fire", this, {employer: this.mountObj, role: role}));
            _.remove(this.role2creepIds[role], v => v === indicater);
            _.remove(this.role2length[role], v => v === indicater);
            /* Check whether MinimumAmount of `role` is still satisfied */
            if (this.sufficientRoles.indexOf(role) !== -1) {
                if (this.role2length[role].length < this.descriptor.RoleDescription[role].minimumNumber) {
                    this.sufficientRoles.splice(this.sufficientRoles.indexOf(role), 1);
                    global.TaskManager.Switch(this.index, "waiting");
                    this._status = "waiting";
                }
            }
            delete this.employee2role[indicater];
            delete this.employee2boost[indicater];
            --this._numOfEmployees;
            if (this.transactions[indicater]) {
                this.transactions[indicater].Done();
                this.transactions[indicater] = undefined;
            }
            return true;
        }
        return false;
    }
    /**
     * `Employ` will not change `obj.task`.
     * @param { GameObject } obj
     * @returns {boolean}
     */
    Employ(obj) {
        const indicater = obj.id;
        if (indicater in this.employee2role) return false;
        /* When an object takes `Task`, its id is written into memory, so that when it died, its remained data could be cleaned. */
        obj.memory.id = obj.id;
        const role = this.allocRoleFunc(obj)["role"];
        Lucy.Logs.Push(new EventTaskStatusChange("employ", this, { employer: this.mountObj, role: role }));
        this.employee2role[indicater] = role;
        this.employee2boost[indicater] = {};
        if (this.Descriptor.RoleDescription[role].bodyBoostRequirements) Object.keys(this.Descriptor.RoleDescription[role].bodyBoostRequirements).forEach(body => this.Descriptor.RoleDescription[role].bodyBoostRequirements[body].forEach(description => this.employee2boost[indicater][description.boostCompound] = {completed : false, targetLabId : null}));
        if (!this.role2creepIds[role]) this.role2creepIds[role] = [];
        if (!this.role2length[role]) this.role2length[role] = [];
        this.role2creepIds[role].push(indicater);
        this.role2length[role].push(indicater);
        /** @memory refresh `temporaryFlags` */
        obj.memory.temporaryFlags = {};
        /* Check whether MinimumAmount of `role` becomes satisfied */
        if (this.sufficientRoles.indexOf(role) === -1) {
            if (this.role2length[role].length >= this.descriptor.RoleDescription[role].minimumNumber) {
                this.sufficientRoles.push(role);
                if (this.sufficientRoles.length === this.roles.length) {
                    // Switch to Working State
                    global.TaskManager.Switch(this.index, "working");
                    this._status = "working";
                }
            }
        }
        ++this._numOfEmployees;
        return true;
    }
    /**
     * Give the Information about `Identity`, if `obj` takes this task.
     * @param {GameObject} obj
     * @returns {EmployeeIdentity}
     */
    Identity(obj) {
        return this.allocRoleFunc(obj);
    }
    /**
     * Run the Task.
     */
    Run() {
        if (this.EmployeeAmount === 0) return;
        /**
         * Notice: The returns array of `this.run` contains `employees`, which should be fired that could be the result of task-finish or complete-one-cycle.
         */
        const firedEmployees = this.run();
        for (const employee of firedEmployees) employee.task = null;
        /* Display */
        if (this.mountObj && this.mountObj.pos) {
            const roomName = this.mountObj.pos.roomName;
            for (const employeeId in this.employee2role) {
                const employee = Game.getObjectById(employeeId);
                if (!employee.pos || employee.pos.roomName !== roomName) continue;
                new RoomVisual(roomName).line(this.mountObj.pos, employee.pos, {color : "green"});
            }
            for (const firedEmployee of firedEmployees) {
                if (!firedEmployee.pos || firedEmployee.pos.roomName !== roomName) continue;
                new RoomVisual(roomName).line(this.mountObj.pos, firedEmployee.pos, {color : "red"});
            }
        }
    }
    /**
     * @param {Creep} creep
     * @returns {boolean}
     */
    Boost(creep) {
        const role = this.employee2role[creep.id]; // => Creep must satisfy the requirements of `role`.
        if (!this.Descriptor.RoleDescription[role].bodyBoostRequirements) return true;
        /** @type {BoostRequirements} */
        const boostRequirements = this.Descriptor.RoleDescription[role].bodyBoostRequirements;
        if (this.employee2boost[creep.id].total) return true;
        const boostCounts = calcBoost(creep);
        for (const body in boostRequirements) {
            for (const des of boostRequirements[body]) {
                if (this.employee2boost[creep.id][des.boostCompound].completed) continue;
                const boostedAmount = boostCounts[body].filter(m => m === des.boostCompound).length, totalAmount = boostCounts[body].length, expectedAmount = Math.round(totalAmount * des.ratio);
                /**
                 * Completion Test
                 */
                if (boostedAmount >= expectedAmount || (boostedAmount > 0 && des.mode === "once")) {
                    this.employee2boost[creep.id][des.boostCompound].completed = true;
                    global.LabManager.Release(creep);
                    continue;
                }
                /**
                 * Fetch Target Lab
                 */
                if (!this.employee2boost[creep.id][des.boostCompound].targetLabId) {
                    this.employee2boost[creep.id][des.boostCompound].targetLabId = global.LabManager.Reserve(des.boostCompound, creep);
                    if (!this.employee2boost[creep.id][des.boostCompound].targetLabId) {
                        if (des.mode === 'once') {
                            this.employee2boost[creep.id][des.boostCompound].completed = true;
                            continue;
                        }
                        // Ensure Amount
                        global.ResourceManager.Query(creep, des.boostCompound, Math.ceil(totalAmount * des.ratio), {type : "retrieve"});
                        return false;
                    }
                }
                /**
                 * Boost Process
                 */
                const lab = Game.getObjectById(this.employee2boost[creep.id][des.boostCompound].targetLabId);
                if ((lab.mineralType !== des.boostCompound && !global.LabManager.Fill(creep, "compound") && des.mode === "once") || (lab.store[RESOURCE_ENERGY] === 0 && !global.LabManager.Fill(creep, "energy") && des.mode === "once")) {
                    this.employee2boost[creep.id][des.boostCompound].completed = true;
                    global.LabManager.Release(creep);
                    continue;
                }
                // Could be in the process of transfering (filling / emptying).
                if (lab.mineralType === des.boostCompound && lab.boostCreep(creep, expectedAmount - boostedAmount) === ERR_NOT_IN_RANGE) creep.travelTo(lab);
                return false;
            }
        }
        return this.employee2boost[creep.id].total = true;
    }
    /**
     * @returns { GameObject | null }
     */
    get mountObj() {
        if (!this.mountObjId) return null;
        if (!this._mountObj_s || this._mountObj_s < Game.time) {
            this._mountObj_s = Game.time;
            return this._mountObj = Game.getObjectById(this.mountObjId);
        } else return this._mountObj;
    }
    /**
     * Notice : This function considers the effect of `boosting`.
     * @param {string} role
     * @returns {Array<Creep>}
     */
    FetchEmployees(role) {
        if (!this[`_employees_${role}_tick`] || this[`_employees_${role}_tick`] < Game.time) {
            if (!this.role2creepIds[role]) return this[`_employees_${role}`] = [];
            return this[`_employees_${role}`] = this.role2creepIds[role].map(Game.getObjectById).filter(c => !c.spawning && this.Boost(c)); 
        } else return this[`_employees_${role}`];
    }
    /**
     * Notice : This function considers the effect of `replacement`.
     * @param {string} role
     * @returns {number}
     */
    FetchEmployeeLength(role) {
        if (!this.role2length[role]) return 0;
        return this.role2length[role].length;
    }
    /**
     * Implement `Seamless Succession`.
     * @danger `Replacement` is prone to Global Reset. The signal indicating whether `replacement` has been issued should be carefully
     * dealt with no matter it is mounted on the Memory but Global.
     * @param {Creep} creep
     */
    SignalReplacement(creep) {
        const role = this.employee2role[creep.id];
        if (!role) return;
        const index = this.role2length[role].indexOf(creep.id);
        if (index === -1) return;
        this.role2length[role].splice(index, 1);
        /* Check whether MinimumAmount of `role` is still satisfied */
        if (this.sufficientRoles.indexOf(role) !== -1) {
            if (this.role2length[role].length < this.descriptor.RoleDescription[role].minimumNumber) {
                this.sufficientRoles.splice(this.sufficientRoles.indexOf(role), 1);
                global.TaskManager.Switch(this.index, "waiting");
                this._status = "waiting";
            }
        }
    }
    /**
     * @template T
     * @param { string } name
     * @param { string } mountRoomName
     * @param { GameObject } mountObj
     * @param { TaskDescriptor } descriptor
     * @param { {selfCheck: () => "working" | "dead", run: import("./task.modules").Project | {[role : string] : import("./task.modules").Project} | () => Array<GameObject> } } [funcs]
     * @param { T } data
     */
    constructor(name, mountRoomName, mountObj, descriptor, funcs, data = {}) {
        _.defaults(funcs, {
            selfCheck: () => "dead",
            run : () => []
        });
        if (typeof funcs.run === "function") funcs.run = profiler.registerFN(funcs.run, name);
        this.name = name;
        this.descriptor = descriptor;
        this.descriptor.BindTask(this);
        /** @type { Array<string> } */
        this.spawnTags = Object.values(this.descriptor.RoleDescription).map(c => c.tag || "");
        /** @type { Array<string> } @private */
        this.sufficientRoles = [];
        /** @type { Array<string> } */
        this.roles = Object.keys(this.descriptor.RoleDescription);
        this.mountRoomName = mountRoomName;
        /** @type {TaskStatus} */
        this._status = "waiting";
        /** @private */
        this._numOfEmployees = 0;
        /** @type { {[indicater: string]: string} } @private */
        this.employee2role = {};
        /** @type { {[indicater : string] : {[mineralType : string] : {completed : boolean, targetLabId : Id<StructureLab>}, total : boolean}} } @private */
        this.employee2boost = {};
        /** @type { {[role: string]: Array<Id<Creep>>} } @private */
        this.role2creepIds = {};
        /** @type { {[role : string] : Array<Id<Creep>>} } @private */
        this.role2length   = {};
        /** @type { string | null } @private*/
        this.mountObjId = (mountObj && mountObj.id) || null;
        /** @type { () => "working" | "dead" } @private */
        this._selfCheck = funcs.selfCheck.bind(this);
        /** @type {{[id : string] : import("./money.prototype").Transaction}} */
        this.transactions = {};
        this.taskData = data;
        /**
         * @type { () => "working" | "dead" }
         * @private
         * Add the function to release all workers if this task is `dead` here.
         * NOTICE that except for this.selfCheck, ids stored in this.employee2role should be trusted to be valid.
         */
        this.selfCheck = function() {
            const ret = this._selfCheck();
            if (ret === "dead") {
                for (const id in this.employee2role) CleanTaskById(id);
            }
            return ret;
        }.bind(this);
        /**
         * @type {(obj : GameObject) => number}
         */
        this._calcCommutingTicks = function (obj) {
            if (!this.mountObj) return obj.pos.roomName === this.mountRoomName ? Math.min(Math.abs(obj.pos.x - 25), Math.abs(obj.pos.y - 25)) : calcRoomDistance(obj.pos.roomName, this.mountRoomName) * 50;
            /** @type {RoomPosition} */
            const mountPos = this.mountObj.pos;
            /** @type {RoomPosition} */
            const objPos = obj.pos;
            if (mountPos.roomName === objPos.roomName) return calcInRoomDistance(mountPos, objPos, mountPos.roomName);
            else return calcRoomDistance(mountPos, objPos) * 50;
        }.bind(this);
        /**
         * @type { (obj: GameObject) => EmployeeIdentity }
         * @private
         * `allocRoleFunc` also take the responsibility of checking whether `obj` is qualified.
         * `allocRoleFunc` uses just-in-tick cache to speed up.
         */
        this.allocRoleFunc = function(obj) {
            const key = `_allocRoleFunc_${obj.id}`;
            if (!this[key + "_tick"] || this[key + "_tick"] < Game.time) {
                this[key + "_tick"] = Game.time;
                const ret = this.descriptor.DetermineBestRole(obj);
                if (ret["role"]) ret["info"]["commutingTicks"] = this._calcCommutingTicks(obj);
                else ret["info"] = null;
                return this[key] = ret;
            } else return this[key];
        }.bind(this);
        if (typeof funcs.run === "function") this._run = funcs.run.bind(this);
        else this._run = funcs.run;
        /**
         * @type { () => Array<GameObject> }
         * @private
         * `run` will check whether the State is `dead`.
         */
        this.run = function() {
            if (typeof this._run === "function") return this._run();
            /** @type {import("./task.modules").Project | {[role : string] : import("./task.modules").Project} */
            const project = this._run;
            /** @type {Array<GameObject>} */
            const firedEmployees = [];
            for (const id in this.employee2role) {
                /** @type {GameObject} */
                const object = Game.getObjectById(id);
                if (!object) console.log(`<p style="display:inline;color:red;">Error: </p>${id} in Task is invalid!`);
                if (!this.Boost(object)) continue;
                const ret = project instanceof Project ? project.Run(object, this) : project[this.employee2role[id]].Run(object, this);
                if (ret) firedEmployees.push(object);
            }
            return firedEmployees;
        }.bind(this);
        /**
         * Register needs of employees, especially for creeps, into the Central Creep Manager
         * Notice that needs should be bound with the State, so that whenever State becomes `dead`, the needs are invalid.
         */
        for (const role in this.descriptor.RoleDescription) {
            /* Creep Role */
            if (this.descriptor.RoleDescription[role].bodyMinimumRequirements || this.descriptor.RoleDescription[role].expandFunction) {
                global.CreepSpawnManager.Register({creepDescriptor : new TaskCreepDescriptor(this, role, this.descriptor.RoleDescription[role].groupTag), roomName : this.mountRoomName});
            }
            /**
             * @TODO
             * Needs for roles of other objects
             */
        }
        /**
         * Register this into global.TaskManager
         */
        this.index = global.TaskManager.Register(this.mountRoomName, this);
    }
}

profiler.registerClass(Task, "Task");
profiler.registerClass(TaskDescriptor, "TaskDescriptor");
profiler.registerClass(TaskCreepDescriptor, "TaskCreepDescriptor");

let _mounted = false;
function mount() {
    if (_mounted) return;
    _mounted = true;
    Object.defineProperty(Object.prototype, "task", {
        configurable : false,
        enumerable : false,
        /**
         * `task` should refresh automatically if it becomes invalid or finished.
         * `task` is also the only interface to manipulate object's task status.
         */
        get() {
            return Game.getTaskById(this.id);
        },
        set(_task) {
            CleanTaskById(this.id);
            tasks[this.id] = _task;
            if (_task !== null) {
                _task.Employ(this);
                Lucy.Logs.Push(new EventTaskOfObjectStatusChange("take", tasks[this.id], {obj: this}));
            }
        }
    });
}
global.Lucy.App.mount(mount);
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const TaskPlugin = {
    resetEveryTick : () => {
        /**
         * @template T
         * @param {Id<T>} id property of GameObject
         * Task doesn't have id.
         */
        Game.getTaskById = function(id) {
            return tasks[id] || null;
        }
        Game.cleanTaskById = function(id) {
            // If task still exists, clean it by hand.
            if (tasks[id]) CleanTaskById(id);
        }
    }
};
global.Lucy.App.on(TaskPlugin);
module.exports = {
    Task                : Task,
    TaskDescriptor      : TaskDescriptor,
    TaskCreepDescriptor : TaskCreepDescriptor
};