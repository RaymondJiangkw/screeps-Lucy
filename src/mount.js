/* Running for Once */
require('Traveler');
require('prototype.Room.structures');
require('prototype.Room.resources');
const util_mount                            = require('./util').mount;
const native_enhancement_mount              = require('./native.enhancement').mount;
const native_encapsulation_mount            = require('./native.encapsulation').mount;
const memory_mount                          = require('./memory.prototype').mount;
const money_mount                           = require('./money.prototype').mount;
const task_mount                            = require("./task.prototype").mount;
const structures_behaviors_mount            = require('./structures.behaviors').mount;
const resources_behaviors_mount             = require('./resources.behaviors').mount;
const creeps_behaviors_mount                = require('./creeps.behaviors').mount;
const rooms_behaviors_mount                 = require('./rooms.behaviors').mount;
/* Mount of Game */
const native_encapsulation_mountEveryTick   = require('./native.encapsulation').mountEveryTick;
const task_mountEveryTick                   = require("./task.prototype").mountEveryTick;
// require('native.enhancement'); // Has been executed by importing `native_enhancement_mount`
/* Register for Once */
global.TaskManager                          = new (require('./manager.tasks').TaskManager)();
global.ResourceManager                      = new (require('./manager.resources').ResourceManager)();
global.CreepSpawnManager                    = new (require('./manager.creeps').CreepSpawnManager)();
global.LinkManager                          = new (require('./manager.links').LinkManager)();
module.exports = function() {
    if (!global.mounted) {
        console.log(`<p style="color:red;display:inline;">[mount]</p> Successfully Remount.`);
        global.mounted = true;
        util_mount();
        native_enhancement_mount();
        native_encapsulation_mount();
        memory_mount();
        money_mount();
        task_mount();
        rooms_behaviors_mount();
        creeps_behaviors_mount();
        resources_behaviors_mount();
        structures_behaviors_mount();
    }
    /**
     * Mount of Game should be executed at every tick, since Game is refreshed at every tick.
     */
    native_encapsulation_mountEveryTick();
    task_mountEveryTick();
}