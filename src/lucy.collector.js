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
    /**
     * @param {string} targetRoomName
     * @returns { {roomName : string, distance : number} }
     */
    findClosestColonyByPath(targetRoomName) {
        const dist = (roomName) => {
            const ret = global.Map.CalcRoomDistance(roomName, targetRoomName);
            if (ret === Infinity) return Game.map.getRoomLinearDistance(roomName, targetRoomName);
            else return ret;
        };
        const roomName = this.colonies.sort((u, v) => dist(u.name) - dist(v.name))[0].name;
        return {distance : dist(roomName), roomName : roomName};
    }
    constructor() {}
}

module.exports = {
    Collector : Collector
};