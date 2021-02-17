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
const getPrice              =   require('./util').getPrice;
const isHarvestable         =   require('./util').isHarvestable;
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
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @param {RESOURCE_POSSESSING_TYPES} type
     * @param {ResourceConstant} resourceType
     * @param { string } [key = "default"] used to identify a specific group
     * @param { (resource : import("./task.prototype").GameObject) => number } checkForAmountFunc this is not required to implement the exclusion of dealt, but still possessing resources
     */
    constructor(obj, type, resourceType, key = "default", checkForAmountFunc) {
        /**
         * @private
         */
        this.objId = obj.id;
        /**
         * @private
         */
        this.type = type;
        /**
         * @private
         */
        this.resourceType = resourceType;
        /**
         * @private
         */
        this.key = key;
        this._checkForAmountFunc = checkForAmountFunc.bind(this);
        /**
         * @type { () => number }
         * @private
         */
        this.checkForAmountFunc = function() {
            /* Edge Case : Expiration of Object */
            if (!this.Obj) return 0;
            const possessingNumber = this._checkForAmountFunc(this.Obj);
            /* Special Case : Producer (Source, Mineral) ; Otherwise, one unit will be subtracted twice. */
            if (this.type === RESOURCE_POSSESSING_TYPES.PRODUCING) return possessingNumber;
            /**
             * @type {Array<import('./money.prototype').Transaction>}
             */
            const dealingResourcesTransaction = this.Obj.account.Query("asSeller", {transactionType : "resource"}, t => t.State === TRANSACTION_STATE.WORKING && t.Description.info.resourceType === this.ResourceType);
            let sumOfDealtAmount = 0;
            for (const t of dealingResourcesTransaction) sumOfDealtAmount += t.Description.info.amount;
            return possessingNumber - sumOfDealtAmount;
        }.bind(this);
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
    /**
     * @param {import("./task.prototype").GameObject} obj
     * @param {ResourceConstant} resourceType 
     * @param {string} [key = "default"] used to identify a specific group
     * @param {(resource : import("./task.prototype").GameObject) => number} checkForFreeAmountFunc this is not required to implement the exclusion of preoccupasion by dealt resources, which is still under transportation.
     */
    constructor(obj, resourceType, key = "default", checkForFreeAmountFunc) {
        /**
         * @private
         */
        this.objId = obj.id;
        /**
         * @private
         */
        this.resourceType = resourceType;
        /**
         * @private
         */
        this.key = key;
        this._checkForFreeAmountFunc = checkForFreeAmountFunc;
        /**
         * @type { () => number }
         * @private
         */
        this.checkForFreeAmountFunc = function() {
            /* Edge Case : Expiration of Object */
            if (!this.Obj) return 0;
            const possessingNumber = this._checkForFreeAmountFunc(this.Obj);
            /**
             * @type { Array<import("./money.prototype").Transaction> }
             */
            const dealingResourcesTransaction = this.Obj.account.Query("asBuyer", {transactionType : "resource"}, t => t.State === TRANSACTION_STATE.WORKING && t.Description.info.resourceType === this.ResourceType);
            let sumOfDealtAmount = 0;
            for (const t of dealingResourcesTransaction) sumOfDealtAmount += t.Description.info.amount;
            return possessingNumber - sumOfDealtAmount;
        }.bind(this);
    }
};

const RESOURCE_ROOM_CACHE_TIMEOUT   =   50;
const RESOURCE_ROOM_CACHE_OFFSET    =   5;

/**
 * Class representation for ResourceManager
 * Single Class.
 */
class ResourceManager {
    /**
     * @private
     * @param {string} roomName
     * @param {ResourceConstant} resourceType
     * updateRoomCache updates caching for Retrieving and Storing.
     */
    updateRoomCache(roomName, resourceType) {
        /* Init Expiration */
        if (!this.room2resourceTypesExpiration[roomName]) this.room2resourceTypesExpiration[roomName] = {};
        if (!this.room2StoringResourceTypesExpiration[roomName]) this.room2StoringResourceTypesExpiration[roomName] = {};
        if (!this.room2resourceTypes[roomName]) this.room2resourceTypes[roomName] = {};
        if (!this.room2StoringResourceTypes[roomName]) this.room2StoringResourceTypes[roomName] = {};
        const checkExpiration = (expirationMap, roomMap, resourceTypeMap) => {
            /* Instant Update is forced, if there isn't any registered entries in the array. */
            if (!expirationMap[roomName][resourceType] || expirationMap[roomName][resourceType] <= Game.time || !roomMap[roomName][resourceType] || roomMap[roomName][resourceType].length === 0) {
                expirationMap[roomName][resourceType] = Game.time + getCacheExpiration(RESOURCE_ROOM_CACHE_TIMEOUT, RESOURCE_ROOM_CACHE_OFFSET);
                roomMap[roomName][resourceType] = [];
                for (const id in resourceTypeMap[resourceType]) {
                    const descriptor = resourceTypeMap[resourceType][id];
                    if (!descriptor.Obj) { // Clean Up
                        delete resourceTypeMap[resourceType][id];
                        continue;
                    }
                    if (descriptor.Obj.pos && descriptor.Obj.pos.roomName === roomName) {
                        roomMap[roomName][resourceType].push(descriptor);
                    }
                }
            }
        };
        checkExpiration(this.room2resourceTypesExpiration, this.room2resourceTypes, this.resourceType2Resources);
        checkExpiration(this.room2StoringResourceTypesExpiration, this.room2StoringResourceTypes, this.resourceType2StoringResources);
    }
    /**
     * Register self into ResourceManager
     * @param {ResourceDescriptor | StoringDescriptor} descriptor
     */
    Register(descriptor) {
        // const descriptorType = descriptor instanceof ResourceDescriptor ? "Provider" : "Receiver";
        // console.log(`<p style="color:lightblue;display:inline;">[Register]</p> Registering ${descriptor.Obj}'s ${descriptor.ResourceType} into ResourceManager...`);
        if (descriptor instanceof ResourceDescriptor) {
            this.resourceType2Resources[descriptor.ResourceType] = this.resourceType2Resources[descriptor.ResourceType] || {};
            this.resourceType2Resources[descriptor.ResourceType][descriptor.Obj.id] = descriptor;
        } else if (descriptor instanceof StoringDescriptor) {
            this.resourceType2StoringResources[descriptor.ResourceType] = this.resourceType2StoringResources[descriptor.ResourceType] || {};
            this.resourceType2StoringResources[descriptor.ResourceType][descriptor.Obj.id] = descriptor;
        }
    }
    /**
     * Sum returns the accumulation of available amount of resources for `retrieving` or `storing`.
     * @TODO
     * Currently, only those resources within the `roomName` are calculated. It should be extended into the calculation of
     * all truly available resources in the future.
     * @param {string} roomName
     * @param {ResourceConstant} resourceType
     * @param { {key ? : string, type : "retrieve" | "store", allowStore? : boolean, allowToHarvest? : boolean, confinedInRoom : boolean, excludeDefault? : boolean} } [options = {key : "default", allowStore : true, allowToHarvest : true, confinedInRoom : true, excludeDefault : false}] "default" has access to all registered resources. `allowStore` and `allowToHarvest` are useful while `type` === "retrieve".
     * @returns {Number}
     */
    Sum(roomName, resourceType, options) {
        _.defaults(options, {key : "default", allowStore : true, allowToHarvest : true, confinedInRoom : true, excludeDefault : false});
        this.updateRoomCache(roomName, resourceType);
        if (options.type === "retrieve")
            return _.sum(
                this.room2resourceTypes[roomName][resourceType]
                    .filter(a => (a.Key === "default" && !options.excludeDefault) || a.Key === options.key)
                    .filter(a => (options.allowStore && a.Obj.store !== undefined) || (options.allowToHarvest && isHarvestable(a.Obj)))
                    .map(a => a.Amount)
            );
        else if (options.type === "store")
            return _.sum(
                this.room2StoringResourceTypes[roomName][resourceType]
                    .filter(a => (a.Key === "default" && !options.excludeDefault) || a.Key === options.key)
                    .map(a => a.FreeAmount)
            );
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
        /** Subject with physical position */
        if (subject.pos || subject instanceof RoomPosition) {
            /** @type {RoomPosition} */
            const pos = subject instanceof RoomPosition ? subject : subject.pos;
            const id = subject instanceof RoomPosition ? null : subject.id;
            const roomName = pos.roomName;
            /**
             * Only if the distance between rooms satisfies a requirement, resources in another room is attainable from
             * base room, since long distance is not preferred.
             */
            const ALLOWED_DISTANCE = 1;
            this.updateRoomCache(roomName, resourceType);
            /**
             * @type {Array<string>}
             * NOTICE : Neutral or Hostile rooms are also included in `adjacentRooms`.
             * Thus, as long as the resources from those rooms are registered, they could be accessed, which allowing for
             * much more flexibility.
             */
            const adjacentRooms = global.Map.Query(roomName);
            /**
             * @type {import("./task.prototype").GameObject | null}
             */
            let chosen = null;
            /**
             * Used to identity the penalty designed for registered resources with distinctive tag while options.key === "default"
             * @param {ResourceDescriptor | StoringDescriptor} des
             * @returns {number} Positive Number
             */
            const calcKeyPenalty = function(des) {
                if (options.key !== des.Key) {
                    /* Calc the distance again */
                    return Infinity; // calcInRoomDistance(des.Obj.pos, pos) * 2 * getPrice("cpu") / 5;
                } else return 0;
            };
            for (const room of adjacentRooms) {
                if (options.type === "retrieve" && (!this.room2resourceTypes[room] || !this.room2resourceTypes[room][resourceType])) continue;
                if (options.type === 'store' && (!this.room2StoringResourceTypes[room] || !this.room2StoringResourceTypes[room][resourceType])) continue;
                if ((options.confinedInRoom && room !== roomName) || Game.map.getRoomLinearDistance(room, roomName) > ALLOWED_DISTANCE) continue;
                /**
                 * @type {Array<ResourceDescriptor> | Array<StoringDescriptor>}
                 */
                let totalAvailableResourceObjects = [];
                if (options.type === "retrieve") totalAvailableResourceObjects = (this.room2resourceTypes[room][resourceType] || [])
                    .filter(a => a.Obj.id !== id && a.Amount > 0)
                    .filter(a => !a.Obj.structureType || options.allowStructureTypes.length === 0 || options.allowStructureTypes.indexOf(a.Obj.structureType) !== -1)
                    .filter(a => (a.Key === "default" && !options.excludeDefault) || a.Key === options.key)
                    .filter(a => (options.allowStore && a.Obj.store !== undefined) || (options.allowToHarvest && isHarvestable(a.Obj))) // I suppose there is nothing which is harvestable and also has `store`
                    .sort((a,b) => a.Obj.pos.getRangeTo(pos) * 2 * getPrice("cpu") / 5 + (amount - a.Amount) * getPrice(resourceType) / 1000 + calcKeyPenalty(a) - b.Obj.pos.getRangeTo(pos) * 2 * getPrice("cpu") / 5 - (amount - b.Amount) * getPrice(resourceType) / 1000 - calcKeyPenalty(b));
                else if (options.type === 'store') totalAvailableResourceObjects = (this.room2StoringResourceTypes[room][resourceType] || [])
                    .filter(a => a.Obj.id !== id && a.FreeAmount > 0)
                    .filter(a => !a.Obj.structureType || options.allowStructureTypes.length === 0 || options.allowStructureTypes.indexOf(a.Obj.structureType) !== -1)
                    .filter(a => (a.Key === "default" && !options.excludeDefault) || a.Key === options.key)
                    .sort((a,b) => a.Obj.pos.getRangeTo(pos) * 2 * getPrice("cpu") / 5 + (amount - a.FreeAmount) * getPrice(resourceType) / 1000 + calcKeyPenalty(a) - b.Obj.pos.getRangeTo(pos) * 2 * getPrice("cpu") / 5 - (amount - b.FreeAmount) * getPrice(resourceType) / 1000 - calcKeyPenalty(b));
                if (totalAvailableResourceObjects.length === 0) continue;
                const adequateResourceObjects = options.ensureAmount? _.filter(totalAvailableResourceObjects, d => (options.type === "retrieve" ? d.Amount : d.FreeAmount) >= amount) : [];
                chosen = (adequateResourceObjects[0] && adequateResourceObjects[0].Obj) || (totalAvailableResourceObjects[0] && totalAvailableResourceObjects[0].Obj);
                break;
            }
            if (!chosen && options.type === "retrieve" && !options.avoidRequest && options.allowStore && !options.excludeDefault && (options.allowStructureTypes.length === 0 || options.allowStructureTypes.indexOf(STRUCTURE_TERMINAL) !== -1)) {
                /**
                 * In this case, some resources are wanted but in the state of shortage.
                 */
                global.TerminalManager.Request(roomName, resourceType, amount);
            }
            // console.log(`Query Resource ret ${chosen} with params ${subject} ${resourceType} ${amount} ${JSON.stringify(options)}`);
            return chosen;
        }
    }
    Display() {
        for (const roomName in this.room2resourceTypes) {
            const resourceType = RESOURCE_ENERGY;
            for (const descriptor of this.room2resourceTypes[roomName][resourceType]) {
                new RoomVisual(descriptor.Obj.pos.roomName).text(descriptor.Amount, descriptor.Obj.pos, {color : "yellow"});
            }
        }
    }
    constructor() {
        /* Retrieving Resources */
        /**
         * @type { {[resourceType : string] : {[id : string] : ResourceDescriptor}} }
         * @private
         */
        this.resourceType2Resources         = {};
        /**
         * @type { {[roomName : string] : {[resourceType : string] : Array<ResourceDescriptor>}} }
         * @private
         */
        this.room2resourceTypes             = {};
        /**
         * @type { {[roomName : string] : {[resourceType : string] : number}} }
         * @private
         */
        this.room2resourceTypesExpiration   = {};
        /* Storing Resources */
        /**
         * @type { {[resourceType : string] : {[id : string] : StoringDescriptor}} }
         * @private
         */
        this.resourceType2StoringResources          = {};
        /**
         * @type { {[roomName : string] : {[resourceType : string] : Array<StoringDescriptor>}} }
         * @private
         */
        this.room2StoringResourceTypes              = {};
        /**
         * @type { {[roomName : string] : {[resourceType : string] : number}} }
         * @private
         */
        this.room2StoringResourceTypesExpiration    = {};
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