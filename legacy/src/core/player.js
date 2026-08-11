import { Object } from '/src/core/object.js';
import { Texture } from '/src/graphics/texture.js';
import { Controller } from '/src/physics/controller.js';
import { RectCollider } from '/src/physics/collider.js';

export class Player extends Object {
    
    /**
     * Initialize a player object with default components
     * @constructor
     * @param {string} name - The name of the object
     * @param {number} x - The x-coordinate of the object
     * @param {number} y - The y-coordinate of the object
     * @param {number} width - The width of the object
     * @param {number} height - The height of the object
     * @param {string} texture - The texture source path
     * @param {number} speed - The movement speed
     */
    constructor(name, x, y, width, height, texture = null, speed = 2) {
        
        super(name, x, y, width, height);
        
        if (texture) {
            this.addComponent(new Texture(texture));
        }
        this.addComponent(new Controller(speed));
        this.addComponent(new RectCollider(0, 0, true, '#e02c2c', width, height));
    }
}