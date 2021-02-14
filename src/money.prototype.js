/** 
 * @module money
 * In this module, `money` is divided into several groups: *Main Purpose is to describe money in hand precisely*
 *  - Cash - Current Free Money
 *  - Borrowed Money ( from Bank )
 * 
 * @typedef {"cash" | "borrowed"} MoneyType
 * @typedef { {type : "resource", info : { resourceType : ResourceConstant, amount : Number }} } TransactionDescription
 * @typedef {Transaction} Transaction
 */
const { EventMoneyIn, EventMoneyOut }   = require('./lucy.log');
const checkForStore                     = require('./util').checkForStore;
const isSpawn                           = require('./util').isSpawn;
const isController                      = require('./util').isController;
/* Record All Accounts */
const accounts      = {};
/** 
 * Class Representation for Account
 * After global reset, all information about transaction or borrowing is lost (for the efficiency reason).
 */
class Account {
    /**
     * payDebt pays the borrowed debt by appropriate portion within the capability.
     * @private
     */
    payDebt() {
        const debt = global.Bank.Query(this.mountObj);
        if (debt === 0) return;
        /* Amount here ensures the `borrow` behavior will not be triggered. */
        global.Bank.PayBack(this.mountObj, this.cash + this.borrowedMoney);
    }
    /**
     * In represents general receiving money.
     * @param {import('./task.prototype').GameObject} giver
     * @param {number} amount amount > 0
     * @param { MoneyType } type
     */
    In(giver, amount, type) {
        if (type === "cash") this.cash += amount;
        else if (type === "borrowed") this.borrowedMoney += amount;
        this.payDebt();
        /**
         * @type {import('./lucy.log').LogPool}
         */
        const LogModule = Lucy.Logs;
        LogModule.Push(new EventMoneyIn(this, {absNum:amount, giver : giver}, type));
    }
    /**
     * Out will first check out whether there is enough money in cash.
     * If not, it will try to use the borrowed money.
     * If there is not enough borrowed money left, it will trigger the `borrow` method.
     * If `borrow` failed, it will return `false`.
     * @param {import('./task.prototype').GameObject} receiver
     * @param {number} amount amount > 0
     * @param {Boolean} isAbsolute if it is true, `Out` will throw error of "bankruptcy" in the case of returning `false`.
     * @returns {Boolean}
     */
    Out(receiver, amount, isAbsolute = false) {
        /**
         * @type {MoneyType | "combined"}
         */
        let outMoneyType = "";
        if (this.cash >= amount) {
            this.cash -= amount;
            outMoneyType = "cash";
        } else if (this.borrowedMoney >= amount) {
            this.borrowedMoney -= amount;
            outMoneyType = "borrowed";
        } else if (this.cash + this.borrowedMoney >= amount) {
            this.borrowedMoney = this.borrowedMoney - (amount - this.cash);
            this.cash = 0;
            outMoneyType = "combined";
        } else {
            const total = this.cash + this.borrowedMoney;
            this.cash = 0;
            this.borrowedMoney = 0;
            if (!global.Bank.Borrow(this.mountObj, amount - total)) {
                if (isAbsolute) console.log(`<p style="display:inline;color:red;">${this.id} is bankrupted!</p>`);
                else return false;
            }
            outMoneyType = "combined";
        }
        /**
         * @type {import('./lucy.log').LogPool}
         */
        const LogModule = Lucy.Logs;
        LogModule.Push(new EventMoneyOut(this, {absNum: amount, receiver: receiver}, outMoneyType));
        return true;
    }
    /**
     * Make bind `transaction` to the `account`.
     * @param { "asBuyer" | "asSeller" } type
     * @param {Transaction} transaction
     */
    Make(type, transaction) {
        if (type === "asBuyer") {
            /* Initialize Storing Array */
            this.transactions["asBuyer"][transaction.Seller.id] = this.transactions["asBuyer"][transaction.Seller.id] || [];
            this.transactions["asBuyer"][transaction.Description.type] = this.transactions["asBuyer"][transaction.Description.type] || [];
            /* Push Transaction */
            this.transactions["asBuyer"][transaction.Seller.id].push(transaction);
            this.transactions["asBuyer"][transaction.Description.type].push(transaction);
        } else if (type === "asSeller") {
            /* Initialize Storing Array */
            this.transactions["asSeller"][transaction.Buyer.id] = this.transactions["asSeller"][transaction.Buyer.id] || [];
            this.transactions["asSeller"][transaction.Description.type] = this.transactions["asSeller"][transaction.Description.type] || [];
            /* Push Transaction */
            this.transactions["asSeller"][transaction.Buyer.id].push(transaction);
            this.transactions["asSeller"][transaction.Description.type].push(transaction);
        }
    }
    /**
     * Dealt exclude `transaction` from `this.transactions`.
     * @param {"asBuyer" | "asSeller"} type
     * @param {Transaction} transaction
     * @returns {Boolean}
     */
    Dealt(type, transaction) {
        if (!this.transactions[type][transaction.Description.type]) return false;
        let isSuccess = false;
        for (let i = 0; i < this.transactions[type][transaction.Description.type].length; ++i) {
            if (this.transactions[type][transaction.Description.type][i] === transaction) {
                this.transactions[type][transaction.Description.type].pop(i);
                isSuccess = true;
                break;
            }
        }
        if (!isSuccess) return false;
        if (type === "asBuyer") {
            if (!this.transactions["asBuyer"][transaction.sellerId]) return false;
            for (let i = 0; i < this.transactions["asBuyer"][transaction.sellerId].length; ++i) {
                if (this.transactions["asBuyer"][transaction.sellerId][i] === transaction) {
                    this.transactions["asBuyer"][transaction.sellerId].pop(i);
                    return true;
                }
            }
        } else if (type === "asSeller") {
            if (!this.transactions["asSeller"][transaction.buyerId]) return false;
            for (let i = 0; i < this.transactions["asSeller"][transaction.buyerId].length; ++i) {
                if (this.transactions["asSeller"][transaction.buyerId][i] === transaction) {
                    this.transactions["asSeller"][transaction.buyerId].pop(i);
                    return true;
                }
            }
        }
        return false;
    }
    /**
     * Query returns the selected transactions.
     * @param {"asBuyer" | "asSeller"} type
     * @param { {objectId : string} | {transactionType : string} } key
     * @param { (transaction : Transaction) => Boolean } filterFunc
     * @returns {Array<Transaction>}
     */
    Query(type, key, filterFunc) {
        let transactions = [];
        if (key.objectId) {
            transactions = this.transactions[type][key.objectId];
        } else if (key.transactionType) {
            transactions = this.transactions[type][key.transactionType];
        }
        return _.filter(transactions, filterFunc);
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get mountObj() {
        if (!this._mountObj_s || this._mountObj_s < Game.time) {
            this._mountObj_s = Game.time;
            return this._mountObj = Game.getObjectById(this.mountObjId);
        } else return this._mountObj;
    }
    /**
     * @param {import("./task.prototype").GameObject} mountObj 
     */
    constructor(mountObj) {
        /** 
         * @type {import("./task.prototype").GameObject}
         * @private
         */
        this.mountObjId = mountObj.id;
        /**
         * @type {number}
         * @private
         */
        this.cash = 0;
        /**
         * @type {number}
         * @private
         */
        this.borrowedMoney = 0;
        /**
         * @type { { "asBuyer": {[id : string]: Array<Transaction>}, "asSeller": {[id : string] : Array<Transaction} } }
         * @private
         * This map records all transactions in which `this` is involved.
         */
        this.transactions = {
            "asBuyer": {},
            "asSeller": {}
        };
    }
}
const TRANSACTION_STATE = Object.freeze({
    WAITING_FOR_CONFIRM: 0,
    WORKING: 1,
    /* Could be result of Cancel or Done */
    DEAD : 2
});
/**
 * Class Representation for Transaction.
 * Transaction is done between two objects.
 * @typedef {0 | 1 | 2} TransactionState
 */
class Transaction {
    /**
     * Confirm confirms this transaction enters `working` state after checking feasibility.
     * @returns {boolean | "no_specific_transfer_involved"}
     */
    Confirm() {
        if (this.state === TRANSACTION_STATE.DEAD) return false;
        if (this.state !== TRANSACTION_STATE.WAITING_FOR_CONFIRM) return false;
        /** Checking For Feasibility */
        if (this.description.type === "resource") {
            if (checkForStore(this.Seller, this.description.info.resourceType) < this.description.info.amount) return false;
        }
        this.state = TRANSACTION_STATE.WORKING;
        this.Buyer.account.Make("asBuyer", this);
        this.Seller.account.Make("asSeller", this);
        /**
         * Fast Resource Transfer among CentralTransferUnit
         */
        if (this.Buyer.pos && this.Seller.pos && this.Buyer.pos.roomName === this.Seller.pos.roomName && Game.rooms[this.Buyer.pos.roomName].centralTransfer) {
            const room = Game.rooms[this.Buyer.pos.roomName];
            /** @type {import('./rooms.behaviors').CentralTransferUnit} */
            const centralTransferUnit = room.centralTransfer;
            if (centralTransferUnit.IsBelongTo(this.Buyer) && centralTransferUnit.IsBelongTo(this.Seller)) {
                centralTransferUnit.PushOrder({from : this.Seller.structureType, to : this.Buyer.structureType, resourceType : this.description.info.resourceType, amount : this.description.info.amount, callback : function() { this.Done(); }.bind(this)});
                return "no_specific_transfer_involved";
            }
        }
        return true;
    }
    /**
     * Done makes this transaction enters `DEAD` state from `WORKING` state.
     * If `buyer` fails to pay, error will be throwed.
     * @returns {boolean}
     */
    Done() {
        // console.log(`<p style="color:yellow;display:inline;">[Money]</p> Transaction between ${this.Buyer} and ${this.Seller} is done with ${JSON.stringify(this.description.info)}.`);
        if (this.state === TRANSACTION_STATE.DEAD) return false;
        if (this.state !== TRANSACTION_STATE.WORKING) return false;
        if (this.Buyer) this.Buyer.account.Dealt("asBuyer", this);
        if (this.Seller) this.Seller.account.Dealt("asSeller", this);
        if (this.Buyer && this.Seller) {
            this.Buyer.account.Out(this.Seller, this.transactionMoney, true);
            this.Seller.account.In(this.Buyer, this.transactionMoney, "cash");
        }
        this.state = TRANSACTION_STATE.DEAD;
        return true;
    }
    /**
     * Cancel cancels the dealt.
     * After cancellation, `buyer` will pay fine.
     */
    Cancel() {
        if (this.state === TRANSACTION_STATE.DEAD) return false;
        if (this.state === TRANSACTION_STATE.WAITING_FOR_CONFIRM) {
            this.state = TRANSACTION_STATE.DEAD;
            return true;
        } else if (this.state === TRANSACTION_STATE.WORKING) {
            this.Buyer.account.Out(global.Bank ,this.cancelFee, true);
        }
    }
    get Description() {
        return this.description;
    }
    get State() {
        return this.state;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Buyer() {
        if (!this._buyer_s || this._buyer_s < Game.time) {
            this._buyer_s = Game.time;
            return this._buyer = Game.getObjectById(this.buyerId);
        } else return this._buyer;
    }
    /**
     * @returns {import("./task.prototype").GameObject}
     */
    get Seller() {
        if (!this._seller_s || this._seller_s < Game.time) {
            this._seller_s = Game.time;
            return this._seller = Game.getObjectById(this.sellerId);
        } else return this._seller;
    }
    /**
     * @param {import("./task.prototype").GameObject} buyer Object who uses `money` to achieve some goals.
     * @param {import("./task.prototype").GameObject} seller Object who sells something to get money.
     * @param {number} transactionMoney
     * @TODO
     * @param {TransactionDescription} description Description of the Transaction
     */
    constructor(buyer, seller, transactionMoney, description) {
        this.buyerId = buyer.id;
        this.sellerId = seller.id;
        /**
         * @type {number}
         * @private
         */
        this.transactionMoney = transactionMoney;
        /**
         * @type {number}
         * @private
         */
        this.cancelFee = transactionMoney * Lucy.Rules["transactionConfigure"]["fineRate"];
        /**
         * @type {TransactionState}
         * @private
         */
        this.state = TRANSACTION_STATE.WAITING_FOR_CONFIRM;
        /**
         * @type {TransactionDescription}
         * @private
         */
        this.description = description;
        // console.log(`<p style="color:yellow;display:inline;">[Money]</p> Transaction between ${this.Buyer} and ${this.Seller} is created with ${JSON.stringify(this.description.info)}.`);
    }
}
/** 
 * Class Representation for Bank 
 * However, its main role in my bot is to manage orders and releasing loans.
 */
class Bank {
    /**
     * Borrow implements "borrowing money from Bank".
     * If its borrowed money exceeds maximum limit, it will return false.
     * @param {import('./task.prototype').GameObject} obj
     * @param {Number} num
     * @returns {Boolean}
     */
    Borrow(obj, num) {
        /* Currently, without limitation. */
        return true;
    }
    /**
     * PayBack implements "paying back the debt"
     * @param {import('./task.prototype').GameObject} obj
     * @param {Number} num
     * @returns {Boolean}
     */
    PayBack(obj, num) {
        num = Math.min(num, this.accountBooks[obj.id] || 0);
        if (num === 0) return true;
        if (!obj.account.Out(this, num)) return false;
        this.accountBooks[obj.id] -= num;
        return true;
    }
    /**
     * Query returns how much money has been borrowed into the object.
     * @param {import('./task.prototype').GameObject} obj
     * @returns {Number}
     */
    Query(obj) {
        return this.accountBooks[obj.id] || 0;
    }
    constructor() {
        /**
         * @type { { [id:string]: number } }
         * @private
         * accountBooks record all borrowed money.
         */
        this.accountBooks = Memory.Bank.accountBooks || {};
    }
}
function mount() {
    Object.defineProperty(Object.prototype, "account", {
        get() {
            if (!this.id) console.log(`<p style = "color : red; display : inline;">Cannot set "account" to object ${this}, who loses "id" property!</p>`);
            if (!accounts[this.id]) return accounts[this.id] = new Account(this);
            return accounts[this.id];
        },
        enumerable : false,
        configurable : false
    });
}
global.Bank = new Bank();
global.Lucy.App.mount(mount);
module.exports = {
    TRANSACTION_STATE   : TRANSACTION_STATE,
    Transaction         : Transaction
};