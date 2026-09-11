// A line of text, drawn where the object is.
//
// IT GOES THROUGH THE RENDERER LIKE EVERY OTHER COMPONENT THAT DRAWS. `fillText` is a
// primitive of the contract (rendering/renderer.js), not a call into a canvas: this file
// never sees a `CanvasRenderingContext2D`, so it draws into a WebGL backend the day one
// exists and it draws into a twenty-line test double today. The rule ADR-0005 states for
// `Sprite` and `Tilemap` is the rule here, with no exception for text.
//
// A FAMILY IS A STRING, AND NOTHING FETCHES IT. No webfont loader, no Google Fonts, no
// second asset pipeline: the value is whatever the surface can already resolve — a CSS
// family list on a canvas. A font a creator wants to SHIP is a Resource and an ADR of its
// own; what this ships is the ability to write words on the screen.
//
// THE EXTENT IS ESTIMATED, AND IT SAYS SO. Measuring text needs the thing that will draw
// it, and a component that asked its renderer a question would answer `bounds()`
// differently on a canvas, on a server and in a test — so picking, framing and the
// selection outline would depend on which backend had drawn last. An estimate from the
// declaration is the same number everywhere, which is worth more here than being right to
// the pixel on one of them.

/**
 * How wide one character is, as a fraction of the font size.
 *
 * Measured across the mixed-case Latin text a label actually carries in a proportional
 * sans-serif; a monospace family runs wider and a run of `I`s runs much narrower. It is
 * used for `bounds()` and for nothing else — never for drawing, where the backend does the
 * real thing.
 */
export const AVERAGE_ADVANCE = 0.55;

/** Where the anchor sits, horizontally, per alignment. */
const ANCHOR = { left: 0, center: -0.5, right: -1 };

export class TextRenderer {

    static type = 'TextRenderer';

    static schema = {
        text: { type: 'string', default: 'Text' },
        // NAMED `fontSize`, NOT `size`, BECAUSE THAT IS HOW IT READS (ADR-0048). The
        // Inspector humanises a name into a label, so `fontSize` is the row a creator sees
        // as `Font Size` — and `size` would collide with the `Size` row `width`/`height`
        // already make on a Sprite, meaning something else entirely.
        fontSize: { type: 'number', default: 16, min: 1 },
        fontFamily: { type: 'string', default: 'sans-serif' },
        color: { type: 'color', default: '#ffffff' },
        // THREE OPTIONS, WHICH IS WHAT AN ALIGNMENT IS FOR. `start`/`end`, justification,
        // letter spacing and direction are typography a 2D game engine has no layout to
        // apply them in; each is a row here the day something reads it.
        align: {
            type: 'enum',
            values: ['left', 'center', 'right'],
            labels: ['Left', 'Center', 'Right'],
            default: 'left'
        },
        alpha: { type: 'number', default: 1, min: 0, max: 1 }
    };

    /**
     * Create the component.
     * @param {string} [text] - What to draw
     * @param {number} [fontSize] - Height of the font, in local units
     * @param {string} [fontFamily] - A family the surface can already resolve
     * @param {string} [color] - Fill colour
     * @param {string} [align] - One of `left`, `center`, `right`
     * @param {number} [alpha] - Opacity from 0 to 1
     */
    constructor(text = 'Text', fontSize = 16, fontFamily = 'sans-serif', color = '#ffffff', align = 'left', alpha = 1) {
        this.text = text;
        this.fontSize = fontSize;
        this.fontFamily = fontFamily;
        this.color = color;
        this.align = align;
        this.alpha = alpha;
    }

    /**
     * Draw the text.
     *
     * THE ANCHOR IS THE OBJECT'S ORIGIN, vertically centred on it — the same reading
     * `RectangleRenderer` and `Sprite` give, which both centre what they draw. So a label
     * rotates and scales about the point a creator dragged, and `align` decides only which
     * way it grows from there.
     *
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        // A NUMBER WRITTEN INTO `text` IS TEXT. `Set Property` can put anything a wire
        // carries here, and refusing to draw a `0` because it is not a string would be a
        // component disagreeing with the Property System about what its own value is.
        const value = globalThis.String(this.text ?? '');
        if (value === '' || this.fontSize <= 0) return;

        renderer.fillText(value, 0, 0, {
            color: this.color,
            alpha: this.alpha,
            fontSize: this.fontSize,
            fontFamily: this.fontFamily,
            align: this.align,
            // CENTRED ON THE ORIGIN, so the box `bounds()` reports is the box that is drawn.
            // A baseline anchor would put two thirds of the glyphs above the origin and a
            // selection outline around the wrong band of pixels.
            baseline: 'middle'
        });
    }

    /**
     * The area this component covers, in the object's local space.
     *
     * ESTIMATED — see the header. The height is the font size rather than a line height:
     * ascenders and descenders do overflow it slightly, and a box a few pixels tight is a
     * better answer for picking than one that includes the leading nobody drew.
     *
     * @param {object} self - The owning object
     * @returns {{x: number, y: number, width: number, height: number}} The local bounds
     */
    bounds(self) {
        const value = globalThis.String(this.text ?? '');
        const width = value.length * this.fontSize * AVERAGE_ADVANCE;
        const height = this.fontSize;

        return {
            x: width * (ANCHOR[this.align] ?? 0),
            y: -height / 2,
            width,
            height
        };
    }
}
