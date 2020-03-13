import { Graphics } from '/src/graphics/graphics.js';

export class Rect {
    
    /**
     * Initialize the component
     * @constructor
     * @param {string} color - The color
     * @param {number} opacity - The opacity
     */
    constructor(color = '#000', opacity = 1, fill = true) {
        
        this.color = color;
        this.opacity = opacity;
        this.fill = fill;
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        Graphics.rect(self.x, self.y, self.width, self.height);
        
        if (this.fill) {

            Graphics.fill(this.color, this.opacity);
        }
        
        else {
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

window.Rect = Rect;