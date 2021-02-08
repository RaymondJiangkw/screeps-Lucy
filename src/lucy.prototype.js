const isMyRoom                      = require('./util').isMyRoom;
const calcInRoomDistance            = require('./util').calcInRoomDistance;
const parseBodyPartsConfiguration   = require('./util').parseBodyPartsConfiguration;
const { EVENT_TYPES }               = require("./lucy.log");
/** @type { {[roomName : string] : number} } */
const RemoteMineDelay = {};
/**
 * $ converts Object in Screeps into Object in Lucy.
 */
function $() {
    
};
(function() {
    global.Lucy = {};
    global.Lucy.Rules = require("lucy.rules");
    global.Lucy.Logs = new (require("lucy.log").LogPool)();
    global.Lucy.InitSignals = function() {
        global.signals = {
            IsStructureDestroy : {},
            IsConstructionSiteCancel : {},
            IsNewStructure : {},
            IsNewConstructionSite : {}
        };
    }.bind(global.Lucy);
    global.Lucy.Spawn = function() {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (!isMyRoom(room)) continue;
            // NOTICE : Query Creep is time-consuming, and it is unnecessary when no spawn is available.
            /** @type {Array<StructureSpawn>} */
            const candidateSpawns = room.spawns.filter(s => !s.spawning);
            if (candidateSpawns.length === 0) continue;
            // NOTICE : In order to avoid energy-consumption-overlapping, for each tick, only one Spawn will be allowed to spawn Creep.
            /** @type {{} | { body : {[body in BodyPartConstant]? : number}, memory : {}, workingPos? : RoomPosition} } */
            const spawnedCreep = global.CreepSpawnManager.Query(roomName);
            if (!spawnedCreep.body) continue;
            /** Record Spawn Room Name */
            spawnedCreep.memory.spawnRoomName = roomName;
            if (spawnedCreep.workingPos) candidateSpawns.sort((a, b) => calcInRoomDistance(a.pos, spawnedCreep.workingPos) - calcInRoomDistance(b.pos, spawnedCreep.workingPos));
            candidateSpawns[0].spawnCreep(
                parseBodyPartsConfiguration(spawnedCreep.body),
                `@${Game.shard.name}-${roomName}-${Game.time}`,
                {
                    memory : spawnedCreep.memory,
                    directions:
                        [
                            spawnedCreep.workingPos ?
                                (candidateSpawns[0].pos.getRangeTo(spawnedCreep.workingPos) === 1 ?
                                    candidateSpawns[0].pos.getDirectionTo(spawnedCreep.workingPos):
                                    candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])) :
                                candidateSpawns[0].room.centralSpawn.SpawnDirection(candidateSpawns[0])
                        ]
                }
            );
        }
    }.bind(global.Lucy);
    global.Lucy.HandleEvent = function() {
        /**
         * @type {import("./lucy.log").Event}
         */
        let event = undefined;
        while (event = this.Logs.Pool.pop()) {
            /* Trigger ConstructionSites */
            if (event.Type === EVENT_TYPES.OBJECT_CONSTRUCT && event.ObjectType === "ConstructionSite") {
                global.MapMonitorManager.FetchConstructionSites(event.Pos.roomName, event.Pos.y, event.Pos.x).forEach(c => c.triggerBuilding());
            }
            /* Trigger New-built Structures */
            if (event.Type === EVENT_TYPES.OBJECT_CONSTRUCT && event.ObjectType === "Structure") {
                /* Special Case for Spawn */
                if (event.StructureType === STRUCTURE_SPAWN && Game.rooms[event.Pos.roomName].find(FIND_STRUCTURES, { filter : {structureType : STRUCTURE_SPAWN} }).length > 1) continue;
                const structures = global.MapMonitorManager.FetchStructure(event.Pos.roomName, event.Pos.y, event.Pos.x).filter(s => s.structureType === event.StructureType);
                structures.forEach(s => {
                    console.log(`<p style="display:inline;color:gray;">[Log]</p> Detect Newly Constructed Structure ${s} with register ${s.register}`);
                    if (s.register !== undefined) s.register();
                });
                structures.forEach(s => {
                    console.log(`<p style="display:inline;color:gray;">[Log]</p> Detect Newly Constructed Structure ${s} with trigger ${s.trigger}`);
                    if (s.trigger !== undefined) s.trigger();
                });
            }
        }
    }.bind(global.Lucy);
    global.Lucy.PlanInitRoom = function() {
        for (const roomName in Game.rooms) {
            if (isMyRoom(Game.rooms[roomName])) {
                global.Map.AutoPlan(roomName);
                Game.rooms[roomName].init();
                if (!RemoteMineDelay[roomName] || RemoteMineDelay[roomName] <= Game.time) {
                    delete RemoteMineDelay[roomName];
                    const ret = global.Map.RemoteMine(roomName);
                    if (typeof ret === "number") RemoteMineDelay[roomName] = ret;
                }
            } else {
                Game.rooms[roomName].Detect();
            }
        }
    }.bind(global.Lucy);
    global.Lucy.FetchTasks = function() {
        /* Creep */
        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            if (!creep.task) {
                const ret = global.TaskManager.Query(creep);
                if (ret) creep.task = ret;
                else {
                    creep.say("🚬");
                    if (!creep.task) creep.checkIn();
                }
            }
        }
    }.bind(global.Lucy);
    global.Lucy.SolveHotPush = function() {
        /**
         * @type {import("./lucy.log").Event}
         */
        let hotEvent = null;
        while ((hotEvent = this.Logs.HotPoolTop)) {
            // console.log(hotEvent.Type, hotEvent.Status, hotEvent.Obj);
            if (hotEvent.Type === EVENT_TYPES.TASK_OF_OBJECT_STATUS_CHANGE) {
                if (hotEvent.Status === "fired") {
                    /**
                     * `fired` objects could fetch `task` at the same tick to avoid duplicate spawning.
                     * NOTICE : There could be reduntant such events while `fired` objects have taken some tasks. Thus, double check is compulsory.
                     */
                    if (!hotEvent.Obj.task) hotEvent.Obj.task = global.TaskManager.Query(hotEvent.Obj);
                }
            }
        }
    }.bind(global.Lucy);
    global.Lucy.LinkRun = function() {
        for (const roomName in Game.rooms) {
            if (isMyRoom(Game.rooms[roomName]) && Game.rooms[roomName].links.length > 1) global.LinkManager.Run(roomName);
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
            func.apply(_this, info.params);
        }
        delete this[Game.time];
    }.bind(global.Lucy.Timer);
})();