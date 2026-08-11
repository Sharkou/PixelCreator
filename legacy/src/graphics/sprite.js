import { Object } from '/src/core/object.js';
import { Texture } from '/src/graphics/texture.js';
import { Animator } from '/src/anim/animator.js';

export class Sprite extends Object {
    
    /**
     * Initialize the Sprite
     * @constructor
     * @param {string} name - The name of the sprite
     * @param {number} x - The x-coordinate of the object
     * @param {number} y - The y-coordinate of the object
     * @param {number} width - The width of the object
     * @param {number} height - The height of the object
     * @param {Image} image - The texture to display
     * @param {Array} animations - Animations list
     */
    constructor(name, x, y, width, height, image, animations) {
        
        super(name, x, y, width, height);
        
        this.addComponent(new Texture(image));
        this.addComponent(new Animator(animations));
    }
}