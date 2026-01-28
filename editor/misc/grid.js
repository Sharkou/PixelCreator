import { Camera } from '/src/core/camera.js';

/**
 * Grid overlay for the scene editor
 * Draws a visual grid to help with object placement
 * 
 * @class Grid
 * @static
 * @example
 * // Draw grid on canvas
 * Grid.draw(ctx);
 * 
 * // Toggle grid visibility
 * Grid.active = false;
 */
export class Grid {

    /** @type {number} Grid cell size in pixels */
    static dt = 50;
    
    /** @type {number} Grid width */
    static length = 400;
    
    /** @type {number} Grid height */
    static height = 400;
    
    /** @type {number} Maximum lines before disabling dashes (performance) */
    static dashLimit = 3500;
    
    /** @type {number} Dash length in pixels */
    static dashfull = 4;
    
    /** @type {number} Gap between dashes in pixels */
    static dashvoid = 2;
    
    /** @type {number} Total dash pattern length */
    static dashtotal = this.dashfull + this.dashvoid;
    
    /** @type {number} Grid line width */
    static lineWidth = 1;
    
    /** @type {number} Sub-pixel alignment gap */
    static gap = (Grid.lineWidth % 2 == 0) ? 0 : 0.5;
    
    /** @type {boolean} Whether grid is visible */
    static active = true;
    
    /**
     * Draw the grid on the canvas
     * @static
     * @param {CanvasRenderingContext2D} ctx - The canvas context
     */
    static draw(ctx) {

        const camera = Camera.main;
        const canvas = document.getElementById('canvas');
        this.length = canvas.width;
        this.height = canvas.height;

        // Save the entire state of the canvas
        ctx.save();

        // Zoom
        ctx.scale(camera.scale, camera.scale);

        ctx.lineWidth = this.lineWidth;
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.025)';
        ctx.beginPath();

        // Tilemap grid
        let max1 = this.length * (1 / camera.scale) + 3 * this.dt;
        let max2 = this.height * (1 / camera.scale) + 3 * this.dt;

        if (max1 + max2 < this.dashLimit) {
            // ctx.setLineDash([this.dashfull, this.dashvoid]);
        }

        // Vertical lines
        for (let i = -this.dt + this.gap; i < max1; i += this.dt) {
            ctx.moveTo(i - (camera.x % this.dt), max2 - (camera.y % this.dt));
            ctx.lineTo(i - (camera.x % this.dt), -max1 - (camera.y % this.dt));
            for (let j = i; j < i + this.dt; j += 10) {
                ctx.moveTo(j - (camera.x % this.dt), max2 - (camera.y % this.dt));
                ctx.lineTo(j - (camera.x % this.dt), -max1 - (camera.y % this.dt));
            }
        }

        // Horizontal lines
        for (let i = -this.dt + this.gap; i < max2; i += this.dt) {
            ctx.moveTo(-max2 - (camera.x % this.dt), i - (camera.y % this.dt));
            ctx.lineTo(max1 - (camera.x % this.dt), i - (camera.y % this.dt));
            for (let j = i; j < i + this.dt; j += 10) {
                ctx.moveTo(-max2 - (camera.x % this.dt), j - (camera.y % this.dt));
                ctx.lineTo(max1 - (camera.x % this.dt), j - (camera.y % this.dt));
            }
        }        

        ctx.stroke();

        // Restore the saved state of the canvas
        ctx.restore();
    }
}

const button = document.getElementById('gridBtn');

// Display ruler
button.addEventListener('click', () => {
    Grid.active = !Grid.active;
    button.classList.toggle('active');
});