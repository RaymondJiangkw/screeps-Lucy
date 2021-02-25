/**
 * @module manager.defend
 * 
 * @typedef { "My" | "Highway" | "Remote" } DefendRoomType
 * @typedef { "defendable" | "undefendable" | "unreachable" } DefendReturn
 * @typedef {DefendManager} DefendManager
 */

const getCacheExpiration    = require("./util").getCacheExpiration;
const Task                  = require("./task.prototype").Task;
const TaskDescriptor        = require("./task.prototype").TaskDescriptor;
const decideRoomStatus      = require("./util").decideRoomStatus;
const isMyRoom              = require("./util").isMyRoom;
const DEFEND_RETURN_VALID_DURATION_TICKS = CREEP_LIFE_TIME * 10;
const DEFEND_RETURN_VALID_DURATION_TICKS_OFFSET = CREEP_LIFE_TIME;

class DefendManager {
    Init() {
        const targetRoomNames = Object.keys(this.targetRooms);
        for (const roomName of targetRoomNames) {
            /**
             * Ensure Visibility, if its type is not sure.
             */
            if ((!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") && !Game.rooms[roomName]) {
                if (global.Map.EnsureVisibility(roomName) === "invisible") this.update(roomName, "unreachable");
                continue;
            }
            if ((!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") && Game.rooms[roomName]) {
                this.init(roomName);
                /**
                 * If there isn't any signal demonstrating this room deserves attack, this room is removed (instead of being in the state of cooldown).
                 */
                if (!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") {
                    delete this.targetRooms[roomName];
                    continue;
                }
            }
            /**
             * Currently, `this.targetRooms[roomName].type` and `this.targetRooms[roomName].level` are guaranteed.
             */
            this.trigger(roomName);
        }
    }
    /**
     * `update` deals with `DefendReturn`
     * @param {string} roomName
     * @param {DefendReturn | undefined} defendReturn
     */
    update(roomName, defendReturn) {
        if (!defendReturn) {
            // Timeout Checking
            if (this.targetRoomsDefendReturn[roomName] && Game.time >= this.targetRoomsDefendReturn[roomName].timeout) delete this.targetRoomsDefendReturn[roomName];
        } else {
            // Update DefendReturn
            this.targetRoomsDefendReturn[roomName] = {return : defendReturn, timeout : Game.time + getCacheExpiration(DEFEND_RETURN_VALID_DURATION_TICKS, DEFEND_RETURN_VALID_DURATION_TICKS_OFFSET)};
            // Refresh Information
            if (defendReturn !== "defendable") {
                this.targetRooms[roomName].level = null;
                this.targetRooms[roomName].type = null;
                if (this.statistics[roomName]) delete this.statistics[roomName];
            }
        }
    }
    /**
     * @private
     * @param {string} roomName
     */
    issue_remote(roomName) {
        if (global.TaskManager.Fetch("default", `DEFEND_${roomName}_Remote`).length > 0) return;
        const PEACE_TICK_REQUIREMENT = CREEP_LIFE_TIME;
        /**
         * BodyParts:
         *  - HEAL              1
         *  - TOUGH             2
         *  - RANGED_ATTACK     3
         *  - MOVE              6
         */
        new Task(`[Defend_Remote:${roomName}]`, roomName, {id : null}, new TaskDescriptor(`default`, {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn : () => 1,
                estimateWorkingTicks : () => CREEP_LIFE_TIME,
                bodyMinimumRequirements : {
                    [HEAL] : 1,
                    [TOUGH] : 2,
                    [RANGED_ATTACK] : 3,
                    [MOVE] : 6
                },
                bodyBoostRequirements : {
                    [RANGED_ATTACK] : [
                        {
                            boostCompound : "KO",
                            ratio : 1,
                            mode : "once"
                        }
                    ]
                },
                tag : `Remote_defender`,
                mode : "static",
                confinedInRoom : false
            }
        }, {taskKey : `DEFEND_${roomName}_Remote`}), {
            selfCheck : function() {
                if (this.taskData.isPeace && (!this.taskData.lastNotPeaceTick || Game.time - this.taskData.lastNotPeaceTick >= PEACE_TICK_REQUIREMENT)) {
                    this.taskData.Remove(this.taskData.roomName);
                    return "dead";
                }
                return "working";
            },
            run : function() {
                /** @type {Creep[]} */
                const workers = this.FetchEmployees("worker");
                /** @type {string} */
                const roomName = this.taskData.roomName;
                const firedCreeps = [];
                workers.forEach(worker => {
                    if (worker.pos.roomName !== roomName) return worker.travelTo(new RoomPosition(25, 25, roomName));
                    const target = worker.pos.findClosestByRange(FIND_HOSTILE_CREEPS);
                    if (!target) {
                        this.taskData.isPeace = true;
                        if (worker.pos.x === 0 || worker.pos.x === 49 || worker.pos.y === 0 || worker.pos.y === 49) worker.travelTo(new RoomPosition(25, 25, roomName));
                        return;
                    }
                    this.taskData.lastNotPeaceTick = Game.time;
                    // Permanent Heal
                    worker.heal(worker);
                    // An Easy Kite Strategy
                    if (worker.pos.getRangeTo(target) > 3) worker.travelTo(target, {stuckValue : 1, movingTarget : true, repath : 1});
                    // `movingTarget` will leads `range` to be 0 which is not desired.
                    else if (worker.pos.getRangeTo(target) <= 3) worker.travelTo(target, {flee : true, stuckValue : 1, range : 3, repath : 1});
                    worker.rangedAttack(target);
                });
                return firedCreeps;
            }
        }, {isPeace : false, lastNotPeaceTick : null, roomName, Remove : this.Remove});
    }
    /**
     * `trigger` based on the `type` and `level`
     * @param {string} roomName
     * @returns {DefendReturn}
     */
    trigger(roomName) {
        if (this.targetRooms[roomName].type === "Remote") {
            this.update(roomName, "defendable");
            this.issue_remote(roomName);
        } else {
            this.update(roomName, "undefendable");
        }
    }
    /**
     * Determine `DefendRoomType`
     * @param {string} roomName
     */
    init(roomName) {
        if (this.targetRooms[roomName].type && typeof this.targetRooms[roomName].level ==="number") return;
        if (decideRoomStatus(roomName) === "highway") {
            this.targetRooms[roomName].type = "Highway";
            this.targetRooms[roomName].level = 0;
        } else if (decideRoomStatus(roomName) === "normal") {
            const room = Game.rooms[roomName];
            if (isMyRoom(room)) {
                this.targetRooms[roomName].type = "My";
                this.targetRooms[roomName].level = room.controller.level;
            } else {
                this.targetRooms[roomName].type = "Remote";
                this.targetRooms[roomName].level = 0;
            }
        } else {
            console.log(`<p style="display:inline;color:red;">Error:</p> ${roomName} can't be protected.`);
        }
    }
    /**
     * @param {string} roomName
     * @param {DefendRoomType | null} [type]
     * @param {number | null} [level]
     */
    Add(roomName, type, level) {
        this.update(roomName);
        if (!this.targetRooms[roomName]) this.targetRooms[roomName] = {level, type};
    }
    /**
     * @param {string} roomName
     */
    Remove(roomName) {
        if (this.targetRooms[roomName]) delete this.targetRooms[roomName];
        if (this.targetRoomsDefendReturn[roomName]) delete this.targetRoomsDefendReturn[roomName];
    }
    /**
     * @param {string} roomName
     * @returns {"scouting" | "defending" | "undefendable" | "unreachable" | "completed"}
     */
    Query(roomName) {
        this.update(roomName);
        if (!this.targetRooms[roomName] && !this.targetRoomsDefendReturn[roomName]) return "completed";
        else if (this.targetRoomsDefendReturn[roomName] && this.targetRoomsDefendReturn[roomName].return === "undefendable") return "undefendable";
        else if (this.targetRoomsDefendReturn[roomName] && this.targetRoomsDefendReturn[roomName].return === "unreachable") return "unreachable";
        else if (!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") return "scouting";
        else return "defending";
    }
    Run() {
        const targetRoomNames = Object.keys(this.targetRooms);
        for (const roomName of targetRoomNames) {
            /**
             * Update Room Attack Status
             */
            this.update(roomName);
            if (this.targetRoomsDefendReturn[roomName]) continue;
            /**
             * Ensure Visibility, if its type is not sure.
             */
            if ((!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") && !Game.rooms[roomName]) {
                if (global.Map.EnsureVisibility(roomName) === "invisible") this.update(roomName, "unreachable");
                continue;
            }
            if ((!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") && Game.rooms[roomName]) {
                this.init(roomName);
                /**
                 * If there isn't any signal demonstrating this room deserves defending, this room is removed (instead of being in the state of cooldown).
                 */
                if (!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") {
                    delete this.targetRooms[roomName];
                    continue;
                }
            }
            /**
             * Currently, `this.targetRooms[roomName].type` and `this.targetRooms[roomName].level` are guaranteed.
             */
            this.trigger(roomName);
        }
    }
    /** @type { {[roomName : string] : {type : DefendRoomType, level : number}} } */
    get targetRooms() {
        return Memory._defendTargetRooms;
    }
    constructor() {
        /** @type { {[roomName : string] : {timeout : number, return : DefendReturn}} } */
        this.targetRoomsDefendReturn = {};
        /** @type { {[roomName : string] : {}} } */
        this.statistics = {};
    }
}

if (!Memory._defendTargetRooms) Memory._defendTargetRooms = {};

const defendManager = new DefendManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const DefendPlugin = {
    init : () => global.DefendManager = defendManager,
    reset : () => global.DefendManager.Init(),
    tickStart : () => global.DefendManager.Run()
};
global.Lucy.App.on(DefendPlugin);