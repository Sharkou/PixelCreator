// Resizing a Tilemap from the Inspector, without shearing it (ADR-0068 §6).
//
// THE BUG THIS EXISTS TO CLOSE. A grid is addressed by `row * columns + column`, so writing
// `columns` alone does not resize a map — it SHEARS it: every row after the first slides
// sideways by the difference, and a level a creator spent ten minutes painting comes back as
// diagonal noise. `Tilemap.remap()` is the rule that fixes it, and this is the one place that
// calls it, because the Inspector is the one place `columns` and `rows` are typed into.
//
// TWO PROPERTIES, ONE BATCH, AND THAT IS THE WHOLE POINT. Writing `tiles` beside the
// dimension means the Operation pair carries the grid BEFORE and the grid AFTER — so undo
// restores the size and everything that was cropped with it (ADR-0024). A dimension written
// on its own could only ever undo to "the same size, and empty cells where your level was".

import { createId } from '../core/mod.js';
import { Tilemap } from '../runtime/mod.js';

/** The two fields that cannot be written on their own. */
const DIMENSIONS = ['columns', 'rows'];

/**
 * The writer a row needs, or null when the ordinary one will do.
 *
 * ASKED OF EVERY ROW, ANSWERED FOR TWO. The Inspector does not learn what a Tilemap is; it
 * asks this whether the row it is about to draw needs a writer of its own, and gets `null`
 * for every other property of every other Component.
 *
 * @param {object} target - The record the row reads and writes
 * @param {object} descriptor - The field descriptor
 * @returns {Function|null} A `(value, { batch }) => void` writer, or null
 */
export function gridWriter(target, descriptor) {
    if (!isTilemap(target) || !DIMENSIONS.includes(descriptor?.name)) return null;
    return (value, options = {}) => resizeGrid(target, descriptor.name, value, options);
}

/**
 * Resize a Tilemap, keeping what fits where it was.
 *
 * @param {object} tilemap - The Tilemap component
 * @param {string} name - `'columns'` or `'rows'`
 * @param {number} value - The new size, in cells
 * @param {object} [options] - Options
 * @param {string} [options.batch] - Groups the two writes into one history entry
 * @param {string} [options.actor] - Who authored the intent
 * @returns {object} What `setProperty` answered for the dimension
 */
export function resizeGrid(tilemap, name, value, { batch, actor } = {}) {
    const size = globalThis.Math.max(0, globalThis.Math.floor(globalThis.Number(value) || 0));
    const columns = name === 'columns' ? size : tilemap.columns;
    const rows = name === 'rows' ? size : tilemap.rows;

    // ONE GROUP, TWO WRITES, AND `tiles` FIRST. The dimension is what everything reads the
    // array THROUGH, so the array is put in its new shape before the shape is announced;
    // undo inverts in reverse and puts the announcement back first, which is the same order
    // read the other way.
    const group = batch ?? createId();
    tilemap.setProperty('tiles', tilemap.remap(columns, rows), { batch: group, actor });
    return tilemap.setProperty(name, size, { batch: group, actor });
}

/** Whether a record is a Tilemap, asked of the type rather than of a duck. */
function isTilemap(target) {
    return target?.constructor?.type === Tilemap.type;
}
