// Painting a Tilemap where it is, in the Scene (ADR-0068 §5).
//
// NO WINDOW, NO MODE BUTTON, NO SECOND STATE MACHINE. Selecting a Tilemap is what makes this
// tool live, and one sentence says what a press means:
//
//     INSIDE the selected map's grid it paints. OUTSIDE it, the Select tool has it.
//
// So there is always a way out — click away and you are selecting again — and there is never
// a mode a creator can be stuck in without knowing how they got there. The viewport routes
// one press to one tool (`viewport.js`); nothing here has a state the other tool can contradict.
//
// IT WRITES THROUGH `setProperty()`, LIKE EVERY OTHER GESTURE IN THIS EDITOR. One `batch` per
// stroke, so a drag across fifty cells is ONE entry in the history (ADR-0024, and the same
// rule `select-tool.js` uses for a drag). A cell already holding the value being painted is
// not written at all — a stroke that crosses its own path twice produces nothing the second
// time, which is what keeps "one stroke, one undo" from also meaning "one stroke, fifty
// operations that undo to the same grid".
//
// THE CELLS BETWEEN TWO POINTER EVENTS ARE PAINTED TOO. A pointer is sampled once per frame
// (viewport.js); a fast drag jumps whole cells, and a line of holes is not what anybody drew.
//
// THE TILES ARE DRAWN ON THE SURFACE, because "which tile am I painting" is a question about
// what is under the cursor, and answering it three panels away is answering it too late. They
// are the REAL tiles of the map's Tileset, cut out of the same sheet the map draws from
// (ADR-0070 §8) - a creator picks a wall by looking at a wall. It is a picker, not an editor:
// changing what a tileset CONTAINS is the Inspector's rows, where it belongs.
//
// IT IS A PAGE, NOT AN ENDLESS STRIP. A sheet of five hundred tiles would otherwise cover the
// scene it is being painted into, so the picker shows a fixed grid and steps through pages.

import {
    Matrix,
    Origin,
    createId,
    setCellsOperation,
    tileRect,
    tilesetOf,
    worldMatrix
} from '../../../core/mod.js';
import { Tilemap } from '../../../runtime/mod.js';

/** The colour the Editor marks things with, the same one the overlay uses. */
const ACCENT = '#ff7a45';

/** Thumbnail size, gap and the corner the picker sits in, in CSS pixels. */
const SWATCH = 26;
const GAP = 4;
const MARGIN = 12;

/**
 * How many thumbnails a page holds. Enough to choose from, small enough to see past.
 *
 * THREE SLOTS ARE SPOKEN FOR — Empty and the two page arrows — so the tiles fill what is
 * left and the picker is always the same three rows tall, whatever the sheet holds.
 */
const PER_ROW = 10;
const ROWS = 3;
const PER_PAGE = PER_ROW * ROWS - 3;

/** The two paging hits, as indices no tile can have. */
const PREVIOUS = -1;
const NEXT = -2;

/** Below this many device pixels per cell, the grid lines are noise rather than a guide. */
const GRID_MIN = 5;

export class TileTool {

    #context;
    #hovered = null;
    #stroke = null;
    #active = 1;
    #page = 0;
    #scale = 1;
    #strip = [];

    /**
     * Create the tool.
     * @param {object} context - `{ scene, selection, resources }`; `resources` answers the
     *   registry of resolved definitions, and is asked for rather than held
     */
    constructor(context) {
        this.#context = context;
    }

    /** The cell under the pointer, or null. Read by the viewport for its readout. */
    get hovered() {
        return this.#hovered;
    }

    /** True while a stroke is being painted. */
    get painting() {
        return this.#stroke !== null;
    }

    /** Which palette entry is being painted; 0 erases. */
    get active() {
        return this.#active;
    }

    /**
     * The Tilemap this tool is editing, or null when it has nothing to do.
     *
     * THE SELECTION IS THE MODE. There is no third state to keep: what is being painted is
     * what is selected, and what is selected is already drawn with an outline.
     *
     * @returns {{object: object, tilemap: object}|null} What is being painted
     */
    target() {
        const object = this.#context.selection?.object ?? null;
        if (!object || !this.#context.scene?.has?.(object)) return null;

        const tilemap = object.getComponent?.(Tilemap.type) ?? null;
        return tilemap && tilemap.active !== false ? { object, tilemap } : null;
    }

    /**
     * Whether a press here belongs to this tool.
     *
     * @param {object} pointer - As the viewport builds it
     * @returns {boolean} True when it would paint or pick a colour
     */
    wouldGrab(pointer) {
        const target = this.target();
        if (!target) return false;
        if (this.#swatchAt(pointer) !== null) return true;

        const cell = this.#cellAt(target, pointer);
        return cell !== null;
    }

    /**
     * Begin a stroke, or pick a colour.
     * @param {object} pointer - As the viewport builds it
     */
    press(pointer) {
        const target = this.target();
        if (!target) return;

        const swatch = this.#swatchAt(pointer);
        if (swatch !== null) {
            this.#pick(target, swatch);
            return;
        }

        const cell = this.#cellAt(target, pointer);
        if (!cell) return;

        // ONE BATCH FOR THE WHOLE DRAG. Everything written until `release()` is one entry in
        // the history, however many cells it turns out to be.
        this.#stroke = { batch: createId(), last: cell, value: this.#active };
        this.#paint(target, [cell]);
    }

    /**
     * Continue a stroke, or just follow the pointer.
     * @param {object} pointer - As the viewport builds it
     */
    move(pointer) {
        const target = this.target();
        if (!target) {
            this.#hovered = null;
            return;
        }

        const cell = this.#cellAt(target, pointer);
        this.#hovered = cell;
        if (!this.#stroke) return;

        // The pointer is sampled once a frame; a drag that crossed three cells since the
        // last sample painted three cells, not one — and they go out as ONE patch.
        this.#paint(target, line(this.#stroke.last, cell ?? this.#stroke.last));
        if (cell) this.#stroke.last = cell;
    }

    /** End the stroke. The next one is a new batch, and a second undo. */
    release() {
        this.#stroke = null;
    }

    /**
     * The cursor to show.
     * @param {object} view - The view matrix in use
     * @param {object} [screen] - The surface matrix
     * @returns {string} A CSS cursor
     */
    cursor() {
        if (this.#stroke) return 'crosshair';
        return this.#hovered ? 'crosshair' : 'default';
    }

    /**
     * Draw the grid, the cell under the pointer and the palette strip.
     *
     * @param {object} renderer - The renderer backend
     * @param {object} view - The view matrix in use
     * @param {object} [options] - Options
     * @param {number} [options.scale] - Device pixels per CSS pixel
     */
    draw(renderer, view, { scale = 1 } = {}) {
        this.#scale = scale;
        this.#strip = [];

        const target = this.target();
        if (!target) return;

        renderer.save();
        renderer.setTransform(Matrix.identity());
        this.#drawGrid(renderer, view, target, scale);
        this.#drawHover(renderer, view, target, scale);
        this.#drawPalette(renderer, target, scale);
        renderer.restore();
    }

    // --- the model ------------------------------------------------------------------------

    /**
     * Write the cells of one pointer sample, as ONE patch.
     *
     * WHAT CHANGED, NOT WHAT IT BECAME (ADR-0069 §4). A `SET_PROPERTY` on `tiles` carries the
     * whole grid twice — before and after — so painting fifty cells of a thousand-square map
     * used to leave a hundred million numbers in the undo stack for fifty cells of intent.
     * A `SET_CELLS` carries an index, the value it had and the value it takes, for the cells
     * actually touched: the cost of a stroke is the length of the stroke.
     *
     * THE MODEL IS UNTOUCHED BY THIS. `tiles` is still one array on the Component, written
     * through the same property write by the pipeline that applies the operation — the
     * compact form lives between the Editor and the history, and never in the file.
     *
     * @param {object} target - `{ object, tilemap }`
     * @param {Array<{column: number, row: number}>} cells - The cells this sample crossed
     */
    #paint(target, cells) {
        const { tilemap } = target;
        const value = this.#stroke ? this.#stroke.value : this.#active;
        const patch = [];
        const seen = new globalThis.Set();

        for (const cell of cells) {
            if (!tilemap.contains(cell.column, cell.row)) continue;

            const index = cell.row * tilemap.columns + cell.column;
            // NOTHING TO SAY, NOTHING WRITTEN. Crossing a cell twice in one sample, or
            // painting grass onto grass, is not an edit — and a patch that named the same
            // index twice would be two opinions about one cell.
            if (seen.has(index) || tilemap.get(cell.column, cell.row) === value) continue;

            seen.add(index);
            patch.push({ index, value, previous: tilemap.get(cell.column, cell.row) });
        }

        if (patch.length === 0) return;

        // Submitted through the Object, because that is what holds the pipeline a scene's
        // operations travel on — the same one `setProperty` reaches from a component.
        target.object.operations.submit(setCellsOperation({
            target: { object: target.object.id, component: Tilemap.type },
            prop: 'tiles',
            cells: patch,
            origin: Origin.EDITOR,
            batch: this.#stroke?.batch
        }));
    }

    /**
     * Choose what is painted, or turn the page.
     *
     * NOTHING HERE TOUCHES THE MAP (ADR-0070 §8). Picking a tile is a fact about this tool,
     * not about the level: it produces no Operation, nothing goes dirty, and the undo stack
     * does not learn that somebody looked at a different wall.
     *
     * @param {object} target - `{ object, tilemap }`
     * @param {number} index - A tile, 0 for Empty, or one of the two paging hits
     */
    #pick(target, index) {
        if (index === PREVIOUS) {
            this.#page = globalThis.Math.max(0, this.#page - 1);
            return;
        }
        if (index === NEXT) {
            this.#page = globalThis.Math.min(this.#pages(target) - 1, this.#page + 1);
            return;
        }

        this.#active = index;
    }

    /**
     * The tileset this map draws from, already resolved, or null.
     *
     * ASKED FOR EACH TIME, NEVER HELD. The registry is rebuilt when a project reloads, and a
     * tool that had captured one would go on drawing yesterday's sheet (ADR-0062 §1).
     *
     * @param {object} target - `{ object, tilemap }`
     * @returns {object|null} The tileset definition
     */
    #tilesetOf(target) {
        return tilesetOf(this.#context.resources?.()?.get?.(target.tilemap.tileset)) ?? null;
    }

    /**
     * How many pages of thumbnails the sheet fills.
     * @param {object} target - `{ object, tilemap }`
     * @returns {number} At least one
     */
    #pages(target) {
        const count = this.#tilesetOf(target)?.count ?? 0;
        return globalThis.Math.max(1, globalThis.Math.ceil(count / PER_PAGE));
    }

    // --- geometry -------------------------------------------------------------------------

    /** The cell under the pointer, in the map's own space, or null when outside it. */
    #cellAt(target, pointer) {
        const point = this.#toLocal(target.object, pointer.world);
        if (!point) return null;

        const cell = target.tilemap.cellAt(point.x, point.y);
        return target.tilemap.contains(cell.column, cell.row) ? cell : null;
    }

    /** A world point, in the map's own space. */
    #toLocal(object, world) {
        try {
            const inverse = worldMatrix(object).invert();
            return inverse.apply(world.x, world.y);
        } catch {
            // A map scaled to nothing has no inside to point at.
            return null;
        }
    }

    /** The swatch under the pointer: an index, -1 for `+`, or null. */
    #swatchAt(pointer) {
        const [x, y] = pointer.device ?? [];
        if (!globalThis.Number.isFinite(x)) return null;

        for (const swatch of this.#strip) {
            if (x >= swatch.x && x <= swatch.x + swatch.size
                && y >= swatch.y && y <= swatch.y + swatch.size) {
                return swatch.index;
            }
        }
        return null;
    }

    // --- drawing --------------------------------------------------------------------------

    #drawGrid(renderer, view, target, scale) {
        const { object, tilemap } = target;
        const matrix = view.multiply(worldMatrix(object));
        const size = tilemap.tileSize;
        const corner = matrix.apply(0, 0);
        const step = matrix.apply(size, size);
        const cell = globalThis.Math.hypot(step.x - corner.x, step.y - corner.y);
        if (!globalThis.Number.isFinite(cell)) return;

        const thickness = globalThis.Math.max(1, scale);
        const edge = { color: ACCENT, alpha: 0.55, thickness };
        const inner = { color: '#ffffff', alpha: 0.16, thickness: globalThis.Math.max(1, scale * 0.5) };

        // The outline of the map is always worth drawing: it is what says where painting
        // stops. The lines inside it are a guide, and a guide at three pixels a cell is a haze.
        rect(renderer, matrix, 0, 0, tilemap.columns * size, tilemap.rows * size, edge);
        if (cell < GRID_MIN) return;

        for (let column = 1; column < tilemap.columns; column++) {
            segment(renderer, matrix.apply(column * size, 0),
                matrix.apply(column * size, tilemap.rows * size), inner);
        }
        for (let row = 1; row < tilemap.rows; row++) {
            segment(renderer, matrix.apply(0, row * size),
                matrix.apply(tilemap.columns * size, row * size), inner);
        }
    }

    #drawHover(renderer, view, target, scale) {
        if (!this.#hovered) return;

        const { object, tilemap } = target;
        const matrix = view.multiply(worldMatrix(object));
        const size = tilemap.tileSize;
        const x = this.#hovered.column * size;
        const y = this.#hovered.row * size;

        // THE TILE ITSELF, WHERE IT WOULD LAND. A translucent accent square would say "here";
        // the tile says "this", which is the question a creator is actually asking.
        const sheet = this.#tilesetOf(target);
        const clip = sheet ? tileRect(sheet, this.#active) : null;
        if (clip) {
            const corner = matrix.apply(x, y);
            const far = matrix.apply(x + size, y + size);
            renderer.drawImage(sheet.source,
                globalThis.Math.min(corner.x, far.x),
                globalThis.Math.min(corner.y, far.y),
                globalThis.Math.abs(far.x - corner.x),
                globalThis.Math.abs(far.y - corner.y),
                { clip, alpha: 0.7 });
        } else {
            fill(renderer, matrix, x, y, size, size, { color: '#ffffff', alpha: 0.28 });
        }

        rect(renderer, matrix, x, y, size, size,
            { color: ACCENT, alpha: 1, thickness: globalThis.Math.max(1, 2 * scale) });
    }

    /**
     * The picker: Empty, then the tiles of the sheet, then the two pages.
     *
     * @param {object} renderer - The renderer backend
     * @param {object} target - `{ object, tilemap }`
     * @param {number} scale - Device pixels per CSS pixel
     */
    #drawPalette(renderer, target, scale) {
        const sheet = this.#tilesetOf(target);
        const size = SWATCH * scale;
        const gap = GAP * scale;
        const margin = MARGIN * scale;
        const pages = this.#pages(target);

        // Page zero opens with Empty; every page after it is tiles alone.
        const perPage = PER_PAGE;
        const first = this.#page * perPage + 1;
        const entries = this.#page === 0 ? [0] : [];
        for (let tile = first; tile < first + perPage && tile <= (sheet?.count ?? 0); tile++) {
            entries.push(tile);
        }
        if (pages > 1) entries.push(PREVIOUS, NEXT);

        entries.forEach((index, at) => {
            const left = margin + (at % PER_ROW) * (size + gap);
            const top = margin + globalThis.Math.floor(at / PER_ROW) * (size + gap);
            this.#strip.push({ index, x: left, y: top, size });

            renderer.fillRect(left, top, size, size, { color: '#1b1b20' });

            if (index === 0) {
                // A slash: "paint nothing here", which is what erasing is.
                renderer.fillRect(left + size * 0.18, top + size * 0.46,
                    size * 0.64, globalThis.Math.max(1, scale), { color: '#8a8a99' });
            } else if (index === PREVIOUS || index === NEXT) {
                arrow(renderer, left, top, size, scale, index === NEXT);
            } else {
                const clip = sheet ? tileRect(sheet, index) : null;
                // A TILE THE SHEET DOES NOT HAVE DRAWS NOTHING, here as on the map
                // (ADR-0070 §7) - an empty square is the truth about it.
                if (clip) renderer.drawImage(sheet.source, left, top, size, size, { clip });
            }

            const border = index === this.#active
                ? { color: ACCENT, thickness: globalThis.Math.max(2, 2 * scale) }
                : { color: '#000000', thickness: globalThis.Math.max(1, scale) };
            box(renderer, left, top, size, size, border);
        });
    }
}

/** A small triangle, for the two paging hits. */
function arrow(renderer, left, top, size, scale, forward) {
    const middle = top + size / 2;
    const thick = globalThis.Math.max(1, scale);

    for (let step = 0; step < 5; step++) {
        const height = (5 - step) * 2 * thick;
        const x = forward
            ? left + size * 0.35 + step * thick * 2
            : left + size * 0.65 - step * thick * 2;
        renderer.fillRect(x, middle - height / 2, thick * 2, height, { color: '#8a8a99' });
    }
}

/** Every cell from one to the other, so a fast drag leaves no holes. */
function line(from, to) {
    const steps = globalThis.Math.max(
        globalThis.Math.abs(to.column - from.column),
        globalThis.Math.abs(to.row - from.row)
    );
    if (steps === 0) return [to];

    const cells = [];
    for (let at = 1; at <= steps; at++) {
        cells.push({
            column: globalThis.Math.round(from.column + (to.column - from.column) * (at / steps)),
            row: globalThis.Math.round(from.row + (to.row - from.row) * (at / steps))
        });
    }
    return cells;
}

/** A filled quad, from four transformed corners. */
function fill(renderer, matrix, x, y, width, height, style) {
    const corner = matrix.apply(x, y);
    const far = matrix.apply(x + width, y + height);
    renderer.fillRect(
        globalThis.Math.min(corner.x, far.x),
        globalThis.Math.min(corner.y, far.y),
        globalThis.Math.abs(far.x - corner.x),
        globalThis.Math.abs(far.y - corner.y),
        style
    );
}

/** The outline of a local rectangle, drawn as four segments so rotation is honest. */
function rect(renderer, matrix, x, y, width, height, style) {
    const corners = [
        matrix.apply(x, y),
        matrix.apply(x + width, y),
        matrix.apply(x + width, y + height),
        matrix.apply(x, y + height)
    ];
    for (let at = 0; at < corners.length; at++) {
        segment(renderer, corners[at], corners[(at + 1) % corners.length], style);
    }
}

/** A rectangle already in device space. */
function box(renderer, x, y, width, height, { color, thickness }) {
    renderer.fillRect(x, y, width, thickness, { color });
    renderer.fillRect(x, y + height - thickness, width, thickness, { color });
    renderer.fillRect(x, y, thickness, height, { color });
    renderer.fillRect(x + width - thickness, y, thickness, height, { color });
}

/** One line between two device points, drawn as a thin rotated rectangle. */
function segment(renderer, from, to, { color, alpha = 1, thickness = 1 }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = globalThis.Math.hypot(dx, dy);
    if (!(length > 0)) return;

    renderer.save();
    renderer.setTransform(Matrix.compose(from.x, from.y, globalThis.Math.atan2(dy, dx), 1, 1));
    renderer.fillRect(0, -thickness / 2, length, thickness, { color, alpha });
    renderer.restore();
}
