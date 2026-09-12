// Canvas 2D backend.
//
// This is the only file in the runtime that knows what a canvas is. It takes a context
// rather than creating one, which keeps DOM ownership with the application and makes
// the backend testable against a recording double.
//
// A WebGL or WebGPU backend implements the same contract next to this one; nothing in
// the model, the components or the scene renderer changes when it does.

import { Matrix } from '../../core/mod.js';
import { BlendMode } from './renderer.js';
import { noImages } from './images.js';

const COMPOSITE_OPERATION = {
    [BlendMode.NORMAL]: 'source-over',
    [BlendMode.ADDITIVE]: 'lighter'
};

export class Canvas2DRenderer {

    #context;
    #width;
    #height;

    /** The transform in effect, kept so `visibleBounds()` can invert it. */
    #transform = Matrix.identity();
    #images;

    /**
     * Create the backend.
     * @param {CanvasRenderingContext2D} context - The 2D context to draw into
     * @param {object} [options] - Options
     * @param {number} [options.width] - Surface width, read from the canvas when omitted
     * @param {number} [options.height] - Surface height, read from the canvas when omitted
     * @param {object} [options.images] - Where a ResourceId becomes a drawable picture
     *   (ADR-0062 §2). A backend built without one draws no pictures, which is exactly what
     *   a surface with no project behind it should do.
     */
    constructor(context, { width, height, images } = {}) {
        if (!context) throw new TypeError('Canvas2DRenderer: a 2D context is required');

        this.#context = context;
        this.#images = images ?? noImages();
        this.#width = width ?? context.canvas?.width ?? 0;
        this.#height = height ?? context.canvas?.height ?? 0;

        // Pixel art is the house style: never smooth an upscaled sprite.
        context.imageSmoothingEnabled = false;
    }

    get width() {
        return this.#width;
    }

    get height() {
        return this.#height;
    }

    /**
     * Resize the drawing surface.
     * @param {number} width - New width
     * @param {number} height - New height
     */
    resize(width, height) {
        this.#width = width;
        this.#height = height;
        if (this.#context.canvas) {
            this.#context.canvas.width = width;
            this.#context.canvas.height = height;
        }
        this.#context.imageSmoothingEnabled = false;
    }

    /**
     * Clear the surface.
     * @param {string} [color] - Fill colour; the surface is made transparent when omitted
     */
    clear(color) {
        const context = this.#context;
        context.setTransform(1, 0, 0, 1, 0, 0);
        if (color) {
            context.fillStyle = color;
            context.fillRect(0, 0, this.#width, this.#height);
        } else {
            context.clearRect(0, 0, this.#width, this.#height);
        }
    }

    save() {
        this.#context.save();
    }

    restore() {
        this.#context.restore();
    }

    /**
     * Replace the current transform.
     * @param {object} matrix - A matrix with a, b, c, d, e, f components
     */
    setTransform(matrix) {
        this.#transform = matrix;
        this.#context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
    }

    /**
     * The rectangle of the CURRENT space that the surface can show.
     *
     * THE FOUR CORNERS, NOT TWO. Under a rotated transform the screen's rectangle is a
     * rotated quadrilateral in the space being drawn in, and its axis-aligned bounds are the
     * only honest answer a caller iterating rows and columns can use — conservative, never
     * short (the same approximation ADR-0059 §3 accepts for a rotated collider).
     *
     * @returns {{minX: number, minY: number, maxX: number, maxY: number}|null} The bounds, or
     *   null when the transform cannot be inverted and nothing can be said
     */
    visibleBounds() {
        try {
            const inverse = this.#transform.invert();
            const corners = [
                inverse.apply(0, 0),
                inverse.apply(this.#width, 0),
                inverse.apply(this.#width, this.#height),
                inverse.apply(0, this.#height)
            ];

            return {
                minX: Math.min(...corners.map(corner => corner.x)),
                minY: Math.min(...corners.map(corner => corner.y)),
                maxX: Math.max(...corners.map(corner => corner.x)),
                maxY: Math.max(...corners.map(corner => corner.y))
            };
        } catch {
            // A transform scaled to nothing shows nothing, and says so rather than guessing.
            return null;
        }
    }

    /**
     * Choose how drawing combines with the existing pixels.
     * @param {string} mode - One of BlendMode
     */
    setBlendMode(mode) {
        this.#context.globalCompositeOperation = COMPOSITE_OPERATION[mode] ?? COMPOSITE_OPERATION[BlendMode.NORMAL];
    }

    /**
     * Fill a rectangle.
     * @param {number} x - Left edge
     * @param {number} y - Top edge
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {object} [options] - { color, alpha }
     */
    fillRect(x, y, width, height, { color = '#ffffff', alpha = 1 } = {}) {
        const context = this.#context;
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.fillRect(x, y, width, height);
        context.globalAlpha = 1;
    }

    /**
     * Stroke a rectangle.
     * @param {number} x - Left edge
     * @param {number} y - Top edge
     * @param {number} width - Width
     * @param {number} height - Height
     * @param {object} [options] - { color, alpha, lineWidth }
     */
    strokeRect(x, y, width, height, { color = '#ffffff', alpha = 1, lineWidth = 1 } = {}) {
        const context = this.#context;
        context.globalAlpha = alpha;
        context.strokeStyle = color;
        context.lineWidth = lineWidth;
        context.strokeRect(x, y, width, height);
        context.globalAlpha = 1;
    }

    /**
     * Fill a circle.
     * @param {number} x - Centre
     * @param {number} y - Centre
     * @param {number} radius - Radius
     * @param {object} [options] - { color, alpha }
     */
    fillCircle(x, y, radius, { color = '#ffffff', alpha = 1 } = {}) {
        const context = this.#context;
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.beginPath();
        context.arc(x, y, Math.max(0, radius), 0, Math.PI * 2);
        context.fill();
        context.globalAlpha = 1;
    }

    /** Where this backend's pictures come from. */
    get images() {
        return this.#images;
    }

    /**
     * Draw a picture.
     *
     * THE IDENTITY ARRIVES, NEVER THE PIXELS (ADR-0062 §2). A Component names what it wants
     * drawn and this file answers for it, which is what keeps an `ImageBitmap` — a value
     * that could never be serialized — out of the model entirely.
     *
     * A PICTURE THAT IS NOT DECODED YET DRAWS NOTHING, and the next frame draws it. There is
     * no placeholder and no wait: `get()` starts the decode and answers what it has.
     *
     * @param {string} source - The image's ResourceId
     * @param {number} x - Left edge
     * @param {number} y - Top edge
     * @param {number} width - Destination width
     * @param {number} height - Destination height
     * @param {object} [options] - `{ alpha, clip }`
     */
    drawImage(source, x, y, width, height, { alpha = 1, clip = null } = {}) {
        const image = this.#images.get(source);
        if (!image || width <= 0 || height <= 0) return;

        const context = this.#context;
        context.globalAlpha = alpha;

        // A CLIP IS A RECTANGLE OF THE SOURCE, which is the whole of what a spritesheet
        // needs (ADR-0062 §4): nine arguments instead of five, and no second primitive.
        //
        // AND THERE IS NO `flipX`. Mirroring is `Transform.rotationY = 180°`, which ADR-0050
        // settled by REMOVING a `flipX` boolean: under an orthographic projection a rotation
        // about the vertical axis IS a horizontal scale by `cos θ`, so the matrix already
        // does it exactly — and says `45` where a boolean could only say "back".
        if (clip) context.drawImage(image, clip.x, clip.y, clip.width, clip.height, x, y, width, height);
        else context.drawImage(image, x, y, width, height);

        context.globalAlpha = 1;
    }

    /**
     * The natural pixel size of a picture, or null when it is not decoded yet.
     * @param {string} source - The image's ResourceId
     * @returns {{width: number, height: number}|null} Its size
     */
    imageSize(source) {
        return this.#images.size(source);
    }

    /**
     * Draw a line of text.
     *
     * THE SIZE AND THE FAMILY ARE COMPOSED HERE, and only here. A CSS font shorthand is a
     * canvas's own dialect — `16px sans-serif` means nothing to a WebGL backend — so the
     * contract carries the two numbers and this file, which is the one that owns a canvas,
     * spells them the way a canvas reads them.
     *
     * ONE LINE, NO WRAPPING. `fillText` does not break on a newline and this does not
     * pretend otherwise: a paragraph is a layout problem, and inventing a line height here
     * would be the first half of a text engine nobody has designed.
     *
     * @param {string} text - What to draw
     * @param {number} x - Anchor, horizontally; `align` says which edge it is
     * @param {number} y - Anchor, vertically; `baseline` says which edge it is
     * @param {object} [options] - { color, alpha, fontSize, fontFamily, align, baseline }
     */
    fillText(text, x, y, {
        color = '#ffffff',
        alpha = 1,
        fontSize = 16,
        fontFamily = 'sans-serif',
        align = 'left',
        baseline = 'middle'
    } = {}) {
        const value = globalThis.String(text ?? '');
        if (value === '') return;

        const context = this.#context;
        context.globalAlpha = alpha;
        context.fillStyle = color;
        context.font = `${fontSize}px ${fontFamily}`;
        context.textAlign = align;
        context.textBaseline = baseline;
        context.fillText(value, x, y);
        context.globalAlpha = 1;
    }
}
