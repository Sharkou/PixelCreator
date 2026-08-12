// Canvas 2D backend.
//
// This is the only file in the runtime that knows what a canvas is. It takes a context
// rather than creating one, which keeps DOM ownership with the application and makes
// the backend testable against a recording double.
//
// A WebGL or WebGPU backend implements the same contract next to this one; nothing in
// the model, the components or the scene renderer changes when it does.

import { BlendMode } from './renderer.js';

const COMPOSITE_OPERATION = {
    [BlendMode.NORMAL]: 'source-over',
    [BlendMode.ADDITIVE]: 'lighter'
};

export class Canvas2DRenderer {

    #context;
    #width;
    #height;

    /**
     * Create the backend.
     * @param {CanvasRenderingContext2D} context - The 2D context to draw into
     * @param {object} [options] - Options
     * @param {number} [options.width] - Surface width, read from the canvas when omitted
     * @param {number} [options.height] - Surface height, read from the canvas when omitted
     */
    constructor(context, { width, height } = {}) {
        if (!context) throw new TypeError('Canvas2DRenderer: a 2D context is required');

        this.#context = context;
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
        this.#context.setTransform(matrix.a, matrix.b, matrix.c, matrix.d, matrix.e, matrix.f);
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

    /**
     * Draw an image.
     * @param {object} image - Anything the context accepts as an image source
     * @param {number} x - Left edge
     * @param {number} y - Top edge
     * @param {number} width - Destination width
     * @param {number} height - Destination height
     * @param {object} [options] - { alpha }
     */
    drawImage(image, x, y, width, height, { alpha = 1 } = {}) {
        if (!image) return;
        const context = this.#context;
        context.globalAlpha = alpha;
        context.drawImage(image, x, y, width, height);
        context.globalAlpha = 1;
    }
}
