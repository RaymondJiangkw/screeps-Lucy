/**
 * @module native.encapsulation
 * 
 * This module rewrites native functions defined in Screeps.
 */

const { EventObjectConstruct, EventObjectDestroy } = require('./lucy.log');
const evaluateAbility = require('./util').evaluateAbility;

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
}
/**
 * This mount is executed at every tick, since it targets at the mount of Game object, which is refreshed frequently.
 */
function mountEveryTick() {
    /**
     * @see {native.enhancement.flagIdIndicator}
     */
    const flagIdIndicator = "flag-";
    const getObjectById = Game.getObjectById;
    Game.getObjectById = function(id) {
        if (typeof id === "string" && id.substring(0, flagIdIndicator.length) === flagIdIndicator) return Game.flags[id.substring(flagIdIndicator.length)];
        else return getObjectById(id);
    };
}
module.exports = {
    mount : mount,
    mountEveryTick : mountEveryTick
};