import { Graphics } from '/src/graphics/graphics.js';

export class Spawner {
    
    /**
     * Create a new spawn point for multiplayer
     */
    constructor() {
        
    }

    /**
     * Update the spawner each frame
     * @param {Object} self - The parent game object
     */
    update(self) {

    }

    /**
     * Preview the spawner in the editor
     * @param {Object} self - The parent game object
     */
    preview(self) {
        Graphics.circle(self.x, self.y, self.width / 4);
    }
}