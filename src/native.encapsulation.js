/**
 * @module native.encapsulation
 * 
 * This module rewrites native functions defined in Screeps.
 */

const { EventObjectConstruct, EventObjectDestroy } = require('./lucy.log');
const evaluateAbility = require('./util').evaluateAbility;
/**
 * Define `id` for Flag
 */
const FLAG_ID_INDICATOR = "flag-";
class MyFlag extends Flag {
    get id() {
        return FLAG_ID_INDICATOR + this.name;
    }
}
function mount() {
    const createConstructionSite = Room.prototype.createConstructionSite;
    Room.prototype.createConstructionSite = function() {
        const ret = createConstructionSite.apply(this, arguments);
        if (ret === OK) {
            if (arguments[0] instanceof RoomPosition) global.Lucy.Logs.Push(new EventObjectConstruct(arguments[0], arguments[1], "ConstructionSite"));
            else global.Lucy.Logs.Push(new EventObjectConstruct(new RoomPosition(arguments[0], arguments[1], this.name), arguments[2], "ConstructionSite"));
        }
        return ret;
    };
    const createFlag = Room.prototype.createFlag;
    Room.prototype.createFlag = function() {
        /** @type {CreateFlagOption} */
        const options = (arguments[0] instanceof RoomPosition? arguments[2] : arguments[3]) || {};
        _.defaults(options, { color : COLOR_WHITE, secondaryColor : COLOR_WHITE });
        const params = arguments[0] instanceof RoomPosition? [arguments[0], arguments[1], options.color, options.secondaryColor] : [arguments[0], arguments[1], arguments[2], options.color, options.secondaryColor];
        const ret = createFlag.apply(this, params);
        if (ret === OK) {
            const name = arguments[0] instanceof RoomPosition ? arguments[1] : arguments[2];
            global.FlagManager.PreRegister(name, options.memory || {});
        }
        return ret;
    };
    const build = Creep.prototype.build;
    Creep.prototype.build = function(target) {
        const ret = build.apply(this, arguments);
        if (ret === OK) {
            const consumedEnergy = Math.min(evaluateAbility(this, "build") * 5, this.store.getUsedCapacity(RESOURCE_ENERGY));
            if (consumedEnergy + target.progress >= target.progressTotal) global.Lucy.Logs.Push(new EventObjectConstruct(target.pos, target.structureType, "Structure"));
        }
        return ret;
    }
    const structureDestroy = Structure.prototype.destroy;
    Structure.prototype.destroy = function() {
        const pos = this.pos;
        const ret = structureDestroy.apply(this, arguments);
        if (ret === OK) {
            global.Lucy.Logs.Push(new EventObjectDestroy(pos, this.structureType, "Structure"));
        }
        return ret;
    };
    const constructionRemove = ConstructionSite.prototype.remove;
    ConstructionSite.prototype.remove = function() {
        const pos = this.pos;
        const ret = constructionRemove.apply(this, arguments);
        if (ret === OK) {
            global.Lucy.Logs.Push(new EventObjectDestroy(pos, this.structureType, "ConstructionSite"));
        }
        return ret;
    }
    const claimController = Creep.prototype.claimController;
    Creep.prototype.claimController = function(target) {
        const ret = claimController.apply(this, arguments);
        if (ret === OK) {
            global.Lucy.Timer.add(Game.time + 1, StructureController.prototype.triggerUpgrading, target.id, [], `Upgrading Controller of ${target.room.name}`);
            global.Lucy.Timer.add(Game.time + 1, function(roomName) {
                const room = Game.rooms[roomName];
                room.find(FIND_HOSTILE_CONSTRUCTION_SITES).forEach(c => c.remove());
                room.find(FIND_STRUCTURES).forEach(s => s.destroy());
                room.sources.forEach(source => source.register());
            }, undefined, [target.room.name], `Cleaning Remained Structures`);
            /** Monitor Controller Upgrade */
            const r = target.room;
            global.Lucy.App.monitor({label : `${r.name}.controller.level`, init : 0, fetch : (roomName) => Game.rooms[roomName] && Game.rooms[roomName].controller.level, fetchParams : [r.name], func : (newNumber, oldNumber, roomName) => Game.rooms[roomName] && Game.rooms[roomName].CheckSpawnIndependent(), funcParams : [r.name]});
        }
        return ret;
    };
    const withdraw = Creep.prototype.withdraw;
    Creep.prototype.withdraw = function(target, resourceType, amount) {
        const ret = withdraw.apply(this, arguments);
        if (ret === OK) {
            target._hasBeenWithdrawn = true;
        }
        return ret;
    };
    const transfer = Creep.prototype.transfer;
    Creep.prototype.transfer = function(target, resourceType, amount) {
        const ret = transfer.apply(this, arguments);
        if (ret === OK) {
            target._hasBeenTransferred = true;
        }
        return ret;
    };
    const move = Creep.prototype.move;
    Creep.prototype.move = function() {
        const ret = move.apply(this, arguments);
        if (ret === OK) {
            this._move = true;
        }
        return ret;
    };
    const towerAttack = StructureTower.prototype.attack;
    const towerHeal = StructureTower.prototype.heal;
    const towerRepair = StructureTower.prototype.repair;
    StructureTower.prototype.attack = function() {
        const store = this.store[RESOURCE_ENERGY];
        const ret = towerAttack.apply(this, arguments);
        if (ret === OK) {
            if (store >= TOWER_CAPACITY / 2 && store - TOWER_ENERGY_COST < TOWER_CAPACITY / 2) {
                global.Lucy.Timer.add(Game.time + 1, this.trigger, this.id, [], `Filling Energy for ${this}`);
            }
        }
        return ret;
    }
    StructureTower.prototype.heal = function() {
        const store = this.store[RESOURCE_ENERGY];
        const ret = towerHeal.apply(this, arguments);
        if (ret === OK) {
            if (store >= TOWER_CAPACITY / 2 && store - TOWER_ENERGY_COST < TOWER_CAPACITY / 2) {
                global.Lucy.Timer.add(Game.time + 1, this.trigger, this.id, [], `Filling Energy for ${this}`);
            }
        }
        return ret;
    }
    StructureTower.prototype.repair = function() {
        const store = this.store[RESOURCE_ENERGY];
        const ret = towerRepair.apply(this, arguments);
        if (ret === OK) {
            if (store >= TOWER_CAPACITY / 2 && store - TOWER_ENERGY_COST < TOWER_CAPACITY / 2) {
                global.Lucy.Timer.add(Game.time + 1, this.trigger, this.id, [], `Filling Energy for ${this}`);
            }
        }
        return ret;
    }
    const transferEnergy = StructureLink.prototype.transferEnergy;
    StructureLink.prototype.transferEnergy = function(target, amount) {
        amount = amount || Math.min(this.store[RESOURCE_ENERGY], target.store.getFreeCapacity(RESOURCE_ENERGY));
        const ret = transferEnergy.apply(this, arguments);
        if (ret === OK) {
            this._hasTransferred = true;
            target._hasBeenTransferred = true;
            /** Link of CentralSpawnUnit */
            if (Game.getTagById(target.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY) {
                global.Lucy.Timer.add(Game.time + 1, function(roomName) {
                    Game.rooms[roomName].centralSpawn.SetSignal("all", "fromLink", true);
                }, undefined, [target.room.name], `Filling Energy of Container in CentralSpawn of ${target.room.name} via Link`);
            } else if (Game.getTagById(target.id) === global.Lucy.Rules.arrangements.TRANSFER_ONLY) {
                global.Lucy.Timer.add(Game.time + 1, function(roomName, amount) {
                    /** @type {Room} */
                    const room = Game.rooms[roomName];
                    /** @type {import('./rooms.behaviors').CentralTransferUnit} */
                    const centralTransfer = room.centralTransfer;
                    let to = null;
                    if (centralTransfer.Storage && centralTransfer.Storage.store.getFreeCapacity() >= global.Lucy.Rules.storage["collectSpareCapacity"] && centralTransfer.Storage.store[RESOURCE_ENERGY] / centralTransfer.Storage.store.getCapacity() <= global.Lucy.Rules.storage[RESOURCE_ENERGY]) to = STRUCTURE_STORAGE;
                    else if (centralTransfer.Terminal && centralTransfer.Terminal.store.getFreeCapacity() >= global.Lucy.Rules.terminal["collectSpareCapacity"] && centralTransfer.Terminal.store[RESOURCE_ENERGY] / centralTransfer.Terminal.store.getCapacity() <= global.Lucy.Rules.terminal[RESOURCE_ENERGY]) to = STRUCTURE_TERMINAL;
                    if (to) centralTransfer.PushOrder({from : "link", to : to, resourceType : RESOURCE_ENERGY, amount : amount});
                }, undefined, [target.room.name, amount], `Transfer Energy into CentralTransfer of ${target.room.name} via Link`);
            }
        }
        return ret;
    }
}
global.Lucy.App.mount(Flag, MyFlag);
global.Lucy.App.mount(mount);
/** @type { {[id : string] : string} } */
const id2tag = {};
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const NativeEncapsulationPlugin = {
    resetEveryTick : () => {
        const getObjectById = Game.getObjectById;
        Game.getObjectById = function(id) {
            if (typeof id === "string" && id.substring(0, FLAG_ID_INDICATOR.length) === FLAG_ID_INDICATOR) return Game.flags[id.substring(FLAG_ID_INDICATOR.length)];
            else return getObjectById(id);
        };
        /**
         * @param {Id} id
         */
        Game.getTagById = function(id) {
            return id2tag[id] || null;
        };
        /**
         * @param {Id} id
         * @param {string} tag
         */
        Game.setTagById = function(id, tag) {
            id2tag[id] = tag;
        };
    }
};
global.Lucy.App.on(NativeEncapsulationPlugin);