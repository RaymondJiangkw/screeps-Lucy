/**
 * @module structures.behaviors
 * 
 * This module defines the most basic behaviors for Structures.
 */
const isMyRoom                      =   require('./util').isMyRoom;
const evaluateCost                  =   require('./util').evaluateCost;
const getPrice                      =   require('./util').getPrice;
const checkForStore                 =   require('./util').checkForStore;
const isHarvestable                 =   require('./util').isHarvestable;
const isSource                      =   require('./util').isSource;
const isMineral                     =   require('./util').isMineral;
const evaluateAbility               =   require('./util').evaluateAbility;
const evaluateSource                =   require('./util').evaluateSource;
const calcInRoomDistance            =   require('./util').calcInRoomDistance;
const getCacheExpiration            =   require('./util').getCacheExpiration;
const bodyPartDetermination         =   require('./util').bodyPartDetermination;
const constructRoomPosition         =   require('./util').constructRoomPosition;
const Task                          =   require('./task.prototype').Task;
const TaskDescriptor                =   require('./task.prototype').TaskDescriptor;
const Transaction                   =   require('./money.prototype').Transaction;
const TaskConstructor               =   require('./manager.tasks').TaskConstructor;
const Project                       =   require('./task.modules').Project;
const Constructors                  =   require('./task.modules').Constructors;
const Builders                      =   require('./task.modules').Builders;
function giveSpawnBehaviors() {
    const nextFillingTIMEOUT = 10;
    const nextFillingOFFSET  = 5;
    const FILLING_ENERGY = "fillingEnergy";
    const FILLING_FAR_AWAY_ENERGY = "fillingFarAwayEnergy";
    /**
     * General Triggering
     */
    Spawn.prototype.trigger = function() {
        this.triggerFillingEnergy();
    };
    /**
     * NOTICE : There is need to allow duplicate tasks in the same Spawn or among different spawns in the same room.
     * But checking for task completion is necessary for every tick.
     */
    Spawn.prototype.triggerFillingEnergy = function() {
        const lackingEnergy = this.room.energyCapacityAvailable - this.room.energyAvailable;
        // Seemingly Useless Check here, but it provides some flexibility.
        if (!lackingEnergy) return;
        // NOTICE : Since we allow for duplicate filling tasks, there could be cases of energy re-requesting, leading for
        // actually more energy available than theoretical one. However, since as soon as the task is done, the transaction
        // is Done. (There could be some problems with calculating exactly how much money should be paid, but since they
        // are minor, and supposed not to affect the general economy, it's ok to assume there is no such 'pre-Done'.) 
        // The effect of preoccupation is automatically over, and further checking will find those "lost" resources.
        /**
         * Task 1
         * Special Speed-Up Filling for near-spawn structures.
         */
        const issueNearSpawnEnergyFilling = function() {
            const nearSpawnExtensions = _.filter(this.room.extensions, e => Game.getTagById(e.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY);
            const nearSpawnLackingEnergy = _.sum(nearSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY))) + _.sum(this.room.spawns.map(s => s.store.getCapacity(RESOURCE_ENERGY) - s.store.getUsedCapacity(RESOURCE_ENERGY)));
            if (!nearSpawnLackingEnergy) return;
            /* Query `resource` in order to decide which task to issue */
            let isResourceSpawnOnly = true;
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {key : Lucy.Rules.arrangements.SPAWN_ONLY, type : "retrieve", excludeDefault : true, confinedInRoom : true, allowToHarvest : false});
            if (!resource) isResourceSpawnOnly = false;
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {type : "retrieve", allowToHarvest : false, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            /**
             * If there is no resources available, the refilling will be postponed.
             */
            if (!resource) {
                Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), issueNearSpawnEnergyFilling, this.id, [], `Filling Energies for near-spawn Structures of Room ${this.room.name}`);
                console.log(`<p style="color:red;display:inline;">Error:</p> Fail to propose "Energy Filling for near-spawn Structures" task in ${this.room.name}.`);
                return;
            }
            if (!isResourceSpawnOnly) {
                if (global.TaskManager.Fetch(this.id, FILLING_ENERGY).length > 0) return;
                const amount = Math.min(checkForStore(resource, RESOURCE_ENERGY), nearSpawnLackingEnergy);
                /**
                 * @type {import("./money.prototype").Transaction}
                 */
                const transaction = new Transaction(this, resource, getPrice("energy") * amount, {type : "resource", info : {resourceType : RESOURCE_ENERGY, amount : amount}});
                transaction.Confirm();
                /** Determine BodyParts */
                let bodyParts = null;
                if (isHarvestable(resource)) {
                    /** Pseudo-Energy-Consumption 5 is set. */
                    bodyParts = bodyPartDetermination({type : "exhuastEnergy", availableEnergy : amount, energyConsumptionPerUnitPerTick : 5});
                } else bodyParts = bodyPartDetermination({type : "transfer", transferAmount : nearSpawnLackingEnergy});
                new Task(`[${this.room.name}:nearSpawnEnergyFilling]`, this.pos.roomName, this, new TaskDescriptor(Lucy.Rules.arrangements.SPAWN_ONLY, {
                    worker : {
                        minimumNumber : 1,
                        maximumNumber : Infinity,
                        estimateProfitPerTurn :
                            function (object) {
                                if (this.EmployeeAmount === 0) return 2 * getPrice("energy") * object.store.getCapacity();
                                else return -Infinity;
                            },
                        estimateWorkingTicks:
                            typeof bodyParts[WORK] === "number" ? ((object) => object.store.getCapacity() / (2 * evaluateAbility(object, "harvest"))) : ((object) => 1),
                        /**
                         * In this case, CARRY should be as many as possible in order to speed up filling.
                         * However, WORK should account for some proportion in case that contained energy is not sufficient.
                         */
                        bodyMinimumRequirements : bodyParts,
                        groupTag : "spawnPatch",
                        tag : isHarvestable(resource) ? `${5}-worker` : `transferer`,
                        mode : "shrinkToEnergyAvailable",
                        allowEmptyTag : true,
                        allowOtherTags : isHarvestable(resource) ? [`${1}-worker`] : undefined
                    }
                }, {taskKey : FILLING_ENERGY}), {
                    selfCheck : function() {
                        const _selfCheck = function() {
                            if (!this.mountObj || !Game.getObjectById(this.taskData.targetId)) return "dead";
                            const nearSpawnExtensions = _.filter(this.mountObj.room.extensions, e => e && Game.getTagById(e.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY);
                            const nearSpawnLackingEnergy = _.sum(nearSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY))) + _.sum(this.mountObj.room.spawns.map(s => s.store.getCapacity(RESOURCE_ENERGY) - s.store.getUsedCapacity(RESOURCE_ENERGY)));
                            /* Assume Resources are exhausted while the task is not completed. */
                            if (nearSpawnLackingEnergy > 0 && checkForStore(Game.getObjectById(this.taskData.targetId), RESOURCE_ENERGY) === 0) {
                                /* Schedule Postponed Task */
                                Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), issueNearSpawnEnergyFilling, this.mountObj.id, [], `Filling Energies for near-spawn Structures of Room ${this.mountObj.room.name}`);
                                console.log(`<p style="color:red;display:inline;">Error:</p> Fail to continue "Energy Filling for near-spawn Structures" task in ${this.mountObj.room.name} because of shortage of energy in ${Game.getObjectById(this.taskData.targetId)}.`);
                                return "dead";
                            }
                            if (nearSpawnLackingEnergy > 0) return "working";
                            else return "dead";
                        }.bind(this);
                        const ret = _selfCheck();
                        if (ret === "dead") this.taskData.transaction.Done();
                        return ret;
                    },
                    run : function() {
                        /**
                         * @TODO
                         * The first step should be putting down irrelevant resources carried in creeps.
                         */
                        /**
                         * @type {Array<Creep>}
                         */
                        const workers = this.FetchEmployees("worker");
                        /**
                         * @type {Source | AnyStoreStructure}
                         */
                        const source = Game.getObjectById(this.taskData.targetId);
                        /**
                         * @type {Array<Spawn | StructureExtension>}
                         */
                        const targetStructures = this.taskData.structureIds.map(Game.getObjectById);
                        const lackingEnergy = _.sum(targetStructures.map(s => s.store.getFreeCapacity(RESOURCE_ENERGY)));
                        const firedCreeps = [];
                        workers.forEach((creep) => {
                            if (!creep.memory.flags) creep.memory.flags = {};
                            /* Working State Update */
                            if (creep.memory.flags.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                                firedCreeps.push(creep);
                                return;
                            }
                            if (!creep.memory.flags.working && (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || creep.store[RESOURCE_ENERGY] >= lackingEnergy)) creep.memory.flags.working = true;
                            /* Working Body */
                            if (!creep.memory.flags.working) {
                                if (isHarvestable(source) && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                                else if (creep.withdraw(source, RESOURCE_ENERGY, Math.min(creep.store.getFreeCapacity(), lackingEnergy)) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                                return;
                            }
                            if (creep.memory.flags.working) {
                                /* Update Filling Target */
                                if (creep.memory.flags.target === undefined || !targetStructures[creep.memory.flags.target] || targetStructures[creep.memory.flags.target].store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                                    creep.memory.flags.target = null;
                                    for (let i = 0; i < targetStructures.length; ++i) {
                                        if (targetStructures[i].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
                                        // NOTICE : The closest one will be choosed. getRangeTo performs better than calcInRoomDistance.
                                        if (!creep.memory.flags.target || (creep.memory.flags.target && creep.pos.getRangeTo(targetStructures[creep.memory.flags.target].pos) > creep.pos.getRangeTo(targetStructures[i].pos))) {
                                            creep.memory.flags.target = i;
                                            continue;
                                        }
                                    }
                                }
                                /* If there isn't any structure to be filled, the creep is fired. */
                                if (creep.memory.flags.target === null || creep.memory.flags.target === undefined) {
                                    firedCreeps.push(creep);
                                    return;
                                }
                                if (creep.transfer(targetStructures[creep.memory.flags.target], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.travelTo(targetStructures[creep.memory.flags.target]);
                            }
                        });
                        return firedCreeps;
                    }
                }, {targetId : resource.id, structureIds : nearSpawnExtensions.concat(this.room.spawns).map(s => s.id), transaction : transaction});
            } else {
                // Unit Center Tasks Control
                this.room.centralSpawn.SetSignal("all", "extensions", true);
            }
        }.bind(this);
        /**
         * Task 2
         * General Filling, which will fill those near spawns, but at lower priorities.
         */
        const issueFarFromSpawnEnergyFilling = function() {
            if (global.TaskManager.Fetch(this.id, FILLING_FAR_AWAY_ENERGY).length > 0) return;
            let includeTransferExtension = false;
            if (this.room.centralTransfer && this.room.centralTransfer.Extension && this.room.centralTransfer.Extension.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
                if (!this.room.centralTransfer.GetFetchStructure(RESOURCE_ENERGY)) includeTransferExtension = true;
                else this.room.centralTransfer.PushOrder({from : "any", to : STRUCTURE_EXTENSION, resourceType : RESOURCE_ENERGY, amount : this.room.centralTransfer.Extension.store.getFreeCapacity(RESOURCE_ENERGY)});
            }
            const farFromSpawnExtensions = _.filter(this.room.extensions, e => Game.getTagById(e.id) !== global.Lucy.Rules.arrangements.SPAWN_ONLY && (Game.getTagById(e.id) !== global.Lucy.Rules.arrangements.TRANSFER_ONLY || (Game.getTagById(e.id) === global.Lucy.Rules.arrangements.TRANSFER_ONLY && includeTransferExtension)));
            const farFromSpawnExtensionsLackingEnergy = _.sum(farFromSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY)));
            if (!farFromSpawnExtensionsLackingEnergy) return;
            /**
             * @type { import('./task.prototype').GameObject | null }
             */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {key : Lucy.Rules.arrangements.SPAWN_ONLY, type : "retrieve", excludeDefault : true, confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {type : "retrieve", allowToHarvest : false, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            /**
             * If there is no resources available, the refilling will be postponed.
             */
            if (!resource) {
                Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), issueFarFromSpawnEnergyFilling, this.id, [], "Filling Energies for far-from-spawn Structures");
                console.log(`<p style="color:red;display:inline;">Error:</p> Fail to propose "Energy Filling for far-from-spawn Structures" task in ${this.room.name}.`);
                return;
            }
            const amount = Math.min(checkForStore(resource, RESOURCE_ENERGY), lackingEnergy);
            /**
             * @type {Transaction}
             */
            const transaction = new Transaction(this, resource, getPrice("energy") * amount, {type : "resource", info : {resourceType : RESOURCE_ENERGY, amount : amount}});
            transaction.Confirm();
            /** Determine BodyParts */
            let bodyParts = null;
            if (isHarvestable(resource)) {
                /** Pseudo-Energy-Consumption 5 is set. */
                bodyParts = bodyPartDetermination({type : "exhuastEnergy", availableEnergy : amount, energyConsumptionPerUnitPerTick : 5});
            } else bodyParts = bodyPartDetermination({type : "transfer", transferAmount : farFromSpawnExtensionsLackingEnergy});
            new Task(`[${this.room.name}:farFromSpawnEnergyFilling]`, this.pos.roomName, this, new TaskDescriptor(Lucy.Rules.arrangements.SPAWN_ONLY, {
                worker : {
                    minimumNumber : 1,
                    maximumNumber : 1,
                    estimateProfitPerTurn :
                        function (object) {
                            if (this.EmployeeAmount === 0) return 2 * getPrice("energy") * object.store.getCapacity();
                            else return -Infinity;
                        },
                    estimateWorkingTicks:
                        typeof bodyParts[WORK] === "number" ? ((object) => object.store.getCapacity() / (2 * evaluateAbility(object, "harvest"))) : ((object) => 1),
                    /**
                     * In this case, CARRY should be as many as possible in order to speed up filling.
                     * However, WORK should account for some proportion in case that contained energy is not sufficient.
                     */
                    bodyMinimumRequirements : bodyParts,
                    groupTag : "spawnPatch",
                    tag : isHarvestable(resource) ? `${5}-worker` : `transferer`,
                    mode : "shrinkToEnergyAvailable",
                    allowEmptyTag : true,
                    allowOtherTags : isHarvestable(resource) ? [`${1}-worker`] : undefined
                }
            }, {taskKey : FILLING_FAR_AWAY_ENERGY}), {
                selfCheck : function() {
                    const _selfCheck = function() {
                        if (!this.mountObj || !Game.getObjectById(this.taskData.targetId)) return "dead";
                        const farFromSpawnExtensions = _.filter(this.mountObj.room.extensions, e => e && Game.getTagById(e.id) !== global.Lucy.Rules.arrangements.SPAWN_ONLY && (Game.getTagById(e.id) !== global.Lucy.Rules.arrangements.TRANSFER_ONLY || (Game.getTagById(e.id) === global.Lucy.Rules.arrangements.TRANSFER_ONLY && this.taskData.includeTransferExtension)));
                        const farFromSpawnExtensionsLackingEnergy = _.sum(farFromSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY)));
                        if (farFromSpawnExtensionsLackingEnergy > 0 && checkForStore(Game.getObjectById(this.taskData.targetId), RESOURCE_ENERGY) === 0) {
                            Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), issueFarFromSpawnEnergyFilling, this.mountObj.id, [], "Filling Energies for far-from-spawn Structures");
                            console.log(`<p style="color:red;display:inline;">Error:</p> Fail to propose "Energy Filling for far-from-spawn Structures" task in ${this.mountObj.room.name} because of shortage of energy in ${Game.getObjectById(this.taskData.targetId)}.`);
                            return "dead";
                        }
                        if (farFromSpawnExtensionsLackingEnergy > 0) return "working";
                        else return "dead";
                    }.bind(this);
                    const ret = _selfCheck();
                    if (ret === "dead") this.taskData.transaction.Done();
                    return ret;
                },
                run : function() {
                    /**
                     * @TODO
                     * The first step should be putting down irrelevant resources carried in creeps.
                     */
                    /**
                     * @type {Array<Creep>}
                     */
                    const workers = this.FetchEmployees("worker");
                    /**
                     * @type {Source | AnyStoreStructure}
                     */
                    const source = Game.getObjectById(this.taskData.targetId);
                    /**
                     * @type {Array<Spawn | StructureExtension>}
                     */
                    const targetStructures = this.taskData.structureIds.map(Game.getObjectById);
                    const lackingEnergy = _.sum(targetStructures.map(s => s.store.getFreeCapacity(RESOURCE_ENERGY)));
                    const firedCreeps = [];
                    workers.forEach((creep) => {
                        if (!creep.memory.flags) creep.memory.flags = {};
                        /* Working State Update */
                        if (creep.memory.flags.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                            firedCreeps.push(creep);
                            return;
                        }
                        if (!creep.memory.flags.working && (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || creep.store[RESOURCE_ENERGY] >= lackingEnergy)) creep.memory.flags.working = true;
                        /* Working Body */
                        if (!creep.memory.flags.working) {
                            if (isHarvestable(source) && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                            else if (creep.withdraw(source, RESOURCE_ENERGY, Math.min(creep.store.getFreeCapacity(), lackingEnergy)) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                            return;
                        }
                        if (creep.memory.flags.working) {
                            /* Update Filling Target */
                            if (creep.memory.flags.target === undefined || !targetStructures[creep.memory.flags.target] || targetStructures[creep.memory.flags.target].store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                                creep.memory.flags.target = null;
                                for (let i = 0; i < targetStructures.length; ++i) {
                                    if (targetStructures[i].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
                                    // NOTICE : The closest one will be choosed. getRangeTo performs better than calcInRoomDistance.
                                    if (!creep.memory.flags.target || (creep.memory.flags.target && creep.pos.getRangeTo(targetStructures[creep.memory.flags.target].pos) > creep.pos.getRangeTo(targetStructures[i].pos))) {
                                        creep.memory.flags.target = i;
                                        continue;
                                    }
                                }
                            }
                            /* If there isn't any structure to be filled, the creep is fired. */
                            if (creep.memory.flags.target === null || creep.memory.flags.target === undefined) {
                                firedCreeps.push(creep);
                                return;
                            }
                            if (creep.transfer(targetStructures[creep.memory.flags.target], RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.travelTo(targetStructures[creep.memory.flags.target]);
                        }
                    });
                    return firedCreeps;
                }
            }, {targetId : resource.id, structureIds : farFromSpawnExtensions.map(e => e.id), transaction : transaction, includeTransferExtension : includeTransferExtension});
        }.bind(this);
        issueNearSpawnEnergyFilling();
        issueFarFromSpawnEnergyFilling();
    };
    const spawnCreep = Spawn.prototype.spawnCreep;
    /**
     * NOTICE : `Extensions` are grouped into two parts : "near-to-spawns" and "far-away-from-spawns".
     * And those "near-to-spawns" are consumed first.
     */
    Spawn.prototype.spawnCreep = function(body, name, opts) {
        opts = opts || {};
        opts.energyStructures = []
            .concat(this.room.spawns)
            .concat(
                this.room.extensions
                    .sort((a, b) => (Game.getTagById(a.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY ? 0 : 1) - (Game.getTagById(b.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY ? 0 : 1))
            );
        
        const ret = spawnCreep.call(this, body, name, opts);
        /**
         * Energy Filling should include "close" storing structure filling and "distant" storing structure filling.
         * The Filling strategy should differ.
         * They are incorporated into `Spawn.prototype.triggerFillingEnergy`
         */
        if (ret === OK || ret === ERR_NOT_ENOUGH_ENERGY) {
            // Postpone Checking into next tick.
            Lucy.Timer.add(Game.time + 1, this.triggerFillingEnergy, this.id, [], "Filling Energies into Spawn and Extension");
        }
        return ret;
    };
    const renewCreep = Spawn.prototype.renewCreep;
    Spawn.prototype.renewCreep = function(target) {
        const ret = renewCreep.call(this, target);
        if (ret === OK || ret === ERR_NOT_ENOUGH_ENERGY) {
            // Postpone Checking into next tick.
            Lucy.Timer.add(Game.time + 1, this.triggerFillingEnergy, this.id, [], "Filling Energies into Spawn and Extension");
        }
        return ret;
    }
}
function giveExtensionBehaviors() {

}
function giveControllerBehaviors() {
    const NEXT_UPGRADE_TIMEOUT    = 10;
    const NEXT_UPGRADE_OFFSET     = 5;
    const maximumLevel          = 8;
    const upgradePeriodTicks    = CREEP_LIFE_TIME;
    const satisfiedDownGradeGap = CREEP_LIFE_TIME;
    /**
     * Resource used to upgrade Controller is requested in-time.
     * Upgrade-Controller task thus seems to be eternal. However, due to the changing condition and possible situations in which Upgrade-Controller
     * should be checked, Upgrade-Controller is deleted periodically, and re-triggered in the next tick.
     */
    StructureController.prototype.triggerUpgrading = function() {
        /**
         * Decide whether needs to upgrade Controller is done in `selfCheck` because of automatic downgrading.
         */
        if (this.level === maximumLevel && this.ticksToDowngrade > CREEP_LIFE_TIME * 5) {
            /* Because of the threat of downgrading, still, there should arrange scheduled recheck task */
            const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(this.ticksToDowngrade - 5 * CREEP_LIFE_TIME, NEXT_UPGRADE_TIMEOUT), NEXT_UPGRADE_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerUpgrading, this.id, [], `Upgrading Controller of Room ${this.room.name} because of completion`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function (amount) {
            /**
             * Since Link receives energy whenever it is exhausted, thus, even when energy in link is not enough for a creep, it is still worth being withdrawn first.
             */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", key : Lucy.Rules.arrangements.UPGRADE_ONLY, allowToHarvest : false, confinedInRoom : true, ensureAmount : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            return resource;
        }.bind(this);
        if (!requestResource(1)) {
            const nextTaskStartedTick = Game.time + getCacheExpiration( NEXT_UPGRADE_TIMEOUT, NEXT_UPGRADE_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerUpgrading, this.id, [], `Upgrading Controller of Room ${this.room.name} because of shortage of energy`);
            return;
        }
        /**
         * @param {number} amount
         * @param {ResourceConstant} resourceType
         */
        const requestStoreResources = function(amount, resourceType) {
            return global.ResourceManager.Query(this, resourceType, amount, {type : "store"});
        }.bind(this);
        /* Use Data to Determine Body */
        const energyConsumptionPerUnitPerTick = 1;
        new Task(`[${this.room.name}:ControllerUpgrade]`, this.pos.roomName, this, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1, // Infinity is not suitable here. Given that `repair` creeps can take this task too, when all `repair` creeps are taking this task and another `repair` task issued, spawn needs to spawn another creep to fill in the gap, leading to over-spawning.
                estimateProfitPerTurn :
                    function (object) {
                        /* At least one creep should upgrade Controller in order to avoid downgrading. */
                        if (this.EmployeeAmount === 0) return Infinity;
                        else return -Infinity;
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / (evaluateAbility(object, "upgradeController")),
                expandFunction : (room) => bodyPartDetermination({type : "exhuastEnergy", availableEnergy : global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : Lucy.Rules.arrangements.UPGRADE_ONLY}), energyConsumptionPerUnitPerTick : 1, sustainTick : global.MapMonitorManager.FetchStructureWithTag(room.name, "forController", STRUCTURE_LINK).length > 0 ? 1 : undefined}),
                tag : `upgrader`, // Considering the existence of link, the setup for `upgrader` is slightly different from `1-worker`.
                allowEmptyTag : true,
                mode : "expand",
                workingPos : this.pos,
                confinedInRoom : false
            }
        }), {
            selfCheck : function() {
                /* Periodically Drop out */
                if (Game.time > this.taskData.startedTick + this.taskData.lastingTicks) {
                    Lucy.Timer.add(Game.time + 1, this.mountObj.triggerUpgrading, this.mountObj.id, [], `Upgrading Controller of Room ${this.mountObj.room.name} because of periodically dropping`);
                    return "dead";
                }
                /* Lacking Resources */
                // @TODO
                /* Achieve Desired Goal */
                if (this.mountObj.level === maximumLevel && CONTROLLER_DOWNGRADE[maximumLevel] - this.mountObj.ticksToDowngrade <= satisfiedDownGradeGap) {
                    /* Because of the threat of downgrading, still, there should arrange scheduled recheck task */
                    const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(this.mountObj.ticksToDowngrade - 5 * CREEP_LIFE_TIME, NEXT_UPGRADE_TIMEOUT), NEXT_UPGRADE_OFFSET);
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerUpgrading, this.mountObj.id, [], `Upgrading Controller of Room ${this.mountObj.room.name} because of completion`);
                    return "dead";
                }
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.upgradeController)
        }, {requestResource : requestResource, startedTick : Game.time, lastingTicks : upgradePeriodTicks});
    }
}
function giveConstructionSiteBehaviors() {
    ConstructionSite.prototype.triggerBuilding = function() {
        /* As long as the constructionSite exists, the building is needed. */
        TaskConstructor.BuildTask(this.id, this.pos);
    };
}
function giveRoadBehaviors() {
    StructureRoad.prototype.trigger = function() {
        this.triggerRepairing();
    };
    StructureRoad.prototype.triggerRepairing = function() {
        const allowableHitsDiff = this.hitsMax * (isMyRoom(this.room)? 0.3 : 0.45);
        const randomAllowableHitsDiff = (Math.random() + 1) * allowableHitsDiff;
        /**
         * Postpone Checking
         * In order to reduce the frequency of repairing, REPAIR employees the divergence-between-threshold-and-target policy. 
         */
        if (this.hitsMax - this.hits < randomAllowableHitsDiff) {
            Lucy.Timer.add(Game.time + Math.max(Math.floor((randomAllowableHitsDiff - this.hitsMax + this.hits) / this.hitsMax * 500), getCacheExpiration(this.ticksToDecay, Math.floor(this.ticksToDecay / 10))), TaskConstructor.RepairTask, TaskConstructor, [this.id, this.pos], `Repair ${this} of Room ${this.room.name}`);
            return;
        }
        TaskConstructor.RepairTask(this.id, this.pos);
    }
}
function giveContainerBehaviors() {
    StructureContainer.prototype.trigger = function() {
        this.triggerRepairing();
        this.triggerHarvesting();
        this.triggerFillingEnergy();
    };
    StructureContainer.prototype.triggerRepairing = function() {
        const allowableHitsDiff = this.hitsMax * (isMyRoom(this.room)? 0.3 : 0.45);
        const randomAllowableHitsDiff = (Math.random() + 1) * allowableHitsDiff;
        /**
         * Postpone Checking
         * In order to reduce the frequency of repairing, REPAIR employees the divergence-between-threshold-and-target policy. 
         */
        if (this.hitsMax - this.hits <= randomAllowableHitsDiff) {
            Lucy.Timer.add(Game.time + Math.max(Math.floor((randomAllowableHitsDiff - this.hitsMax + this.hits) / this.hitsMax * (isMyRoom(this.room)? 250 : 50)), getCacheExpiration(this.ticksToDecay, Math.floor(this.ticksToDecay / 10))), TaskConstructor.RepairTask, TaskConstructor, [this.id, this.pos], `Repair ${this} of Room ${this.room.name}`);
            return;
        }
        TaskConstructor.RepairTask(this.id, this.pos);
    };
    /**
     * @memberof StructureContainer
     * @function
     */
    StructureContainer.prototype.triggerHarvesting = function() {
        /** @type {import("./task.prototype").GameObject} */
        let target = null;
        if (Game.getTagById(this.id) === "forSource" || Game.getTagById(this.id) === "remoteSource") {
            target = this.room.sources.filter(e => e.pos.getRangeTo(this.pos) === 1)[0] || null;
        } else if (Game.getTagById(this.id) === "forMineral") {
            if (!this.room[STRUCTURE_EXTRACTOR]) return;
            target = this.room.mineral;
        } else return;
        if (!target) {
            console.log(`<p style="display:inline;color:red;">Error:</p> Can't find matched target for container ${this} whose tag is ${Game.getTagById(this.id)}`);
            return;
        }
        if (Game.getTagById(this.id) !== "remoteSource" && Game.getTagById(this.id) !== "remoteMineral") {
            /**
             * For Mineral, maximum WORK part is hard-coded into 5, which is usually enough.
             * For Source, it is important to ensure Source is exhausted in 300 ticks so as to achieve maximum efficiency.
             * However, since energy is most fundamental resource to operate the whole empire, "weak" creep is allowed to spawn, when
             * availableEnergy is not enough to support "full" version.
             */
            const workBodyParts = isMineral(target) ? 5 : (evaluateSource(target) / 300 / 2);
            /* No Transaction should be dealt here */
            new Task(`[${this.room.name}:${Game.getTagById(this.id)}Harvest]`, this.room.name, target, new TaskDescriptor("default", {
                worker : {
                    minimumNumber : 1,
                    maximumNumber : 1,
                    estimateWorkingTicks : (object) => object.ticksToLive,
                    estimateProfitPerTurn : (object) => evaluateAbility(object, "harvest") * getPrice(target.mineralType || RESOURCE_ENERGY),
                    tag : `harvester-${target.id}`,
                    bodyMinimumRequirements : {
                        [WORK] : workBodyParts,
                        [CARRY] : 1,
                        [MOVE] : Math.min(Math.floor((workBodyParts + 1) / 2), 50 - workBodyParts - 1)
                    },
                    mode : "shrinkToEnergyAvailable",
                    workingPos : this.pos
                }
            }), {
                selfCheck : function() {
                    /** @type {StructureContainer} */
                    const container = Game.getObjectById(this.taskData.containerId);
                    if (!container) return "dead";
                    /**
                     * For Sources, since its regeneration is relatively quick.
                     * It is plausible to keep task run.
                     */
                    /** @type {Source} */
                    /*const source = this.mountObj;
                    if (isSource(source)) {
                        if (source.energy === 0) {
                            Lucy.Timer.add(Game.time + source.ticksToRegeneration, container.triggerHarvesting, container.id, [], `Harvesting in room ${source.room.name} for ${source}`);
                            console.log(`<p style="color:gray;display:inline;">[Log]</p> "Harvest ${source}" task in ${source.room.name} finished. New one is scheduled at ${Game.time + source.ticksToRegeneration}.`);
                            return "dead";
                        }
                    }*/
                    /** @type {Mineral} */
                    const mineral = this.mountObj;
                    if (isMineral(mineral)) {
                        if (mineral.mineralAmount === 0) {
                            Lucy.Timer.add(Game.time + mineral.ticksToRegeneration, container.triggerHarvesting, container.id, [], `Harvesting in room ${mineral.room.name} for ${mineral}`);
                            console.log(`<p style="color:gray;display:inline;">[Log]</p> "Harvest ${mineral}" task in ${mineral.room.name} finished. New one is scheduled at ${Game.time + mineral.ticksToRegeneration}.`);
                            return "dead";
                        }
                    }
                    return "working";
                },
                run : // Because of StructureLink, function is used here.
                    function() {
                        /** @type {Creep} */
                        const worker = this.FetchEmployees("worker")[0];
                        if (!worker) return [];
                        /** @type {StructureContainer} */
                        const container = Game.getObjectById(this.taskData.containerId);
                        /** @type {Source | Mineral} */
                        const target = Game.getObjectById(this.taskData.targetId);
                        /** @type {StructureLink | null} */
                        const link = this.taskData.tag === "forSource" ? global.MapMonitorManager.FetchStructureWithTag(container.pos.roomName, "forSource", STRUCTURE_LINK).filter(l => l.pos.getRangeTo(container) === 1)[0] || null : null;
                        if (worker.pos.getRangeTo(container) !== 0) worker.travelTo(container);
                        if (link && worker.store.getFreeCapacity() === 0 && link.store.getFreeCapacity(RESOURCE_ENERGY) > 0) worker.transfer(link, RESOURCE_ENERGY);
                        if (container.store.getFreeCapacity(RESOURCE_ENERGY) > 0 || worker.store.getFreeCapacity(RESOURCE_ENERGY) > 0) worker.harvest(target);
                        return [];
                    }
            }, { containerId : this.id, targetId : target.id, tag : Game.getTagById(this.id) });
        } else if (Game.getTagById(this.id) === "remoteSource") {
            /**
             * The Reason for using `wrapper` is that visibility could be lost.
             * @param {Id<StructureContainer>} containerId
             * @param {RoomPosition} containerPos
             * @param {Id<Source>} targetId
             * @param {RoomPosition} targetPos
             * @param {string} fromRoomName
             */
            const wrapper = function(containerId, containerPos, targetId, targetPos, fromRoomName) {
                if (global.TaskManager.Fetch(containerId, `HARVEST_${targetId}`).length > 0) return;
                // Ensure it is necessary to conduct remote mining
                const storage = Game.rooms[fromRoomName].storage;
                if (!storage || storage.store.getUsedCapacity(RESOURCE_ENERGY) / storage.store.getCapacity() >= global.Lucy.Rules.storage[RESOURCE_ENERGY] * 0.8 || storage.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"] * 1.25) {
                    global.Lucy.Timer.add(Game.time + getCacheExpiration(500, 50), wrapper, wrapper, [containerId, containerPos, targetId, targetPos, fromRoomName], `Remote Mining Energy for ${fromRoomName}`);
                    return;
                }
                new Task(`[${containerPos.roomName}:${Game.getTagById(containerId)}Harvest]`, containerPos.roomName, {id : containerId, pos : containerPos}, new TaskDescriptor("default", {
                    harvester : {
                        minimumNumber : 1,
                        maximumNumber : 1,
                        estimateWorkingTicks : (object) => object.ticksToLive,
                        estimateProfitPerTurn : (object) => evaluateAbility(object, "harvest") * getPrice("energy"),
                        tag : `harvester-${targetId}`,
                        bodyMinimumRequirements : {
                            [WORK] : 10,
                            [CARRY] : 2,
                            [MOVE] : 6
                        },
                        mode : "static",
                        workingPos : containerPos,
                        confinedInRoom : false
                    },
                    transferer : {
                        minimumNumber : 1,
                        maximumNumber : 1,
                        estimateWorkingTicks : () => 1,
                        estimateProfitPerTurn : (object) => object.store.getCapacity(RESOURCE_ENERGY) * getPrice("energy"),
                        tag : `remoteTransferer-${targetId}`, // Specific instead of General Tag here to simplify problem
                        groupTag : `remoteTransferPatch`,
                        confinedInRoom : false,
                        mode : "shrinkToEnergyAvailable",
                        bodyMinimumRequirements : bodyPartDetermination({type : "transfer", transferAmount : CONTAINER_CAPACITY / 2}),
                        workingPos : containerPos
                    }
                }, {taskKey : `HARVEST_${targetId}`}), {
                    selfCheck : function() {
                        /** @type {Id<StructureContainer>} */
                        const containerId = this.taskData.containerId;
                        /** @type {RoomPosition} */
                        const containerPos = this.taskData.containerPos;
                        if (Game.rooms[containerPos.roomName] && !Game.getObjectById(containerId)) return "dead";
                        /** @type {string} */
                        const fromRoomName = this.taskData.fromRoomName;
                        const storage = Game.rooms[fromRoomName].storage;
                        if (!storage || storage.store.getUsedCapacity(RESOURCE_ENERGY) / storage.store.getCapacity() >= global.Lucy.Rules.storage[RESOURCE_ENERGY] || storage.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"]) {
                            global.Lucy.Timer.add(Game.time + getCacheExpiration(500, 50), this.taskData.wrapper, this.taskData.wrapper, [containerId, containerPos, targetId, targetPos, fromRoomName], `Remote Mining Energy for ${fromRoomName}`);
                            return;
                        }
                        return "working";
                    },
                    run : function() {
                        /** @type {Id<StructureContainer>} */
                        const containerId = this.taskData.containerId;
                        /** @type {RoomPosition} */
                        const containerPos = this.taskData.containerPos;
                        /** @type {Id<Source>} */
                        const targetId = this.taskData.targetId;
                        /** @type {RoomPosition} */
                        const targetPos = this.taskData.targetPos;
                        /** @type {Creep[]} */
                        const harvesters = this.FetchEmployees("harvester");
                        /** @type {Creep[]} */
                        const transferers = this.FetchEmployees("transferer");
                        /** @type {string} */
                        const fromRoomName = this.taskData.fromRoomName;
                        /** @type {Creep[]} */
                        const firedCreeps = [];
                        harvesters.forEach(harvester => {
                            if (harvester.pos.roomName !== containerPos.roomName || harvester.pos.getRangeTo(containerPos) !== 0) return harvester.travelTo(containerPos);
                            const container = Game.getObjectById(containerId);
                            const source = Game.getObjectById(targetId);
                            if ((container.store.getFreeCapacity(RESOURCE_ENERGY) > 0 || harvester.store.getFreeCapacity(RESOURCE_ENERGY) > 0) && source.energy > 0) harvester.harvest(source);
                            else if (container.hits < container.hitsMax) {
                                if (harvester.store[RESOURCE_ENERGY] > 0) harvester.repair(container);
                                else harvester.withdraw(container, RESOURCE_ENERGY);
                            }
                        });
                        transferers.forEach(transferer => {
                            if (!transferer.memory.flags) transferer.memory.flags = {};
                            if (transferer.memory.flags.working && transferer.store[RESOURCE_ENERGY] === 0) {
                                /** Refresh Memory */
                                transferer.memory.flags = {};
                                transferer.memory.flags.working = false;
                            }
                            if (!transferer.memory.flags.working && (transferer.store.getFreeCapacity(RESOURCE_ENERGY) === 0 || (transferer.store[RESOURCE_ENERGY] > 0 && Game.rooms[containerPos.roomName] && Game.getObjectById(containerId).store[RESOURCE_ENERGY] === 0))) transferer.memory.flags.working = true;
                            if (!transferer.memory.flags.working) {
                                if (transferer.pos.roomName !== containerPos.roomName || transferer.pos.getRangeTo(containerPos) > 1) return transferer.travelTo(containerPos);
                                const container = Game.getObjectById(containerId);
                                if (container.store[RESOURCE_ENERGY] > 0) transferer.withdraw(container, RESOURCE_ENERGY);
                            }
                            if (transferer.memory.flags.working) {
                                /** Refresh Target */
                                if (transferer.memory.flags.targetId && transferer.memory.flags.targetPos && Game.rooms[transferer.memory.flags.targetPos.roomName] && (!Game.getObjectById(transferer.memory.flags.targetId) || Game.getObjectById(transferer.memory.flags.targetId).store.getFreeCapacity(RESOURCE_ENERGY) === 0)) transferer.memory.flags = {working : true};
                                if (!transferer.memory.flags.targetId || !transferer.memory.flags.targetPos) {
                                    const target = global.ResourceManager.Query(new RoomPosition(25, 25, fromRoomName), RESOURCE_ENERGY, transferer.store[RESOURCE_ENERGY], {type : "store", ensureAmount : false, confinedInRoom : true});
                                    if (!target) {
                                        firedCreeps.push(transferer);
                                        return;
                                    }
                                    transferer.memory.flags.targetId = target.id;
                                    transferer.memory.flags.targetPos = target.pos;
                                }
                                const targetPos = constructRoomPosition(transferer.memory.flags.targetPos);
                                if (transferer.pos.roomName !== transferer.memory.flags.targetPos.roomName || transferer.pos.getRangeTo(targetPos) > 1) return transferer.travelTo(targetPos);
                                const target = Game.getObjectById(transferer.memory.flags.targetId);
                                transferer.transfer(target, RESOURCE_ENERGY);
                            }
                        });
                        return firedCreeps;
                    }
                }, { containerId, containerPos, targetId, targetPos, fromRoomName, wrapper });
            };
            wrapper(this.id, this.pos, target.id, target.pos, this.room.memory.asRemoteMiningRoom);
        }
    };
    StructureContainer.prototype.triggerFillingEnergy = function() {
        if (Game.getTagById(this.id) !== "forSpawn") return;
        /**
         * Temporary Fast-Energy-Filling will be disabled, if Link System works.
         */
        if (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSpawn", STRUCTURE_LINK).length > 0 && global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSource", STRUCTURE_LINK).length > 0 && global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forTransfer", STRUCTURE_LINK).length > 0) return;
        if (global.TaskManager.Fetch(this.id, `FILLING_${RESOURCE_ENERGY}`).length > 0) return;
        /**
         * @type {(amount : number) => StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : true});
            return resource;
        }.bind(this);
        TaskConstructor.RequestTask(this, RESOURCE_ENERGY, "triggerFillingEnergy", this.store.getFreeCapacity(), "default", 1, requestResource, requestResource, (creep) => Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), this.store.getFreeCapacity()), (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false}), function (object) {
            if (this.EmployeeAmount === 0) return 2 * getPrice("energy") * object.store.getCapacity();
            else return -Infinity;
        }, (container) => container.store.getFreeCapacity(RESOURCE_ENERGY) < CARRY_CAPACITY * 3);
    }
}
function giveTowerBehaviors() {
    StructureTower.prototype.trigger = function() {
        this.triggerFillingEnergy();
    }
    StructureTower.prototype.triggerFillingEnergy = function() {
        const allowableEnergyShortage = this.store.getCapacity("energy") / 2;
        // `trigger` is called whenever the consumption leads to the amount of
        // remaining energy under threshold.
        // Thus, there is no need to schedule peroidic checking.
        if (this.store.getCapacity("energy") - this.store.getUsedCapacity("energy") <= allowableEnergyShortage) return;
        // Check whether there exists fillingEnergy.
        if (global.TaskManager.Fetch(this.id, `FILLING_${RESOURCE_ENERGY}`).length > 0) return;
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : false, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : false, allowToHarvest : true});
            return resource;
        }.bind(this);
        /**
         * @type {(amount : number) => StructureContainer | StructureStorage | StructureLink}
         */
        const strictRequestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : false, allowToHarvest : false});
            return resource;
        }.bind(this);
        TaskConstructor.RequestTask(this, RESOURCE_ENERGY, "triggerFillingEnergy", this.store.getFreeCapacity(RESOURCE_ENERGY), "Defense", 1, requestResource, strictRequestResource, (creep) => Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), this.store.getFreeCapacity(RESOURCE_ENERGY)), (room) => global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false}), (object) => object.store.getCapacity() * getPrice("energy") * 5, (tower) => tower.store.getFreeCapacity(RESOURCE_ENERGY) <= 10);
    }
}
function giveStorageBehaviors() {
    const NEXT_FILLING_MINERAL_TIMEOUT = 1500;
    const NEXT_FILLING_MINERAL_OFFSET = 100;
    const NEXT_FILLING_ENERGY_TIMEOUT = 50;
    const NEXT_FILLING_ENERGY_OFFSET = 5;
    StructureStorage.prototype.trigger = function() {
        this.triggerFillingEnergy();
        this.triggerFillingMineral();
    };
    /** Collect Mineral Harvested in Room */
    StructureStorage.prototype.triggerFillingMineral = function() {
        const mineralType = this.room.mineral.mineralType;
        if (global.TaskManager.Fetch(this.id, `FILLING_${mineralType}`).length > 0) return;
        /** Lower Bound */
        if (this.store.getUsedCapacity(this.room.mineral.mineralType) / this.store.getCapacity() >= global.Lucy.Rules.storage[mineralType] * 0.8 || this.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"] * 1.25) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_MINERAL_TIMEOUT, NEXT_FILLING_MINERAL_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingMineral, this.id, [], `Filling Mineral for ${this}`);
            return;
        }
        /**
         * @type {(amount : number) => StructureContainer}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, mineralType, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false, allowStructureTypes : [STRUCTURE_CONTAINER]});
            return resource;
        }.bind(this);
        TaskConstructor.RequestTask(this, mineralType, "triggerFillingMineral", CONTAINER_CAPACITY / 2, "default", 1, requestResource, requestResource, (creep) => Math.min(creep.store.getFreeCapacity(mineralType), this.store.getFreeCapacity(mineralType)), () => 0, function (object) { 
        return getPrice(this.taskData.resourceType) * object.store.getCapacity();}, (storage, resourceType) => storage.store.getUsedCapacity(resourceType) / storage.store.getCapacity() >= global.Lucy.Rules.storage[resourceType] || storage.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"]);
    };
    /** Collect Energy Harvested (Stop while linking system work) */
    StructureStorage.prototype.triggerFillingEnergy = function() {
        /**
         * Temporary Fast-Energy-Filling will be disabled, if Link System works.
         */
        if (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSource", STRUCTURE_LINK).length === this.room.sources.length && global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forTransfer", STRUCTURE_LINK).length > 0) return;
        if (global.TaskManager.Fetch(this.id, `FILLING_${RESOURCE_ENERGY}`).length > 0) return;
        /** Lower Bound */
        if (this.store.getUsedCapacity(RESOURCE_ENERGY) / this.store.getCapacity() >= global.Lucy.Rules.storage[RESOURCE_ENERGY] * 0.8 || this.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"] * 1.25) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_ENERGY_TIMEOUT, NEXT_FILLING_ENERGY_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingEnergy, this.id, [], `Filling Energy for ${this}`);
            return;
        }
        /**
         * @type {(amount : number) => StructureContainer}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false, allowStructureTypes : [STRUCTURE_CONTAINER]});
            return resource;
        }.bind(this);
        TaskConstructor.RequestTask(this, RESOURCE_ENERGY, "triggerFillingEnergy", CONTAINER_CAPACITY, "default", 1, requestResource, requestResource, (creep) => Math.min(creep.store.getFreeCapacity(RESOURCE_ENERGY), this.store.getFreeCapacity(RESOURCE_ENERGY)), () => 0, function (object) {
            if (this.EmployeeAmount === 0) return getPrice(this.taskData.resourceType) * object.store.getCapacity();
            else return -Infinity;
        }, (storage, resourceType) => storage.store.getUsedCapacity(resourceType) / storage.store.getCapacity() >= global.Lucy.Rules.storage[resourceType] || storage.store.getFreeCapacity() <= global.Lucy.Rules.storage["collectSpareCapacity"]);
    }
}
function giveLinkBehaviors() {
    StructureLink.prototype.trigger = function() {
        if (this.store.getFreeCapacity(RESOURCE_ENERGY) < CARRY_CAPACITY) {
            if (Game.getTagById(this.id) === global.Lucy.Rules.arrangements.SPAWN_ONLY) {
                this.room.centralSpawn.SetSignal("all", "fromLink", true);
            } else if (Game.getTagById(this.id) === global.Lucy.Rules.arrangements.TRANSFER_ONLY) {
                /** @type {import('./rooms.behaviors').CentralTransferUnit} */
                const centralTransfer = this.room.centralTransfer;
                let to = null;
                if (centralTransfer.Storage && centralTransfer.Storage.store.getFreeCapacity() >= global.Lucy.Rules.storage["collectSpareCapacity"] && centralTransfer.Storage.store[RESOURCE_ENERGY] / centralTransfer.Storage.store.getCapacity() <= global.Lucy.Rules.storage[RESOURCE_ENERGY]) to = STRUCTURE_STORAGE;
                else if (centralTransfer.Terminal && centralTransfer.Terminal.store.getFreeCapacity() >= global.Lucy.Rules.terminal["collectSpareCapacity"] && centralTransfer.Terminal.store[RESOURCE_ENERGY] / centralTransfer.Terminal.store.getCapacity() <= global.Lucy.Rules.terminal[RESOURCE_ENERGY]) to = STRUCTURE_TERMINAL;
                if (to) centralTransfer.PushOrder({from : "link", to : to, resourceType : RESOURCE_ENERGY, amount : amount});
            }
        }
    };
}
function giveRampartBehaviors() {
    const RAMPART_HITS_RATIO = 0.8;
    const TARGET_HITS_MAXIMUM = 5e6 + 3000;
    const NEXT_RAMPART_REPAIR_TIMEOUT = 200;
    const NEXT_RAMPART_REPAIR_OFFSET = 50;
    StructureRampart.prototype.trigger = function() {
        this.triggerRepairing();
        this.triggerDecayDetection();
    };
    StructureRampart.prototype.triggerDecayDetection = function() {
        /**
         * @param {Id<StructureRampart>} rampartId
         * @param {RoomPosition} pos
         */
        const DecayDetection = function(rampartId, pos) {
            const rampart = Game.getObjectById(rampartId);
            if (!rampart) {
                const { EventObjectDestroy } = require('./lucy.log');
                global.Lucy.Logs.Push(new EventObjectDestroy(pos, STRUCTURE_RAMPART, "Structure"));
            } else Lucy.Timer.add(Game.time + Math.ceil(rampart.hits / RAMPART_DECAY_AMOUNT) * RAMPART_DECAY_TIME, DecayDetection, undefined, [rampartId, pos], `Rampart Decay Detection for ${rampart}`);
        };
        Lucy.Timer.add(Game.time + Math.ceil(this.hits / RAMPART_DECAY_AMOUNT) * RAMPART_DECAY_TIME, DecayDetection, undefined, [this.id, this.pos], `Rampart Decay Detection for ${this}`);
    };
    /**
     * Strengthen Rampart does not belong to `repair` task, however.
     */
    StructureRampart.prototype.triggerRepairing = function() {
        if (this.hits / this.hitsMax >= RAMPART_HITS_RATIO || this.hits >= TARGET_HITS_MAXIMUM) {
            const NEXT_START_TICK = Game.time + getCacheExpiration(NEXT_RAMPART_REPAIR_TIMEOUT, NEXT_RAMPART_REPAIR_OFFSET);
            Lucy.Timer.add(NEXT_START_TICK, this.triggerRepairing, this.id, [], `Repairing for ${this} because of completion`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : false, confinedInRoom : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            return resource;
        }.bind(this);
        if (!requestResource(1)) {
            const NEXT_START_TICK = Game.time + getCacheExpiration(NEXT_RAMPART_REPAIR_TIMEOUT, NEXT_RAMPART_REPAIR_OFFSET);
            Lucy.Timer.add(NEXT_START_TICK, this.triggerRepairing, this.id, [], `Repairing for ${this} because of shortage of energy`);
            return;
        }
        /**
         * @param {number} amount
         * @param {ResourceConstant} resourceType
         */
        const requestStoreResources = function(amount, resourceType) {
            return global.ResourceManager.Query(this, resourceType, amount, {type : "store"});
        }.bind(this);
        /* Use Data to Determine Body */
        const energyConsumptionPerUnitPerTick = 1;
        new Task(`[${this.room.name}:RampartRepair]`, this.pos.roomName, this, new TaskDescriptor("Defense", {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn :
                    function (object) {
                        if (this.mountObj.hits <= 2 * 300) return Infinity;
                        else return getPrice("energy") * object.store.getCapacity(RESOURCE_ENERGY) * (1 + 1 - this.mountObj.hits / this.mountObj.hitsMax);
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / evaluateAbility(object, "repair"),
                expandFunction : (room) => bodyPartDetermination({type : "exhuastEnergy", availableEnergy : global.ResourceManager.Sum(room.name, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : "default"})}),
                groupTag : "defensePatch",
                tag : `${energyConsumptionPerUnitPerTick}-worker`,
                allowEmptyTag : true,
                mode : "expand",
                allowOtherTags : [`5-worker`]
            }
        }), {
            selfCheck : function() {
                if (!this.mountObj) return "dead";
                if (this.mountObj.hits / this.mountObj.hitsMax >= RAMPART_HITS_RATIO + 0.1 || this.mountObj.hits >= TARGET_HITS_MAXIMUM + 1e6) {
                    const NEXT_START_TICK = Game.time + getCacheExpiration(NEXT_RAMPART_REPAIR_TIMEOUT, NEXT_RAMPART_REPAIR_OFFSET);
                    Lucy.Timer.add(NEXT_START_TICK, this.mountObj.triggerRepairing, this.mountObj.id, [], `Repairing for ${this.mountObj}`);
                    console.log(`<p style="display:inline;color:gray;">[Log]</p> ${this.mountObj} has been fully repaired.`);
                    return "dead";
                }
                /** Lacking Resources */
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, requestStoreResources, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.repair)
        });
    };
}
function mount() {
    giveControllerBehaviors();
    giveSpawnBehaviors();
    giveExtensionBehaviors();
    giveConstructionSiteBehaviors();
    giveRoadBehaviors();
    giveContainerBehaviors();
    giveTowerBehaviors();
    giveStorageBehaviors();
    giveLinkBehaviors();
    giveRampartBehaviors();
}
global.Lucy.App.mount(mount);
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const RoomResetTriggerPlugin = {
    reset : () => {
        /**
         * Instant Trigger after Resetting
         */
        for (const roomName in Game.rooms) {
            if (isMyRoom(Game.rooms[roomName])) {
                const room = Game.rooms[roomName];
                if (room.spawns.length > 0) room.spawns[0].trigger(); // Choose Fixed One
                room.controller.triggerUpgrading();
                room.find(FIND_CONSTRUCTION_SITES).forEach(c => c.triggerBuilding());
                room["roads"].forEach(r => r.trigger());
                room["containers"].forEach(c => c.trigger());
                room["towers"].forEach(t => t.trigger());
                if (room.storage) room.storage.trigger();
                room["links"].forEach(l => l.trigger());
                room["ramparts"].forEach(r => r.trigger());
            } else if (Game.rooms[roomName].isResponsible) Game.rooms[roomName].NeutralTrigger();
        }
    }
};
global.Lucy.App.on(RoomResetTriggerPlugin);