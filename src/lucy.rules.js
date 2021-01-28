module.exports = {
    memoryRecycleInterval: {
        structure: 10000,
        powerbank: 5000,
        deposit: 50000,
        constructionSite : 1000,
        commonStructures : 10000
    },
    transactionConfigure: {
        fineRate: 0.3
    },
    currencyConfigure: {
        maximumBorrowedMoney: 1000
    },
    price: {
        "default" : 1,
        [RESOURCE_ENERGY] : 1,
        /**
         * In the unit of 1 ms.
         * Calculated by refering to the relationship built through creep's harvest method.
         * For a single WORK body, a 0.2 ms cost will earn 2 units of energy without any boost.
         */
        "cpu" : 10
    },
    /* It is recorded under structure's memory : "tag" */
    arrangements : {
        SPAWN_ONLY              : "forSpawn",
        UPGRADE_ONLY            : "forUpgrade",
        TRANSFER_ONLY           : "forTransfer",
        BUILD_ONLY              : "forBuild"
    }
};