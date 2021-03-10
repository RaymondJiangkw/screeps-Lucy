/**
 * @module manager.map
 * 
 * @typedef {Map} Map
 * @typedef {MapMonitor} MapMonitor
 * @typedef {Planner} Planner
 */
const getCacheExpiration    =   require('./util').getCacheExpiration;
const constructArray        =   require('./util').constructArray;
const isConstructionSite    =   require('./util').isConstructionSite;
const calcInRoomDistance    =   require('./util').calcInRoomDistance;
const calcRoomDistance      =   require('./util').calcRoomDistance;
const decideRoomStatus      =   require('./util').decideRoomStatus;
const isMyRoom              =   require('./util').isMyRoom;
const PriorityQueue         =   require('./util').PriorityQueue;
const Response              =   require("./util").Response;
const ResponsePatch         =   require("./util").ResponsePatch;
const DisjointSet           =   require("./util").DisjointSet;
const username              =   require('./util').username;
const StructureConstants    =   require("./util").StructureConstants;
const TaskConstructor       =   require('./manager.tasks').TaskConstructor;
const Notifier              =   require("./visual.notifier").Notifier;
const CHAR_HEIGHT           =   require("./visual.notifier").CHAR_HEIGHT;
const MineralSVG            =   require("./screeps-svg").Mineral;

const Traveler = require("./Traveler");
const profiler = require('./screeps-profiler');
const util_mincut = require("./minCutWallRampartsPlacement");

const DEBUG = false;

/**
 * Class Representation for a Unit
 * Road Nodes will be used to calculate path.
 */
class Unit {
    /**
     * Called to collect properties of `this.pattern`.
     * @private
     */
    prep() {
        /** @private */
        this._dx = this.pattern[0].length;
        /** @private */
        this._dy = this.pattern.length;
        /* Reshape pattern into 3-dimensions one */
        for (let j = 0; j < this._dy; ++j) {
            for (let i = 0; i < this._dx; ++i) {
                // NO COMPILE HERE : take care ourselves
                if (typeof this.pattern[j][i] === "string") this.pattern[j][i]=[this.pattern[j][i]];
            }
        }
        /** @type { {[type in StructureConstant]? : number} } @private*/
        this.num = {};
        /** @private @type { {[type in StructureConstant]? : Array<[number,number]>} } */
        this.structureType2pos = {};
        /** @private */
        this.vacantSpace = 0;
        /** @private */
        this._total = 0;
        /**
         * Compile Process
         *  - Filter out Options
         *  - Collect Information for further usage
         */
        for (let y = 0; y < this.pattern.length; ++y) {
            for (let x = 0; x < this.pattern[y].length; ++x) {
                /**
                 * Signal whether position here requires a vacant space.
                 */
                let isVacantSpaceNeeded = true;
                /**
                 * Modifiers, used to control the behaviors.
                 */
                let modifiers = this.pattern[y][x].filter(v => !(StructureConstants[v] || v === this.PLACE_ANY || v === this.PLACE_VACANT));
                this.pattern[y][x] = this.pattern[y][x].filter(v => StructureConstants[v] || v === this.PLACE_ANY || v === this.PLACE_VACANT);
                /**
                 * Mount Modifiers directly on `this.pattern[y][x]`.
                 */
                modifiers.forEach(modifier => this.pattern[y][x][modifier] = true);
                /**
                 * Ensure PLACE_ANY and PLACE_VACANT are not set with others.
                 */
                if ((this.pattern[y][x].indexOf(this.PLACE_ANY) !== -1 || this.pattern[y][x].indexOf(this.PLACE_VACANT) !== -1) && this.pattern[y][x].length > 1) {
                    console.log(`<p style="display:inline;color:red;">[Compile]</p> PLACE_ANY and PLACE_VACANT cannot be set with other options in unit "${this.tag}"`);
                }
                for (let k = 0; k < this.pattern[y][x].length; ++k) {
                    if (this.pattern[y][x][k] === this.PLACE_ANY) {
                        isVacantSpaceNeeded = false;
                        continue;
                    }
                    if (this.pattern[y][x][k] === this.PLACE_VACANT) continue;
                    /**
                     * Information Collection
                     */
                    ++this._total;
                    if (!this.num[this.pattern[y][x][k]]) this.num[this.pattern[y][x][k]] = 0;
                    if (!this.structureType2pos[this.pattern[y][x][k]]) this.structureType2pos[this.pattern[y][x][k]] = [];
                    ++this.num[this.pattern[y][x][k]];
                    this.structureType2pos[this.pattern[y][x][k]].push([y,x]);
                }
                if (isVacantSpaceNeeded) ++this.vacantSpace;
            }
        }
        this.containedStructureTypes = Object.keys(this.structureType2pos);
    }
    /**
     * @returns {number}
     */
    get TotalStructureNum() {
        return this._total;
    }
    /**
     * Used to speed up the finding process.
     */
    get VacantSpaceCnt() {
        return this.vacantSpace;
    }
    /**
     * @returns {Array<StructureConstant>}
     */
    get ContainedStructureTypes() {
        return this.containedStructureTypes;
    }
    /**
     * @returns {number}
     */
    get dx() {
        return this._dx;
    }
    /**
     * @returns {number}
     */
    get dy() {
        return this._dy;
    }
    get Tag() {
        return this.tag;
    }
    get Options() {
        return this.options;
    }
    /**
     * @param {Room} room
     * @param {number} y Top
     * @param {number} x Left
     * @returns {number}
     */
    EvaluatePos(room, y, x) {
        return this.evaluatePos(room, y, x);
    }
    /**
     * @param {StructureConstant} structureType
     * @returns {number}
     */
    CountStructure(structureType) {
        return this.num[structureType] || 0;
    }
    /**
     * @param {number} y
     * @param {number} x
     * @returns {Array<string>}
     */
    Fetch(y, x) {
        if (!this.pattern[y] || !this.pattern[y][x]) return [];
        return this.pattern[y][x];
    }
    /**
     * @param {StructureConstant} structureType
     * @returns {Array<[number,number]>} [y,x]
     */
    FetchStructurePos(structureType) {
        return this.structureType2pos[structureType] || [];
    }
    FetchConnectionNodes() {
        return this.FetchStructurePos(STRUCTURE_ROAD);
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     */
    Display(roomName, y, x) {
        new RoomVisual(roomName).rect(x, y, this.dx-1, this.dy-1, {"stroke" : this.strokeColor, "strokeWidth" : 0.5})
                                .text(this.pinText, x, y)
                                .text(this.pinText, x+this.dx-1,y+this.dy-1);
    }
    /**
     * @param {number} y
     * @param {number} x
     * @param {string} modifier
     * @returns {boolean}
     */
    FetchModifier(y, x, modifier) {
        return this.pattern[y][x][modifier] || false;
    }
    /**
     * @typedef {StructureConstant | "any" | "vacant"} PlaceIndicators
     * @typedef {"first_build_here"} Modifiers
     * @param {Array<Array<PlaceIndicators | Array<PlaceIndicators | Modifiers> >} pattern
     * @param {string} unitType
     * @param {string} tag used to denote all the structures belonging to this pattern
     * @param {string} pinText
     * @param {string} strokeColor
     * @param { {type : "distanceSum", objects : Array<StructureConstant | "sources" | MineralConstant | "mineral">, subjects : Array<StructureConstant> } } metrics
     * @param { {alongRoad? : boolean, avoidOverLapRoad? : boolean, avoidOtherToOverLapRoad? : boolean, primary? : boolean} } [options] specify some other specifications
     */
    constructor(pattern, unitType, tag, pinText, strokeColor, metrics, options = {}) {
        _.defaults(options, {alongRoad:false, avoidOverLapRoad : false, avoidOtherToOverLapRoad : false, primary : false});
        /** @private */
        this.pattern = pattern;
        this.unitType = unitType;
        /** @private */
        this.tag = tag;
        /** @private */
        this.pinText = pinText;
        /** @private */
        this.strokeColor = strokeColor;
        /** @private */
        this.metrics = metrics;
        /** @private */
        this.options = options;
        this.prep();
        if (this.metrics.type === "distanceSum") {
            /**
             * @param {Room} room
             * @param {number} y Top
             * @param {number} x Left
             */
            this.evaluatePos = (room, y, x) => {
                /**
                 * Positions away from exits are preferred.
                 */
                const exits = Game.map.describeExits(room.name);
                const evaluateDistanceToExit_X = (x_1, x_2) => {
                    let sum = 0;
                    if (exits[LEFT]) sum += Math.abs(x_1 - 0);
                    if (exits[RIGHT]) sum += Math.abs(49 - x_2);
                    return sum;
                };
                const evaluateDistanceToExit_Y = (y_1, y_2) => {
                    let sum = 0;
                    if (exits[TOP]) sum += Math.abs(y_1 - 0);
                    if (exits[BOTTOM]) sum += Math.abs(49 - y_2);
                    return sum;
                };
                let objects = [];
                for (const key of this.metrics.objects) {
                    // if (key === STRUCTURE_SPAWN) console.log(tag, planner.FetchRoomPlannedStructures(room.name, key));
                    if (key === "sources") objects = objects.concat(room["sources"].map(s => s.pos));
                    else if (key === "mineral") objects = objects.concat(room["mineral"].pos);
                    else if (key === STRUCTURE_CONTROLLER) objects = objects.concat(room.controller.pos);
                    else objects = objects.concat(planner.FetchRoomPlannedStructures(room.name, key));
                }
                let subjects = [];
                for (const structureType of this.metrics.subjects) subjects = subjects.concat(this.FetchStructurePos(structureType).map(p => new RoomPosition(p[1] + x, p[0] + y, room.name)));
                let ret = 0;
                subjects.forEach(s_p => objects.forEach(o_p => ret += s_p.getRangeTo(o_p)));
                return ret + evaluateDistanceToExit_X(x, x + this.dx - 1) + evaluateDistanceToExit_Y(y, y + this.dy - 1);
            };
        }
    }
};
/**
 * Static Variables
 */
Unit.prototype.PLACE_ANY            = "any";
Unit.prototype.PLACE_VACANT         = "vacant";
/**
 * Modifiers
 */
Unit.prototype.FIRST_BUILD_HERE     = "first_build_here";

/**
 * Class Representation for MapMonitor.
 * MapMonitor only cares about real-life situations, not including those "planned".
 * Single Class
 */
class MapMonitor {
    /**
     * @private
     * @param {number} y
     * @param {number} x
     */
    isValidPos(y, x) {
        if (y >= 0 && y < 50 && x >= 0 && x < 50) return true;
        return false;
    }
    /**
     * @param {number} y
     * @param {number} x
     * @returns {boolean}
     */
    isMargin(y, x) {
        return y === 0 || x === 0 || y === 49 || x === 49;
    }
    /**
     * Update Structure Cache whenever
     *  - ConstructionSite completes or cancels.
     *  - Structure is built or destroyed.
     *  - Visibility extends or shrinks.
     * @private
     * @returns {Boolean}
     */
    needUpdate() {
        const visibleRooms = Object.keys(Game.rooms).length;
        if (!this._visibleRooms || this._visibleRooms !== visibleRooms) {
            this._visibleRooms = visibleRooms;
            return true;
        }
        return global.signals.IsAnyNewStructure || global.signals.IsAnyNewConstructionSite || global.signals.IsAnyStructureDestroy || global.signals.IsAnyConstructionSiteCancel || false;
    }
    /**
     * Cache for Structure and ConstructionSite.
     * @private
     */
    updateStructureCache() {
        if (this.needUpdate() && (!this._lastUpdatingTick || Game.time > this._lastUpdatingTick)) {
            const _cpuUsed = Game.cpu.getUsed();
            console.log(String.fromCodePoint(0x231b), 'Structure Cache Updating ...');
            this._lastUpdatingTick = Game.time;
            /** @type { {[roomName : string] : Array<Array<Id<Structure>> >} } */
            this.structures = {};
            /** @type { {[roomName : string] : Array<Array<Id<ConstructionSite>> > } } */
            this.constructionSites = {};
            /** @type { {[roomName : string] : {[structureType in StructureConstant] : {structures : number, constructionSites : number, total : number}}} } */
            this.cnts = {};
            /**
             * Since Road, Container, ConstructedWall are not included in Game.structures. They should be manually added.
             * @param {Structure} structure
             */
            const addStructure = (structure) => {
                /** Record Id of Structure */
                if (!this.structures[structure.pos.roomName]) this.structures[structure.pos.roomName] = constructArray([50,50],new Array());
                this.structures[structure.pos.roomName][structure.pos.y][structure.pos.x].push(structure.id);
                /** Count Structure */
                if (!this.cnts[structure.pos.roomName]) this.cnts[structure.pos.roomName] = {};
                if (!this.cnts[structure.pos.roomName][structure.structureType]) this.cnts[structure.pos.roomName][structure.structureType] = {"structures" : 0, "constructionSites" : 0, "total" : 0};
                ++this.cnts[structure.pos.roomName][structure.structureType]["structures"];
                ++this.cnts[structure.pos.roomName][structure.structureType]["total"];
            };
            /**
             * Since constructionSites should be recorded in all visible rooms, Game.constructionSites is not suitable for its only involvement of owned constructionSites.
             * @param {ConstructionSite} constructionSite
             */
            const addConstructionSite = (constructionSite) => {
                /** Record Id of ConstructionSite */
                if (!this.constructionSites[constructionSite.pos.roomName]) this.constructionSites[constructionSite.pos.roomName] = constructArray([50,50], new Array());
                this.constructionSites[constructionSite.pos.roomName][constructionSite.pos.y][constructionSite.pos.x].push(constructionSite.id);
                /** Cnt */
                if (!this.cnts[constructionSite.pos.roomName]) this.cnts[constructionSite.pos.roomName] = {};
                if (!this.cnts[constructionSite.pos.roomName][constructionSite.structureType]) this.cnts[constructionSite.pos.roomName][constructionSite.structureType] = {"structures" : 0, "constructionSites" : 0, "total" : 0};
                ++this.cnts[constructionSite.pos.roomName][constructionSite.structureType]["constructionSites"];
                ++this.cnts[constructionSite.pos.roomName][constructionSite.structureType]["total"];
            };
            for (const roomName in Game.rooms) {
                /** road, container and wall need to be found instantly. */
                Game.rooms[roomName].find(FIND_STRUCTURES).forEach(s => addStructure(s));
                /** constructionSites need to be found instantly too. */
                Game.rooms[roomName].find(FIND_CONSTRUCTION_SITES).forEach(c => addConstructionSite(c));
            }
            global.Log.success('Cache Update Done', global.Dye.grey(`cpu-cost:${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`));
        }
    }
    /**
     * @private
     * @param {string} roomName
     */
    updateTerrainCache(roomName) {
        if (!this.terrains[roomName] || !this.roomVacantTerrain[roomName]) {
            this.terrains[roomName] = constructArray([50,50],0);
            this.roomVacantTerrain[roomName] = [];
            const terrain = new Room.Terrain(roomName);
            for (let y = 0; y < 50; ++y) {
                for (let x = 0; x < 50; ++x) {
                    this.terrains[roomName][y][x] = terrain.get(x, y);
                    if (this.terrains[roomName][y][x] !== TERRAIN_MASK_WALL) this.roomVacantTerrain[roomName].push(new RoomPosition(x, y, roomName));
                }
            }
        }
    }
    /**
     * @param {string} roomName
     * @returns {Array<Array<number>>}
     */
    FetchTerrain(roomName) {
        this.updateTerrainCache(roomName);
        return this.terrains[roomName];
    }
    /**
     * @param {string} roomName
     */
    FetchVacantSpace(roomName) {
        this.updateTerrainCache(roomName);
        return this.roomVacantTerrain[roomName];
    }
    /**
     * @private
     * @param {string} roomName
     */
    updateSpaceCache(roomName) {
        if (!this.spaces[roomName]) {
            const terrains = this.FetchTerrain(roomName);
            this.spaces[roomName] = constructArray([50,50],0);
            this.spaces[roomName].get = (y,x) => {
                if (y < 0 || y >= 50 || x < 0 || x >= 50) return 0;
                return this.spaces[roomName][y][x];
            };
            for (let y = 0; y < 50; ++y) {
                for (let x = 0; x < 50; ++x) {
                    /**
                     * Compute Vacant Spaces in the region whose right-bottom corner is (x, y) and left-top corner is (0, 0).
                     */
                    this.spaces[roomName][y][x] = this.spaces[roomName].get(y,x-1)+this.spaces[roomName].get(y-1,x)-this.spaces[roomName].get(y-1,x-1)+(terrains[y][x] === TERRAIN_MASK_WALL? 0 : 1);
                }
            }
        }
    }
    /**
     * Returns number of vacant spaces in the region.
     * @param {string} roomName
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @returns {number}
     */
    FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) {
        this.updateSpaceCache(roomName);
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        return this.spaces[roomName].get(y2,x2)-this.spaces[roomName].get(y2,x1-1)-this.spaces[roomName].get(y1-1,x2)+this.spaces[roomName].get(y1-1,x1-1);
    }
    /**
     * @param {string} roomName
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @returns {boolean}
     */
    IsVacant(roomName, _y1, _x1, _y2, _x2) {
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        return this.FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) === (y2 - y1 + 1) * (x2 - x1 + 1);
    }
    /**
     * Register Structure into MapMonitor with its tag, so that it could be found with specification of tag.
     * @param {Structure} structure
     * @param {string} tag
     */
    registerStructure(structure, tag) {
        Game.setTagById(structure.id, tag);
        _.set(this.room2tag2structureType2structureIds, [structure.pos.roomName, tag, structure.structureType, structure.id], true);
    }
    /**
     * @template {ResourceConstant} T
     * @param {string} roomName
     * @param {string} tag
     * @param {T} structureType
     * @returns {Array<Structure<T>>}
     */
    FetchStructureWithTag(roomName, tag, structureType) {
        const idMap = _.get(this.room2tag2structureType2structureIds, [roomName, tag, structureType], undefined);
        if (!idMap) return [];
        if (!idMap._lastUpdatingTick || idMap._lastUpdatingTick < Game.time) {
            idMap._lastUpdatingTick = Game.time;
            idMap._structures = [];
            /** @type {Array<Id<T>>} */
            const ids = Object.keys(idMap).filter(k => !k.startsWith("_"));
            for (const id of ids) {
                const object = Game.getObjectById(id);
                if (!object) delete idMap[id];
                else idMap._structures.push(object);
            }
        }
        return idMap._structures;
    }
    /**
     * @param {string} roomName
     * @param {StructureConstant} structureType
     * @returns { {structures : number, constructionSites : number, total : number} }
     */
    FetchCnt(roomName, structureType) {
        this.updateStructureCache();
        return _.get(this.cnts, [roomName, structureType], {"constructionSites" : 0, "structures" : 0, "total" : 0});
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure | ConstructionSite>}
     */
    Fetch(roomName, y, x) {
        if (!this.isValidPos(y, x)) return [];
        const prefix = `_fetch_${roomName}_${y}_${x}`;
        if (!this[prefix + "tick"] || this[prefix + "tick"] < Game.time) {
            this[prefix + "tick"] = Game.time;
            this.updateStructureCache();
            const structures = (this.structures[roomName]? this.structures[roomName][y][x] : []);
            const constructionSites = (this.constructionSites[roomName]? this.constructionSites[roomName][y][x] : []);
            return this[prefix] = [].concat(structures, constructionSites).map(Game.getObjectById).filter(s => s);
        } else return this[prefix];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure>}
     */
    FetchStructure(roomName, y, x) {
        if (!this.isValidPos(y, x)) return [];
        const prefix = `_fetchStructure_${roomName}_${y}_${x}`;
        if (!this[prefix + "tick"] || this[prefix + "tick"] < Game.time) {
            this[prefix + "tick"] = Game.time;
            this.updateStructureCache();
            return this[prefix] = (this.structures[roomName]? this.structures[roomName][y][x] : []).map(Game.getObjectById).filter(s => s);
        } else return this[prefix];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<ConstructionSite>}
     */
    FetchConstructionSites(roomName, y, x) {
        if (!this.isValidPos(y, x)) return [];
        const prefix = `_fetchConstructionSites_${roomName}_${y}_${x}`;
        if (!this[prefix + "tick"] || this[prefix + "tick"] < Game.time) {
            this[prefix + "tick"] = Game.time;
            this.updateStructureCache();
            return this[prefix] = (this.constructionSites[roomName]? this.constructionSites[roomName][y][x] : []).map(Game.getObjectById).filter(s => s);
        } else return this[prefix];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure>}
     */
    FetchAroundStructure(roomName, y, x) {
        let ret = [];
        for (let i = 0; i < this.dlen; ++i) {
            const _y = y + this.dy[i], _x = x + this.dx[i];
            ret = ret.concat(this.FetchStructure(roomName, _y, _x));
        }
        return ret;
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<ConstructionSite>}
     */
    FetchAroundConstructionSites(roomName, y, x) {
        let ret = [];
        for (let i = 0; i < this.dlen; ++i) {
            const _y = y + this.dy[i], _x = x + this.dx[i];
            ret = ret.concat(this.FetchConstructionSites(roomName, _y, _x));
        }
        return ret;
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure | ConstructionSite>}
     */
    FetchAround(roomName, y, x) {
        return [].concat(this.FetchAroundStructure(roomName, y, x), this.FetchAroundConstructionSites(roomName, y, x));
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @param {Array<StructureConstant>} allowedStructureTypes
     * @returns {Array<RoomPosition>}
     */
    FetchAroundVacantPos(roomName, y, x, allowedStructureTypes) {
        const terrain = this.FetchTerrain(roomName);
        let ret = [];
        const dy = [-1,-1,-1,0,0,1,1,1], dx = [-1,0,1,-1,1,-1,0,1], dlen = dy.length;
        for (let i = 0; i < dlen; ++i) {
            const _y = y + dy[i], _x = x + dx[i];
            if (!this.isValidPos(_y, _x) || terrain[_y][_x] === TERRAIN_MASK_WALL) continue;
            const structures = this.Fetch(roomName, _y, _x);
            if (structures.length > 0 && structures.filter(s => allowedStructureTypes.indexOf(s.structureType) === -1).length > 0) continue;
            ret.push(new RoomPosition(_x, _y, roomName));
        }
        return ret;
    }
    constructor() {
        /** @type { {[roomName : string] : Array<Array<number>>} } */
        this.terrains       = {};
        /** @type { {[roomName : string] : Array<RoomPosition>} } */
        this.roomVacantTerrain = {};
        /** @type { {[roomName : string] : Array<Array<number> >} } */
        this.spaces         = {};
        /** @type { {[roomName : string] : {[tag : string] : {[structure in StructureConstant] : {[id : string] : boolean}}}} } */
        this.room2tag2structureType2structureIds           = {};
        this.updateStructureCache();
    }
};
/**
 * Static Variables
 */
MapMonitor.prototype.dy = [-1,-1,-1,0,0,1,1,1];
MapMonitor.prototype.dx = [-1,0,1,-1,1,-1,0,1];
MapMonitor.prototype.dlen = 8;

const mapMonitor = new MapMonitor();

const RAMPART_BUILD_CONTROLLER_LEVEL = 4;

class Planner {
    /**
     * @private
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @returns {Array<number, number, number, number>}
     */
    normalizeCoordinations(_y1, _x1, _y2, _x2) {
        return [Math.min(_y1, _y2), Math.min(_x1, _x2), Math.max(_y1, _y2), Math.max(_x1, _x2)];
    }
    /**
     * @param {string} roomType
     * @param {Unit} unit
     */
    RegisterUnit(roomType, unit) {
        _.set(this.units, [roomType, unit.unitType], unit);
    }
    /**
     * @private
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @param {StructureConstant | "vacant" | "wall"} structureTypes
     */
    setPositionOccupied(roomName, y, x, ...structureTypes) {
        /**
         * Initialize relevant variables with default empty values
         */
        if (!this.roomOccupiedSpace[roomName]) this.roomOccupiedSpace[roomName] = constructArray([50,50], new Array());
        if (!this.roomStructureRegistered[roomName]) this.roomStructureRegistered[roomName] = {};
        if (!this.room2avoidPoses[roomName]) this.room2avoidPoses[roomName] = [];
        /**
         * Ensure only one position is added to `this.room2avoidPoses`.
         */
        let posHasBeenAvoided = false;
        for (const structureType of structureTypes) {
            if (!this.roomStructureRegistered[roomName][structureType]) this.roomStructureRegistered[roomName][structureType] = [];
            this.roomOccupiedSpace[roomName][y][x].push(structureType);
            this.roomStructureRegistered[roomName][structureType].push(new RoomPosition(x, y, roomName));
            /**
             * Register Preoccupied Positions
             * road, rampart and container are considered to be walkable.
             */
            if (!posHasBeenAvoided && structureType !== STRUCTURE_ROAD && structureType !== STRUCTURE_RAMPART && structureType !== STRUCTURE_CONTAINER) {
                posHasBeenAvoided = true;
                this.room2avoidPoses[roomName].push(new RoomPosition(x, y, roomName));
            }
        }
    }
    /**
     * @param {string} roomName
     * @param {StructureConstant} structureType
     * @returns {Array<RoomPosition>}
     */
    FetchRoomPlannedStructures(roomName, structureType) {
        return _.get(this.roomStructureRegistered, [roomName, structureType], []);
    }
    /**
     * @private
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @param {StructureConstant[]} allowedStructureTypes
     */
    getPositionOccupied(roomName, y, x, allowedStructureTypes) {
        if (!this.roomOccupiedSpace[roomName]) return false;
        if (!allowedStructureTypes) return this.roomOccupiedSpace[roomName][y][x].length > 0;
        else return this.roomOccupiedSpace[roomName][y][x].filter(s => !allowedStructureTypes.includes(s)).length > 0;
    }
    /**
     * Occupied Positions of Registered Unit will be avoided reusing when planning another unit.
     * PLACE_ANY is not counted.
     * @param {string} roomName
     * @param {Unit} unit
     * @param {string} unitType
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     */
    RegisterUnitPos(roomName, unit, unitType, _y1, _x1, _y2, _x2) {
        const [y1, x1, y2, x2] = this.normalizeCoordinations(_y1, _x1, _y2, _x2);
        /**
         * Obviously, one region could only fit into one unit.
         * Used to avoid duplication.
         */
        const prefix = `_${roomName}_unit_${y1}_${x1}_${y2}_${x2}`;
        if (this[prefix]) return; else this[prefix] = true;
        /**
         * Set as center of room if primary.
         */
        if (unit.Options.primary) _Map.setCenter(new RoomPosition(Math.floor((x1 + x2) / 2), Math.floor((y1 + y2) / 2), roomName));
        /**
         * Register Unit's Positions.
         */
        if (!this.units2pos[roomName]) this.units2pos[roomName] = {};
        if (!this.units2pos[roomName][unitType]) this.units2pos[roomName][unitType] = [];
        this.units2pos[roomName][unitType].push([y1, x1, y2, x2]);
        for (let y = y1; y <= y2; ++y) for (let x = x1; x <= x2; ++x) {
            /**
             * Road is dealt with special treatments.
             *  - Case 1 : Road is placed with some other structures -> Position is occupied.
             *  - Case 2 : Road isn't placed with some other structures.
             *      - if unit requires others not to occupy positions of roads, Position is occupied.
             *      - Otherwise, Position is not occupied.
             */
            if (unit.Fetch(y - y1, x - x1)[0] === unit.PLACE_ANY) continue;
            const isThereRoad = unit.Fetch(y - y1, x - x1).indexOf(STRUCTURE_ROAD) !== -1;
            if (!isThereRoad || unit.Fetch(y - y1, x - x1).length > 1 || unit.Options.avoidOtherToOverLapRoad) this.setPositionOccupied(roomName, y, x, ...unit.Fetch(y - y1, x - x1));
        }
    }
    /**
     * @private
     * Returns the number of structures in the region, which fit the unit's pattern.
     * If there is any violation (only perfect match is allowed), returns will become -1.
     * PLACE_ANY, however, allows for any kind of settings, including occupied space.
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @param {string} roomName
     * @param {Unit} unit
     * @returns {number}
     */
    isUnitFit(_y1, _x1, _y2, _x2, roomName, unit) {
        /** Optimize : Checking whether the region is fit for unit based on required vacant positions. */
        if (mapMonitor.FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) < unit.VacantSpaceCnt) return -1;
        const [y1, x1, y2, x2] = this.normalizeCoordinations(_y1, _x1, _y2, _x2);
        /** Optimize : Size should fit. */
        if (y2 - y1 + 1 !== unit.dy || x2 - x1 + 1 !== unit.dx) return -1;
        const terrain = mapMonitor.FetchTerrain(roomName);
        let ret = 0;
        for (let y = y1, j = 0; y <= y2; ++y, ++j) {
            for (let x = x1, i = 0; x <= x2; ++x, ++i) {
                if (unit.Fetch(j,i)[0] === unit.PLACE_ANY) continue;
                /**
                 * Optimization is rather complex here, since unit allows for polygon.
                 */
                if (this.getPositionOccupied(roomName, y, x)) return -1;
                if (unit.Fetch(j,i)[0] === unit.PLACE_VACANT) {
                    if (mapMonitor.Fetch(roomName,y,x).length > 0) return -1;
                    else if (terrain[y][x] === TERRAIN_MASK_WALL) return -1;
                    else continue;
                }
                // Structure
                if (terrain[y][x] === TERRAIN_MASK_WALL) return -1;
                const existStructureTypes = mapMonitor.Fetch(roomName, y, x).map(s => s.structureType);
                const desiredStructureTypes = unit.Fetch(j, i);
                const difference = _.difference(existStructureTypes, desiredStructureTypes);
                if (difference.length > 0) return -1;
                /**
                 * STRUCTURE_ROAD is not counted.
                 */
                ret += existStructureTypes.filter(v => v !== STRUCTURE_ROAD).length;
            }
        }
        return ret;
    }
    /**
     * @param {string} roomName
     * @param {Unit} unit
     * @returns { {[fitNumber : number] : [number, number, number, number][]} }
     */
    FetchAvailablePos(roomName, unit) {
        /**
         * In order to ensure there are enough candidates to choose from, all are reserved but sorted.
         */
        /** @type { {[fitNumber : number] : Array<[number, number, number, number]>} } */
        const record = {};
        /**
         * Module could not be placed near the edge so that ramparts are hard to protect them.
         */
        for (let y = 0 + this.DISTANCE_FROM_EDGE; y + unit.dy <= 50 - this.DISTANCE_FROM_EDGE; ++y) {
            for (let x = 0 + this.DISTANCE_FROM_EDGE; x + unit.dx <= 50 - this.DISTANCE_FROM_EDGE; ++x) {
                /** Apply Options of Unit */
                if (unit.Options.alongRoad) {
                    /**
                     * Left-Top Node should be strictly adjacent to roads used for linking (not those specified in unit)
                     * and not on the Road.
                     */
                    if (mapMonitor.FetchAround(roomName, y, x).filter(s => s.structureType === STRUCTURE_ROAD && !this.getPositionOccupied(roomName, s.pos.y, s.pos.x)).length === 0 || mapMonitor.Fetch(roomName, y, x).filter(s => s.structureType === STRUCTURE_ROAD).length > 0) continue;
                }
                const fitNumber = this.isUnitFit(y,x,y+unit.dy-1,x+unit.dx-1,roomName, unit);
                /** Not Fit */
                if (fitNumber === -1) continue;
                if (!record[fitNumber]) record[fitNumber] = [];
                record[fitNumber].push([y,x,y+unit.dy-1,x+unit.dx-1]);
            }
        }
        return record;
    }
    /**
     * @param {string} roomName
     * @param {string} unitType
     * @returns {[number, number, number, number][] | null} y1, x1, y2, x2
     */
    FetchUnitPos(roomName, unitType) {
        return _.get(this.units2pos, [roomName, unitType], null);
    }
    /**
     * @private
     * @param {string} roomName
     * @param {Unit} unit
     * @param {number} num
     * @returns {[number, number, number, number][]}
     */
    computeUnitPos(roomName, unit, num) {
        const record = this.FetchAvailablePos(roomName, unit);
        const fetchNumbers = Object.keys(record).map(v => parseInt(v, 10)).sort((a, b) => b - a);
        /** @type { [number, number, number, number][] } */
        let pos = [];
        for (let i = 0; i < fetchNumbers.length && pos.length < num; ++i) {
            pos = pos.concat(record[fetchNumbers[i]].sort((a, b) => unit.EvaluatePos(Game.rooms[roomName], a[0], a[1]) - unit.EvaluatePos(Game.rooms[roomName], b[0], b[1])));
        }
        return pos.slice(0, num);
    }
    /**
     * ConstructUnit constructs all possible units, which is ordered by number of adjacent existed ConstructionSites and Structures.
     * @param {string} roomName
     * @param {Unit} unit
     * @param {number} y Top
     * @param {number} x Left
     * @returns {Response}
     */
    ConstructUnit(roomName, unit, y, x) {
        const isPositionConstructed = constructArray([unit.dy, unit.dx], false);
        const get = (y, x) => {
            if (y < 0 || y >= unit.dy || x < 0 || x >= unit.dx) return false;
            return isPositionConstructed[y][x];
        };
        const calc = (y, x) => {
            const dy = [-1,-1,-1,0,0,1,1,1], dx = [-1,0,1,-1,1,-1,0,1], dlen = 8;
            let ret = 0;
            for (let i = 0; i < dlen; ++i) if (get(y, x)) ++ret;
            return ret;
        };
        const evaluate = (y, x) => {
            const MAXIMUM = 8;
            if (unit.FetchModifier(y, x, unit.FIRST_BUILD_HERE)) return MAXIMUM + 1;
            return calc(y, x);
        };
        /** @type { {[structureType : string] : Array<[number,number]>} } */
        const constructionSites    = {};
        const add = (structureType, y, x) => {
            if (!constructionSites[structureType]) constructionSites[structureType] = [];
            constructionSites[structureType].push([y, x]);
        };
        /**
         * Comparing Process
         */
        for (let j = y; j < y + unit.dy; ++j) {
            for (let i = x; i < x + unit.dx; ++i) {
                const desiredStructureTypes = unit.Fetch(j - y, i - x).filter(v => StructureConstants[v]);
                const existStructureTypes = mapMonitor.Fetch(roomName, j, i).map(s => s.structureType);
                const difference = _.difference(desiredStructureTypes, existStructureTypes);
                if (difference.length === 0) isPositionConstructed[j - y][i - x] = true;
                else difference.forEach(v => add(v, j, i));
            }
        }
        /* Nothing to be built */
        if (Object.keys(constructionSites).length === 0) return new Response(Response.prototype.FINISH);
        const retResponse = new Response(Response.prototype.PLACE_HOLDER);
        for (const structureType in constructionSites) {
            /**
             * Special Case : rampart.
             */
            if (structureType === STRUCTURE_RAMPART && Game.rooms[roomName].controller.level < RAMPART_BUILD_CONTROLLER_LEVEL) {
                retResponse.Feed(Response.prototype.WAIT_UNTIL_UPGRADE);
                continue;
            }
            /**
             * Checking for Structure Number Limitation
             */
            if (CONTROLLER_STRUCTURES[structureType][Game.rooms[roomName].controller.level] <= mapMonitor.FetchCnt(roomName, structureType)["total"]) {
                retResponse.Feed(Response.prototype.WAIT_UNTIL_UPGRADE);
                continue;
            }
            /**
             * Modify statistics of structures in the room to solve conflict of constructionSites in the same tick.
             */
            const statistics = mapMonitor.FetchCnt(roomName, structureType);
            /**
             * Sort based on modifiers and number of ambient existing structures.
             */
            constructionSites[structureType].sort(([u_y, u_x], [v_y, v_x]) => evaluate(v_y - y, v_x - x) - evaluate(u_y - y, u_x - x));
            for (const [pos_y, pos_x] of constructionSites[structureType]) {
                if (statistics["total"] >= CONTROLLER_STRUCTURES[structureType][Game.rooms[roomName].controller.level]) break;
                /**
                 * Multiply Structures in the same position.
                 */
                if (mapMonitor.FetchConstructionSites(roomName, pos_y, pos_x).length > 0) {
                    retResponse.Feed(Response.prototype.WAIT_UNTIL_TIMEOUT);
                    continue;
                }
                const retCode = Game.rooms[roomName].createConstructionSite(pos_x, pos_y, structureType);
                if (retCode !== OK) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> Creation of ConstructionSite of ${structureType} at (${pos_x}, ${pos_y}) in ${roomName} fails with code ${retCode}`);
                    retResponse.Feed(Response.prototype.WAIT_UNTIL_TIMEOUT);
                    continue;
                }
                /**
                 * Update Statistics, so that changes in the same tick could be detected.
                 */
                ++statistics["constructionSites"];
                ++statistics["total"];
            }
        }
        return retResponse;
    }
    /**
     * TagUnit tags all structures in the region matched with the unit.
     * In order to simplify work, whenever a new structure appears, `TagUnit` should be called.
     * Thus, comparison and recall are avoided.
     * @param {string} roomName
     * @param {Unit} unit
     * @param {number} y Top
     * @param {number} x Left
     * @returns {Response}
     */
    TagUnit(roomName, unit, y, x) {
        for (let j = y; j < y + unit.dy; ++j) {
            for (let i = x; i < x + unit.dx; ++i) {
                mapMonitor.FetchStructure(roomName, j, i).forEach(s => mapMonitor.registerStructure(s, unit.Tag));
            }
        }
        return new Response(Response.prototype.FINISH);
    }
    /**
     * Check whether Room fits into the pattern of automatic plan.
     * @TODO ENHANCEMENT
     * @param {string} roomName
     * @param {string} roomType
     */
    IsRoomFit(roomName, roomType) {
        /**
         * Cache Process : Memory and Heap
         */
        if (!this.roomType2fittedRoomNames[roomType]) this.roomType2fittedRoomNames[roomType] = {};
        if (this.roomType2fittedRoomNames[roomType][roomName] !== undefined) return this.roomType2fittedRoomNames[roomType][roomName];
        if (!Memory.rooms[roomName]) Memory.rooms[roomName] = {};
        if (!Memory.rooms[roomName].planFit) Memory.rooms[roomName].planFit = {};
        if (Memory.rooms[roomName].planFit[roomType] !== undefined) return this.roomType2fittedRoomNames[roomType][roomName] = Memory.rooms[roomName].planFit[roomType];
        if (!this.units[roomType]) return false;
        /**
         * Check whether primary units could be placed inside room.
         * @danger a position could be occupied twice.
         */
        const primaryUnits = Object.values(this.units[roomType]).filter(unit => unit.Options.primary).map(unit => [unit.dy, unit.dx]);
        for (const [dy, dx] of primaryUnits) {
            let success = false;
            for (let y = 0 + this.DISTANCE_FROM_EDGE; y + dy <= 50 - this.DISTANCE_FROM_EDGE; ++y) {
                for (let x = 0 + this.DISTANCE_FROM_EDGE; x + dx <= 50 - this.DISTANCE_FROM_EDGE; ++x) {
                    if (mapMonitor.IsVacant(roomName, y, x, y + dy - 1, x + dx - 1)) {
                        success = true;
                        break;
                    }
                }
                if (success) break;
            }
            if (!success) return Memory.rooms[roomName].planFit[roomType] = this.roomType2fittedRoomNames[roomType][roomName] = false;
        }
        return Memory.rooms[roomName].planFit[roomType] = this.roomType2fittedRoomNames[roomType][roomName] = true;
    }
    /**
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     * @param { {display? : boolean, tag? : boolean, build? : boolean, road? : boolean, writeToMemory? : boolean, readFromMemory? : boolean, num : number, linkedRoomPosition? : Array<RoomPosition>, linkedUnits? : Array<string>, unitTypeAlias? : string } } options `linkedUnits` should be planned before linking.
     * @returns { {tag : Response, build : Response, road : Response } }
     */
    Plan(roomName, roomType, unitType, options) {
        const _cpuUsed = Game.cpu.getUsed();
        _.defaults(options, {display : true, tag : false, build : false, road : false, writeToMemory : false, readFromMemory : false, num : 1, linkedRoomPosition : [], linkedUnits : [], unitTypeAlias : undefined});
        if (Memory._disable) options.display = false;
        const unit = this.units[roomType][unitType];
        /** Switch to unitTypeAlias if possible */
        unitType = options.unitTypeAlias || unitType;
        const ret = new ResponsePatch(Response.prototype.FINISH, "tag", "build", "road");
        if (!options.build && !options.display && !options.road && !options.tag) return ret;
        /** Trigger Planning */
        if (!this.FetchUnitPos(roomName, unitType)) {
            /** Memory Caching */
            if (options.readFromMemory && Memory.autoPlan[roomName][unitType]) Memory.autoPlan[roomName][unitType].forEach(([y1, x1, y2, x2]) => this.RegisterUnitPos(roomName, unit, unitType, y1, x1, y2, x2));
            else {
                const pos = this.computeUnitPos(roomName, unit, options.num);
                pos.forEach(([y1, x1, y2, x2]) => this.RegisterUnitPos(roomName, unit, unitType, y1, x1, y2, x2));
                if (options.writeToMemory) Memory.autoPlan[roomName][unitType] = pos;
            }
        }
        /* Working Body */
        for (const pos of this.FetchUnitPos(roomName, unitType) || []) {
            /** Display Module */
            if (options.display) unit.Display(roomName, pos[0], pos[1]);
            /** Build Module */
            if (options.build) ret.Pick("build").Feed(this.ConstructUnit(roomName, unit, pos[0], pos[1]));
            /** Tag Module */
            if (options.tag) ret.Pick("tag").Feed(this.TagUnit(roomName, unit, pos[0], pos[1]));    
            /** Road Module */
            for (const linkedUnitType of options.linkedUnits) {
                for (const targetPos of this.FetchUnitPos(roomName, linkedUnitType) || []) {
                    const nodes = this.fetchBestNode2Unit(unit, new RoomPosition(pos[1], pos[0], roomName), this.units[roomType][linkedUnitType], new RoomPosition(targetPos[1], targetPos[0], roomName));
                    const road = this.FetchRoad(nodes.origin, nodes.dist, {range : 0});
                    if (options.display) this.displayRoad(road);
                    if (options.road) ret.Pick("road").Feed(this.linkRoad(road, {excludeHeadTail : true}));
                }
            }
            for (const targetPos of options.linkedRoomPosition) {
                const origin = this.fetchBestNode2Pos(unit, new RoomPosition(pos[1], pos[0], roomName), targetPos);
                const road = this.FetchRoad(origin, targetPos, {range : 1});
                if (options.display) this.displayRoad(road);
                if (options.road) ret.Pick("road").Feed(this.linkRoad(road, {excludeHeadTail : true}));
            }
        }
        if (DEBUG) {
            console.log(`[${roomName}]:${unitType}(road: ${options.road}, build : ${options.build}, tag : ${options.tag}) consumes ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)} with returned code (road : ${ret.road.value} build : ${ret.build.value} tag : ${ret.tag.value})`);
        }
        return ret;
    }
    /**
     * Link is planned on the vacant place which is around the road that is around the object.
     * Prefer closer one.
     * @param { {pos : RoomPosition} } object
     * @param {string} tag
     * @returns {Response}
     */
    PlanForAroundLink(object, tag) {
        /** @type {RoomPosition} */
        const pos = object.pos;
        const roomName = pos.roomName;
        /** @type {StructureRoad} */
        const road = mapMonitor.FetchAroundStructure(roomName, pos.y, pos.x).filter(s => s.structureType === STRUCTURE_ROAD)[0];
        if (!road) return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        const vacantPos = mapMonitor.FetchAroundVacantPos(road.pos.roomName, road.pos.y, road.pos.x, [STRUCTURE_LINK, STRUCTURE_RAMPART]).filter(pos => !planner.getPositionOccupied(roomName, pos.y, pos.x, [STRUCTURE_LINK])).sort((posU, posV) => posU.getRangeTo(object) - posV.getRangeTo(object))[0];
        if (!vacantPos) {
            global.Log.error(`Unable to construct`, global.Dye.yellow(`Link`), `for`, global.Dye.grey(`${object}`), `at`, global.Dye.grey(`${object.pos}`), `with candidates :`, global.Dye.grey(`${mapMonitor.FetchAroundVacantPos(road.pos.roomName, road.pos.y, road.pos.x, [STRUCTURE_LINK, STRUCTURE_RAMPART])}`));
            return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        } else this.setPositionOccupied(object.pos.roomName, vacantPos.y, vacantPos.x, STRUCTURE_LINK);
        // console.log(`${object}->${vacantPos}`);
        /** @type {StructureLink | ConstructionSite<StructureLink>} */
        const link = mapMonitor.Fetch(roomName, vacantPos.y, vacantPos.x).filter(s => s.structureType === STRUCTURE_LINK)[0];
        const rampart = mapMonitor.Fetch(roomName, vacantPos.y, vacantPos.x).filter(s => s.structureType === STRUCTURE_RAMPART)[0];
        /**
         * Haven't been built -> wait until built / wait until upgrade
         */
        if (!link) {
            if (CONTROLLER_STRUCTURES[STRUCTURE_LINK][Game.rooms[roomName].controller.level] === mapMonitor.FetchCnt(roomName, STRUCTURE_LINK)["total"]) return new Response(Response.prototype.WAIT_UNTIL_UPGRADE);
            const retCode = Game.rooms[roomName].createConstructionSite(vacantPos.x, vacantPos.y, STRUCTURE_LINK);
            if (retCode !== OK) {
                global.Log.error(`Unable to create ConstructionSite`, global.Dye.yellow(`StructureLink`), `at`, global.Dye.grey(`${vacantPos}`), `with code ${retCode}`);
            }
            return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        } else if (!isConstructionSite(link)) { // Structure
            mapMonitor.registerStructure(link, tag);
            /**
             * Link finishes.
             * Rampart
             *  - Controller haven't reached level so that construction of rampart is allowed -> wait until grade.
             *  - Reach -> finish.
             */
            if (Game.rooms[roomName].controller.level >= RAMPART_BUILD_CONTROLLER_LEVEL){
                if (!rampart) Game.rooms[roomName].createConstructionSite(vacantPos.x, vacantPos.y, STRUCTURE_RAMPART);
                return new Response(Response.prototype.FINISH);
            } else return new Response(Response.prototype.WAIT_UNTIL_UPGRADE);
        } else return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT); // ConstructionSite -> wait until timeout
    }
    /**
     * Container will be placed on the road which is around `object`.
     * @param { {pos : RoomPosition} } object
     * @param { string } tag
     * @param { boolean } [isRampart = false]
     * @returns {Response}
     */
    PlanForAroundOverlapContainer(object, tag, isRampart = false) {
        /** @type {RoomPosition} */
        const pos = object.pos;
        const roomName = pos.roomName;
        const posTarget = mapMonitor.FetchAround(roomName, pos.y, pos.x).filter(s => s.structureType === STRUCTURE_CONTAINER)[0] || mapMonitor.FetchAroundStructure(roomName, pos.y, pos.x).filter(s => s.structureType === STRUCTURE_ROAD)[0];
        if (!posTarget) return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        /** @type {StructureContainer | ConstructionSite<StructureContainer>} */
        const container = mapMonitor.Fetch(roomName, posTarget.pos.y, posTarget.pos.x).filter(s => s.structureType === STRUCTURE_CONTAINER)[0];
        /** @type {StructureRampart | ConstructionSite<StructureRampart>} */
        const rampart = mapMonitor.Fetch(roomName, posTarget.pos.y, posTarget.pos.x).filter(s => s.structureType === STRUCTURE_RAMPART)[0];
        /**
         * Haven't been built -> wait until built
         */
        if (!container) {
            const retCode = Game.rooms[roomName].createConstructionSite(posTarget.pos.x, posTarget.pos.y, STRUCTURE_CONTAINER);
            if (retCode !== OK) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Unable to create StructureContainer at ${posTarget.pos.roomName} (${posTarget.pos.x, posTarget.pos.y}) with code ${retCode}`);
            }
            return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        } else if (!isConstructionSite(container)) { // Structure
            mapMonitor.registerStructure(container, tag);
            /**
             * Container finishes.
             * Rampart
             *  - Controller haven't reached level so that construction of rampart is allowed -> wait until grade.
             *  - Reach -> finish.
             */
            if (isRampart) {
                if (Game.rooms[roomName].controller.level >= RAMPART_BUILD_CONTROLLER_LEVEL){
                    if (!rampart) Game.rooms[roomName].createConstructionSite(posTarget.pos.x, posTarget.pos.y, STRUCTURE_RAMPART);
                    return new Response(Response.prototype.FINISH);
                } else return new Response(Response.prototype.WAIT_UNTIL_UPGRADE);
            } else return new Response(Response.prototype.FINISH);
        } else return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT); // ConstructionSite -> wait until built
    }
    /**
     * @private
     * @param {string} roomName
     * @param {{x : number, y : number}[]} path
     * @param {StructureConstant} structureType
     * @param { {} } [options]
     * @returns {Response}
     */
    constructAlongPath(roomName, path, structureType, options = {}) {
        const ret = new Response(Response.prototype.FINISH);
        for (const pos of path) {
            if (mapMonitor.Fetch(roomName, pos.y, pos.x).filter(s => s.structureType === structureType).length === 0) {
                const retCode = Game.rooms[roomName].createConstructionSite(pos.x, pos.y, structureType);
                if (retCode !== OK) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> Construct ${structureType} at ${roomName} (${pos.x}, ${pos.y}) fails with code ${retCode}`);
                    ret.Feed(Response.prototype.WAIT_UNTIL_TIMEOUT);
                    continue;
                }
            }
        }
        return ret;
    }
    /**
     * @private
     * Wrap-function for min-cut to compute protected ramparts.
     * @param {string} roomName
     * @param {string[]} unitTypes
     */
    fetchProtectedRamparts(roomName, unitTypes) {
        if (this.room2protectedRamparts[roomName]) return this.room2protectedRamparts[roomName];
        const extend = (coordinations, range = 3) => {
            coordinations.x1 = Math.max(1, coordinations.x1 - range);
            coordinations.y1 = Math.max(1, coordinations.y1 - range);
            coordinations.x2 = Math.min(48, coordinations.x2 + range);
            coordinations.y2 = Math.min(48, coordinations.y2 + range);
            return coordinations;
        };
        /** @type {{x1 : number, y1 : number, x2 : number, y2 :number}[]} */
        const rect_array = [];
        unitTypes.forEach(unitType => this.FetchUnitPos(roomName, unitType).forEach(([y1, x1, y2, x2]) => rect_array.push(extend({x1, y1, x2, y2}))));
        return this.room2protectedRamparts[roomName] = util_mincut.GetCutTiles(roomName, rect_array, {x1 : 0, y1 : 0, x2 : 49, y2 : 49});
    }
    /**
     * @param {string} roomName
     * @param {string[]} unitTypes
     * @param { {display ? : boolean, build ? : boolean, writeToMemory? : boolean, readFromMemory? : boolean} } [options]
     * @returns {Response}
     */
    PlanForProtectedRamparts(roomName, unitTypes, options = {}) {
        const key = "protectedRamparts";
        _.defaults(options, {display : true, build : false, readFromMemory : true, writeToMemory : true});
        if (Memory._disable) options.display = false;
        let rampartPos = [];
        if (options.readFromMemory && Memory.autoPlan[roomName][key]) rampartPos = Memory.autoPlan[roomName][key];
        else {
            rampartPos = this.fetchProtectedRamparts(roomName, unitTypes);
            if (options.writeToMemory) Memory.autoPlan[roomName][key] = rampartPos;
        }
        if (options.display) {
            const visual = new RoomVisual(roomName);
            rampartPos.forEach(({x, y}) => visual.circle(x, y, {radius: 0.5, fill:'#75e863',opacity: 0.3}));
        }
        // if (!this[`_planForProtectedRamparts_${roomName}`]) {
        //    this[`_planForProtectedRamparts_${roomName}`] = true;
        //    rampartPos.forEach(pos => this.setPositionOccupied(roomName, pos.y, pos.x, STRUCTURE_RAMPART));
        //}
        if (options.build) return this.constructAlongPath(roomName, rampartPos, STRUCTURE_RAMPART);
        else return new Response(Response.prototype.FINISH);
    }
    /**
     * @private
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     * @param { {range? : number, maxRooms? : number, ignoreErr? : boolean} } [options]
     */
    updateRoadBetweenPositions(posU, posV, options = {}) {
        _.defaults(options, {range : 0, ignoreErr : false});
        const key = `${posU}->${posV}`;
        // if (Memory._roads && Memory._roads[key]) return this.roads[key] = Memory._roads[key].map(v => new RoomPosition(v.x, v.y, v.roomName));
        /**
         * Decide whether road is built in rooms or between rooms.
         */
        if (posU.roomName === posV.roomName) {
            PathFinder.use(false);
            const path = Game.rooms[posU.roomName].findPath(posU, posV, {
                plainCost : 1,
                swampCost : 1,
                ignoreCreeps : true,
                ignoreDestructibleStructures : false,
                avoid : this.room2avoidPoses[posU.roomName] || [],
                maxOps : 2000,
                range : options.range
            });
            path.unshift({x : posU.x, y : posU.y});
            this.roads[key] = path.map(v => new RoomPosition(v.x, v.y, posU.roomName));
        } else {
            const path = Traveler.findTravelPath(posU, posV, {range : options.range, ignoreCreeps : true, maxOps : 500000});
            if (!options.ignoreErr && path.incomplete) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Path from ${posU} to ${posV} is incomplete.`);
            }
            this.roads[key] = path.path;
        }
        // _.set(Memory, [`_roads`, key], this.roads[key]);
    }
    /**
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     * @param { {range? : number, maxRooms? : number, ignoreErr? : boolean} } [options]
     */
    FetchRoad(posU, posV, options = {}) {
        const key = `${posU}->${posV}`;
        if (!this.roads[key]) this.updateRoadBetweenPositions(posU, posV, options);
        return this.roads[key];
    }
    /**
     * Used to fetch the best node of unit, which connects unit to pos.
     * @private
     * @param {Unit} unit
     * @param {RoomPosition} pos
     * @param {RoomPosition} targetPos
     * @returns {RoomPosition}
     */
    fetchBestNode2Pos(unit, pos, targetPos) {
        /** Init Cache */
        const key = `_fetchBestNode2Pos_${unit.unitType}_${pos}_${targetPos}`;
        if (this[key]) return this[key];
        if (!Memory._plannerCache.bestNodeCache) Memory._plannerCache.bestNodeCache = {};
        if (!Memory._plannerCache.bestNodeCache[unit.unitType]) Memory._plannerCache.bestNodeCache[unit.unitType] = {};
        if (Memory._plannerCache.bestNodeCache[unit.unitType][`${pos}->${targetPos}`]) {
            const $ = Memory._plannerCache.bestNodeCache[unit.unitType][`${pos}->${targetPos}`];
            return this[key] = new RoomPosition($.x, $.y, $.roomName);
        }
        return this[key] = Memory._plannerCache.bestNodeCache[unit.unitType][`${pos}->${targetPos}`] = unit.FetchConnectionNodes().map(([y, x]) => new RoomPosition(x + pos.x, y + pos.y, pos.roomName)).sort((posU, posV) => this.FetchRoad(posU, targetPos).length - this.FetchRoad(posV, targetPos).length)[0];
    }
    /**
     * @private
     * @param {Unit} unitU
     * @param {RoomPosition} posU
     * @param {Unit} unitV
     * @param {RoomPosition} posV
     * @returns {{dist : RoomPosition, origin : RoomPosition}}
     */
    fetchBestNode2Unit(unitU, posU, unitV, posV) {
        /** Init Cache */
        const key = `_fetchBestNode2Unit_${unitU.unitType}_${posU}_${unitV.unitType}_${posV}`;
        if (this[key]) return this[key];
        if (!Memory._plannerCache.bestNodeCache) Memory._plannerCache.bestNodeCache = {};
        if (!Memory._plannerCache.bestNodeCache[`${unitU.unitType}->${unitV.unitType}`]) Memory._plannerCache.bestNodeCache[`${unitU.unitType}->${unitV.unitType}`] = {};
        if (Memory._plannerCache.bestNodeCache[`${unitU.unitType}->${unitV.unitType}`][`${posU}->${posV}`]) {
           const $ = Memory._plannerCache.bestNodeCache[`${unitU.unitType}->${unitV.unitType}`][`${posU}->${posV}`];
           return this[key] = {origin : new RoomPosition($.origin.x, $.origin.y, $.origin.roomName), dist : new RoomPosition($.dist.x, $.dist.y, $.dist.roomName)};
        }
        const dist = unitV.FetchConnectionNodes().map(([y, x]) => new RoomPosition(x + posV.x, y + posV.y, posV.roomName)).sort((u, v) => this.FetchRoad(this.fetchBestNode2Pos(unitU, posU, u), u).length - this.FetchRoad(this.fetchBestNode2Pos(unitU, posU, v), v).length)[0];
        const origin = this.fetchBestNode2Pos(unitU, posU, dist);
        return this[key] = Memory._plannerCache.bestNodeCache[`${unitU.unitType}->${unitV.unitType}`][`${posU}->${posV}`] = {dist, origin};
    }
    /**
     * @private
     * @param {Array<RoomPosition>} path
     */
    displayRoad(path) {
        /** @type { {[roomName : string] : Array<RoomPosition>} } */
        const pathByRoom = _.groupBy(path, "roomName");
        for (const roomName in pathByRoom) {
            const visual = new RoomVisual(roomName);
            for (let i = 1; i < pathByRoom[roomName].length; ++i) visual.line(pathByRoom[roomName][i - 1], pathByRoom[roomName][i], {width : .5, color : "lightblue"});
        }
    }
    /**
     * If `roomName` is provided, its `center` will be used as origin.
     * @param {string | RoomPosition} roomName_or_posU
     * @param {string | RoomPosition} roomName_or_posV
     * @param { {display? : boolean, road? : boolean, maxRooms? : number} } [options]
     * @returns {Response}
     */
    Link(roomName_or_posU, roomName_or_posV, options = {}) {
        _.defaults(options, {display : true, road : false});
        if (Memory._disable) options.display = false;
        const posU = typeof roomName_or_posU === "string"  ? _Map.getCenter(roomName_or_posU) : roomName_or_posU;
        const posV = typeof roomName_or_posV === "string" ? _Map.getCenter(roomName_or_posV) : roomName_or_posV;
        if (!posU || !posV) {
            console.log(`<p style="display:inline;color:red;">Error:</p> Unable to link ${roomName_or_posU} to ${roomName_or_posV}`);
            return new Response(Response.prototype.WAIT_UNTIL_TIMEOUT);
        }
        const path = this.FetchRoad(posU, posV, {range : 1, ignoreErr : true, maxRooms : options.maxRooms});
        if (options.display) this.displayRoad(path);
        if (options.road) return this.linkRoad(path, {excludeHeadTail : false});
        else return new Response(Response.prototype.FINISH);
    }
    /**
     * @private
     * @param {Array<RoomPosition>} path
     * @param { {excludeHeadTail? : boolean} } [options]
     * @returns {Response}
     */
    linkRoad(path, options = {}) {
        _.defaults(options, {excludeHeadTail : true});
        const ret = new Response(Response.prototype.FINISH);
        const headRoomName = path[0].roomName, tailRoomName = path[path.length - 1].roomName;
        /** @type { {[roomName : string] : Array<RoomPosition>} } */
        const pathByRoom = _.groupBy(path, "roomName");
        for (const roomName in pathByRoom) {
            if (!Game.rooms[roomName]) {
                _Map.EnsureVisibility(roomName);
                ret.Feed(Response.prototype.WAIT_UNTIL_TIMEOUT);
                continue;
            }
            const iStart = options.excludeHeadTail && roomName === headRoomName? 1 : 0;
            const iEnd = options.excludeHeadTail && roomName === tailRoomName ? pathByRoom[roomName].length - 1 : pathByRoom[roomName].length;
            for (let i = iStart ; i < iEnd; ++i) {
                const step = pathByRoom[roomName][i];
                if (!mapMonitor.isMargin(step.y, step.x) && !this.getPositionOccupied(step.roomName, step.y, step.x) && mapMonitor.Fetch(step.roomName, step.y, step.x).filter(s => s.structureType === STRUCTURE_ROAD).length === 0) {
                    const retCode = Game.rooms[roomName].createConstructionSite(step.x, step.y, STRUCTURE_ROAD);
                    if (retCode !== OK) {
                        console.log(`<p style="display:inline;color:red;">Error:</p> Construct Road at ${roomName} (${step.x}, ${step.y}) fails with code ${retCode}`);
                        ret.Feed(Response.prototype.WAIT_UNTIL_TIMEOUT);
                        continue;
                    }
                }
            }
        }
        return ret;
    }
    constructor() {
        /** @type {{ [roomType : string] : {[unitType : string] : Unit} }} */
        this.units = {};
        /** @type { {[roomName : string] : { [unitType : string] : Array<[number, number, number, number]>}} } */
        this.units2pos = {};
        /** @type { {[roomName : string] : StructureConstant[][][]} } */
        this.roomOccupiedSpace = {};
        /** @type { {[roomName : string] : {[structure in StructureConstant] : Array<RoomPosition>}} } */
        this.roomStructureRegistered = {};
        /** @type { {[roomName : string] : Array<RoomPosition>} } */
        this.room2avoidPoses = {};
        /** @type { {[roomType : string] : {[roomName : string] : boolean}} } */
        this.roomType2fittedRoomNames = {};
        /** @type { {[posUandposV : string] : Array<RoomPosition>} } */
        this.roads = {};
        /** @type { {[roomName : string] : {x : number, y : number}[]} } */
        this.room2protectedRamparts = {};
    }
};
/**
 * Static Variable
 */
Planner.prototype.DISTANCE_FROM_EDGE = 5;

const planner = new Planner();

planner.RegisterUnit("normal", new Unit(
    [
        [Unit.prototype.PLACE_ANY, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, Unit.prototype.PLACE_ANY],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, [STRUCTURE_SPAWN, STRUCTURE_RAMPART], STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION, Unit.prototype.PLACE_VACANT, STRUCTURE_EXTENSION, Unit.prototype.PLACE_VACANT, STRUCTURE_EXTENSION, STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_CONTAINER, STRUCTURE_EXTENSION, STRUCTURE_LINK, STRUCTURE_EXTENSION, STRUCTURE_CONTAINER, STRUCTURE_ROAD],
        [STRUCTURE_ROAD, [STRUCTURE_SPAWN, STRUCTURE_RAMPART], Unit.prototype.PLACE_VACANT, STRUCTURE_EXTENSION, Unit.prototype.PLACE_VACANT, [STRUCTURE_SPAWN, STRUCTURE_RAMPART], STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD],
        [Unit.prototype.PLACE_ANY, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, Unit.prototype.PLACE_ANY]
    ]
    , "centralSpawn", global.Lucy.Rules.arrangements.SPAWN_ONLY, "", "red", {type:"distanceSum", objects : [STRUCTURE_CONTROLLER, "mineral", "sources"], subjects : [STRUCTURE_SPAWN]}, {avoidOtherToOverLapRoad : true, primary : true}));

planner.RegisterUnit("normal", new Unit(
    [
        [[STRUCTURE_STORAGE, STRUCTURE_RAMPART], [STRUCTURE_NUKER, STRUCTURE_RAMPART], [STRUCTURE_POWER_SPAWN, STRUCTURE_RAMPART]],
        [[STRUCTURE_TERMINAL, STRUCTURE_RAMPART], STRUCTURE_ROAD, STRUCTURE_EXTENSION],
        [STRUCTURE_LINK, [STRUCTURE_FACTORY, STRUCTURE_RAMPART], STRUCTURE_ROAD]
    ]
    , "centralTransfer", global.Lucy.Rules.arrangements.TRANSFER_ONLY, "", "orange", {type:"distanceSum", objects : [STRUCTURE_CONTROLLER, STRUCTURE_SPAWN], subjects : [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY]}, {avoidOverLapRoad : true}));

planner.RegisterUnit("normal", new Unit(
    [
        [[STRUCTURE_TOWER, STRUCTURE_RAMPART]]
    ]
    , "towers", "defense", "⛫", "yellow", {type : "distanceSum", objects : [STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL], subjects : [STRUCTURE_TOWER]}, {alongRoad : true}));

planner.RegisterUnit("normal", new Unit(
    [
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD],
        [STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_EXTENSION],
        [STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION],
        [STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_ROAD, STRUCTURE_EXTENSION],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_EXTENSION, STRUCTURE_ROAD]
    ]
    , "extensionUnit", "extension", "", "yellow", {type : "distanceSum", objects : [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL], subjects : [STRUCTURE_EXTENSION]}, {avoidOtherToOverLapRoad : true, avoidOverLapRoad : true}));

planner.RegisterUnit("normal", new Unit(
    [
        [Unit.prototype.PLACE_ANY, [STRUCTURE_LAB, STRUCTURE_RAMPART], [STRUCTURE_LAB, STRUCTURE_RAMPART], STRUCTURE_ROAD],
        [[STRUCTURE_LAB, STRUCTURE_RAMPART], [STRUCTURE_LAB, STRUCTURE_RAMPART, Unit.prototype.FIRST_BUILD_HERE], STRUCTURE_ROAD, [STRUCTURE_LAB, STRUCTURE_RAMPART]],
        [[STRUCTURE_LAB, STRUCTURE_RAMPART], STRUCTURE_ROAD, [STRUCTURE_LAB, STRUCTURE_RAMPART, Unit.prototype.FIRST_BUILD_HERE], [STRUCTURE_LAB, STRUCTURE_RAMPART]],
        [STRUCTURE_ROAD, [STRUCTURE_LAB, STRUCTURE_RAMPART], [STRUCTURE_LAB, STRUCTURE_RAMPART], Unit.prototype.PLACE_ANY]
    ]
    , "labUnit", "labs", "", "purple", {type : "distanceSum", objects : [STRUCTURE_SPAWN], subjects : [STRUCTURE_LAB]}, {avoidOverLapRoad : true}));

planner.RegisterUnit("normal", new Unit(
    [
        [STRUCTURE_EXTENSION]
    ]
    , "extensions", "extension", "🟡", "yellow", {type : "distanceSum", objects : [STRUCTURE_SPAWN, STRUCTURE_STORAGE, STRUCTURE_TERMINAL], subjects : [STRUCTURE_EXTENSION]}, {alongRoad : true}));
const ROOM_DISTANCE_CACHE_TIMEOUT       = 50;
const ROOM_DISTANCE_CACHE_OFFSET        = 5;


/**
 * Class Representation for Map.
 * Single.
 * Cross-Shard Cases
 */
class Map {
    /**
     * @private
     * @param {string} roomName
     */
    updateDistanceCache(roomName) {
        this.updateAdjacentRooms(roomName, {fullDistrict : true});
        this.updateDistanceBetweenRooms(roomName);
        this.sortedDistances[roomName] = Array.from(this.roomRecorded).sort((u, v) => this.disFromRoom[roomName][u].distance - this.disFromRoom[roomName][v].distance);
    }
    /**
     * @param {RoomPosition} pos
     */
    setCenter(pos) {
        this.room2center[pos.roomName] = pos;
    }
    /**
     * @param {string} roomName
     * @returns {RoomPosition | null}
     */
    getCenter(roomName) {
        return this.room2center[roomName] || null;
    }
    /**
     * Ticks taken :
     *  - E7S27 7.477542799999981
     * @private
     * @param {string} roomName
     */
    updateInRoomDistance(roomName) {
        const center = this.getCenter(roomName);
        if (!center) return;
        const terrain = mapMonitor.FetchTerrain(roomName);
        this.room2distanceFromCenter[roomName] = constructArray([50,50], -1);
        const dx = [-1,-1,-1,0,0,1,1,1], dy = [-1,0,1,-1,1,-1,0,1], dlen = dx.length;
        /** @type {Array<{x : number, y : number, dis : number}>} */
        const Queue = [];
        Queue.push({y : center.y, x : center.x, dis : 0});
        this.room2distanceFromCenter[roomName][center.y][center.x] = 0;
        while (Queue.length > 0) {
            const front = Queue.shift();
            for (let i = 0; i < dlen; ++i) {
                if (front.y + dy[i] < 0 || front.y + dy[i] > 49 || front.x + dx[i] < 0 || front.x + dx[i] > 49) continue;
                if (this.room2distanceFromCenter[roomName][front.y + dy[i]][front.x + dx[i]] !== -1) continue;
                this.room2distanceFromCenter[roomName][front.y + dy[i]][front.x + dx[i]] = front.dis + 1;
                /** Wall which are reachable from plain or swamp should be given distance, considering the positions of controller, mineral and sources. */
                if (terrain[front.y + dy[i]][front.x + dx[i]] === TERRAIN_MASK_WALL) continue;
                Queue.push({y : front.y + dy[i], x : front.x + dx[i], dis : front.dis + 1});
            }
        }
    }
    /**
     * @param {string} roomName
     * @param { {fullDistrict : boolean} | undefined } options
     */
    updateAdjacentRooms(roomName, options) {
        if (!options) {
            if (this.roomVisited[roomName]) return;
            if (!this.roomEdges[roomName]) this.roomEdges[roomName] = [];
            this.roomVisited[roomName] = true;
            this.registerRoom(roomName);
            const exits = Game.map.describeExits(roomName);
            for (const direction in exits) {
                this.roomEdges[roomName].push(exits[direction]);
                this.registerRoom(exits[direction]);
            }
        } else if (options.fullDistrict) {
            /**
             * @param {string} roomName
             */
            const dfs = (roomName) => {
                if (this.roomVisited[roomName]) return;
                if (!this.roomEdges[roomName]) this.roomEdges[roomName] = [];
                this.roomVisited[roomName] = true;
                this.registerRoom(roomName);
                const exits = Game.map.describeExits(roomName);
                for (const direction in exits) {
                    this.roomEdges[roomName].push(exits[direction]);
                    if (decideRoomStatus(roomName) === "highway") {
                        /** Only Record Path, no Extension */
                        this.registerRoom(exits[direction]);
                        continue;
                    }
                    dfs(exits[direction]);
                }
            };
            dfs(roomName);
        }
    }
    /**
     * @private
     * @param {string} roomName
     */
    registerRoom(roomName) {
        const status = decideRoomStatus(roomName);
        this.roomRecorded.add(roomName);
        if (status === "normal") this.NormalRoomRecorded.add(roomName);
        else if (status === "SK") this.SKRoomRecorded.add(roomName);
        else if (status === "highway") this.highwayRoomRecorded.add(roomName);
        else if (status === "portal") this.PortalRoomRecorded.add(roomName);
    }
    /**
     * @param {string} origin
     */
    updateDistanceBetweenRooms(origin) {
        if (!this.disFromRoom[origin]) this.disFromRoom[origin] = {};
        /**
         * Update distance whenever there are new rooms registerred.
         */
        if (!this.disFromRoomTotalRooms[origin] || this.disFromRoomTotalRooms[origin] < Object.keys(this.roomRecorded).length) {
            this.disFromRoomTotalRooms[origin] = Object.keys(this.roomRecorded).length;
            for (const roomName of this.roomRecorded) {
                if (!this.disFromRoom[origin][roomName]) this.disFromRoom[origin][roomName] = {distance : Infinity, fromRoomName : roomName};
            }
            this.disFromRoom[origin][origin] = {distance : 0, fromRoomName : origin};
            const Q = new PriorityQueue((a, b) => a.distance < b.distance);
            Q.push({distance : 0, node : origin});
            while (!Q.isEmpty()) {
                /** @type { {distance : number, node : number} } */
                const top = Q.pop();
                if (top.distance !== this.disFromRoom[origin][top.node].distance) continue;
                for (const roomName of (this.roomEdges[top.node] || [])) {
                    // if (!this.disFromRoom[origin][roomName]) console.log(roomName);
                    if (this.disFromRoom[origin][roomName].distance > top.distance + 1) {
                        this.disFromRoom[origin][roomName].distance = top.distance + 1;
                        this.disFromRoom[origin][roomName].fromRoomName = top.node;
                        Q.push({distance : top.distance + 1, node : roomName});
                    }
                }
            }
        }
    }

    /**
     * @param {string} roomName
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     * @returns {number | null}
     */
    CalcInRoomDistance(roomName, posU, posV) {
        if (!this.room2distanceFromCenter[roomName]) this.updateInRoomDistance(roomName);
        if (!this.room2distanceFromCenter[roomName]) return null;
        const distanceFromposU = this.room2distanceFromCenter[roomName][posU.y][posU.x];
        const distanceFromposV = this.room2distanceFromCenter[roomName][posV.y][posV.x];
        return (distanceFromposU < 0 ? Infinity : distanceFromposU) + (distanceFromposV < 0 ? Infinity : distanceFromposV);
    }
    /**
     * @param {string} roomNameU
     * @param {string} roomNameV
     */
    CalcRoomDistance(roomNameU, roomNameV) {
        // this.updateAdjacentRooms(roomNameU, {fullDistrict : true});
        // this.updateAdjacentRooms(roomNameV, {fullDistrict : true});
        if (this.disFromRoom[roomNameU]) this.updateDistanceBetweenRooms(roomNameU);
        else if (this.disFromRoom[roomNameV]) this.updateDistanceBetweenRooms(roomNameV);
        if (this.disFromRoom[roomNameU]) return this.disFromRoom[roomNameU][roomNameV].distance;
        else if (this.disFromRoom[roomNameV]) return this.disFromRoom[roomNameV][roomNameU].distance;
        return Infinity;
    }
    /**
     * @param {RoomPosition} pos_U
     * @param {RoomPosition} pos_V
     * @returns {number}
     */
    EstimateDistance(pos_U, pos_V) {
        if (pos_U.roomName === pos_V.roomName) return calcInRoomDistance(pos_U, pos_V);
        else return calcRoomDistance(pos_U, pos_V) * 50;
    }
    /**
     * @param {string} roomName
     * @param {boolean} [dryRun]
     * @returns {"invisible" | "visible" | "scouting"}
     */
    EnsureVisibility(roomName, dryRun = false) {
        if (Game.rooms[roomName]) return "visible";
        if (this.IsUnreachable(roomName)) return "invisible";
        if (TaskConstructor.ScoutTask(roomName, {default : true, dryRun}) === false) return "invisible";
        else return "scouting";
    }
    /**
     * @param {string} fromRoomName
     * @param {string} toRoomName
     * @returns {Array<string> | null}
     */
    DescribeRoute(fromRoomName, toRoomName) {
        /** Init Cache */
        if (this.routes[fromRoomName] && this.routes[fromRoomName][toRoomName]) return this.routes[fromRoomName][toRoomName];
        else if (this.routes[toRoomName] && this.routes[toRoomName][fromRoomName]) return this.routes[toRoomName][fromRoomName].slice().reverse();
        if (!this.routes[fromRoomName]) this.routes[fromRoomName] = {};
        this.updateAdjacentRooms(fromRoomName, {fullDistrict : true});
        this.updateAdjacentRooms(toRoomName, {fullDistrict : true});
        if (this.disFromRoom[fromRoomName]) this.updateDistanceBetweenRooms(fromRoomName);
        else this.updateDistanceBetweenRooms(toRoomName);
        if (this.disFromRoom[fromRoomName]) {
            if (this.disFromRoom[fromRoomName][toRoomName].distance === Infinity) return null;
            let roomName = toRoomName;
            const ret = [];
            while (roomName !== fromRoomName) {
                ret.push(roomName);
                roomName = this.disFromRoom[fromRoomName][roomName].fromRoomName;
            }
            ret.push(roomName);
            return this.routes[fromRoomName][toRoomName] = ret.reverse();
        } else {
            if (this.disFromRoom[toRoomName][fromRoomName].distance === Infinity) return null;
            let roomName = fromRoomName;
            const ret = [];
            while (roomName !== toRoomName) {
                ret.push(roomName);
                roomName = this.disFromRoom[toRoomName][roomName].fromRoomName;
            }
            ret.push(roomName);
            return this.routes[fromRoomName][toRoomName] = ret;
        }
    }
    /**
     * @param {string} toRoomName
     * @param {string} fromRoomName
     */
    SetAsUnreachable(toRoomName, fromRoomName) {
        Memory._unreachableRooms[toRoomName] = toRoomName? Game.map.getRoomStatus(toRoomName).timestamp : null || fromRoomName? Game.map.getRoomStatus(fromRoomName).timestamp : null || -1;
    }
    /**
     * @param {string} roomName
     */
    IsUnreachable(roomName) {
        if (Memory._unreachableRooms[roomName] && Memory._unreachableRooms[roomName] === -1) return false;
        if (Memory._unreachableRooms[roomName] && Memory._unreachableRooms[roomName] < new Date().getTime()) delete Memory._unreachableRooms[roomName];
        if (!Memory._unreachableRooms[roomName]) return false;
        return true;
    }
    /**
     * @param {string} roomName
     * @param {string} targetRoomName
     * @param {"energy" | "mineral"} type
     * @returns {number | boolean | "unknown"} Profit Per Tick | Whether there is mineral
     */
    IsExploitRoomProfitable(roomName, targetRoomName, type) {
        /** Currently Unreachable */
        if (this.IsUnreachable(targetRoomName)) return 0;
        /** Not in the Detection Mode */
        if (isMyRoom(targetRoomName)) return 0;
        // Should be called before calling this function
        // this.updateAdjacentRooms(roomName, {fullDistrict : true});
        // this.updateDistanceBetweenRooms(roomName);
        if (this.disFromRoom[roomName][targetRoomName].distance === Infinity) return 0;
        const distance = this.disFromRoom[roomName][targetRoomName].distance * 50;
        /** Issue Scouting to gather information */
        if (!Memory.rooms[targetRoomName]) {
            if (TaskConstructor.ScoutTask(targetRoomName) === false) return 0;
            return null;
        }
        if (type === "energy") {
            /** @type {number} */
            const sourceAmount = Memory.rooms[targetRoomName].sourceAmount;
            /**
             * We assume half of the total roads are on the plain, and the other half are on the swamp.
             * And the default setting for Harvester : {[WORK]:10, [CARRY]:2, [MOVE]:12} : 1700, Transferer : {[CARRY]:20, [MOVE]:20} : 2000
             */
            const costPerTick = Math.floor(distance / 2) * ROAD_DECAY_AMOUNT / ROAD_DECAY_TIME * (1 + 5) / REPAIR_POWER + sourceAmount * CONTAINER_DECAY / CONTAINER_DECAY_TIME / REPAIR_POWER + (1700 + 2000) / CREEP_LIFE_TIME + sourceAmount > 2 ? 1 : 0;
            const profitPerTick = _.sum(Memory.rooms[targetRoomName].sourceCapacities) / ENERGY_REGEN_TIME * (CREEP_LIFE_TIME - distance) / CREEP_LIFE_TIME;
            return profitPerTick - costPerTick;
        } else if (type === "mineral") {
            /**
             * DefenderWorker : {[WORK]:20, [CARRY]:1, [MOVE]:10, [ATTACK]:16, [HEAL]:3}
             */
            if (Memory.rooms[targetRoomName].mineralType) return true;
            else return false;
        }
    }
    /**
     * @param {number} amount
     * @param {boolean} [dryRun]
     */
    ClaimRoom(amount, dryRun = false) {
        /**
         * Update Information of Rooms
         */
        const myRoomNames = global.Lucy.Collector.colonies.map(r => r.name);
        myRoomNames.forEach(roomName => this.updateAdjacentRooms(roomName, {fullDistrict : true}));
        myRoomNames.forEach(roomName => this.updateDistanceBetweenRooms(roomName));
        let isThereAnyInformationLacking = 0;
        let candidates = Array.from(this.NormalRoomRecorded)
            .filter(roomName => !isMyRoom(roomName) && !this.IsUnreachable(roomName))
            .filter(roomName => {
                /**
                 * Has Information
                 */
                if (Memory.rooms[roomName]) {
                    /**
                     * Owned / Reserved By Others
                     */
                    if (Memory.rooms[roomName].owner) return false;
                    else return true;
                }
                /**
                 * Lack Information
                 */
                if (!Memory.rooms[roomName] && TaskConstructor.ScoutTask(roomName) !== false) {
                    isThereAnyInformationLacking++;
                    return false;
                }
                return false;
            });
        if (isThereAnyInformationLacking > 0) {
            global.Lucy.Timer.add(Game.time + isThereAnyInformationLacking * 50, this.ClaimRoom, this, [amount, dryRun], `Claim ${amount} ${amount === 1 ? "room" : "rooms"}`);
            return true;
        }
        candidates = candidates
            .sort((u, v) => {
                if (Memory.rooms[v].sourceAmount !== Memory.rooms[u].sourceAmount) return Memory.rooms[v].sourceAmount - Memory.rooms[u].sourceAmount;
                return Math.min(...myRoomNames.map(myRoomName => calcRoomDistance(myRoomName, u))) - Math.min(...myRoomNames.map(myRoomName => calcRoomDistance(myRoomName, v)));
            })
            .filter(roomName => planner.IsRoomFit(roomName, "normal"));
        if (!dryRun) {
            for (let i = 0, cnt = 0; cnt < amount && i < candidates.length; ++i)
                if (TaskConstructor.ClaimTask(candidates[i]) === false) continue;
                else ++cnt;
        } else console.log(candidates);
        return true;
    }
    /**
     * In the mechanism of Remote Mining, Repairing and Building are based on visibility, which is ensured by Scout Task, and triggered by
     * the transition from invisibility to visibility, in which amount is recorded and restricted.
     * @TODO
     * The difficult part is the maintaining of neutral rooms, since other players could occupy them and establish a block.
     * So this part is postponed until I have mature attacking code, so that my desired region will not be taken over by someone other.
     * @param {string} roomName
     */
    RemoteMine(roomName) {
        if (this.room2RemoteMineExpiration[roomName] && this.room2RemoteMineExpiration[roomName] > Game.time) return;
        /**
         * Because we apply strict distance between rooms, it is of high possibility that
         * chosen rooms will not found unreachable while working.
         */
        const ENERGY_MAXIMUM_ROOM_DISTANCE  = 1;
        const MINERAL_MAXIMUM_ROOM_DISTANCE = 2;
        const ENERGY_MAXIMUM_ROOM           = 1;
        const MINERAL_MAXIMUM_ROOM          = 1;
        /** Remote Energy Information */
        if (!this.room2RemoteMiningCandidates[roomName]) {
            if (Game.rooms[roomName].memory.room2RemoteMiningCandidates) this.room2RemoteMiningCandidates[roomName] = Game.rooms[roomName].memory.room2RemoteMiningCandidates;
            else {
                /** @type {Array<{roomName : string, profit : number}>} */
                let profitOfRoomNames = [];
                this.updateAdjacentRooms(roomName, {fullDistrict : true});
                this.updateDistanceBetweenRooms(roomName);
                /**
                 * @shard3
                 * It is not profitable to harvest energy in a central room in shard 3
                 */
                /** @type {Array<string>} */
                const adjacentRoomNames = Array.from(this.NormalRoomRecorded).filter(r => !isMyRoom(r) && calcRoomDistance(r, roomName) <= ENERGY_MAXIMUM_ROOM_DISTANCE);
                let isThereAnyInformationLacking = 0;
                for (const targetRoomName of adjacentRoomNames) {
                    const ret = this.IsExploitRoomProfitable(roomName, targetRoomName, "energy");
                    if (ret === null) ++isThereAnyInformationLacking;
                    else profitOfRoomNames.push({roomName : targetRoomName,  profit : ret});
                }
                if (isThereAnyInformationLacking > 0) return this.room2RemoteMineExpiration[roomName] = Game.time + getCacheExpiration(isThereAnyInformationLacking * 50, 50);
                profitOfRoomNames = profitOfRoomNames
                    .filter((info) => info["profit"] > 0)
                    /** Hostile Rooms are avoided and My Reservation Rooms are included */
                    .filter(({roomName}) => !Memory.rooms[roomName].avoid && (!Memory.rooms[roomName].owner || Memory.rooms[roomName].owner === username))
                    /** Passing Through Hostile Rooms are forbidden */
                    .filter(value => this.DescribeRoute(roomName, value.roomName).filter(r => !isMyRoom(r) && Memory.rooms[r] && (Memory.rooms[r].avoid || (Memory.rooms[r].owner && Memory.rooms[r].owner !== username && Memory.rooms[r].owner !== "Invader")) && this.EnsureVisibility(r, true) !== "invisible").length === 0)
                    /** Rooms as target for others are avoided */
                    .filter(value => !Memory.rooms[value.roomName].asRemoteMiningRoom || Memory.rooms[value.roomName].asRemoteMiningRoom === roomName)
                    .sort((u, v) => v["profit"] - u["profit"]);
                this.room2RemoteMiningCandidates[roomName] = profitOfRoomNames.slice(0, ENERGY_MAXIMUM_ROOM);
                Game.rooms[roomName].memory.room2RemoteMiningCandidates = this.room2RemoteMiningCandidates[roomName];
            }
            this.room2RemoteMiningCandidates[roomName].forEach(v => {
                Notifier.register(roomName, `Remote Mining`, v.roomName, () => `🟡`);
                _.set(Memory.rooms, [v.roomName, "asRemoteMiningRoom"], roomName);
            });
        }
        /** Remote Mineral Information */
        if (!this.room2RemoteMineralCandidates[roomName]) {
            if (Game.rooms[roomName].memory.room2RemoteMineralCandidates) this.room2RemoteMineralCandidates[roomName] = Game.rooms[roomName].memory.room2RemoteMineralCandidates;
            else {
                /** @type {Array<{roomName : string, mineralType : MineralConstant}>} */
                let mineralOfRoomNames = [];
                this.updateAdjacentRooms(roomName, {fullDistrict : true});
                this.updateDistanceBetweenRooms(roomName);
                const adjacentRoomNames = Array.from(this.SKRoomRecorded).filter(r => calcRoomDistance(r, roomName) <= MINERAL_MAXIMUM_ROOM_DISTANCE);
                let isThereAnyInformationLacking = 0;
                for (const targetRoomName of adjacentRoomNames) {
                    const ret = this.IsExploitRoomProfitable(roomName, targetRoomName, "mineral");
                    if (ret === null) isThereAnyInformationLacking++;
                    else if (ret === true) mineralOfRoomNames.push({roomName : targetRoomName, mineralType : Memory.rooms[targetRoomName].mineralType});
                }
                if (isThereAnyInformationLacking > 0) return this.room2RemoteMineExpiration[roomName] = Game.time + isThereAnyInformationLacking * 50;
                mineralOfRoomNames = mineralOfRoomNames
                    /** Only want those possessing minerals we do not have */
                    .filter(({mineralType}) => !global.Lucy.Collector.colonies.map(r => r.mineral.mineralType).includes(mineralType))
                    /** Passing Through Hostile Rooms are forbidden */
                    .filter(value => this.DescribeRoute(roomName, value.roomName).filter(r => !isMyRoom(r) && Memory.rooms[r] && (Memory.rooms[r].owner && Memory.rooms[r].owner !== username && Memory.rooms[r].owner !== "Invader") && this.EnsureVisibility(r, true) !== "invisible").length === 0)
                    /** Rooms as target for others are avoided */
                    .filter(value => !Memory.rooms[value.roomName].asRemoteMineralRoom || Memory.rooms[value.roomName].asRemoteMineralRoom === roomName)
                    .sort((u, v) => calcRoomDistance(roomName, u.roomName) - calcRoomDistance(roomName, v.roomName));
                this.room2RemoteMineralCandidates[roomName] = mineralOfRoomNames.slice(0, MINERAL_MAXIMUM_ROOM);
                Game.rooms[roomName].memory.room2RemoteMineralCandidates = this.room2RemoteMineralCandidates[roomName];
            }
            this.room2RemoteMineralCandidates[roomName].forEach(v => {
                Notifier.register(roomName, `Remote Mining`, v.roomName, () => v.mineralType);
                _.set(Memory.rooms, [v.roomName, "asRemoteMineralRoom"], roomName);
            });
        }
        /**
         * Remote Energy : Start from Level 5
         */
        if (Game.rooms[roomName].controller.level >= 5) {
            /** Ensure Visibility */
            this.room2RemoteMiningCandidates[roomName].forEach(v => {
                if (!this[`_remote_mining_energy_${roomName}=>${v.roomName}`]) {
                    this.DescribeRoute(roomName, v.roomName).forEach(r => {
                        this.EnsureVisibility(r);
                        _.set(Memory.rooms, [r, "isResponsible"], true);
                    });
                    TaskConstructor.ReserveTask(v.roomName);
                    this[`_remote_mining_energy_${roomName}=>${v.roomName}`] = true;
                }
            });
        }
        /**
         * Remote Mineral : Start from Level 7
         * @TODO
         */
        if (Game.rooms[roomName].controller.level >= 7) {

        }
    }
    /**
     * Query returns an array of roomName sorted by distance.
     * @param {string} roomName
     */
    Query(roomName) {
        this.updateDistanceCache(roomName);
        return this.sortedDistances[roomName];
    }
    /**
     * @param {"normal" | "remoteMining_energy" | "remoteMining_mineral"} roomType
     * @param {string} roomName
     * @param {string} [fromRoomName] Used when `roomType` is `remoteMining_energy` or `remoteMining_mineral`.
     * @param {boolean} [compulsoryConstruct] Used when `room` becomes visible in which case `objectDestroy` is not able to be detected through events.
     */
    AutoPlan(roomType, roomName, fromRoomName, compulsoryConstruct = false) {
        const _cpuUsed = Game.cpu.getUsed();
        /** Initialize some Variables */
        if (!Memory.autoPlan) Memory.autoPlan = {};
        if (!Memory.autoPlan[roomName]) Memory.autoPlan[roomName] = {};
        /**
         * 0. Decision Options & Auxiliary Function
         */
        const options = {
            controllerUpgrade : false,
            objectDestroy : false,
            structureConstruct : false
        };
        // NOTICE: remove Of ConstructionSite is not counted by EVENT_OBJECT_DESTROYED.
        if (global.signals.IsConstructionSiteCancel[roomName] || global.signals.IsStructureDestroy[roomName]) options.objectDestroy = true;
        if (global.signals.IsNewStructure[roomName]) options.structureConstruct = true;
        /**
         * @param {Response} response
         */
        const parseResponse = (response) => {
            if (response.value === response.PLACE_HOLDER) return true;
            if (response.value === response.WAIT_UNTIL_UPGRADE && options.controllerUpgrade) return true;
            if (response.value === response.WAIT_UNTIL_TIMEOUT && Game.time >= response.timeout) return true;
            return false;
        };
        if (roomType === "normal") {
            /**
             * 1. Prepare Configuration for Room : roomName
             */
            if (!this.planCache[roomName]) {
                this.planCache[roomName] = {
                    roomType : "normal",
                    controllerLevel : Game.rooms[roomName].controller.level,
                    feedbacks : {}
                };
                options.controllerUpgrade = true;
            }
            /**
             * 2. Update Decision Options and Adjust Settings
             */
            if (this.planCache[roomName].roomType === "normal" && Game.rooms[roomName].controller.level !== this.planCache[roomName].controllerLevel) {
                options.controllerUpgrade = true;
                this.planCache[roomName].controllerLevel = Game.rooms[roomName].controller.level;
            }
            if (DEBUG) {
                console.log(`AutoPlan(${roomName})->Init consumes ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}.`);
            }
            /**
             * 3. Calling Planner
             */
            const level = this.planCache[roomName].controllerLevel;
            /* Plan For CentralTransfer Unit */
            if (!this.planCache[roomName].feedbacks["centralTransfer"]) this.planCache[roomName].feedbacks["centralTransfer"] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks["centralTransfer"].Merge(planner.Plan(roomName, "normal", "centralTransfer", {
                display : true,
                tag : parseResponse(this.planCache[roomName].feedbacks["centralTransfer"].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks["centralTransfer"].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks["centralTransfer"].Pick("road")) || options.objectDestroy,
                num : 1,
                linkedUnits : ["centralSpawn"],
                writeToMemory : true,
                readFromMemory : true
            }));
            /* Plan For Tower Unit */
            if (!this.planCache[roomName].feedbacks["towers"]) this.planCache[roomName].feedbacks["towers"] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks["towers"].Merge(planner.Plan(roomName, "normal", "towers", {
                display : true,
                tag : parseResponse(this.planCache[roomName].feedbacks["towers"].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks["towers"].Pick("build")) || (options.objectDestroy),
                road : parseResponse(this.planCache[roomName].feedbacks["towers"].Pick("road")) || (options.objectDestroy),
                num : 6,
                writeToMemory : true,
                readFromMemory : true
            }));
            /* Plan For StructureController's Link */
            if (!this.planCache[roomName].feedbacks["controllerLink"]) this.planCache[roomName].feedbacks["controllerLink"] = new Response(Response.prototype.PLACE_HOLDER);
            if (parseResponse(this.planCache[roomName].feedbacks["controllerLink"]) || options.objectDestroy || options.structureConstruct) this.planCache[roomName].feedbacks["controllerLink"].Feed(planner.PlanForAroundLink(Game.rooms[roomName].controller, global.Lucy.Rules.arrangements.UPGRADE_ONLY));
            /* Plan For CentralSpawn Unit */
            if (!this.planCache[roomName].feedbacks["centralSpawn"]) this.planCache[roomName].feedbacks["centralSpawn"] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            if (DEBUG) {
                console.log(roomName, JSON.stringify(this.planCache[roomName].feedbacks["centralSpawn"]));
            }
            this.planCache[roomName].feedbacks["centralSpawn"].Merge(planner.Plan(roomName, "normal", "centralSpawn", {
                display : true,
                tag : parseResponse(this.planCache[roomName].feedbacks["centralSpawn"].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks["centralSpawn"].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks["centralSpawn"].Pick("road")) || options.objectDestroy,
                num : 1,
                linkedRoomPosition : [].concat(
                    Game.rooms[roomName]["sources"].map(s => s.pos),
                    (Game.rooms[roomName].controller.level >= 5 ? Game.rooms[roomName]["mineral"].pos : []),
                    Game.rooms[roomName].controller.pos
                ),
                writeToMemory : true,
                readFromMemory : true
            }));
            /* Plan For Harvest Unit */
            if (!this.planCache[roomName].feedbacks["harvestEnergy"]) this.planCache[roomName].feedbacks["harvestEnergy"] = {};
            for (const source of Game.rooms[roomName].sources) {
                /**
                 * Container
                 */
                if (!this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "container"]) this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "container"] = new Response(Response.prototype.PLACE_HOLDER);
                if (parseResponse(this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "container"]) || options.objectDestroy || options.structureConstruct) this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "container"].Feed(planner.PlanForAroundOverlapContainer(source, "forSource", true));
                /**
                 * Link
                 */
                if (!this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "link"]) this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "link"] = new Response(Response.prototype.PLACE_HOLDER);
                if (parseResponse(this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "link"]) || options.objectDestroy || options.structureConstruct) this.planCache[roomName].feedbacks["harvestEnergy"][source.id + "link"].Feed(planner.PlanForAroundLink(source, "forSource"));
            }
            /* Preplan for Central Lab (Reserve Space) */
            if (!this.planCache[roomName].feedbacks["labUnit"]) this.planCache[roomName].feedbacks["labUnit"] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks["labUnit"].Merge(planner.Plan(roomName, "normal", "labUnit", {
                tag : parseResponse(this.planCache[roomName].feedbacks["labUnit"].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks["labUnit"].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks["labUnit"].Pick("road")) || options.objectDestroy,
                num : 1,
                linkedUnits : ["centralSpawn"],
                writeToMemory : true,
                readFromMemory : true
            }));
            /* Plan for Extensions */
            if (!this.planCache[roomName].feedbacks[`extensionUnit_${0}`]) this.planCache[roomName].feedbacks[`extensionUnit_${0}`] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks[`extensionUnit_${0}`].Merge(planner.Plan(roomName, "normal", "extensionUnit", {
                tag : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${0}`].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${0}`].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${0}`].Pick("road")) || options.objectDestroy,
                num : 1,
                writeToMemory : true,
                readFromMemory : true,
                unitTypeAlias : `extensionUnit_${0}`
            }));
            /* Plan for Extensions */
            if (!this.planCache[roomName].feedbacks[`extensionUnit_${1}`]) this.planCache[roomName].feedbacks[`extensionUnit_${1}`] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks[`extensionUnit_${1}`].Merge(planner.Plan(roomName, "normal", "extensionUnit", {
                tag : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${1}`].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${1}`].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${1}`].Pick("road")) || options.objectDestroy,
                num : 1,
                writeToMemory : true,
                readFromMemory : true,
                unitTypeAlias : `extensionUnit_${1}`
            }));
            /* Plan for Container of Mineral */
            if (!this.planCache[roomName].feedbacks["harvestMineral"]) this.planCache[roomName].feedbacks["harvestMineral"] = new Response(Response.prototype.PLACE_HOLDER);
            if (parseResponse(this.planCache[roomName].feedbacks["harvestMineral"]) || options.objectDestroy || options.structureConstruct) this.planCache[roomName].feedbacks["harvestMineral"].Feed(planner.PlanForAroundOverlapContainer(Game.rooms[roomName].mineral, "forMineral", true));
            /* Plan for Extensions */
            if (!this.planCache[roomName].feedbacks[`extensionUnit_${2}`]) this.planCache[roomName].feedbacks[`extensionUnit_${2}`] = new ResponsePatch(Response.prototype.PLACE_HOLDER, "tag", "build", "road");
            this.planCache[roomName].feedbacks[`extensionUnit_${2}`].Merge(planner.Plan(roomName, "normal", "extensions", {
                tag : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${2}`].Pick("tag")) || options.structureConstruct,
                build : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${2}`].Pick("build")) || options.objectDestroy,
                road : parseResponse(this.planCache[roomName].feedbacks[`extensionUnit_${2}`].Pick("road")) || options.objectDestroy,
                num : 12,
                writeToMemory : true,
                readFromMemory : true,
                unitTypeAlias : `extensionUnit_${2}`
            }));
            /* Plan for Protected Ramparts */
            if (!this.planCache[roomName].feedbacks["protectedRamparts"]) this.planCache[roomName].feedbacks["protectedRamparts"] = new Response(Response.prototype.PLACE_HOLDER);
            this.planCache[roomName].feedbacks["protectedRamparts"].Feed(planner.PlanForProtectedRamparts(roomName, ["centralSpawn", "centralTransfer", "towers", "labUnit", `extensionUnit_${0}`, `extensionUnit_${1}`, `extensionUnit_${2}`], {
                display : true,
                build : parseResponse(this.planCache[roomName].feedbacks["protectedRamparts"]) || options.objectDestroy,
                readFromMemory : true,
                writeToMemory : true
            }));
            if (level >= 6) {
                /** @type {Mineral} */
                const mineral = Game.rooms[roomName].mineral;
                if (!Game.rooms[roomName][STRUCTURE_EXTRACTOR] && Game.rooms[roomName].controller.level >= 6 && mapMonitor.Fetch(roomName, mineral.pos.y, mineral.pos.x).filter(s => s.structureType === STRUCTURE_EXTRACTOR).length === 0) Game.rooms[roomName].createConstructionSite(mineral.pos, STRUCTURE_EXTRACTOR);
            }
        } else if (roomType === "remoteMining_energy") {
            /**
             * 1. Prepare Configuration for Room : roomName
             */
            if (!this.planCache[roomName]) {
                this.planCache[roomName] = {
                    roomType : "remoteMining_energy",
                    feedbacks : {}
                };
            }
            /**
             * 2. Calling Planner
             */
            for (const source of Game.rooms[roomName].memory.sources) {
                /** Plan for Road */
                if (!this.planCache[roomName].feedbacks[`roads_${source.id}`]) this.planCache[roomName].feedbacks[`roads_${source.id}`] = new Response(Response.prototype.PLACE_HOLDER);
                this.planCache[roomName].feedbacks[`roads_${source.id}`].Feed(planner.Link(fromRoomName, new RoomPosition(source.pos.x, source.pos.y, source.pos.roomName), {
                    display : true,
                    road : parseResponse(this.planCache[roomName].feedbacks[`roads_${source.id}`]) || options.objectDestroy || compulsoryConstruct,
                    maxRooms : 2
                }));
                // console.log(`[roads_${source.id}]=>${JSON.stringify(this.planCache[roomName].feedbacks[`roads_${source.id}`])}`);
                /** Plan for Container */
                if (!this.planCache[roomName].feedbacks[`container_${source.id}`]) this.planCache[roomName].feedbacks[`container_${source.id}`] = new Response(Response.prototype.PLACE_HOLDER);
                if (parseResponse(this.planCache[roomName].feedbacks[`container_${source.id}`]) || options.objectDestroy || options.structureConstruct || compulsoryConstruct) this.planCache[roomName].feedbacks[`container_${source.id}`].Feed(planner.PlanForAroundOverlapContainer(Game.getObjectById(source.id), "remoteSource", false));
            }
        } else if (roomType === "remoteMining_mineral") {
            
        }
    }
    LinkMyRooms() {
        /**
         * Constants & Variables
         */
        const MAXIMUM_DISTANCE = 1;
        const myRooms = global.Lucy.Collector.colonies;
        /**
         * @param {Response} response
         */
        const parseResponse = (response) => {
            if (response.value === response.PLACE_HOLDER) return true;
            if (response.value === response.WAIT_UNTIL_TIMEOUT && Game.time >= response.timeout) return true;
            return false;
        };
        /**
         * 1. Update Cache
         */
        if (this.controlledRoomLinkCache.amount !== myRooms.length) {
            this.controlledRoomLinkCache.amount = myRooms.length;
            this.controlledRoomLinkCache.links = [];
            for (let i = 0; i < myRooms.length; ++i) for (let j = i + 1; j < myRooms.length; ++j) if (this.CalcRoomDistance(myRooms[i].name, myRooms[j].name) <= MAXIMUM_DISTANCE) this.controlledRoomLinkCache.links.push({rooms : [myRooms[i].name, myRooms[j].name], feedback : new Response(Response.prototype.PLACE_HOLDER)});
        }
        for (const {rooms, feedback} of this.controlledRoomLinkCache.links) {
            const objectDestroy = (roomName) => global.signals.IsConstructionSiteCancel[roomName] || global.signals.IsStructureDestroy[roomName];
            feedback.Feed(planner.Link(rooms[0], rooms[1], {
                display : true,
                road : parseResponse(feedback) || objectDestroy(rooms[0]) || objectDestroy(rooms[1])
            }));
        }
    }
    /**
     * @deprecated
     * `StructureObserver` is much more efficient.
     */
    ScoutingRooms() {
        /**
         * @param {Set<string>} roomSet
         * @param {number} TIMEOUT
         */
        const scoutingRooms = (roomSet, TIMEOUT) => {
            Array.from(roomSet).filter(r => !this.IsUnreachable(r) && (!Memory.rooms[r] || Memory.rooms[r]._lastCheckingTick + TIMEOUT < Game.time)).forEach(r => TaskConstructor.ScoutTask(r));
        };
        /**
         * Detecting Deposits and PowerBanks
         * For a nearby highway room, if a powerbank could be successfully harvested, its remaining tick should be larger than 4500 when detected.
         * Considering ticks spent on the road (~100-200), the scouting interval should be set to 100.
         */
        scoutingRooms(this.highwayRoomRecorded, 100);
        /**
         * Detecting Invader Core
         */
        scoutingRooms(this.SKRoomRecorded, 1000);
        /**
         * Portals are quite stable, which do not require frequent visiting.
         */
        scoutingRooms(this.PortalRoomRecorded, 10000);
    }
    constructor() {
        /** @type { {[roomName : string] : Array<string>} } */
        this.sortedDistances                = {};
        /** @type { {[roomName : string] : number} } */
        this.sortedDistancesExpiration      = {};
        /**
         * @type { {[roomName : string] : { roomType : string, controllerLevel : number, feedbacks : { [unitName : string] : {[module : string] : Response} | ResponsePatch} }} }
         */
        this.planCache                      = {};
        /** @type { {amount : number, links: Array<{rooms : [string, string], feedback : Response}>} } */
        this.controlledRoomLinkCache        = {amount : 0, links : []};
        /** @type { {[roomName : string] : {controllerLevel : number, remoteRoomNum : number}} } */
        this.remoteMineCache                = {};
        /** @type { {[roomName : string] : Array<Array<number>>} } */
        this.room2distanceFromCenter        = {};
        /** @type { {[roomName : string] : RoomPosition} } */
        this.room2center                    = {};
        /** @type { {[roomName : string] : Array<string>} } */
        this.roomEdges                      = {};
        /** @type { {[roomName : string] : boolean} } */
        this.roomVisited                    = {};
        /** @type { Set<string> } */
        this.roomRecorded                   = new Set();
        /** @type { Set<string> } */
        this.highwayRoomRecorded            = new Set();
        /** @type { Set<string> } */
        this.SKRoomRecorded                 = new Set();
        /** @type { Set<string> } */
        this.PortalRoomRecorded             = new Set();
        /** @type { Set<string> } */
        this.NormalRoomRecorded             = new Set();
        /** @type { {[origin : string] : {[roomName : string] : {distance : number, fromRoomName : string}}} } */
        this.disFromRoom                    = {};
        /** @type { {[origin : string] : number} } */
        this.disFromRoomTotalRooms          = {};
        /** @type { {[roomName : string] : Array<{roomName : string, profit : number}>} } */
        this.room2RemoteMiningCandidates    = {};
        /** @type { {[roomName : string] : Array<{roomName : string, mineralType : MineralConstant}>} } */
        this.room2RemoteMineralCandidates   = {};
        /** @type { {[roomName : string] : number} } */
        this.room2RemoteMineExpiration      = {};
        /** @type { {[roomName : string] : {[roomName : string] : Array<string>}} } */
        this.routes                         = {};
    }
};
const _Map = new Map();

profiler.registerClass(Unit, "Unit");
profiler.registerClass(MapMonitor, "MapMonitor");
profiler.registerClass(Planner, "Planner");
profiler.registerClass(Map, "Map");

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const MapPlugin = {
    init : () => {
        if (!Memory._plannerCache) Memory._plannerCache = {};
        if (!Memory.rooms) Memory.rooms = {};
        /** In case for detecting once updating Code */
        if (!Memory._unreachableRooms) Memory._unreachableRooms = {};
        global.Map = _Map;
        global.MapMonitorManager = mapMonitor;
        global.Planner = planner;
    },
    tickStart: () => {
        // global.Map.ScoutingRooms();
    }
};
profiler.registerObject(MapPlugin, "MapPlugin");
global.Lucy.App.on(MapPlugin);
/** Register GCL Upgrading Response */
global.Lucy.App.monitor({label : "gcl", fetch : () => Game.gcl.level, init : global.Lucy.Collector.colonies.length, func : (newNumber, oldNumber) => global.Map.ClaimRoom(newNumber - oldNumber)});