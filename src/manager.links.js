/**
 * @module manager.link
 */
class LinkManager {
    /**
     * @param {string} roomName
     * @param {string} tag
     * @returns {Array<StructureLink>}
     */
    Fetch(roomName, tag) {
        if (!this.room2tags2links[roomName]) return [];
        if (!this.room2tags2links[roomName][tag]) return [];
        if (!this.room2tags2links[roomName][tag]._lastUpdateTick || this.room2tags2links[roomName][tag]._lastUpdateTick < Game.time) {
            this.room2tags2links[roomName][tag]._lastUpdateTick = Game.time;
            this.room2tags2links[roomName][tag]._links = this.room2tags2links[roomName][tag].map(id => Game.getObjectById(id));
        }
        return this.room2tags2links[roomName][tag]._links;
    }
    /** @param {StructureLink} link */
    Register(link) {
        if (!this.room2tags2links[link.room.name]) this.room2tags2links[link.room.name] = {};
        if (!this.room2tags2links[link.room.name][link.memory.tag]) this.room2tags2links[link.room.name][link.memory.tag] = [];
        this.room2tags2links[link.room.name][link.memory.tag].push(link.id);
    }
    constructor() {
        /**
         * @type { {[roomName : string] : {[tag : string] : Array<Id<StructureLink>>}} }
         */
        this.room2tags2links = {};
    }
};
/** @param {"source" | "controller" | "spawn" | "transfer"} type */
function FetchTag(type) {
    if (type === "source") return "forSource";
    else if (type === "transfer") return global.Lucy.Rules.arrangements.TRANSFER_ONLY;
    else if (type === "controller") return global.Lucy.Rules.arrangements.UPGRADE_ONLY;
    else if (type === "spawn") return global.Lucy.Rules.arrangements.SPAWN_ONLY;
}
module.exports = {
    LinkManager : LinkManager
};