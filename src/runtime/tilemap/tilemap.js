// A grid of coloured tiles — the ONE truth about what is in it (ADR-0068 §2).
//
// IT LIVES BESIDE `collision/`, NOT INSIDE `rendering/`, and it moved here the day its cells
// started stopping things. A grid that draws is still a grid: the renderer asks it to draw,
// the movement pass asks it what is occupied, and the paint tool asks it to change — three
// readers, one array, and no copy of it anywhere. Leaving it under `rendering/` would have
// made the physics import the renderer's tree to find out where the floor is, which is the
// dependency this move exists to avoid.
//
// A CELL HOLDS A SMALL NUMBER AND NOTHING ELSE (ADR-0070 §1). `0` is empty and `n` is the
// nth tile of the `Tileset` this map names — so the cutting of the sheet lives in one
// Resource, a forty-thousand-cell level is forty thousand small integers, and the collider
// beside this file reads them without knowing a tileset exists (ADR-0068 §3).
//
// Legacy's Tilemap declared `draw(ctx, camera)`, while `Object.draw()` called
// `draw(this)`. Attached to an object it therefore received the object where it
// expected a context and undefined where it expected a camera, threw a TypeError, and
// the per-component try/catch swallowed it — every frame, silently. The corrected
// signature is the same as every other component's: `draw(self, renderer)`.

import { tileRect, tilesetOf } from '../../core/tileset.js';

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
        // WHAT A CELL'S NUMBER MEANS (ADR-0070 §1). The cutting of the sheet is a Resource,
        // so a map names it once instead of repeating a source and a rectangle per entry —
        // and two maps of one dungeon are two names for one cutting rather than two copies
        // of it. An `asset` reference would have been the picture; it is the CUTTING that a
        // cell indexes into.
        tileset: { type: 'resource', kind: 'tileset', default: null }
    };

    /**
     * Create the tilemap.
     * @param {number} [tileSize] - Size of one tile in local units
     * @param {number} [columns] - Grid width in tiles
     * @param {number} [rows] - Grid height in tiles
     * @param {number[]} [tiles] - Tile index per cell, 0 meaning empty
     * @param {string|null} [tileset] - ResourceId of the tileset its cells index into
     */
    constructor(tileSize = 16, columns = 0, rows = 0, tiles = [], tileset = null) {
        this.tileSize = tileSize;
        this.columns = columns;
        this.rows = rows;
        // A GRID OF n BY m HAS n TIMES m CELLS, and it has them from the first moment. A
        // short array reads the same — `get()` answers 0 for what is not there — but it
        // writes differently: a patch that fills index 6 of an empty array leaves five
        // holes, and a hole is `null` in a saved file where a creator expects a zero
        // (ADR-0069 §5). Filling it once, here, costs one allocation and removes the
        // question from everywhere else.
        this.tiles = dense(tiles, columns * rows);
        this.tileset = tileset;
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
     * The cell a point in this Object's local space falls in.
     *
     * FLOOR, NOT ROUND, and negatives are outside rather than wrapped to zero: a grid starts
     * at the Object's origin and grows right and down (see `bounds()`), so -3 is not row 0.
     *
     * @param {number} localX - A point in the Object's own space
     * @param {number} localY - The same, vertically
     * @returns {{column: number, row: number}} The cell, which may be outside the grid
     */
    cellAt(localX, localY) {
        return {
            column: globalThis.Math.floor(localX / this.tileSize),
            row: globalThis.Math.floor(localY / this.tileSize)
        };
    }

    /**
     * Whether a cell is inside the grid.
     * @param {number} column - Column index
     * @param {number} row - Row index
     * @returns {boolean} True when the cell exists
     */
    contains(column, row) {
        return column >= 0 && row >= 0 && column < this.columns && row < this.rows;
    }

    /**
     * The cells this grid would have at another size.
     *
     * A GRID IS ADDRESSED BY `row * columns + column`, so changing `columns` without rebuilding
     * the array does not resize a grid — it SHEARS it: every row after the first slides
     * sideways by the difference. This is the rule that stops that, and it is deliberately
     * boring: what was at (column, row) is still at (column, row), what is new is empty, and
     * what no longer fits is gone.
     *
     * PURE, so the Editor can write the result and the old array in one batch and undo puts
     * both back (ADR-0068 §5).
     *
     * @param {number} columns - The new width, in cells
     * @param {number} rows - The new height, in cells
     * @returns {number[]} The remapped cells
     */
    remap(columns, rows) {
        const width = globalThis.Math.max(0, globalThis.Math.floor(columns));
        const height = globalThis.Math.max(0, globalThis.Math.floor(rows));
        const next = new globalThis.Array(width * height).fill(0);

        const keptColumns = globalThis.Math.min(width, this.columns);
        const keptRows = globalThis.Math.min(height, this.rows);
        for (let row = 0; row < keptRows; row++) {
            for (let column = 0; column < keptColumns; column++) {
                next[row * width + column] = this.get(column, row);
            }
        }

        return next;
    }

    /**
     * Draw the cells that can be seen.
     *
     * ONLY WHAT IS ON SCREEN (ADR-0070 §6). The renderer says what part of this Object's own
     * space its surface covers, and that becomes a range of rows and columns: a map of a
     * million cells costs the six hundred a window shows. Without an answer — a backend that
     * cannot say, a transform that cannot be inverted — the whole grid is walked, which is
     * what it did before and is never wrong, only slow.
     *
     * A TILE THAT DOES NOT EXIST DRAWS NOTHING, and that is the contract for a map repainted
     * with a smaller sheet: no substitution, no fallback frame, nothing (ADR-0070 §7). So is
     * a sheet still decoding — `drawImage` answers nothing for a picture that has not
     * arrived, and asks the cache for it exactly once (ADR-0062 §2).
     *
     * @param {object} self - The owning object
     * @param {object} renderer - The renderer backend
     * @param {object} [context] - What a component may reach while drawing: `{ resources }`
     */
    draw(self, renderer, context) {
        const tileset = tilesetOf(context?.resources?.get?.(this.tileset));
        if (!tileset) return;

        const size = this.tileSize;
        if (!(size > 0)) return;

        const window = visibleRange(this, renderer);

        for (let row = window.fromRow; row <= window.toRow; row++) {
            for (let column = window.fromColumn; column <= window.toColumn; column++) {
                const tile = this.get(column, row);
                if (tile === 0) continue;

                const clip = tileRect(tileset, tile);
                if (!clip) continue;

                renderer.drawImage(tileset.source, column * size, row * size, size, size, { clip });
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

/**
 * An array of exactly `length` cells, keeping what was given and filling the rest with 0.
 *
 * @param {number[]} tiles - What the caller had
 * @param {number} length - How many cells the grid declares
 * @returns {number[]} A dense array
 */
function dense(tiles, length) {
    const source = globalThis.Array.isArray(tiles) ? tiles : [];
    if (source.length === length && !source.includes(undefined)) return source;

    const next = new globalThis.Array(globalThis.Math.max(0, length)).fill(0);
    for (let at = 0; at < globalThis.Math.min(source.length, next.length); at++) {
        next[at] = source[at] ?? 0;
    }
    return next;
}

/**
 * The range of cells worth walking, clamped to the grid.
 *
 * A FUNCTION, NOT A PRIVATE METHOD, AND THAT IS NOT A STYLE CHOICE. A Component reaches its
 * owner through the Property System's reactive proxy (`core/properties/reactive.js`), and a
 * private method called on a proxy throws `Receiver must be an instance of class Tilemap` —
 * inside `draw()`, where the scene renderer catches it and the map simply never appears. No
 * component may have private members for exactly this reason.
 *
 * @param {object} tilemap - The grid
 * @param {object} renderer - The renderer backend
 * @returns {{fromColumn: number, toColumn: number, fromRow: number, toRow: number}} The range
 */
function visibleRange(tilemap, renderer) {
    const whole = {
        fromColumn: 0,
        toColumn: tilemap.columns - 1,
        fromRow: 0,
        toRow: tilemap.rows - 1
    };

    const bounds = renderer.visibleBounds?.() ?? null;
    if (!bounds) return whole;

    const size = tilemap.tileSize;
    const clamp = (value, high) => globalThis.Math.max(0, globalThis.Math.min(high, value));

    return {
        fromColumn: clamp(globalThis.Math.floor(bounds.minX / size), whole.toColumn),
        toColumn: clamp(globalThis.Math.ceil(bounds.maxX / size), whole.toColumn),
        fromRow: clamp(globalThis.Math.floor(bounds.minY / size), whole.toRow),
        toRow: clamp(globalThis.Math.ceil(bounds.maxY / size), whole.toRow)
    };
}
