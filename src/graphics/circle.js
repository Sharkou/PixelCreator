import { Graphics } from '/src/graphics/graphics.js';
import { Components } from '/src/core/components.js';

export class Circle {
    
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

    update(self) {

    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        Graphics.circle(self.x, self.y, self.width / 2);
        
        if (this.fill) {

            Graphics.fill(this.color, this.opacity);
        }

        else {

            Graphics.stroke(this.color, this.opacity);
        }
    }
}

window.Circle = Circle;

Components.add(Circle, 'fad fa-circle', 'graphics');