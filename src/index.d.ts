declare namespace NodeJS {
    interface Global {
        /** Global Manipulation */
        Lucy : {
            /** Containing Rules guiding AI's behaviors */
            Rules : import("./lucy.rules").Rules,
            /** Used for scheduling functions */
            Timer : import("./lucy.timer").Timer,
            /** Used for manipulating Logs */
            Logs : import("./lucy.log").LogPool,
            /** Used for defining and executing Lifecycle */
            App : import("./lucy.app").App,
            /** Used for gathering information */
            Collector : import("./lucy.collector").Collector
        },
        /** Global Signals */
        signals : import("./lucy.signal").Signals,
        /** Global Augmented Map */
        Map : import("./manager.map").Map,
        /** Global Monitor for Rooms */
        MapMonitorManager : import("./manager.map").MapMonitor,
        /** Planner for Rooms */
        Planner : import("./manager.map").Planner,
        /** Global Manipulation for Attack */
        AttackManager : import("./manager.attack").AttackManager,
        /** Global Manipulation for Defend */
        DefendManager : import("./manager.defend").DefendManager,
        /** Global Manipulation for Task */
        TaskManager : import("./manager.tasks").TaskManager,
        /** Global Manipulation for Market */
        TerminalManager : import("./manager.terminals").TerminalManager,
        /** Global Manipulation for Resources */
        ResourceManager : import("./manager.resources").ResourceManager,
        /** Manipulation for Links */
        LinkManager : import("./manager.links").LinkManager,
        /** Manipulation for Labs */
        LabManager : import("./manager.labs").LabManager,
        /** Global Manipulation for Spawning Creeps */
        CreepSpawnManager : import("./manager.creeps").CreepSpawnManager,
        /** Global Log */
        Log : Log,
        /** Global Dye */
        Dye : Dye,
        /** Emoji List */
        Emoji : import("./log.prototype").Emoji
    }
}

interface Game {
    /** Fetch Structure's Tag which is defined by Planner */
    getTagById(id : Id<Structure>) : string,
    /** Set Structure's Tag */
    setTagById(id : Id<Structure>) : void,
    /** Fetch GameObject's Task */
    getTaskById(id : Id<any>) : import("./task.prototype").Task,
    /** Clean GameObject's Task */
    cleanTaskById(id : Id<any>) : void
}

interface Room {
    // Resources
    mineral?            : Mineral,
    sources             : Source[],
    biomasses           : Deposit[],
    mists               : Deposit[],
    metals              : Deposit[],
    silicons            : Deposit[],
    // Structures
    factory?            : StructureFactory,
    containers          : StructureContainer[],
    roads               : StructureRoad[],
    towers              : StructureTower[],
    spawns              : StructureSpawn[],
    extensions          : StructureExtension[],
    extractor?          : StructureExtractor
    labs                : StructureLab[],
    links               : StructureLink[],
    nuker?              : StructureNuker,
    observer?           : StructureObserver,
    constructedWalls    : StructureWall[],
    ramparts            : StructureRampart[],
    keeperLairs         : StructureKeeperLair[],
    portals             : StructurePortal[],
    powerBanks          : StructurePowerBank[],
    powerSpawn?         : StructurePowerBank
}

interface Array<T> {
    /** `select` converts each `value` into number and selects the maximum one. `null` ones will be ignored. */
    select<S>(toNumber : (value : S) => number, mapping: (value : T) => S, remove? : boolean) : T | null,
    count(predicate : (value : T) => boolean) : number,
    shuffle() : void
}

interface Creep {
    task : import("./task.prototype").Task | null,
    travelTo(destination : RoomPosition | {pos : RoomPosition}, options : import("./Traveler").TravelToOptions) : CreepMoveReturnCode | ERR_NO_PATH | ERR_INVALID_TARGET
}

interface PowerCreep {
    task : import("./task.prototype").Task | null
}

interface CreepMemory {
    flags? : {
        /** Usually used to indicate status of executing Task */
        working? : boolean,
        /** Usually used to store `id` of `target` */
        targetId? : Id<AnyCreep | AnyStructure>,
        /** Usually used to store `pos` of `target` */
        targetPos? : RoomPosition
    }
}