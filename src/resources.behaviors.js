/**
 * @module resources.behaviors
 * 
 * This module defines the basic behaviors for Resources.
 */
const isMyRoom                  = require('./util').isMyRoom;
const ResourceDescriptor        = require('./manager.resources').ResourceDescriptor;
const StoringDescriptor         = require('./manager.resources').StoringDescriptor;
const RESOURCE_POSSESSING_TYPES = require('./manager.resources').RESOURCE_POSSESSING_TYPES;
function giveContainerBehaviors() {
    /**
     * Register is necessary to execute before triggering for potential Resource Register.
     */
    StructureContainer.prototype.register = function() {
        /* Register */
        let storingResourceTypes = [];
        if (this.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY) storingResourceTypes = [RESOURCE_ENERGY];
        else if (this.memory.tag === "forSource") storingResourceTypes = [RESOURCE_ENERGY];
        else if (this.memory.tag === "forMineral") storingResourceTypes = [room.mineral.mineralType];
        else if (this.memory.tag === "labs") storingResourceTypes = Object.keys(REACTION_TIME);
        else console.log(`<p style="display:inline;color:red;">Error:</p> Unable to recognize container ${this} whose tag is ${this.memory.tag}`);
        if (storingResourceTypes.length > 0) {
            for (const storingResourceType of storingResourceTypes) {
                global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, storingResourceType, this.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY? global.Lucy.Rules.arrangements.SPAWN_ONLY : "default", function(container) {
                    return container.store[this.resourceType];
                }));
            }
        }
        /* Register for Storing Additional Resources */
        // NOTICE : `labs` tagged containers are not used for actively storing additional resources. Their input is solely determined by `unboost`.
        // "default" enables containers to be found by searching structures for storing energy.
        if (this.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY) global.ResourceManager.Register(new StoringDescriptor(this, RESOURCE_ENERGY, "default", function (container) {
            return container.store.getFreeCapacity(RESOURCE_ENERGY);
        }));
    }
}
function giveStorageBehaviors() {
    StructureStorage.prototype.register = function() {
        global.ResourceManager.Register(new StoringDescriptor(this, "all", "default", function (storage) {
            return storage.store.getFreeCapacity();
        }));
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, resourceType, "default", function (storage) {
                return storage.store[this.resourceType];
            }));
        }
    }
}
function mount() {
    giveContainerBehaviors();
    giveStorageBehaviors();
    /**
     * @type {import('./manager.resources').ResourceManager}
     */
    const resourceManager = global.ResourceManager;
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (isMyRoom(room)) {
            room.energies.forEach((energy) => {
                resourceManager.Register(new ResourceDescriptor(energy, RESOURCE_POSSESSING_TYPES.PRODUCING, RESOURCE_ENERGY, "default", function(source) {
                    return source.energy;
                }));
            });
            /**
             * NOTICE : Mineral should only be harvested by specific `harvest` task.
             * If other tasks require usage of some mineral, they must wait until some storage/container/terminal/... in room possess them.
             * Thus, there is no need to register mineral into ResourceManager.
             */
            room["containers"].forEach(c => c.register());
            if (room.storage) room.storage.register();
        }
    }
}

module.exports = {
    mount : mount
};