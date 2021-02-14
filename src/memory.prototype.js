/**
 * Plugin of Garbage Collector
 * @type {import("./lucy.app").AppLifecycleCallbacks}
 */
const GCPlugin = {
    tickStart : () => {
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