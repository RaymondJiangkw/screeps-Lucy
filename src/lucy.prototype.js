const { App }       = require("./lucy.app");
const { Timer }     = require("./lucy.timer");
const { LogPool }   = require("./lucy.log");
const Lucy = {
    Rules   : require("./lucy.rules"),
    Logs    : new LogPool(),
    App     : new App(),
    Timer   : new Timer()
};
global.Lucy = Lucy;
Lucy.App.on({
    /** Signal Initialization */
    beforeTickStart : () => {
        global.signals = {
            IsStructureDestroy : {},
            IsConstructionSiteCancel : {},
            IsNewStructure : {},
            IsNewConstructionSite : {}
        };
    }
});
/** Mount Creep.prototype.travelTo */
require('./Traveler');
/** Mount structures on Room.prototype */
require('./prototype.Room.structures');
/** Mount resources on Room.prototype */
require('./prototype.Room.resources');
/** Mount Extended Native Type */
require("./util");
/** Mount Extended Memory */
require("./memory.prototype");
/** Timer Done after Garbage memory Collection, since there could be updates of information */
Lucy.App.on({tickStart : () => Lucy.Timer.done()});
/** Mount Encapsulation for Native Functions and some Extended Properties */
require("./native.encapsulation");
/** Mount Extended Requirements of Money System */
require("./money.prototype");
/** Mount Extended Requirements of Task System */
require("./task.prototype");
/** Mount Extended Behaviors of Rooms */
require("./rooms.behaviors");
/** Mount Extended Behaviors of Resources */
require("./resources.behaviors");
/** Mount Extended Behaviors of Structures */
require("./structures.behaviors");
/** Mount Extended Behaviors of Creeps */
require("./creeps.behaviors");
/** Mount Managers */
require("./manager.map");
require("./manager.resources");
/** Handle Events from Last Tick */
Lucy.App.on(Lucy.Logs.Plugin);
require("./manager.links");
require("./manager.tasks");
require("./manager.creeps");