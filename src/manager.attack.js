/**
 * @module manager.attack
 * 
 * @typedef { "Enemy" | "Stronghold" } AttackRoomType
 * @typedef { "attackable" | "unattackable" | "unreachable" } AttackReturn
 */
const getCacheExpiration =  require("./util").getCacheExpiration;
const Task               =  require("./task.prototype").Task;
const TaskDescriptor     =  require("./task.prototype").TaskDescriptor;
const ATTACK_RETURN_VALID_DURATION_TICKS = CREEP_LIFE_TIME * 10;
const ATTACK_RETURN_VALID_DURATION_TICKS_OFFSET = CREEP_LIFE_TIME;

class AttackManager {
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
     * `update` deals with `AttackReturn`.
     * @private
     * @param {string} roomName
     * @param {undefined | AttackReturn} [attackReturn]
     */
    update(roomName, attackReturn) {
        if (!attackReturn) {
            // Timeout Checking
            if (this.targetRoomsAttackReturn[roomName] && Game.time >= this.targetRoomsAttackReturn[roomName].timeout) delete this.targetRoomsAttackReturn[roomName];
        } else {
            // Update AttackReturn
            this.targetRoomsAttackReturn[roomName] = {return : attackReturn, timeout : Game.time + getCacheExpiration(ATTACK_RETURN_VALID_DURATION_TICKS, ATTACK_RETURN_VALID_DURATION_TICKS_OFFSET)};
            // Refresh Information
            if (attackReturn !== "attackable") {
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
    issue_Stronghold_0(roomName) {
        if (!this.statistics[roomName]) this.statistics[roomName] = {};
        if (!this.statistics[roomName].targetId || !this.statistics[roomName].targetPos) {
            if (!Game.rooms[roomName]) {
                // Not Visible
                if (global.Map.EnsureVisibility(roomName) === "invisible") return this.update(roomName, "unreachable");
                else {
                    /**
                     * Recall this function after room becomes visible.
                     * Since only those near our homes are concerned, the time to get there shouldn't be very long.
                     * I assume at maximum `2` rooms away here.
                     */
                    const TIMEOUT = 100, OFFSET = 50;
                    global.Lucy.Timer.add(Game.time + getCacheExpiration(TIMEOUT, OFFSET), this.issue_Stronghold_0, this, [roomName], `Issue Stronghold 0 Attack Task : ${roomName}`);
                    return;
                }
            } else {
                // Visible
                /** @type {StructureInvaderCore} */
                const target = Game.rooms[roomName].find(FIND_HOSTILE_STRUCTURES).filter(s => s.structureType === STRUCTURE_INVADER_CORE)[0];
                if (!target) {
                    this.Remove(roomName);
                    return;
                }
                this.statistics[roomName].targetId = target.id;
                this.statistics[roomName].targetPos = target.pos;
            }
        }
        const hitsPerTick = INVADER_CORE_HITS / CREEP_LIFE_TIME;
        const attack = Math.floor(hitsPerTick / ATTACK_POWER);
        const move = attack;
        new Task(`[Stronghold_${0}:${roomName}]`, roomName, {id : null}, new TaskDescriptor(`default`, {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn : () => 1,
                estimateWorkingTicks : () => CREEP_LIFE_TIME,
                bodyMinimumRequirements : {
                    [ATTACK] : attack,
                    [MOVE] : move
                },
                bodyBoostRequirements : {
                    [ATTACK] : [
                        {
                            boostCompound : `UH`,
                            ratio : 1,
                            mode : "once"
                        }
                    ]
                },
                tag : `Stronghold_${0}_attacker`,
                mode : "shrinkToEnergyAvailable",
                confinedInRoom : false
            }
        }), {
            selfCheck : function() {
                if (this.taskData[OK]) return "dead";
                return "working";
            },
            run : function() {
                /** @type {Creep[]} */
                const workers = this.FetchEmployees("worker");
                /** @type {Id<StructureInvaderCore>} */
                const targetId = this.taskData.targetId;
                /** @type {RoomPosition} */
                const targetPos = this.taskData.targetPos;
                /** @type {string} */
                const roomName = this.taskData.roomName;
                const firedCreeps = [];
                workers.forEach(creep => {
                    if (!Game.rooms[roomName]) return creep.travelTo(targetPos);
                    const target = Game.getObjectById(targetId);
                    if (!target) return this.taskData[OK] = true;
                    if (creep.attack(target) === ERR_NOT_IN_RANGE) creep.travelTo(targetPos);
                });
                return firedCreeps;
            }
        }, { roomName, [OK] : false, callback : () => this.Remove(roomName), targetId : this.statistics[roomName].targetId, targetPos : this.statistics[roomName].targetPos });
    }
    /**
     * `trigger` based on the `type` and `level`.
     * @private
     * @param {string} roomName
     * @returns {AttackReturn}
     */
    trigger(roomName) {
        if (this.targetRooms[roomName].type === "Stronghold" && this.targetRooms[roomName].level === 0) {
            this.targetRoomsAttackReturn[roomName] = {return : "attackable", timeout : Game.time + ATTACK_RETURN_VALID_DURATION_TICKS};
            this.issue_Stronghold_0(roomName);
        } else {
            this.targetRoomsAttackReturn[roomName] = {return : "unattackable", timeout : Game.time + ATTACK_RETURN_VALID_DURATION_TICKS};
        }
    }
    /**
     * Determine `AttackRoomType`.
     * @param {string} roomName
     */
    init(roomName) {
        if (this.targetRooms[roomName].type && typeof this.targetRooms[roomName].level === "number") return;
        const room = Game.rooms[roomName];
        if (room.find(FIND_HOSTILE_STRUCTURES).filter(s => s.structureType === STRUCTURE_INVADER_CORE).length > 0) this.targetRooms[roomName] = {type : "Stronghold", level : room.find(FIND_HOSTILE_STRUCTURES).filter(s => s.structureType === STRUCTURE_INVADER_CORE)[0].level};
        else if (room.controller && (room.controller.owner || room.controller.reservation) && !room.controller.my) this.targetRooms[roomName] = {type : "Enemy", level : room.controller.level};
    }
    /**
     * @param {string} roomName
     * @param {AttackRoomType | null} [type = null]
     * @param {number | null} [level = null]
     */
    Add(roomName, type = null, level = null) {
        this.update(roomName);
        if (!this.targetRooms[roomName]) this.targetRooms[roomName] = {type, level};
    }
    /**
     * @param {string} roomName
     */
    Remove(roomName) {
        if (this.targetRooms[roomName]) delete this.targetRooms[roomName];
        if (this.targetRoomsAttackReturn[roomName]) delete this.targetRoomsAttackReturn[roomName];
    }
    /**
     * @param {string} roomName
     * @returns {"scouting" | "attacking" | "unattackable" | "unreachable" | "completed"}
     */
    Query(roomName) {
        this.update(roomName);
        if (!this.targetRooms[roomName] && !this.targetRoomsAttackReturn[roomName]) return "completed";
        else if (this.targetRoomsAttackReturn[roomName] && this.targetRoomsAttackReturn[roomName].return === "unattackable") return "unattackable";
        else if (this.targetRoomsAttackReturn[roomName] && this.targetRoomsAttackReturn[roomName].return === "unreachable") return "unreachable";
        else if (!this.targetRooms[roomName].type || typeof this.targetRooms[roomName].level !== "number") return "scouting";
        else return "attacking";
    }
    Run() {
        const targetRoomNames = Object.keys(this.targetRooms);
        for (const roomName of targetRoomNames) {
            /**
             * Update Room Attack Status
             */
            this.update(roomName);
            if (this.targetRoomsAttackReturn[roomName]) continue;
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
    constructor() {
        /** @type {{[roomName : string] : {type : AttackRoomType | null, level : number}}} */
        this.targetRooms = Memory._attackTargetRooms;
        /** @type {{[roomName : string] : {timeout : number, return : AttackReturn}}} */
        this.targetRoomsAttackReturn = {};
        /** @type {{[roomName : string] : {} | {targetId : Id<StructureInvaderCore>, targetPos : RoomPosition}}} */
        this.statistics = {};
    }
}

if (!Memory._attackTargetRooms) Memory._attackTargetRooms = {};

const attackManager = new AttackManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const AttackPlugin = {
    init : () => global.AttackManager = attackManager,
    reset : () => global.AttackManager.Init(),
    tickStart : () => global.AttackManager.Run()
};
global.Lucy.App.on(AttackPlugin);