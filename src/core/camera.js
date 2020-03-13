import { Object } from '/src/core/object.js';
import { Mouse } from '/src/input/mouse.js';

export class Camera extends Object {
    
    /**
     * Initialize the camera component
     * @constructor
     * @param {number} maxX - The x-limit for the camera's position
     * @param {number} maxY - The y-limit for the camera's position
     */
    constructor(name, x, y, width, height, main = false, maxX = 0, maxY = 0) {

        super(name, x, y, width, height);

        // Set the camera as main
        if (main) {
            Camera.main = this;
        }
        
        // The limit for the camera's position
        this.maxX = maxX; // map.cols * map.tsize - width;
        this.maxY = maxY; // map.rows * map.tsize - height;

        // Camera offset
        this.offset = {
            x: 0,
            y: 0,
            speed: 0.1,
            friction: 0.95
        };
        
        // Zoom viewport
        this.zoom = 1.0;
    }
    
    /**
     * Get main camera
     * @return {Camera} camera - The main camera
     */
    static get main() {
        
        return this._main;
    }
    
    /**
     * Set main camera
     * @param {Camera} camera - The main camera
     */
    static set main(camera) {
        
        this._main = camera;
    }
}