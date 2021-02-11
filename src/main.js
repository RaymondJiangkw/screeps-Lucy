require("lucy.prototype");
const profiler = require("screeps-profiler");
profiler.enable();
module.exports.loop = function() {
    profiler.wrap(function() {
        global.Lucy.App.run();
        /**
         * Temporary Tower Code
         */
        require('./tmp.tower.run')();
    });
}