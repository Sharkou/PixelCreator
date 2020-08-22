import { Graphics } from '/src/graphics/graphics.js';

export class Camera {
    
    /**
     * Initialize the Camera
     * @constructor
     * @param {string} name - The name of the camera
     * @param {number} x - The x-coordinate of the camera
     * @param {number} y - The y-coordinate of the camera
     * @param {number} width - The width of the camera
     * @param {number} height - The height of the camera
     * @param {boolean} main - Set the camera as main
     * @param {string} background - The background color
     * @param {number} max_x - The x-limit for the camera's position
     * @param {number} max_y - The y-limit for the camera's position
     */
    constructor(background = '#272727', max_x = 0, max_y = 0) {

        // super(name, x, y, width, height);

        // Background color
        this.background = background;
        this.fill = false; // fill the black stripes
        
        // The limit for the camera's position
        this.max_x = max_x; // map.cols * map.tsize - width;
        this.max_y = max_y; // map.rows * map.tsize - height;

        // Camera offset
        this.offset = {
            x: 0,
            y: 0,
            speed: 0.1,
            friction: 0.95
        };
        
        // Zoom viewport (scale)
        // this.zoom = 1.0;
    }

    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        Graphics.rect(self.x, self.y, self.width, self.height);
        Graphics.stroke('rgba(255, 255, 255, 0.6)', 0.8);
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