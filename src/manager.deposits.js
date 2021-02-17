/**
 * @module manager.deposits
 * Carry out the task of harvesting deposits
 */

class DepositManager {
    /**
     * @private
     */
    initClean() {
        const depositIds = Object.keys(_deposits);
        for (const depositId of depositIds) this.Clean(depositId);
    }
    /**
     * @private
     */
    initRegister() {
        for (const depositId in _deposits) {
            /** Trigger Harvesting Task */
            this.Trigger(depositId);
        }
    }
    Init() {
        this.initClean();
        this.initRegister();
    }
    Trigger(depositId) {

    }
    /**
     * @param {Deposit} deposit
     */
    Register(deposit) {
        if (_deposits[deposit.id]) {
            _deposits[deposit.id].disappearTick = Game.time + deposit.ticksToDecay;
            _deposits[deposit.id].lastCooldown = deposit.lastCooldown;
        } else {
            _deposits[deposit.id] = {pos : deposit.pos, depositType : deposit.depositType, disappearTick : Game.time + deposit.ticksToDecay, lastCooldown : deposit.lastCooldown};
            /** Trigger Harvesting Task */
            this.Trigger(deposit.id);
            /** Schedule Clean Task */
            global.Lucy.Timer.add(Game.time + deposit.ticksToDecay, this.Clean, this, [deposit.id], `Clean "${deposit.id} at ${deposit.pos}"`);
        }
    }
    /**
     * @param {Id<Deposit>} depositId
     */
    Clean(depositId) {
        if (!_deposits[depositId]) return true;
        if (Game.time < _deposits[depositId].disappearTick) {
            /** Continue Clean Task */
            global.Lucy.Timer.add(_deposits[depositId].disappearTick, this.Clean, this, [depositId], `Clean "${depositId}" at ${_deposits[depositId].pos}`);
            return true;
        }
        if (Game.rooms[_deposits[depositId].pos.roomName] && Game.getObjectById(depositId)) {
            /** Refresh Information */
            this.Register(Game.getObjectById(depositId));
            /** Continue Clean Task */
            global.Lucy.Timer.add(_deposits[depositId].disappearTick, this.Clean, this, [depositId], `Clean "${depositId}" at ${_deposits[depositId].pos}`);
            return true;
        }
        delete _deposits[depositId];
        return true;
    }
    constructor() {}
}

if (!Memory._deposits) Memory._deposits = {};
/** @type { {[id : string] : {pos : RoomPosition, depositType : DepositConstant, disappearTick : number, lastCooldown : number}} } */
const _deposits = Memory._deposits;
const _depositManager = new DepositManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const DepositPlugin = {
    init : () => global.DepositManager = _depositManager,
    reset : () => global.DepositManager.Init()
};

global.Lucy.App.on(DepositPlugin);