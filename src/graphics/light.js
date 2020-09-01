import { Graphics } from '/src/graphics/graphics.js';

export class Light {
    
    /***
     * Initialize the component
     * @constructor
     * @param {string} color - The color
     * @param {number} opacity - The opacity
     */
    constructor(color = '#FFFFFF', opacity = 1, radius = 20) {
        this.color = color;
        this.opacity = opacity;
        this.radius = radius;
    }
    
    /**
     * Update the component
     * @update
     */
    update(self) {
        self.width = this.radius * 2;
        self.height = this.radius * 2;
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        Graphics.light(self.x, self.y, this.radius)
    }
}