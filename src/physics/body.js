export class Body {

    /**
     * Rigid body component for platformer physics with gravity, velocity and friction
     * @param {number} gravity - Gravity force applied each frame
     * @param {number} friction - Horizontal friction coefficient (0-1)
     * @param {number} bounce - Bounce coefficient (0-1)
     */
    constructor(gravity = 0.6, friction = 0.85, bounce = 0) {
        this.vx = 0;
        this.vy = 0;
        this.gravity = gravity;
        this.friction = friction;
        this.bounce = bounce;
        this.grounded = false;
        this.maxVX = 6;
        this.maxVY = 12;
    }

    update(self) {
        this.vy += this.gravity;

        if (this.vy > this.maxVY) this.vy = this.maxVY;
        if (this.vy < -this.maxVY) this.vy = -this.maxVY;
        if (this.vx > this.maxVX) this.vx = this.maxVX;
        if (this.vx < -this.maxVX) this.vx = -this.maxVX;

        this.vx *= this.friction;
        if (Math.abs(this.vx) < 0.1) this.vx = 0;

        self.x += this.vx;
        self.y += this.vy;
    }

    applyForce(fx, fy) {
        this.vx += fx;
        this.vy += fy;
    }
}
