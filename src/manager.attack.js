/**
 * @module manager.attack
 */
class AttackManager {

}

const attackManager = new AttackManager();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const AttackPlugin = {
    init : () => global.AttackManager = attackManager
};
global.Lucy.App.on(AttackPlugin);