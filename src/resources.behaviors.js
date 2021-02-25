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
        // console.log(JSON.stringify(this.memory));
        if (Game.getTagById(this.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY) storingResourceTypes = [RESOURCE_ENERGY];
        else if (Game.getTagById(this.id) === "forSource" || Game.getTagById(this.id) === "remoteSource") storingResourceTypes = [RESOURCE_ENERGY];
        else if (Game.getTagById(this.id) === "forMineral") storingResourceTypes = [this.room.mineral.mineralType];
        else if (Game.getTagById(this.id) === "labs") storingResourceTypes = Object.keys(REACTION_TIME);
        if (storingResourceTypes.length > 0) {
            for (const storingResourceType of storingResourceTypes) {
                global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, storingResourceType, Game.getTagById(this.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY? global.Lucy.Rules.arrangements.SPAWN_ONLY : "default", function(container) {
                    return container.store[this.resourceType];
                }));
            }
        }
        /* Register for Storing Additional Resources */
        // NOTICE : `labs` tagged containers are not used for actively storing additional resources. Their input is solely determined by `unboost`.
        // "default" enables containers to be found by searching structures for storing energy.
        if (Game.getTagById(this.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY) global.ResourceManager.Register(new StoringDescriptor(this, RESOURCE_ENERGY, "default", function (container) {
            return container.store.getFreeCapacity(RESOURCE_ENERGY);
        }));
    }
}
function giveStorageBehaviors() {
    StructureStorage.prototype.register = function() {
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new StoringDescriptor(this, resourceType, "default", function (storage) {
                return storage.store.getFreeCapacity(this.resourceType);
            }));
        }
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, resourceType, "default", function (storage) {
                return storage.store[this.resourceType];
            }));
        }
    };
}
function giveTerminalBehaviors() {
    StructureTerminal.prototype.register = function() {
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new StoringDescriptor(this, resourceType, "default", function (terminal) {
                return terminal.store.getFreeCapacity(this.resourceType);
            }));
        }
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, resourceType, "default", function (terminal) {
                return terminal.store[this.resourceType];
            }));
        }
        /** Register */
        global.TerminalManager.Register(this);
    };
}
function giveLinkBehaviors() {
    StructureLink.prototype.register = function() {
        if (Game.getTagById(this.id) === global.Lucy.Rules.arrangements.UPGRADE_ONLY) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, RESOURCE_ENERGY, Lucy.Rules.arrangements.UPGRADE_ONLY, function (link) {
                return link.store[RESOURCE_ENERGY];
            }));
        }
        global.LinkManager.Register(this);
    };
}
function giveSourceBehaviors() {
    Source.prototype.register = function() {
        global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.PRODUCING, RESOURCE_ENERGY, "default", function(source) {
            // const vacantSpace = global.MapMonitorManager.FetchVacantSpaceCnt(source.pos.roomName, Math.max(source.pos.y - 1, 1), Math.max(source.pos.x - 1, 1), Math.min(source.pos.y + 1, 48), Math.min(source.pos.x + 1, 48)) - 1;
            return source.energy;
        }));
    };
}
function giveLabBehaviors() {
    StructureLab.prototype.register = function() {
        /** @type {Array<MineralCompoundConstant | MineralConstant>} */
        const mineralTypes = [].concat(Object.keys(REACTION_TIME), Object.keys(MINERAL_MIN_AMOUNT));
        for (const mineralType of mineralTypes) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, mineralType, "labs", function(lab) {
                if (lab.mineralType === this.resourceType) return lab.store[this.resourceType];
                else return 0;
            }));
        }
    };
}
function giveFactoryBehaviors() {
    StructureFactory.prototype.register = function() {
        global.FactoryManager.Register(this);
        for (const resourceType of RESOURCES_ALL) {
            global.ResourceManager.Register(new ResourceDescriptor(this, RESOURCE_POSSESSING_TYPES.STORING, resourceType, "default", function(factory) {
                return factory.store[this.resourceType];
            }));
        }
    }
}
function mount() {
    giveContainerBehaviors();
    giveStorageBehaviors();
    giveLinkBehaviors();
    giveSourceBehaviors();
    giveTerminalBehaviors();
    giveLabBehaviors();
    giveFactoryBehaviors();
}
global.Lucy.App.mount(mount);
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const RoomResetTriggerPlugin = {
    reset : () => {
        for (const roomName in Game.rooms) {
            const room = Game.rooms[roomName];
            if (isMyRoom(room)) {
                room.sources.forEach(source => source.register());
                /**
                 * NOTICE : Mineral should only be harvested by specific `harvest` task.
                 * If other tasks require usage of some mineral, they must wait until some storage/container/terminal/... in room possess them.
                 * Thus, there is no need to register mineral into ResourceManager.
                 */
                room["containers"].forEach(c => c.register());
                if (room.storage) room.storage.register();
                if (room.terminal) room.terminal.register();
                if (room.factory) room.factory.register();
                room["links"].forEach(l => l.register());
                room["labs"].forEach(l => l.register());
                /** Register into LabManager should be put after registering labs into ResourceManager */
                if (room["labs"].length > 0) global.LabManager.Update(room.name);
            } else {
                if (Game.rooms[roomName].isResponsible) room.NeutralRegister();
            }
        }
    }
};
global.Lucy.App.on(RoomResetTriggerPlugin);