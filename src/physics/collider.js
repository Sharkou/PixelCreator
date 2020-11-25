import { Graphics } from '/src/graphics/graphics.js';
import { Scene } from '/src/core/scene.js';
import { System } from '/src/core/system.js';

export class Collider {
    
    #isOnCollision;
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} offsetX - The offset x
     * @param {number} offsetY - The offset y
     * @param {number} preview - Activated or not
     * @param {number} color - The color of preview
     * @param {number} opacity - The opacity of preview
     */
    constructor(offsetX = 0, offsetY = 0, preview = true, color = '#e02c2c') {
        
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        
        this.preview = preview;
        this.color = color;
        this.opacity = 1;

        this.is_trigger = false;
        
        this.#isOnCollision = new Map();
    }

    constructorAfterLink(self) {
        
        this.testCollisions(self);
        
    }
    
    /**
     * @update
     */
    update(self) {
        this.#isOnCollision.forEach((value, id) =>
        {
            let other = Scene.main.objects[id];
            if (other)
            {
                self.onCollision(other);
                other.onCollision(self);
                console.log("On collision !"); // TO DELETE
            }
        });
    }

    /**
     * test the collision with every objects concerned
     * @testCollisions
     */
    testCollisions(self) {
        
        if (!Scene.main || !self) return;
        for (let id in Scene.main.objects) {
            
            // Store the other object
            let other = Scene.main.objects[id];

            if (other != undefined && other != null && other != self && other.active) {

                this.o_collider = other.components.collider || other.components.rectcollider || other.components.circlecollider;
                
                if (this.o_collider && this.o_collider.active) {
                    
                    if (this.testCollision(self, other))
                    {
                        if (!this.#isOnCollision.has(id))
                        {
                            console.log("Start collision !"); // TO DELETE
                            this.#isOnCollision.set(id, true);
                            this.o_collider.#isOnCollision.set(self.id, true);
                            self.onCollisionStart(other);
                            other.onCollisionStart(self);
                            self.onCollision(other);
                            other.onCollision(self);
                        }
                    }
                    else if (this.#isOnCollision.has(id))
                    {
                        console.log("Exit collision..."); // TO DELETE
                        this.#isOnCollision.delete(id);
                        this.o_collider.#isOnCollision.delete(self.id);
                        self.onCollisionExit(other);
                        other.onCollisionExit(self);
                    }
                    
                }
            }
        }
    }
    
    /**
     * test the collision with the class type
     * @testCollision
     */
    testCollision(self, other) {
        return this.o_collider.testCollisionWithPoint(other, self, this.o_collider, this);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other, s_collider, o_collider) {
        return (((self.x + s_collider.offsetX) == (other.x + o_collider.offsetX)) && ((self.y + s_collider.offsetY) == (other.y + o_collider.offsetY)));
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other, s_collider, o_collider) {
        let collisionX = self.x + s_collider.offsetX;
        let collisionY = self.y + s_collider.offsetY;
        let otherWidth = o_collider.width;
        let otherHeight = o_collider.height;
        let otherX = other.x + o_collider.offsetX - otherWidth/2.;
        let otherY = other.y + o_collider.offsetY - otherHeight/2.;
        return (!(collisionX < otherX || collisionX > otherX+otherWidth) && !(collisionY < otherY || collisionY > otherY+otherHeight));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other, s_collider, o_collider) {
        let collisionX = self.x + s_collider.offsetX;
        let collisionY = self.y + s_collider.offsetY;
        let otherX = other.x + o_collider.offsetX;
        let otherY = other.y + o_collider.offsetY;
        let otherWidth = o_collider.width;
        return ((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth);
    }
    
    /**
     * Draw the component
     * @preview
     */
    preview(self) {
        
        if (this.preview) {
            Graphics.circle(self.x + this.offsetX, self.y + this.offsetY, 1);
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

export class RectCollider extends Collider {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} offsetX - The offset x
     * @param {number} offsetY - The offset y
     * @param {number} preview - Activated or not
     * @param {number} color - The color of preview
     * @param {number} opacity - The opacity of preview
     * @param {number} width - The width
     * @param {number} height - The height
     */
    constructor(offsetX = 0, offsetY = 0, preview = true, color = '#e02c2c', width = 40, height = 40) {
        
        super(offsetX, offsetY, preview, color);
        
        // Dimensions
        this.width = width;
        this.height = height;
    }
    
    /**
     * test the collision with the class type
     * @testCollision
     */
    testCollision(self, other) {
        return this.o_collider.testCollisionWithRect(other, self, this.o_collider, this);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other, s_collider, o_collider) {
        let otherX = other.x + o_collider.offsetX;
        let otherY = other.y + o_collider.offsetY;
        let collisionWidth = s_collider.width;
        let collisionHeight = s_collider.height;
        let collisionX = self.x + s_collider.offsetX - collisionWidth/2;
        let collisionY = self.y + s_collider.offsetY - collisionHeight/2;
        return (!(otherX < collisionX || otherX > collisionX+collisionWidth) && !(otherY < collisionY || otherY > collisionY+collisionHeight));
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other, s_collider, o_collider) {
        let collisionWidth = s_collider.width;
        let collisionHeight = s_collider.height;
        let collisionX = self.x + s_collider.offsetX - collisionWidth/2;
        let collisionY = self.y + s_collider.offsetY - collisionHeight/2;
        let otherWidth = o_collider.width;
        let otherHeight = o_collider.height;
        let otherX = other.x + o_collider.offsetX - otherWidth/2;
        let otherY = other.y + o_collider.offsetY - otherHeight/2;
        return !((otherX >= collisionX + collisionWidth) || (otherX + otherWidth <= collisionX) || (otherY >= collisionY + collisionHeight) || (otherY + otherHeight <= collisionY));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other, s_collider, o_collider) {
        let collisionWidth = s_collider.width;
        let collisionHeight = s_collider.height;
        let collisionX = self.x + s_collider.offsetX - collisionWidth/2;
        let collisionY = self.y + s_collider.offsetY - collisionHeight/2;
        let otherX = other.x + o_collider.offsetX;
        let otherY = other.y + o_collider.offsetY;
        let otherWidth = o_collider.width;
        let otherBoxX = otherX - otherWidth;
        let otherBoxY = otherY - otherWidth;
        let otherBoxWidth = otherWidth*2;
        
        if (((otherBoxX >= collisionX + collisionWidth) || (otherBoxX + otherBoxWidth <= collisionX) || (otherBoxY >= collisionY + collisionHeight) || (otherBoxY + otherBoxWidth <= collisionY)))
            {return false;}
        if (((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth)
           || ((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY+collisionHeight)*(collisionY-otherY+collisionHeight) <= otherWidth*otherWidth)
           || ((collisionX-otherX+collisionWidth)*(collisionX-otherX+collisionWidth) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth)
           || ((collisionX-otherX+collisionWidth)*(collisionX-otherX+collisionWidth) + (collisionY-otherY+collisionHeight)*(collisionY-otherY+collisionHeight) <= otherWidth*otherWidth))
            {return true;}
        if (!(otherX < collisionX || otherX > collisionX+collisionWidth) && !(otherY < collisionY || otherY > collisionY+collisionHeight))
            {return true;}
        return (((((otherY-collisionY)*(collisionHeight)) * ((otherY-(collisionY+collisionHeight))*(collisionHeight))) > 0)
            ^ ((((otherX-collisionX)*(collisionWidth)) * ((otherX-(collisionX+collisionWidth))*(collisionWidth))) > 0));
    }
    
    /**
     * Draw the component
     * @preview
     */
    preview(self) {
        
        if (this.preview) {
            Graphics.rect(self.x + this.offsetX, self.y + this.offsetY, this.width, this.height);
            Graphics.stroke(this.color, this.opacity);
        }
    }
    
    /**
     * Detect mouse hover
     * @param {Object} self - the object
     * @param {number} x - The x mouse value
     * @param {number} y - The y mouse value
     */
    detectMouse(self, x, y) {

        if (this.preview)
        {
            const camera = Camera.main;

            // Detect Position
            if (x / camera.scale <= self.x + this.offsetX + this.width / 2 - camera.x  &&
                x / camera.scale >= self.x + this.offsetX - this.width / 2 - camera.x) {

                if (y / camera.scale <= self.y + this.offsetY + this.height / 2 - camera.y &&
                y / camera.scale >= self.y + this.offsetY - this.height / 2 - camera.y) {

                    return true;
                }
            }
        }

        return false;
    }
    
    /**
     * Detects sides for editor resizing
     * @param {Object} self - the object
     * @param {number} x - The x mouse value
     * @param {number} y - The y mouse value
     */
    detectSide(self, x, y) {

        const camera = Camera.main;
        const tolerance = 1+2*(1/camera.scale);
        
        // Right side
        if (x / camera.scale >= this.offsetX + self.x + this.width / 2 - camera.x - tolerance) {
            if (y / camera.scale <= this.offsetY + self.y - this.height / 2 - camera.y + tolerance) {
                return 'right-top';
            }
            else if (y / camera.scale >= this.offsetY + self.y + this.height / 2 - camera.y - tolerance) {
                return 'right-bottom';
            }
            return 'right';
        }
        // Left side
        else if (x / camera.scale <= this.offsetX + self.x - this.width / 2 - camera.x + tolerance) {
            if (y / camera.scale <= this.offsetY + self.y - this.height / 2 - camera.y + tolerance) {
                return 'left-top';
            }
            else if (y / camera.scale >= this.offsetY + self.y + this.height / 2 - camera.y - tolerance) {
                return 'left-bottom';
            }
            return 'left';
        }
        // Bottom side
        else if (y / camera.scale >= this.offsetY + self.y + this.height / 2 - camera.y - tolerance) {
            return 'bottom';
        }
        // Top side
        else if (y / camera.scale <= this.offsetY + self.y - this.height / 2 - camera.y + tolerance) {
            return 'top';
        }
        else {
            return false;
        }
    }
}

export class CircleCollider extends Collider {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} offsetX - The offset x
     * @param {number} offsetY - The offset y
     * @param {number} preview - Activated or not
     * @param {number} color - The color of preview
     * @param {number} opacity - The opacity of preview
     * @param {number} width - The width
     */
    constructor(offsetX = 0, offsetY = 0, preview = true, color = '#e02c2c', width = 20) {
        
        super(offsetX, offsetY, preview, color);
        
        this.width = width;
    }
    
    /**
     * test the collision with the class type
     * @testCollision
     */
    testCollision(self, other) {
        return this.o_collider.testCollisionWithCircle(other, self, this.o_collider, this);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other, s_collider, o_collider) {
        let otherX = other.x + o_collider.offsetX;
        let otherY = other.y + o_collider.offsetY;
        let collisionX = self.x + s_collider.offsetX;
        let collisionY = self.y + s_collider.offsetY;
        let collisionWidth = s_collider.width;
        return ((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth);
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other, s_collider, o_collider) {
        let collisionX = self.x + s_collider.offsetX;
        let collisionY = self.y + s_collider.offsetY;
        let collisionWidth = s_collider.width;
        let collisionBoxX = collisionX - collisionWidth;
        let collisionBoxY = collisionY - collisionWidth;
        let collisionBoxWidth = collisionWidth*2;
        let otherWidth = o_collider.width;
        let otherHeight = o_collider.height;
        let otherX = other.x + o_collider.offsetX - otherWidth/2;
        let otherY = other.y + o_collider.offsetY - otherHeight/2;
        
        if (((collisionBoxX >= otherX + otherWidth) || (collisionBoxX + collisionBoxWidth <= otherX) || (collisionBoxY >= otherY + otherWidth) || (collisionBoxY + collisionBoxWidth <= otherY)))
            {return false;}
        if (((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY+otherHeight)*(otherY-collisionY+otherHeight) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX+otherWidth)*(otherX-collisionX+otherWidth) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX+otherWidth)*(otherX-collisionX+otherWidth) + (otherY-collisionY+otherHeight)*(otherY-collisionY+otherHeight) <= collisionWidth*collisionWidth))
            {return true;}
        if (!(collisionX < otherX || collisionX > otherX+otherWidth) && !(collisionY < otherY || collisionY > otherY+otherHeight))
            {return true;}
        
        return (((((collisionY-otherY)*(otherHeight)) * ((collisionY-(otherY+otherHeight))*(otherHeight))) > 0)
            ^ ((((collisionX-otherX)*(otherWidth)) * ((collisionX-(otherX+otherWidth))*(otherWidth))) > 0));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other, s_collider, o_collider) {
        let collisionX = self.x + s_collider.offsetX;
        let collisionY = self.y + s_collider.offsetY;
        let collisionWidth = s_collider.width;
        let otherX = other.x + o_collider.offsetX;
        let otherY = other.y + o_collider.offsetY;
        let otherWidth = o_collider.width;
        return !((collisionX-otherX)*(collisionX-otherX)+(collisionY-otherY)*(collisionY-otherY) > (collisionWidth+otherWidth)*(collisionWidth+otherWidth))
    }
    
    /**
     * Draw the component
     * @preview
     */
    preview(self) {
        
        if (this.preview) {
            Graphics.circle(self.x + this.offsetX, self.y + this.offsetY, this.width);
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

System.addEventListener('setProperty', data => {
    if (data.object?.components) {
        if (data.object.components.collider || data.object.components.rectcollider) {
            if (data.prop === 'x' || data.prop === 'y') {
                console.log(data.object.x);
            }
        }
    }
});