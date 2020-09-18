import { Object } from '/src/core/object.js';
import { System } from '/src/core/system.js';
import { Scene } from '/src/core/scene.js';
import { Camera } from '/src/core/camera.js';
import { Mouse } from '/src/input/mouse.js';
import { Keyboard } from '/src/input/mouse.js';

export class Node {
    
    /**
     * Create Node in blueprint editor
     * @constructor
     * @param {string} name - The node name
     */
    constructor(name) {
        this.name = name;
    }
}