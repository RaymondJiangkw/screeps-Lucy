/**
 * @module task.modules
 * 
 * This module provides basic components to constitute a running function for task.
 * 
 * Each Component is comprised of these several parts:
 *  - Acceptable Signals (As Socket) (This one, however, could be dynamically determined when added to project)
 *  - Body
 *  - Emitted Signals (Based on Body)
 * Generally, a project can be viewed as a component.
 * With some ideas, we could make some component into "Work" Unit, while some into "Logical" Unit. And, while emitting signals, additional information could be added.
 * 
 * A Project is modeled as a topological graph with multiple layers and potential myriad projects / components lying at each layer. The first layer, however, must only have one project / component, which is perceived as entrance. For each layer, only one project / component will be executed, which is selected based on the signal from previous layer. After project / component is finished, it will emit a signal.
 * 
 * @typedef { {} } AttachedData
 * @typedef { {signal : number, data : AttachedData} } Signal
 * @typedef { (object : import("./task.prototype").GameObject, task : import("./task.prototype").Task) => null | Signal } RunableFunction
 * @typedef {Project} Project
 */
const Transaction = require("./money.prototype").Transaction;
const checkForStore = require("./util").checkForStore;
const checkForFreeStore = require("./util").checkForFreeStore;
const isHarvestable = require("./util").isHarvestable;
const getPrice = require("./util").getPrice;
const profiler = require("./screeps-profiler");
/**
 * Class representation for Component.
 */
class Component {
    /**
     * Feed feeds data from previous Component / Project into this Component.
     * @param {import("./task.prototype").GameObject} object indicate the owner of data
     * @param {AttachedData} data
     */
    Feed(object, data) {
        this.attachedData[object.id] = data;
    }
    /**
     * @param {import("./task.prototype").GameObject} object
     * @param {import("./task.prototype").Task} task parent Task
     * @returns {null | Signal}
     */
    Run(object, task) {
        const ret = this.run(object, task);
        /* If completed, stored data will be cleaned. */
        if (ret && this.attachedData[object.id]) delete this.attachedData[object.id];
        return ret;
    }
    /**
     * @param {RunableFunction} run
     */
    constructor(run) {
        /**
         * @private
         * @type { {[id : string] : {}} } 
         */
        this.attachedData = {};
        /**
         * @private
         * @type {RunableFunction}
         */
        this.run = run.bind(this);
    }
};
/**
 * Class representation for Project.
 * Project is a Flow Chart constituted by Components and Projects.
 * @typedef { {[signal : number] : Component | Project} } Node
 * @typedef { "normal" | "refresh" } Mode
 */
class Project {
    /**
     * Feed data from previous Component / Project into this Component.
     * @param {import("./task.prototype").GameObject} object indicate the owner of data
     * @param {AttachedData} data
     */
    Feed(object, data) {
        this.attachedData[object.id] = data;
    }
    /**
     * @param {import("./task.prototype").GameObject} object
     * @param {import("./task.prototype").Task} task parent Task
     * @returns {null | Signal}
     */
    Run(object, task) {
        if (!this.pointers[object.id] || this.mode === "refresh") {
            this.pointers[object.id] = {layer : 0, signal : OK};
            this.layers[0][OK].Feed(object, this.attachedData[object.id] || {});
        }
        // console.log(`<p style="display:inline;color:yellow;">Start Pos</p> ${task.name} for ${object} : ${this.pointers[object.id].layer}->${this.pointers[object.id].signal}`);
        // let startTime = Game.cpu.getUsed();
        /**
         * @type {null | Signal}
         */
        let ret = this.layers[this.pointers[object.id].layer][this.pointers[object.id].signal].Run(object, task);
        // if (!ret) {
            // console.log(`${object} : ${this.pointers[object.id].layer}->${this.pointers[object.id].signal} : ${JSON.stringify(ret)} : ${(Game.cpu.getUsed() - startTime).toFixed(3)}`);
        // }
        while (ret) {
            //console.log(`${object} : ${this.pointers[object.id].layer}->${this.pointers[object.id].signal} : ${JSON.stringify(ret)} : ${(Game.cpu.getUsed() - startTime).toFixed(3)}`);
            // startTime = Game.cpu.getUsed();
            /* Cycle Condition */
            if (this.pointers[object.id].layer === this.layers.length - 1 && this.lastLayer2FirstLayerSignals.indexOf(ret.signal) !== -1) {
                this.pointers[object.id].layer = 0;
                this.pointers[object.id].signal = OK;
            } else {
                ++this.pointers[object.id].layer;
                this.pointers[object.id].signal = ret.signal;
            }
            /* Update Data */
            this.attachedData[object.id] = ret.data;
            /* End Condition */
            if (this.pointers[object.id].layer >= this.layers.length || this.layers[this.pointers[object.id].layer][this.pointers[object.id].signal] === undefined) break;
            this.layers[this.pointers[object.id].layer][this.pointers[object.id].signal].Feed(object, this.attachedData[object.id]);
            ret = this.layers[this.pointers[object.id].layer][this.pointers[object.id].signal].Run(object, task);
        }
        /* Whole Process is completed */
        if (ret) {
            if (this.pointers[object.id]) delete this.pointers[object.id];
            if (this.attachedData[object.id]) delete this.attachedData[object.id];
        }
        return ret;
    }
    /**
     * First Layer is compulsory to be { [OK] : Component | Project }.
     * @param {Node} layer 
     */
    InsertLayer(layer) {
        this.layers.push(layer);
        return this;
    }
    /**
     * @param {number} signal
     */
    Cyclize(signal) {
        this.lastLayer2FirstLayerSignals.push(signal);
        return this;
    }
    /**
     * @param {Mode} mode
     */
    Mode(mode) {
        this.mode = mode;
        return this;
    }
    constructor() {
        /**
         * AttachedData of Project will be feeded into the first executed unit.
         * @private
         * @type { {[id : string] : {}} } 
         */
        this.attachedData = {};
        /**
         * @private
         * @type {Array<Node>}
         */
        this.layers = [];
        /**
         * @private
         * @type { {[id : string] : {layer : number, signal : number}} }
         */
        this.pointers = {};
        /**
         * @private
         * @type { Array<number> }
         */
        this.lastLayer2FirstLayerSignals = [];
        /**
         * @private
         * @type {Mode}
         */
        this.mode = "normal";
    }
};
/** Handy Function */
/**
 * @param {number} [signal = 0]
 * @param {{}} [data = {}]
 * @returns {Signal}
 */
function ConstructSignal(signal = OK, data = {}) {
    return {signal : signal, data : data};
}
/**
 * @param {number} emittedSignalNumber
 */
function ConstructEmptyComponent(emittedSignalNumber) {
    const component = new Component(function (object, task) {
        const attachedData = this.attachedData[object.id] || {};
        return ConstructSignal(emittedSignalNumber, attachedData);
    });
    profiler.registerObject(component, `[Component Empty]`);
    return component;
}
function ConstructNullComponent() {
    const component = new Component(function (object, task) {
        return null;
    });
    profiler.registerObject(component, `[Component Null]`);
    return component;
}
const ERR_CONTAIN_IRRELATED_RESOURCES = 1;
const ARRAY_NOT_EMPTY = 2;
/**
 * @param {Array<ResourceConstant} allowedResourceTypes
 */
function ConstructStoreCheckComponent(allowedResourceTypes) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!object.store) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        let containedResourceTypes = [];
        for (const resourceType in object.store) if (allowedResourceTypes.indexOf(resourceType) === -1) containedResourceTypes.push(resourceType);
        if (containedResourceTypes.length === 0) return ConstructSignal(OK, attachedData);
        else {
            attachedData.containedResourceTypes = containedResourceTypes;
            return ConstructSignal(ERR_CONTAIN_IRRELATED_RESOURCES, attachedData);
        }
    });
    profiler.registerObject(component, `[Component StoreCheck]`);
    return component;
}
/**
 * @param {ResourceConstant} resourceType
 */
function ConstructStoreFullCheckComponent(resourceType) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!object.store) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (typeof object.store.getFreeCapacity(resourceType) !== 'number') return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (object.store.getFreeCapacity(resourceType) === 0) return ConstructSignal(OK, attachedData);
        else {
            attachedData.resourceType = resourceType;
            return ConstructSignal(ERR_NOT_ENOUGH_RESOURCES, attachedData);
        }
    });
    profiler.registerObject(component, `[Component StoreFullCheck]`);
    return component;
}
/**
 * @param {ResourceConstant} resourceType
 */
function ConstructStoreEmptyCheckComponent(resourceType) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!object.store) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (typeof object.store.getUsedCapacity(resourceType) !== 'number') return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (object.store.getUsedCapacity(resourceType) === 0) return ConstructSignal(OK, attachedData);
        else {
            attachedData.resourceType = resourceType;
            return ConstructSignal(ERR_FULL, attachedData);
        }
    });
    profiler.registerObject(component, `[Component StoreEmptyCheck]`);
    return component;
}
/**
 * @param {ResourceConstant} resourceType
 * @param {string} [key = "storeId"]
 */
function ConstructObjectStoreFullCheckComponent(resourceType, key = "storeId") {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const storeObject = Game.getObjectById(attachedData[key]);
        if (!storeObject || !storeObject.store) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (typeof storeObject.store.getFreeCapacity(resourceType) !== "number") return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        // console.log(`Checking object ${storeObject}:${resourceType}:${storeObject.store.getFreeCapacity(resourceType)}`);
        if (storeObject.store.getFreeCapacity(resourceType) === 0) return ConstructSignal(OK, attachedData);
        else {
            attachedData.resourceType = resourceType;
            return ConstructSignal(ERR_NOT_ENOUGH_RESOURCES, attachedData);
        }
    });
    profiler.registerObject(component, `[Component ObjectStoreFullCheck]`);
    return component;
}
/**
 * @param {number} [dist = 1] Distance between object and target
 */
function ConstructMoveToComponent(dist = 1) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!attachedData.targetPos) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        /** @type {RoomPosition} */
        const targetPos = attachedData.targetPos;
        const currentPos = object.pos;
        // console.log(`<p style="display:inline;color:green;">Notice: </p>${target} : ${targetPos}, ${object} : ${currentPos}`);
        if (targetPos.roomName === currentPos.roomName && targetPos.getRangeTo(currentPos) <= dist) return ConstructSignal(OK, attachedData);
        else {
            object.travelTo(targetPos);
            return null;
        }
    });
    profiler.registerObject(component, `[Component MoveTo]`);
    return component;
}
/**
 * @param {(amount : number, resourceType : ResourceConstant) => Source | StructureContainer | StructureStorage | StructureLink} fetchFunc
 * @param {(object : import("./task.prototype").GameObject) => number } amountFunc
 * @param { ResourceConstant } [resourceType] Optional, unless fixed.
 */
function ConstructFetchResourceComponent(fetchFunc, amountFunc, resourceType) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const amount = amountFunc(object);
        const target = fetchFunc(amount, resourceType || attachedData.resourceType);
        if (!target) return ConstructSignal(ERR_NOT_FOUND, attachedData);
        else {
            attachedData.targetId = target.id;
            attachedData.amount = amount;
            attachedData.resourceType = resourceType || attachedData.resourceType;
            attachedData.targetPos = target.pos;
            return ConstructSignal(OK, attachedData);
        }
    });
    profiler.registerObject(component, `[Component FetchResource]`);
    return component;
}
/**
 * @param {(amount : number, resourceType : ResourceConstant) => StructureContainer | StructureStorage | StructureTerminal | StructureFactory} fetchFunc
 * @param {(object : import("./task.prototype").GameObject, resourceType : ResourceConstant) => number} amountFunc
 * @param {ResourceConstant} [resourceType] Optional, unless fixed.
 */
function ConstructFetchStoreComponent(fetchFunc, amountFunc, resourceType) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const amount = amountFunc(object, resourceType || attachedData.resourceType);
        const target = fetchFunc(amount, resourceType || attachedData.resourceType);
        if (!target) return ConstructSignal(ERR_NOT_FOUND, attachedData);
        else {
            attachedData.targetId = target.id;
            attachedData.amount = amount;
            attachedData.resourceType = resourceType || attachedData.resourceType;
            attachedData.targetPos = target.pos;
            return ConstructSignal(OK, attachedData);
        }
    });
    profiler.registerObject(component, `[Component FetchStore]`);
    return component;
}
/**
 * @param {ResourceConstant} [resourceType]
 */
function ConstructWithdrawHarvestResourceComponent(resourceType) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const target = Game.getObjectById(attachedData.targetId);
        // console.log(`${object} : ${target}`);
        if (!target) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (!object.store) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        const checkForFreeStore = require('./util').checkForFreeStore;
        // if (checkForFreeStore(object) === 0) return ConstructSignal(OK, attachedData);
        if (checkForStore(target, attachedData.resourceType || resourceType) === 0) return ConstructSignal(ERR_NOT_ENOUGH_RESOURCES, attachedData);
        if (isHarvestable(target)) {
            object.harvest(target);
            return null;
        } else {
            object.withdraw(target, attachedData.resourceType || resourceType, attachedData.amount || undefined);
            return ConstructSignal(OK, attachedData);
        }
    });
    profiler.registerObject(component, `[Component WithdrawHarvestResource]`);
    return component;
}
function ConstructDealTransactionComponent() {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const target = Game.getObjectById(attachedData.targetId);
        // console.log(attachedData.targetId, target, attachedData.amount, attachedData.resourceType);
        if (!target || !attachedData.amount || !attachedData.resourceType) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        const amount = Math.min(attachedData.amount, checkForStore(target, attachedData.resourceType));
        /* No Need To Check for Vacant Here */
        task.transactions[object.id] = new Transaction(task.mountObj, target, amount * getPrice(attachedData.resourceType), {info : {resourceType : attachedData.resourceType, amount : amount}, type : "resource"});
        task.transactions[object.id].Confirm();
        attachedData.amount = amount;
        return ConstructSignal(OK, attachedData);
    });
    profiler.registerObject(component, `[Component DealTransaction]`);
    return component;
}
/**
 * @param {string} [emittedSignal = OK]
 */
function ConstructDoneTransactionComponent(emittedSignal = OK) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!task.transactions[object.id]) return ConstructSignal(ERR_INVALID_TARGET, attachedData);
        task.transactions[object.id].Done();
        task.transactions[object.id] = undefined;
        return ConstructSignal(emittedSignal, attachedData);
    });
    profiler.registerObject(component, `[Component DoneTransaction]`);
    return component;
}
/**
 * @param {any} data
 * @param {string} key
 */
function ConstructStaticDataComponent(data, key) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        attachedData[key] = data;
        return ConstructSignal(OK, attachedData);
    });
    profiler.registerObject(component, `[Component StaticData]`);
    return component;
}
/**
 * @param {Id<any>} targetId
 * @param {string} [key = "targetId"]
 */
function ConstructStaticTargetComponent(targetId, key = "targetId") {
    return ConstructStaticDataComponent(targetId, key);
}
/**
 * @param {string} key
 */
function ConstructArrayLengthCheckComponent(key) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!attachedData[key] || !Array.isArray(attachedData[key])) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        if (attachedData[key].length === 0) return ConstructSignal(OK, attachedData);
        else return ConstructSignal(ARRAY_NOT_EMPTY, attachedData);
    });
    profiler.registerObject(component, `[Component ArrayLengthCheck]`);
    return component;
}
/**
 * @param {string} key
 * @param {string} targetKey
 */
function ConstructArrayPopComponent(key, targetKey) {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        if (!attachedData[key] || !Array.isArray(attachedData[key]) || attachedData[key].length === 0) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        else {
            attachedData[targetKey] = attachedData[key].pop();
            attachedData["params"] = [attachedData[targetKey]];
            return ConstructSignal(OK, attachedData);
        }
    });
    profiler.registerObject(component, `[Component ArrayPop]`);
    return component;
}
/**
 * @param {Function} func
 * @param {string} [targetKey = "targetId"]
 * @param {string} [paramKey = "params"]
 */
function ConstructDoSomethingComponent(func, targetKey = "targetId", paramKey = "params") {
    const component = new Component(function(object, task) {
        const attachedData = this.attachedData[object.id] || {};
        const target = Game.getObjectById(attachedData[targetKey]);
        if (!target) return ConstructSignal(ERR_INVALID_ARGS, attachedData);
        const ret = func.apply(object, [target].concat(attachedData[paramKey] || []));
        if (ret === OK) return null;
        else return ConstructSignal(ret, attachedData);
    });
    profiler.registerObject(component, `[Component DoSomething]`);
    return component;
}
/**
 * Create a Project to deposit irrelevant resources.
 * Project assumes attachedData contains { containedResourceTypes }.
 * Expect @property { ResourceConstant[] } containedResourceTypes in attachedData
 * @param {(amount : number, resourceType : ResourceConstant) => StructureContainer | StructureStorage | StructureTerminal | StructureFactory} fetchFunc
 */
function BuildDepositIrrelevantResourcesProject(fetchFunc) {
    const project = new Project()
                        .InsertLayer({
                            [OK] : new Project()
                                        .InsertLayer({[OK] : ConstructArrayLengthCheckComponent("containedResourceTypes")})
                                        .InsertLayer({[ARRAY_NOT_EMPTY] : ConstructArrayPopComponent("containedResourceTypes", "resourceType")})
                                        .InsertLayer({[OK] : ConstructFetchStoreComponent(fetchFunc, (object, resourceType) => object.store[resourceType])})
                                        .InsertLayer({[OK] : BuildGoToDoSomethingProject(1, Creep.prototype.transfer)})
                                        .Cyclize(OK)
                        })
                        .InsertLayer({
                            [OK] : ConstructEmptyComponent(OK),
                            [ERR_NOT_FOUND] : new Project()
                                                    .InsertLayer({[OK] : ConstructStoreFullCheckComponent()})
                                                    .InsertLayer({
                                                        [OK] : ConstructEmptyComponent(ERR_FULL),
                                                        [ERR_NOT_ENOUGH_RESOURCES] : ConstructEmptyComponent(OK)
                                                    })
                        });
    profiler.registerObject(project, `[Project DepositIrrelevantResources]`);
    return project;
}
/**
 * @param {number} [dist = 1]
 * @param {Function} func
 */
function BuildGoToDoSomethingProject(dist, func) {
    const project = new Project()
                        .InsertLayer({[OK] : ConstructMoveToComponent(dist)})
                        .InsertLayer({[OK] : ConstructDoSomethingComponent
                        (func)});
    profiler.registerObject(project, `[Project GoToDoSomething]`);
    return project;
}
/**
 * @param { ResourceConstant } resourceType
 * @param {(amount : number, resourceType : ResourceConstant) => Source | StructureContainer | StructureStorage | StructureLink} fetchFunc
 * @param {(amount : number, resourceType : ResourceConstant) => StructureContainer | StructureStorage | StructureTerminal | StructureFactory} storeFetchFunc
 * @param {(object : import("./task.prototype").GameObject) => number } amountFunc
 * @param {import("./task.prototype").GameObject | { targetId : Id<any>, targetPos : RoomPosition }} target
 * @param {number} [dist = 1] Distance between object and target
 * @param {Function} func
 * @param {any[]} [params = []]
 */
function BuildFetchResourceAndDoSomethingProject(resourceType, fetchFunc, storeFetchFunc, amountFunc, target, dist = 1, func, params = []) {
    const project = new Project()
                        .InsertLayer({[OK] : ConstructStoreCheckComponent([resourceType])})
                        .InsertLayer({
                            [OK] : ConstructEmptyComponent(OK),
                            [ERR_CONTAIN_IRRELATED_RESOURCES] : BuildDepositIrrelevantResourcesProject(storeFetchFunc)
                        })
                        .InsertLayer({[OK] : ConstructStoreEmptyCheckComponent(resourceType)})
                        .InsertLayer({
                            [ERR_FULL] : ConstructEmptyComponent(OK),
                            [OK] : 
                                new Project()
                                    .InsertLayer({
                                        [OK] : ConstructFetchResourceComponent(fetchFunc, amountFunc, resourceType)})
                                    .InsertLayer({
                                        [OK] : ConstructDealTransactionComponent()
                                    })
                                    .InsertLayer({
                                        [OK] : ConstructMoveToComponent(1)
                                    })
                                    .InsertLayer({
                                        [OK] : new Project()
                                                    .InsertLayer({
                                                        [OK] : ConstructStoreFullCheckComponent(resourceType)
                                                    })
                                                    .InsertLayer({
                                                        [ERR_NOT_ENOUGH_RESOURCES] : ConstructWithdrawHarvestResourceComponent(resourceType),
                                                        [OK] : ConstructDoneTransactionComponent()
                                                    })
                                                    .Mode("refresh")
                                    })
                                    .Cyclize(ERR_NOT_ENOUGH_RESOURCES)
                        })
                        .InsertLayer({
                            [OK] : new Project()
                                        .InsertLayer({[OK] : ConstructStaticDataComponent(target.id || target.targetId, "targetId")})
                                        .InsertLayer({[OK] : ConstructStaticDataComponent(target.pos || target.targetPos, "targetPos")})
                                        .InsertLayer({[OK] : ConstructStaticDataComponent(params, "params")}),
                            [ERR_NOT_FOUND] : new Project()
                                                .InsertLayer({[OK] : ConstructStoreEmptyCheckComponent(resourceType)})
                                                .InsertLayer({
                                                    [OK] : ConstructEmptyComponent(ERR_NOT_ENOUGH_RESOURCES),
                                                    [ERR_FULL] : ConstructEmptyComponent(OK)
                                                })
                        })
                        .InsertLayer({[OK] : BuildGoToDoSomethingProject(dist, func)});
    profiler.registerObject(project, `[Project GenericWork]`);
    return project;
}
module.exports = {
    Project : Project,
    Constructors : {
        ConstructDealTransactionComponent           : ConstructDealTransactionComponent,
        ConstructDoSomethingComponent               : ConstructDoSomethingComponent,
        ConstructDoneTransactionComponent           : ConstructDoneTransactionComponent,
        ConstructEmptyComponent                     : ConstructEmptyComponent,
        ConstructFetchResourceComponent             : ConstructFetchResourceComponent,
        ConstructMoveToComponent                    : ConstructMoveToComponent,
        ConstructNullComponent                      : ConstructNullComponent,
        ConstructObjectStoreFullCheckComponent      : ConstructObjectStoreFullCheckComponent,
        ConstructStaticDataComponent                : ConstructStaticDataComponent,
        ConstructStaticTargetComponent              : ConstructStaticTargetComponent,
        ConstructStoreCheckComponent                : ConstructStoreCheckComponent,
        ConstructStoreEmptyCheckComponent           : ConstructStoreEmptyCheckComponent,
        ConstructStoreFullCheckComponent            : ConstructStoreFullCheckComponent,
        ConstructWithdrawHarvestResourceComponent   : ConstructWithdrawHarvestResourceComponent
    },
    Builders : {
        BuildDepositIrrelevantResourcesProject  : BuildDepositIrrelevantResourcesProject,
        BuildFetchResourceAndDoSomethingProject : BuildFetchResourceAndDoSomethingProject,
        BuildGoToDoSomethingProject             : BuildGoToDoSomethingProject
    }
};