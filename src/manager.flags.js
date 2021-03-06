/**
 * @module manager.flags
 */
const profiler = require("./screeps-profiler");
class FlagManager {
    /**
     * @param {Flag | string} flag_or_flagName
     */
    Register(flag_or_flagName) {
        const flag = flag_or_flagName instanceof Flag ? flag_or_flagName : Game.flags[flag_or_flagName];
        switch (flag.color) {
            case COLOR_BLUE : {
                global.DepositManager.Register(flag);
                break;
            }
        }
    }
    /**
     * @param {string} flagName
     * @param { {} } memory
     */
    PreRegister(flagName, memory = {}) {
        _.set(Memory, ["flags", flagName], memory);
        global.Lucy.Timer.add(Game.time + 1, this.Register, this, [flagName], `Register Flag ${flagName}`);
    }
    reset() {
        for (const name in Game.flags) this.Register(Game.flags[name]);
    }
    constructor() {}
}
profiler.registerClass(FlagManager, "FlagManager");
const flagManager = new FlagManager();
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const FlagPlugin = {
    init : () => global.FlagManager = flagManager,
    reset : () => global.FlagManager.reset()
};
profiler.registerObject(FlagPlugin, "FlagPlugin");
global.Lucy.App.on(FlagPlugin);