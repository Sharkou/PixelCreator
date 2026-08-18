// An image, centred on the object's origin.
//
// The image itself is looked up by resource id and handed over by the application: this
// component never fetches anything, so it stays usable on a server that has no images
// at all and simply never draws.

export class Sprite {

    static type = 'Sprite';

    static schema = {
        // NARROWED, BECAUSE IT CAN BE. `kind` and `mime` are the two words ADR-0007 gives
        // a reference for saying what it takes; the Editor's picker offers exactly that
        // set and the drop rule refuses exactly the rest, from this one declaration. A
        // Sprite pointed at a scene is not a state worth being able to reach.
        source: { type: 'resource', kind: 'asset', mime: 'image/', default: null },
        width: { type: 'number', default: 0, min: 0 },
        height: { type: 'number', default: 0, min: 0 },
        alpha: { type: 'number', default: 1, min: 0, max: 1 }
    };

    /**
     * Create the component.
     * @param {string} [source] - Resource identifier of the image
     * @param {number} [width] - Destination width in local units
     * @param {number} [height] - Destination height in local units
     * @param {number} [alpha] - Opacity from 0 to 1
     */
    constructor(source = null, width = 0, height = 0, alpha = 1) {
        this.source = source;
        this.width = width;
        this.height = height;
        this.alpha = alpha;

        // The resolved image is runtime state, not project data: absent from the schema,
        // so it is never serialized.
        this.image = null;
    }

    /**
     * Draw the image.
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        if (!this.image || this.width <= 0 || this.height <= 0) return;

        renderer.drawImage(
            this.image,
            -this.width / 2,
            -this.height / 2,
            this.width,
            this.height,
            { alpha: this.alpha }
        );
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
