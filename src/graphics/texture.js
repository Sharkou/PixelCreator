import { Graphics } from '/src/graphics/graphics.js';

export class Texture {
    
    /**
     * Initialize the component
     * @constructor
     * @param {Image} image - The texture to display
     */
    constructor(image, flip = false, scale = 1) {
        
        this.image = image;
        this.flip = flip;
        this.scale = scale;
    }
    
    /**
     * Draw the component
     * @draw
     */
    draw(self) {
        
        if (this.flip) {
            Graphics.ctx.translate(self.x * 2, 0);
            Graphics.ctx.scale(-1, 1);
        }

        if (this.scale) {
            if (this.scale.x && this.scale.y) {
                Graphics.ctx.scale(this.scale.x, this.scale.y);
            }
            else {
                Graphics.ctx.scale(this.scale, this.scale);
            }
        }
        
        Graphics.image(this.image, self.x, self.y);
    }
    
    /**
     * Load a texture
     * @static
     * @param {string} src - The image source url
     */    
    static load(src) {
        
        return new Promise((resolve, reject) => {
            let img = new Image();
            img.src = src;
            img.onload = () => resolve(img);
            img.onerror = reject;
        });
    }
}

window.Texture = Texture;