import { Graphics } from '/src/graphics/graphics.js';
import { Scene } from '/src/core/scene.js';

export class Collider {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} x - The offset x
     * @param {number} y - The offset y
     * @param {number} width - The width
     * @param {number} height - The height
     */
    constructor(offsetX, offsetY, width, height, preview = false, color = '#00F') {
        
        // Offset of the collider (left-top coordinate)
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        
        // Dimensions
        this.width = width;
        this.height = height;
        
        this.preview = preview;
        this.color = color;
        this.opacity = 1;
    }
    
    /**
     * Update the component
     * @update
     * @param {Scene} scene - The renderer scene
     */
    update(self) {
        
        // Position of the collider (left-top coordinate)
        this.x = self.x + this.offsetX;
        this.y = self.y + this.offsetY;
        
        for (let id in Scene.main.objects) {
            
            // Store the other object
            let other = Scene.main.objects[id];            

            if (other != undefined && other != null && other != self && other.components.collider) {

                if (other.active && other.components.collider.active) {
                    
                    let x1 = this.x - this.width / 2;
                    let y1 = this.y - this.height / 2;
                    
                    let x2 = other.x - other.width / 2;
                    let y2 = other.y - other.height / 2;

                    // console.table([x1, y1, x2, y2]);
                    
                    if (x1 < x2 + other.width &&
                        x1 + this.width > x2 &&
                        y1 < y2 + other.height &&
                        this.height + y1 > y2) {
                        
                        // Create collision event
                        // self.dispatchEvent('collision', self);
                        self.onCollision(other);

                        return true;
                    }

                    else {
                        self.onCollisionExit(other);
                        return false;
                    }
                }
            }
        }
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

window.Collider = Collider;