
import { Graphics } from '/src/graphics/graphics.js';
import { Scene } from '/src/core/scene.js';
import { Components } from '/src/core/components.js';

export class Collider {
    
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
        
        this.isOnCollision = new Map();
    }
    
    /**
     * Update the component
     * @update
     */
    update(self) {
        
        for (let id in Scene.main.objects) {
            
            // Store the other object
            let other = Scene.main.objects[id];            

            if (other != undefined && other != null && other != self && other.components.collider) {

                if (other.active && other.components.collider.active) {
                    
                    if (this.testCollision(self, other))
                    {
                        console.log("On collision !");
                        this.isOnCollision.set(id, true);
                        self.onCollision(other);
                    }
                    else if (this.isOnCollision.has(id)) {
                        console.log("Exit collision...");
                        this.isOnCollision.delete(id);
                        self.onCollisionExit(other);
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
        return other.components.collider.testCollisionWithPoint(other, self);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other) {
        return (((self.x + self.components.collider.offsetX) == (other.x + other.components.collider.offsetX)) && ((self.y + self.components.collider.offsetY) == (other.y + other.components.collider.offsetY)));
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other) {
        let collisionX = self.x + self.components.collider.offsetX;
        let collisionY = self.y + self.components.collider.offsetY;
        let otherWidth = other.components.collider.width;
        let otherHeight = other.components.collider.height;
        let otherX = other.x + other.components.collider.offsetX - otherWidth/2;
        let otherY = other.y + other.components.collider.offsetY - otherHeight/2;
        return (!(collisionX < otherX || collisionX > otherX+otherWidth) && !(collisionY < otherY || collisionY > otherY+otherHeight));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other) {
        let collisionX = self.x + self.components.collider.offsetX;
        let collisionY = self.y + self.components.collider.offsetY;
        let otherX = other.x + other.components.collider.offsetX;
        let otherY = other.y + other.components.collider.offsetY;
        let otherWidth = other.components.collider.width;
        return ((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth);
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        if (this.preview) {
            Graphics.circle(self.x + this.offsetX, self.y + this.offsetY, 1);
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

window.Collider = Collider;

export class ColliderRect extends Collider {
    
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
        return other.components.collider.testCollisionWithRect(other, self);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other) {
        let otherX = other.x + other.components.collider.offsetX;
        let otherY = other.y + other.components.collider.offsetY;
        let collisionWidth = self.components.collider.width;
        let collisionHeight = self.components.collider.height;
        let collisionX = self.x + self.components.collider.offsetX - collisionWidth/2;
        let collisionY = self.y + self.components.collider.offsetY - collisionHeight/2;
        return (!(otherX < collisionX || otherX > collisionX+collisionWidth) && !(otherY < collisionY || otherY > collisionY+collisionHeight));
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other) {
        let collisionWidth = self.components.collider.width;
        let collisionHeight = self.components.collider.height;
        let collisionX = self.x + self.components.collider.offsetX - collisionWidth/2;
        let collisionY = self.y + self.components.collider.offsetY - collisionHeight/2;
        let otherWidth = other.components.collider.width;
        let otherHeight = other.components.collider.height;
        let otherX = other.x + other.components.collider.offsetX - otherWidth/2;
        let otherY = other.y + other.components.collider.offsetY - otherHeight/2;
        return !((otherX >= collisionX + collisionWidth) || (otherX + otherWidth <= collisionX) || (otherY >= collisionY + collisionHeight) || (otherY + otherHeight <= collisionY));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other) {
        let collisionWidth = self.components.collider.width;
        let collisionHeight = self.components.collider.height;
        let collisionX = self.x + self.components.collider.offsetX - collisionWidth/2;
        let collisionY = self.y + self.components.collider.offsetY - collisionHeight/2;
        let otherX = other.x + other.components.collider.offsetX;
        let otherY = other.y + other.components.collider.offsetY;
        let otherWidth = other.components.collider.width;
        let otherBoxX = otherX - otherWidth;
        let otherBoxY = otherY - otherWidth;
        let otherBoxWidth = otherWidth*2;
        
        if (!((otherBoxX >= collisionX + collisionWidth) || (otherBoxX + otherBoxWidth <= collisionX) || (otherBoxY >= collisionY + collisionHeight) || (otherBoxY + otherBoxWidth <= collisionY)))
            {return false;}
        if (((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth)
           || ((collisionX-otherX)*(collisionX-otherX) + (collisionY-otherY+collisionHeight)*(collisionY-otherY+collisionHeight) <= otherWidth*otherWidth)
           || ((collisionX-otherX+collisionWidth)*(collisionX-otherX+collisionWidth) + (collisionY-otherY)*(collisionY-otherY) <= otherWidth*otherWidth)
           || ((collisionX-otherX+collisionWidth)*(collisionX-otherX+collisionWidth) + (collisionY-otherY+collisionHeight)*(collisionY-otherY+collisionHeight) <= otherWidth*otherWidth))
            {return true;}
        if (!((otherBoxX >= collisionX + collisionWidth) || (otherBoxX + otherBoxWidth <= collisionX) || (otherBoxY >= collisionY + collisionHeight) || (otherBoxY + otherBoxWidth <= collisionY)))
            {return true;}
        return ((((otherBoxY-collisionY)*(collisionHeight)) * ((otherBoxY-(collisionY+collisionHeight))*(collisionHeight)) > 0)
            || (((otherBoxX-collisionX)*(collisionWidth)) * ((otherBoxX-(collisionX+collisionWidth))*(collisionWidth)) > 0));
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        if (this.preview) {
            Graphics.rect(self.x + this.offsetX, self.y + this.offsetY, this.width, this.height);
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

window.Colliderrect = ColliderRect;

export class ColliderCircle extends Collider {
    
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
        return other.components.collider.testCollisionWithCircle(other, self);
    }
    
    /**
     * return true if collide with a point
     * @testCollisionWithPoint
     */
    testCollisionWithPoint(self, other) {
        let otherX = other.x + other.components.collider.offsetX;
        let otherY = other.y + other.components.collider.offsetY;
        let collisionX = self.x + self.components.collider.offsetX;
        let collisionY = self.y + self.components.collider.offsetY;
        let collisionWidth = self.components.collider.width;
        return ((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth);
    }
    
    /**
     * return true if collide with a rectangle
     * @testCollisionWithRect
     */
    testCollisionWithRect(self, other) {
        let collisionX = self.x + self.components.collider.offsetX;
        let collisionY = self.y + self.components.collider.offsetY;
        let collisionWidth = self.components.collider.width;
        let collisionBoxX = collisionX - collisionWidth;
        let collisionBoxY = collisionY - collisionWidth;
        let collisionBoxWidth = collisionWidth*2;
        let otherWidth = other.components.collider.width;
        let otherHeight = other.components.collider.height;
        let otherX = other.x + other.components.collider.offsetX - otherWidth/2;
        let otherY = other.y + other.components.collider.offsetY - otherHeight/2;
        
        if (!((collisionBoxX >= otherX + otherWidth) || (collisionBoxX + collisionBoxWidth <= otherX) || (collisionBoxY >= otherY + collisionHeight) || (collisionBoxY + collisionBoxWidth <= otherY)))
            {return false;}
        if (((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX)*(otherX-collisionX) + (otherY-collisionY+otherHeight)*(otherY-collisionY+otherHeight) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX+otherWidth)*(otherX-collisionX+otherWidth) + (otherY-collisionY)*(otherY-collisionY) <= collisionWidth*collisionWidth)
           || ((otherX-collisionX+otherWidth)*(otherX-collisionX+otherWidth) + (otherY-collisionY+otherHeight)*(otherY-collisionY+otherHeight) <= collisionWidth*collisionWidth))
            {return true;}
        if (!((collisionBoxX >= otherX + otherWidth) || (collisionBoxX + collisionBoxWidth <= otherX) || (collisionBoxY >= otherY + otherHeight) || (collisionBoxY + collisionBoxWidth <= otherY)))
            {return true;}
        return ((((collisionBoxY-otherY)*(otherHeight)) * ((collisionBoxY-(otherY+otherHeight))*(otherHeight)) > 0)
            || (((collisionBoxX-otherX)*(otherWidth)) * ((collisionBoxX-(otherX+otherWidth))*(otherWidth)) > 0));
    }
    
    /**
     * return true if collide with a circle
     * @testCollisionWithCircle
     */
    testCollisionWithCircle(self, other) {
        let collisionX = self.x + self.components.collider.offsetX;
        let collisionY = self.y + self.components.collider.offsetY;
        let collisionWidth = self.components.collider.width;
        let otherX = other.x + other.components.collider.offsetX;
        let otherY = other.y + other.components.collider.offsetY;
        let otherWidth = other.components.collider.width;
        return !((collisionX-otherX)*(collisionX-otherX)+(collisionY-otherY)*(collisionY-otherY) > (collisionWidth+otherWidth)*(collisionWidth+otherWidth))
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        if (this.preview) {
            Graphics.circle(self.x + this.offsetX, self.y + this.offsetY, this.width);
            Graphics.stroke(this.color, this.opacity);
        }
    }
}

window.Collidercircle = ColliderCircle;

Components.add(Collider, 'far fa-arrow-to-right', 'physics');

// TO DELETE
Components.add(ColliderRect, 'far fa-arrow-to-right', 'physics');
Components.add(ColliderCircle, 'far fa-arrow-to-right', 'physics');