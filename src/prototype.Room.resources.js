/**
 * @author Raymond_Kevin
 * Imitated Version of prototype.Room.structures.js by @author SemperRabbit
 */
var roomResources           = {};
var roomResourcesExpiration = {};

const CACHE_TIMEOUT = 50;
const CACHE_OFFSET  = 4;

function getCacheExpiration(){
    return CACHE_TIMEOUT + Math.round((Math.random()*CACHE_OFFSET*2)-CACHE_OFFSET);
}

const resourceMultipleList = [
	RESOURCE_ENERGY,    RESOURCE_MIST,      RESOURCE_BIOMASS,   RESOURCE_METAL,
	RESOURCE_SILICON,
];
const resourceSingleList = [
	RESOURCE_HYDROGEN,  RESOURCE_OXYGEN,    RESOURCE_UTRIUM,    RESOURCE_LEMERGIUM,
	RESOURCE_KEANIUM,   RESOURCE_ZYNTHIUM,  RESOURCE_CATALYST,
];
Room.prototype._checkRoomResourceCache = function _checkRoomResourceCache() {
	if (!roomResourcesExpiration[this.name] || !roomResources[this.name] || roomResourcesExpiration[this.name] < Game.time) {
		roomResourcesExpiration[this.name] = Game.time + getCacheExpiration();
		const sources = this.find(FIND_SOURCES);
		const minerals = this.find(FIND_MINERALS);
		const deposits = this.find(FIND_DEPOSITS);
		var resources = ([]).concat(sources, minerals, deposits);
		roomResources[this.name] = _.groupBy(resources, s => s.mineralType || s.depositType || "energy");
		var i;
		for (i in roomResources[this.name]) {
			roomResources[this.name][i] = _.map(roomResources[this.name][i], r => r.id);
		}
	}
};
resourceMultipleList.forEach(function (type) {
    let pluralForm = type + "s";
    if (pluralForm === "energys") pluralForm = "sources";
    else if (pluralForm === "biomasss") pluralForm = "biomasses";
	Object.defineProperty(Room.prototype, pluralForm, {
		get: function () {
			if (this["_" + type + "s"] && this["_" + type + "s_ts"] === Game.time) {
				return this["_" + type + "s"];
			} else {
				this._checkRoomResourceCache();
				if (roomResources[this.name][type]) {
                    this["_" + type + "s_ts"] = Game.time;
                    /** Exclude outdated Objects */
					return this["_" + type + "s"] = _.filter(roomResources[this.name][type].map(Game.getObjectById), s => s);
                 } else {
					this["_" + type + "s_ts"] = Game.time;
					return this["_" + type + "s"] = [];
				}
			}
		},
		set: function () { },
		enumerable: false,
		configurable: true,
	});
});
resourceSingleList.forEach(function (type) {
	Object.defineProperty(Room.prototype, type, {
		get: function () {
			if (this["_" + type] && this["_" + type + "_ts"] === Game.time) {
				return this["_" + type];
             } else {
				this._checkRoomResourceCache();
				if (roomResources[this.name][type]) {
					this["_" + type + "_ts"] = Game.time;
					return this["_" + type] = Game.getObjectById(roomResources[this.name][type][0]) || null;
				} else {
					this["_" + type + "_ts"] = Game.time;
					return this["_" + type] = null;
				}
			}
		},
		set: function () { },
		enumerable: false,
		configurable: true,
	});
});
Object.defineProperty(Room.prototype, "mineral", {
	get: function () {
		if (this["_mineral"]) return this["_mineral"];
		else {
			for (var mineralType of resourceSingleList) {
				if (this[mineralType]) return this["_mineral"] = this[mineralType];
			}
			return this["_mineral"] = null;
		}
	},
	set: function () { },
	enumerable: false,
	configurable: true
});