// A sheet cut into tiles (ADR-0070).
//
// IT IS A RESOURCE, AND THE CUTTING IS WHAT IT HOLDS. Two maps of one dungeon name one
// `Tileset`; re-cutting the sheet re-cuts both, and a cell of a map holds a small integer
// rather than a source and a rectangle. That is the argument ADR-0062 §4 makes for a clip and
// ADR-0061 makes for a prefab, applied to the one thing a level is made of.
//
// A CELL'S NUMBER IS 1-BASED, BECAUSE 0 ALREADY MEANS SOMETHING. `Tilemap` has said since it
// existed that an empty cell is `0`, and the Tilemap Collider reads exactly that — empty or
// not — without knowing a tileset exists (ADR-0068 §3). So tile `1` is the FIRST cell of the
// sheet, and the whole of the mapping is `tile - 1`.
//
// IT COMPUTES A RECTANGLE AND NOTHING ELSE. No image, no URL, no decode: `source` is a
// `ResourceId` and the pixels behind it are the `ImageCache`'s business (ADR-0062 §2). The
// arithmetic is `core/frames.js`, shared with `Animation` so that one cell of one grid is one
// rectangle whichever of the two asks for it.

import { frameRect } from './frames.js';

/** Bumped when the shape below changes in a way an older reader cannot survive. */
export const TILESET_FORMAT = 1;

/**
 * The cell size a tileset is given when nobody says otherwise.
 *
 * SIXTEEN, BECAUSE IT IS WHAT A TUTORIAL SHEET IS. A default that is visibly wrong on a
 * 32-pixel sheet is a number a creator corrects in one row; a default of zero would be a
 * tileset that draws nothing and says nothing about why.
 */
export const DEFAULT_TILE = 16;

/**
 * Build a tileset definition.
 *
 * EVERY NUMBER IS CLAMPED HERE RATHER THAN GUARDED EVERYWHERE ELSE. A width of -8, a count of
 * `NaN` or a column count of `"four"` produce a definition that is merely empty — never a
 * rectangle of `NaN`, which would reach a canvas and draw nothing while reporting nothing.
 *
 * @param {object} spec - The cutting
 * @param {string} [spec.source] - ResourceId of the sheet
 * @param {number} [spec.tileWidth] - Cell width in pixels
 * @param {number} [spec.tileHeight] - Cell height in pixels
 * @param {number} [spec.columns] - Cells per row of the sheet
 * @param {number} [spec.count] - How many tiles the sheet holds
 * @returns {object} A plain, JSON-safe definition
 */
export function createTileset({
    source = null,
    tileWidth = DEFAULT_TILE,
    tileHeight = DEFAULT_TILE,
    columns = 1,
    count = 1
} = {}) {
    const width = whole(tileWidth);
    const height = whole(tileHeight);

    return {
        version: TILESET_FORMAT,
        source,
        tileWidth: width,
        tileHeight: height,
        // DECLARED, NEVER MEASURED — the same rule, and the same reason, as a clip's
        // `columns` (ADR-0062 §4): deriving it from the decoded sheet would make a tile's
        // rectangle depend on whether a decode had finished.
        columns: globalThis.Math.max(1, whole(columns) || 1),
        count: globalThis.Math.max(0, whole(count))
    };
}

/**
 * Read a definition, or refuse it.
 *
 * A VERSION THIS BUILD DOES NOT KNOW IS REFUSED, like a clip from one (ADR-0062 §4), a graph
 * from one (ADR-0027) and a prefab from one (ADR-0061 §3). It answers null rather than
 * throwing: a sheet that cannot be read is a state of the project, and a map whose tileset is
 * unreadable simply draws nothing.
 *
 * A TILESET WITH NO SOURCE, NO CELL SIZE OR NO TILES IS NOT ONE. Each of those is a tileset
 * that could only ever answer `null` for every tile, and saying so once here is what keeps
 * every caller from asking three questions before it can draw.
 *
 * @param {object} definition - The payload
 * @returns {object|null} The definition, or null
 */
export function tilesetOf(definition) {
    if (!definition || definition.version !== TILESET_FORMAT) return null;
    if (!definition.source) return null;
    if (!(definition.tileWidth > 0) || !(definition.tileHeight > 0)) return null;
    return definition.count > 0 ? definition : null;
}

/** How many tiles a sheet holds, or 0 when it is not a tileset. */
export function tileCount(definition) {
    return tilesetOf(definition)?.count ?? 0;
}

/**
 * The rectangle of the sheet one tile occupies.
 *
 * A TILE THAT DOES NOT EXIST DRAWS NOTHING (ADR-0070 §7). A map painted with eighty tiles and
 * then pointed at a sheet of twenty keeps its cells — they are still occupied, so they still
 * block (ADR-0068 §3) — and the ones beyond the sheet draw nothing at all. Substituting
 * another frame would put a wall where the creator painted a door and never say so.
 *
 * @param {object} definition - The payload
 * @param {number} tile - The cell's value: 0 is empty, 1 is the first tile
 * @returns {{x: number, y: number, width: number, height: number}|null} The rectangle, or null
 */
export function tileRect(definition, tile) {
    const sheet = tilesetOf(definition);
    if (!sheet) return null;

    const index = globalThis.Math.floor(globalThis.Number(tile));
    if (!globalThis.Number.isFinite(index) || index < 1 || index > sheet.count) return null;

    return frameRect({
        index: index - 1,
        frameWidth: sheet.tileWidth,
        frameHeight: sheet.tileHeight,
        columns: sheet.columns
    });
}

function whole(value) {
    const parsed = globalThis.Number(value);
    return globalThis.Number.isFinite(parsed) && parsed > 0 ? globalThis.Math.floor(parsed) : 0;
}
