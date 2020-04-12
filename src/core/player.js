import { Object } from '/src/core/object.js';
import { Camera } from '/src/core/camera.js';
import { Graphics } from '/src/graphics/graphics.js';

export class Player extends Object {
    
    /**
     * Initialize the component
     * @constructor
     * @param {string} name - The name of the object
     * @param {number} x - The x-coordinate of the object
     * @param {number} y - The y-coordinate of the object
     * @param {number} width - The width of the object
     * @param {number} height - The height of the object
     */
    constructor(name, x, y, width, height, texture, speed) {
        
        super(name, x, y, width, height);
        
        this.addComponent(new Texture(idle.frames[0]));
        this.addComponent(new Controller(2.5));
        this.addComponent(new Collider(0, 3, player.width, player.height, true));
        this.addComponent(new Bow());
        this.addComponent(new Animator({
            idle,
            walk,
            bow
        }));

        this.components.animator.play('idle');
    }
}