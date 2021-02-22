/**
 * @module log.prototype
 * Pretty Log adapted from
 * @author canisminor1990
 * 
 * @typedef { Log } Log
 * @typedef { Emoji } Emoji
 * @typedef { Dye } Dye
 */

/**
 * Emoji Cache
 */
const Emoji = {
	skull: String.fromCodePoint(0x1f480), // 💀
	tick: String.fromCodePoint(0x2705), // ✅
	cross: String.fromCodePoint(0x274c), // ❌
	warn: String.fromCodePoint(0x1f625), // 😥
	info: String.fromCodePoint(0x1f535), // 🔵
	debug: String.fromCodePoint(0x1f41b), // 🐛
	home: String.fromCodePoint(0x1f3e0), // 🏠
	reload: String.fromCodePoint(0x231b), // ⌛
	flag: String.fromCodePoint(0x1f6a9), // 🚩
	baby: String.fromCodePoint(0x1f476), // 👶
	order: String.fromCodePoint(0x1f4e6), // 📦
	terminal: String.fromCodePoint(0x1f4b0), // 💰
	lab: String.fromCodePoint(0x1f52e), // 🔮
	walk: String.fromCodePoint(0x1f45f), // 👟
	wait: String.fromCodePoint(0x1f6ac), // 🚬
	module: String.fromCodePoint(0x26aa), // ⚪

	// Action
	attack_controller: String.fromCodePoint(0x1f680), // 🚀
	avoiding: String.fromCodePoint(0x1f440), // 👀
	boosting: String.fromCodePoint(0x1f525), // 🔥
	building: String.fromCodePoint(0x1f3d7), // 🏗
	bulldozing: String.fromCodePoint(0x1f69c), // 🚜
	charging: String.fromCodePoint(0x1f50c), // 🔌
	claiming: String.fromCodePoint(0x26f3), // ⛳
	defending: String.fromCodePoint(0x2694), // ⚔
	dismantling: String.fromCodePoint(0x26d1), // ⛑
	dropping: String.fromCodePoint(0x1f4a9), // 💩
	feeding: String.fromCodePoint(0x1f355), // 🍕
	fortifying: String.fromCodePoint(0x1f6a7), // 🚧
	fueling: String.fromCodePoint(0x26fd), // ⛽
	guarding: String.fromCodePoint(0x1f6e1), // 🛡
	harvesting: String.fromCodePoint(0x26cf), // ⛏
	healing: String.fromCodePoint(0x1f48a), // 💊
	idle: String.fromCodePoint(0x1f3b5), // 🎵
	invading: String.fromCodePoint(0x1f52b), // 🔫
	mining: String.fromCodePoint(0x26cf), // ⛏
	picking: String.fromCodePoint(0x1f9e4), // 🧤
	reallocating: String.fromCodePoint(0x1f52e), // 🔮
	recycling: String.fromCodePoint(0x1f504), // 🔄
	repairing: String.fromCodePoint(0x1f527), // 🔧
	reserving: String.fromCodePoint(0x1f6a9), // 🚩
	robbing: String.fromCodePoint(0x1f47b), // 👻
	storing: String.fromCodePoint(0x23ec), // ⏬
	travelling: String.fromCodePoint(0x1f3c3), // 🏃
	uncharging: String.fromCodePoint(0x1f50b), // 🔋
	upgrading: String.fromCodePoint(0x1f64f), // 🙏
	withdrawing: String.fromCodePoint(0x23eb), // ⏫
	safegen: String.fromCodePoint(0x1f512), // 🔒
}
const ColorType = {
	[COLOR_RED]         : "red",
	[COLOR_PURPLE]      : "purple",
	[COLOR_BLUE]        : "blue",
	[COLOR_CYAN]        : "cyan",
	[COLOR_GREEN]       : "green",
	[COLOR_YELLOW]      : "yellow",
	[COLOR_ORANGE]      : "orange",
	[COLOR_BROWN]       : "brown",
	[COLOR_GREY]        : "grey",
	[COLOR_WHITE]       : "white",
}
/**
 * 
 */
class Dye {
    constructor() {
        this.color = {
            red: '#F92672',
            purple: '#AE81FF',
            blue: '#66D9EF',
            cyan: '#529B2F',
            green: '#A6E22E',
            yellow: '#E6DB74',
            orange: '#FD971F',
            brown: '#75715E',
            grey: '#999999',
            white: '#F8F8F0',
            black: '#000000',
        };
        this.style = {
            link: { color: '#428bca', fontSize: '12px' },
            system: { color: this.color.grey, fontSize: '12px' },
            success: { color: this.color.green, fontSize: '12px' },
            error: { color: this.color.red, fontSize: '12px' },
            warn: { color: this.color.orange, fontSize: '12px' },
            info: { color: this.color.blue, fontSize: '12px' },
            debug: { color: this.color.brown, fontSize: '12px' },
        };
		_.assign(this.style, this.color);
		_.forEach(Object.keys(this.style), key => {
			this[key] = (...text) => this.run(key, ...text);
		});
	}
    css(style) {
		let css = '';
		const format = (value, key) => {
			css += `${_.kebabCase(key)}: ${value};`;
		};
		_.forEach(style, format);
		return css;
	}
    run(style, ...text) {
		if (_.isNumber(style)) style = ColorType[style];
		const applyStyle = this.style[style];
		const msg = text.join(' ');
		if (_.isObject(applyStyle)) {
			return `<span style="${this.css(applyStyle)}">${msg}</span>`;
		} else {
			return `<span style="color: ${applyStyle}">${msg}</span>`;
		}
	}
}
class Log {
    /**
     * alert    = 1,
	 * error    = 2,
	 * warn     = 3,
	 * info     = 4,
	 * debug    = 5,
     * @returns {number}
     */
    get LOG_LEVEL() {
        return Memory._logLevel || 5;
    }
    constructor() {
        this.raw = {
            success(...content) {
                return [Emoji.tick, global.Dye.green(...content)].join(' ');
            },
            error(...content) {
                return [Emoji.cross, global.Dye.red(...content)].join(' ');
            },
            warn(...content) {
                return [Emoji.warn, global.Dye.orange(...content)].join(' ');
            },
            info(...content) {
                return [Emoji.info, global.Dye.blue(...content)].join(' ');
            },
            debug(...content) {
                return [Emoji.debug, ...content].join(' ');
            },
        };
    }
    success(...content) {
		console.log(this.raw.success(content));
	}
	error(...content) {
		if (this.LOG_LEVEL < 2) return;
		console.log(this.raw.error(content));
	}
	warn(...content) {
		if (this.LOG_LEVEL < 3) return;
		console.log(this.raw.warn(content));
	}
	info(...content) {
		if (this.LOG_LEVEL < 4) return;
		console.log(this.raw.info(content));
	}
	debug(...content) {
		if (this.LOG_LEVEL < 5) return;
		console.log(this.raw.debug(content));
	}
    /**
     * @param {string} title
     * @param  {...any} content
     */
	module(title, ...content) {
		console.log(Emoji.module, global.Dye.link(title), ...content);
	}
    /**
     * @param {string | Room} room
     * @param  {...any} content
     */
	room(room, ...content) {
        const roomName = _.isString(room) ? room : room.name;
		const roomUrl = `<a href="#!/room/${Game.shard.name}/${roomName}">${roomName}</a>`;
		console.log(Emoji.home, global.Dye.link(roomUrl), content);
	}
    /**
     * @param {Flag | string} flag
     * @param  {...any} content
     */
	flag(flag, ...content) {
        const roomName = _.isString(flag)? Game.flags[flag].pos.roomName : flag.pos.roomName;
		const flagUrl = `<a href="#!/room/${Game.shard.name}/${roomName}">${_.isString(flag)? flag : flag.name}</a>`;
		this.module(Emoji.flag, flagUrl, content);
	}
	stringify(content) {
		console.log(JSON.stringify(content, null, 2));
	}
}

global.Emoji = Emoji;
global.Log = new Log();
global.Dye = new Dye();