// Viewport — the screen rectangle the scene is shown in.
//
// A viewport is not a camera and not a scene object. It describes the surface: how many
// pixels wide and high the drawing area is. It has no position in the world, no
// transform, and no place in the scene graph — resizing a window changes a viewport,
// and must not touch the model.
//
// Legacy had no such separation, which is the ambiguity this resolves (ADR-0013):
// `Camera` was at once a component class, an Object carrying it, and the screen
// projection, so `camera.x` and `camera.getComponent('Camera').background` were read off
// the same identifier in the same function.
//
// SCREEN SPACE: origin at the top-left corner, x to the right, y down — the convention
// every 2D surface and every pointer event already uses. The centre, where the camera
// looks, is therefore (width / 2, height / 2).

export class Viewport {

    #width;
    #height;

    /**
     * Create a viewport.
     * @param {number} [width] - Width in pixels
     * @param {number} [height] - Height in pixels
     */
    constructor(width = 0, height = 0) {
        this.#width = size(width, 'width');
        this.#height = size(height, 'height');
    }

    get width() {
        return this.#width;
    }

    set width(width) {
        this.#width = size(width, 'width');
    }

    get height() {
        return this.#height;
    }

    set height(height) {
        this.#height = size(height, 'height');
    }

    /**
     * Resize the viewport.
     * @param {number} width - Width in pixels
     * @param {number} height - Height in pixels
     * @returns {Viewport} This viewport
     */
    resize(width, height) {
        this.width = width;
        this.height = height;
        return this;
    }

    /** Horizontal centre, where a camera's world position lands. */
    get centerX() {
        return this.#width / 2;
    }

    /** Vertical centre. */
    get centerY() {
        return this.#height / 2;
    }

    /**
     * Whether a screen point falls inside the viewport.
     * @param {number} x - Horizontal screen coordinate
     * @param {number} y - Vertical screen coordinate
     * @returns {boolean} True when inside
     */
    contains(x, y) {
        return x >= 0 && y >= 0 && x <= this.#width && y <= this.#height;
    }
}

function size(value, name) {
    if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) {
        throw new RangeError(`Viewport: ${name} must be a finite number of pixels, got ${value}`);
    }
    return value;
}
