import { Graphics } from '/src/graphics/graphics.js';

export class Texture {
    
    /**
     * Initialize the component
     * @constructor
     * @param {Image} image - The texture to display
     */
    constructor(image = null, flip = false, scaleX = 1, scaleY = 1, scaleFromBox = true) {
        
        this.image = image;
        this.flip = flip;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.scaleFromBox = scaleFromBox;
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

        // scale
        //Graphics.ctx.scale(this.scaleX, this.scaleY);
        
        if (this.scaleFromBox)
        {
            Graphics.imageBox(this.image, self.x, self.y, this.scaleX, this.scaleY, self.width, self.height);
        }
        else
        {
            Graphics.image(this.image, self.x, self.y, this.scaleX, this.scaleY);
        }
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