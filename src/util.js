/**
 * @module util
 * @typedef {CreepFunctions} CreepFunctions
 */

module.exports = {
    mount: function () {
        /**
         * `select` converts each `value` into number and selects the maximum one.
         * null ones will be ignored.
         * @extends Array
         * @template T, S
         * @param { (value: S) => number } toNumber
         * @param { (value: T) => S } [mapping]
         * @returns {T | null}
         */
        Array.prototype.select = function(toNumber, mapping) {
            mapping = mapping || (v => v);
            if (this.length === 0) return null;
            if (this.length === 1) {
                if (mapping(this[0])) return this[0];
                else return null;
            }
            let maxIndex = null, maxValue = null;
            for (let i = 0; i < this.length; i++) {
                const S = mapping(this[i]);
                if (!S) continue;
                const number = toNumber(S);
                if (maxValue === null || number > maxValue) {
                    maxValue = number;
                    maxIndex = i;
                }
            }
            if (maxIndex === null) return null;
            return this[maxIndex];
        }
        /**
         * @extends Array
         * @template T
         * @param { (value : T) => boolean } predicate
         * @returns {number}
         */
        Array.prototype.count = function(predicate) {
            let cnt = 0;
            for (let i = 0; i < this.length; ++i) if (predicate(this[i])) ++cnt;
            return ret;
        }
        Array.prototype.shuffle = function() {
            return _.shuffle(this);
        }
    },
    /**
     * isStructure distinguish `ConstructionSite` from `Structure`.
     * @param {import("./task.prototype").GameObject} obj
     * @returns {Boolean}
     */
    isStructure: function(obj) {
        if (obj.structureType && (obj.structureType === STRUCTURE_CONTROLLER || !obj.progressTotal)) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @returns {Boolean}
     */
    isSpawn : function(obj) {
        if (obj.spawnCreep !== undefined) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @returns {boolean}
     */
    isController : function(obj) {
        if (obj.level !== undefined) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @returns {Boolean}
     */
    isConstructionSite : function(obj) {
        if (obj.structureType && obj.progressTotal) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     */
    isCreep : function(obj) {
        if (obj.body) return true;
        return false;
    },
    /**
     * @param { Room } room
     * @returns {Boolean}
     */
    isMyRoom : function (room) {
        if (room.controller && room.controller.my) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     */
    isSource : function (obj) {
        if (obj.energy !== undefined && obj.energyCapacity !== undefined) return true;
        return false;
    },
    isMineral : function (obj) {
        if (obj.mineralType !== undefined) return true;
        return false;
    },
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @returns {Boolean}
     */
    isHarvestable : function(obj) {
        if (obj.energyCapacity) return true; // Source
        else if (obj.mineralType) return true; // Mineral
        else if (obj.depositType) return true; // Deposit
        else return false;
    },
    /**
     * @param {number} timeout
     * @param {number} offset
     * @returns {number}
     */
    getCacheExpiration : function(timeout, offset) {
        return timeout + Math.round((Math.random()*offset*2)-offset);
    },
    /**
     * calcDistance returns the distance between `roomU` and `roomV`.
     * @param {string} roomNameU
     * @param {string} roomNameV
     * 
     * @TODO
     * Need enhancement for a better real-life distance instead of pure linear distance.
     */
    calcDistance : function(roomNameU, roomNameV) {
        return Game.map.getRoomLinearDistance(roomNameU, roomNameV);
    },
    /**
     * calcInRoomDistance returns the distance between two positions inside a room.
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     * @param {Room | null} room provide information of landscape
     * 
     * @TODO
     * Need enhancement for a better real-life distance instead of pure arithmetic distance.
     */
    calcInRoomDistance : function(posU, posV, room = null) {
        return Math.abs(posU.x - posV.x) + Math.abs(posU.y - posV.y);
    },
    /**
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     * @TODO
     * Need enhancement for a better real-life distance instead of pure arithmetic distance.
     */
    calcCrossRoomDistance : function(posU, posV) {
        return Game.map.getRoomLinearDistance(posU.roomName, posV.roomName) * 50; // 50 : diameter of room
    },
    /**
     * getPrice play a crucial role in operating money system.
     * @param { ResourceConstant | "cpu" } resource
     */
    getPrice : function(resource) {
        return global.Lucy.Rules.price[resource] ? global.Lucy.Rules.price[resource] : global.Lucy.Rules.price["default"];
    },
    /**
     * CheckForStore applies to Creep, Structure, Source, Mineral
     * @param {import("./task.prototype").GameObject} obj
     * @param {ResourceConstant} resourceType
     * @returns {number}
     */
    checkForStore : function(obj, resourceType) {
        if (obj.store) {
            return obj.store.getUsedCapacity(resourceType) || 0;
        } else if (obj.mineralType && obj.mineralType === resourceType) {
            return obj.mineralAmount;
        } else if (obj.resourceType && obj.resourceType === resourceType) {
            return obj.amount;
        } else if (obj.energyCapacity && resourceType === RESOURCE_ENERGY) {
            return obj.energy;
        }
        return 0;
    },
    /**
     * CheckForFreeStore applies to Creep, Structure, Source, Mineral
     * @param {import("./task.prototype").GameObject} obj
     * @param {ResourceConstant} [resourceType]
     * @returns {number}
     */
    checkForFreeStore : function(obj, resourceType) {
        if (obj.store) {
            if (!resourceType) return obj.store.getFreeCapacity();
            else return obj.store.getFreeCapacity(resourceType) || 0;
        }
        return 0;
    },
    /**
     * @param { {[body in BodyPartConstant]? : number} | Array<BodyPartConstant> } bodyDescription
     */
    evaluateCost : function(bodyDescription) {
        let cost = 0;
        if (Array.isArray(bodyDescription)) {
            for (const body of bodyDescription) cost += BODYPART_COST[body];
        } else {
            for (const body in bodyDescription) cost += BODYPART_COST[body] * bodyDescription[body];
        }
        return cost;
    },
    /**
     * @param { {[body in BodyPartConstant]? : number} } bodyDescription
     * @returns {Array<BodyPartConstant>}
     */
    parseBodyPartsConfiguration : function(bodyDescription) {
        let ret = [];
        /**
         * @param {BodyPartConstant} body
         * @param {number} num
         */
        const pushTo = (body, num) => {
            for (let i = 0; i < num; ++i) ret.push(body);
        };
        /**
         * @type { Array<BodyPartConstant }
         */
        const priority = ["tough", "carry", "work" , "claim", "attack", "move" , "ranged_attack", "heal"];
        for (const body of priority) {
            if (bodyDescription[body]) pushTo(body, bodyDescription[body]);
        }
        return ret;
    },
    /**
     * @typedef {"capacity" | "harvest" | "build" | "repair" | "dismantle" | "upgradeController" | "attack" | "rangedAttack" | "rangedMassAttack" | "heal" | "rangedHeal" | "fatigue" | "damage"} CreepFunctions
     * @param {Creep} creep
     * @param {CreepFunctions} aspect
     * @returns {number} equivalent number of body parts
     */
    evaluateAbility(creep, aspect) {
        const aspect2body = {
            harvest             : "work",
            build               : "work",
            repair              : "work",
            dismantle           : "work",
            upgradeController   : "work",
            attack              : "attack",
            rangedAttack        : "ranged_attack",
            rangedMassAttack    : "ranged_attack",
            heal                : "heal",
            rangedHeal          : "heal",
            capacity            : "carry",
            fatigue             : "move",
            damage              : "tough"
        };
        let ret = 0;
        for (const des of creep.body) {
            if (des.hits === 0) continue;
            if (des.type !== aspect2body[aspect]) continue;
            if (des.boost) {
                if (aspect !== "damage") ret += BOOSTS[aspect2body[aspect]][des.boost];
                else ret += 1 / BOOSTS[aspect2body[aspect]][des.boost];
            } else ret += 1;
        }
        return ret;
    },
    /**
     * @param {Source} source
     */
    evaluateSource(source) {
        const ret = source.energyCapacity;
        for (const effect of (source.effects || [])) {
            if (effect.effect === PWR_REGEN_SOURCE) {
                if (source.energyCapacity + POWER_INFO[PWR_REGEN_SOURCE].effect[effect.level] * (300 / 15) > ret) {
                    ret = source.energyCapacity + POWER_INFO[PWR_REGEN_SOURCE].effect[effect.level] * (300 / 15);
                }
            }
        }
        return ret;
    },
    /**
     * @param {Array<number>} dimensions
     * @param {any} fillIn
     * @returns {Array}
     */
    constructArray(dimensions, fillIn) {
        /**
         * Speed Up For Special Case
         */
        if (dimensions.length === 2 && typeof fillIn === "object" && fillIn.length === 0) {
            const startTime = Game.cpu.getUsed();
            let ret = [];
            for (let i = 0; i < dimensions[0]; ++i) {
                ret[i] = [];
                for (let j = 0; j < dimensions[1]; ++j) {
                    ret[i][j] = [];
                    // console.log(Game.cpu.getUsed() - startTime);
                }
            }
            // console.log(`<p style="display:inline;color:red;">Notice: </p> ${dimensions[0]} ${dimensions[1]} takes ${Game.cpu.getUsed() - startTime}`);
            //console.log(`Construct Array with dimensions ${JSON.stringify(dimensions)}, which is filled in ${JSON.stringify(fillIn)} consumes ${Game.cpu.getUsed() - startTime}`);
            return ret;
        }
        const ret = [];
        const constructor = (array, index) => {
            if (index < dimensions.length - 1) {
                for (let i = 0; i < dimensions[index]; i++) {
                    array.push([]);
                    array[i] = constructor(array[i], index + 1);
                }
            } else if (index === dimensions.length - 1) for (let i = 0; i < dimensions[index]; i++) {
                if (fillIn.length === 0) array.push(new Array());
                else if (typeof fillIn === "object") array.push(JSON.parse(JSON.stringify(fillIn)));
                else array.push(fillIn);
            }
            return array;
        }
        return constructor(ret, 0);
    },
    /**
     * @TODO Consider Boosts
     * @param { {type : "exhuastEnergy", availableEnergy : number, energyConsumptionPerUnitPerTick : number} } mode
     * @returns { {[bodypart in BodyPartConstant]? : number} }
     */
    bodyPartDetermination(mode) {
        if (mode.type === "exhuastEnergy") {
            const availableEnergy = mode.availableEnergy;
            const energyConsumptionPerUnitPerTick = mode.energyConsumptionPerUnitPerTick;
            /**
             * [WORK] : x
             * [CARRY] : y = x * energyConsumptionPerUnitPerTick / 50
             * [MOVE] : (x + y) / 2
             * Constraints :
             *  - x + y + (x + y) / 2 <= 50
             *  - x * energyConsumptionPerUnitPerTick * CREEP_LIFE_TIME <= availableEnergy
             *  - x >= 1
             *  - y >= 1
             * Goal :
             *  - maximize x
             * Deduction:
             *  Let c = energyConsumptionPerUnitPerTick
             *  Constraints:
             *      - x <= 50 / 1.5 / (1 + c / 50)
             *      - x <= availableEnergy / 1500c
             *      - x >= 1
             *      - x >= 50 / c
             *  Thus:
             *      x >= Math.max(1, Math.floor(50 / c)) && x <= Math.min(Math.floor(50 / 1.5 / (1 + c / 50)), Math.floor(availableEnergy / 1500 / c))
             *      Notice : x >= 1 && y >= 1 is guaranteed in a different way, in practice.
             */
            /* Capacity of a single CARRY */
            const CARRY_CAPACITY = 50;
            /* Number of bodyparts a MOVE can boost */
            const MOVE_COEFFICIENT = 2;
            const work = Math.min(Math.floor(50 / (1 + 1 / MOVE_COEFFICIENT) / (1 + energyConsumptionPerUnitPerTick / CARRY_CAPACITY)), Math.floor(availableEnergy / CREEP_LIFE_TIME / energyConsumptionPerUnitPerTick));
            const carry = Math.floor(work * energyConsumptionPerUnitPerTick / CARRY_CAPACITY);
            const move = Math.ceil((work + carry) / MOVE_COEFFICIENT);
            // In fact, MOVE >= 2 would be a better option, despite some loss of accuracy.
            // It allows much more flexibility.
            const workNum = work >= 1 ? work : 1;
            const carryNum = carry >= 1 ? carry : 1;
            const moveNum = Math.min(50 - workNum - carryNum, Math.max(2, move));
            return {
                [WORK] : workNum,
                [CARRY] : carryNum,
                [MOVE] : moveNum
            };
        }
        
    }
};