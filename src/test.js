global.Test = {
    /**
     * @param {string[]} [path]
     */
    Memory : (path = []) => {
        const obj = path.length === 0 ? Memory : _.get(Memory, path, {});
        console.log(`Testing Memory ${path.join('.')}`);
        console.log(`Key\tTicks`);
        const _cpuUsed = Game.cpu.getUsed();
        for (const key in obj) {
            const _cpuUsed = Game.cpu.getUsed();
            JSON.parse(JSON.stringify(obj[key]));
            console.log(`[${key}]\t${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
        }
        console.log(`Total : ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
    }
};