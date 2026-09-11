// A Box Collider — the shape a creator says an Object collides with.
//
// IT IS DECLARED, NEVER INFERRED FROM WHAT IS DRAWN. A collider that took its size from the
// Sprite would be a size nobody typed, changing whenever the picture did, and invisible in
// the Inspector — so "why did that miss?" would have no answer on screen. A beginner has to
// be able to SEE exactly what collides, which means reading it off a row.
//
// IT DECIDES NOTHING ABOUT WHAT HAPPENS NEXT. There is no `solid`, no `trigger`, no mass and
// no bounce, because this tranche resolves nothing: a collision is an OVERLAP and an EVENT
// (ADR-0059). A `trigger` flag that made no observable difference would be a word copied
// from another engine to promise behaviour this engine does not have.
//
// `runtime/collision/`, BESIDE `clock/`, `input/` AND `random/`. Overlap is simulation state:
// it is a function of the Transforms the step just produced, it must be identical on a
// server and on every client, and nothing about it is a picture. The Core holds no collider
// for the same reason it holds no input — an `Object` does not collide, a SIMULATION does
// (ADR-0014 §1, ADR-0059 §2).

import { worldMatrix } from '../../core/mod.js';

export class BoxCollider {

    static type = 'BoxCollider';

    static schema = {
        width: { type: 'number', default: 32, min: 0 },
        height: { type: 'number', default: 32, min: 0 },
        // WHERE THE BOX SITS RELATIVE TO THE OBJECT'S ORIGIN. A character whose feet are the
        // origin needs its box above it; without an offset the only way to say that is to
        // move the Object, which moves everything else with it.
        offsetX: { type: 'number', default: 0 },
        offsetY: { type: 'number', default: 0 }
    };

    /**
     * Create the component.
     * @param {number} [width] - Width in local units
     * @param {number} [height] - Height in local units
     * @param {number} [offsetX] - Horizontal offset from the Object's origin
     * @param {number} [offsetY] - Vertical offset from the Object's origin
     */
    constructor(width = 32, height = 32, offsetX = 0, offsetY = 0) {
        this.width = width;
        this.height = height;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
    }

    /**
     * The area this collider covers, in the Object's own space.
     *
     * THE SAME SHAPE EVERY DRAWING COMPONENT ALREADY REPORTS (`RectangleRenderer.bounds`,
     * `Sprite.bounds`), so the Editor's picking and anything else that asks an Object what it
     * covers understands a collider without learning a second vocabulary.
     *
     * @returns {{x: number, y: number, width: number, height: number}} The local bounds
     */
    bounds() {
        return {
            x: this.offsetX - this.width / 2,
            y: this.offsetY - this.height / 2,
            width: this.width,
            height: this.height
        };
    }
}

/**
 * The axis-aligned box an Object's collider covers in world space.
 *
 * IT IS AN AABB OF THE TRANSFORMED CORNERS, AND IT SAYS SO RATHER THAN PRETENDING (ADR-0059
 * §3). The four corners go through `worldMatrix()` — so position, scale and the whole parent
 * chain are exact — and the answer is the smallest axis-aligned box containing them. Under
 * ROTATION that box is larger than the shape a creator drew: a square turned 45° reports a
 * box about 1.41 times as wide. That is a real approximation, it is conservative (it never
 * misses a real overlap, it can report one slightly early), and calling it an OBB would be
 * a lie the first time someone rotated a player.
 *
 * @param {object} object - The Object carrying the collider
 * @param {object} collider - Its BoxCollider
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} The world box
 */
export function worldBox(object, collider) {
    const local = collider.bounds();
    const matrix = worldMatrix(object);

    const right = local.x + local.width;
    const bottom = local.y + local.height;
    const corners = [
        matrix.apply(local.x, local.y),
        matrix.apply(right, local.y),
        matrix.apply(right, bottom),
        matrix.apply(local.x, bottom)
    ];

    return {
        minX: Math.min(...corners.map(corner => corner.x)),
        minY: Math.min(...corners.map(corner => corner.y)),
        maxX: Math.max(...corners.map(corner => corner.x)),
        maxY: Math.max(...corners.map(corner => corner.y))
    };
}

/**
 * Whether two world boxes overlap.
 *
 * TOUCHING EDGE TO EDGE IS NOT OVERLAPPING. Two boxes that share exactly one line have no
 * area in common, and counting that as a hit makes a wall a creator placed flush against
 * another wall report a collision for ever.
 *
 * @param {object} a - A world box
 * @param {object} b - Another world box
 * @returns {boolean} True when they share area
 */
export function boxesOverlap(a, b) {
    return a.minX < b.maxX && b.minX < a.maxX && a.minY < b.maxY && b.minY < a.maxY;
}
