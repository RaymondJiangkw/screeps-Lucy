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
        signals : LucySignals,
        /** Global Manipulation for Flags */
        FlagManager : FlagManager,
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
        /** Global Manipulation for Factory */
        FactoryManager : FactoryManager,
        /** Global Manipulation for Resources */
        ResourceManager : import("./manager.resources").ResourceManager,
        /** Manipulation for Links */
        LinkManager : import("./manager.links").LinkManager,
        /** Manipulation for Labs */
        LabManager : import("./manager.labs").LabManager,
        /** Global Manipulation for Spawning Creeps */
        CreepSpawnManager : import("./manager.creeps").CreepSpawnManager,
        /** Global Manipulation for Deposit Harvesting */
        DepositManager : DepositManager,
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

interface CreateFlagOption {
    /** The color of a new flag. Should be one of the COLOR_* constants. The default value is COLOR_WHITE. */
    color?          : ColorConstant,
    /** The secondary color of a new flag. Should be one of the COLOR_* constants. The default value is equal to color. */
    secondaryColor? : ColorConstant,
    /** Memory of the new flag. If provided, it will be immediately stored into `Memory.flags[name]` */
    memory?         : {}
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
    powerSpawn?         : StructurePowerBank,
    // Replaced Function
    /**
     * Create new Flag at the specified location.
     * @param x The X position.
     * @param y The Y position.
     * @param name (optional) The name of a new flag.
     *
     * It should be unique, i.e. the Game.flags object should not contain another flag with the same name (hash key).
     *
     * If not defined, a random name will be generated.
     *
     * The maximum length is 60 characters.
     * 
     * 
     * @returns The name of a new flag, or one of the following error codes: ERR_NAME_EXISTS, ERR_INVALID_ARGS
     */
    createFlag(x : number, y : number, options? : CreateFlagOption) : ERR_NAME_EXISTS | ERR_FULL | ERR_INVALID_ARGS,
    /**
     * Create new Flag at the specified location.
     * @param pos Can be a RoomPosition object or any object containing RoomPosition.
     * @param name (optional) The name of a new flag.
     *
     * It should be unique, i.e. the Game.flags object should not contain another flag with the same name (hash key).
     *
     * If not defined, a random name will be generated.
     *
     * The maximum length is 60 characters.
     * @returns The name of a new flag, or one of the following error codes: ERR_NAME_EXISTS, ERR_INVALID_ARGS
     */
    createFlag(pos : RoomPosition, options? : CreateFlagOption) : ERR_NAME_EXISTS | ERR_FULL | ERR_INVALID_ARGS
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
    /** Equivalent to Role */
    tag? : string
    /**
     * `flags` will not be refreshed when `Creep` is employed by a Task.
     * It is freshed only when `Creep` is fired or dead.
     */
    flags? : {
        /** Usually used to indicate status of executing Task */
        working? : boolean,
        /** Usually used to store `id` of `target` */
        targetId? : Id<AnyCreep | AnyStructure>,
        /** Usually used to store `pos` of `target` */
        targetPos? : RoomPosition,
        /** Usually used to indicate whether `Creep` is in the state of renewing */
        renew? : boolean,
        /** Usually used to indicate whether `Creep` fails to renew */
        failToRenew? : boolean
    },
    /**
     * `temporaryFlags` will be refreshed when `Creep` is employed by a Task.
     * It is useful when dealing with global reset.
     */
    temporaryFlags? : {
        /** Usually used to indicate whether Creep's succession has been issued */
        isSuccessionIssued? : boolean
    },
    /**
     * `permanentFlags` will never be refreshed.
     */
    permanentFlags? : {
        /** Usually used to indicate the tick when Creep is employeed */
        employedTick? : number,
        /** Usually used to indicate the tick when Creep starts `working` */
        startWorkingTick? : number
    }
}