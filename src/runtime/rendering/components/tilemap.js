// A grid of coloured tiles.
//
// Kept deliberately simple: tiles are palette indices, not images, because a tileset is
// a resource concern and resources are not part of this step. What matters here is the
// signature.
//
// Legacy's Tilemap declared `draw(ctx, camera)`, while `Object.draw()` called
// `draw(this)`. Attached to an object it therefore received the object where it
// expected a context and undefined where it expected a camera, threw a TypeError, and
// the per-component try/catch swallowed it — every frame, silently. The corrected
// signature is the same as every other component's: `draw(self, renderer)`.

export class Tilemap {

    static type = 'Tilemap';

    static schema = {
        tileSize: { type: 'number', default: 16, min: 1 },
        columns: { type: 'number', default: 0, min: 0 },
        rows: { type: 'number', default: 0, min: 0 },
        // A GRID, NOT A LIST. `tiles` is `row * columns + column` flattened, so a modest map
        // is hundreds of cells; it declares no element shape because a list of hundreds of
        // rows is not how a grid is edited, and saying nothing keeps it read-only.
        tiles: { type: 'array', default: [] },
        // A LIST OF COLOURS, WHICH IS WHAT IT HAS ALWAYS BEEN. Declaring the shape of an
        // element is what lets the Inspector edit it (inspector/schema.js); nothing about
        // the value changes, and `draw()` still reads `palette[tile]` exactly as before.
        //
        // An entry starts BLACK rather than empty: `draw()` skips a falsy colour, so an
        // entry added and not yet chosen would be a row that draws nothing while its swatch
        // shows black anyway. Starting where the swatch already reads is the honest state.
        palette: { type: 'array', element: { type: 'color', default: '#000000' }, default: [] }
    };

    /**
     * Create the tilemap.
     * @param {number} [tileSize] - Size of one tile in local units
     * @param {number} [columns] - Grid width in tiles
     * @param {number} [rows] - Grid height in tiles
     * @param {number[]} [tiles] - Palette index per cell, 0 meaning empty
     * @param {string[]} [palette] - Colour per index, entry 0 unused
     */
    constructor(tileSize = 16, columns = 0, rows = 0, tiles = [], palette = []) {
        this.tileSize = tileSize;
        this.columns = columns;
        this.rows = rows;
        this.tiles = tiles;
        this.palette = palette;
    }

    /**
     * Read a cell.
     * @param {number} column - Column index
     * @param {number} row - Row index
     * @returns {number} The palette index, 0 when out of bounds
     */
    get(column, row) {
        if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return 0;
        return this.tiles[row * this.columns + column] ?? 0;
    }

    /**
     * Write a cell.
     * @param {number} column - Column index
     * @param {number} row - Row index
     * @param {number} value - Palette index, 0 to clear
     */
    set(column, row, value) {
        if (column < 0 || row < 0 || column >= this.columns || row >= this.rows) return;
        this.tiles[row * this.columns + column] = value;
    }

    /**
     * Draw the grid.
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     */
    draw(self, renderer) {
        const size = this.tileSize;

        for (let row = 0; row < this.rows; row++) {
            for (let column = 0; column < this.columns; column++) {
                const tile = this.get(column, row);
                if (tile === 0) continue;

                const color = this.palette[tile];
                if (!color) continue;

                renderer.fillRect(column * size, row * size, size, size, { color });
            }
        }
    }

    /**
     * The area this component covers, in the object's local space.
     * @param {object} self - The owning object
     * @returns {{x: number, y: number, width: number, height: number}} The local bounds
     */
    bounds(self) {
        return {
            x: 0,
            y: 0,
            width: this.columns * this.tileSize,
            height: this.rows * this.tileSize
        };
    }
}
