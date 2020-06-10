import { Camera } from '/src/core/camera.js';
import { Graphics } from '/src/graphics/graphics.js';

export class Map {
    
    /**
     * Initialize the map component
     * @constructor
     * @param {Image} image - The image atlas
     * @param {number} tsize - The size of each tile
     * @param {Array} tiles - A 1-dimensional array containing the visual grid
     * @param {Array} collisions - Collision grid
     */
    constructor(image, tsize, tiles, collisions) {
        
        this.image = image;
        this.tsize = tsize;
        this.tiles = tiles;
        this.collisions = collisions;
    }
    
    /**
     * Gets the tile index in a certain position
     * @param {number} col - The width of the tile
     * @param {number} row - The height of the tile
     */
    getTile(col, row) {
        
        return this.tiles[row * this.cols + col];
    }
    
    /**
     * Update the component
     * @update
     * @param {Object} self - The map object
     */
    update(self) {
        
        this.cols = Math.floor(self.width / this.tsize); // the width of the map, in columns
        this.rows = Math.floor(self.height / this.tsize); // the height of the map, in rows
        
        /*let startCol = Math.floor(Camera.main.x / this.tsize);
        let endCol = startCol + (Camera.main.width / this.tsize);
        let startRow = Math.floor(Camera.main.y / this.tsize);
        let endRow = startRow + (Camera.main.height / this.tsize);
        
        let offsetX = -Camera.main.x + startCol * this.tsize;
        let offsetY = -Camera.main.y + startRow * this.tsize;*/
    }
    
     /**
     * Draw the component
     * @draw
     * @param {Object} self - The map object
     */
    draw(self) {
            
        for (let col = 0; col < this.cols; col++) {
            
            for (let row = 0; row < this.rows; row++) {
                
                let tile = this.getTile(col, row);
                
                if (tile !== 0) { // 0 => empty tile
                    
                    Graphics.ctx.drawImage (
                        this.image, // image
                        (tile - 1) * this.tsize, // source x
                        0, // source y
                        this.tsize, // source width
                        this.tsize, // source height
                        col * this.tsize + self.x, // target x
                        row * this.tsize + self.y, // target y
                        this.tsize, // target width
                        this.tsize // target height
                    );
                }
            }
        }
    }
}

window.Mapping = Map;