// The cells of a Tilemap, made solid (ADR-0068 §3).
//
// TWO COMPONENTS, BECAUSE THERE ARE TWO STATEMENTS. A `Tilemap` draws a grid; a background
// of clouds is a Tilemap and must not stop anybody. A `Tilemap Collider` says "the cells of
// this Object's grid are walls", and it says it once for the whole map rather than once per
// cell — which is the difference between adding a Component and adding forty thousand.
//
// IT HOLDS NO GRID OF ITS OWN, AND THAT IS THE POINT (ADR-0068 §2). It reads the `Tilemap`
// sitting beside it. A second array, built for collision and kept in step with the first,
// is the bug this design does not have: paint a cell and it blocks, on the same frame,
// because there is nothing to keep in step.
//
// EMPTY IS 0 AND EVERYTHING ELSE IS SOLID. No per-cell material, no per-tile flag, no
// layer: a first version that can say "wall" and "not wall" is a version a beginner can use,
// and a per-tile property is a decision about what a tile IS (ADR-0068 §8).
//
// CELLS ARE MATERIALISED FOR A CORRIDOR, NEVER FOR A MAP. `tileBoxes()` is given the region
// a body could reach this step and answers only the cells in it. A two-hundred-square map is
// forty thousand cells and a walking character touches four of them.

import { worldMatrix } from '../../core/mod.js';
import { Tilemap } from './tilemap.js';

export class TilemapCollider {

    static type = 'TilemapCollider';

    /**
     * NO FIELDS, AND NOTHING TO TYPE. What it needs is the grid beside it and the rule that
     * a non-empty cell is a wall; a schema with a number in it would be a number nobody could
     * answer. It still carries `active`, like every Component, so a level's collision can be
     * switched off without deleting anything (ADR-0004).
     */
    static schema = {};
}

/**
 * The world boxes of the occupied cells a region touches.
 *
 * AXIS-ALIGNED ONLY, AND IT SAYS SO BY REFUSING. A cell is a square in the Object's local
 * space; under a rotated or sheared Transform its world shape is a rotated square, and the
 * only thing this file could hand the solver is that square's bounding box — which is up to
 * 41% too big and would stop a player short of a wall they can see. ADR-0059 §3 accepted that
 * approximation for ONE declared collider a creator can see and reason about; accepting it for
 * every cell of a level would make a whole map subtly wrong. So a rotated Tilemap Collider
 * contributes nothing and the limit is documented (ADR-0068 §4) rather than approximated.
 *
 * Scale and mirroring are exact: they keep the grid axis-aligned.
 *
 * @param {object} object - The Object carrying the tilemap
 * @param {object} tilemap - Its Tilemap
 * @param {{minX: number, minY: number, maxX: number, maxY: number}} region - Where to look,
 *   in world space — typically the corridor a body sweeps this step
 * @returns {Array<{minX: number, minY: number, maxX: number, maxY: number}>} The world boxes
 */
export function tileBoxes(object, tilemap, region) {
    const matrix = worldMatrix(object);
    // `b` and `c` are the off-diagonal terms: zero means the grid is still square with the
    // world. A degenerate scale has no inverse and no cells worth speaking of.
    if (matrix.b !== 0 || matrix.c !== 0 || matrix.a === 0 || matrix.d === 0) return [];

    const size = tilemap.tileSize;
    if (!(size > 0)) return [];

    // The region, brought back into the grid's own space. `a` or `d` may be negative — a
    // mirrored map is still a grid — so the two corners are sorted rather than assumed.
    const firstX = (region.minX - matrix.e) / matrix.a;
    const lastX = (region.maxX - matrix.e) / matrix.a;
    const firstY = (region.minY - matrix.f) / matrix.d;
    const lastY = (region.maxY - matrix.f) / matrix.d;

    const left = globalThis.Math.min(firstX, lastX);
    const right = globalThis.Math.max(firstX, lastX);
    const top = globalThis.Math.min(firstY, lastY);
    const bottom = globalThis.Math.max(firstY, lastY);

    const fromColumn = clamp(globalThis.Math.floor(left / size), 0, tilemap.columns - 1);
    const toColumn = clamp(globalThis.Math.ceil(right / size) - 1, 0, tilemap.columns - 1);
    const fromRow = clamp(globalThis.Math.floor(top / size), 0, tilemap.rows - 1);
    const toRow = clamp(globalThis.Math.ceil(bottom / size) - 1, 0, tilemap.rows - 1);

    const boxes = [];
    for (let row = fromRow; row <= toRow; row++) {
        for (let column = fromColumn; column <= toColumn; column++) {
            if (tilemap.get(column, row) === 0) continue;
            boxes.push(cellBox(matrix, column * size, row * size, size));
        }
    }

    return boxes;
}

/**
 * The world box of the whole grid, for the broad phase.
 *
 * ONE ENTRY IN THE GRID, NOT FORTY THOUSAND (ADR-0068 §3). A tilemap is one Object, so it is
 * one thing the spatial hash partitions — exactly as an Object with two hitboxes is.
 *
 * @param {object} object - The Object carrying the tilemap
 * @param {object} tilemap - Its Tilemap
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} The world bounds
 */
export function mapBounds(object, tilemap) {
    const matrix = worldMatrix(object);
    const width = tilemap.columns * tilemap.tileSize;
    const height = tilemap.rows * tilemap.tileSize;

    const corners = [
        matrix.apply(0, 0),
        matrix.apply(width, 0),
        matrix.apply(width, height),
        matrix.apply(0, height)
    ];

    return {
        minX: globalThis.Math.min(...corners.map(corner => corner.x)),
        minY: globalThis.Math.min(...corners.map(corner => corner.y)),
        maxX: globalThis.Math.max(...corners.map(corner => corner.x)),
        maxY: globalThis.Math.max(...corners.map(corner => corner.y))
    };
}

/**
 * The Tilemap whose cells this Object makes solid, or null.
 *
 * BOTH COMPONENTS, BOTH SWITCHED ON. A collider without a grid has nothing to make solid,
 * and either one switched off is off (ADR-0004).
 *
 * @param {object} object - The Object to ask
 * @returns {object|null} Its Tilemap, when its cells are walls
 */
export function solidGridOf(object) {
    const collider = object.getComponent?.(TilemapCollider.type) ?? null;
    if (!collider || collider.active === false) return null;

    const tilemap = object.getComponent?.(Tilemap.type) ?? null;
    if (!tilemap || tilemap.active === false) return null;

    return tilemap.columns > 0 && tilemap.rows > 0 ? tilemap : null;
}

/** One cell, from the grid's space into the world's. */
function cellBox(matrix, localX, localY, size) {
    const first = matrix.apply(localX, localY);
    const second = matrix.apply(localX + size, localY + size);

    return {
        minX: globalThis.Math.min(first.x, second.x),
        minY: globalThis.Math.min(first.y, second.y),
        maxX: globalThis.Math.max(first.x, second.x),
        maxY: globalThis.Math.max(first.y, second.y)
    };
}

function clamp(value, low, high) {
    return globalThis.Math.max(low, globalThis.Math.min(high, value));
}
