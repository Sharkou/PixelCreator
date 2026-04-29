export class SpatialHash {

    /**
     * Spatial hash grid for efficient collision detection
     * @constructor
     * @param {number} cellSize - Size of each cell in the grid
     */
    constructor(cellSize = 64) {

        this.cellSize = cellSize;
        this.cells = new Map();
    }

    /**
     * Get the cell key for a position
     * @param {number} x
     * @param {number} y
     * @returns {string}
     */
    #key(x, y) {
        return Math.floor(x / this.cellSize) + ',' + Math.floor(y / this.cellSize);
    }

    /**
     * Remove all objects from the grid
     */
    clear() {
        this.cells.clear();
    }

    /**
     * Insert an object into the grid using its bounding box
     * @param {Object} obj - An object with x, y, width, height
     */
    insert(obj) {
        const x1 = Math.floor(obj.x / this.cellSize);
        const y1 = Math.floor(obj.y / this.cellSize);
        const x2 = Math.floor((obj.x + obj.width) / this.cellSize);
        const y2 = Math.floor((obj.y + obj.height) / this.cellSize);

        for (let cx = x1; cx <= x2; cx++) {
            for (let cy = y1; cy <= y2; cy++) {
                const key = cx + ',' + cy;
                if (!this.cells.has(key)) {
                    this.cells.set(key, []);
                }
                this.cells.get(key).push(obj);
            }
        }
    }

    /**
     * Get potential collision candidates for an object
     * @param {Object} obj - An object with x, y, width, height
     * @returns {Object[]} Nearby objects
     */
    query(obj) {
        const result = new Set();
        const x1 = Math.floor(obj.x / this.cellSize);
        const y1 = Math.floor(obj.y / this.cellSize);
        const x2 = Math.floor((obj.x + obj.width) / this.cellSize);
        const y2 = Math.floor((obj.y + obj.height) / this.cellSize);

        for (let cx = x1; cx <= x2; cx++) {
            for (let cy = y1; cy <= y2; cy++) {
                const key = cx + ',' + cy;
                const cell = this.cells.get(key);
                if (cell) {
                    for (let i = 0; i < cell.length; i++) {
                        if (cell[i] !== obj) {
                            result.add(cell[i]);
                        }
                    }
                }
            }
        }

        return Array.from(result);
    }

    /**
     * Rebuild the grid from a list of objects
     * @param {Object[]} objects - Array of objects with x, y, width, height
     */
    rebuild(objects) {
        this.clear();
        for (let i = 0; i < objects.length; i++) {
            this.insert(objects[i]);
        }
    }
}
