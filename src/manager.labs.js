/**
 * @module manager.labs
 * 
 * @typedef {LabManager} LabManager
 */
const TaskConstructor       = require("./manager.tasks").TaskConstructor;
const Transaction           = require("./money.prototype").Transaction;
const icon                  = require("./util").icon;
const getPrice              = require("./util").getPrice;
const checkForStore         = require("./util").checkForStore;
const checkForFreeStore     = require("./util").checkForFreeStore;
const getCacheExpiration    = require("./util").getCacheExpiration;

const DEBUG = true;

const COMPOUND_TIERS = {
    0 : {
        OH : ["O", "H"],
        ZK : ["Z", "K"],
        UL : ["U", "L"],
        G : ["ZK", "UL"]
    },
    1 : {
        UH : ["U", "H"],
        UO : ["U", "O"],
        KH : ["K", "H"],
        KO : ["K", "O"],
        LH : ["L", "H"],
        LO : ["L", "O"],
        ZH : ["Z", "H"],
        ZO : ["Z", "O"],
        GH : ["G", "H"],
        GO : ["G", "O"]
    },
    2 : {
        UH2O : ["UH", "OH"],
        UHO2 : ["UO", "OH"],
        KH2O : ["KH", "OH"],
        KHO2 : ["KO", "OH"],
        LH2O : ["LH", "OH"],
        LHO2 : ["LO", "OH"],
        ZH2O : ["ZH", "OH"],
        ZHO2 : ["ZO", "OH"],
        GH2O : ["GH", "OH"],
        GHO2 : ["GO", "OH"]
    },
    3 : {
        XUH2O : ["UH2O", "X"],
        XUHO2 : ["UHO2", "X"],
        XKH2O : ["KH2O", "X"],
        XKHO2 : ["KHO2", "X"],
        XLH2O : ["LH2O", "X"],
        XLHO2 : ["LHO2", "X"],
        XZH2O : ["ZH2O", "X"],
        XZHO2 : ["ZHO2", "X"],
        XGH2O : ["GH2O", "X"],
        XGHO2 : ["GHO2", "X"]
    }
};
/** @type {{[tier : string] : Set<MineralCompoundConstant>}} */
const COMPOUND_TIERS_INGREDIENTS = {};
Object.keys(COMPOUND_TIERS).forEach(v => COMPOUND_TIERS_INGREDIENTS[v] = new Set());
Object.keys(COMPOUND_TIERS).forEach(v => Object.values(COMPOUND_TIERS[v]).forEach(([a, b]) => COMPOUND_TIERS_INGREDIENTS[v].add(a) && COMPOUND_TIERS_INGREDIENTS[v].add(b)));
const COMPOUND_TIER_NUM = 4;
const TIER_COMPOUNDS = {};
/**
 * @param {MineralCompoundConstant} mineralType
 * @returns {number}
 */
function getTier(mineralType) {
    if (TIER_COMPOUNDS[mineralType]) return TIER_COMPOUNDS[mineralType];
    for (let i = COMPOUND_TIER_NUM - 1; i >= 0; --i) if (COMPOUND_TIERS[i][mineralType]) return TIER_COMPOUNDS[mineralType] = i;
}
/**
 * @param {MineralCompoundConstant | MineralConstant} mineralType
 */
function isAllowedToBuy(mineralType) {
    if (MINERAL_MIN_AMOUNT[mineralType]) return true;
    else if (global.Lucy.Rules.lab.allowedToBuyMinerals[mineralType]) return true;
    return false;
}
class LabUnit {
    /**
     * @private
     */
    update() {
        if (global.signals.IsStructureDestroy[this.roomName]) this.init();
    }
    init() {
        // Avoid Duplicate `init` in the same tick
        if (this["_init_tick"] && this["_init_tick"] >= Game.time) return;
        this["_init_tick"] = Game.time;
        /** @type {Array<Id<StructureLab>>} */
        this.inputLabIds = [];
        /** @type {Array<Id<StructureLab>>} */
        this.outputLabIds = [];
        this.working = false;
        this.labStatus = {};
        /** @type {StructureLab[]} */
        const labs = global.MapMonitorManager.FetchStructureWithTag(this.roomName, "labs", STRUCTURE_LAB);
        labs.forEach(lab => lab.pos.x > this.LeftTopPos.x && lab.pos.x < this.RightBottomPos.x && lab.pos.y > this.LeftTopPos.y && lab.pos.y < this.RightBottomPos.y ? this.inputLabIds.push(lab.id) : this.outputLabIds.push(lab.id));
        labs.forEach(lab => this.labStatus[lab.id] = {transfer : "working", boost : false});
        if (this.inputLabIds.length === 2 && this.outputLabIds.length > 0) {
            this.working = true;
            this.updateRecipe();
        } else {
            this.working = false;
            this.recipe = null;
        }
    }
    /**
     * @private
     * @param {MineralCompoundConstant | MineralConstant} mineralType
     * @returns {number}
     */
    sum(mineralType) {
        return global.ResourceManager.Sum(this.roomName, mineralType, {type : "retrieve", allowStore : true, allowToHarvest : false, confinedInRoom : true, key : "labs"});
    }
    /**
     * @private
     * @param {StructureLab} lab
     * @param {MineralCompoundConstant | MineralConstant | RESOURCE_ENERGY | null} mineralType
     * @returns {boolean}
     */
    fill(lab, mineralType) {
        // Special Case : RESOURCE_ENERGY
        if (mineralType === RESOURCE_ENERGY) {
            if (lab.store.getFreeCapacity(RESOURCE_ENERGY) === 0) return true;
            const fetchStructure = global.ResourceManager.Query(lab, RESOURCE_ENERGY, lab.store.getFreeCapacity(RESOURCE_ENERGY), {type : "retrieve", confinedInRoom : true});
            if (!fetchStructure) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Cannot find a fetching structure for ${lab} (RESOURCE_ENERGY)`);
                return false;
            }
            const transaction = new Transaction(lab, fetchStructure, getPrice(RESOURCE_ENERGY) * Math.min(checkForStore(fetchStructure, RESOURCE_ENERGY), lab.store.getFreeCapacity(RESOURCE_ENERGY)), {type : "resource", info : {resourceType : RESOURCE_ENERGY, amount : Math.min(checkForStore(fetchStructure, RESOURCE_ENERGY), lab.store.getFreeCapacity(RESOURCE_ENERGY))}});
            transaction.Confirm();
            TaskConstructor.TransferTask({fromId : fetchStructure.id, fromPos : fetchStructure.pos}, {toId : lab.id, toPos : lab.pos}, {list : {[RESOURCE_ENERGY] : lab.store.getFreeCapacity(RESOURCE_ENERGY)}, transactions : {[RESOURCE_ENERGY] : [transaction]}}, {merge : false});
            return true;
        }
        /**
         * `disabled` means that this lab is under transition. It should not to be disturbed.
         */
        if (this.labStatus[lab.id].transfer === "disabled") return false;
        /**
         * In this case, `fill` is already satisfied.
         */
        if (mineralType === null && !lab.mineralType) return true;
        else if (lab.mineralType === mineralType && lab.store.getFreeCapacity(mineralType) === 0) return true;

        const outFunc = (storeStructureId, callback) => {
            return function () {
                if (!storeStructureId || !Game.getObjectById(storeStructureId)) {
                    if (callback) callback();
                    return false;
                }
                const transaction = new Transaction(Game.getObjectById(storeStructureId), lab, getPrice(lab.mineralType) * lab.store[lab.mineralType], {type : "resource", info : {resourceType : lab.mineralType, amount : Math.min(checkForFreeStore(Game.getObjectById(storeStructureId), lab.mineralType), lab.store[lab.mineralType])}});
                transaction.Confirm();
                TaskConstructor.TransferTask({fromId : lab.id, fromPos : lab.pos}, {toId : storeStructureId, toPos : Game.getObjectById(storeStructureId).pos}, {list : {[lab.mineralType] : Math.min(checkForFreeStore(Game.getObjectById(storeStructureId), lab.mineralType), lab.store[lab.mineralType])}, transactions : {[lab.mineralType] : [transaction]}}, {callback : callback});
                return true;
            };
        };
        const inFunc = (fetchStructureId, callback) => {
            return function () {
                if (!fetchStructure || !Game.getObjectById(fetchStructureId)) {
                    if (callback) callback();
                    return false;
                }
                const transaction = new Transaction(lab, Game.getObjectById(fetchStructureId), getPrice(mineralType) * lab.store.getCapacity(mineralType), {type : "resource", info : {resourceType : mineralType, amount : Math.min(checkForStore(Game.getObjectById(fetchStructureId), mineralType), lab.store.getCapacity(mineralType))}});
                transaction.Confirm();
                TaskConstructor.TransferTask({fromId : fetchStructureId, fromPos : Game.getObjectById(fetchStructureId).pos}, {toId : lab.id, toPos : lab.pos}, {list : {[mineralType] : Math.min(checkForStore(Game.getObjectById(fetchStructureId), mineralType), lab.store.getCapacity(mineralType))}, transactions : {[mineralType] : [transaction]}}, {callback : callback});
            };
        };
        let storeStructure = null, fetchStructure = null;
        if (lab.mineralType && lab.mineralType !== mineralType) {
            storeStructure = global.ResourceManager.Query(lab, lab.mineralType, lab.store[lab.mineralType], {type : "store", confinedInRoom : true});
            if (!storeStructure) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Cannot find a storing structure for ${lab}`);
                return false;
            }
        }
        if (mineralType) {
            fetchStructure = global.ResourceManager.Query(lab, mineralType, lab.store.getCapacity(mineralType), {type : "retrieve", confinedInRoom : true, key : "labs"});
            if (!fetchStructure) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Cannot find a fetching structure for ${lab} (mineralType : ${mineralType})`);
                return false;
            }
        }
        if (DEBUG) console.log(`[${this.roomName}] ${lab} <= ${mineralType} : storeStructure ${storeStructure}, fetchStructure ${fetchStructure}`);
        this.labStatus[lab.id].transfer = "disabled";
        outFunc(storeStructure ? storeStructure.id : null, inFunc(fetchStructure ? fetchStructure.id : null, () => this.labStatus[lab.id].transfer = "working"))();
        return true;
    }
    /**
     * @private
     * @param {{mineralTypes : [MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant], tier : number, amount : number, repo : number, product : MineralCompoundConstant}} a
     * @param {{mineralTypes : [MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant], tier : number, amount : number, repo : number, product : MineralCompoundConstant}} b
     * @param {boolean} ensureAllowedToBuy
     * @returns {{mineralTypes : [MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant], tier : number, amount : number, repo : number, product : MineralCompoundConstant}}
     */
    cmp(a, b) {
        const checkReactionAmount = global.Lucy.Rules.lab.checkReactionAmount;
        if (a.amount > 0 && b.amount > 0) {
            if (a.repo >= checkReactionAmount && b.repo < checkReactionAmount) return b;
            else if (a.repo < checkReactionAmount && b.repo >= checkReactionAmount) return a;
            else {
                if (a.tier > b.tier) return a;
                else if (a.tier < b.tier) return b;
                else if (a.repo > b.repo) return b;
                else return a;
            }
        }
        if (a.amount === 0 && b.amount !== 0) {
            if (b.repo < checkReactionAmount) return b;
            else if (a.repo < checkReactionAmount) return a;
            else return b;
        }
        if (a.amount !== 0 && b.amount === 0) {
            if (a.repo < checkReactionAmount) return a;
            else if (b.repo < checkReactionAmount) return b;
            else return a;
        }
        if (a.amount === 0 && b.amount === 0) {
            if (a.tier > b.tier) return a;
            else if (a.tier < b.tier) return b;
            else if (a.repo > b.repo) return b;
            else return a;
        }
    }
    /**
     * @private
     * @param {MineralCompoundConstant | MineralConstant} u
     * @param {number} amountU `amountU` is guaranteed to be bigger than 0.
     * @returns {null | {mineralTypes : [MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant], tier : number, amount : number, repo : number, product : MineralCompoundConstant}}
     */
    find(u, amountU) {
        if (!REACTIONS[u]) return null;
        /**
         * @type {number}
         * Obviously, if we do not set a maximum limitation for minerals, some mineralTypes could never get the chance of being produced,
         * while some others could be overproduced. Thus, when amount of mineralType reaches this limitation, it is checked and disabled
         * until there is no other mineralTypes whose amount is below this line.
         */
        const checkReactionAmount = global.Lucy.Rules.lab.checkReactionAmount;
        let tier = null, amount = null, retMineralType = null, producedAmount = null;
        const v_s = Object.keys(REACTIONS[u]).sort((a, b) => this.sum(REACTIONS[u][b]) - this.sum(REACTIONS[u][a]));
        for (const v of v_s) {
            const _producedAmount = this.sum(REACTIONS[u][v]);
            const _tier = getTier(REACTIONS[u][v]);
            const mineralTypeVAmount = Math.min(this.sum(v), amountU);
            if (DEBUG) console.log(`[${this.roomName}] ${u} & ${v} => ${REACTIONS[u][v]} : repo ${_producedAmount}, amount ${mineralTypeVAmount}, tier ${_tier}`);
            if (!retMineralType || producedAmount >= checkReactionAmount || (_tier > tier && (mineralTypeVAmount > 0 || isAllowedToBuy(v))) || (_tier === tier && (mineralTypeVAmount > amount || isAllowedToBuy(v))) || (_tier < tier && amount === 0 && isAllowedToBuy(v))) {
                retMineralType = v;
                amount = mineralTypeVAmount;
                tier = _tier;
                producedAmount = _producedAmount;
            }
        }
        return {mineralTypes : [u, retMineralType], tier : tier, amount : amount, repo : producedAmount, product : REACTIONS[u][retMineralType]};
    }
    /**
     * NOTICE : `fetchRecipe` assumes that
     *  - Amount of Input Labs >= 2 && Amount of Output Labs > 0
     *  - Recipe needs to be updated.
     * @private
     */
    updateRecipe() {
        this.recipe = null;
        this.recipeFunction = false;
        /**
         * Priorities:
         *  - Existing Resources in Input Labs.
         *      - 2 : Easy
         *      - 1 : Go over the list of reactions. Higher tier and greater produced amount is preferred.
         *          - If nothing is found, compounds requiring another basic mineral is selected so that `Request` is issued.
         *          - Special Case : "X" => Lab is cleaned, and procedure progresses into `Nothing in Input Labs`.
         *  - Nothing in Input Labs.
         *      - Determine based on storing in the room (Higher tier and greater produced amount is preferred.)
         */
        const currentResources = this.InputLabs.filter(l => l.mineralType).map(l => [l.mineralType, l.store[l.mineralType]]);
        if (currentResources.length === 2 && REACTIONS[currentResources[0][0]] && REACTIONS[currentResources[0][0]][currentResources[1][0]]) {
            this.recipe = currentResources.map(v => v[0]);
            global.Log.room(this.roomName, global.Dye.purple(`Recipe`), global.Dye.blue(`Apply existing Resources in Input Labs`), global.Dye.white(`${icon(this.recipe[0])} + ${icon(this.recipe[1])} => ${icon(REACTIONS[this.recipe[0]][this.recipe[1]])}`));
            return;
        }
        const matches = currentResources.map(v => this.find(v[0], v[1])).filter(o => o && (o.amount > 0 || isAllowedToBuy(o.mineralTypes[1])));
        if (matches.length > 0) {
            const ret = matches.length === 2 ? this.cmp(matches[0], matches[1]) : matches[0];
            this.recipe = ret.mineralTypes;
            global.Log.room(this.roomName, global.Dye.purple(`Recipe`), global.Dye.blue(`Determine based on one Input Lab`), global.Dye.white(`${icon(this.recipe[0])} + ${icon(this.recipe[1])} => ${icon(REACTIONS[this.recipe[0]][this.recipe[1]])}`));
            return;
        }
        // Pure New Recipe
        /** @type {[MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant][]} */
        const pureNewCandidates = [];
        for (let i = COMPOUND_TIER_NUM - 1; i >= 0; --i) {
            const ingredients = Array.from(COMPOUND_TIERS_INGREDIENTS[i]).map(v => {return {mineralType : v, amount : this.sum(v)};}).filter(v => v.amount > 0).map(v => this.find(v.mineralType, v.amount)).filter(o => o && (o.amount > 0 || isAllowedToBuy(o.mineralTypes[1])));
            if (ingredients.length === 0) continue;
            let ret = ingredients[0];
            for (let i = 1; i < ingredients.length; ++i) ret = this.cmp(ret, ingredients[i]);
            if (ret.repo >= global.Lucy.Rules.lab.checkReactionAmount) pureNewCandidates.push(ret.mineralTypes);
            else {
                this.recipe = ret.mineralTypes;
                break;
            }
        }
        if (!this.recipe && pureNewCandidates.length > 0) {
            this.recipe = pureNewCandidates[0];
            for (let i = 1; i < pureNewCandidates.length; ++i) this.recipe = this.cmp(this.recipe, pureNewCandidates[i]);
        }
        if (this.recipe) global.Log.room(this.roomName, global.Dye.purple(`Recipe`), global.Dye.blue(`Pure New One`), global.Dye.white(`${icon(this.recipe[0])} + ${icon(this.recipe[1])} => ${icon(REACTIONS[this.recipe[0]][this.recipe[1]])}`));
        // There isn't any existing mineralTypes
        return;
    }
    /**
     * @returns {StructureLab[]}
     */
    get InputLabs() {
        if (!this["_inputLabs_tick"] || this["_inputLabs_tick"] < Game.time) {
            this["_inputLabs_tick"] = Game.time;
            return this["_inputLabs"] = this.inputLabIds.map(Game.getObjectById);
        } else return this["_inputLabs"];
    }
    /**
     * @returns {StructureLab[]}
     */
    get OutputLabs() {
        if (!this["_outputLabs_tick"] || this["_outputLabs_tick"] < Game.time) {
            this["_outputLabs_tick"] = Game.time;
            return this["_outputLabs"] = this.outputLabIds.map(Game.getObjectById);
        } else return this["_outputLabs"];
    }
    /**
     * @private
     */
    delay() {
        this["_tick"] = Game.time + getCacheExpiration(100, 10);
        return;
    }
    /**
     * @param {MineralBoostConstant} mineralType
     * @param {Creep} creep
     * @returns {Id<StructureLab> | null}
     */
    Reserve(mineralType, creep) {
        if (this.mineralType2labs[mineralType]) {
            this.mineralType2creeps[mineralType].add(creep);
            this.creep2mineralType[creep.id] = mineralType;
            return this.mineralType2labs[mineralType];
        }
        /** Case : No Spare Lab */
        if (Object.keys(this.mineralType2labs).length === this.OutputLabs.length) return null;
        const lab = this.OutputLabs.filter(l => !this.labStatus[l.id].boost && this.labStatus[l.id].transfer === "working" && l.mineralType === mineralType)[0] || this.OutputLabs.filter(l => !this.labStatus[l.id].boost && this.labStatus[l.id].transfer === "working")[0];
        /** Case : No Working Lab */
        if (!lab) return null;
        /** Case : No Available Minerals or Energy */
        if (!this.fill(lab, mineralType) || !this.fill(lab, RESOURCE_ENERGY)) return null;
        /** Register Process */
        this.labStatus[l.id].boost = true;
        this.labs2mineralType[lab.id] = mineralType;
        this.mineralType2labs[mineralType] = lab.id;
        this.creep2mineralType[creep.id] = mineralType;
        this.mineralType2creeps[mineralType] = new Set([creep.id]);
        return lab.id;
    }
    /**
     * @param {Creep} creep
     */
    Release(creep) {
        if (!this.creep2mineralType[creep.id]) return;
        const mineralType = this.creep2mineralType[creep.id];
        const labId = this.mineralType2labs[mineralType];
        this.mineralType2creeps[mineralType].delete(creep.id);
        if (this.mineralType2creeps[mineralType].size === 0) {
            // Release Lab
            this.labStatus[labId].boost = false;
            delete this.labs2mineralType[labId];
            delete this.mineralType2labs[mineralType];
            delete this.mineralType2creeps[mineralType];
        }
        delete this.creep2mineralType[creep.id];
    }
    /**
     * `Fill` is different from `fill`.
     * `Fill` is designed to explicitly trigger filling reserved lab with boosted compound and energy.
     * @param {Creep} creep
     * @param {"compound" | "energy"} type
     * @returns {boolean}
     */
    Fill(creep, type) {
        if (!this.creep2mineralType[creep.id]) return false;
        const mineralType = this.creep2mineralType[creep.id];
        const lab = Game.getObjectById(this.mineralType2labs[mineralType]);
        if (type === "compound" && this.labStatus[lab.id].transfer === "working" && !this.fill(lab, mineralType)) return false;
        else if (type === "energy" && !this.fill(lab, RESOURCE_ENERGY)) return false;
        return true;
    }
    Display() {
        const visual = new RoomVisual(this.roomName);
        /**
         * Display : `recipe`
         */
        if (this.recipe) {
            const posU = new RoomPosition(this.LeftTopPos.x + 1, this.LeftTopPos.y + 1, this.LeftTopPos.roomName), posV = new RoomPosition(this.RightBottomPos.x - 1, this.RightBottomPos.y - 1, this.RightBottomPos.roomName);
            visual.text(this.recipe[0], posU, {color : "blue"});
            visual.text(this.recipe[1], posV, {color : "blue"});
        }
        if (this["_tick"]) {
            visual.text(this["_tick"] - Game.time, this.LeftTopPos);
        }
    }
    Run() {
        /**
         * Checking for Structure Destroy
         */
        this.update();
        /**
         * Case : Input Labs and Output Labs are not ready.
         */
        if (!this.working) return;
        /**
         * Case : Delay is still in effect.
         */
        if (this["_tick"] && this["_tick"] > Game.time) return;
        /**
         * Case : Delay marches out. `recipe` needs to be updated.
         */
        if (this["_tick"] && this["_tick"] <= Game.time) {
            this["_tick"] = null;
            console.log(`Update Recipe from _tick`);
            this.updateRecipe();
        }
        /**
         * Case : No available or usable recipe => Delay
         */
        if (!this.recipe) {
            if (DEBUG) console.log(`[${this.roomName}] Delay from lacking of recipe.`);
            return this.delay();
        }
        /**
         * Prepare Working Labs
         */
        const _workingInputLabs = this.InputLabs.filter(lab => this.labStatus[lab.id].transfer === "working" && !this.labStatus[lab.id].boost);
        const workingOutputLabs = this.OutputLabs.filter(lab => this.labStatus[lab.id].transfer === 'working' && !this.labStatus[lab.id].boost);
        /**
         * Case : `recipe` run out of resources.
         */
        if (this.recipeFunction && (_workingInputLabs.length !== 2 || _workingInputLabs.filter(l => !l.mineralType || l.store[l.mineralType] < 5).length > 0)) {
            this.updateRecipe();
            return;
        }
        /**
         * Fill up InputLabs
         */
        const workingInputLabs = {[this.recipe[0]] : null, [this.recipe[1]] : null};
        if (_workingInputLabs.length === 2) {
            const parseLab = lab => lab.mineralType && lab.store[lab.mineralType] >= 5 ? lab.mineralType : null;
            const u = parseLab(_workingInputLabs[0]), v = parseLab(_workingInputLabs[1]);
            const t_u = this.recipe[0], t_v = this.recipe[1];
            const l_u = _workingInputLabs[0], l_v = _workingInputLabs[1];
            // if (DEBUG) console.log(u, v, t_u, t_v);
            if (u === t_u && v === t_v) { // Case : 2 matches
                workingInputLabs[t_u] = l_u;
                workingInputLabs[t_v] = l_v;
            } else if (v === t_u && u === t_v) {
                workingInputLabs[t_u] = l_v;
                workingInputLabs[t_v] = l_u;
            } else if (u === t_u) { // Case : 1 match.
                workingInputLabs[t_u] = l_u;
                // if (DEBUG) console.log(v, l_v, t_v);
                if (!this.fill(l_v, t_v)) return this.delay();
            } else if (u === t_v) {
                workingInputLabs[t_v] = l_u;
                // if (DEBUG) console.log(v, l_v, t_u);
                if (!this.fill(l_v, t_u)) return this.delay();
            } else if (v === t_u) {
                workingInputLabs[t_u] = l_v;
                // if (DEBUG) console.log(u, l_u, t_v);
                if (!this.fill(l_u, t_v)) return this.delay();
            } else if (v === t_v) {
                workingInputLabs[t_v] = l_v;
                // if (DEBUG) console.log(u, l_u, t_u);
                if (!this.fill(l_u, t_u)) return this.delay();
            } else { // Case : 0 match.
                if (!this.fill(l_u, t_u) || !this.fill(l_v, t_v)) return this.delay();
            }
        } else return;
        /**
         * Clean up OutputLabs
         * Should be put after filling Input Labs, because of potential transfering between output labs and input labs.
         */
        workingOutputLabs.filter(lab => lab.mineralType && (lab.mineralType !== REACTIONS[this.recipe[0]][this.recipe[1]] || lab.store.getFreeCapacity(lab.mineralType) === 0) ).forEach(w => this.fill(w, null));
        // if (DEBUG) console.log(`[${this.roomName}] Working Input Labs : ${JSON.stringify(workingInputLabs)}`);
        /**
         * Case : Input Labs or Output Labs are not working.
         */
        if (this.InputLabs.filter(lab => this.labStatus[lab.id].transfer === "working" && !this.labStatus[lab.id].boost).length < 2 || this.OutputLabs.filter(lab => this.labStatus[lab.id].transfer === "working" && !this.labStatus[lab.id].boost).length <= 0) return;
        this.OutputLabs.filter(lab => this.labStatus[lab.id].transfer === "working" && !this.labStatus[lab.id].boost && lab.cooldown === 0).forEach(l => l.runReaction(this.InputLabs[0], this.InputLabs[1]) === OK ? this.recipeFunction = true : null);
    }
    /**
     * @param {string} roomName
     */
    constructor(roomName) {
        this.roomName = roomName;
        /** @type { [number, number, number, number] } @private */
        this._y1_x1_y2_x2 = Memory.autoPlan[this.roomName]["labUnit"][0];
        this.LeftTopPos = new RoomPosition(this._y1_x1_y2_x2[1], this._y1_x1_y2_x2[0], this.roomName);
        this.RightBottomPos = new RoomPosition(this._y1_x1_y2_x2[3], this._y1_x1_y2_x2[2], this.roomName);
        /** @type {[MineralCompoundConstant | MineralConstant, MineralCompoundConstant | MineralConstant] | null} */
        this.recipe = null;
        /**
         * @type {{[id : string] : MineralCompoundConstant | MineralConstant | null}}
         * NOTICE : At most this.OutputLabs.length - 1 labs could be reserved.
         */
        this.labs2mineralType = {};
        /** @type { {[mineralType in MineralBoostConstant] : Id<StructureLab>} } */
        this.mineralType2labs = {};
        /** @type { {[mineralType in MineralBoostConstant] : Set<Id<Creep>>} } */
        this.mineralType2creeps = {};
        /** @type { {[id : string] : MineralBoostConstant} } */
        this.creep2mineralType = {};
        /** @type {{[id : string] : {transfer : "working" | "disabled", boost : boolean}}} */
        this.labStatus = {};
        this.init();
    }
}
class LabManager {
    /**
     * @param {string} roomName
     */
    Update(roomName) {
        if (!this.room2labUnit[roomName]) {
            if (!Memory.autoPlan[roomName] || !Memory.autoPlan[roomName].labUnit || Memory.autoPlan[roomName].labUnit.length <= 0) return;
            this.room2labUnit[roomName] = new LabUnit(roomName);
        } else this.room2labUnit[roomName].init();
    }
    Run() {
        Object.values(this.room2labUnit).forEach(l => l.Run());
    }
    Display() {
        Object.values(this.room2labUnit).forEach(l => l.Display());
    }
    /**
     * @param {MineralBoostConstant} mineralType
     * @param {Creep} creep
     */
    Reserve(mineralType, creep) {
        if (!this.room2labUnit[creep.room.name]) return null;
        return this.room2labUnit[creep.room.name].Reserve(mineralType, creep);
    }
    /**
     * @param {Creep} creep
     */
    Release(creep) {
        if (!this.room2labUnit[creep.room.name]) return null;
        return this.room2labUnit[creep.room.name].Release(mineralType, creep);
    }
    /**
     * @param {Creep} creep
     * @param {"compound" | "energy"} type
     * @returns {boolean}
     */
    Fill(creep, type) {
        if (!this.room2labUnit[creep.room.name]) return false;
        return this.room2labUnit[creep.room.name].Fill(creep, type);
    }
    constructor() {
        /** @type { {[roomName : string] : LabUnit} } */
        this.room2labUnit = {};
    }
}
const _labManager = new LabManager();
global.Lucy.App.on({
    init : () => global.LabManager = _labManager,
    tickStart : () => global.LabManager.Run(),
    tickEnd : () => global.LabManager.Display()
});