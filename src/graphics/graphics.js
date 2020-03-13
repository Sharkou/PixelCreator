// import { Color } from '/src/graphics/color.js';

export class Graphics {
    
    /**
     * Update context of canvas
     * @static
     * @param {CanvasRenderingContext2D} ctx - The context
     */
    static initContext(ctx) {
        this.ctx = ctx;
    }
    
    /**
     * Fill shapes
     * @static
     * @param {string} color - The color
     * @param {number} opacity - The opacity
     */
    static fill(color, opacity = 1) {
        
        // Graphics.ctx.fillStyle = (opacity !== 1) ? Color.createAlphaColor(color, opacity) : color;
        
        Graphics.ctx.fillStyle = color;
        Graphics.ctx.globalAlpha = opacity;
        Graphics.ctx.fill();
        Graphics.ctx.globalAlpha = 1;
    }
    
    /**
     * Stroke shapes
     * @static
     * @param {string} color - The color
     * @param {number} opacity - The opacity
     */
    static stroke(color, opacity = 1, width = 1) {
        
        // Graphics.ctx.strokeStyle = (opacity !== 1) ? Color.createAlphaColor(color, opacity) : color;
        
        Graphics.ctx.strokeStyle = color;
        Graphics.ctx.lineWidth = width;
        Graphics.ctx.globalAlpha = opacity;
        Graphics.ctx.stroke();
        Graphics.ctx.globalAlpha = 1;
    }
    
    /**
     * Draw a circle
     * @static
     * @param {number} x - The x-coordinate
     * @param {number} y - The y-coordinate
     * @param {number} r - The radius
     */
    static circle(x, y, r) {
        
        Graphics.ctx.beginPath();

        Graphics.ctx.arc(
            x, // + Viewport.offset.x,
            y, // + Viewport.offset.y,
            r,
            0,
            Math.PI * 2
        );
    }
    
    /**
     * Draw a rectangle
     * @static
     * @param {number} x - The x-coordinate
     * @param {number} y - The y-coordinate
     * @param {number} width - The width of the rectangle
     * @param {number} height - The height of the rectangle
     */
    static rect(x, y, width, height) {
        
        Graphics.ctx.beginPath();
        
        Graphics.ctx.rect(
            x - width / 2,
            y - height / 2,
            width,
            height
        );
    }
    
    /**
     * Draw a rectangle
     * @static
     * @param {HTMLImageElement} image - The image
     * @param {number} x - The x-coordinate
     * @param {number} y - The y-coordinate
     */
    static image(image, x, y) {
        
        if (!image) return;
        
        Graphics.ctx.beginPath();
        
        // Dimensions de l'image pour centrer le pivot
        let width = image.naturalWidth;
        let height = image.naturalHeight;
        
        Graphics.ctx.drawImage(
            image,
            x - width / 2,
            y - height / 2
        );
        
    }

    /**
     * Draw a light
     * @static
     * @param {number} x - The x-coordinate
     * @param {number} y - The y-coordinate
     * @param {number} radius - The radius of the light
     */
    static light(x, y, radius) {  
        
        Graphics.ctx.beginPath();

        Graphics.ctx.save();

        Graphics.ctx.globalCompositeOperation = 'lighter';
        let rnd = 0.05 * Math.sin(1.1 * Date.now() / 1000);
        radius = radius * (1 + rnd);
        let radialGradient = Graphics.ctx.createRadialGradient(x, y, 0, x, y, radius);
        radialGradient.addColorStop(0.0, '#BB9');
        radialGradient.addColorStop(0.2 + rnd, '#AA8');
        radialGradient.addColorStop(0.7 + rnd, '#330');
        radialGradient.addColorStop(0.90, '#110');
        radialGradient.addColorStop(1, '#000');
        Graphics.ctx.fillStyle = radialGradient;
        Graphics.ctx.beginPath();
        Graphics.ctx.arc(x, y, radius, 0, 2 * Math.PI);
        Graphics.ctx.fill();
        
        Graphics.ctx.restore();
    }
}