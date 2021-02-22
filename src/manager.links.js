/**
 * @module manager.link
 * @typedef {LinkManager} LinkManager
 */
const profiler = require("./screeps-profiler");
const Notifier = require("./visual.notifier").Notifier;
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
        if (!this.room2tags2links[link.room.name][Game.getTagById(link.id)]) this.room2tags2links[link.room.name][Game.getTagById(link.id)] = [];
        this.room2tags2links[link.room.name][Game.getTagById(link.id)].push(link.id);
    }
    /**
     * Perhaps there exists a much more elegant way.
     */
    Run() {
        for (const roomName in this.room2tags2links) {
            const _cpuUsed = Game.cpu.getUsed();
            if (!this.room2ticks[roomName]) Notifier.register(roomName, `Ticks Consumption`, `Link`, () => `${this.room2ticks[roomName] || 0}`);
            this.room2ticks[roomName] = `0.00`;
            /**
             * Transfer Energy from Source Link to Spawn / Controller Link
             * Transfer Link is used while Source Links are empty, and, in this case, if Transfer Link is empty, Filling Order is issued.
             */
            for (const targetLink of [].concat(this.Fetch(roomName, FetchTag("spawn")), this.Fetch(roomName, FetchTag("controller")))) {
                /** Has not been Used Up */
                if (targetLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0) continue;
                for (const sourceLink of this.Fetch(roomName, FetchTag("source"))) {
                    if (sourceLink.store.getFreeCapacity(RESOURCE_ENERGY) > CARRY_CAPACITY || sourceLink.cooldown > 0 || sourceLink._hasTransferred) continue;
                    sourceLink.transferEnergy(targetLink);
                    break;
                }
                if (!targetLink._hasBeenTransferred) {
                    for (const transferLink of this.Fetch(roomName, FetchTag("transfer"))) {
                        // NOTICE : _hasBeenWithdrawn is ignored here.
                        if (transferLink.cooldown > 0 || transferLink._hasTransferred) continue;
                        if (transferLink.store[RESOURCE_ENERGY] === 0) { // In this case : transferLink needs to be filled.
                            /** @type {import("./rooms.behaviors").CentralTransferUnit} */
                            const centralTransfer = Game.rooms[roomName].centralTransfer;
                            centralTransfer.PushOrder({from : "any", to : "link", resourceType : RESOURCE_ENERGY, amount : LINK_CAPACITY});
                            // NOTICE : Another Exhaustion Order is issued in case of blocking.
                            centralTransfer.PushOrder({from : "link", to : "any", resourceType : RESOURCE_ENERGY, amount : LINK_CAPACITY});
                            continue;
                        }
                        transferLink.transferEnergy(targetLink);
                        break;
                    }
                }
            }
            /**
             * If Source Link is not empty and has not transferred any energy, they will be collected in Transfer Link.
             */
            for (const sourceLink of this.Fetch(roomName, FetchTag("source"))) {
                if (sourceLink.store.getFreeCapacity(RESOURCE_ENERGY) > CARRY_CAPACITY || sourceLink.cooldown > 0 || sourceLink._hasTransferred) continue;
                for (const transferLink of this.Fetch(roomName, FetchTag("transfer"))) {
                    if (transferLink.store.getUsedCapacity(RESOURCE_ENERGY) > 0 || transferLink._hasBeenTransferred) continue;
                    sourceLink.transferEnergy(transferLink);
                    const centralTransfer = Game.rooms[roomName].centralTransfer;
                    centralTransfer.PushOrder({from : "link", to : "any", resourceType : RESOURCE_ENERGY, amount : LINK_CAPACITY});
                    break;
                }
            }
            this.room2ticks[roomName] = `${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`;
        }
    }
    constructor() {
        /** @type { {[roomName : string] : {[tag : string] : Array<Id<StructureLink>>}} } */
        this.room2tags2links = {};
        /** @type { {[roomName : string] : string} } */
        this.room2ticks = {};
    }
};
/** @param {"source" | "controller" | "spawn" | "transfer"} type */
function FetchTag(type) {
    if (type === "source") return "forSource";
    else if (type === "transfer") return global.Lucy.Rules.arrangements.TRANSFER_ONLY;
    else if (type === "controller") return global.Lucy.Rules.arrangements.UPGRADE_ONLY;
    else if (type === "spawn") return global.Lucy.Rules.arrangements.SPAWN_ONLY;
}
const _linkManager = new LinkManager();
profiler.registerClass(LinkManager, "LinkManager");
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const LinkManagerPlugin = {
    init : () => global.LinkManager = _linkManager,
    tickStart : () => {
        global.LinkManager.Run();
        
    }
};
global.Lucy.App.on(LinkManagerPlugin);