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
 * Support abstract task-taken objects.
 * @typedef {"static" | "expand" | "shrinkToEnergyAvailable" | "shrinkToEnergyCapacity"} CreepSpawnMode Notice that in "expand" mode, only `tag` will be considered.
 * @typedef { { minimumNumber : number, maximumNumber : number, estimateProfitPerTurn : (object : GameObject) => number, estimateWorkingTicks : (object : GameObject) => number, tag ? : string, groupTag ? : string, allowEmptyTag ? : boolean, allowOtherTags ? : Array<string>} } CommonRoleDescription `tag` is used for hiring specific `creep`. Those creeps with defined tag will not be hired into `role` without tag. `groupTag` is used to control the spawning of creeps.
 * @typedef { { bodyMinimumRequirements : {[body in BodyPartConstant]? : number}, bodyBoostRequirements? : {[body in BodyPartConstant]? : { [compound in ResourceConstant]? : number }}, expandFunction? : (room : Room) => {[body in BodyPartConstant]? : number}, mode? : CreepSpawnMode, confinedInRoom? : boolean, workingPos? : RoomPosition } & CommonRoleDescription } CreepRoleDescription
 * `expandFunction` allows much more flexibility into the setup for bodies of creeps, since it sets up the upper line instead of the bottom line and can adjust the body settings according to instant condition in the room. NOTICE : `move` parts should be specified. Values in `bodyBoostRequirements` are interpreted as ratio between satisfied bodyparts and total bodyparts. Higher level compound is calculated at higher priority, while bodypart with higher level compound is compatible with requirement of lower level compound, if it is not counted.
 * @typedef { { isSatisfied : (object : GameObject) => Boolean} & CommonRoleDescription } ObjectRoleDescription - Exclude Creep
 * @typedef { {[role : string] : CreepRoleDescription | ObjectRoleDescription } } RoleDescription
 */
class TaskDescriptor {
    /**
     * Check whether the setup for bodies of creep satisfies the requirements of `role`.
     * @param {Creep} creep
     * @param {string} role
     * @param {boolean} [loose = false]
     * @private
     * @returns {Boolean}
     */
    isBodySatisfied(creep, role, loose = false) {
        if (!this.roleDescription[role] || !this.roleDescription[role].bodyMinimumRequirements) return false;
        const bodyCounts = _.countBy(creep.body, 'type');
        for (const body in this.roleDescription[role].bodyMinimumRequirements) {
            if (!loose) {
                if (this.roleDescription[role].bodyMinimumRequirements[body] > (bodyCounts[body] || 0)) return false;
            } else {
                if (bodyCounts[body] === undefined) return false;
            }
            /**
             * @TODO
             * Check whether conditions for boosting are satisfied.
             */
        }
        return true;
    }
    /**
     * Check whether `object` is qualified for role.
     * @param {GameObject} object
     * @param {string} role
     * @private
     * @returns {Boolean}
     */
    isRoleQualified(object, role) {
        if (!this.roleDescription[role]) return false;
        if (this.boundTask.FetchEmployees(role).length >= this.roleDescription[role].maximumNumber) return false;
        /* Checking Tags */
        if ((object.memory.tag && !this.roleDescription[role].tag) || (!object.memory.tag && this.roleDescription[role].tag && !this.roleDescription[role].allowEmptyTag)) return false;
        if ((object.memory.tag && this.roleDescription[role].tag) && object.memory.tag !== this.roleDescription[role].tag && (this.roleDescription[role].allowOtherTags || []).indexOf(object.memory.tag) === -1) return false;
        if (isCreep(object)) {
            /**
             * If role is in "shrink*" mode, it is impossible to ensure so-called "minimumRequirement". Thus, in this case, `tag`
             * is the only way to distinguish desired creep from others (while it could be overrided by allowEmptyTag).
             * However, in order to allow more flexibility (duplicate tag corresponds to different roles), basic requirements of bodypart
             * should be satisfied, namely, for each bodypart in minimumRequirement, creep should possess at least one.
             */
            if (this.roleDescription[role].mode && this.roleDescription[role].mode.startsWith("shrink")) {
                if (!this.roleDescription[role].tag) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> For role "${role}" whose mode is "shrink*", the tag of it could not be empty.`);
                    return false;
                }
                if (!((object.memory.tag === undefined && this.roleDescription[role].allowEmptyTag) || object.memory.tag === this.roleDescription[role].tag || (this.roleDescription[role].allowOtherTags || []).indexOf(object.memory.tag) !== -1) || !this.isBodySatisfied(object, role, true)) return false;
            } else if (this.roleDescription[role].mode && this.roleDescription[role].mode === "expand") {
                if (!this.roleDescription[role].tag) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> For role "${role}" whose mode is "expand", the tag of it could not be empty.`);
                    return false;
                }
                if (object.memory.tag === this.roleDescription[role].tag) return true;
                else return false;
            } else {
                // Checking whether `role` is intended to be taken by creep is incorporated in `isBodySatisfied`
                if (!this.isBodySatisfied(object, role)) return false;
            }
        } else {
            if (!this.roleDescription[role].isSatisfied) return false; // Case : `role` not intended to be taken by general object
            if (!this.roleDescription[role].isSatisfied(object)) return false; // Case : `object` not satisfied
        }
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
     * @param { RoleDescription } [roleDescription = {}] `isSatisfied` is not required to implement the checking for tag.
     * @param { {taskKey : string} } [descriptions = {}] If `taskKey` is provided, this kind of tasks will be recorded based on mountObj's id and Key, which in turn will enable amount-checking.
     */
    constructor(type = "default", roleDescription = {}, descriptions = {}) {
        /** @private */
        this.type = type;
        /** @private */
        this.roleDescription = roleDescription;
        /**
         * @type {Task | null}
         * @private
         */
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
        return this.boundTask.FetchEmployees(this.role).length;
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
        /**
         * @private
         */
        this.boundTask = task;
        if (!this.boundTask.Descriptor.RoleDescription[role] || (!this.boundTask.Descriptor.RoleDescription[role].bodyMinimumRequirements && !this.boundTask.Descriptor.RoleDescription[role].expandFunction)) console.log(`<p style="color:red;display:inline;">Fail to create creep descriptor for Role : ${role} of Task : ${task}</p>`);
        /**
         * @private
         */
        this.role = role;
        /**
         * @type {CreepRoleDescription}
         * @private
         */
        this.roleDescription = this.boundTask.Descriptor.RoleDescription[role];
        /**
         * @private
         */
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
 * @typedef { "working" | "waiting" | "dead" } TaskStatus
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
        if (this._isDead) return "dead";
        /* "dead" has a higher priority */
        if (this.selfCheck() === "dead") {
            this._isDead = true;
            return "dead";
        }
        /* Check for whether every role has sufficient employees */
        if (this._numOfEmployees > 0) { // Since lots of tasks are not taken by any objects, this check will speed up the process.
            for (const role in this.descriptor.RoleDescription) if (this.descriptor.RoleDescription[role].minimumNumber > 0 && (!this.roles[role] || !this.roles[role].sufficient)) return "waiting";
            return "working";
        } else return "waiting";
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
            _.remove(this.roles[role], v => v === indicater);
            /* Check whether MinimumAmount of `role` is still satisfied */
            if (this.roles[role].sufficient) {
                if (this.roles[role].length < this.descriptor.RoleDescription[role].minimumNumber) this.roles[role].sufficient = false;
            }
            delete this.employee2role[indicater];
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
        if (!this.roles[role]) this.roles[role] = [];
        this.roles[role].push(indicater);
        /* Check whether MinimumAmount of `role` becomes satisfied */
        if (!this.roles[role].sufficient) {
            if (this.roles[role].length >= this.descriptor.RoleDescription[role].minimumNumber) this.roles[role].sufficient = true;
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
     * @returns { GameObject | null }
     */
    get mountObj() {
        if (!this.mountObjId) return null;
        if (!this._mountObj_s || this._mountObj_s < Game.time) {
            this._mountObj_s = Game.time;
            return this._mountObj = Game.getObjectById(this.mountObjId);
        } else return this._mountObj;
    }
    get mountRoomName() {
        return this._mountRoomName;
    }
    /**
     * Returned Values should be valid.
     * @param {string} role
     * @returns {Array<Id<Creep>>}
     */
    FetchEmployees(role) {
        if (!this.roles[role]) return [];
        return this.roles[role];
    }
    /**
     * @param { string } name
     * @param { string } mountRoomName
     * @param { GameObject } mountObj
     * @param { TaskDescriptor } descriptor
     * @param { {selfCheck: () => "working" | "dead", run: import("./task.modules").Project | () => Array<GameObject>, calcCommutingTicks? : (obj : GameObject) => number } } [funcs] calcCommutingTicks will only be used when !`mountObj` or !`mountObj.pos` or !`obj` or `obj.pos`
     * @param { {} } data
     */
    constructor(name, mountRoomName, mountObj, descriptor, funcs, data = {}) {
        _.defaults(funcs, {
            selfCheck: () => "dead",
            run : () => [],
            calcCommutingTicks: () => Infinity
        });
        if (typeof funcs.run === "function") funcs.run = profiler.registerFN(funcs.run, name);
        /**
         * @private
         * Double-Bind
         */
        this.descriptor = descriptor;
        this.descriptor.BindTask(this);
        /**
         * @private
         */
        this._mountRoomName = mountRoomName;
        /**
         * @private
         */
        this._numOfEmployees = 0;
        /**
         * @type { {[indicater: string]: string} }
         * @private
         */
        this.employee2role = {};
        /**
         * @type { {[role: string]: Array<string>} }
         * @private
         */
        this.roles = {};
        /**
         * @private
         * @type { string | null }
         */
        this.mountObjId = (mountObj && mountObj.id) || null;
        /**
         * @type { () => "working" | "dead" }
         * @private
         * Original `selfCheck` with adjusted `this`.
         */
        this._selfCheck = funcs.selfCheck.bind(this);
        /**
         * @type {{[id : string] : import("./money.prototype").Transaction}}
         * Record all involved transactions
         */
        this.transactions = {};
        /**
         * @private
         */
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
            if (!this.mountObj || !this.mountObj.pos || !obj || !obj.pos) return funcs.calcCommutingTicks.call(this, obj);
            /**
             * @type {RoomPosition}
             */
            const mountPos = this.mountObj.pos;
            /**
             * @type {RoomPosition}
             */
            const objPos = obj.pos;
            if (mountPos.roomName === objPos.roomName) return calcInRoomDistance(mountPos, objPos, mountPos.roomName);
            else return calcRoomDistance(mountPos, objPos);
        }.bind(this);
        /**
         * @type { (obj: GameObject) => EmployeeIdentity }
         * @private
         * `allocRoleFunc` also take the responsibility of checking whether `obj` is qualified.
         * `allocRoleFunc` uses just-in-tick cache to speed up.
         */
        this.allocRoleFunc = function(obj) {
            if (!this._allocRoleFuncCacheTick || this._allocRoleFuncCacheTick < Game.time) {
                this._allocRoleFuncCacheTick = Game.time;
                this._allocRoleFuncCache = {};
            }
            if (this._allocRoleFuncCache[obj.id]) return this._allocRoleFuncCache[obj.id];
            let ret = this.descriptor.DetermineBestRole(obj);
            if (!ret["role"]) ret["info"] = null;
            else ret["info"]["commutingTicks"] = this._calcCommutingTicks(obj);
            return this._allocRoleFuncCache[obj.id] = ret;
        }.bind(this);
        if (typeof funcs.run === "function") this._run = funcs.run.bind(this);
        else this._run = funcs.run;
        /**
         * @type { () => Array<GameObject> }
         * @private
         * `run` will check whether the State is `dead`.
         */
        this.run = function() {
            if (this.State === "dead") return [];
            if (typeof this._run === "function") return this._run();
            /**
             * @type {import("./task.modules").Project}
             */
            const project = this._run;
            /**
             * @type {Array<GameObject>}
             */
            const firedEmployees = [];
            for (const id in this.employee2role) {
                /**
                 * @type {GameObject}
                 */
                const object = Game.getObjectById(id);
                if (!object) console.log(`<p style="display:inline;color:red;">Error: </p>${id} in Task is invalid!`);
                const ret = project.Run(object, this);
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
        global.TaskManager.Register(this.mountRoomName, this);
    }
}

profiler.registerClass(Task, "Task");
profiler.registerClass(TaskDescriptor, "TaskDescriptor");
profiler.registerClass(TaskCreepDescriptor, "TaskCreepDescriptor");
function mount() {
    Object.defineProperty(Object.prototype, "task", {
        configurable : false,
        enumerable : false,
        /**
         * `task` should refresh automatically if it becomes invalid or finished.
         * `task` is also the only interface to manipulate object's task status.
         */
        get() {
            if (!this.id) console.log(`<p style="color:red;display:inline;">Cannot get "task" to object ${this}, who loses "id" property!</p>`);
            return Game.getTaskById(this.id);
        },
        set(_task) {
            if (!this.id) console.log(`<p style="color:red;display:inline;">Cannot set "task" to object ${this}, who loses "id" property!</p>`);
            if (_task === null || _task.State !== "dead") {
                CleanTaskById(this.id);
                tasks[this.id] = _task;
                if (_task !== null) {
                    _task.Employ(this);
                    Lucy.Logs.Push(new EventTaskOfObjectStatusChange("take", tasks[this.id], {obj: this}));
                }
            }
        }
    });
}
global.Lucy.App.mount(mount);
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const TaskPlugin = {
    beforeTickStart : () => {
        /**
         * @template T
         * @param {Id<T>} id property of GameObject
         * Task doesn't have id.
         */
        Game.getTaskById = function(id) {
            // If State == "dead", `id` will automatically be fired and events will be issued appropriately.
            if (tasks[id]) tasks[id].State;
            return tasks[id] || null;
        }
        Game.cleanTaskById = function(id) {
            // If State == "dead", `id` will automatically be fired and events will be issued appropriately.
            if (tasks[id]) tasks[id].State;
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