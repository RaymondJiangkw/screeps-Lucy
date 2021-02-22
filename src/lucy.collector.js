/**
 * @module lucy.collector
 * Used to collect information for cache instead of fetching many times in a single tick.
 * 
 * @typedef {Collector} Collector
 */
class Collector {
    /**
     * @returns {Room[]}
     */
    get colonies() {
        const key = "_colonies";
        if (!this[`${key}_tick`] || this[`${key}_tick`] < Game.time) {
            this[`${key}_tick`] = Game.time;
            /** @private */
            return this[key] = Object.values(Game.rooms).filter(r => r.controller && r.controller.my);
        } else return this[key];
    }
    constructor() {}
}

module.exports = {
    Collector : Collector
};