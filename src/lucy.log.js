/** 
 * @module lucy/log
 * 
 * @typedef {EventTaskOfObjectStatusChange} EventTaskOfObjectStatusChange
 * @typedef {EventTaskStatusChange} EventTaskStatusChange
 * @typedef {EventMoneyIn} EventMoneyIn
 * @typedef {EventMoneyOut} EventMoneyOut
 * @typedef {EventObjectConstruct} EventObjectConstruct
 * @typedef {EventObjectDestroy} EventObjectDestroy
 * @typedef {Event} Event
 * @typedef {LogPool} LogPool
 */

/** 
 * Declaration of all possible types of event
 * @enum {string}
 */
const EVENT_TYPES = Object.freeze({
    /** Task System */
    TASK_STATUS_CHANGE              : "task-status-change",
    TASK_OF_OBJECT_STATUS_CHANGE    : "task-of-object-status-change",

    /** Money System */
    MONEY_IN                        : "money-in",
    MONEY_OUT                       : "money-out",

    /** Object Event */
    OBJECT_CONSTRUCT                : "object-construct",
    OBJECT_DESTROY                  : "object-destroy"
});
/** @abstract - Class representation for event */
class Event {
    /**
     * @param {EVENT_TYPES} type
     */
    constructor(type) {
        /**
         * @private
         */
        this.type = type;
    }
    /**
     * @returns {EVENT_TYPES}
     */
    get Type() {
        return this.type;
    }
}
/** @abstract - Class representation for event relating to `Object` */
class EventObject extends Event {
    /**
     * @param {EVENT_TYPES} type
     * @param {RoomPosition} pos
     * @param {StructureConstant} structureType
     * @param {"ConstructionSite" | "Structure"} objectType
     */
    constructor(type, pos, structureType, objectType) {
        super(type);
        /**
         * @private
         */
        this.pos = pos;
        this.structureType = structureType;
        this.objectType = objectType;
    }
    get Pos() {
        return this.pos;
    }
    get StructureType() {
        return this.structureType;
    }
    get ObjectType() {
        return this.objectType;
    }
};
class EventObjectConstruct extends EventObject {
    /**
     * @param {RoomPosition} pos
     * @param {StructureConstant} structureType
     * @param {"ConstructionSite" | "Structure"} type
     */
    constructor(pos, structureType, type) {
        super(EVENT_TYPES.OBJECT_CONSTRUCT, pos, structureType, type);
        if (type === "Structure") {
            global.Lucy.Timer.add(Game.time + 1, function () {
                global.signals.IsNewStructure[this.Pos.roomName] = true;
                global.signals.IsAnyNewStructure = true;
            }, this, [], "Signal some Construction completes.");
        } else if (type === "ConstructionSite") {
            global.Lucy.Timer.add(Game.time + 1, function () {
                global.signals.IsNewConstructionSite[this.Pos.roomName] = true;
                global.signals.IsAnyNewConstructionSite = true;
            }, this, [], "Signal some ConstructionSite creates.");
        }
    }
};
class EventObjectDestroy extends EventObject {
    /**
     * @param {RoomPosition} pos
     * @param {StructureConstant} structureType
     * @param {"ConstructionSite" | "Structure"} type
     */
    constructor(pos, structureType, type) {
        super(EVENT_TYPES.OBJECT_CONSTRUCT, pos, structureType, type);
        if (type === "Structure") {
            global.Lucy.Timer.add(Game.time + 1, function () {
                global.signals.IsStructureDestroy[this.Pos.roomName] = true;
                global.signals.IsAnyStructureDestroy = true;
            }, this, [], "Signal some Construction destroies.");
        } else if (type === "ConstructionSite") {
            global.Lucy.Timer.add(Game.time + 1, function () {
                global.signals.IsConstructionSiteCancel[this.Pos.roomName] = true;
                global.signals.IsAnyConstructionSiteCancel = true;
            }, this, [], "Signal some ConstructionSite cancels.");
        }
    }
};
/** @abstract - Class representation for event relating to `Money` */
class EventMoney extends Event {
    /**
     * @param {EVENT_TYPES} type
     * @param {import("./task.prototype").GameObject} objectSelf
     * @param {number} absNum - absNum > 0
     * @param {import("./money.prototype").MoneyType | "combined"} moneyType
     */
    constructor(type, objectSelf, absNum, moneyType) {
        super(type);
        /**
         * @private
         */
        this.objectSelfId = objectSelf.id;
        /**
         * @private
         */
        this.absNum = absNum;
        /**
         * @private
         */
        this.moneyType = moneyType;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Obj() {
        if (!this._objectSelf_s || this._objectSelf_s < Game.time) {
            this._objectSelf_s = Game.time;
            return this._objectSelf = Game.getObjectById(this.objectSelfId);
        } else return this._objectSelf;
    }
    /**
     * @returns {number}
     */
    get Num() {
        return this.absNum;
    }
    /**
     * @returns {import("./money.prototype").MoneyType}
     */
    get MoneyType() {
        return this.moneyType;
    }
}
/**
 * Class representation for special case of `event`: Money In.
 * @extends EventMoney
 */
class EventMoneyIn extends EventMoney {
    /**
     * @param {import("./task.prototype").GameObject} objectSelf
     * @param { {absNum: number, giver: import("./task.prototype").GameObject} } properties
     * @param { import("./money.prototype").MoneyType } moneyType
     */
    constructor(objectSelf, properties, moneyType) {
        super(EVENT_TYPES.MONEY_IN, objectSelf, properties.absNum, moneyType);
        /**
         * @private
         */
        this.giverId = properties.giver.id;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Giver() {
        if (!this._giver_s || this._giver_s < Game.time) {
            this._giver_s = Game.time;
            return this._giver = Game.getObjectById(this.giverId);
        } else return this._giver;
    }
}
/**
 * Class representation for special case of `event`: Money Out.
 * @extends EventMoney
 */
class EventMoneyOut extends EventMoney {
    /**
     * @param {import("./task.prototype").GameObject} objectSelf
     * @param { {absNum: number, receiver: import("./task.prototype").GameObject} } properties
     * @param { import("./money.prototype").MoneyType | "combined" } moneyType
     */
    constructor(objectSelf, properties, moneyType) {
        super(EVENT_TYPES.MONEY_OUT, objectSelf, properties.absNum, moneyType);
        /**
         * @private
         */
        this.receiverId = properties.receiver.id;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Receiver() {
        if (!this._receiver_s || this._receiver_s < Game.time) {
            this._receiver_s = Game.time;
            return this._receiver = Game.getObjectById(this.receiverId);
        } else return this._receiver;
    }
}
/** @abstract - Class representation for event relating to `Task` */
class EventTask extends Event {
    /**
     * @param {EVENT_TYPES} type
     * @param {Task} taskSelf
     */
    constructor(type, taskSelf) {
        super(type);
        /**
         * @private
         */
        this.taskSelf = taskSelf;
    }
    /**
     * @returns {Task}
     */
    get Task() {
        return this.task;
    }
}
/** 
 * Class representation for special case of `event`: change of task status.
 * @extends EventTask
 * 
 * @typedef {"employ" | "fire"} TaskStatusChangeType
 */
class EventTaskStatusChange extends EventTask {
    /**
     * @param {TaskStatusChangeType} typeOfStatusChange
     * @param {Task} taskSelf
     * @param {{ employer: import("./task.prototype").GameObject, role: string } } properties
     */
    constructor(typeOfStatusChange, taskSelf, properties) {
        super(EVENT_TYPES.TASK_STATUS_CHANGE, taskSelf);
        /**
         * @private
         */
        this.typeOfStatusChange = typeOfStatusChange;
        /**
         * @private
         */
        this.properties = properties;
        /* Adjust `employer` into `employerId` */
        if (this.properties.employer) {
            this.properties.employerId = this.properties.employer.id;
            delete this.properties["employer"];
        }
    }
    /**
     * @returns {TaskStatusChangeType}
     */
    get Status() {
        return this.typeOfStatusChange;
    }
    /**
     * @returns {object}
     */
    get Employer() {
        if (this.Status === "employ" || this.Status === "fire") {
            if (!this._employer_s || this._employer_s < Game.time) {
                this._employer_s = Game.time;
                return this._employer = Game.getObjectById(this.properties.employerId);
            } else return this._employer;
        }
    }
    /**
     * @returns {string}
     */
    get Role() {
        if (this.Status === "employ" || this.Status === "fire") return this.properties.role;
    }
};
/**
 * Class representation for special case of `event`: change of object's status of undertaken task.
 * Remember that even though this event could be thrusted into `HotPool`, it is necessary to recheck
 * the object's status of task before handling, since its status could change more than one time in
 * a single tick.
 * @extends EventTask
 * 
 * @typedef {"take" | "fired"} ObjectTaskStatusChangeType
 */
class EventTaskOfObjectStatusChange extends EventTask {
    /**
     * @param {ObjectTaskStatusChangeType} typeOfStatusChange 
     * @param {Task} taskSelf
     * @param { { obj: import("./task.prototype").GameObject} } properties
     */
    constructor(typeOfStatusChange, taskSelf, properties) {
        super(EVENT_TYPES.TASK_OF_OBJECT_STATUS_CHANGE, taskSelf);
        /**
         * @private
         */
        this.typeOfStatusChange = typeOfStatusChange;
        /**
         * @private
         */
        this.objId = properties.obj.id;
    }
    /**
     * @returns {ObjectTaskStatusChangeType}
     */
    get Status() {
        return this.typeOfStatusChange;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Obj() {
        if (!this._obj_s || this._obj_s < Game.time) {
            this._obj_s = Game.time;
            return this._obj = Game.getObjectById(this.objId);
        } else return this._obj;
    }
}
/**
 * Class reprensentation for log.
 * @implements {Doner}
 */
class LogPool {
    /**
     * Adjust instance to be in the state of current tick.
     */
    init() {
        if (this.lastVisitedTick !== Game.time) {
            this.lastVisitedTick = Game.time;
            this.pool = this.cachedPool.concat(this.pool);
            this.cachedPool = [];
            if (!this.currentTickDone) console.log(`<p style="color: red; display : inline;">LogPool Error: Possible Contamination from Events in last tick into hotPool in current Tick. Possibly forget to call \`Done\` explicitly.</p>`);
            this.currentTickDone = false;
        }
    }
    constructor() {
        /**
         * Used for storing events for current tick 
         * @type {Array<Event>}
         * @private
         */
        this.pool = [];
        /**
         * Used for storing events reserved for use in the next tick 
         * @type {Array<Event>}
         * @private
         */
        this.cachedPool = [];
        /**
         * Used for storing events happening in current tick and should be dealed promptly.
         * @type {Array<Event>}
         * @private
         */
        this.hotPool = [];
        /**
         * @private
         */
        this.lastVisitedTick = Game.time;
        /**
         * @private
         */
        this.currentTickDone = false;
    }
    /**
     * @returns {Array<Event>}
     */
    get Pool() {
        this.init();
        return this.pool;
    }
    /**
     * @returns {Event | null}
     */
    get HotPoolTop() {
        this.init();
        return this.hotPool.shift() || null;
    }
    /**
     * Push `event` to be seen in the next tick.
     * @param {Event} event
     */
    Push(event) {
        this.init();
        this.cachedPool.push(event);
    }
    /**
     * Push `event` to be dealt directly in the current tick.
     * @param {Event} event
     */
    HotPush(event) {
        this.init();
        this.hotPool.push(event);
    }
    /**
     * Must be called at the end of tick.
     */
    Done() {
        this.init();
        this.currentTickDone = true;
        this.hotPool = [];
    }
    /** @returns {boolean} */
    get IsDone() {
        this.init();
        return this.currentTickDone;
    }
}

module.exports = {
    EVENT_TYPES: EVENT_TYPES,
    EventTaskStatusChange: EventTaskStatusChange,
    EventTaskOfObjectStatusChange: EventTaskOfObjectStatusChange,
    EventMoneyIn: EventMoneyIn,
    EventMoneyOut: EventMoneyOut,
    EventObjectConstruct : EventObjectConstruct,
    EventObjectDestroy : EventObjectDestroy,
    LogPool: LogPool
};