/**
 * @typedef {PristineSignals} LucySignals
 */
const PristineSignals = {
    IsStructureDestroy : {},
    IsConstructionSiteCancel : {},
    IsNewStructure : {},
    IsNewConstructionSite : {},
    IsAnyNewStructure : false,
    IsAnyNewConstructionSite : false,
    IsAnyStructureDestroy : false,
    IsAnyConstructionSiteCancel : false
};
const stringifiedPristineSignals = JSON.stringify(PristineSignals);
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const SignalPlugin = {
    /** Signal Initialization */
    resetEveryTick : () => {
        global.signals = JSON.parse(stringifiedPristineSignals);
    },
    tickStart : () => {
        Object.values(Game.rooms).filter(r => r.getEventLog().filter(e => e.event === EVENT_OBJECT_DESTROYED && e.data.type !== "creep").length > 0).forEach(r => {
            global.signals.IsStructureDestroy[r.name] = true;
            global.signals.IsAnyStructureDestroy = true;
        });
    }
};

global.Lucy.App.on(SignalPlugin);