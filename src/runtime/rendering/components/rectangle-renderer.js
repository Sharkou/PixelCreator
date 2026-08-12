// A coloured rectangle, centred on the object's origin.
//
// This is where width and height live: they describe what is drawn, not where the
// object is, so they belong to the drawing component rather than to Transform
// (ADR-0002).

export class RectangleRenderer {

    static type = 'RectangleRenderer';

    static schema = {
        width: { type: 'number', default: 32, min: 0 },
        height: { type: 'number', default: 32, min: 0 },
        color: { type: 'color', default: '#ffffff' },
        alpha: { type: 'number', default: 1, min: 0, max: 1 },
        fill: { type: 'boolean', default: true },
        lineWidth: { type: 'number', default: 1, min: 0 }
    };

    /**
     * Create the component.
     * @param {number} [width] - Width in local units
     * @param {number} [height] - Height in local units
     * @param {string} [color] - Fill or stroke colour
     * @param {number} [alpha] - Opacity from 0 to 1
     * @param {boolean} [fill] - Fill when true, stroke when false
     */
    constructor(width = 32, height = 32, color = '#ffffff', alpha = 1, fill = true) {
        this.width = width;
        this.height = height;
        this.color = color;
        this.alpha = alpha;
        this.fill = fill;
        this.lineWidth = 1;
    }

    /**
     * Draw the rectangle.
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        const x = -this.width / 2;
        const y = -this.height / 2;

        if (this.fill) {
            renderer.fillRect(x, y, this.width, this.height, { color: this.color, alpha: this.alpha });
        } else {
            renderer.strokeRect(x, y, this.width, this.height, {
                color: this.color,
                alpha: this.alpha,
                lineWidth: this.lineWidth
            });
        }
    }

    /**
     * The area this component covers, in the object's local space.
     * @param {object} self - The owning object
     * @returns {{x: number, y: number, width: number, height: number}} The local bounds
     */
    bounds(self) {
        return { x: -this.width / 2, y: -this.height / 2, width: this.width, height: this.height };
    }
}
