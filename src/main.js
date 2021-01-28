require("lucy.prototype");
const mount = require("mount");
const profiler = require("screeps-profiler");
profiler.enable();
const { EVENT_TYPES } = require("./lucy.log");
const isMyRoom = require("./util").isMyRoom;
module.exports.loop = function() {
    profiler.wrap(function() {
        mount();
        /**
         * Signal is Refreshed At Every Tick.
         */
        global.signals = {
            IsStructureDestroy : {},
            IsConstructionSiteCancel : {},
            IsNewStructure : {},
            IsNewConstructionSite : {}
        };
        /** 
         * Garbage Memory Collection Routine 
         */
        GCMemory();
        /**
         * Scheduled Functions
         * NOTICE : They could possibly emit emergent tasks, thus they are allowed to run first.
         */
        global.Lucy.Timer.done();
        /**
         * Room Plan
         */
        for (const roomName in Game.rooms) {
            if (isMyRoom(Game.rooms[roomName])) global.Map.AutoPlan(roomName);
        }
        /**
         * Handle Events
         */
        /**
         * @type {import("./lucy.log").Event}
         */
        let event = undefined;
        while (event = global.Lucy.Logs.Pool.pop()) {
            /* Trigger ConstructionSites */
            if (event.Type === EVENT_TYPES.OBJECT_CONSTRUCT && event.ObjectType === "ConstructionSite") {
                global.MapMonitorManager.FetchConstructionSites(event.Pos.roomName, event.Pos.y, event.Pos.x).forEach(c => c.triggerBuilding());
            }
            /* Trigger New-built Structures */
            if (event.Type === EVENT_TYPES.OBJECT_CONSTRUCT && event.ObjectType === "Structure") {
                const structures = global.MapMonitorManager.FetchStructure(event.Pos.roomName, event.Pos.y, event.Pos.x).filter(s => s.structureType === event.StructureType);
                structures.forEach(s => {
                    console.log(`<p style="display:inline;color:gray;">[Log]</p> Detect Newly Constructed Structure ${s} with trigger ${s.register}`);
                    if (s.register !== undefined) s.register();
                });
                structures.forEach(s => {
                    console.log(`<p style="display:inline;color:gray;">[Log]</p> Detect Newly Constructed Structure ${s} with trigger ${s.trigger}`);
                    if (s.trigger !== undefined) s.trigger();
                });
            }
        }
        /**
         * Fetch Tasks
         */
        /* Creep */
        for (const creepName in Game.creeps) {
            const creep = Game.creeps[creepName];
            if (!creep.task) {
                creep.say("🚬");
                creep.task = global.TaskManager.Query(creep);
            }
        }
        /**
         * Task Routine
         */
        global.TaskManager.Run();
        /**
         * Temporary Tower Code
         */
        require('./tmp.tower.run')();
        /**
         * Solve for HotPush
         */
        /**
         * @type {import("./lucy.log").Event}
         */
        let hotEvent = null;
        while ((hotEvent = Lucy.Logs.HotPoolTop)) {
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
        // This step is compulsory ! Since the indicator needs to be updated.
        Lucy.Logs.Done();
        /**
         * Spawn Routine
         * @TODO
         */
        global.Lucy.Spawn();
        /**
         * Auxiliary Display
         */
        // global.ResourceManager.Display();
    });
}