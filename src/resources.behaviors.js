/**
 * @module resources.behaviors
 * 
 * This module defines the basic behaviors for Resources.
 */
const isMyRoom = require('./util').isMyRoom;
const ResourceDescriptor = require('./manager.resources').ResourceDescriptor;
const RESOURCE_POSSESSING_TYPES = require('./manager.resources').RESOURCE_POSSESSING_TYPES;
function giveContainerBehaviors() {
    /**
     * Register is necessary to execute before triggering for potential Resource Register.
     */
    StructureContainer.prototype.register = function() {
        /* Register */
        let storingResourceType = null;
        if (this.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY) storingResourceType = RESOURCE_ENERGY;
        else if (this.memory.tag === "forSource") storingResourceType = RESOURCE_ENERGY;
        else if (this.memory.tag === "forMineral") storingResourceType = room.mineral.mineralType;
        else console.log(`<p style="display:inline;color:red;">Error:</p> Unable to recognize container ${this} whose tag is ${this.memory.tag}`);
        if (storingResourceType) global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, storingResourceType, this.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY? global.Lucy.Rules.arrangements.SPAWN_ONLY : "default", function(container) {
            return container.store[this.resourceType];
        }));
    }
}
function mount() {
    giveContainerBehaviors();
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
            room["containers"].forEach(c => c.register());
        }
    }
}

module.exports = {
    mount : mount
};