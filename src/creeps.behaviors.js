/**
 * @module creep.behaviors
 */
class MyCreep extends Creep {
    /**
     * checkIn does these 2 jobs:
     *  - ensure this Creep is empty.
     *  - ensure this Creep does not stands on any road.
     */
    checkIn() {
        /** In Case of Failing to Check In in the last Tick */
        if (this.memory._lastFailureTick === Game.time - 1) {
            this.memory._lastFailureTick = Game.time; // Prolong this influence into future
            return;
        }
        if (this.store.getUsedCapacity() === 0) return;
        if (!this.memory._lastStoringResourceType || !this.memory._lastStoringTargetId || this.store[this.memory._lastStoringResourceType] === 0 || Game.getObjectById(this.memory._lastStoringTargetId).store.getFreeCapacity(this.memory._lastStoringResourceType) === 0) {
            let flag = false;
            for (const resourceType in this.store) {
                const target = global.ResourceManager.Query(this, resourceType, this.store[resourceType], {type : "store"});
                if (target) {
                    this.memory._lastStoringResourceType = resourceType;
                    this.memory._lastStoringTargetId = target.id;
                    flag = true;
                    break;
                }
            }
            if (!flag) {
                this.memory._lastFailureTick = Game.time;
                return;
            }
        }
        if (this.transfer(Game.getObjectById(this.memory._lastStoringTargetId), this.memory._lastStoringResourceType) === ERR_NOT_IN_RANGE) this.travelTo(Game.getObjectById(this.memory._lastStoringTargetId));
    }
    /**
     * @returns {true | void | "fail"}
     */
    storeResources() {
        if (this.store.getUsedCapacity() === 0) {
            this.memory.storingResources = undefined;
            return true;
        }
        if (!this.memory.storingResources) this.memory.storingResources = Object.keys(this.store);
        while (this.memory.storingResources.length > 0) {
            /** @type {ResourceConstant} */
            const resourceType = this.memory.storingResources[0];
            if (this.store[resourceType] === 0) {
                this.memory.storingResources.shift();
                continue;
            }
            const target = global.ResourceManager.Query(this, resourceType, this.store[resourceType], {type : "store"});
            if (!target) {
                this.memory.storingResources.shift();
                continue;
            }
            if (this.transfer(target, resourceType) === ERR_NOT_IN_RANGE) {
                this.travelTo(target);
                return;
            } else break;
        }
        if (this.memory.storingResources.length === 0) {
            /**
             * Clean up memory and Return instant Signal
             */
            this.memory.storingResources = undefined;
            return "fail";
        }
    }
}
global.Lucy.App.mount(Creep, MyCreep);