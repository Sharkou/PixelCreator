import { Graphics } from '/src/graphics/graphics.js';

/**
 * Spawn point component for multiplayer
 * Defines locations where players can spawn in the game
 */
export class Spawner {
    
    /**
     * Create a new spawner
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