/**
 * @module manager.tasks
 *
 * @typedef {TaskManager} TaskManager
 */
const DEFAULT = "default";
/**
 * @type { (resource : ResourceConstant | "cpu") => number }
 */
const getPrice              =   require('util').getPrice;
const profiler = require("./screeps-profiler");
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
        if (task.Descriptor.Key && task.mountObj) {
            if (!this.id2key2tasks[task.mountObj.id]) this.id2key2tasks[task.mountObj.id] = {};
            if (!this.id2key2tasks[task.mountObj.id][task.Descriptor.Key]) this.id2key2tasks[task.mountObj.id][task.Descriptor.Key] = [];
            this.id2key2tasks[task.mountObj.id][task.Descriptor.Key].push(task);
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
                console.log(`${subject} -> ${totalTasks.map(t => `${t.mountObj}-${-(t.Identity(subject)["info"].commutingTicks + t.Identity(subject)["info"].workingTicks) * getPrice("cpu") + t.Identity(subject)["info"].moneyPerTurn}`)}`);
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
                // this.updateTasks is cancelled here.
                // this.updateTasks(roomName, tag);
                /* `waiting` task still could Run. */
                for (const task of this.room2tag2tasks[roomName][tag]) task.Run();
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
profiler.registerClass(TaskManager, "TaskManager");
module.exports = {
    TaskManager : TaskManager
};