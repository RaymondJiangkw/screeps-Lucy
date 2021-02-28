/**
 * Adapted from
 * @author bencbartlett
 * @source https://github.com/bencbartlett/Overmind/blob/master/src/visuals/Visualizer.ts
 * 
 * @typedef { {color? : string, textstyle? : boolean, textsize? : number, textfont? : string, opacity? : number} } InfoBoxStyle
 * @typedef { {color? : string, textstyle? : boolean, textsize? : number, textfont? : string, opacity? : number} } MultiTextStyle
 * @typedef { {background? : string, textcolor? : string, textstyle? : string, textsize? : string, textfont? : string, opacity? : number} } SpeechStyle
 * @typedef { {color? : string, opacity? : number, radius? : number, frames? : number} } AnimatedPositionStyle
 * @typedef { {message : string, priority : number, roomName? : string} } Alert
 * @typedef { {message : string, roomName : string, duration : number} } Notification
 * @typedef { {notifications : Notification[]} } NotifierMemory
 */
require("./visual.prototype");
const { constructArray } = require("./util");
const TEXT_COLOR = "#c9c9c9";
const TEXT_SIZE = .8;
const CHAR_WIDTH = TEXT_SIZE * 0.4;
const CHAR_HEIGHT = TEXT_SIZE * 0.9;
/**
 * The Visualizer contains many static methods for drawing room visuals and displaying  information through a GUI
 */
class Visualizer {
    /** @returns {boolean} */
    static get enabled() {
        return !(Memory._disable || false);
    }
    /**
     * @param {number} size
     * @param {TextStyle} style
     */
    static textStyle(size = 1, style = {}) {
        return _.defaults(style, {
            color   : TEXT_COLOR,
            align   : "left",
            font    : `${size * TEXT_SIZE} Trebuchent MS`,
            opacity : .8
        });
    }
    /**
     * @param {RoomPosition} pos
     * @param {string} color
     * @param {CircleStyle} opts
     */
    static circle(pos, color = 'red', opts = {}) {
        _.defaults(opts, {
            fill    : color,
            radius  : .35,
            opacity : .5,
        });
        return new RoomVisual(pos.roomName).circle(pos.x, pos.y, opts);
    }
    /**
     * @param {RoomPosition} pos
     * @param {AnimatedPositionStyle} opts
     */
    static marker(pos, opts) {
        return new RoomVisual(pos.roomName).animatedPosition(pos.x, pos.y, opts);
    }
    /**
     * @param {CostMatrix} costMatrix
     * @param {string} roomName
     * @param {boolean} dots
     * @param {string} color
     */
    static displayCostMatrix(costMatrix, roomName, dots = true, color = '#ff0000') {
        const vis = new RoomVisual(roomName);
        let x = 0, y = 0;
        if (dots) {
			let cost = 0;
			let max = 1;
			for (y = 0; y < 50; ++y) {
				for (x = 0; x < 50; ++x) {
					max = Math.max(max, costMatrix.get(x, y));
				}
			}

			for (y = 0; y < 50; ++y) {
				for (x = 0; x < 50; ++x) {
					cost = costMatrix.get(x, y);
					if (cost > 0) {
						vis.circle(x, y, {radius: costMatrix.get(x, y) / max / 2, fill: color});
					}
				}
			}
		} else {
			for (y = 0; y < 50; ++y) {
				for (x = 0; x < 50; ++x) {
					vis.text(costMatrix.get(x, y).toString(), x, y, {color: color});
				}
			}
		}
    }
    /**
     * @param {string[]} info
     * @param {{room? : Room, pos : RoomPosition}} calledFrom
     * @param {InfoBoxStyle} opts
     */
    static showInfo(info, calledFrom, opts) {
        if (calledFrom.room) {
			return calledFrom.room.visual.infoBox(info, calledFrom.pos.x, calledFrom.pos.y, opts);
		} else {
			return new RoomVisual(calledFrom.pos.roomName).infoBox(info, calledFrom.pos.x, calledFrom.pos.y, opts);
		}
    }
    /**
     * @param {string} title
     * @param {RoomPosition} pos
     * @param {number} width
     * @param {number} height
     * @returns { {x : number, y : number} }
     */
    static section(title, pos, width, height) {
        const vis = new RoomVisual(pos.roomName);
        vis.rect(pos.x, pos.y - CHAR_HEIGHT, width, 1.1 * CHAR_HEIGHT, {opacity: 0.15});
		vis.box(pos.x, pos.y - CHAR_HEIGHT, width, height + (1.1 + .25) * CHAR_HEIGHT, {color: TEXT_COLOR});
		vis.text(title, pos.x + .25, pos.y - .05, this.textStyle());
		return {x: pos.x + 0.25, y: pos.y + 1.1 * CHAR_HEIGHT};
    }
    /**
     * @param {string} header
     * @param {string[][] | string[]} content
     * @param {RoomPosition} pos
     * @param {number} width
     */
    static infoBox(header, content, pos, width) {
        const height = CHAR_HEIGHT * (content.length || 1);
		const {x, y} = this.section(header, pos, width, height);
		if (content.length > 0) {
			if (_.isArray(content[0])) {
				this.table(content, {
					x       : x,
					y       : y,
					roomName: pos.roomName
				});
			} else {
				this.multitext(content, {
					x       : x,
					y       : y,
					roomName: pos.roomName
				});
			}
		}
		// return pos.y - charHeight + ((content.length || 1) + 1.1 + .25) * charHeight + 0.1;
		const spaceBuffer = 0.5;
		return y + height + spaceBuffer;
    }
    /**
     * @param {string} text
     * @param {RoomPosition} pos
     * @param {number} size
     * @param {TextStyle} style
     */
    static text(text, pos, size = 1, style = {}) {
        new RoomVisual(pos.roomName).text(text, pos.x, pos.y, this.textStyle(size, style));
    }
    /**
     * @param {number | [number, number]} progress
     * @param {RoomPosition} pos
     * @param {number} width
     * @param {number} scale
     */
    static barGraph(progress, pos, width = 7, scale = 1) {
        const vis = new RoomVisual(pos.roomName);
        let percent = 0;
        /** @type { 'percent' | 'fraction' } */
        let mode;
        if (typeof progress === 'number') {
            percent = progress;
            mode = 'percent';
        } else {
            percent = progress[0] / progress[1];
            mode = 'fraction';
        }
        // Draw frame
        vis.box(pos.x, pos.y - CHAR_HEIGHT * scale, width, 1.1 * scale * CHAR_HEIGHT, {color: TEXT_COLOR});
        vis.rect(pos.x, pos.y - CHAR_HEIGHT * scale, Math.min(percent, 1) * width, 1.1 * scale * CHAR_HEIGHT, {
            fill       : percent <= 1 ? TEXT_COLOR : '#ff7b7b',
            opacity    : 0.4,
            strokeWidth: 0
        });
        // Draw text
        if (mode == 'percent') {
            vis.text(`${Math.round(100 * percent)}%`, pos.x + width / 2, pos.y - .1 * CHAR_HEIGHT, this.textStyle(1, {align: 'center'}));
        } else {
            const [num, den] = progress;
            vis.text(`${num}/${den}`, pos.x + width / 2, pos.y - .1 * CHAR_HEIGHT, this.textStyle(1, {align: 'center'}));
        }
    }
    /**
     * @param {string[][]} data
     * @param {RoomPosition} pos
     */
    static table(data, pos) {
        if (data.length == 0) return;
        
        const colPadding = 4;
        const vis = new RoomVisual(pos.roomName);

        const style = this.textStyle();

        // Determine column locations
        const columns = Array(_.first(data).length).fill(0);
        for (const entries of data) {
            for (let i = 0; i < entries.length - 1; i++) {
                columns[i] = Math.max(columns[i], entries[i].length);
            }
        }

        // // Draw header and underline
        // vis.text(header, pos.x, pos.y, style);
        // vis.line(pos.x, pos.y + .3 * charHeight,
        // 	pos.x + charWidth * _.sum(columns) + colPadding * columns.length, pos.y + .25 * charHeight, {
        // 			 color: textColor
        // 		 });

        // Draw text
        // let dy = 1.5 * charHeight;
        let dy = 0;
        for (const entries of data) {
            let dx = 0;
            for (let i = 0; i < entries.length; ++i) {
                vis.text(entries[i], pos.x + dx, pos.y + dy, style);
                dx += CHAR_WIDTH * (columns[i] + colPadding);
            }
            dy += CHAR_HEIGHT;
        }
    }
    /**
     * @param {string[]} lines
     * @param {RoomPosition} pos
     */
    static multitext(lines, pos) {
        if (lines.length == 0) return;
        const vis = new RoomVisual(pos.roomName);
        const style = this.textStyle();
        // Draw text
        let dy = 0;
        for (const line of lines) {
            vis.text(line, pos.x, pos.y + dy, style);
            dy += CHAR_HEIGHT;
        }
    }
    /**
     * @param {{[roomName : string] : string[]}} notificationMessages
     */
    static drawNotifications(notificationMessages) {
        for (const roomName in notificationMessages) {
            const x = 12.5;
            const y = 1;
            if (notificationMessages[roomName].length == 0) {
                notificationMessages[roomName] = ['No notifications'];
            }
            const maxStringLength = _.max(_.map(notificationMessages[roomName], msg => msg.length));
            const width = Math.max(11, 1.2 * CHAR_WIDTH * maxStringLength);
            this.infoBox('Notifications', notificationMessages[roomName], {x, y, roomName}, width);
        }
    }
    /**
     * @param {{[roomName : string] : {[title : string] : {key : string, value : () => string}[]}}} monitoredValues
     */
    static drawMonitoredValues(monitoredValues) {
        for (const roomName in monitoredValues) {
            const y = 4;
            let offset = 0;
            for (const title in monitoredValues[roomName]) {
                let table = constructArray([monitoredValues[roomName][title].length, 2], "");
                let keyLength = 0, valueLength = 0;
                monitoredValues[roomName][title].forEach((value, index) => {
                    table[index][0] = value.key;
                    keyLength = Math.max(keyLength, table[index][0].length);
                    table[index][1] = value.value();
                    valueLength = Math.max(valueLength, table[index][1].length);
                });
                this.infoBox(title, table, {x : 1, y : y + offset * TEXT_SIZE, roomName}, Math.max(11, 1.2 * CHAR_WIDTH * (4 + keyLength + valueLength)));
                offset += monitoredValues[roomName][title].length + 1 + 0.5;
            }
        }
    }
    static drawGraphs() {
		this.text(`CPU`, {x: 1, y: 1});
		this.barGraph(Game.cpu.getUsed() / Game.cpu.limit, {x: 2.75, y: 1});
		this.text(`BKT`, {x: 1, y: 2});
		this.barGraph(Game.cpu.bucket / 10000, {x: 2.75, y: 2});
		this.text(`GCL`, {x: 1, y: 3});
		this.barGraph(Game.gcl.progress / Game.gcl.progressTotal, {x: 2.75, y: 3});
	}
    // This typically takes about 0.3-0.6 CPU in total
	static visuals() {
		this.drawGraphs();
		// this.drawNotifications();
	}
}

/**
 * @param {string} roomName
 */
function printRoomName(roomName) {
	return '<a href="#!/room/' + Game.shard.name + '/' + roomName + '">' + roomName + '</a>';
}
const NotifierPriority = {
	Critical : 0,
	High     : 1,
	Normal   : 2,
	Low      : 3,
}
/**
 * Records one-time and persistent notifications from various in-game events
 */
class Notifier {
    clear() {
        this.notifications = [];
    }
    clearByTick() {
        if (!this[`_notifications_tick`] || this[`_notifications_tick`] < Game.time) {
            this[`_notifications_tick`] = Game.time;
            this.clear();
        }
    }
    /**
     * @param {string} roomName
     * @param {string} title
     * @param {string} key
     * @param {() => string} value
     */
    register(roomName, title, key, value) {
        if (!this.monitoredValue[roomName]) this.monitoredValue[roomName] = {};
        if (!this.monitoredValue[roomName][title]) this.monitoredValue[roomName][title] = [];
        this.monitoredValue[roomName][title].push({key, value});
    }
    /**
     * @param {string} message
     * @param {string} [roomName]
     * @param {0 | 1 | 2 | 3} priority
     */
    notify(message, roomName, priority = NotifierPriority.Normal) {
        this.clearByTick();
        const notification = {message, roomName, priority};
        this.notifications.push(notification);
    }
    /**
     * @param {boolean} links
     * @returns {string[]}
     */
    generateNotificationsList(links = false) {
        this.clearByTick();
        const groupedNotifications = _.groupBy(this.notifications, notification => notification.roomName);
        Object.keys(groupedNotifications).forEach(roomName => groupedNotifications[roomName] = _.sortBy(groupedNotifications[roomName], notification => notification.priority));
        global.Lucy.Collector.colonies.forEach(r => groupedNotifications[r.name] = groupedNotifications[r.name] || []);
        return groupedNotifications;
    }
    visuals() {
        const notificationMessages = this.generateNotificationsList();
		Visualizer.drawNotifications(notificationMessages);
        Visualizer.drawMonitoredValues(this.monitoredValue);
    }
    constructor() {
        /** @type {NotifierMemory} */
        this.memory;
        /** @type {Alert[]} */
        this.alerts = [];
        /** @type {Notification[]} */
        this.notifications = [];
        /** @type {{[roomName : string] : {[title : string] : {key : string, value : () => string}[]}}} */
        this.monitoredValue = {};
    }
};

const _notifier = new Notifier();

/** @type {import("./lucy.app").AppLifecycleCallbacks} */
const VisualPlugin = {
    afterTickEnd : () => {
        if (!Memory._disableInfo) {
            const _cpuUsed = Game.cpu.getUsed();
            _notifier.visuals();
            Visualizer.visuals();
            // console.log(`<p style="display:inline;color:green;">[Ticks]</p> Visual consumes ${(Game.cpu.getUsed() - _cpuUsed).toFixed(2)}`);
        }
    }
};

global.Lucy.App.on(VisualPlugin);

module.exports = {
    Notifier            : _notifier,
    NotifierPriority    : NotifierPriority,
    CHAR_HEIGHT         : CHAR_HEIGHT,
    CHAR_WIDTH          : CHAR_WIDTH
};