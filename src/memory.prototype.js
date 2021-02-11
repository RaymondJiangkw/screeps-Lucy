/**
 * Extended Memory
 * Modified Version from @author warinternal
 * @source https://github.com/screepers/screeps-snippets/blob/master/src/misc/JavaScript/OwnedStructure%20Memory.js
 */
/** @type {Array<import("./lucy.app").AnyClass, import("./lucy.app").AnyClass>} */
const mountList = [];
const memObjKeyPair = [
    [OwnedStructure     , "structures"],
    [Source             , "sources"],
    [Mineral            , "minerals"],
    [Deposit            , "deposits"],
    [StructurePowerBank , "powerbanks"],
    [ConstructionSite   , "constructionSites"],
    [StructureRoad      , "roads"],
    [StructureContainer , "containers"],
    [StructureWall      , "walls"]
];
const CREATED_TICK = "createdTick";
for (const [memObj, memKey] of memObjKeyPair) {
    if (!Memory[memKey]) Memory[memKey] = {};
    Object.defineProperty(memObj.prototype, "memory", {
        get() {
            if (!Memory[memKey][this.id]) Memory[memKey][this.id] = { [CREATED_TICK] : Game.time };
            return Memory[memKey][this.id];
        },
        set(mem) {
            mem[CREATED_TICK] = Game.time;
            return _.set(Memory, `${memKey}.${this.id}`, mem);
        }
    });
}
/**
 * Plugin of Garbage Collector
 * @type {import("./lucy.app").AppLifecycleCallbacks}
 */
const GCPlugin = {
    tickStart : () => {
        const { random } = require("lodash");
        if ((Game.time + random(0, 10, false)) % Lucy.Rules.memoryRecycleInterval.structure === 0) {
            for (var id in Memory.structures) {
                if (!Game.structures[id]) {
                    /* Clean Remained Data in Task */
                    Game.cleanTaskById(id);
                    delete Memory.structures[id];
                }
            }
        }
        if ((Game.time + random(0, 10, false)) % Lucy.Rules.memoryRecycleInterval.commonStructures === 0) {
            for (var id in Memory.roads) if (!Game.getObjectById(id)) {
                /* Clean Remained Data in Task */
                Game.cleanTaskById(id);
                delete Memory.roads[id];
            }
            for (var id in Memory.containers) if (!Game.getObjectById(id)) {
                /* Clean Remained Data in Task */
                Game.cleanTaskById(id);
                delete Memory.containers[id];
            }
            for (var id in Memory.walls) if (!Game.getObjectById(id)) {
                /* Clean Remained Data in Task */
                Game.cleanTaskById(id);
                delete Memory.walls[id];
            }
        }
        if ((Game.time + random(0, 10, false)) % Lucy.Rules.memoryRecycleInterval.deposit === 0) {
            for (var id in Memory.deposits) {
                if (Game.time - Memory.deposits[id][createdTick] < Lucy.Rules.memoryRecycleInterval.deposit) continue;
                /** Compatible with the refreshness character of Deposit */
                if (Game.getObjectById(id)) Memory.deposits[id][createdTick] = Game.time;
                else {
                    /* Clean Remained Data in Task */
                    Game.cleanTaskById(id);
                    delete Memory.deposits[id];
                }
            }
        }
        if ((Game.time + random(0, 10, false)) % Lucy.Rules.memoryRecycleInterval.powerbank === 0) {
            for (var id in Memory.powerbanks) {
                if (Game.time - Memory.powerbanks[id][createdTick] < Lucy.Rules.memoryRecycleInterval.powerbank) continue;
                /** Compatible with the vanishing machanism of PowerBank */
                delete Memory.powerbanks[id];
                /* Clean Remained Data in Task */
                Game.cleanTaskById(id);
            }
        }
        if ((Game.time + random(0, 10, false)) % Lucy.Rules.memoryRecycleInterval.constructionSite === 0) {
            for (var id in Memory.constructionSites) {
                if (!Game.constructionSites[id]) {
                    /* Clean Remained Data in Task */
                    Game.cleanTaskById(id);
                    delete Memory.constructionSites[id];
                }
            }
        }
        /* Clean Creeps */
        for (const creepName in Memory.creeps) {
            if (!Game.creeps[creepName]) {
                /* Clean Remained Data in Task */
                if (Memory.creeps[creepName].id) Game.cleanTaskById(Memory.creeps[creepName].id);
                delete Memory.creeps[creepName];
            }
        }
    }
}
global.Lucy.App.on(GCPlugin);