// A Box Collider — the shape a creator says an Object collides with.
//
// IT IS DECLARED, NEVER INFERRED FROM WHAT IS DRAWN. A collider that took its size from the
// Sprite would be a size nobody typed, changing whenever the picture did, and invisible in
// the Inspector — so "why did that miss?" would have no answer on screen. A beginner has to
// be able to SEE exactly what collides, which means reading it off a row.
//
// IT SAYS WHETHER IT BLOCKS, AND NOTHING MORE (ADR-0067 §2). ADR-0059 refused a `trigger`
// flag while nothing resolved anything — "a word copied from another engine to promise
// behaviour this engine does not have". The behaviour arrived, so the word did: `solid` is
// read by the movement pass and by nothing else. There is still no mass, no bounce and no
// friction, because none of those is a sentence this engine can finish.
//
// `runtime/collision/`, BESIDE `clock/`, `input/` AND `random/`. Overlap is simulation state:
// it is a function of the Transforms the step just produced, it must be identical on a
// server and on every client, and nothing about it is a picture. The Core holds no collider
// for the same reason it holds no input — an `Object` does not collide, a SIMULATION does
// (ADR-0014 §1, ADR-0059 §2).

import { hierarchyOrder, worldMatrix } from '../../core/mod.js';
import { mapBounds, solidGridOf } from '../tilemap/collider.js';

export class BoxCollider {

    static type = 'BoxCollider';

    static schema = {
        width: { type: 'number', default: 32, min: 0 },
        height: { type: 'number', default: 32, min: 0 },
        // THE ONE WORD THAT SEPARATES A WALL FROM A COIN. On by default, because a box a
        // creator drew around a crate is a crate: a beginner who wants a wall has to type
        // nothing, and a beginner who wants a pickup unticks one box and still gets every
        // `On Collision` event (ADR-0067 §2). It changes nothing for an Object with no
        // `Body` anywhere near it — what is solid is what a MOVING thing is stopped by.
        solid: {
            type: 'boolean',
            default: true,
            tooltip: 'Blocks Objects that have a Body. Off means it only detects'
        },
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
     * @param {boolean} [solid] - Whether it stops a Body, or only detects it
     */
    constructor(width = 32, height = 32, offsetX = 0, offsetY = 0, solid = true) {
        this.width = width;
        this.height = height;
        this.offsetX = offsetX;
        this.offsetY = offsetY;
        this.solid = solid;
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

/**
 * Every Object with a live collider, with its world boxes — in canonical order.
 *
 * ONE WALK, TWO READERS, AND THEY ASK DIFFERENT QUESTIONS OF IT (ADR-0067 §3). `Collisions`
 * asks which pairs overlap; the movement pass asks what a Body is stopped by. Both need the
 * same list, computed the same way, from the same rules about what is switched off — and a
 * second walk that drifted from this one would be two disagreeing answers to "what is in
 * this scene", which is precisely the defect a shared list cannot have.
 *
 * WHAT IS SWITCHED OFF DOES NOT COLLIDE, and the two questions are the two the runtime and
 * the renderer already ask of everything: is the Object active, and is this component
 * switched on (ADR-0004).
 *
 * A TILEMAP IS ONE ENTRY TOO (ADR-0068 §3). It carries no boxes — a grid does not overlap
 * things, and this version raises no contact for its cells — but it carries `grid`, which the
 * movement pass turns into the handful of cells a body could actually reach. That is what
 * keeps a forty-thousand-cell level ONE thing in the spatial hash.
 *
 * @param {object|null} scene - The scene to walk
 * @returns {Array<{object: object, boxes: object[], solid: object[], bounds: object, grid: object|null}>}
 *   One entry per Object, in canonical order
 */
export function collidersOf(scene) {
    const found = [];
    if (!scene) return found;

    for (const object of hierarchyOrder(scene)) {
        if (!object.active) continue;

        const components = object.components;
        const boxes = [];
        const solid = [];
        for (const type of globalThis.Object.keys(components)) {
            const component = components[type];
            if (type !== BoxCollider.type || component.active === false) continue;

            const box = worldBox(object, component);
            boxes.push(box);
            // `solid` IS READ AS "NOT EXPLICITLY OFF", so a collider serialized before the
            // flag existed is a wall, which is what it looked like on screen.
            if (component.solid !== false) solid.push(box);
        }

        const grid = solidGridOf(object);

        if (boxes.length > 0) {
            found.push({
                object,
                boxes,
                solid,
                bounds: grid ? unionOf([unionOf(boxes), mapBounds(object, grid)]) : unionOf(boxes),
                grid
            });
        } else if (grid) {
            found.push({ object, boxes, solid, bounds: mapBounds(object, grid), grid });
        }
    }

    return found;
}

/**
 * The one rectangle that contains every box of an Object.
 *
 * WHAT THE BROAD PHASE PARTITIONS. An Object with two hitboxes is one thing in the grid,
 * because the pair is a pair of OBJECTS (ADR-0059 §5) — partitioning by box would propose the
 * same pair twice and would have to deduplicate what it had just split.
 *
 * @param {object[]} boxes - World boxes
 * @returns {{minX: number, minY: number, maxX: number, maxY: number}} Their union
 */
export function unionOf(boxes) {
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (const box of boxes) {
        if (box.minX < minX) minX = box.minX;
        if (box.minY < minY) minY = box.minY;
        if (box.maxX > maxX) maxX = box.maxX;
        if (box.maxY > maxY) maxY = box.maxY;
    }

    return { minX, minY, maxX, maxY };
}
