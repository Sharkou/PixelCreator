import { Graphics } from '/src/graphics/graphics.js';

export class Text {

    /**
     * Render text on the canvas
     * @constructor
     * @param {string} content - The text to display
     * @param {string} font - Font family
     * @param {number} size - Font size in pixels
     * @param {string} color - Text color
     */
    constructor(content = 'Text', font = 'Arial', size = 16, color = '#000000') {

        this.content = content;
        this.font = font;
        this.size = size;
        this.color = color;
        this.opacity = 1;
        this.align = 'center';
        this.baseline = 'middle';
        this.bold = false;
        this.italic = false;
        this.maxWidth = 0;
        this.lineHeight = 1.2;
        this.stroke = false;
        this.strokeColor = '#000000';
        this.strokeWidth = 2;
    }

    update(self) {

    }

    /**
     * Draw the text
     * @draw
     */
    draw(self) {
        const ctx = Graphics.ctx;
        ctx.save();

        const weight = this.bold ? 'bold ' : '';
        const style = this.italic ? 'italic ' : '';
        ctx.font = `${style}${weight}${this.size}px ${this.font}`;
        ctx.textAlign = this.align;
        ctx.textBaseline = this.baseline;
        ctx.globalAlpha = this.opacity;

        if (this.maxWidth > 0) {
            this.#drawWrapped(ctx, self.x, self.y);
        } else {
            if (this.stroke) {
                ctx.strokeStyle = this.strokeColor;
                ctx.lineWidth = this.strokeWidth;
                ctx.strokeText(this.content, self.x, self.y);
            }
            ctx.fillStyle = this.color;
            ctx.fillText(this.content, self.x, self.y);
        }

        ctx.restore();
    }

    /**
     * Draw text with word wrapping
     * @param {CanvasRenderingContext2D} ctx
     * @param {number} x
     * @param {number} y
     */
    #drawWrapped(ctx, x, y) {
        const words = this.content.split(' ');
        let line = '';
        let lineY = y;
        const lineSpacing = this.size * this.lineHeight;

        for (let i = 0; i < words.length; i++) {
            const test = line + words[i] + ' ';
            const metrics = ctx.measureText(test);

            if (metrics.width > this.maxWidth && i > 0) {
                this.#drawLine(ctx, line.trim(), x, lineY);
                line = words[i] + ' ';
                lineY += lineSpacing;
            } else {
                line = test;
            }
        }
        this.#drawLine(ctx, line.trim(), x, lineY);
    }

    /**
     * Draw a single line of text
     * @param {CanvasRenderingContext2D} ctx
     * @param {string} text
     * @param {number} x
     * @param {number} y
     */
    #drawLine(ctx, text, x, y) {
        if (this.stroke) {
            ctx.strokeStyle = this.strokeColor;
            ctx.lineWidth = this.strokeWidth;
            ctx.strokeText(text, x, y);
        }
        ctx.fillStyle = this.color;
        ctx.fillText(text, x, y);
    }
}
