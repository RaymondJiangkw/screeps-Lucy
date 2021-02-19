/**
 * @author bencbartlett
 * @source https://github.com/bencbartlett/Overmind/blob/master/src/prototypes/RoomVisual.ts
 */
const speechSize = 0.5;
const speechFont = 'Times New Roman';

const colors = {
	gray            : '#555555',
	light           : '#AAAAAA',
	road            : '#666', // >:D
	energy          : '#FFE87B',
	power           : '#F53547',
	dark            : '#181818',
	outline         : '#8FBB93',
	speechText      : '#000000',
	speechBackground: '#aebcc4',
	infoBoxGood     : '#09ff00',
	infoBoxBad      : '#ff2600'
};
const ColorSets = {
	white : ['#ffffff', '#4c4c4c'],
	grey  : ['#b4b4b4', '#4c4c4c'],
	red   : ['#ff7b7b', '#592121'],
	yellow: ['#fdd388', '#5d4c2e'],
	green : ['#00f4a2', '#236144'],
	blue  : ['#50d7f9', '#006181'],
	purple: ['#a071ff', '#371383'],
};
const ResourceColors = {
	[RESOURCE_ENERGY]: ColorSets.yellow,
	[RESOURCE_POWER] : ColorSets.red,

	[RESOURCE_HYDROGEN] : ColorSets.grey,
	[RESOURCE_OXYGEN]   : ColorSets.grey,
	[RESOURCE_UTRIUM]   : ColorSets.blue,
	[RESOURCE_LEMERGIUM]: ColorSets.green,
	[RESOURCE_KEANIUM]  : ColorSets.purple,
	[RESOURCE_ZYNTHIUM] : ColorSets.yellow,
	[RESOURCE_CATALYST] : ColorSets.red,
	[RESOURCE_GHODIUM]  : ColorSets.white,

	[RESOURCE_HYDROXIDE]       : ColorSets.grey,
	[RESOURCE_ZYNTHIUM_KEANITE]: ColorSets.grey,
	[RESOURCE_UTRIUM_LEMERGITE]: ColorSets.grey,

	[RESOURCE_UTRIUM_HYDRIDE]   : ColorSets.blue,
	[RESOURCE_UTRIUM_OXIDE]     : ColorSets.blue,
	[RESOURCE_KEANIUM_HYDRIDE]  : ColorSets.purple,
	[RESOURCE_KEANIUM_OXIDE]    : ColorSets.purple,
	[RESOURCE_LEMERGIUM_HYDRIDE]: ColorSets.green,
	[RESOURCE_LEMERGIUM_OXIDE]  : ColorSets.green,
	[RESOURCE_ZYNTHIUM_HYDRIDE] : ColorSets.yellow,
	[RESOURCE_ZYNTHIUM_OXIDE]   : ColorSets.yellow,
	[RESOURCE_GHODIUM_HYDRIDE]  : ColorSets.white,
	[RESOURCE_GHODIUM_OXIDE]    : ColorSets.white,

	[RESOURCE_UTRIUM_ACID]       : ColorSets.blue,
	[RESOURCE_UTRIUM_ALKALIDE]   : ColorSets.blue,
	[RESOURCE_KEANIUM_ACID]      : ColorSets.purple,
	[RESOURCE_KEANIUM_ALKALIDE]  : ColorSets.purple,
	[RESOURCE_LEMERGIUM_ACID]    : ColorSets.green,
	[RESOURCE_LEMERGIUM_ALKALIDE]: ColorSets.green,
	[RESOURCE_ZYNTHIUM_ACID]     : ColorSets.yellow,
	[RESOURCE_ZYNTHIUM_ALKALIDE] : ColorSets.yellow,
	[RESOURCE_GHODIUM_ACID]      : ColorSets.white,
	[RESOURCE_GHODIUM_ALKALIDE]  : ColorSets.white,

	[RESOURCE_CATALYZED_UTRIUM_ACID]       : ColorSets.blue,
	[RESOURCE_CATALYZED_UTRIUM_ALKALIDE]   : ColorSets.blue,
	[RESOURCE_CATALYZED_KEANIUM_ACID]      : ColorSets.purple,
	[RESOURCE_CATALYZED_KEANIUM_ALKALIDE]  : ColorSets.purple,
	[RESOURCE_CATALYZED_LEMERGIUM_ACID]    : ColorSets.green,
	[RESOURCE_CATALYZED_LEMERGIUM_ALKALIDE]: ColorSets.green,
	[RESOURCE_CATALYZED_ZYNTHIUM_ACID]     : ColorSets.yellow,
	[RESOURCE_CATALYZED_ZYNTHIUM_ALKALIDE] : ColorSets.yellow,
	[RESOURCE_CATALYZED_GHODIUM_ACID]      : ColorSets.white,
	[RESOURCE_CATALYZED_GHODIUM_ALKALIDE]  : ColorSets.white,
};
/**
 * @param {number} x
 * @param {number} y
 * @param {number} s
 * @param {number} c
 * @param {number} px
 * @param {number} py
 * @returns { {x : number, y : number} }
 */
function rotate(x, y, s, c, px, py) {
    const xDelta = x * c - y * s;
    const yDelta = x * s + y * c;
    return {x : px + xDelta, y : py + yDelta};
}
/**
 * @param {number} x
 * @param {number} y
 * @param {number[][]} poly
 * @returns {number[][]}
 */
function relPoly(x, y, poly) {
    return poly.map(p => {
        p[0] += x;
        p[1] += y;
        return p;
    });
}

class MyRoomVisual extends RoomVisual {
    /**
     * @param {string[]} info
     * @param {number} x
     * @param {number} y
     * @param {InfoBoxStyle} opts
     */
    infoBox(info, x, y, opts = {}) {
        _.defaults(opts, {
            color   : colors.infoBoxGood,
            textstyle : false,
            textsize : speechSize,
            textfont : 'verdana',
            opacity : 0.7
        });

        let fontstring = '';
        if (opts.textstyle) {
            fontstring = opts.textstyle + ' ';
        }
        fontstring += opts.textsize + ' ' + opts.textfont;

        let pointer = [
            [.9, -.25],
            [.9, .25],
            [.3, .0],
        ];
        pointer = relPoly(x, y, pointer);
        pointer.push(pointer[0]);

        // Draw arrow
        this.poly(pointer, {
            fill       : undefined,
            stroke     : opts.color,
            opacity    : opts.opacity,
            strokeWidth: 0.0
        });

        // // Draw box
        // this.rect(x + 0.9, y - 0.8 * opts.textsize,
        // 	0.55 * opts.textsize * _.max(_.map(info, line => line.length)), info.length * opts.textsize,
        // 	{
        // 		fill   : undefined,
        // 		opacity: opts.opacity
        // 	});

        // Draw vertical bar
        const x0 = x + 0.9;
        const y0 = y - 0.8 * opts.textsize;
        this.line(x0, y0, x0, y0 + info.length * opts.textsize, {
            color: opts.color,
        });

        // Draw text
        let dy = 0;
        for (const line of info) {
            this.text(line, x + 1, y + dy, {
                color            : opts.color,
                // backgroundColor  : opts.background,
                backgroundPadding: 0.1,
                opacity          : opts.opacity,
                font             : fontstring,
                align            : 'left',
            });
            dy += opts.textsize;
        }

        return this;
    }
    /**
     * @param {string[]} textLines
     * @param {number} x
     * @param {number} y
     * @param {MultiTextStyle} opts
     */
    multitext(textLines, x, y, opts = {}) {
        _.defaults(opts, {
            color       : colors.infoBoxGood,
            textstyle   : false,
            textsize    : speechSize,
            textfont    : 'verdana',
            opacity     : .7
        });

        let fontstring = '';
        if (opts.textstyle) {
            fontstring = opts.textstyle + ' ';
        }
        fontstring += opts.textsize + ' ' + opts.textfont;

        // // Draw vertical bar
        // let x0 = x + 0.9;
        // let y0 = y - 0.8 * opts.textsize;
        // this.line(x0, y0, x0, y0 + textLines.length * opts.textsize, {
        // 	color: opts.color,
        // });

        // Draw text
        let dy = 0;
        for (const line of textLines) {
            this.text(line, x, y + dy, {
                color            : opts.color,
                // backgroundColor  : opts.background,
                backgroundPadding: 0.1,
                opacity          : opts.opacity,
                font             : fontstring,
                align            : 'left',
            });
            dy += opts.textsize;
        }

        return this;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {number} w
     * @param {number} h
     * @param {LineStyle} style
     */
    box(x, y, w, h, style) {
        return this.line(x, y, x + w, y, style)
			   .line(x + w, y, x + w, y + h, style)
			   .line(x + w, y + h, x, y + h, style)
			   .line(x, y + h, x, y, style);
    }
    /**
     * @param {string} text
     * @param {number} x
     * @param {number} y
     * @param {SpeechStyle} opts
     */
    speech(text, x, y, opts) {
        _.defaults(opts, {
            background  : colors.speechBackground,
            textcolor   : colors.speechText,
            textstyle   : false,
            textsize    : speechSize,
            textfont    : speechFont,
            opacity     : 1
        });

        let fontstring = '';
        if (opts.textstyle) {
            fontstring = opts.textstyle + ' ';
        }
        fontstring += opts.textsize + ' ' + opts.textfont;

        let pointer = [
            [-.2, -.8],
            [.2, -.8],
            [0, -.3]
        ];
        pointer = relPoly(x, y, pointer);
        pointer.push(pointer[0]);

        this.poly(pointer, {
            fill    : opts.background,
            stroke  : opts.background,
            opacity : opts.opacity,
            strokeWidth : .0
        });

        this.text(text, x, y - 1, {
            color               : opts.textcolor,
            backgroundColor     : opts.background,
            backgroundPadding   : .1,
            opacity             : opts.opacity,
            font                : fontstring
        });

        return this;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {AnimatedPositionStyle} opts
     */
    animatedPosition(x, y, opts) {
        _.defaults(opts, {
            color   : 'blue',
            opacity : .5,
            radius  : .75,
            frames  : 6
        });

        const angle = (Game.time % opts.frames * 90 / opts.frames) * (Math.PI / 180);
        const s = Math.sin(angle);
        const c = Math.cos(angle);

        const sizeMod = Math.abs(Game.time % opts.frames - opts.frames / 2) / 10;
        opts.radius += opts.radius * sizeMod;

        const points = [
            rotate(0, -opts.radius, s, c, x, y),
            rotate(opts.radius, 0, s, c, x, y),
            rotate(0, opts.radius, s, c, x, y),
            rotate(-opts.radius, 0, s, c, x, y),
            rotate(0, -opts.radius, s, c, x, y),
        ];
    
        this.poly(points, {stroke: opts.color, opacity: opts.opacity});
    
        return this;
    }
    /**
     * @param {number} x
     * @param {number} y
     * @param {StructureConstant} type
     * @param { {opacity? : number} } [opts]
     */
    structure(x, y, type, opts = {}) {
        _.defaults(opts, {opacity : .5});
        switch (type) {
            case STRUCTURE_EXTENSION:
                this.circle(x, y, {
                    radius     : 0.5,
                    fill       : colors.dark,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.circle(x, y, {
                    radius : 0.35,
                    fill   : colors.gray,
                    opacity: opts.opacity
                });
                break;
            case STRUCTURE_SPAWN:
                this.circle(x, y, {
                    radius     : 0.65,
                    fill       : colors.dark,
                    stroke     : '#CCCCCC',
                    strokeWidth: 0.10,
                    opacity    : opts.opacity
                });
                this.circle(x, y, {
                    radius : 0.40,
                    fill   : colors.energy,
                    opacity: opts.opacity
                });
    
                break;
            case STRUCTURE_POWER_SPAWN:
                this.circle(x, y, {
                    radius     : 0.65,
                    fill       : colors.dark,
                    stroke     : colors.power,
                    strokeWidth: 0.10,
                    opacity    : opts.opacity
                });
                this.circle(x, y, {
                    radius : 0.40,
                    fill   : colors.energy,
                    opacity: opts.opacity
                });
                break;
            case STRUCTURE_LINK: {
                // let osize = 0.3;
                // let isize = 0.2;
                let outer = [
                    [0.0, -0.5],
                    [0.4, 0.0],
                    [0.0, 0.5],
                    [-0.4, 0.0]
                ];
                let inner = [
                    [0.0, -0.3],
                    [0.25, 0.0],
                    [0.0, 0.3],
                    [-0.25, 0.0]
                ];
                outer = relPoly(x, y, outer);
                inner = relPoly(x, y, inner);
                outer.push(outer[0]);
                inner.push(inner[0]);
                this.poly(outer, {
                    fill       : colors.dark,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.poly(inner, {
                    fill   : colors.gray,
                    stroke : false,
                    opacity: opts.opacity
                });
                break;
            }
            case STRUCTURE_TERMINAL: {
                let outer = [
                    [0.0, -0.8],
                    [0.55, -0.55],
                    [0.8, 0.0],
                    [0.55, 0.55],
                    [0.0, 0.8],
                    [-0.55, 0.55],
                    [-0.8, 0.0],
                    [-0.55, -0.55],
                ];
                let inner = [
                    [0.0, -0.65],
                    [0.45, -0.45],
                    [0.65, 0.0],
                    [0.45, 0.45],
                    [0.0, 0.65],
                    [-0.45, 0.45],
                    [-0.65, 0.0],
                    [-0.45, -0.45],
                ];
                outer = relPoly(x, y, outer);
                inner = relPoly(x, y, inner);
                outer.push(outer[0]);
                inner.push(inner[0]);
                this.poly(outer, {
                    fill       : colors.dark,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.poly(inner, {
                    fill   : colors.light,
                    stroke : false,
                    opacity: opts.opacity
                });
                this.rect(x - 0.45, y - 0.45, 0.9, 0.9, {
                    fill       : colors.gray,
                    stroke     : colors.dark,
                    strokeWidth: 0.1,
                    opacity    : opts.opacity
                });
                break;
            }
            case STRUCTURE_LAB:
                this.circle(x, y - 0.025, {
                    radius     : 0.55,
                    fill       : colors.dark,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.circle(x, y - 0.025, {
                    radius : 0.40,
                    fill   : colors.gray,
                    opacity: opts.opacity
                });
                this.rect(x - 0.45, y + 0.3, 0.9, 0.25, {
                    fill   : colors.dark,
                    stroke : false,
                    opacity: opts.opacity
                });
            {
                let box = [
                    [-0.45, 0.3],
                    [-0.45, 0.55],
                    [0.45, 0.55],
                    [0.45, 0.3],
                ];
                box = relPoly(x, y, box);
                this.poly(box, {
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
            }
                break;
            case STRUCTURE_TOWER:
                this.circle(x, y, {
                    radius     : 0.6,
                    fill       : colors.dark,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.rect(x - 0.4, y - 0.3, 0.8, 0.6, {
                    fill   : colors.gray,
                    opacity: opts.opacity
                });
                this.rect(x - 0.2, y - 0.9, 0.4, 0.5, {
                    fill       : colors.light,
                    stroke     : colors.dark,
                    strokeWidth: 0.07,
                    opacity    : opts.opacity
                });
                break;
            case STRUCTURE_ROAD:
                this.circle(x, y, {
                    radius : 0.175,
                    fill   : colors.road,
                    stroke : false,
                    opacity: opts.opacity
                });
                if (!this.roads) this.roads = [];
                this.roads.push([x, y]);
                break;
            case STRUCTURE_RAMPART:
                this.circle(x, y, {
                    radius     : 0.65,
                    fill       : '#434C43',
                    stroke     : '#5D735F',
                    strokeWidth: 0.10,
                    opacity    : opts.opacity
                });
                break;
            case STRUCTURE_WALL:
                this.circle(x, y, {
                    radius     : 0.40,
                    fill       : colors.dark,
                    stroke     : colors.light,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                break;
            case STRUCTURE_STORAGE:
                const storageOutline = relPoly(x, y, [
                    [-0.45, -0.55],
                    [0, -0.65],
                    [0.45, -0.55],
                    [0.55, 0],
                    [0.45, 0.55],
                    [0, 0.65],
                    [-0.45, 0.55],
                    [-0.55, 0],
                    [-0.45, -0.55],
                ]);
                this.poly(storageOutline, {
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    fill       : colors.dark,
                    opacity    : opts.opacity
                });
                this.rect(x - 0.35, y - 0.45, 0.7, 0.9, {
                    fill   : colors.energy,
                    opacity: opts.opacity,
                });
                break;
            case STRUCTURE_OBSERVER:
                this.circle(x, y, {
                    fill       : colors.dark,
                    radius     : 0.45,
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    opacity    : opts.opacity
                });
                this.circle(x + 0.225, y, {
                    fill   : colors.outline,
                    radius : 0.20,
                    opacity: opts.opacity
                });
                break;
            case STRUCTURE_NUKER:
                let outline = [
                    [0, -1],
                    [-0.47, 0.2],
                    [-0.5, 0.5],
                    [0.5, 0.5],
                    [0.47, 0.2],
                    [0, -1],
                ];
                outline = relPoly(x, y, outline);
                this.poly(outline, {
                    stroke     : colors.outline,
                    strokeWidth: 0.05,
                    fill       : colors.dark,
                    opacity    : opts.opacity
                });
                let inline = [
                    [0, -.80],
                    [-0.40, 0.2],
                    [0.40, 0.2],
                    [0, -.80],
                ];
                inline = relPoly(x, y, inline);
                this.poly(inline, {
                    stroke     : colors.outline,
                    strokeWidth: 0.01,
                    fill       : colors.gray,
                    opacity    : opts.opacity
                });
                break;
            case STRUCTURE_CONTAINER:
                this.rect(x - 0.225, y - 0.3, 0.45, 0.6, {
                    fill       : 'yellow',
                    opacity    : opts.opacity,
                    stroke     : colors.dark,
                    strokeWidth: 0.10,
                });
                break;
            default:
                this.circle(x, y, {
                    fill       : colors.light,
                    radius     : 0.35,
                    stroke     : colors.dark,
                    strokeWidth: 0.20,
                    opacity    : opts.opacity
                });
                break;
        }
    
        return this;
    }
    test() {
        const demopos = [19, 24];
        this.clear();
        this.structure(demopos[0] + 0, demopos[1] + 0, STRUCTURE_LAB);
        this.structure(demopos[0] + 1, demopos[1] + 1, STRUCTURE_TOWER);
        this.structure(demopos[0] + 2, demopos[1] + 0, STRUCTURE_LINK);
        this.structure(demopos[0] + 3, demopos[1] + 1, STRUCTURE_TERMINAL);
        this.structure(demopos[0] + 4, demopos[1] + 0, STRUCTURE_EXTENSION);
        this.structure(demopos[0] + 5, demopos[1] + 1, STRUCTURE_SPAWN);

        this.animatedPosition(demopos[0] + 7, demopos[1]);

        this.speech('This is a test!', demopos[0] + 10, demopos[1], {opacity: 0.7});

        // this.infoBox(['This is', 'a test', 'mmmmmmmmmmmmm'], demopos[0] + 15, demopos[1]);

        return this;
    }
    /**
     * @param {ResourceConstant} type
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {number} opacity
     */
    resource(type, x, y, size = 0.25, opacity = 1) {
        if (type == RESOURCE_ENERGY || type == RESOURCE_POWER) {
            this._fluid(type, x, y, size, opacity);
        } else if ([RESOURCE_CATALYST, RESOURCE_HYDROGEN, RESOURCE_OXYGEN, RESOURCE_LEMERGIUM, RESOURCE_UTRIUM, RESOURCE_ZYNTHIUM, RESOURCE_KEANIUM]
            .includes(type)) {
            this._mineral(type, x, y, size, opacity);
        } else if (ResourceColors[type] != undefined) {
            this._compound(type, x, y, size, opacity);
        } else {
            return ERR_INVALID_ARGS;
        }
        return OK;
    }
    /**
     * @param {RESOURCE_ENERGY | RESOURCE_POWER} type
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {number} opacity
     */
    _fluid(type, x, y, size = 0.25, opacity = 1) {
        this.circle(x, y, {
            radius : size,
            fill   : ResourceColors[type][0],
            opacity: opacity,
        });
        this.text(type[0], x, y - (size * 0.1), {
            font             : (size * 1.5),
            color            : ResourceColors[type][1],
            backgroundColor  : ResourceColors[type][0],
            backgroundPadding: 0,
            opacity          : opacity
        });
    }
    /**
     * @param {MineralConstant} type
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {number} opacity
     */
    _mineral(type, x, y, size = 0.25, opacity = 1) {
        this.circle(x, y, {
            radius : size,
            fill   : ResourceColors[type][0],
            opacity: opacity,
        });
        this.circle(x, y, {
            radius : size * 0.8,
            fill   : ResourceColors[type][1],
            opacity: opacity,
        });
        this.text(type, x, y + (size * 0.03), {
            font             : 'bold ' + (size * 1.25) + ' arial',
            color            : ResourceColors[type][0],
            backgroundColor  : ResourceColors[type][1],
            backgroundPadding: 0,
            opacity          : opacity
        });
    }
    /**
     * @param {MineralCompoundConstant} type
     * @param {number} x
     * @param {number} y
     * @param {number} size
     * @param {number} opacity
     */
    _compound(type, x, y, size = 0.25, opacity = 1) {
        const label = type.replace('2', '₂');
    
        this.text(label, x, y, {
            font             : 'bold ' + (size * 1) + ' arial',
            color            : ResourceColors[type][1],
            backgroundColor  : ResourceColors[type][0],
            backgroundPadding: 0.3 * size,
            opacity          : opacity
        });
    }
}

global.Lucy.App.mount(RoomVisual, MyRoomVisual);