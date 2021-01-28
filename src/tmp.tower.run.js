const isMyRoom = require("./util").isMyRoom;
module.exports = function() {
    for (const roomName in Game.rooms) {
        if (!isMyRoom(Game.rooms[roomName])) continue;
        for (const creep of Game.rooms[roomName].find(FIND_HOSTILE_CREEPS)) Game.rooms[roomName].towers.forEach(t => t.attack(creep));
        for (const creep of Game.rooms[roomName].find(FIND_MY_CREEPS)) if (creep.hits < creep.hitsMax) Game.rooms[roomName].towers.forEach(t => t.heal(creep));
    }
}
