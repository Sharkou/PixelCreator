import { Graphics } from '/src/graphics/graphics.js';

export class Spawner {
    
    /**
     * Initialize the component
     * @constructor
     * @param {string} color - The color
     */
    constructor() {
        
    }

    update(self) {

    }

    /**
     * Preview the component
     * @preview
     */
    preview(self) {
        Graphics.circle(self.x, self.y, self.width / 4);
    }
}