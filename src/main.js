require("lucy.prototype");
const mount = require("mount");
const profiler = require("screeps-profiler");
profiler.enable();
module.exports.loop = function() {
    profiler.wrap(function() {
        mount();
        /** Signal is Refreshed At Every Tick. */
        global.Lucy.InitSignals();
        /** Garbage Memory Collection Routine */
        GCMemory();
        /**
         * Scheduled Functions
         * NOTICE : They could possibly emit emergent tasks, thus they are allowed to run first.
         */
        global.Lucy.Timer.done();
        /** Room Plan & Init */
        global.Lucy.PlanInitRoom();
        /** Handle Events */
        global.Lucy.HandleEvent();
        /** Fetch Tasks */
        global.Lucy.FetchTasks();
        /** Task Routine */
        global.TaskManager.Run();
        /**
         * Temporary Tower Code
         */
        require('./tmp.tower.run')();
        /** Solve for HotPush */
        global.Lucy.SolveHotPush();
        // This step is compulsory ! Since the indicator needs to be updated.
        Lucy.Logs.Done();
        /** Spawn Routine */
        global.Lucy.Spawn();
        /** Auxiliary Display */
        global.ResourceManager.Display();
    });
}