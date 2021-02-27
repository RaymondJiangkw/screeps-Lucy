const { times } = require("lodash");

/**
 * @module util
 * @typedef {CreepFunctions} CreepFunctions
 */
const top = 0;
const parent = i => ((i + 1) >>> 1) - 1;
const left = i => (i << 1) + 1;
const right = i => (i + 1) << 1;
const username = _.sample(Game.spawns).owner.username;
/**
 * @param {number} timeout
 * @param {number} offset
 */
function getCacheExpiration(timeout, offset) {
    return timeout + Math.round((Math.random()*offset*2)-offset);
}
class PriorityQueue {
    constructor(comparator=(a,b)=>a>b){
        this._heap=[];
        this._comparator=comparator;
    }
    size(){
        return this._heap.length;
    }
    isEmpty(){
        return this.size()===0;
    }
    peek(){
        return this._heap[top];
    }
    push(...values){
        values.forEach(value=>{
            this._heap.push(value);
            this._siftUp();
        });
        return this.size();
    }
    pop(){
        const poppedValue=this.peek();
        const bottom=this.size()-1;
        if(bottom>top){
            this._swap(top,bottom);
        }
        this._heap.pop();
        this._siftDown();
        return poppedValue;
    }
    replace(value){
        const replacedValue=this.peek();
        this._heap[top]=value;
        this._siftDown();
        return replacedValue;
    }
    _greater(i,j){
        return this._comparator(this._heap[i],this._heap[j]);
    }
    _swap(i,j){
        [this._heap[i],this._heap[j]]=[this._heap[j],this._heap[i]];
    }
    _siftUp(){
        let node=this.size()-1;
        while(node>top && this._greater(node,parent(node))){
            this._swap(node,parent(node));
            node=parent(node);
        }
    }
    _siftDown(){
        let node=top;
        while(
            (left(node)<this.size() && this._greater(left(node),node))||
            (right(node)<this.size() && this._greater(right(node),node))
            ) {
                let maxChild=(right(node)<this.size() && this._greater(right(node),left(node)))? right(node) : left(node);
                this._swap(node,maxChild);
                node=maxChild;
        }
    }
}
class DisjointSet {
    /**
     * @private
     * @param {string} key
     */
    init(key) {
        if (!this.parent[key]) this.parent[key] = key;
    }
    /**
     * @param {string} key
     * @returns {string}
     */
    Find(key) {
        this.init(key);
        if (this.parent[key] === key) return key;
        else return this.parent[key] = this.Find(this.parent[key]);
    }
    /**
     * @param {string} keyU
     * @param {string} keyV
     */
    Merge(keyU, keyV) {
        this.init(keyU);
        this.init(keyV);
        this.parent[this.Find(keyU)] = this.Find(keyV);
    }
    /**
     * @param {string} keyU
     * @param {string} keyV
     */
    Same(keyU, keyV) {
        this.init(keyU);
        this.init(keyV);
        return this.Find(keyU) === this.Find(keyV);
    }
    constructor() {
        /** @type { {[key : string] : string} } */
        this.parent = {};
    }
}
/**
 * @param {string} name
 */
function roomNameToXY(name) {
    let xx = parseInt(name.substr(1), 10);
    let verticalPos = 2;
    if (xx >= 100) {
        verticalPos = 4;
    } else if (xx >= 10) {
        verticalPos = 3;
    }
    let yy = parseInt(name.substr(verticalPos + 1), 10);
    let horizontalDir = name.charAt(0);
    let verticalDir = name.charAt(verticalPos);
    if (horizontalDir === 'W' || horizontalDir === 'w') {
        xx = -xx - 1;
    }
    if (verticalDir === 'N' || verticalDir === 'n') {
        yy = -yy - 1;
    }
    return [xx, yy];
}
class MyArray extends Array {
    /**
     * `select` converts each `value` into number and selects the maximum one.
     * null ones will be ignored.
     * @template T, S
     * @param { (value: S) => number } toNumber
     * @param { (value: T) => S } [mapping]
     * @param {boolean} [remove]
     * @returns {T | null}
     */
    select(toNumber, mapping = v => v, remove = false) {
        let maxIndex = null, maxValue = null;
        for (let i = 0; i < this.length; i++) {
            const S = mapping(this[i]);
            if (S === null || S === undefined) continue;
            const number = toNumber(S);
            if (maxValue === null || number > maxValue) {
                maxValue = number;
                maxIndex = i;
            }
        }
        if (maxIndex === null) return null;
        const ret = this[maxIndex];
        if (remove) this.splice(maxIndex, 1);
        return ret;
    }
    /**
     * @template T
     * @param { (value : T) => boolean } predicate
     * @returns {number}
     */
    count(predicate) {
        let cnt = 0;
        for (const item of this) if (predicate(item)) ++cnt;
        return cnt;
    }
    /**
     * Shuffle the Array and Returns a new one.
     */
    shuffle() {
        return _.shuffle(this);
    }
}
global.Lucy.App.mount(Array, MyArray);
class Response {
    /**
     * @param {0 | 1 | 2 | 3 | Response} value
     */
    Feed(value) {
        if (value instanceof Response) value = value.value;
        if (value === this.PLACE_HOLDER) return this;
        if (this.value === this.PLACE_HOLDER || this.value === this.FINISH) this.value = value;
        else if (value === this.WAIT_UNTIL_TIMEOUT) this.value = value;
        if (this.value === this.WAIT_UNTIL_TIMEOUT) this.timeout = Game.time + getCacheExpiration(this.TIMEOUT_MEAN, this.TIMEOUT_VARIANCE);
        return this;
    }
    /**
     * @param {0 | 1 | 2 | 3 | Response} value
     */
    constructor(value) {
        if (value instanceof Response) value = value.value;
        this.value = value;
        this.timeout = null;
        if (this.value === this.WAIT_UNTIL_TIMEOUT) this.timeout = Game.time + getCacheExpiration(this.TIMEOUT_MEAN, this.TIMEOUT_VARIANCE);
    }
}
Response.prototype.TIMEOUT_MEAN = 500;
Response.prototype.TIMEOUT_VARIANCE = 100;

Response.prototype.FINISH = 0;
Response.prototype.WAIT_UNTIL_UPGRADE = 1;
Response.prototype.WAIT_UNTIL_TIMEOUT = 2;
Response.prototype.PLACE_HOLDER = 3;

class ResponsePatch {
    /**
     * @param {ResponsePatch} patch
     */
    Merge(patch) {
        Object.keys(patch).filter(key => !key.startsWith("_")).forEach(key => this.Pick(key).Feed(patch.Pick(key)));
    }
    /**
     * @param {string} patchKey
     * @returns {Response}
     */
    Pick(patchKey) {
        if (this[patchKey]) return this[patchKey];
        else console.log(`<p style="display:inline;color:red;">Error:</p> ${patchKey} not found.`);
    }
    /**
     * @param {0 | 1 | 2 | 3 | Response} value
     * @danger if `value` is passed as an instance of Response, once original instance changes, default value of all following newly-created Response will change too.
     * @param {...string} keys
     */
    constructor(value, ...keys) {
        /** @private */
        this._value = value;
        keys.forEach(key => this[key] = new Response(this._value));
    }
}
/**
 * A General `CostMatrix`
 */
class Matrix {
    /**
     * @private
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     * @param {(number, number) => number} func
     */
    modify(x = 0, y = 0, val, func) {
        const minimum = -32768, maximum = 32767;
        const op = value => Math.min(Math.max(minimum, value), maximum);
        if (typeof val === "number") this._bits[x * 50 + y] = func(this._bits[x * 50 + y], op(val));
        else {
            this._bits[x * 50 + y] = func(this._bits[x * 50 + y], op(val[0]));
            for (var d = 1; d < val.length; ++d) {
                const value = op(val[d]);
                var x_top = x - d, x_bottom = x + d;
                var y_left = y - d, y_right = y + d;
                if (x_top >= 0) for (var i = Math.max(0, y_left); i <= Math.min(49, y_right); ++i) this._bits[x_top * 50 + i] = func(this._bits[x_top * 50 + i], value);
                if (x_bottom < 50) for (var i = Math.max(0, y_left); i <= Math.min(49, y_right); ++i) this._bits[x_bottom * 50 + i] = func(this._bits[x_bottom * 50 + i], value);
                if (y_left >= 0) for (var i = Math.max(0, x_top); i <= Math.min(49, x_bottom); ++i) this._bits[i * 50 + y_left] = func(this._bits[i * 50 + y_left], value);
                if (y_right < 50) for (var i = Math.max(0, x_top); i <= Math.min(49, x_bottom); ++i) this._bits[i * 50 + y_right] = func(this._bits[i * 50 + y_right], value);
            }
        }
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     */
    set(x, y, val) {
        this.modify(x, y, val, Matrix._set);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     */
    add(x, y, val) {
        this.modify(x, y, val, Matrix._add);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     */
    subtract(x, y, val) {
        this.modify(x, y, val, Matrix._subtract);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     */
    multiply(x, y, val) {
        this.modify(x, y, val, Matrix._multiply);
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number | number[]} val
     */
    divide(x, y, val) {
        this.modify(x, y, val, Matrix._divide);
    }
    /**
     * @param {number} x
     * @param {number} y
     */
    get(x = 0, y = 0) {
        return this._bits[x * 50 + y];
    }
    clone() {
        var newMatrix = new Matrix();
        newMatrix._bits = new int16Array(this._bits);
        return newMatrix;
    }
    serialize() {
        return Array.prototype.slice.apply(new int32Array(this._bits.buffer));
    }
    constructor() {
        /** @private */
        this._bits = new int16Array(2500);
    }
}
Matrix.deserialize = function(data) {
    let instance = Object.create(Matrix.prototype);
    instance._bits = new int16Array(new int32Array(data).buffer);
    return instance;
}
/** @private */
Matrix._set = (a, b) => b;
/** @private */
Matrix._add = (a, b) => a + b;
/** @private */
Matrix._subtract = (a, b) => a - b;
/** @private */
Matrix._multiply = (a, b) => a * b;
/** @private */
Matrix._divide = (a, b) => a / b;
class AttackMatrix extends Matrix {
    /**
     * @param {StructureTower} tower
     */
    addTower(tower) {
        var coefficient = 1;
        [PWR_OPERATE_TOWER, PWR_DISRUPT_TOWER].forEach(power => {
            var effect = _.find(tower.effects, {effect : power});
            coefficient *= POWER_INFO[power].effect[effect.level - 1];
        });
        this.add(tower.pos.x, tower.pos.y, coefficient === 1 ? AttackMatrix._towerAttackValue : AttackMatrix._towerAttackValue.map(v => v * coefficient));
    }
    /**
     * @param {Creep} creep
     * @param {"rangedAttack" | "rangedMassAttack"} ranged_type
     */
    addCreep(creep, ranged_type) {
        const attack = utils.evaluateAbility(creep, "attack");
        this.add(creep.pos.x, creep.pos.y, [0, 30 * attack]);
        if (ranged_type === "rangedAttack") {
            const ranged_attack = utils.evaluateAbility(creep, "rangedAttack");
            this.add(creep.pos.x, creep.pos.y, [0, 10 * ranged_attack, 10 * ranged_attack, 10 * ranged_attack]);
        } else if (ranged_type === "rangedMassAttack") {
            const ranged_mass_attack = utils.evaluateAbility(creep, "rangedMassAttack");
            this.add(creep.pos.x, creep.pos.y, [0, 10 * ranged_mass_attack, 4 * ranged_mass_attack, 1 * ranged_mass_attack]);
        }
    }
}
/** @private */
AttackMatrix._towerAttackValue = [600,600,600,600,600,600,570,540,510,480,450,420,390,360,330,300,270,240,210,180,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150,150];

class HealMatrix extends Matrix {

}
const utils = {
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
     * @param { Room | string } room
     * @returns {Boolean}
     */
    isMyRoom : function (room) {
        if (typeof room === "string") {
            room = Game.rooms[room];
            if (!room) return false;
        }
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
        if (obj.structureType) return false; // Link still has energyCapacity
        else if (obj.energyCapacity) return true; // Source
        else if (obj.mineralType) return true; // Mineral
        else if (obj.depositType) return true; // Deposit
        else return false;
    },
    /**
     * @param {number} timeout
     * @param {number} offset
     * @returns {number}
     */
    getCacheExpiration : getCacheExpiration,
    /**
     * calcDistance returns the distance between `roomU` and `roomV`.
     * @param {string | RoomPosition} roomNameU_or_posU
     * @param {string | RoomPosition} roomNameV_or_posV
     * @returns {number}
     */
    calcRoomDistance : function(roomNameU_or_posU, roomNameV_or_posV) {
        const roomNameU = typeof roomNameU_or_posU === "string" ? roomNameU_or_posU : roomNameU_or_posU.roomName;
        const roomNameV = typeof roomNameV_or_posV === "string" ? roomNameV_or_posV : roomNameV_or_posV.roomName;
        const ret = global.Map.CalcRoomDistance(roomNameU, roomNameV);
        if (ret === Infinity) return Game.map.getRoomLinearDistance(roomNameU, roomNameV);
        else return ret;
    },
    /**
     * calcInRoomDistance returns the distance between two positions inside a room.
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     */
    calcInRoomDistance : function(posU, posV) {
        const roomName = posU.roomName;
        const ret = global.Map.CalcInRoomDistance(roomName, posU, posV);
        if (ret) return ret;
        return Math.max(Math.abs(posU.x - posV.x), Math.abs(posU.y - posV.y));
    },
    /**
     * getPrice play a crucial role in operating money system.
     * @param { ResourceConstant | "cpu" | "credit" } resource
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
            if (!resourceType) {
                if (obj.structureType) {
                    if (obj.structureType === STRUCTURE_LINK) return obj.store.getFreeCapacity(RESOURCE_ENERGY);
                    else if (obj.structureType === STRUCTURE_EXTENSION) return obj.store.getFreeCapacity(RESOURCE_ENERGY);
                }
                return obj.store.getFreeCapacity();
            } else return obj.store.getFreeCapacity(resourceType) || 0;
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
     * @param {Creep} creep
     * @param {"capacity" | "harvest" | "build" | "repair" | "dismantle" | "upgradeController" | "attack" | "rangedAttack" | "rangedMassAttack" | "heal" | "rangedHeal" | "fatigue" | "damage"} aspect
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
     * @param {Creep} creep
     * @returns { {[bodyPart in BodyPartConstant]? : Array<MineralBoostConstant | null>} }
     */
    calcBoost(creep) {
        /** @type { {[bodyPart in BodyPartConstant]? : Array<MineralBoostConstant | null>} } */
        const ret = {};
        for (const des of creep.body) {
            if (!ret[des.type]) ret[des.type] = [];
            ret[des.type].push(des.boost || null);
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
     * @param { {type : "exhuastEnergy", availableEnergy : number, energyConsumptionPerUnitPerTick : number, sustainTick? : number, MOVE_COEFFICIENT? : number} | {type : "transfer", transferAmount : number, MOVE_COEFFICIENT? : number} } mode
     * @returns { {[bodypart in BodyPartConstant]? : number} }
     */
    bodyPartDetermination(mode) {
        if (mode.type === "exhuastEnergy") {
            /* Capacity of a single CARRY */
            const CARRY_CAPACITY = 50;
            /* Number of bodyparts a MOVE can boost */
            const MOVE_COEFFICIENT = mode.MOVE_COEFFICIENT || 2;
            const availableEnergy = mode.availableEnergy;
            const energyConsumptionPerUnitPerTick = mode.energyConsumptionPerUnitPerTick;
            const sustainTick = mode.sustainTick || (CARRY_CAPACITY / energyConsumptionPerUnitPerTick);
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
            const work = Math.min(Math.floor(50 / (1 + 1 / MOVE_COEFFICIENT) / (1 + energyConsumptionPerUnitPerTick / CARRY_CAPACITY)), Math.floor(availableEnergy / CREEP_LIFE_TIME / energyConsumptionPerUnitPerTick));
            const carry = Math.floor(work * energyConsumptionPerUnitPerTick * sustainTick / CARRY_CAPACITY);
            // In fact, MOVE >= 2 would be a better option, despite some loss of accuracy.
            // It allows much more flexibility.
            const workNum = work >= 1 ? work : 1;
            const carryNum = carry >= 1 ? carry : 1;
            const moveNum = Math.max(2, Math.ceil((workNum + carryNum) / MOVE_COEFFICIENT));
            /* Shrink to 50 BODYPARTS */
            const sumOfBodyParts = workNum + carryNum + moveNum;
            return {
                [WORK] : Math.floor(workNum * Math.min(50 / sumOfBodyParts, 1)),
                [CARRY] : Math.floor(carryNum * Math.min(50 / sumOfBodyParts, 1)),
                [MOVE] : Math.floor(moveNum * Math.min(50 / sumOfBodyParts, 1))
            };
        } else if (mode.type === "transfer") {
            /* Capacity of a single CARRY */
            const CARRY_CAPACITY = 50;
            /* Number of bodyparts a MOVE can boost */
            const MOVE_COEFFICIENT = mode.MOVE_COEFFICIENT || 2;
            const carry = Math.ceil(mode.transferAmount / CARRY_CAPACITY);
            const carryNum = carry >= 1 ? carry : 1;
            const moveNum = Math.max(1, Math.ceil(carryNum / MOVE_COEFFICIENT));
            const sumOfBodyParts = carryNum + moveNum;
            return {
                [CARRY] : Math.floor(carryNum * Math.min(50 / sumOfBodyParts, 1)),
                [MOVE] : Math.floor(moveNum * Math.min(50 / sumOfBodyParts, 1))
            }
        }
    },
    /**
     * @param {string} roomName
     * @returns {"highway" | "SK" | "portal" | "normal"}
     */
    decideRoomStatus(roomName) {
        parsed = /^[WE]([0-9]+)[NS]([0-9]+)$/.exec(roomName);
        if (parsed[1] % 10 === 0 || parsed[2] % 10 === 0) return "highway";
        let fMod = parsed[1] % 10;
        let sMod = parsed[2] % 10;
        let isSK = !(fMod === 5 && sMod === 5) &&
            ((fMod >= 4) && (fMod <= 6)) &&
            ((sMod >= 4) && (sMod <= 6));
        if (isSK) return "SK";
        if (fMod === 5 && sMod === 5) return "portal";
        return "normal";
    },
    /**
     * @param {string} message
     */
    PrintErr(message) {
        console.log(`<p style="display:inline;color:red;">Error: </p> ${message}`);
        Game.notify(message);
    },
    clearLog() {
        console.log("<script>angular.element(document.getElementsByClassName('fa fa-trash ng-scope')[0].parentNode).scope().Console.clear()</script>");
    },
    /**
     * @param {{x : number, y : number, roomName : string}} pos
     */
    constructRoomPosition(pos) {
        return new RoomPosition(pos.x, pos.y, pos.roomName);
    },
    /**
     * @param {ResourceConstant} key
     */
    icon(key) {
        return `<img src="//static.screeps.com/upload/mineral-icons/${key}.png" alt="${key}">`;
    },
    PriorityQueue : PriorityQueue,
    username : username,
    StructureConstants : {
        [STRUCTURE_EXTENSION]       : STRUCTURE_EXTENSION,
        [STRUCTURE_RAMPART]         : STRUCTURE_RAMPART,
        [STRUCTURE_ROAD]            : STRUCTURE_ROAD,
        [STRUCTURE_SPAWN]           : STRUCTURE_SPAWN,
        [STRUCTURE_LINK]            : STRUCTURE_LINK,
        [STRUCTURE_WALL]            : STRUCTURE_WALL,
        [STRUCTURE_KEEPER_LAIR]     : STRUCTURE_KEEPER_LAIR,
        [STRUCTURE_CONTROLLER]      : STRUCTURE_CONTROLLER,
        [STRUCTURE_STORAGE]         : STRUCTURE_STORAGE,
        [STRUCTURE_TOWER]           : STRUCTURE_TOWER,
        [STRUCTURE_OBSERVER]        : STRUCTURE_OBSERVER,
        [STRUCTURE_POWER_BANK]      : STRUCTURE_POWER_BANK,
        [STRUCTURE_POWER_SPAWN]     : STRUCTURE_POWER_SPAWN,
        [STRUCTURE_EXTRACTOR]       : STRUCTURE_EXTRACTOR,
        [STRUCTURE_LAB]             : STRUCTURE_LAB,
        [STRUCTURE_TERMINAL]        : STRUCTURE_TERMINAL,
        [STRUCTURE_CONTAINER]       : STRUCTURE_CONTAINER,
        [STRUCTURE_NUKER]           : STRUCTURE_NUKER,
        [STRUCTURE_FACTORY]         : STRUCTURE_FACTORY,
        [STRUCTURE_INVADER_CORE]    : STRUCTURE_INVADER_CORE,
        [STRUCTURE_PORTAL]          : STRUCTURE_PORTAL
    },
    Response        : Response,
    ResponsePatch   : ResponsePatch,
    DisjointSet     : DisjointSet,
    AttackMatrix    : AttackMatrix,
    HealMatrix      : HealMatrix
};

module.exports = utils;