/**
 * @module manager.resources
 * 
 * Manager for Resources, including Retrieving and Storing.
 * @typedef {ResourceManager} ResourceManager
 * @typedef {ResourceDescriptor} ResourceDescriptor
 * @typedef { {STORING : 0, PRODUCING : 1} } RESOURCE_POSSESSING_TYPES
 */
const getCacheExpiration    =   require('./util').getCacheExpiration;
const calcInRoomDistance    =   require('./util').calcInRoomDistance;
const icon                  =   require('./util').icon;
const getPrice              =   require('./util').getPrice;
const isHarvestable         =   require('./util').isHarvestable;
const calcRoomDistance      =   require('./util').calcRoomDistance;
const profiler = require("./screeps-profiler");
const TRANSACTION_STATE     =   require('money.prototype').TRANSACTION_STATE;
const RESOURCE_POSSESSING_TYPES = Object.freeze({
    STORING     : 0,
    PRODUCING   : 1
});
/**
 * Class representation for ResourceDescriptor
 */
class ResourceDescriptor {
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Obj() {
        if (!this._obj_s || this._obj_s < Game.time) {
            this._obj_s = Game.time;
            return this._obj = Game.getObjectById(this.objId);
        } else return this._obj;
    }
    get Type() {
        return this.type;
    }
    get ResourceType() {
        return this.resourceType;
    }
    get Amount() {
        return this.checkForAmountFunc();
    }
    get Key() {
        return this.key;
    }
    get StructureType() {
        return this.structureType;
    }
    get HasStore() {
        return this.hasStore;
    }
    get Harvestable() {
        return this.harvestable;
    }
    get Id() {
        return this.objId;
    }
    /**
     * @param {string} roomName
     * @param {import("./task.prototype").GameObject} obj
     * @param {RESOURCE_POSSESSING_TYPES} type
     * @param {ResourceConstant} resourceType
     * @param { string } [key = "default"] used to identify a specific group
     * @param { (resource : import("./task.prototype").GameObject) => number } checkForAmountFunc this is not required to implement the exclusion of dealt, but still possessing resources
     */
    constructor(roomName, obj, type, resourceType, key = "default", checkForAmountFunc) {
        this.roomName = roomName;
        /** @type {StructureConstant | undefined} @private */
        this.structureType = obj.structureType;
        /** @private */
        this.hasStore = obj.store ? true : false;
        /** @private */
        this.harvestable = isHarvestable(obj);
        /** @private */
        this.objId = obj.id;
        /** @private */
        this.type = type;
        /** @private */
        this.resourceType = resourceType;
        /** @private */
        this.key = key;
        /** @private */
        this._checkForAmountFunc = checkForAmountFunc.bind(this);
        /**
         * @type { () => number }
         * @private
         */
        this.checkForAmountFunc = () => {
            return this._checkForAmountFunc(this.Obj) - (this.Obj.account.resourceTransactions["asSeller"][this.resourceType] || 0);
        };
    }
};
/**
 * Class representation for StoringDescriptor
 */
class StoringDescriptor {
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Obj() {
        if (!this._obj_s || this._obj_s < Game.time) {
            this._obj_s = Game.time;
            return this._obj = Game.getObjectById(this.objId);
        } else return this._obj;
    }
    get Type() {
        return this.type;
    }
    get ResourceType() {
        return this.resourceType;
    }
    get FreeAmount() {
        return this.checkForFreeAmountFunc();
    }
    get Key() {
        return this.key;
    }
    get StructureType() {
        return this.structureType;
    }
    get Id() {
        return this.objId;
    }
    /**
     * @param {string} roomName
     * @param {import("./task.prototype").GameObject} obj
     * @param {ResourceConstant} resourceType 
     * @param {string} [key = "default"] used to identify a specific group
     * @param {(resource : import("./task.prototype").GameObject) => number} checkForFreeAmountFunc this is not required to implement the exclusion of preoccupasion by dealt resources, which is still under transportation.
     */
    constructor(roomName, obj, resourceType, key = "default", checkForFreeAmountFunc) {
        this.roomName = roomName;
        /** @type {StructureConstant | undefined} */
        this.structureType = obj.structureType;
        /** @private */
        this.objId = obj.id;
        /** @private */
        this.resourceType = resourceType;
        /** @private */
        this.key = key;
        /** @private */
        this._checkForFreeAmountFunc = checkForFreeAmountFunc;
        /**
         * @type { () => number }
         * @private
         */
        this.checkForFreeAmountFunc = () => {
            return this._checkForFreeAmountFunc(this.Obj) - this.Obj.account.resourceTransactions["asBuyer"]["total"];
        };
    }
};

/**
 * Class representation for ResourceManager
 * Single Class.
 */
class ResourceManager {
    /**
     * @private
     * @param {string} roomName
     */
    needUpdate(roomName) {
        return global.signals.IsStructureDestroy[roomName] || false;
    }
    /**
     * @private
     * @param {string} roomName
     * @param {ResourceConstant} resourceType
     * @param {"retrieve" | "store"} type
     */
    updateRoomCache(roomName, resourceType, type) {
        const key = `_${roomName}_${resourceType}_${type}_tick`;
        if (this.needUpdate() && (!this[key] || this[key] < Game.time)) {
            const _cpuUsed = Game.cpu.getUsed();
            this[key] = Game.time;
            console.log(String.fromCodePoint(0x231b), `${roomName}'s ${icon(resourceType)} Cache Updating ...`);
            if (type === "retrieve") {
                if (Game.rooms[roomName] && this.room2key2resourceTypes[roomName] && this.room2key2resourceTypes[roomName][resourceType]) {
                    for (const key in this.room2key2resourceTypes[roomName][resourceType]) _.remove(this.room2key2resourceTypes[roomName][resourceType][key], d => d.Obj);
                }
            } else if (type === "store") {
                if (Game.rooms[roomName] && this.room2key2StoringResourceTypes[roomName] && this.room2key2StoringResourceTypes[roomName][resourceType]) {
                    for (const key in this.room2key2StoringResourceTypes[roomName][resourceType]) _.remove(this.room2key2StoringResourceTypes[roomName][resourceType][key], d => d.Obj);
                }
            }
            global.Log.success('Cache Update Done', global.Dye.grey(`cpu-cost:${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`));
        }
    }
    /**
     * Register self into ResourceManager
     * Allow for Duplication
     * @param {ResourceDescriptor | StoringDescriptor} descriptor
     */
    Register(descriptor) {
        if (descriptor instanceof ResourceDescriptor) {
            if (!this.room2key2resourceTypes[descriptor.roomName]) this.room2key2resourceTypes[descriptor.roomName] = {};
            if (!this.room2key2resourceTypes[descriptor.roomName][descriptor.ResourceType]) this.room2key2resourceTypes[descriptor.roomName][descriptor.ResourceType] = {};
            if (!this.room2key2resourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key]) this.room2key2resourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key] = [];
            this.room2key2resourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key].push(descriptor);
        } else if (descriptor instanceof StoringDescriptor) {
            if (!this.room2key2StoringResourceTypes[descriptor.roomName]) this.room2key2StoringResourceTypes[descriptor.roomName] = {};
            if (!this.room2key2StoringResourceTypes[descriptor.roomName][descriptor.ResourceType]) this.room2key2StoringResourceTypes[descriptor.roomName][descriptor.ResourceType] = {};
            if (!this.room2key2StoringResourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key]) this.room2key2StoringResourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key] = [];
            this.room2key2StoringResourceTypes[descriptor.roomName][descriptor.ResourceType][descriptor.Key].push(descriptor);
        }
    }
    /**
     * Currently, only those resources within the `roomName` are calculated. It should be extended into the calculation of
     * all truly available resources in the future.
     * @param {string} roomName
     * @param {ResourceConstant} resourceType
     * @param { {key ? : string, type : "retrieve" | "store", allowStore? : boolean, allowToHarvest? : boolean, confinedInRoom : boolean, excludeDefault? : boolean, allowStructureTypes? : Array<StructureConstant>} } [options = {key : "default", allowStore : true, allowToHarvest : true, confinedInRoom : true, excludeDefault : false}] "default" has access to all registered resources. `allowStore` and `allowToHarvest` are useful while `type` === "retrieve".
     * @returns {Number}
     */
    Sum(roomName, resourceType, options) {
        if (!Game.rooms[roomName]) return 0;
        _.defaults(options, {key : "default", allowStore : true, allowToHarvest : true, confinedInRoom : true, excludeDefault : false, allowStructureTypes : []});
        this.updateRoomCache(roomName, resourceType, options.type);
        if (options.type === "retrieve") {
            if (!this.room2key2resourceTypes[roomName] || !this.room2key2resourceTypes[roomName][resourceType]) return 0;
            const sum = (key) => 
                this.room2key2resourceTypes[roomName][resourceType][key] ? 
                    _.sum(
                        this.room2key2resourceTypes[roomName][resourceType][key]
                            .filter(a => 
                                (options.allowStructureTypes.length === 0 || options.allowStructureTypes.includes(a.StructureType)) && 
                                ((options.allowStore && a.HasStore) || (options.allowToHarvest && a.Harvestable))
                            )
                            .map(a => a.Amount)
                    )
                    : 0;
            return sum(options.key) + (options.key !== "default" && !options.excludeDefault)? sum("default") : 0;
        }
        else if (options.type === "store")
            if (!this.room2key2StoringResourceTypes[roomName] || !this.room2key2StoringResourceTypes[roomName][resourceType]) return 0;
            const sum = (key) =>
                this.room2key2StoringResourceTypes[roomName][resourceType][key] ?
                    _.sum(
                        this.room2key2StoringResourceTypes[roomName][resourceType][key]
                            .filter(a =>
                                options.allowStructureTypes.length === 0 || options.allowStructureTypes.includes(a.StructureType)    
                            )
                            .map(a => a.FreeAmount)
                    )
                    : 0;
            return sum(options.key) + (options.key !== "default" && !options.excludeDefault)? sum("default") : 0;
    }
    /**
     * Query returns the best suitable object to be extracted or to store.
     * After querying, `amount` of that object will be locked, if transaction is dealt.
     * @param {import("./task.prototype").GameObject | RoomPosition} subject
     * @param {ResourceConstant} resourceType
     * @param {number} amount Retrieving Amount | Storing Amount
     * @param { { key? : string, confinedInRoom? : boolean, allowStore? : boolean, allowToHarvest? : boolean, type : "retrieve" | "store", excludeDefault? : boolean, allowStructureTypes? : Array<StructureConstant>, ensureAmount? : boolean, avoidRequest? : boolean } } [options = { key : "default", confinedInRoom : false, allowStore : true, allowToHarvest : true, ensureAmount : true }] "default" has access to all registered resources, but those with specific tag will be penaltized. `allowStore` and `allowToHarvest` are useful while `type` === "retrieve". 0 length of allowStructureTypes indicate that all are allowed.
     * @returns {import("./task.prototype").GameObject | null}
     */
    Query(subject, resourceType, amount, options) {
        _.defaults(options, {key : "default", confinedInRoom : false, allowStore : true, allowToHarvest : true, excludeDefault : false, allowStructureTypes : [], ensureAmount : true, avoidRequest : false});
        /**
         * Query will first check out whether `subject` has physical location.
         * If so, it will go through several standards orderly to return the first matched:
         *      - Location.
         *      - Amount.
         * Query implements caching to speed up process of finding available resources / storing objects within a give room.
         * Query takes care about the target to choose, so that `subject` will not get `subject` itself.
         */
        /** @type {RoomPosition} */
        const pos = subject instanceof RoomPosition ? subject : subject.pos;
        const id = subject instanceof RoomPosition ? null : subject.id;
        const roomName = pos.roomName;
        /**
         * Only if the distance between rooms satisfies a requirement, resources in another room is attainable from
         * base room, since long distance is not preferred.
         */
        const ALLOWED_DISTANCE = 1;
        this.updateRoomCache(roomName, resourceType, options.type);
        /**
         * @type {Array<string>}
         * NOTICE : Neutral or Hostile rooms are also included in `adjacentRooms`.
         * Thus, as long as the resources from those rooms are registered, they could be accessed, which allowing for
         * much more flexibility.
         */
        const adjacentRooms = (options.type === "retrieve"? Object.keys(this.room2key2resourceTypes) : Object.keys(this.room2key2StoringResourceTypes)).sort((u, v) => calcRoomDistance(roomName, u) - calcRoomDistance(roomName, v));
        /** @type {import('./task.prototype').GameObject | null} */
        let chosen = null;
        for (const room of adjacentRooms) {
            /** Invisible */
            if (!Game.rooms[room]) continue;
            /** Not Have Any Information */
            if ((options.type === "retrieve" && !this.room2key2resourceTypes[room][resourceType]) || (options.type === 'store' && !this.room2key2StoringResourceTypes[room][resourceType])) continue;
            /** Map Constraints */
            if ((options.confinedInRoom && room !== roomName) || Game.map.getRoomLinearDistance(room, roomName) > ALLOWED_DISTANCE) continue;
            /**
             * @type {Array<ResourceDescriptor> | Array<StoringDescriptor>}
             */
            let totalAvailableResourceObjects = [];
            if (options.type === "retrieve") {
                const harvestablePenalty = 100000;
                const query = (key) =>
                    this.room2key2resourceTypes[room][resourceType][key] ?
                        this.room2key2resourceTypes[room][resourceType][key]
                            .filter(a =>
                                (a.Id !== id) &&
                                (a.Amount > 0) &&
                                (options.allowStructureTypes.length === 0 || options.allowStructureTypes.includes(a.StructureType)) &&
                                ((options.allowStore && a.HasStore) || (options.allowToHarvest && global.MapMonitorManager.FetchStructureWithTag(room, "forSource", STRUCTURE_CONTAINER).length === 0 && a.Harvestable))
                            )
                            // Generally `Store` is preferred to `Harvestable`
                            .select(v => v, a => (a.Amount - amount) - (a.Harvestable? harvestablePenalty : 0)) || []
                        : [];
                totalAvailableResourceObjects = [].concat(query(options.key), (options.key !== "default" && !options.excludeDefault) ? query("default") : []);
            } else if (options.type === 'store') {
                const query = (key) =>
                    this.room2key2StoringResourceTypes[room][resourceType][key] ?
                        this.room2key2StoringResourceTypes[room][resourceType][key]
                            .filter(a =>
                                (a.Id !== id) &&
                                (a.FreeAmount > 0) &&
                                (options.allowStructureTypes.length === 0 || options.allowStructureTypes.includes(a.StructureType))
                            )
                            .select(v => v, a => a.FreeAmount - amount) || []
                        : [];
                totalAvailableResourceObjects = [].concat(query(options.key), (options.key !== "default" && !options.excludeDefault) ? query("default") : []);
            }
            if (totalAvailableResourceObjects.length === 0) continue;
            const adequateResourceObjects = options.ensureAmount? _.filter(totalAvailableResourceObjects, a => (options.type === "retrieve" ? a.Amount : a.FreeAmount) >= amount) : [];
            chosen = (adequateResourceObjects[0] && adequateResourceObjects[0].Obj) || (totalAvailableResourceObjects[0] && totalAvailableResourceObjects[0].Obj);
            break;
        }
        if (!chosen && options.type === "retrieve" && !options.avoidRequest && options.allowStore && !options.excludeDefault && (options.allowStructureTypes.length === 0 || options.allowStructureTypes.indexOf(STRUCTURE_TERMINAL) !== -1)) {
            /**
             * @TODO
             * For some resourceTypes, including `energy` and minerals, `decompression` could be triggered.
             */
            //
            /**
             * In this case, some resources are wanted but in the state of shortage.
             */
            global.TerminalManager.Request(roomName, resourceType, amount);
        }
        return chosen;
    }
    /**
     * @param {string} roomName
     */
    Test(roomName) {
        console.log(`Testing Performance of ResourceManager's Query ...`);
        let _cpuUsed = Game.cpu.getUsed();
        let cnt = 0;
        const pos = new RoomPosition(25, 25, roomName);
        for (const resourceType of RESOURCES_ALL) cnt += this.Query(pos, resourceType, Math.ceil(Math.random() * CONTAINER_CAPACITY), {type : "retrieve", avoidRequest : true})? 1 : 0;
        console.log(`\t"retrieve":\t${RESOURCES_ALL.length} entries with ${cnt} valid returns, consumes ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}.`);
        _cpuUsed = Game.cpu.getUsed();
        cnt = 0;
        for (const resourceType of RESOURCES_ALL) cnt += this.Query(pos, resourceType, Math.ceil(Math.random() * CONTAINER_CAPACITY), {type : "store", avoidRequest : true})? 1 : 0;
        console.log(`\t"store":\t${RESOURCES_ALL.length} entries with ${cnt} valid returns, consumes ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}.`);
    }
    Display() {
        for (const roomName in this.room2key2resourceTypes) {
            if (!Game.rooms[roomName] || !this.room2key2resourceTypes[roomName][RESOURCE_ENERGY]) continue;
            for (const key in this.room2key2resourceTypes[roomName][RESOURCE_ENERGY]) {
                for (const descriptor of this.room2key2resourceTypes[roomName][RESOURCE_ENERGY][key]) {
                    new RoomVisual(descriptor.Obj.pos.roomName).text(descriptor.Amount, descriptor.Obj.pos, {color : "yellow"});
                }
            }
        }
    }
    constructor() {
        /** @type { {[roomName : string] : {[resourceType : string] : {[key : string] : Array<ResourceDescriptor>}}} } @private */
        this.room2key2resourceTypes = {};
        /** @type { {[roomName : string] : {[resourceType : string] : {[key : string] : Array<StoringDescriptor>}}} } @private */
        this.room2key2StoringResourceTypes = {};
    }
};
const _resourceManager = new ResourceManager();
profiler.registerClass(ResourceManager, "ResourceManager");
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const ResourceManagerPlugin = {
    init : () => global.ResourceManager = _resourceManager,
    tickEnd : () => global.ResourceManager.Display()
};
global.Lucy.App.on(ResourceManagerPlugin);
module.exports = {
    ResourceDescriptor          : ResourceDescriptor,
    StoringDescriptor           : StoringDescriptor,
    RESOURCE_POSSESSING_TYPES   : RESOURCE_POSSESSING_TYPES
};