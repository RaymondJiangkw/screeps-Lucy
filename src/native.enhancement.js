/**
 * @module native.enhancement
 */
const getCacheExpiration    =   require('./util').getCacheExpiration;
const calcDistance          =   require('./util').calcDistance;
const constructArray        =   require('./util').constructArray;
const isConstructionSite    =   require('./util').isConstructionSite;
const calcInRoomDistance    =   require('./util').calcInRoomDistance;
const profiler = require('./screeps-profiler');
function mount() {
    /**
     * @see {native.encapsulation.flagIdIndicator}
     */
    const flagIdIndicator = "flag-";
    /**
     * Add `id` to Flag.
     */
    Object.defineProperty(Flag.prototype, "id", {
        get() {
            return flagIdIndicator + this.name;
        },
        enumerable: true,
        configurable : false
    });
}
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
        /**
         * @private
         */
        this._dx = this.pattern[0].length;
        /**
         * @private
         */
        this._dy = this.pattern.length;
        /* Reshape pattern into 3-dim */
        for (let j = 0; j < this._dy; ++j) {
            for (let i = 0; i < this._dx; ++i) {
                // NO COMPILE HERE : take care ourselves
                if (typeof this.pattern[j][i] === "string") this.pattern[j][i]=[this.pattern[j][i]];
            }
        }
        /**
         * @private
         * @type { {[type in StructureConstant]? : number} }
         */
        this.num = {};
        /**
         * @private
         * @type { {[type in StructureConstant]? : Array<[number,number]>} }
         */
        this.structureType2pos = {};
        /**
         * @private
         */
        this.vacantSpace = 0;
        /**
         * @private
         */
        this._total = 0;
        for (let y = 0; y < this.pattern.length; ++y) {
            for (let x = 0; x < this.pattern[y].length; ++x) {
                for (let k = 0; k < this.pattern[y][x].length; ++k) {
                    if (this.pattern[y][x][k] === this.PLACE_ANY || this.pattern[y][x][k] === this.PLACE_WALL) continue;
                    if (this.pattern[y][x][k] === this.PLACE_VACANT) {
                        ++this.vacantSpace;
                        continue;
                    }
                    ++this._total;
                    if (!this.num[this.pattern[y][x][k]]) this.num[this.pattern[y][x][k]] = 0;
                    if (!this.structureType2pos[this.pattern[y][x][k]]) this.structureType2pos[this.pattern[y][x][k]] = [];
                    ++this.num[this.pattern[y][x][k]];
                    this.structureType2pos[this.pattern[y][x][k]].push([y,x]);
                    ++this.vacantSpace;
                }
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
    Display(roomName, y, x) {
        new RoomVisual(roomName).rect(x, y, this.dx-1, this.dy-1, {"stroke" : this.strokeColor, "strokeWidth" : 0.5})
                                .text(this.pinText, x, y)
                                .text(this.pinText, x+this.dx-1,y+this.dy-1);
    }
    /**
     * @param {Array<Array<StructureConstant | "any" | "vacant">} pattern Unit.PLACE_WALL fits into STRUCTURE_WALL and TERRAIN_MASK_WALL.
     * @param {string} tag used to denote all the structures belonging to this pattern
     * @param {string} pinText
     * @param {string} strokeColor
     * @param { {type : "distanceSum", objects : Array<StructureConstant | "energies" | MineralConstant | "mineral">, subjects : Array<StructureConstant> } } metrics
     * @param { {alongRoad? : boolean} } [options] specify some other specifications
     */
    constructor(pattern, tag, pinText, strokeColor, metrics, options = {}) {
        _.defaults(options, {alongRoad:false});
        /** @private */
        this.pattern = pattern;
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
            this.evaluatePos = function(room, y, x) {
                let objects = [];
                for (const key of this.metrics.objects) {
                    if (key === "energies") objects = objects.concat(room["energies"]);
                    else if (key === "mineral") objects = objects.concat(room["mineral"]);
                    else objects = objects.concat(planer.FetchRoomPlannedStructures(room.name, key));
                }
                let subjects = [];
                for (const structureType of this.metrics.subjects) subjects = subjects.concat(this.FetchStructurePos(structureType).map(p => p = [p[0]+y,p[1]+x]).map(p => new RoomPosition(p[1],p[0],room.name)));
                let ret = 0;
                subjects.forEach(s_p => objects.forEach(o_p => ret += calcInRoomDistance(s_p, o_p, room)));
                return ret;
            }.bind(this);
        }
    }
};
/**
 * Static Variables
 */
Unit.prototype.PLACE_ANY            = "any";
Unit.prototype.PLACE_VACANT         = "vacant";
/**
 * Wall Here means natural wall or artificial wall.
 */
Unit.prototype.PLACE_WALL           = "wall";

/**
 * Class Representation for MapMonitor.
 * Single Class
 */
class MapMonitor {
    /**
     * @private
     * @returns {Boolean}
     */
    needUpdate() {
        return global.signals.IsAnyNewStructure || global.signals.IsAnyNewConstructionSite || global.signals.IsAnyStructureDestroy || global.signals.IsAnyConstructionSiteCancel || false;
    }
    /**
     * Specialized at Structure and ConstructionSite.
     * @private
     */
    updateStructureCache() {
        if (!this._init || (this.needUpdate() && Game.time > this._lastUpdatingTick)) {
            console.log(`<p style="color:gray;display:inline;">[Log]</p> Updating Cache of Structure.`);
            this._init = true;
            this._lastUpdatingTick = Game.time;
            /**
             * @private
             * @type { {[roomName : string] : Array<Array<Id<Structure>> >} }
             */
            this.structures = {};
            /**
             * @private
             * @type { {[roomName : string] : Array<Array<Id<ConstructionSite>> > } }
             */
            this.constructionSites = {};
            /**
             * @private
             * @type { {[roomName : string] : {[structureType in StructureConstant] : {structures : number, constructionSites : number, total : number}}} }
             */
            this.cnts = {};
            /**
             * Since Road, Container, ConstructedWall are not included in Game.structures. They should be manually added.
             * @param {Structure} structure
             */
            const addStructure = (structure) => {
                /* Structure */
                if (!this.structures[structure.pos.roomName]) {
                    this.structures[structure.pos.roomName] = constructArray([50,50],new Array());
                }
                this.structures[structure.pos.roomName][structure.pos.y][structure.pos.x].push(structure.id);
                /* Cnt */
                if (!this.cnts[structure.pos.roomName]) this.cnts[structure.pos.roomName] = {};
                if (!this.cnts[structure.pos.roomName][structure.structureType]) this.cnts[structure.pos.roomName][structure.structureType] = {"structures" : 0, "constructionSites" : 0, "total" : 0};
                ++this.cnts[structure.pos.roomName][structure.structureType]["structures"];
                ++this.cnts[structure.pos.roomName][structure.structureType]["total"];
            };
            for (const structureId in Game.structures) addStructure(Game.structures[structureId]);
            for (const roomName in Game.rooms) {
                for (const road of Game.rooms[roomName][STRUCTURE_ROAD + "s"]) addStructure(road);
                for (const container of Game.rooms[roomName][STRUCTURE_CONTAINER + "s"]) addStructure(container);
                for (const wall of Game.rooms[roomName][STRUCTURE_WALL + "s"]) addStructure(wall);
            }
            for (const constructionSiteId in Game.constructionSites) {
                const constructionSite = Game.constructionSites[constructionSiteId];
                /* ConstructionSite */
                if (!this.constructionSites[constructionSite.pos.roomName]) {
                    this.constructionSites[constructionSite.pos.roomName] = constructArray([50,50],new Array());
                }
                this.constructionSites[constructionSite.pos.roomName][constructionSite.pos.y][constructionSite.pos.x].push(constructionSite.id);
                /* Cnt */
                if (!this.cnts[constructionSite.pos.roomName]) this.cnts[constructionSite.pos.roomName] = {};
                if (!this.cnts[constructionSite.pos.roomName][constructionSite.structureType]) this.cnts[constructionSite.pos.roomName][constructionSite.structureType] = {"structures" : 0, "constructionSites" : 0, "total" : 0};
                ++this.cnts[constructionSite.pos.roomName][constructionSite.structureType]["constructionSites"];
                ++this.cnts[constructionSite.pos.roomName][constructionSite.structureType]["total"];
            }
        }
    }
    /**
     * @private
     * @param {string} roomName
     */
    updateTerrainCache(roomName) {
        this.terrains[roomName] = constructArray([50,50],0);
        const terrain = new Room.Terrain(roomName);
        for (let y = 0; y < 50; ++y) {
            for (let x = 0; x < 50; ++x) this.terrains[roomName][y][x] = terrain.get(x, y);
        }
    }
    /**
     * @private
     * @param {string} roomName
     */
    updateSpaceCache(roomName) {
        const terrains = this.FetchTerrain(roomName);
        this.spaces[roomName] = constructArray([50,50],0);
        this.spaces[roomName].get = (y,x) => {
            if (y < 0 || y >= 50 || x < 0 || x >= 50) return 0;
            return this.spaces[roomName][y][x];
        };
        for (let y = 0; y < 50; ++y) {
            for (let x = 0; x < 50; ++x) {
                this.spaces[roomName][y][x] = this.spaces[roomName].get(y,x-1)+this.spaces[roomName].get(y-1,x)-this.spaces[roomName].get(y-1,x-1)+((terrains[y][x] === TERRAIN_MASK_LAVA || terrains[y][x] === TERRAIN_MASK_WALL)? 0 : 1);
            }
        }
    }
    updateStructureCntCache(roomName) {
        this.updateStructureCache();
        if (!this.structureCnt[roomName] || this.needUpdate()) {
            this.structureCnt[roomName] = constructArray([50,50],0);
            this.structureCnt[roomName].get = (y,x) => {
                if (y < 0 || y >= 50 || x < 0 || x >= 50) return 0;
                return this.structureCnt[roomName][y][x];
            };
            for (let y = 0; y < 50; ++y) {
                for (let x = 0; x < 50; ++x) {
                    this.structureCnt[roomName][y][x] = this.structureCnt[roomName].get(y,x-1)+this.structureCnt[roomName].get(y-1,x)-this.structureCnt[roomName].get(y-1,x-1)+this.FetchStructure(roomName,y,x).length;
                }
            }
        }
    }
    updateStructureAndConstructionSiteCntCache(roomName) {
        this.updateStructureCache();
        if (!this.structureAndConstructionSiteCnt[roomName] || this.needUpdate()) {
            this.structureAndConstructionSiteCnt[roomName] = constructArray([50,50],0);
            this.structureAndConstructionSiteCnt[roomName].get = (y,x) => {
                if (y < 0 || y >= 50 || x < 0 || x >= 50) return 0;
                return this.structureAndConstructionSiteCnt[roomName][y][x];
            };
            for (let y = 0; y < 50; ++y) {
                for (let x = 0; x < 50; ++x) {
                    this.structureAndConstructionSiteCnt[roomName][y][x] = this.structureAndConstructionSiteCnt[roomName].get(y,x-1)+this.structureAndConstructionSiteCnt[roomName].get(y-1,x)-this.structureAndConstructionSiteCnt[roomName].get(y-1,x-1)+this.Fetch(roomName,y,x).length;
                }
            }
        }
    }
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
     * @param {string} roomName
     * @param {string} _y1
     * @param {string} _x1
     * @param {strin} _y2
     * @param {string} _x2
     */
    IsVacant(roomName, _y1, _x1, _y2, _x2) {
        return this.FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) === (y2 - y1 + 1) * (x2 - x1 + 1);
    }
    /**
     * @param {string} roomName
     * @param {string} _y1
     * @param {string} _x1
     * @param {strin} _y2
     * @param {string} _x2
     * @returns {number}
     */
    FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) {
        if (!this.spaces[roomName]) this.updateSpaceCache(roomName);
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
     * @returns {number}
     */
    FetchStructureCnt(roomName, _y1, _x1, _y2, _x2) {
        this.updateStructureCntCache(roomName);
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        return this.structureCnt[roomName].get(y2,x2)-this.structureCnt[roomName].get(y2,x1-1)-this.structureCnt[roomName].get(y1-1,x2)+this.structureCnt[roomName].get(y1-1,x1-1);
    }
    /**
     * @param {string} roomName
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @returns {number}
     */
    FetchStructureAndConstructionSiteCnt(roomName, _y1, _x1, _y2, _x2) {
        this.updateStructureAndConstructionSiteCntCache(roomName);
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        return this.structureAndConstructionSiteCnt[roomName].get(y2,x2)-this.structureAndConstructionSiteCnt[roomName].get(y2,x1-1)-this.structureAndConstructionSiteCnt[roomName].get(y1-1,x2)+this.structureAndConstructionSiteCnt[roomName].get(y1-1,x1-1);
    }
    /**
     * @param {string} roomName
     * @returns {Array<Array<number>>}
     */
    FetchTerrain(roomName) {
        if (!this.terrains[roomName]) this.updateTerrainCache(roomName);
        return this.terrains[roomName];
    }
    /**
     * @param {string} roomName
     * @param {StructureConstant} structureType
     * @returns { {structures : number, constructionSites : number, total : number} }
     */
    FetchCnt(roomName, structureType) {
        this.updateStructureCache();
        if (!this.cnts[roomName] || !this.cnts[roomName][structureType]) return {"constructionSites" : 0, "structures" : 0, "total" : 0};
        return this.cnts[roomName][structureType]; 
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure | ConstructionSite>}
     */
    Fetch(roomName, y, x) {
        if (!this["fetch" + y + "," + x + "tick"] || this["fetch" + y + "," + x + "tick"] < Game.time) {
            this["fetch" + y + "," + x + "tick"] = Game.time;
            this.updateStructureCache();
            const structures = (this.structures[roomName]? this.structures[roomName][y][x] : []);
            const constructionSites = (this.constructionSites[roomName]? this.constructionSites[roomName][y][x] : []);
            return this["fetch" + y + "," + x] = [].concat(structures, constructionSites).map(Game.getObjectById);
        } else return this["fetch" + y + "," + x];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure>}
     */
    FetchStructure(roomName, y, x) {
        if (!this["fetchstructure" + y + "," + x + "tick"] || this["fetchstructure" + y + "," + x + "tick"] < Game.time) {
            this["fetchstructure" + y + "," + x + "tick"] = Game.time;
            this.updateStructureCache();
            return this["fetchstructure" + y + "," + x] = (this.structures[roomName]? this.structures[roomName][y][x] : []).map(Game.getObjectById);
        } else return this["fetchstructure" + y + "," + x];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure>}
     */
    FetchAroundStructure(roomName, y, x) {
        let ret = [];
        const dy = [-1,-1,-1,0,0,1,1,1], dx = [-1,0,1,-1,1,-1,0,1], dlen = dy.length;
        for (let i = 0; i < dlen; ++i) {
            const _y = y + dy[i], _x = x + dx[i];
            if (!this.isValidPos(_y, _x)) continue;
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
    FetchConstructionSites(roomName, y, x) {
        if (!this["fetchconstructionsites" + y + "," + x + "tick"] || this["fetchconstructionsites" + y + "," + x + "tick"] < Game.time) {
            this["fetchconstructionsites" + y + "," + x + "tick"] = Game.time;
            this.updateStructureCache();
            return this["fetchconstructionsites" + y + "," + x] = (this.constructionSites[roomName]? this.constructionSites[roomName][y][x] : []).map(Game.getObjectById);
        } else return this["fetchconstructionsites" + y + "," + x];
    }
    /**
     * @param {string} roomName
     * @param {number} y
     * @param {number} x
     * @returns {Array<Structure>}
     */
    FetchAroundConstructionSites(roomName, y, x) {
        let ret = [];
        const dy = [-1,-1,-1,0,0,1,1,1], dx = [-1,0,1,-1,1,-1,0,1], dlen = dy.length;
        for (let i = 0; i < dlen; ++i) {
            const _y = y + dy[i], _x = x + dx[i];
            if (!this.isValidPos(_y, _x)) continue;
            ret = ret.concat(this.FetchConstructionSites(roomName, _y, _x));
        }
        return ret;
    }
    constructor() {
        /**
         * @private
         * @type { {[roomName : string] : Array<Array<number>>} }
         */
        this.terrains       = {};
        /**
         * @private
         * @type { {[roomName : string] : Array<Array<number> >} }
         */
        this.spaces         = {};
        /**
         * @private
         * @type { {[roomName : string] : Array<Array<number> >} }
         */
        this.structureCnt   = {};
        /**
         * @private
         * @type { {[roomName : string] : Array<Array<number> >} }
         */
        this.structureAndConstructionSiteCnt = {};
        this.updateStructureCache();
    }
};
/**
 * @type {MapMonitor}
 */
const mapMonitor = new MapMonitor();

class Planer {
    /**
     * @param {string} roomType
     * @param {string} unitType
     * @param {Unit} unit
     */
    RegisterUnit(roomType, unitType, unit) {
        if (!this.units[roomType]) this.units[roomType] = {};
        this.units[roomType][unitType] = unit;
    }
    /**
     * Registered Unit's Position will be avoided overlapping when planning another unit.
     * However, PLACE_ANY will not be counted.
     * @param {string} roomName
     * @param {Unit} unit
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     */
    RegisterUnitPos(roomName, unit, _y1, _x1, _y2, _x2) {
        // console.log(`Registering : ${roomName} : (${_x1}, ${_y1}, ${_x2}, ${_y2})`);
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        if (!this.roomOccupiedSpace[roomName]) this.roomOccupiedSpace[roomName] = constructArray([50,50], false);
        if (!this.roomStructureRegistered[roomName]) this.roomStructureRegistered[roomName] = {};
        for (let y = y1; y <= y2; ++y) for (let x = x1; x <= x2; ++x) {
            if (unit.Fetch(y - y1, x - x1).indexOf(unit.PLACE_ANY) === -1 && unit.Fetch(y - y1, x - x1).length > 0) this.roomOccupiedSpace[roomName][y][x] = true;
            unit.Fetch(y - y1, x- x1).filter(s => s !== unit.PLACE_ANY && s !== unit.PLACE_VACANT && s !== unit.PLACE_WALL).forEach(s => {
                if (!this.roomStructureRegistered[roomName][s]) this.roomStructureRegistered[roomName][s] = [];
                this.roomStructureRegistered[roomName][s].push({x, y});
            })
        }
    }
    /**
     * @private
     * Returns the number of structures in the region specified by paramters, which fits the unit's pattern.
     * If there is any violation (only allow for perfect match), returns will become -1.
     * @param {number} _y1
     * @param {number} _x1
     * @param {number} _y2
     * @param {number} _x2
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     * @returns {number}
     */
    isUnitFit(_y1, _x1, _y2, _x2, roomName, roomType, unitType) {
        if (!this.units[roomType] || !this.units[roomType][unitType]) return -1;
        const unit = this.units[roomType][unitType];
        /* Optimize : Checking whether the terrain is fit for unit based on vacant space */
        if (mapMonitor.FetchVacantSpaceCnt(roomName, _y1, _x1, _y2, _x2) < unit.VacantSpaceCnt) return -1;
        const terrain = mapMonitor.FetchTerrain(roomName);
        const y1 = Math.min(_y1, _y2), y2 = Math.max(_y1, _y2);
        const x1 = Math.min(_x1, _x2), x2 = Math.max(_x1, _x2);
        let ret = 0;
        for (let y = y1, j = 0; y <= y2; ++y, ++j) {
            for (let x = x1, i = 0; x <= x2; ++x, ++i) {
                if (!unit.Fetch(j,i)) return -1;
                /* Has Been Occupied */
                if (this.roomOccupiedSpace.get(roomName, y, x)) return -1;
                if (unit.Fetch(j,i).indexOf(unit.PLACE_ANY) !== -1) continue;
                if (unit.Fetch(j,i).indexOf(unit.PLACE_VACANT) !== -1) {
                    if (_.filter(mapMonitor.Fetch(roomName,y,x), s => s.structureType !== STRUCTURE_CONTAINER && s.structureType !== STRUCTURE_ROAD && s.structureType !== STRUCTURE_RAMPART).length > 0) return -1;
                    else if (terrain[y][x] === TERRAIN_MASK_WALL) return -1;
                    else continue;
                }
                if (unit.Fetch(j,i).indexOf(unit.PLACE_WALL) !== -1) {
                    if (terrain[y][x] === TERRAIN_MASK_LAVA) return -1;
                    if (terrain[y][x] === TERRAIN_MASK_WALL || _.filter(mapMonitor.Fetch(roomName,y,x),s => s.structureType === STRUCTURE_WALL).length > 0) ++ret;
                    else if (_.filter(mapMonitor.Fetch(roomName,y,x),s => s.structureType !== STRUCTURE_WALL).length > 0) return -1;
                    continue;
                }
                // Structure
                // Structure Road is Ignored, however.
                if (terrain[y][x] === TERRAIN_MASK_WALL) return -1;
                const matchedNum = _.filter(mapMonitor.Fetch(roomName,y,x),s => s.structureType !== STRUCTURE_ROAD && unit.Fetch(j,i).indexOf(s.structureType) !== -1).length;
                if (matchedNum > 0) ret += matchedNum;
                else if (_.filter(mapMonitor.Fetch(roomName,y,x),s => s.structureType !== STRUCTURE_ROAD && unit.Fetch(j,i).indexOf(s.structureType) === -1).length > 0) return -1;
            }
        }
        return ret;
    }
    /**
     * @param {string} roomName
     * @param {StructureConstant} structureType
     * @returns {Array<RoomPosition>}
     */
    FetchRoomPlannedStructures(roomName, structureType) {
        if (!this.roomStructureRegistered[roomName] || !this.roomStructureRegistered[roomName][structureType]) return [];
        return this.roomStructureRegistered[roomName][structureType].map(p => new RoomPosition(p.x, p.y, roomName));
    }
    /**
     * @TODO
     * Exclude Planned Places
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     */
    FetchAvailablePos(roomName, roomType, unitType) {
        if (!this.units[roomType] || !this.units[roomType][unitType]) return [];
        const unit = this.units[roomType][unitType];
        /**
         * In order to ensure there are enough candidates to choose from, all are reserved but sorted.
         */
        /** @type { {[fitNumber : number] : Array<[number, number, number, number]>} } */
        let record = {};
        for (let y = 0; y + unit.dy <= 50; ++y) {
            for (let x = 0; x + unit.dx <= 50; ++x) {
                /** Apply Options of Unit */
                if (unit.Options.alongRoad) {
                    /** Left-Top Node should be strictly adjacent to Road and not on the Road */
                    if ([].concat(mapMonitor.FetchAroundConstructionSites(roomName, y, x).filter(c => c.structureType === STRUCTURE_ROAD).map(c => c.pos), mapMonitor.FetchAroundStructure(roomName, y, x).filter(c => c.structureType === STRUCTURE_ROAD).map(c => c.pos)).filter(pos => !this.roomOccupiedSpace.get(pos.roomName, pos.y, pos.x)).length === 0) {
                        continue;
                    }
                    if (mapMonitor.FetchStructure(roomName, y, x).filter(c => c.structureType === STRUCTURE_ROAD).length > 0 || mapMonitor.FetchConstructionSites(roomName, y, x).filter(c => c.structureType === STRUCTURE_ROAD).length > 0) {
                        continue;
                    }
                }
                const fitNumber = this.isUnitFit(y,x,y+unit.dy-1,x+unit.dx-1,roomName, roomType, unitType);
                if (fitNumber === -1) continue;
                if (!record[fitNumber]) record[fitNumber] = [];
                record[fitNumber].push([y,x,y+unit.dy-1,x+unit.dx-1]);
                // if (fitNumber > 0) console.log(`${roomName} : ${unitType} : (${x}, ${y}) : ${fitNumber} : ${record[fitNumber]} : ${Object.keys(record)}`);
            }
        }
        return record;
    }
    /**
     * ConstructUnit constructs all possible units, which is ordered by number of adjacent existed ConstructionSites and Structures, at one time.
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     * @param {number} y Top
     * @param {number} x Left
     * @returns {boolean | "need_to_call_again"}
     */
    ConstructUnit(roomName, roomType, unitType, y, x) {
        if (!this.units[roomType] || !this.units[roomType][unitType]) return false;
        const unit = this.units[roomType][unitType];
        const terrain = mapMonitor.FetchTerrain(roomName);
        const isConstructed = constructArray([unit.dy, unit.dx], false);
        isConstructed.get = function(y, x) {
            if (y < 0 || y >= isConstructed.length || x < 0 || x >= isConstructed[0].length) return false;
            return isConstructed[y][x];
        };
        /**
         * @type { {[structureType in StructureConstant] : Array<[number,number]>} } y, x
         */
        const scheduledConstructionSites    = {};
        for (let j = y; j < y + unit.dy; ++j) {
            for (let i = x; i < x + unit.dx; ++i) {
                const fetchedStructures = unit.Fetch(j - y, i - x);
                let isThereAnyToBeBuilt = false;
                for (const fetchedStructure of fetchedStructures) {
                    if (fetchedStructure === unit.PLACE_ANY || fetchedStructure === unit.PLACE_VACANT) continue;
                    if (fetchedStructure === unit.PLACE_WALL) {
                        if (terrain[j][i] === TERRAIN_MASK_WALL) continue;
                        else if (_.filter(mapMonitor.Fetch(roomName, j, i), s => s.structureType === STRUCTURE_WALL).length > 0) continue;
                        else {
                            if (!scheduledConstructionSites[STRUCTURE_WALL]) scheduledConstructionSites[STRUCTURE_WALL] = [];
                            scheduledConstructionSites[STRUCTURE_WALL].push([j,i]);
                            isThereAnyToBeBuilt = true;
                        }
                        continue;
                    }
                    const existStructureOrConstructionSites = mapMonitor.Fetch(roomName, j, i).map(s => s.structureType);
                    const toBeConstructed = _.difference(fetchedStructures, existStructureOrConstructionSites);
                    if (toBeConstructed.length === 0) continue;
                    else {
                        for (const structureType of toBeConstructed) {
                            if (!scheduledConstructionSites[structureType]) scheduledConstructionSites[structureType] = [];
                            scheduledConstructionSites[structureType].push([j,i]);
                        }
                        isThereAnyToBeBuilt = true;
                    }
                }
                if (!isThereAnyToBeBuilt) isConstructed[j - y][i - x] = true;
            }
        }
        /* Nothing to be built */
        if (Object.keys(scheduledConstructionSites).length === 0) return false;
        const pdy = [-1,-1,-1,0,0,1,1,1], pdx = [-1,0,1,-1,1,-1,0,1], pcnt = pdy.length;
        const calSurroundedExistedNum = (y,x) => {
            let ret = 0;
            for (let i = 0; i < pcnt; ++i) if (isConstructed.get(y+pdy[i],x+pdx[i])) ++ret;
            return ret;
        };
        let isThereAnyImpede = false;
        for (const structureType in scheduledConstructionSites) {
            if (CONTROLLER_STRUCTURES[structureType][Game.rooms[roomName].controller.level] <= mapMonitor.FetchCnt(roomName, structureType)["total"]) continue;
            const cntInRoom = mapMonitor.FetchCnt(roomName, structureType);
            scheduledConstructionSites[structureType].sort((a,b)=>calSurroundedExistedNum(b[0],b[1])-calSurroundedExistedNum(a[0],a[1]));
            for (let i = 0; i < scheduledConstructionSites[structureType].length && cntInRoom["total"] < CONTROLLER_STRUCTURES[structureType][Game.rooms[roomName].controller.level]; ++i) {
                /* Special Signal for unfinished ConstructionSite, which impedes the construction of new Target */
                if (mapMonitor.FetchConstructionSites(roomName, scheduledConstructionSites[structureType][i][0], scheduledConstructionSites[structureType][i][1]).length > 0) {
                    isThereAnyImpede = true;
                    continue;
                }
                if (Game.rooms[roomName].createConstructionSite(scheduledConstructionSites[structureType][i][1], scheduledConstructionSites[structureType][i][0], structureType) !== OK) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> Creating ConstructionSite of ${structureType} at (${scheduledConstructionSites[structureType][i][1]}, ${scheduledConstructionSites[structureType][i][0]}) of ${roomName} Fails.`);
                    continue;
                }
                ++cntInRoom["constructionSites"];
                ++cntInRoom["total"];
            }
        }
        if (!isThereAnyImpede) return true;
        else return "need_to_call_again";
    }
    /**
     * TagUnit tags all structures in the region matched with the unit.
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     * @param {number} y Top
     * @param {number} x Left
     */
    TagUnit(roomName, roomType, unitType, y, x) {
        if (!this.units[roomType] || !this.units[roomType][unitType]) return false;
        const unit = this.units[roomType][unitType];
        for (let j = y; j < y + unit.dy; ++j) {
            for (let i = x; i < x + unit.dx; ++i) {
                /* Special Case regarding "wall" because of potential natural wall */
                if (unit.Fetch(j - y, i - x).indexOf(unit.PLACE_WALL) !== -1) {
                    if (terrain[j][i] === TERRAIN_MASK_WALL) continue;
                    else _.filter(mapMonitor.FetchStructure(roomName, j, i), s => s.structureType === STRUCTURE_WALL).forEach(w => w.memory.tag = unit.Tag);
                    continue;
                }
                _.filter(mapMonitor.FetchStructure(roomName, j, i), s => unit.Fetch(j - y, i - x).indexOf(s.structureType) !== -1).forEach(s => s.memory.tag = unit.Tag);
            }
        }
        return true;
    }
    /**
     * @param {string} roomName
     * @param {string} roomType
     * @param {string} unitType
     * @param { {display? : boolean, tag? : boolean, build? : boolean, road? : boolean, num : number, linkedRoomPosition? : Array<RoomPosition>, linkedUnits? : Array<string> } } options
     * @returns { {tag : {ret:boolean | "need_to_call_again"}, build : {ret:boolean | "need_to_call_again"}, road : {ret:boolean | "need_to_call_again"} } | null }
     * NOTICE : `linkedUnits` should be planned before linking.
     */
    Plan(roomName, roomType, unitType, options) {
        _.defaults(options, {display : true, tag : false, build : false, road : false, num : 1, linkedRoomPosition : [], linkedUnits : []});
        if (!this.units[roomType] || !this.units[roomType][unitType]) return null;
        const unit = this.units[roomType][unitType];
        const ret = {tag : {ret:false}, build : {ret:false}, road : {ret:false}};
        /* Init Cache */
        if (!this.roomSpaceRegistered[roomName]) this.roomSpaceRegistered[roomName] = {};
        if (!this.units2pos[roomName]) this.units2pos[roomName] = {};
        if (!this._unit2unit[roomName]) this._unit2unit[roomName] = {};
        if (!this._unit2unit[roomName][unitType]) this._unit2unit[roomName][unitType] = {};
        if (!this.units2pos[roomName][unitType] || options.rejectCache) {
            const record = this.FetchAvailablePos(roomName, roomType, unitType);
            // console.log(`${roomName}:${unitType} ${Object.keys(record)}`);
            const fetchNumbers = Object.keys(record).map(s => typeof s === "number" ? s : parseInt(s, 10)).filter(i => typeof i === "number").sort((a, b) => b - a);
            // console.log(`${roomName}:${unitType} ${JSON.stringify(fetchNumbers)}`);
            this.units2pos[roomName][unitType] = [];
            for (const fetchNumber of fetchNumbers) {
                // console.log(fetchNumber);
                this.units2pos[roomName][unitType] = this.units2pos[roomName][unitType].concat(record[fetchNumber].sort((a, b) => unit.EvaluatePos(Game.rooms[roomName], a[0], a[1]) - unit.EvaluatePos(Game.rooms[roomName], b[0], b[1])));
                if (this.units2pos[roomName][unitType].length >= options.num) break;
            }
            this.units2pos[roomName][unitType] = this.units2pos[roomName][unitType].slice(0, options.num);
        }
        // console.log(`${roomName}:${roomType}:${unitType}->${JSON.stringify(this.units2pos[roomName][unitType])}`);
        /* Working Body */
        const candidatePoses = this.units2pos[roomName][unitType];
        for (let i = 0; i < candidatePoses.length; ++i) {
            if (!this.roomSpaceRegistered[roomName][unitType]) this.RegisterUnitPos(roomName, unit, candidatePoses[i][0], candidatePoses[i][1], candidatePoses[i][2], candidatePoses[i][3]);
            /* Display Module */
            if (options.display) unit.Display(roomName, candidatePoses[i][0], candidatePoses[i][1]);
            /* Build Module */
            if (options.build) {
                const constructRet = this.ConstructUnit(roomName, roomType, unitType, candidatePoses[i][0], candidatePoses[i][1]);
                if (ret.build.ret === false) ret.build.ret = constructRet;
                else if (constructRet === "need_to_call_again") ret.build.ret = constructRet;
            }
            /* Tag Module */
            if (options.tag) {
                const tagRet = this.TagUnit(roomName, roomType, unitType, candidatePoses[i][0], candidatePoses[i][1]);
                if (ret.tag.ret === false) ret.tag.ret = tagRet;
                else if (tagRet === "need_to_call_again") ret.tag.ret = tagRet;
            }
            /**
             * Road Module
             */
            /**
             * @param {RoomPosition} posU
             * @param {RoomPosition} posV
             */
            const distance = (posU, posV) => {
                if (!this.roomRoadCache.get(roomName, posU.x, posU.y, posV.x, posV.y)) this.updateLinkedRoad(roomName, posU, posV);
                return this.roomRoadCache.get(roomName, posU.x, posU.y, posV.x, posV.y).length;
            };
            /**
             * @param {RoomPosition} targetPosition
             */
            const fetchBestNode = (targetPosition) => {
                if (!this._bestNodeCache) this._bestNodeCache = {};
                if (!this._bestNodeCache[unitType]) this._bestNodeCache[unitType] = {};
                if (this._bestNodeCache[unitType][targetPosition]) return this._bestNodeCache[unitType][targetPosition];
                else return this._bestNodeCache[unitType][targetPosition] = unit.FetchStructurePos(STRUCTURE_ROAD).map(p => new RoomPosition(p[1] + candidatePoses[i][1], p[0] + candidatePoses[i][0], roomName)).sort((a, b) => distance(a, targetPosition) - distance(b, targetPosition))[0];
            };
            /**
             * @param {RoomPosition} targetPosition
             */
            const linkToPosition = (targetPosition) => {
                const roadPosition = fetchBestNode(targetPosition);
                if (!roadPosition) return;
                const roadRet = this.linkRoad(roomName, this.roomRoadCache.get(roomName, roadPosition.x, roadPosition.y, targetPosition.x, targetPosition.y));
                if (ret.road.ret === false) ret.road.ret = roadRet;
                else if (roadRet === "need_to_call_again") ret.road.ret = roadRet;
            };
            /**
             * @param {RoomPosition} targetPosition
             */
            const displayRoad2Position = (targetPosition) => {
                const roadPosition = fetchBestNode(targetPosition);
                if (!roadPosition) return;
                this.displayRoad(roomName, this.roomRoadCache.get(roomName, roadPosition.x, roadPosition.y, targetPosition.x, targetPosition.y));
            };
            for (const pos of options.linkedRoomPosition) {
                if (options.road) linkToPosition(pos);
                if (options.display) displayRoad2Position(pos);
            }
            for (const entry of options.linkedUnits) {
                if (!this.units[roomType][entry]) {
                    console.log(`<p style="display:inline;color:red;">Error: </p>Unable to find ${entry} in ${roomType}.`);
                    continue;
                }
                if (!this.units2pos[roomName][entry]) {
                    console.log(`<p style="display:inline;color:red;">Error: </p>${entry} cannot be connected before being planed.`);
                    continue;
                }
                const linkedUnit = this.units[roomType][entry];
                if (!this._unit2unit[roomName][unitType][candidatePoses[i][0] + "," + candidatePoses[i][1]]) this._unit2unit[roomName][unitType][candidatePoses[i][0] + "," + candidatePoses[i][1]] = {};
                const cachedPoses = this._unit2unit[roomName][unitType][candidatePoses[i][0] + "," + candidatePoses[i][1]];
                if (cachedPoses[entry] === undefined) {
                    cachedPoses[entry] = [];
                    for (const pos of this.units2pos[roomName][entry]) {
                        const selectedPos = linkedUnit.FetchConnectionNodes().map(p => new RoomPosition(p[1] + pos[1], p[0] + pos[0], roomName)).sort((a,b)=>distance(a, fetchBestNode(a)) - distance(b, fetchBestNode(b)))[0];
                        if (selectedPos) cachedPoses[entry].push(selectedPos);
                    }
                }
                const chosenNodes = cachedPoses[entry];
                if (chosenNodes.length !== this.units2pos[roomName][entry].length) {
                    console.log(`<p style="display:inline;color:red;">Error: </p>Unable to connect some ${entry}s to ${unitType}.`);
                }
                for (const chosenNode of chosenNodes) {
                    if (options.road) linkToPosition(chosenNode);
                    if (options.display) displayRoad2Position(chosenNode);
                }
            }
        }
        /* Update After Processing */
        this.roomSpaceRegistered[roomName][unitType] = true;
        // console.log(`Plan ret : ${roomName} ${unitType} tag : ${options.tag} build : ${options.build} road : ${options.road} : ${JSON.stringify(ret)}`);
        return ret;
    }
    /**
     * @private
     * @param {string} roomName
     * @param {RoomPosition} posU
     * @param {RoomPosition} posV
     */
    updateLinkedRoad(roomName, posU, posV) {
        let path = Game.rooms[roomName].findPath(posU, posV, {
            ignoreCreeps : true,
            ignoreDestructibleStructures : false,
            plainCost : 0,
            swampCost : 0
        });
        path.unshift({x : posU.x, y : posU.y, dx : 0, dy : 0, direction : null});
        this.roomRoadCache.set(roomName ,posU.x, posU.y, posV.x, posV.y, path);
    }
    /**
     * @private
     * @param {string} roomName
     * @param {Array<PathStep>} path
     * @param {boolean} excludeHeadTail
     * NOTICE : Only potential Error is ERR_FULL
     * @returns {boolean | "need_to_call_again"}
     */
    linkRoad(roomName, path, excludeHeadTail = true) {
        const room = Game.rooms[roomName];
        let ret = false;
        let iStart = excludeHeadTail ? 1 : 0, iEnd = excludeHeadTail ? path.length - 1 : path.length;
        for (let i = iStart; i < iEnd; ++i) {
            /**
             * @type {PathStep}
             */
            const singleStep = path.get(i);
            if (mapMonitor.Fetch(roomName, singleStep.y, singleStep.x).filter(s => s.structureType === STRUCTURE_ROAD).length === 0) {
                const _ret = room.createConstructionSite(singleStep.x, singleStep.y, STRUCTURE_ROAD);
                if (_ret !== OK) {
                    console.log(`<p style="color:red;display:inline;">Error: </p> Construct Road at (${singleStep.x}, ${singleStep.y}) Fails with Code ${_ret}!`);
                    ret = "need_to_call_again";
                    continue;
                }
            }
        }
        return ret;
    }
    /**
     * @private
     * @param {string} roomName
     * @param {Array<PathStep} path
     */
    displayRoad(roomName, path) {
        for (let i = 1; i < path.length; ++i) new RoomVisual(roomName).line(path[i].x, path[i].y, path[i - 1].x, path[i - 1].y, {width : 0.5, color : "lightblue"});
    }
    constructor() {
        /**
         * @private
         * @type {{ [roomType : string] : {[unitType : string] : Unit} }}
         */
        this.units      = {};
        /**
         * @private
         * @type { {[roomName : string] : { [unitType : string] : Array<[number, number, number, number]>}} }
         */
        this.units2pos  = {};
        /**
         * @private
         * @type { {[roomName : string] : { [x_1 : number] : {[y_1 : number] : {[x_2 : number] : {[y_2 : number] : Array<PathStep>}}} }} } from -> to
         * NOTICE : Array of Path should be indexed with .get to adapt to optimization targeted at solving double search.
         */
        this.roomRoadCache            = {};
        this.roomRoadCache.set = function(roomName, x_1, y_1, x_2, y_2, path) {
            if (!this[roomName]) this[roomName] = {};
            if (!this[roomName][x_1]) this[roomName][x_1] = {};
            if (!this[roomName][x_1][y_1]) this[roomName][x_1][y_1] = {};
            if (!this[roomName][x_1][y_1][x_2]) this[roomName][x_1][y_1][x_2] = {};
            this[roomName][x_1][y_1][x_2][y_2] = path;
        }.bind(this.roomRoadCache);
        this.roomRoadCache.get = function(roomName, x_1, y_1, x_2, y_2) {
            if (this[roomName] && this[roomName][x_1] && this[roomName][x_1][y_1] && this[roomName][x_1][y_1][x_2] && this[roomName][x_1][y_1][x_2][y_2]) {
                this[roomName][x_1][y_1][x_2][y_2].get = function(index) {
                    return this[index];
                }.bind(this[roomName][x_1][y_1][x_2][y_2]);
                return this[roomName][x_1][y_1][x_2][y_2];
            }
            if (this[roomName] && this[roomName][x_2] && this[roomName][x_2][y_2] && this[roomName][x_2][y_2][x_1] && this[roomName][x_2][y_2][x_1][y_1]) {
                this[roomName][x_2][y_2][x_1][y_1].get = function(index) {
                    return this[this.length - 1 - index];
                }.bind(this[roomName][x_2][y_2][x_1][y_1]);
                return this[roomName][x_2][y_2][x_1][y_1];
            }
            return undefined;
        }.bind(this.roomRoadCache);
        /**
         * @type { {[roomName : string] : Array<Array<boolean> >} }
         */
        this.roomOccupiedSpace      = {};
        this.roomOccupiedSpace.get = (roomName, y, x) => {
            if (!this.roomOccupiedSpace[roomName]) return false;
            return this.roomOccupiedSpace[roomName][y][x];
        };
        /**
         * @type { {[roomName : string] : {[structure in StructureConstant] : Array<{x : number, y : number}>}} }
         */
        this.roomStructureRegistered = {};
        /**
         * @type { {[roomName : string] : {[unitType : string] : boolean}} }
         */
        this.roomSpaceRegistered    = {};
        /**
         * @type { {[roomName : string] : {[unitType : string] : {[pos : string] : {[entry : string] : RoomPosition | null}}}} }
         */
        this._unit2unit = {};
    }
};
/* Room Design Type */
const ROOM_TYPE_NORMAL_CONTROLLED_ROOM  = "normal";

const planer = new Planer();

planer.RegisterUnit(ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "centralSpawn", new Unit(
    [
        [Unit.prototype.PLACE_ANY, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, Unit.prototype.PLACE_ANY],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION,   STRUCTURE_EXTENSION,        STRUCTURE_SPAWN,        STRUCTURE_EXTENSION,        STRUCTURE_EXTENSION,    STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION,   Unit.prototype.PLACE_VACANT,STRUCTURE_EXTENSION,    Unit.prototype.PLACE_VACANT,STRUCTURE_EXTENSION,    STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_CONTAINER,   STRUCTURE_EXTENSION,        STRUCTURE_LINK,         STRUCTURE_EXTENSION,        STRUCTURE_CONTAINER,    STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_SPAWN,       Unit.prototype.PLACE_VACANT,STRUCTURE_EXTENSION,    Unit.prototype.PLACE_VACANT,STRUCTURE_SPAWN,        STRUCTURE_ROAD],
        [STRUCTURE_ROAD, STRUCTURE_EXTENSION,   STRUCTURE_EXTENSION,        STRUCTURE_EXTENSION,    STRUCTURE_EXTENSION,        STRUCTURE_EXTENSION,    STRUCTURE_ROAD],
        [Unit.prototype.PLACE_ANY, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, STRUCTURE_ROAD, Unit.prototype.PLACE_ANY]
    ]
    , global.Lucy.Rules.arrangements.SPAWN_ONLY, "🔴", "red", {type:"distanceSum", objects : [STRUCTURE_CONTROLLER, "mineral", "energies"], subjects : [STRUCTURE_SPAWN]}));

planer.RegisterUnit(ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "centralTransfer", new Unit(
    [
        [STRUCTURE_STORAGE, STRUCTURE_NUKER, STRUCTURE_POWER_SPAWN],
        [STRUCTURE_TERMINAL, STRUCTURE_ROAD, STRUCTURE_EXTENSION],
        [STRUCTURE_LINK, STRUCTURE_FACTORY, STRUCTURE_ROAD]
    ]
    , global.Lucy.Rules.arrangements.TRANSFER_ONLY, "🟠", "orange", {type:"distanceSum", objects : [STRUCTURE_CONTROLLER, STRUCTURE_SPAWN], subjects : [STRUCTURE_STORAGE, STRUCTURE_TERMINAL, STRUCTURE_FACTORY]}));

planer.RegisterUnit(ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "towers", new Unit(
    [
        [STRUCTURE_TOWER]
    ]
    , "defense", "⛫", "yellow", {type : "distanceSum", objects : [STRUCTURE_STORAGE, STRUCTURE_CONTAINER, STRUCTURE_TERMINAL], subjects : [STRUCTURE_TOWER]}, {alongRoad : true}));
const ROOM_DISTANCE_CACHE_TIMEOUT       = 50;
const ROOM_DISTANCE_CACHE_OFFSET        = 5;


/**
 * Class Representation for Map.
 * Single.
 */
class Map {
    /**
     * @private
     * @param {string} roomName
     */
    updateDistanceCache(roomName) {
        if (!this.sortedDistancesExpiration[roomName] || this.sortedDistancesExpiration[roomName] <= Game.time) {
            this.sortedDistancesExpiration[roomName] = Game.time + getCacheExpiration(ROOM_DISTANCE_CACHE_TIMEOUT, ROOM_DISTANCE_CACHE_OFFSET);
            let roomNames = Object.keys(Game.rooms);
            this.sortedDistances[roomName] = roomNames.sort((u, v) => calcDistance(roomName,u) - calcDistance(roomName, v));
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
     * @param {roomName} roomName
     * @returns {Array<Array<number>>}
     */
    FetchTerrain(roomName) {
        const terrain = new Room.Terrain(roomName);
        const ret = constructArray([50, 50], 0);
        for (let x = 0; x < 50; ++x) {
            for (let y = 0; y < 50; ++y) {
                ret[x][y] = terrain.get(x, y);
            }
        }
        return ret;
    }
    /**
     * @param {string} roomName
     */
    AutoPlan(roomName) {
        /**
         * 0. Decision Options & Constants
         */
        let options = {
            controllerUpgrade : false,
            objectDestroy : false,
            structureConstruct : false
        };
        const TIMEOUT = 250;
        const OFFSET = 50;
        /**
         * 1. Prepare Configuration for Room : roomName
         */
        if (!this.planCache[roomName]) {
            this.planCache[roomName] = {
                roomType : ROOM_TYPE_NORMAL_CONTROLLED_ROOM,
                controllerLevel : Game.rooms[roomName].controller.level,
                feedbacks : {}
            };
            options.controllerUpgrade = true;
        }
        /**
         * 2. Update Decision Options
         */
        if (this.planCache[roomName].roomType === ROOM_TYPE_NORMAL_CONTROLLED_ROOM && Game.rooms[roomName].controller.level !== this.planCache[roomName].controllerLevel) {
            options.controllerUpgrade = true;
            this.planCache[roomName].controllerLevel = Game.rooms[roomName].controller.level;
        }
        // NOTICE: remove Of ConstructionSite is not counted by EVENT_OBJECT_DESTROYED.
        if (Game.rooms[roomName].getEventLog().filter(e => e.event === EVENT_OBJECT_DESTROYED && e.data.type !== "creep").length > 0 || global.signals.IsConstructionSiteCancel[roomName]) options.objectDestroy = true;
        if (global.signals.IsNewStructure[roomName]) options.structureConstruct = true;
        /**
         * 3. Calling Planner
         */
        if (this.planCache[roomName].roomType === ROOM_TYPE_NORMAL_CONTROLLED_ROOM) {
            /**
             * @param {ComponentRet} componentRet
             */
            const parseRet = (componentRet) => {
                if (!componentRet) return true;
                if (componentRet.ret === undefined) return true;
                if (componentRet.ret === false) return false;
                if (componentRet.ret === true && options.controllerUpgrade) return true;
                if (componentRet.ret === true && !options.controllerUpgrade) return false;
                if (componentRet.ret === "need_to_call_again" && Game.time >= componentRet.recallTick) return true;
                return false;
            };
            /**
             * @param {ComponentRet} componentRet
             */
            const doneRet = (componentRet) => {
                for (const key in componentRet) {
                    if (componentRet[key]["ret"] === "need_to_call_again") componentRet[key]["recallTick"] = Game.time + getCacheExpiration(TIMEOUT, OFFSET);
                }
            };
            /**
             * @param { {pos : RoomPosition} } object
             * @param {string} tag
             */
            const planForAroundOverlapContainer = (object, tag) => {
                /** @type {RoomPosition} */
                const pos = object.pos;
                const road = mapMonitor.FetchAroundStructure(roomName, pos.y, pos.x).filter(s => s.structureType === STRUCTURE_ROAD)[0];
                if (!road) return {ret : "need_to_call_again"};
                const container = mapMonitor.FetchStructure(roomName, road.pos.y, road.pos.x).concat(mapMonitor.FetchConstructionSites(roomName, road.pos.y, road.pos.x)).filter(s => s.structureType === STRUCTURE_CONTAINER)[0];
                if (!container) {
                    Game.rooms[roomName].createConstructionSite(road.pos.x, road.pos.y, STRUCTURE_CONTAINER);
                    return {ret : "need_to_call_again"};
                } else if (!isConstructionSite(container)) {
                    container.memory.tag = tag;
                    return {ret : false};
                } else return {ret : "need_to_call_again"};
            };
            const level = this.planCache[roomName].controllerLevel;
            if (level >= 1) {
                /* Plan For CentralSpawn Unit */
                if (!this.planCache[roomName].feedbacks["centralSpawn"]) this.planCache[roomName].feedbacks["centralSpawn"] = {};
                this.planCache[roomName].feedbacks["centralSpawn"] = planer.Plan(roomName, ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "centralSpawn", {
                    display : true,
                    tag : options.structureConstruct,
                    build : parseRet(this.planCache[roomName].feedbacks["centralSpawn"]["build"]) || (options.objectDestroy),
                    road : parseRet(this.planCache[roomName].feedbacks["centralSpawn"]["road"]) || (options.objectDestroy),
                    num : 1,
                    rejectCache : false,
                    linkedRoomPosition : [].concat(
                        Game.rooms[roomName]["energies"].map(s => s.pos),
                        (Game.rooms[roomName].controller.level >= 5 ? Game.rooms[roomName]["mineral"].pos : []),
                        Game.rooms[roomName].controller.pos
                    )
                });
                doneRet(this.planCache[roomName].feedbacks["centralSpawn"]);
            }
            if (level >= 2) {
                /* Plan For Harvest Unit */
                if (!this.planCache[roomName].feedbacks["harvestEnergy"]) this.planCache[roomName].feedbacks["harvestEnergy"] = {};
                if (!this.planCache[roomName].feedbacks["harvestMineral"]) this.planCache[roomName].feedbacks["harvestMineral"] = {};
                /* Plan For Container of Source and Mineral */
                for (const source of Game.rooms[roomName].energies) {
                    if (parseRet(this.planCache[roomName].feedbacks["harvestEnergy"][source.id]) || options.objectDestroy || options.structureConstruct) this.planCache[roomName].feedbacks["harvestEnergy"][source.id] = planForAroundOverlapContainer(source, "forSource");
                }
                doneRet(this.planCache[roomName].feedbacks["harvestEnergy"]);
                if (Game.rooms[roomName].controller.level >= 5 && (parseRet(this.planCache[roomName].feedbacks["harvestMineral"][Game.rooms[roomName].mineral.id]) || options.objectDestroy || options.structureConstruct)) this.planCache[roomName].feedbacks["harvestMineral"][Game.rooms[roomName].mineral.id] = planForAroundOverlapContainer(Game.rooms[roomName].mineral, "forMineral");
                doneRet(this.planCache[roomName].feedbacks["harvestMineral"]);
            }
            if (level >= 3) {
                /* Plan For CentralTransfer Unit */
                if (!this.planCache[roomName].feedbacks["centralTransfer"]) this.planCache[roomName].feedbacks["centralTransfer"] = {};
                this.planCache[roomName].feedbacks["centralTransfer"] = planer.Plan(roomName, ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "centralTransfer", {
                    display : true,
                    tag : options.structureConstruct,
                    build : parseRet(this.planCache[roomName].feedbacks["centralTransfer"]["build"]) || (options.objectDestroy),
                    road : parseRet(this.planCache[roomName].feedbacks["centralTransfer"]["road"]) || (options.objectDestroy),
                    num : 1,
                    rejectCache : false,
                    linkedUnits : ["centralSpawn"]
                });
                doneRet(this.planCache[roomName].feedbacks["centralTransfer"]);
                /* Plan For Tower Unit */
                if (!this.planCache[roomName].feedbacks["towers"]) this.planCache[roomName].feedbacks["towers"] = {};
                this.planCache[roomName].feedbacks["towers"] = planer.Plan(roomName, ROOM_TYPE_NORMAL_CONTROLLED_ROOM, "towers", {
                    display : true,
                    tag : options.structureConstruct,
                    build : parseRet(this.planCache[roomName].feedbacks["towers"]["build"]) || (options.objectDestroy),
                    road : parseRet(this.planCache[roomName].feedbacks["towers"]["road"]) || (options.objectDestroy),
                    num : 6,
                    rejectCache : false
                });
                doneRet(this.planCache[roomName].feedbacks["towers"]);
            }
            if (level >= 4) {
                
            }
            if (level >= 5) {

            }
            if (level >= 6) {

            }
            if (level >= 7) {

            }
            if (level >= 8) {

            }
            // DEBUG
            // console.log(JSON.stringify(planer.FetchRoomPlannedStructures(roomName, STRUCTURE_SPAWN)))
        }
    }
    constructor() {
        /**
         * @type { {[roomName : string] : Array<string>} }
         * @private
         */
        this.sortedDistances            = {};
        /**
         * @type { {[roomName : string] : number} }
         * @private
         */
        this.sortedDistancesExpiration  = {};
        /**
         * @typedef { {ret : boolean | "need_to_call_again", recallTick : number, null} } ComponentRet
         * @type { {[roomName : string] : { roomType : string, controllerLevel : number, feedbacks : { [unitName : string] : {tag : ComponentRet, build : ComponentRet, road : ComponentRet}} }} }
         * @private
         */
        this.planCache                  = {};
    }
};

global.Map = new Map();
global.MapMonitorManager = mapMonitor;

profiler.registerClass(Unit, "Unit");
profiler.registerClass(MapMonitor, "MapMonitor");
profiler.registerClass(Planer, "Planer");
profiler.registerClass(Map, "Map");

module.exports = {
    mount : mount
};