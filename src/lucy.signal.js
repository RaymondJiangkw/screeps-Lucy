const isMyRoom = require("./util").isMyRoom;
/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const SignalPlugin = {
    /** Signal Initialization */
    beforeTickStart : () => {
        global.signals = {
            IsStructureDestroy : {},
            IsConstructionSiteCancel : {},
            IsNewStructure : {},
            IsNewConstructionSite : {}
        };
    },
    tickStart : () => {
        // Object.values(Game.rooms).filter(r => isMyRoom(r) && r.getEventLog().filter(e => e.event === EVENT_OBJECT_DESTROYED && e.data.type !== "creep").length > 0).forEach(r => {
        //    global.signals.IsStructureDestroy[r.name] = true;
        //    global.signals.IsAnyStructureDestroy = true;
        // });
    }
};

global.Lucy.App.on(SignalPlugin);