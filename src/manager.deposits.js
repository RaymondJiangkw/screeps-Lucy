/**
 * @module manager.deposits
 * Carry out the task of harvesting deposits.
 * `Deposit` is triggered by `flag`.
 */
const getPrice          = require("./util").getPrice;
const TaskConstructor   = require("./manager.tasks").TaskConstructor;
/**
 * @typedef { {memory : {depositType : DepositConstant, disappearTick : number, lastCooldown : number, depositId : Id<Deposit>}} } DepositFlagMemory
 */
class DepositManager {
    /**
     * @private
     * @param {string} flagName
     */
    trigger(flagName) {

    }
    /**
     * @TODO
     * @private
     * @param {Flag & DepositFlagMemory} flag
     */
    isProfitable(flag) {
        const home = global.Lucy.Collector.findClosestColonyByPath(flag.pos.roomName);
        
    }
    /**
     * @private
     * @param {string} flagName
     */
    register(flagName) {
        /** @type {Flag & DepositFlagMemory} */
        const flag = Game.flags[flagName];
        if (!flag) return;
        global.Lucy.Timer.add(flag.memory.disappearTick + 1, this.Clean, this, [flagName], `Clean ${flagName} at ${flag.pos}`);
        if (this.isProfitable(flag)) this.trigger(flagName);
        return;
    }
    /**
     * @private
     * @param {string} flagName
     */
    detect(flagName) {
        /** @type {Flag & DepositFlagMemory} */
        const flag = Game.flags[flagName];
        if (!flag) return;
        if (!Game.rooms[flag.pos.roomName]) {
            global.Log.error(`Fail to detect`, global.Dye.blue("Deposit"), `at ${flag.pos} because of invisibility`);
            return false;
        }
        const deposit = Game.rooms[flag.pos.roomName].lookForAt(LOOK_DEPOSITS, flag.pos)[0];
        if (!deposit) {
            this.clean(flagName);
            return false;
        }
        flag.memory.depositType = deposit.depositType;
        flag.memory.lastCooldown = deposit.lastCooldown;
        flag.memory.disappearTick = deposit.ticksToDecay + Game.time;
        flag.memory.depositId = deposit.id;
        return true;
    }
    /**
     * @param {Flag & DepositFlagMemory} flag
     */
    Register(flag) {
        if (flag.memory.depositType && flag.memory.depositId && flag.memory.disappearTick && flag.memory.lastCooldown) this.register(flag.name);
        else {
            if (Game.rooms[flag.pos.roomName]) this.detect(flag.name) && this.register(flag.name);
            else if (!TaskConstructor.ScoutTask(flag.pos.roomName, {callback : function(flagName) { this.detect(flagName) && this.register(flagName); }.bind(this, flag.name)})) this.clean(flag.name);
        }
    }
    /**
     * @param {string} flagName
     */
    clean(flagName) {
        /** @type {Flag & DepositFlagMemory} */
        const flag = Game.flags[flagName];
        if (!flag) return;
        delete Memory.flags[flag.name];
        flag.remove();
    }
    /**
     * @param {string} flagName
     */
    Clean(flagName) {
        /** @type {Flag & DepositFlagMemory} */
        const flag = Game.flags[flagName];
        if (!flag) return;
        if (Game.rooms[flag.pos.roomName] && Game.getObjectById(flag.memory.depositId)) return this.detect(flagName) && this.register(flagName);
        if (Game.time < flag.memory.disappearTick) {
            /** Continue Clean Task */
            global.Lucy.Timer.add(flag.memory.disappearTick + 1, this.Clean, this, [flagName], `Clean "${flagName}" at ${flag.pos}`);
            return true;
        }
        return this.clean(flagName);
    }
    constructor() {}
}

const _depositManager = new DepositManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const DepositPlugin = {
    init : () => global.DepositManager = _depositManager
};

global.Lucy.App.on(DepositPlugin);