/**
 * @type { (room : Room) => Boolean }
 */
const isMyRoom                      =   require('util').isMyRoom;
/**
 * @type { (bodyDescription : {[body in BodyPartConstant]? : number}) => Array<BodyPartConstant> }
 */
const parseBodyPartsConfiguration   = require('util').parseBodyPartsConfiguration;
/**
 * $ converts Object in Screeps into Object in Lucy.
 */
function $() {
    
};
(function() {
    global.Lucy = {};
    global.Lucy.Rules = require("lucy.rules");
    global.Lucy.Logs = new (require("lucy.log").LogPool)();
    global.Lucy.Spawn = function() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!isMyRoom(room)) continue;
            // NOTICE : Query Creep is time-consuming, and it is unnecessary when no spawn is available.
            if (room.spawns.filter(s => !s.spawning).length === 0) continue;
            // NOTICE : In order to avoid energy-consumption-overlapping, for each tick, only one Spawn will be allowed to spawn Creep.
            const spawnedCreep = global.CreepSpawnManager.Query(roomName);
            if (!spawnedCreep.body) continue;
            for (const spawn of room.spawns) {
                if (spawn.spawning) continue;
                if (spawn.spawnCreep(parseBodyPartsConfiguration(spawnedCreep.body), `@${Game.shard.name}-${roomName}-${Game.time}`, { memory : spawnedCreep.memory }) === OK) break;
            }
        }
    }.bind(global.Lucy);
    /**
     * Used to store scheduled Functions
     * @type { {tick : number : Array<function>} }
     */
    global.Lucy.Timer = {};
    /**
     * @type { (tick : number, func : function, thisId : Id<any>, params : any[], description : string) => void }
     */
    global.Lucy.Timer.add = function(tick, func, thisId, params, description) {
        if (tick <= Game.time) return;
        if (!this[tick]) this[tick] = [];
        this[tick].push({
            func,
            thisId,
            params,
            description
        });
        console.log(`<p style="color:gray;display:inline;">[Task]</p> Scheduled Task "${description}" at ${tick} is added at ${Game.time} ...`);
    }.bind(global.Lucy.Timer);
    /**
     * Used to iterate over the functions stored for current tick.
     */
    global.Lucy.Timer.done = function() {
        if (!this[Game.time]) return;
        for (const info of this[Game.time]) {
            const func = info.func;
            const _this = typeof info.thisId === "string"? Game.getObjectById(info.thisId) : info.thisId;
            if (!_this && typeof info.thisId === "string") {
                console.log(`<p style="color:red;display:inline;">Error:</p> Scheduled Task "${info.description}" fails to execute because of failing to retrieve object with Id ${info.thisId}`);
                continue;
            }
            func.call(_this, info.params);
        }
        delete this[Game.time];
    }.bind(global.Lucy.Timer);
})();