const { random } = require("lodash");

function mount() {
    /**
     * Extended Memory
     * Modified Version from @author warinternal
     * @see {@link https://github.com/screepers/screeps-snippets/blob/master/src/misc/JavaScript/OwnedStructure%20Memory.js}
     * 
     * `createdTick` is used for recycling purpose.
     */
    const memObjs = ["OwnedStructure", "Source", "Mineral", "Deposit", "StructurePowerBank", "ConstructionSite", "StructureRoad", "StructureContainer", "StructureWall"];
    const memKeys = ["structures", "sources", "minerals", "deposits", "powerbanks", "constructionSites", "roads", "containers", "walls"];
    const createdTick = "createdTick";
    /* Hack to Optimize the time spent in finding reference */
    const memDefineCode = function (objStr, memStr) {
        return `Object.defineProperty(${objStr}.prototype, "memory", {
            get: function() {
                if (!Memory["${memStr}"][this.id]) Memory["${memStr}"][this.id] = { "${createdTick}": Game.time };
                return Memory["${memStr}"][this.id];
            },
            set: function(v) {
                v["${createdTick}"] = Game.time;
                return _.set(Memory, \`${memStr}.\${this.id}\`, v);
            },
            configurable: true,
            enumerable: false
        });`;
    };
    for (let i = 0; i < memObjs.length; i++) {
        if (!Memory[memKeys[i]]) Memory[memKeys[i]] = {};
        eval(memDefineCode(memObjs[i], memKeys[i]));
    }
    /**
     * Add slight variance to `Game.time` to avoid deleting operations being packed in a single tick.
     */
    global.GCMemory = function() {
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
    };
}

module.exports = {
    mount: mount
}