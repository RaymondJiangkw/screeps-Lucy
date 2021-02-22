/**
 * @module lucy.timer
 * @typedef {Timer} Timer
 */
class Timer extends Array {
    /**
     * Add Scheduled Task
     * @param {number} tick
     * @param {Function} func
     * @param {any} funcThis
     * @param {any[]} params
     * @param {string} description
     */
    add(tick, func, funcThis, params, description) {
        // const { Notifier, NotifierPriority } = require("./visual.notifier");
        if (tick <= Game.time) return;
        if (!this[tick]) this[tick] = [];
        this[tick].push({ func, funcThis, params, description });
        // Notifier.notify(`Lucy.Timer.add ${description} scheduled at ${tick}`);
        // console.log(`<p style="color:gray;display:inline;">[Task]</p> Scheduled Task "${description}" at ${tick} is added at ${Game.time} ...`);
    }
    /**
     * Iterate over functions scheduled at current tick.
     */
    done() {
        const _cpuUsed = Game.cpu.getUsed();
        if (!this[Game.time]) return;
        for (const info of this[Game.time]) {
            const func = info.func;
            const _this = typeof info.funcThis === "string"? Game.getObjectById(info.funcThis) : info.funcThis;
            if (!_this && typeof info.funcThis === "string") {
                console.log(`<p style="color:red;display:inline;">Error:</p> Scheduled Task "${info.description}" fails to execute because of failing to retrieve object with Id ${info.funcThis}`);
                continue;
            }
            global.Log.debug(global.Dye.grey(`Executing "${info.description}" ...`))
            func.apply(_this, info.params);
        }
        delete this[Game.time];
        // console.log(`Timer -> ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
    }
}

module.exports = {
    Timer : Timer
};