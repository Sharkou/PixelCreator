import { Time } from '/src/time/time.js';
import { Keyboard } from '/src/input/keyboard.js';

export class Controller {
    
    /**
     * Initialize the controller component
     * @constructor
     * @param {number} speed - Maximum movement speed
     * @param {string} layout - Keyboard layout ('wasd', 'zqsd', 'arrows')
     */
    constructor(speed = 2, layout = 'zqsd') {
        
        this.speed = speed;
        this.direction = '';
        this.moving = false;

        // Velocity
        this.vx = 0;
        this.vy = 0;

        // Acceleration / deceleration
        this.acceleration = 0.4;
        this.friction = 0.8;

        // Key bindings
        this.setLayout(layout);
    }

    /**
     * Set keyboard layout
     * @param {string} layout - 'wasd', 'zqsd', or 'arrows'
     */
    setLayout(layout) {
        switch (layout) {
            case 'wasd':
                this.right = 'd';
                this.left = 'a';
                this.up = 'w';
                this.down = 's';
                break;
            case 'arrows':
                this.right = 'ArrowRight';
                this.left = 'ArrowLeft';
                this.up = 'ArrowUp';
                this.down = 'ArrowDown';
                break;
            case 'zqsd':
            default:
                this.right = 'd';
                this.left = 'q';
                this.up = 'z';
                this.down = 's';
                break;
        }
    }

    /**
     * Update the controller each frame
     * @update
     */
    update(self) {

        let moveX = 0;
        let moveY = 0;

        if (Keyboard.keyPressed(self.uid)) {
            const keys = Keyboard.keys(self.uid);

            if (keys[this.right]) moveX += 1;
            if (keys[this.left])  moveX -= 1;
            if (keys[this.down])  moveY += 1;
            if (keys[this.up])    moveY -= 1;
        }

        // Normalize diagonal movement
        if (moveX !== 0 && moveY !== 0) {
            const norm = Math.SQRT1_2; // 1 / sqrt(2)
            moveX *= norm;
            moveY *= norm;
        }

        // Apply acceleration
        this.vx += moveX * this.acceleration * Time.deltaTime;
        this.vy += moveY * this.acceleration * Time.deltaTime;

        // Apply friction when no input
        if (moveX === 0) this.vx *= this.friction;
        if (moveY === 0) this.vy *= this.friction;

        // Clamp to max speed
        this.vx = Math.max(-this.speed, Math.min(this.speed, this.vx));
        this.vy = Math.max(-this.speed, Math.min(this.speed, this.vy));

        // Stop drift (snap to zero when very slow)
        if (Math.abs(this.vx) < 0.01) this.vx = 0;
        if (Math.abs(this.vy) < 0.01) this.vy = 0;

        // Move the object
        if (this.vx !== 0 || this.vy !== 0) {
            self.translate(this.vx * Time.deltaTime, this.vy * Time.deltaTime);
            this.moving = true;
        } else {
            this.moving = false;
        }

        // Update direction
        if (moveX > 0) this.direction = 'right';
        else if (moveX < 0) this.direction = 'left';
        else if (moveY > 0) this.direction = 'down';
        else if (moveY < 0) this.direction = 'up';
    }
}