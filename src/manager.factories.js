/**
 * @module manager.factories
 */
const profiler = require("./screeps-profiler");
class FactoryManager {
    /**
     * `sumAll` sums all resources in the controlled rooms.
     * @param {ResourceConstant} resourceType
     * @returns {number}
     */
    sumAll(resourceType) {
        return _.sum(global.Lucy.Collector.colonies.map(r => global.ResourceManager.Sum(r.name, resourceType, {type : "retrieve", key : "default", allowStore : true, allowToHarvest : false, confinedInRoom : true, excludeDefault : false})));
    }
    /**
     * @param {StructureFactory} factory
     */
    Register(factory) {
        this.factoryIds.push(factory.id);
    }
    Run() {

    }
    /** @returns { {[level : number] : StructureFactory[]} } */
    get Factories() {
        const key = `_factories`;
        if (!this[key + "_tick"] || this[key + "_tick"] < Game.time) {
            this[key + "_tick"] = Game.time;
            /** @private */
            return this[key] = _.groupBy(this.factoryIds.map(Game.getObjectById), f => f.level);
        } else return this[key];
    }
    constructor() {
        /** @type {Id<StructureFactory>[]} */
        this.factoryIds = [];
    }
}
const factoryManager = new FactoryManager();
profiler.registerClass(FactoryManager, "FactoryManager");
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const FactoryPlugin = {
    init : () => global.FactoryManager = factoryManager
};

global.Lucy.App.on(FactoryPlugin);