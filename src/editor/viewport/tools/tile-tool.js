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
// THE PALETTE IS DRAWN ON THE SURFACE, because "which tile am I painting" is a question about
// what is under the cursor, and answering it three panels away is answering it too late. It
// is a strip of swatches, not an editor: adding a colour is one button, and CHANGING one is
// still the Inspector's list, where it always was.

import { Matrix, Origin, createId, setCellsOperation, worldMatrix } from '../../../core/mod.js';
import { Tilemap } from '../../../runtime/mod.js';

/** The colour the Editor marks things with, the same one the overlay uses. */
const ACCENT = '#ff7a45';

/** Swatch size and gap, in CSS pixels. */
const SWATCH = 22;
const GAP = 5;
const MARGIN = 12;

/** Below this many device pixels per cell, the grid lines are noise rather than a guide. */
const GRID_MIN = 5;

/** What `+` appends, in order. Four steps around the wheel, so two of them never look alike. */
const NEXT_COLOURS = ['#6aa84f', '#3d85c6', '#c27ba0', '#e69138', '#8e7cc3', '#a64d79'];

export class TileTool {

    #context;
    #hovered = null;
    #stroke = null;
    #active = 1;
    #scale = 1;
    #strip = [];

    /**
     * Create the tool.
     * @param {object} context - `{ scene, selection }`
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

    /** Choose what is painted; the last swatch appends a colour instead. */
    #pick(target, index) {
        const { tilemap } = target;
        if (index >= 0) {
            this.#active = index;
            return;
        }

        const palette = globalThis.Array.isArray(tilemap.palette) ? tilemap.palette : [];
        // ENTRY 0 IS EMPTY AND IS NEVER A COLOUR (`Tilemap.draw` skips tile 0), so the first
        // colour a creator adds has to land at index 1 — with a placeholder under it rather
        // than a hole, because a hole is a row the Inspector cannot draw.
        const base = palette.length === 0 ? ['#000000'] : [...palette];
        const colour = NEXT_COLOURS[globalThis.Math.max(0, base.length - 1) % NEXT_COLOURS.length];

        tilemap.setProperty('palette', [...base, colour]);
        this.#active = base.length;
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

        const colour = this.#active === 0 ? '#ffffff' : (tilemap.palette?.[this.#active] ?? ACCENT);
        fill(renderer, matrix, x, y, size, size, { color: colour, alpha: 0.35 });
        rect(renderer, matrix, x, y, size, size,
            { color: ACCENT, alpha: 1, thickness: globalThis.Math.max(1, 2 * scale) });
    }

    #drawPalette(renderer, target, scale) {
        const palette = globalThis.Array.isArray(target.tilemap.palette) ? target.tilemap.palette : [];
        const size = SWATCH * scale;
        const gap = GAP * scale;
        const top = MARGIN * scale;
        // Entry 0 is Empty and is drawn as such; entries 1..n are the colours; `+` appends.
        const entries = [0, ...palette.map((colour, index) => index).slice(1), -1];

        let left = MARGIN * scale;
        for (const index of entries) {
            const swatch = { index, x: left, y: top, size };
            this.#strip.push(swatch);

            const colour = index === 0 ? '#1b1b20' : (index === -1 ? '#25252c' : palette[index]);
            renderer.fillRect(left, top, size, size, { color: colour || '#25252c' });

            if (index === 0) {
                // A slash: "paint nothing here", which is what erasing is.
                renderer.fillRect(left + size * 0.18, top + size * 0.46,
                    size * 0.64, globalThis.Math.max(1, scale), { color: '#8a8a99' });
            }
            if (index === -1) {
                const arm = size * 0.3;
                const thick = globalThis.Math.max(1, scale);
                renderer.fillRect(left + size / 2 - arm, top + size / 2 - thick / 2, arm * 2, thick,
                    { color: '#8a8a99' });
                renderer.fillRect(left + size / 2 - thick / 2, top + size / 2 - arm, thick, arm * 2,
                    { color: '#8a8a99' });
            }

            const border = index === this.#active
                ? { color: ACCENT, thickness: globalThis.Math.max(2, 2 * scale) }
                : { color: '#000000', thickness: globalThis.Math.max(1, scale) };
            box(renderer, left, top, size, size, border);

            left += size + gap;
        }
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
