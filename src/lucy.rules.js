/**
 * @typedef { {reservedAmount : number} } SellingEntry
 * @typedef { {[resourceType : string] : SellingEntry} } SellingList
 * @typedef { rules } Rules 
 */
const rules = {
    transactionConfigure: {
        fineRate: 0.3
    },
    price: {
        "default" : 1,
        [RESOURCE_ENERGY] : 1,
        /**
         * In the unit of 1 ms.
         * Calculated by refering to the relationship built through creep's harvest method.
         * For a single WORK body, a 0.2 ms cost will earn 2 units of energy without any boost.
         */
        "cpu" : 10,
        "credit" : 1
    },
    /* It is recorded under structure's memory : "tag" */
    arrangements : {
        SPAWN_ONLY              : "forSpawn",
        UPGRADE_ONLY            : "forController",
        TRANSFER_ONLY           : "forTransfer",
        BUILD_ONLY              : "forBuild"
    },
    storage : {
        [RESOURCE_ENERGY] : 0.5,
        [RESOURCE_HYDROGEN] : 0.2,
        [RESOURCE_OXYGEN] : 0.2,
        [RESOURCE_KEANIUM] : 0.2,
        [RESOURCE_UTRIUM] : 0.2,
        [RESOURCE_LEMERGIUM] : 0.2,
        [RESOURCE_ZYNTHIUM] : 0.2,
        [RESOURCE_CATALYST] : 0.4,
        "collectSpareCapacity" : STORAGE_CAPACITY / 10
    },
    terminal : {
        [RESOURCE_ENERGY] : 0.5,
        "collectSpareCapacity" : TERMINAL_CAPACITY / 10,
        "startEnergy" : 1000,
        "minimumBuyingAmount" : 1000,
        "sellingLists" : {
            [RESOURCE_ENERGY] : {reservedAmount : 12000},
            [RESOURCE_HYDROGEN] : {reservedAmount : 12000},
            [RESOURCE_OXYGEN] : {reservedAmount : 12000},
            [RESOURCE_KEANIUM] : {reservedAmount : 12000},
            [RESOURCE_UTRIUM] : {reservedAmount : 12000},
            [RESOURCE_LEMERGIUM] : {reservedAmount : 12000},
            [RESOURCE_ZYNTHIUM] : {reservedAmount : 12000},
            [RESOURCE_CATALYST] : {reservedAmount : 12000}
        }
    },
    lab : {
        checkReactionAmount : 3000,
        allowedToBuyMinerals : {
            
        }
    }
};
module.exports = rules;