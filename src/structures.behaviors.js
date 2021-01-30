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
const Task                          =   require('./task.prototype').Task;
const TaskDescriptor                =   require('./task.prototype').TaskDescriptor;
const Transaction                   =   require('./money.prototype').Transaction;
const Project                       =   require('./task.modules').Project;
const Constructors                  =   require('./task.modules').Constructors;
const Builders                      =   require('./task.modules').Builders;
function giveSpawnBehaviors() {
    const spawnCreep = Spawn.prototype.spawnCreep;
    const nextFillingTIMEOUT = 10;
    const nextFillingOFFSET  = 5;
    const FILLING_ENERGY = "fillingEnergy";
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
            const nearSpawnExtensions = _.filter(this.room.extensions, e => e.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY);
            const nearSpawnLackingEnergy = _.sum(nearSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY))) + _.sum(this.room.spawns.map(s => s.store.getCapacity(RESOURCE_ENERGY) - s.store.getUsedCapacity(RESOURCE_ENERGY)));
            if (!nearSpawnLackingEnergy) return;
            /* Query `resource` in order to decide which task to issue */
            let isResourceSpawnOnly = true;
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {key : Lucy.Rules.arrangements.SPAWN_ONLY, type : "retrieve", excludeDefault : true, confinedInRoom : true});
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
                } else {
                    bodyParts = {
                        [CARRY] : 32,
                        [MOVE] : 16
                    };
                }
                new Task(this.pos.roomName, this, new TaskDescriptor(Lucy.Rules.arrangements.SPAWN_ONLY, {
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
                            const nearSpawnExtensions = _.filter(this.mountObj.room.extensions, e => e.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY);
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
                        const workers = Object.keys(this.employee2role).map(Game.getObjectById);
                        /**
                         * @type {Source | AnyStoreStructure}
                         */
                        const source = Game.getObjectById(this.taskData.targetId);
                        /**
                         * @type {Array<Spawn | StructureExtension>}
                         */
                        const targetStructures = this.taskData.structureIds.map(Game.getObjectById);
                        const firedCreeps = [];
                        workers.forEach((creep) => {
                            if (!creep.memory.flags) creep.memory.flags = {};
                            /* Working State Update */
                            if (creep.memory.flags.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                                firedCreeps.push(creep);
                                return;
                            }
                            if (!creep.memory.flags.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) creep.memory.flags.working = true;
                            /* Working Body */
                            if (!creep.memory.flags.working) {
                                if (isHarvestable(source) && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                                else if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                                return;
                            }
                            if (creep.memory.flags.working) {
                                /* Update Filling Target */
                                if (creep.memory.flags.target === undefined || !targetStructures[creep.memory.flags.target] || targetStructures[creep.memory.flags.target].store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                                    creep.memory.flags.target = null;
                                    for (let i = 0; i < targetStructures.length; ++i) {
                                        if (targetStructures[i].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
                                        // NOTICE : The closest one will be choosed.
                                        if (!creep.memory.flags.target || (creep.memory.flags.target && calcInRoomDistance(creep.pos, targetStructures[creep.memory.flags.target].pos) > calcInRoomDistance(creep.pos, targetStructures[i].pos))) {
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
                this.room.centralSpawn.SetSignal("extensions", true);
            }
        }.bind(this);
        /**
         * Task 2
         * General Filling, which will fill those near spawns, but at lower priorities.
         */
        const issueFarFromSpawnEnergyFilling = function() {
            const farFromSpawnExtensions = _.filter(this.room.extensions, e => e.memory.tag !== global.Lucy.Rules.arrangements.SPAWN_ONLY);
            const farFromSpawnExtensionsLackingEnergy = _.sum(farFromSpawnExtensions.map(e => e.store.getCapacity(RESOURCE_ENERGY) - e.store.getUsedCapacity(RESOURCE_ENERGY)));
            if (!farFromSpawnExtensionsLackingEnergy) return;
            /**
             * @type { import('./task.prototype').GameObject | null }
             */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, lackingEnergy, {key : Lucy.Rules.arrangements.SPAWN_ONLY, type : "retrieve", confinedInRoom : true});
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
            } else {
                bodyParts = {
                    [CARRY] : 32,
                    [MOVE] : 16
                };
            }
            new Task(this.pos.roomName, this, new TaskDescriptor(Lucy.Rules.arrangements.SPAWN_ONLY, {
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
            }), {
                selfCheck : function() {
                    const _selfCheck = function() {
                        if (!this.mountObj || !Game.getObjectById(this.taskData.targetId)) return "dead";
                        const farFromSpawnExtensions = _.filter(this.mountObj.room.extensions, e => e.memory.tag !== global.Lucy.Rules.arrangements.SPAWN_ONLY);
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
                    const workers = Object.keys(this.employee2role).map(Game.getObjectById);
                    /**
                     * @type {Source | AnyStoreStructure}
                     */
                    const source = Game.getObjectById(this.taskData.targetId);
                    /**
                     * @type {Array<Spawn | StructureExtension>}
                     */
                    const targetStructures = this.taskData.structureIds.map(Game.getObjectById);
                    const firedCreeps = [];
                    workers.forEach((creep) => {
                        if (!creep.memory.flags) creep.memory.flags = {};
                        /* Working State Update */
                        if (creep.memory.flags.working && creep.store.getUsedCapacity(RESOURCE_ENERGY) === 0) {
                            firedCreeps.push(creep);
                            return;
                        }
                        if (!creep.memory.flags.working && creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0) creep.memory.flags.working = true;
                        /* Working Body */
                        if (!creep.memory.flags.working) {
                            if (isHarvestable(source) && creep.harvest(source) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                            else if (creep.withdraw(source, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) creep.travelTo(source);
                            return;
                        }
                        if (creep.memory.flags.working) {
                            /* Update Filling Target */
                            if (creep.memory.flags.target === undefined || !targetStructures[creep.memory.flags.target] || targetStructures[creep.memory.flags.target].store.getFreeCapacity(RESOURCE_ENERGY) === 0) {
                                creep.memory.flags.target = null;
                                for (let i = 0; i < targetStructures.length; ++i) {
                                    if (targetStructures[i].store.getFreeCapacity(RESOURCE_ENERGY) === 0) continue;
                                    // NOTICE : The closest one will be choosed.
                                    if (!creep.memory.flags.target || (creep.memory.flags.target && calcInRoomDistance(creep.pos, targetStructures[creep.memory.flags.target].pos) > calcInRoomDistance(creep.pos, targetStructures[i].pos))) {
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
            }, {targetId : resource.id, structureIds : farFromSpawnExtensions.map(e => e.id), transaction : transaction});
        }.bind(this);
        issueNearSpawnEnergyFilling();
        issueFarFromSpawnEnergyFilling();
    };
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
                    .sort((a, b) => (a.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY ? 0 : 1) - (b.memory.tag === global.Lucy.Rules.arrangements.SPAWN_ONLY ? 0 : 1))
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
}
function giveExtensionBehaviors() {

}
function giveControllerBehaviors() {
    const nextUpgradeTIMEOUT    = 10;
    const nextUpgradeOFFSET     = 5;
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
        // if (this.level === maximumLevel && this.ticksToDowngrade > CREEP_LIFE_TIME) return;
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function (amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", key : Lucy.Rules.arrangements.UPGRADE_ONLY, allowToHarvest : false, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : true, confinedInRoom : false});
            return resource;
        }.bind(this);
        /* Use Data to Determine Body */
        const availableEnergy = global.ResourceManager.Sum(this.pos.roomName, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : Lucy.Rules.arrangements.UPGRADE_ONLY});
        const energyConsumptionPerUnitPerTick = 1;
        new Task(this.pos.roomName, this, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : global.MapMonitorManager.FetchVacantSpaceCnt(this.pos.roomName, Math.max(this.pos.y - 1, 1), Math.max(this.pos.x - 1, 1), Math.min(this.pos.y + 1, 48), Math.min(this.pos.x + 1, 48)),
                estimateProfitPerTurn :
                    function (object) {
                        /* At least one creep should upgrade Controller in order to avoid downgrading. */
                        if (this.EmployeeAmount === 0) return Infinity;
                        else return getPrice("energy") * object.store.getCapacity();
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / (evaluateAbility(object, "upgradeController")),
                bodyMinimumRequirements : bodyPartDetermination({type : "exhuastEnergy", availableEnergy, energyConsumptionPerUnitPerTick}),
                tag : `${energyConsumptionPerUnitPerTick}-worker`,
                allowEmptyTag : true,
                mode : "shrinkToEnergyAvailable",
                workingPos : this.pos
            }
        }), {
            selfCheck : function() {
                /* Periodically Drop out */
                if (Game.time > this.taskData.startedTick + this.taskData.lastingTicks) {
                    Lucy.Timer.add(Game.time + 1, this.mountObj.triggerUpgrading, this.mountObj.id, [], `Upgrading Controller of Room ${this.mountObj.room.name}`);
                    console.log(`<p style="color:lightred;display:inline;">[Notice]</p> Reject "Upgrading Controller" task in ${this.mountObj.room.name} and propose new one.`);
                    return "dead";
                }
                /* Lacking Resources */
                // @TODO
                /* Achieve Desired Goal */
                if (this.mountObj.level === maximumLevel && CONTROLLER_DOWNGRADE[maximumLevel] - this.mountObj.ticksToDowngrade <= satisfiedDownGradeGap) {
                    /* Because of the threat of downgrading, still, there should arrange scheduled recheck task */
                    const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(this.mountObj.ticksToDowngrade - satisfiedDownGradeGap, nextUpgradeTIMEOUT), nextUpgradeOFFSET);
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerUpgrading, this.mountObj.id, [], `Upgrading Controller of Room ${this.mountObj.room.name}`);
                    console.log(`<p style="color:gray;display:inline;">[Log]</p> "Upgrading Controller" task in ${this.mountObj.room.name} finished. New one is scheduled at ${nextTaskStartedTick}.`);
                    return "dead";
                }
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.upgradeController)
        }, {requestResource : requestResource, startedTick : Game.time, lastingTicks : upgradePeriodTicks});
    }
}
function giveConstructionSiteBehaviors() {
    const NEXT_CONSTRUCT_TIMEOUT    = 50;
    const NEXT_CONSTRUCT_OFFSET     = 5;
    ConstructionSite.prototype.triggerBuilding = function() {
        /* As long as the constructionSite exists, the building is needed. */
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", allowToHarvest : false, confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : false});
            return resource;
        }.bind(this);
        /* Use Data to Determine Body */
        const availableEnergy = global.ResourceManager.Sum(this.pos.roomName, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : Lucy.Rules.arrangements.BUILD_ONLY});
        const energyConsumptionPerUnitPerTick = 5;
        new Task(this.pos.roomName, this, new TaskDescriptor("Construct", {
            worker : {
                minimumNumber : 1,
                maximumNumber : Infinity,
                estimateProfitPerTurn :
                    function (object) {
                        if (this.EmployeeAmount === 0) return 5 * getPrice("energy") * object.store.getCapacity() + object.store.getCapacity() * (this.mountObj.progress / this.mountObj.progressTotal) * getPrice("energy");
                        /* Serve as a collect-up task, but with least privilege */
                        else return -Infinity;
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / (evaluateAbility(object, "build")),
                bodyMinimumRequirements : bodyPartDetermination({type : "exhuastEnergy", availableEnergy, energyConsumptionPerUnitPerTick}),
                groupTag : "buildPatch",
                tag : `${energyConsumptionPerUnitPerTick}-worker`,
                allowEmptyTag : true,
                mode : "shrinkToEnergyAvailable"
            }
        }), {
            selfCheck : function() {
                if (!this.mountObj || this.mountObj.progress === this.mountObj.progressTotal) return "dead";
                /* Lacking Resources */
                // @TODO
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.build)
        }, { requestResource : requestResource });
    };
}
function giveRoadBehaviors() {
    const NEXT_REPAIR_TIMEOUT = 500;
    const NEXT_REPAIR_OFFSET  = 50;
    StructureRoad.prototype.trigger = function() {
        this.triggerRepairing();
    };
    StructureRoad.prototype.triggerRepairing = function() {
        const allowableHitsDiff = this.hitsMax * 0.1;
        /**
         * Postpone Checking
         * In order to reduce the frequency of repairing, REPAIR employees the divergence-between-threshold-and-target policy. 
         */
        if (this.hitsMax - this.hits <= (Math.random() + 1) * allowableHitsDiff) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_REPAIR_TIMEOUT, NEXT_REPAIR_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerRepairing, this.id, [], `Repair ${this} of Room ${this.room.name}`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve"});
            return resource;
        }.bind(this);
        /* Use Data to Determine Body */
        const availableEnergy = global.ResourceManager.Sum(this.pos.roomName, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : "default"});
        const energyConsumptionPerUnitPerTick = 1;
        new Task(this.pos.roomName, this, new TaskDescriptor("Repair", {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn :
                    function (object) {
                        return getPrice("energy") * object.store.getCapacity();
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / (evaluateAbility(object, "build")),
                bodyMinimumRequirements : bodyPartDetermination({type : "exhuastEnergy", availableEnergy, energyConsumptionPerUnitPerTick}),
                groupTag : "repairPatch",
                tag : `${energyConsumptionPerUnitPerTick}-worker`,
                allowEmptyTag : true,
                mode : "shrinkToEnergyAvailable"
            }
        }), {
            selfCheck : function() {
                if (!this.mountObj) return "dead";
                /* Repairing Target is stricter */
                if (this.mountObj.hitsMax - this.mountObj.hits <= 1) {
                    /* Since decaying is constant and dynamic, the checking should be too. */
                    const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(NEXT_REPAIR_TIMEOUT, this.mountObj.ticksToDecay * 2), Math.min(this.mountObj.ticksToDecay, NEXT_REPAIR_OFFSET));
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerRepairing, this.mountObj.id, [], `Repair ${this.mountObj} of Room ${this.mountObj.room.name}`);
                    console.log(`<p style="color:gray;display:inline;">[Log]</p> "Repair ${this.mountObj}" task in ${this.mountObj.room.name} finished. New one is scheduled at ${nextTaskStartedTick}.`);
                    return "dead";
                }
                /* Lacking Resources */
                // @TODO
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.repair)
        }, {requestResource : requestResource});
    };
}
function giveContainerBehaviors() {
    const NEXT_REPAIR_TIMEOUT = 500;
    const NEXT_REPAIR_OFFSET  = 50;
    StructureContainer.prototype.trigger = function() {
        this.triggerRepairing();
        this.triggerHarvesting();
        this.triggerFillingEnergy();
    };
    StructureContainer.prototype.triggerRepairing = function() {
        const allowableHitsDiff = this.hitsMax * 0.1;
        /**
         * Postpone Checking
         * In order to reduce the frequency of repairing, REPAIR employees the divergence-between-threshold-and-target policy. 
         */
        if (this.hitsMax - this.hits <= (Math.random() + 1) * allowableHitsDiff) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_REPAIR_TIMEOUT, NEXT_REPAIR_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerRepairing, this.id, [], `Repair ${this} of Room ${this.room.name}`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve"});
            return resource;
        }.bind(this);
        /* Use Data to Determine Body */
        const availableEnergy = global.ResourceManager.Sum(this.pos.roomName, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false, key : "default"});
        const energyConsumptionPerUnitPerTick = 1;
        new Task(this.pos.roomName, this, new TaskDescriptor("Repair", {
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn :
                    function (object) {
                        return getPrice("energy") * object.store.getCapacity();
                    },
                estimateWorkingTicks :
                    (object) => object.store.getCapacity() / (evaluateAbility(object, "build")),
                bodyMinimumRequirements : bodyPartDetermination({type : "exhuastEnergy", availableEnergy, energyConsumptionPerUnitPerTick}),
                groupTag : "repairPatch",
                tag : `${energyConsumptionPerUnitPerTick}-worker`,
                allowEmptyTag : true,
                mode : "shrinkToEnergyAvailable"
            }
        }), {
            selfCheck : function() {
                if (!this.mountObj) return "dead";
                if (this.mountObj.hitsMax - this.mountObj.hits <= 1) {
                    /* Since decaying is constant and dynamic, the checking should be too. */
                    const nextTaskStartedTick = Game.time + getCacheExpiration(Math.max(NEXT_REPAIR_TIMEOUT, this.mountObj.ticksToDecay * 2), Math.min(this.mountObj.ticksToDecay, NEXT_REPAIR_OFFSET));
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerRepairing, this.mountObj.id, [], `Repair ${this.mountObj} of Room ${this.mountObj.room.name}`);
                    console.log(`<p style="color:gray;display:inline;">[Log]</p> "Repair ${this.mountObj}" task in ${this.mountObj.room.name} finished. New one is scheduled at ${nextTaskStartedTick}.`);
                    return "dead";
                }
                /* Lacking Resources */
                // @TODO
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 3, Creep.prototype.repair)
        }, {requestResource : requestResource});
    };
    /**
     * @memberof StructureContainer
     * @function
     */
    StructureContainer.prototype.triggerHarvesting = function() {
        let target = null;
        if (this.memory.tag === "forSource") {
            target = this.room.energies.filter(e => e.pos.getRangeTo(this.pos) === 1)[0];
        } else if (this.memory.tag === "forMineral") {
            if (!this.room[STRUCTURE_EXTRACTOR]) return;
            target = this.room.mineral;
        } else return;
        if (!target) {
            console.log(`<p style="display:inline;color:red;">Error:</p> Can't find matched target for container ${this} whose tag is ${this.memory.tag}`);
            return;
        }
        /**
         * For Mineral, maximum WORK part is hard-coded into 5, which is usually enough.
         * For Source, it is important to ensure Source is exhausted in 300 ticks so as to achieve maximum efficiency.
         * However, since energy is most fundamental resource to operate the whole empire, "weak" creep is allowed to spawn, when
         * availableEnergy is not enough to support "full" version.
         */
        const workBodyParts = isMineral(target) ? 5 : (evaluateSource(target) / 300 / 2);
        /* No Transaction should be dealt here */
        new Task(this.room.name, target, new TaskDescriptor("default", {
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
                /** @type {Source} */
                const source = this.mountObj;
                if (isSource(source)) {
                    if (source.energy === 0) {
                        Lucy.Timer.add(Game.time + source.ticksToRegeneration, container.triggerHarvesting, container.id, [], `Harvesting in room ${source.room.name} for ${source}`);
                        console.log(`<p style="color:gray;display:inline;">[Log]</p> "Harvest ${source}" task in ${source.room.name} finished. New one is scheduled at ${Game.time + source.ticksToRegeneration}.`);
                        return "dead";
                    }
                }
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
            run :
                new Project()
                    .InsertLayer({[OK] : Constructors.ConstructStaticTargetComponent(this.id)})
                    .InsertLayer({[OK] : Constructors.ConstructMoveToComponent(0)})
                    .InsertLayer({[OK] : Constructors.ConstructStaticTargetComponent(target.id)})
                    .InsertLayer({[OK] : Constructors.ConstructStaticTargetComponent(this.id, "storeId")})
                    .InsertLayer({[OK] :
                        new Project()
                            .InsertLayer({[OK] : Constructors.ConstructObjectStoreFullCheckComponent(target.mineralType || RESOURCE_ENERGY)})
                            .InsertLayer({
                                [ERR_NOT_ENOUGH_RESOURCES] : Constructors.ConstructDoSomethingComponent(Creep.prototype.harvest),
                                [OK] : Constructors.ConstructNullComponent()
                            })
                            .InsertLayer({[ERR_FULL] : Constructors.ConstructNullComponent()})
                            .Mode("refresh")
                        })
        }, { containerId : this.id });
    };
    const FILLING_ENERGY = "fillingEnergy";
    StructureContainer.prototype.triggerFillingEnergy = function() {
        if (this.memory.tag !== "forSpawn") return;
        /**
         * Temporary Fast-Energy-Filling will be disabled, if Link System works.
         */
        if (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSpawn", STRUCTURE_LINK).length > 0 && (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSource", STRUCTURE_LINK).length > 0 || global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forTransfer", STRUCTURE_LINK).length > 0)) return;
        if (global.TaskManager.Fetch(this.id, FILLING_ENERGY).length > 0) return;
        const NEXT_FAST_FILLING_ENERGY_TIMEOUT  = 50;
        const NEXT_FAST_FILLING_ENERGY_OFFSET   = 5;
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            return resource;
        }.bind(this);
        const resourceIndicator = requestResource(1);
        if (!resourceIndicator) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FAST_FILLING_ENERGY_TIMEOUT, NEXT_FAST_FILLING_ENERGY_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingEnergy, this.id, [], `Fast-Filling Energy for ${this}`);
            return;
        }
        new Task(this.pos.roomName, this, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : Infinity,
                estimateProfitPerTurn :
                    function (object) {
                        if (this.EmployeeAmount === 0) return 2 * getPrice("energy") * object.store.getCapacity();
                        else return -Infinity;
                    },
                estimateWorkingTicks:
                    (object) => 1,
                bodyMinimumRequirements : {
                    [CARRY] : 32,
                    [MOVE] : 16
                },
                groupTag : "transferPatch",
                tag : "transferer",
                mode : "shrinkToEnergyAvailable",
                allowEmptyTag : true
            }
        }, {taskKey : FILLING_ENERGY}), {
            selfCheck : function() {
                if (!this.mountObj || this.mountObj.store.getFreeCapacity(RESOURCE_ENERGY) < CARRY_CAPACITY * 3) {
                    const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FAST_FILLING_ENERGY_TIMEOUT, NEXT_FAST_FILLING_ENERGY_OFFSET);
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerFillingEnergy, this.mountObj.id, [], `Fast-Filling Energy for ${this.mountObj}`);
                    return "dead";
                }
                return "working"; 
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 1, Creep.prototype.transfer, [RESOURCE_ENERGY])
        }, {requestResource : requestResource});
    };
}
function giveTowerBehaviors() {
    const FILLING_ENERGY = "fillingEnergy";
    const nextFillingTIMEOUT = 10;
    const nextFillingOFFSET  = 5;
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
        if (global.TaskManager.Fetch(this.id, FILLING_ENERGY).length > 0) return;
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true});
            if (!resource) resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve"});
            return resource;
        }.bind(this);
        /** Determine BodyParts */
        let bodyParts = null;
        const resourceIndicator = requestResource(1);
        // If there is no resources available, the refilling will be postponed.
        if (!resourceIndicator) {
            Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), this.triggerFillingEnergy, this.id, [], `Filling Energy for ${this}`);
            console.log(`<p style="color:red;display:inline;">Error:</p> Fail to propose "Energy Filling for container ${this}" task in ${this.room.name}.`);
            return;
        }
        if (isHarvestable(resourceIndicator)) {
            const availableEnergy = global.ResourceManager.Sum(this.pos.roomName, RESOURCE_ENERGY, {type : "retrieve", allowToHarvest : false});
            /** Pseudo-Energy-Consumption 5 is set. */
            bodyParts = bodyPartDetermination({type : "exhuastEnergy", availableEnergy, energyConsumptionPerUnitPerTick : 5});
        } else {
            bodyParts = {
                [CARRY] : 32,
                [MOVE] : 16
            };
        }
        new Task(this.pos.roomName, this, new TaskDescriptor("forDefense",{
            worker : {
                minimumNumber : 1,
                maximumNumber : 1,
                estimateProfitPerTurn :
                    (object) => object.store.getCapacity() * getPrice("energy") * 1.5,
                estimateWorkingTicks:
                    (object) => typeof bodyParts[WORK] === "number" ? object.store.getCapacity() / (2 * evaluateAbility(object, "harvest")) : 1,
                bodyMinimumRequirements : bodyParts,
                groupTag : "transferPatch",
                tag : isHarvestable(resourceIndicator) ? `${5}-worker` : `transferer`,
                mode : "shrinkToEnergyAvailable",
                allowEmptyTag : true,
                allowOtherTags : isHarvestable(resourceIndicator) ? [`${1}-worker`] : undefined
            }
        }, {taskKey : FILLING_ENERGY}), {
            selfCheck : function() {
                /** Lacking Energy @TODO */
                if (!this.mountObj) return "dead";
                /** Schedule For Next One */
                if (this.mountObj.store.getFreeCapacity(RESOURCE_ENERGY) <= 10) {
                    Lucy.Timer.add(Game.time + getCacheExpiration(nextFillingTIMEOUT, nextFillingOFFSET), this.triggerFillingEnergy, this.id, [], `Filling Energy for ${this}`);
                    console.log(`<p style="color:gray;display:inline;">[Log]</p> "Energy Filling for container ${this}" task in ${this.room.name} finishes.`);
                    return "dead";
                }
                return "working";
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 1, Creep.prototype.transfer, [RESOURCE_ENERGY])
        }, {requestResource : requestResource});
    }
}
function giveStorageBehaviors() {
    const FILLING_ENERGY = "fillingEnergy";
    const FILLING_MINERAL = "fillingMineral";
    StructureStorage.prototype.trigger = function() {
        this.triggerFillingEnergy();
        this.triggerFillingMineral();
    };
    StructureStorage.prototype.triggerFillingMineral = function() {
        if (global.TaskManager.Fetch(this.id, FILLING_MINERAL).length > 0) return;
        const NEXT_FILLING_MINERAL_TIMEOUT  = 500;
        const NEXT_FILLING_MINERAL_OFFSET   = 50;
        const mineralType = this.room.mineral.mineralType;
        if (this.store.getUsedCapacity(this.room.mineral.mineralType) / this.store.getCapacity() >= global.Lucy.Rules.storage[mineralType]) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_MINERAL_TIMEOUT, NEXT_FILLING_MINERAL_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingMineral, this.id, [], `Filling Mineral for ${this}`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, mineralType, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            return resource;
        }.bind(this);
        const resourceIndicator = requestResource(1);
        if (!resourceIndicator) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_MINERAL_TIMEOUT, NEXT_FILLING_MINERAL_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingMineral, this.id, [], `Filling Mineral for ${this}`);
            return;
        }
        new Task(this.pos.roomName, this, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : Infinity,
                estimateProfitPerTurn :
                    function (object) {
                        if (this.EmployeeAmount === 0) return getPrice(this.taskData.mineralType) * object.store.getCapacity();
                        else return -Infinity;
                    },
                estimateWorkingTicks:
                    (object) => 1,
                bodyMinimumRequirements : {
                    [CARRY] : 32,
                    [MOVE] : 16
                },
                groupTag : "transferPatch",
                tag : "transferer",
                mode : "shrinkToEnergyAvailable",
                allowEmptyTag : true
            }
        }, {taskKey : FILLING_ENERGY}), {
            selfCheck : function() {
                if (!this.mountObj || this.mountObj.store.getUsedCapacity(mineralType) / this.mountObj.store.getCapacity() >= global.Lucy.Rules.storage[this.taskData.mineralType]) {
                    const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_MINERAL_TIMEOUT, NEXT_FILLING_MINERAL_OFFSET);
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerFillingMineral, this.mountObj.id, [], `Filling Mineral for ${this.mountObj}`);
                    return "dead";
                }
                return "working"; 
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(mineralType, requestResource, (creep) => creep.store.getFreeCapacity(mineralType), this, 1, Creep.prototype.transfer, [mineralType])
        }, {requestResource : requestResource, mineralType : mineralType});
    };
    StructureStorage.prototype.triggerFillingEnergy = function() {
        /**
         * Temporary Fast-Energy-Filling will be disabled, if Link System works.
         */
        if (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSpawn", STRUCTURE_LINK).length > 0 && (global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forSource", STRUCTURE_LINK).length > 0 || global.MapMonitorManager.FetchStructureWithTag(this.room.name, "forTransfer", STRUCTURE_LINK).length > 0)) return;
        if (global.TaskManager.Fetch(this.id, FILLING_ENERGY).length > 0) return;
        const NEXT_FILLING_ENERGY_TIMEOUT  = 50;
        const NEXT_FILLING_ENERGY_OFFSET   = 5;
        if (this.store.getUsedCapacity(RESOURCE_ENERGY) / this.store.getCapacity() >= global.Lucy.Rules.storage[RESOURCE_ENERGY]) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_ENERGY_TIMEOUT, NEXT_FILLING_ENERGY_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingEnergy, this.id, [], `Filling Energy for ${this}`);
            return;
        }
        /**
         * @type {(amount : number) => Source | StructureContainer | StructureStorage | StructureLink}
         */
        const requestResource = function(amount) {
            /** In order to avoid transfering energy from one container to another, "default" key is employed. */
            let resource = global.ResourceManager.Query(this, RESOURCE_ENERGY, amount, {type : "retrieve", confinedInRoom : true, allowToHarvest : false});
            return resource;
        }.bind(this);
        const resourceIndicator = requestResource(1);
        console.log(this, resourceIndicator);
        if (!resourceIndicator) {
            const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_ENERGY_TIMEOUT, NEXT_FILLING_ENERGY_OFFSET);
            Lucy.Timer.add(nextTaskStartedTick, this.triggerFillingEnergy, this.id, [], `Filling Energy for ${this}`);
            return;
        }
        new Task(this.pos.roomName, this, new TaskDescriptor("default", {
            worker : {
                minimumNumber : 1,
                maximumNumber : Infinity,
                estimateProfitPerTurn :
                    function (object) {
                        if (this.EmployeeAmount === 0) return getPrice("energy") * object.store.getCapacity();
                        else return -Infinity;
                    },
                estimateWorkingTicks:
                    (object) => 1,
                bodyMinimumRequirements : {
                    [CARRY] : 32,
                    [MOVE] : 16
                },
                groupTag : "transferPatch",
                tag : "transferer",
                mode : "shrinkToEnergyAvailable",
                allowEmptyTag : true
            }
        }, {taskKey : FILLING_ENERGY}), {
            selfCheck : function() {
                if (!this.mountObj || this.mountObj.store.getUsedCapacity(RESOURCE_ENERGY) / this.mountObj.store.getCapacity() >= global.Lucy.Rules.storage[RESOURCE_ENERGY]) {
                    const nextTaskStartedTick = Game.time + getCacheExpiration(NEXT_FILLING_ENERGY_TIMEOUT, NEXT_FILLING_ENERGY_OFFSET);
                    Lucy.Timer.add(nextTaskStartedTick, this.mountObj.triggerFillingEnergy, this.mountObj.id, [], `Filling Energy for ${this.mountObj}`);
                    return "dead";
                }
                return "working"; 
            },
            run : Builders.BuildFetchResourceAndDoSomethingProject(RESOURCE_ENERGY, requestResource, (creep) => creep.store.getFreeCapacity(RESOURCE_ENERGY), this, 1, Creep.prototype.transfer, [RESOURCE_ENERGY])
        }, {requestResource : requestResource});
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
    /**
     * Instant Check while Reloading, considering the loss of all undergoing tasks
     */
    for (const roomName in Game.rooms) {
        const room = Game.rooms[roomName];
        if (isMyRoom(room)) {
            if (room.spawns.length > 0) room.spawns[0].trigger(); // Choose Fixed One
            room.controller.triggerUpgrading();
            room.find(FIND_CONSTRUCTION_SITES).forEach(c => c.triggerBuilding());
            room["roads"].forEach(r => r.trigger());
            room["containers"].forEach(c => c.trigger());
            room["towers"].forEach(t => t.trigger());
            if (room.storage) room.storage.trigger();
        }
    }
}
module.exports = {
    mount : mount
};