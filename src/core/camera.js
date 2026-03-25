import { Graphics } from '/src/graphics/graphics.js';
import { Time } from '/src/time/time.js';
import { Random } from '/src/math/random.js';

export class Camera {
    
    /**
     * Initialize the Camera component
     * @constructor
     * @param {string} background - The background color
     * @param {number} max_x - The x-limit for the camera's position
     * @param {number} max_y - The y-limit for the camera's position
     */
    constructor(background = '#272727', max_x = 0, max_y = 0) {

        // Background color
        this.background = background;
        this.fill = false;
        
        // World bounds (0 = no limit)
        this.max_x = max_x;
        this.max_y = max_y;

        // Camera offset for smooth movement
        this.offset = {
            x: 0,
            y: 0,
            speed: 0.1,
            friction: 0.95
        };

        // Follow target
        this.target = null;
        this.followSpeed = 0.1;
        this.deadzone = { x: 0, y: 0, width: 0, height: 0 };

        // Screen shake
        this._shakeIntensity = 0;
        this._shakeDuration = 0;
        this._shakeTimer = 0;
        this._shakeOffsetX = 0;
        this._shakeOffsetY = 0;
    }

    /**
     * Follow a target object with smooth lerp
     * @param {Object} obj - The object to follow
     * @param {number} speed - Follow speed (0 = instant, 1 = no movement)
     */
    follow(obj, speed = 0.1) {
        this.target = obj;
        this.followSpeed = Math.max(0, Math.min(1, speed));
    }

    /**
     * Stop following the current target
     */
    unfollow() {
        this.target = null;
    }

    /**
     * Set a deadzone rectangle (camera won't move if target is inside)
     * @param {number} x - Center offset x
     * @param {number} y - Center offset y
     * @param {number} width - Deadzone width
     * @param {number} height - Deadzone height
     */
    setDeadzone(x, y, width, height) {
        this.deadzone = { x, y, width, height };
    }

    /**
     * Trigger a screen shake effect
     * @param {number} intensity - The shake intensity in pixels
     * @param {number} duration - The shake duration in milliseconds
     */
    shake(intensity = 5, duration = 300) {
        this._shakeIntensity = intensity;
        this._shakeDuration = duration;
        this._shakeTimer = duration;
    }

    /**
     * Update the camera each frame (called automatically by the engine)
     * @update
     */
    update(self) {
        
        // Follow target
        if (this.target) {
            const targetX = this.target.x + this.target.width / 2 - self.width / 2;
            const targetY = this.target.y + this.target.height / 2 - self.height / 2;

            // Deadzone check
            const dz = this.deadzone;
            const dx = (this.target.x + this.target.width / 2) - (self.x + self.width / 2 + dz.x);
            const dy = (this.target.y + this.target.height / 2) - (self.y + self.height / 2 + dz.y);

            if (dz.width > 0 && dz.height > 0) {
                if (Math.abs(dx) > dz.width / 2) {
                    self.x += (targetX - self.x) * this.followSpeed * Time.deltaTime;
                }
                if (Math.abs(dy) > dz.height / 2) {
                    self.y += (targetY - self.y) * this.followSpeed * Time.deltaTime;
                }
            } else {
                self.x += (targetX - self.x) * this.followSpeed * Time.deltaTime;
                self.y += (targetY - self.y) * this.followSpeed * Time.deltaTime;
            }
        }

        // Clamp to world bounds
        if (this.max_x > 0) {
            self.x = Math.max(0, Math.min(self.x, this.max_x - self.width));
        }
        if (this.max_y > 0) {
            self.y = Math.max(0, Math.min(self.y, this.max_y - self.height));
        }

        // Screen shake
        if (this._shakeTimer > 0) {
            const progress = this._shakeTimer / this._shakeDuration;
            const magnitude = this._shakeIntensity * progress;
            this._shakeOffsetX = (Random.range(-1, 1)) * magnitude;
            this._shakeOffsetY = (Random.range(-1, 1)) * magnitude;
            this._shakeTimer -= Time.deltaTime * (1000 / 60);
        } else {
            this._shakeOffsetX = 0;
            this._shakeOffsetY = 0;
        }
    }

    /**
     * Get the final camera x position (with shake offset)
     * @param {Object} self - The parent object
     * @returns {number} The x position with shake applied
     */
    getX(self) {
        return self.x + this._shakeOffsetX;
    }

    /**
     * Get the final camera y position (with shake offset)
     * @param {Object} self - The parent object
     * @returns {number} The y position with shake applied
     */
    getY(self) {
        return self.y + this._shakeOffsetY;
    }

    /**
     * Preview the component in the editor
     * @preview
     */
    preview(self) {
        Graphics.rect(self.x, self.y, self.width, self.height);
        Graphics.stroke('rgba(255, 255, 255, 0.6)', 0.8);
    }
}
    /**
     * Get main camera
     * @returns {Camera} camera - The main camera
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