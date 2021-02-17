/**
 * @module manager.terminals
 * Terminal functions based on "demand" from ResourceManager.
 * @typedef { {resourceType : ResourceConstant, amount : number, destination : string} } SendOrder
 * @typedef { {resourceType : ResourceConstant, amount : number} } BuyOrder
 * @typedef { {resourceType : ResourceConstant, amount : number} } SellOrder
 */
const TaskConstructor = require('./manager.tasks').TaskConstructor;
const Response        = require("./util").Response;
const checkForStore   = require("./util").checkForStore;
const getPrice        = require("./util").getPrice;
const Transaction     = require("./money.prototype").Transaction;
/** @type { {[id : string] : {[roomName : string] : {[resourceType in ResourceConstant]? : number}} } } */
const sendOrders = {};
/** @type { {[id : string] : {[resourceType in ResourceConstant]? : number}} } */
const buyOrders = {};
/** @type { {[id : string] : {[resourceType in ResourceConstant]? : number}} } */
const sellOrders = {};

const DEBUG = false;

class MyTerminal extends StructureTerminal {
    /**
     * @private
     * @param {SendOrder} order
     */
    pushSendOrder(order) {
        if (DEBUG) console.log(`${this} => Push SendOrder (${JSON.stringify(order)})`);
        if (!sendOrders[this.id]) sendOrders[this.id] = {};
        if (!sendOrders[this.id][order.destination]) sendOrders[this.id][order.destination] = {};
        if (!sendOrders[this.id][order.destination][order.resourceType]) sendOrders[this.id][order.destination][order.resourceType] = 0;
        this.Request(RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false});
        sendOrders[this.id][order.destination][order.resourceType] = Math.max(sendOrders[this.id][order.destination][order.resourceType], order.amount);
    }
    /**
     * @private
     * @returns {{[roomName : string] : {[resourceType in ResourceConstant]? : number}}}
     */
    getSendOrders() {
        return sendOrders[this.id] || {};
    }
    /**
     * @private
     * @param {BuyOrder} order
     */
    pushBuyOrder(order) {
        if (DEBUG) console.log(`${this} => Push BuyOrder (${JSON.stringify(order)})`);
        if (!buyOrders[this.id]) buyOrders[this.id] = {};
        if (!buyOrders[this.id][order.resourceType]) buyOrders[this.id][order.resourceType] = 0;
        this.Request(RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false});
        buyOrders[this.id][order.resourceType] = Math.max(order.amount, buyOrders[this.id][order.resourceType]);
    }
    /**
     * @private
     * @returns { {[resourceType in ResourceConstant] ? : number} }
     */
    getBuyOrders() {
        return buyOrders[this.id] || {};
    }
    /**
     * @private
     * @param {SellOrder} order
     */
    pushSellOrder(order) {
        if (DEBUG) console.log(`${this} => Push SellOrder (${JSON.stringify(order)})`);
        if (!sellOrders[this.id]) sellOrders[this.id] = {};
        if (!sellOrders[this.id][order.resourceType]) sellOrders[this.id][order.resourceType] = 0;
        this.Request(RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false});
        sellOrders[this.id][order.resourceType] = Math.max(order.amount, sellOrders[this.id][order.resourceType]);
    }
    /**
     * @private
     * @returns {{[resourceType in ResourceConstant]? : number}}
     */
    getSellOrders() {
        return sellOrders[this.id] || {};
    }
    /**
     * Request by transfering resources from other structures in the room same with terminal itself to terminal.
     * @private
     * @param {ResourceConstant} resourceType
     * @param {number} amount
     * @returns {number}
     */
    requestByInRoomTransfer(resourceType, amount) {
        if (DEBUG) console.log(`${this}, requestByInRoomTransfer ${resourceType}:${amount}`);
        /** @type {import("./task.prototype").GameObject} */
        let target = global.ResourceManager.Query(this, resourceType, amount, {key : "default", confinedInRoom : true, allowStore : true, allowToHarvest : false, type : "retrieve", avoidRequest : true, allowStructureTypes : [STRUCTURE_STORAGE, STRUCTURE_FACTORY]});
        let sum = 0;
        while (amount > 0 && this.store.getFreeCapacity() > 0 && target) {
            const dealingAmount = Math.min(amount, this.store.getFreeCapacity(), checkForStore(target, resourceType));
            if (DEBUG) console.log(`${target}->${dealingAmount}`);
            sum += dealingAmount;
            amount -= dealingAmount;
            const transaction = new Transaction(this, target, getPrice(resourceType) * amount, {type : "resource", info : {resourceType : resourceType, amount : dealingAmount}});
            transaction.Confirm();
            TaskConstructor.TransferTask({fromId : target.id, fromPos : target.pos}, {toId : this.id, toPos : this.pos}, {list : {[resourceType] : dealingAmount}, transactions : {[resourceType] : transaction}}, {merge : false});
            target = global.ResourceManager.Query(this, resourceType, amount, {key : "default", confinedInRoom : true, allowStore : true, allowToHarvest : false, type : "retrieve", avoidRequest : true, allowStructureTypes : [STRUCTURE_STORAGE, STRUCTURE_FACTORY]});
        }
        return sum;
    }
    Earn() {
        if (DEBUG) console.log(`${this}=>Earn`);
        /** @type {import("./lucy.rules").SellingList} */
        const sellingList = global.Lucy.Rules.terminal.sellingLists;
        for (const resourceType in sellingList) {
            const reservedAmount = sellingList[resourceType].reservedAmount;
            const storingAmount = global.ResourceManager.Sum(this.room.name, resourceType, {type : "retrieve", allowStore : true, allowToHarvest : false});
            if (DEBUG && storingAmount > 0) console.log(`${resourceType}: ${storingAmount}`);
            if (storingAmount > reservedAmount) {
                this.Request(resourceType, storingAmount - reservedAmount, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false});
                this.pushSellOrder({resourceType : resourceType, amount : storingAmount - reservedAmount});
            }
        }
    }
    /**
     * NOTICE : `amount` is guaranteed.
     * @TODO Solve Request Duplication Problem.
     * @param {ResourceConstant} resourceType
     * @param {number} amount
     * @param { {byInRoomTransfer? : boolean, byCrossRoomSend? : boolean, byOrder ? : boolean} } [options = {}]
     * @returns {number}
     */
    Request(resourceType, amount, options = {}) {
        _.defaults(options, {byInRoomTransfer : true, byCrossRoomSend : true, byOrder : true});
        if (DEBUG) console.log(`${this} Request (resourceType ${resourceType}, amount ${amount}, options ${JSON.stringify(options)})`);
        /**
         * Request Steps:
         *  - Terminal itself.
         *  - Other Store Structures in the same room.
         *  - Terminal in the other rooms.
         *  - Order
         * Follow Accumulation Pattern.
         */
        let sum = Math.min(this.store[resourceType], amount);
        if (options.byInRoomTransfer && sum < amount) sum += this.requestByInRoomTransfer(resourceType, amount - sum);
        if (options.byCrossRoomSend && sum < amount) {
            /** @type {MyTerminal[]} */
            const terminals = global.TerminalManager.Query().filter(t => t.id !== this.id).sort((u, v) => Game.map.getRoomLinearDistance(u.room.name, this.room.name) - Game.map.getRoomLinearDistance(v.room.name, this.room.name));
            terminals.forEach(t => {
                if (sum >= amount) return;
                const requestAmount = t.Request(resourceType, amount - sum, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false});
                if (requestAmount > 0) {
                    sum += requestAmount;
                    t.pushSendOrder({resourceType, amount : requestAmount, destination : this.room.name});
                }
            });
        }
        if (options.byOrder && sum < amount) {
            /**
             * Remaining part is all taken by `buying` process.
             */
            this.pushBuyOrder({resourceType : resourceType, amount : amount - sum});
            sum = amount;
        }
        return sum;
    }
    Run() {
        const ENERGY_REQUEST_INTERVAL = 50;
        if (this.cooldown > 0) return;
        let availableEnergy = this.store[RESOURCE_ENERGY];
        if (availableEnergy < global.Lucy.Rules.terminal.startEnergy) return Game.time % ENERGY_REQUEST_INTERVAL === 0 ? this.Request(RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false}) : null;
        /**
         * 1. Respond to `send` orders
         */
        const sendOrders = this.getSendOrders();
        let hasSended = false;
        for (const roomName in sendOrders) {
            for (const resourceType in sendOrders[roomName]) {
                if (sendOrders[roomName][resourceType] <= 0 || this.store[resourceType] === 0) {
                    // Lacking Resources
                    continue;
                }
                const costPerUnit = Game.market.calcTransactionCost(1, this.room.name, roomName);
                const amount = Math.min(sendOrders[roomName][resourceType], Math.floor(availableEnergy / costPerUnit), this.store[resourceType]);
                const retCode = this.send(resourceType, amount, roomName);
                if (retCode !== OK) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> ${this} fails to send order to ${roomName} (resourceType ${resourceType}, amount ${amount}) with code ${retCode}`);
                } else {
                    sendOrders[roomName][resourceType] -= amount;
                    /**
                     * Accumulate Consumption of Energy at the same tick.
                     */
                    availableEnergy -= Math.ceil(costPerUnit * amount);
                    if (resourceType === RESOURCE_ENERGY) availableEnergy -= amount;
                    hasSended = true;
                    /**
                     * Whenever there is consumption, ensuring refilling.
                     */
                    global.Lucy.Timer.add(Game.time + 1, this.Request, this.id, [RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false}], `Refilling Terminal ${this} with Base Energy`);
                    break;
                }
            }
            if (hasSended) break;
        }
        /**
         * 2. Respond to `sell` orders
         */
        if (availableEnergy < global.Lucy.Rules.terminal.startEnergy) return;
        const sellOrders = this.getSellOrders();
        for (const resourceType in sellOrders) {
            if (sellOrders[resourceType] <= 0 || this.store[resourceType] === 0) continue;
            const order = Game.market.getAllOrders({type : ORDER_BUY, resourceType : resourceType}).filter(o => o.amount > 0).sort((u, v) => v.price * getPrice("credit") - (Game.market.calcTransactionCost(1, v.roomName, this.room.name) || 0) * getPrice("energy") - u.price * getPrice("credit") + (Game.market.calcTransactionCost(1, u.roomName, this.room.name) || 0) * getPrice("energy"))[0];
            if (!order) {
                /**
                 * @TODO
                 * Issue Selling Order
                 */
                continue;
            }
            const costPerUnit = Game.market.calcTransactionCost(1, this.room.name, order.roomName);
            const amount = Math.min(order.amount, this.store.getUsedCapacity(resourceType), Math.floor(availableEnergy / costPerUnit));
            const retCode = Game.market.deal(order.id, amount, this.room.name);
            if (retCode !== OK) {
                console.log(`<p style="display:inline;color:red;">Error:</p> Unable to deal Sell ${order.id} with {resourceType : ${order.resourceType}, amount : ${amount}, roomName : ${this.room.name}} with code ${retCode}`);
            } else {
                sellOrders[resourceType] -= amount;
                /**
                 * Accumulate Consumption of Energy at the same tick.
                 */
                availableEnergy -= Math.ceil(costPerUnit * amount);
                /**
                 * Whenever there is consumption, ensuring refilling.
                 */
                global.Lucy.Timer.add(Game.time + 1, this.Request, this.id, [RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false}], `Refilling Terminal ${this} with Base Energy`);
                return;
            }
        }
        /**
         * 3. Respond to `buy` orders
         */
        if (availableEnergy < global.Lucy.Rules.terminal.startEnergy) return;
        if (this.store.getFreeCapacity() > 0) {
            const buyOrders = this.getBuyOrders();
            for (const resourceType in buyOrders) {
                if (buyOrders[resourceType] <= 0) continue;
                /**
                 * Considering the ticks of cooldown, buying as much as possible and needed resources is preferred in a single behavior of dealing.
                 */
                const allOrders = Game.market.getAllOrders({type : ORDER_SELL, resourceType : resourceType}).filter(o => o.amount > Math.min(global.Lucy.Rules.terminal.minimumBuyingAmount, buyOrders[resourceType]));
                const orders = allOrders.filter(o => o.price < Game.market.credits);
                const order = orders.sort((u, v) => u.price * getPrice("credit") + (Game.market.calcTransactionCost(1, u.roomName, this.room.name) || 0) * getPrice("energy") - v.price * getPrice("credit") - (Game.market.calcTransactionCost(1, v.roomName, this.room.name) || 0) * getPrice("energy"))[0];
                if (DEBUG) console.log(availableEnergy, resourceType, buyOrders[resourceType], allOrders.length, orders.length, order);
                if (!order) {
                    if (allOrders.length === 0) {
                        /**
                         * @TODO
                         * Issue Buying Orders
                         */
                    } else if (orders.length === 0) {
                        // Credit Lacking
                        global.TerminalManager.Earn();
                    }
                    continue;
                }
                const costPerUnit = Game.market.calcTransactionCost(1, this.room.name, order.roomName);
                const amount = Math.min(order.amount, this.store.getFreeCapacity(), Math.floor(availableEnergy / costPerUnit), Math.floor(Game.market.credits / order.price), buyOrders[resourceType]);
                if (buyOrders[resourceType] >= global.Lucy.Rules.terminal.minimumBuyingAmount && amount < global.Lucy.Rules.terminal.minimumBuyingAmount) {
                    // Credit Lacking
                    global.TerminalManager.Earn();
                    continue;
                }
                const retCode = Game.market.deal(order.id, amount, this.room.name);
                if (retCode !== OK) {
                    console.log(`<p style="display:inline;color:red;">Error:</p> Unable to deal Buy ${order.id} with {resourceType : ${order.resourceType}, amount : ${amount}, roomName : ${this.room.name}} with code ${retCode}`);
                } else {
                    buyOrders[resourceType] -= amount;
                    /**
                     * Accumulate Consumption of Energy at the same tick.
                     */
                    availableEnergy -= Math.ceil(costPerUnit * amount);
                    /**
                     * Whenever there is consumption, ensuring refilling.
                     */
                    global.Lucy.Timer.add(Game.time + 1, this.Request, this.id, [RESOURCE_ENERGY, global.Lucy.Rules.terminal.startEnergy, {byInRoomTransfer : true, byCrossRoomSend : false, byOrder : false}], `Refilling Terminal ${this} with Base Energy`);
                    return;
                }
            }
        }
    }
};

global.Lucy.App.mount(StructureTerminal, MyTerminal);

class TerminalManager {
    /**
     * @param {StructureTerminal} terminal
     */
    Register(terminal) {
        this.terminals.push(terminal.id);
    }
    /**
     * @param {string} roomName
     * @param {ResourceConstant} resourceType
     * @param {number} amount
     */
    Request(roomName, resourceType, amount) {
        const terminal = this.Query().filter(t => Game.map.getRoomLinearDistance(t.room.name, roomName) <= 1).sort((u, v) => Game.map.getRoomLinearDistance(u, roomName) - Game.map.getRoomLinearDistance(v, roomName))[0];
        if (terminal) terminal.Request(resourceType, amount);
    }
    /**
     * @returns {Array<MyTerminal>}
     */
    Query() {
        if (!this._tick || this._tick < Game.time) {
            this._tick = Game.time;
            return this._terminals = this.terminals.map(Game.getObjectById).filter(t => t);
        } else return this._terminals;
    }
    Run() {
        this.Query().forEach(t => t.Run());
    }
    /**
     * @TODO
     * Could be triggered when the free capacity of storage or terminal is in the shortage.
     */
    Earn() {
        this.Query().forEach(t => t.Earn());
    }
    constructor() {
        /** @type {Array<Id<StructureTerminal>>} */
        this.terminals = [];
    }
}
const _terminalManager = new TerminalManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const TerminalPlugin = {
    init : () => global.TerminalManager = _terminalManager,
    tickStart : () => global.TerminalManager.Run()
};

global.Lucy.App.on(TerminalPlugin);