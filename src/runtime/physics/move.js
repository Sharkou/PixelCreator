// Moving the Bodies, and stopping them at what is solid (ADR-0067).
//
// THIS IS THE THIRD IDEA, AND IT IS DELIBERATELY NOT THE OTHER TWO (ADR-0067 §3):
//
//   broad-phase.js   which pairs are worth testing at all
//   collisions.js    which pairs overlap, and which just started or stopped
//   move.js          which movement is allowed to happen
//
// They share geometry — `collidersOf()` — and nothing else. A single function that generated
// pairs, decided contacts and corrected positions would be the one that cannot be tested,
// because every question asked of it would be answered by the same opaque loop.
//
// ONE AXIS AT A TIME, SWEPT, AND THE ORDER IS ALWAYS X THEN Y. Two properties come out of
// that, and they are the two the contract needs:
//
//   NOTHING TUNNELS. The distance a body may travel along an axis is the smallest GAP to a
//   solid ahead of it, never a position sampled after the move. A body crossing a thousand
//   units in one step stops at a five-unit wall a hundred units away, because the gap says
//   a hundred. Sub-stepping — which is what an engine reaches for when it samples positions
//   instead of measuring gaps — would make the result depend on how many sub-steps it took.
//
//   IT SLIDES, WITHOUT ANYONE WRITING A PROJECTION. Only the axis that was blocked is
//   stopped and only its velocity is zeroed; the other axis has already moved, or is about
//   to. For an axis-aligned box against an axis-aligned wall, "kill the normal component,
//   keep the tangential one" IS this, and it is two subtractions rather than a dot product.
//
// TOUCHING IS NOT OVERLAPPING, AND THAT FOLLOWS THROUGH (ADR-0059 §3). A body stopped by the
// floor ends flush against it, sharing an edge and no area — so standing on the ground
// raises no `On Collision`, and a creator asks `grounded` instead. The perpendicular test
// below is strict for the same reason, which is what stops a body from snagging on the floor
// it is walking along.
//
// BODIES RESOLVE IN CANONICAL ORDER, ONE AFTER THE OTHER, each seeing where the ones before
// it ended up. That is a character-controller model, not a simultaneous solver: it is
// deterministic, it needs no iteration count, and the alternative — every body solved against
// every other at once — is the mass, the impulse and the restitution this tranche refused.

import { hierarchyOrder, worldMatrix } from '../../core/mod.js';
import { boxesOverlap, collidersOf, unionOf } from '../collision/collider.js';
import { tileBoxes } from '../tilemap/collider.js';
import { allPairs, candidatePairs } from '../collision/broad-phase.js';
import { Body } from './body.js';

/**
 * Move every Body in the scene by one step, stopped by what is solid.
 *
 * @param {object|null} scene - The scene to move
 * @param {object} [options] - Options
 * @param {number} [options.deltaTime] - The fixed step, in seconds
 * @param {boolean} [options.exhaustive] - Skip the broad phase and consider every collider,
 *   as the differential test's other half (ADR-0064 §4). Nothing in the product sets it.
 * @param {Function} [options.onCross] - Called with `(body, other)` for each collider a body
 *   passed CLEAN THROUGH during this step — overlapping it at neither end (ADR-0067 §11).
 *   Omit it and nothing is computed.
 * @returns {number} How many Bodies were moved
 */
export function moveBodies(scene, { deltaTime = 0, exhaustive = false, onCross = null } = {}) {
    if (!scene) return 0;

    const entries = collidersOf(scene);
    const at = new globalThis.Map();
    for (let index = 0; index < entries.length; index++) at.set(entries[index].object, index);

    const movers = [];
    for (const object of hierarchyOrder(scene)) {
        if (!object.active) continue;

        const body = object.getComponent?.(Body.type) ?? null;
        const transform = object.getComponent?.('Transform') ?? null;
        if (!body || body.active === false || !transform) continue;

        const velocity = object.getComponent?.('Velocity') ?? null;
        const moving = Boolean(velocity) && velocity.active !== false;

        // GRAVITY IS APPLIED BEFORE ANYTHING IS PAIRED, so the distance a body intends to
        // travel is known when the grid is asked what is near it — a body accelerating
        // downwards must be paired with the floor it is about to reach, not with the floor
        // it was near a step ago.
        if (moving) velocity.y += body.gravity * deltaTime;

        movers.push({
            object,
            body,
            transform,
            velocity: moving ? velocity : null,
            index: at.has(object) ? at.get(object) : -1,
            dx: moving ? velocity.x * deltaTime : 0,
            dy: moving ? velocity.y * deltaTime : 0
        });
    }

    if (movers.length === 0) return 0;

    const near = pairsNear(entries, movers, exhaustive);

    for (const mover of movers) {
        // EVERY STEP DECIDES IT AGAIN. `grounded` is a fact about THIS step's movement; one
        // left over from the step a body jumped would let it jump twice.
        mover.body.grounded = false;

        const entry = mover.index >= 0 ? entries[mover.index] : null;
        // THE CORRIDOR, and it is what keeps a tilemap cheap: the cells asked for are the
        // cells this body could reach on this step, never the cells of the level.
        const blockers = entry && entry.solid.length > 0
            ? blockersFor(entries, near.get(mover.index), stretch(entry.bounds, mover.dx, mover.dy))
            : [];
        let middle = null;

        let dx = mover.dx;
        let dy = mover.dy;

        // THE PATH IS AN L, AND THAT IS WHY IT CAN BE SWEPT EXACTLY. The resolution moves X,
        // then Y; each leg is axis-aligned, so the box it sweeps out is an exact rectangle
        // rather than the diagonal over-estimate a single union would give.
        const start = onCross && entry ? entry.boxes.map(copy) : null;

        if (blockers.length > 0) {
            const horizontal = sweep(entry.solid, blockers, dx, 'x');
            dx = horizontal.allowed;
            shift(entry.boxes, dx, 0);
            if (horizontal.blocked && mover.velocity) mover.velocity.x = 0;

            middle = start ? entry.boxes.map(copy) : null;

            const vertical = sweep(entry.solid, blockers, dy, 'y');
            dy = vertical.allowed;
            shift(entry.boxes, 0, dy);
            if (vertical.blocked) {
                // STOPPED ON THE WAY DOWN IS STANDING ON SOMETHING; stopped on the way up is
                // a ceiling. Both kill the vertical speed, and only one is `grounded`.
                if (mover.dy > 0) mover.body.grounded = true;
                if (mover.velocity) mover.velocity.y = 0;
            }

            entry.bounds = unionOf(entry.boxes);
        } else if (entry) {
            shift(entry.boxes, dx, 0);
            middle = start ? entry.boxes.map(copy) : null;
            shift(entry.boxes, 0, dy);
            entry.bounds = unionOf(entry.boxes);
        }

        if (onCross && entry) {
            report(onCross, mover.object, entries, near.get(mover.index), start, middle, entry.boxes);
        }

        translate(mover.object, mover.transform, dx, dy);
    }

    return movers.length;
}

/**
 * Which colliders each mover might reach, by index.
 *
 * THE BROAD PHASE IS REUSED, NOT REIMPLEMENTED (ADR-0067 §7). The pass hands it the same
 * entries in the same canonical order, with one difference that matters: a mover's bounds
 * are stretched to cover WHERE IT IS GOING, so the grid rejects a pair only when the body
 * cannot reach it this step. A pair the grid rejected must never become work here — which is
 * the whole reason this map exists rather than a loop over every collider per body.
 *
 * @param {object[]} entries - Every colliding Object, in canonical order
 * @param {object[]} movers - The Bodies, in canonical order
 * @param {boolean} exhaustive - Consider every pair instead, for the differential test
 * @returns {Map<number, number[]>} Mover index -> the indices it could reach
 */
function pairsNear(entries, movers, exhaustive) {
    const near = new globalThis.Map();
    const moving = new globalThis.Map();
    for (const mover of movers) {
        if (mover.index >= 0) moving.set(mover.index, mover);
    }
    if (moving.size === 0) return near;

    const swept = entries.map((entry, index) => {
        const mover = moving.get(index);
        return mover ? { bounds: stretch(entry.bounds, mover.dx, mover.dy) } : entry;
    });

    const pairs = exhaustive ? allPairs(entries.length) : candidatePairs(swept);
    const add = (index, other) => {
        if (!near.has(index)) near.set(index, []);
        near.get(index).push(other);
    };

    for (const [i, j] of pairs) {
        // ONLY WHAT A MOVER IS IN. Two walls are a candidate pair for `Collisions` and are
        // nothing at all here.
        if (moving.has(i)) add(i, j);
        if (moving.has(j)) add(j, i);
    }

    return near;
}

/**
 * The solid boxes of a mover's candidates, flattened once.
 *
 * A TILEMAP IS EXPANDED HERE AND NOWHERE ELSE (ADR-0068 §3). Its cells are not boxes the
 * scene holds; they are boxes computed for this body, for this step, from the corridor it
 * sweeps — so the cost follows the character and not the size of the level.
 *
 * @param {object[]} entries - Every colliding Object, in canonical order
 * @param {number[]|undefined} candidates - The indices the grid proposed
 * @param {object} corridor - The world region the body can reach this step
 * @returns {object[]} The world boxes that can stop it
 */
function blockersFor(entries, candidates, corridor) {
    if (!candidates) return [];

    const boxes = [];
    for (const index of candidates) {
        const entry = entries[index];
        for (const box of entry.solid) boxes.push(box);
        if (entry.grid) {
            for (const box of tileBoxes(entry.object, entry.grid, corridor)) boxes.push(box);
        }
    }
    return boxes;
}

/**
 * How far a set of boxes may travel along one axis before something solid is in the way.
 *
 * THE ANSWER IS A GAP, NEVER A SAMPLED POSITION. For each blocker whose OTHER axis overlaps,
 * the free distance is the space between the two facing edges; the smallest one wins. A
 * blocker the body already spans on this axis is ignored on purpose: a body that somehow
 * started inside a wall has to be able to leave it, and a solver that froze it there would be
 * worse than the overlap it was trying to fix (ADR-0067 §6).
 *
 * @param {object[]} boxes - The moving boxes, in world space
 * @param {object[]} blockers - The solid boxes that could stop them
 * @param {number} delta - How far it wants to go, signed
 * @param {string} axis - `'x'` or `'y'`
 * @returns {{allowed: number, blocked: boolean}} How far it may actually go
 */
function sweep(boxes, blockers, delta, axis) {
    if (delta === 0) return { allowed: 0, blocked: false };

    const forward = delta > 0;
    const min = axis === 'x' ? 'minX' : 'minY';
    const max = axis === 'x' ? 'maxX' : 'maxY';
    const otherMin = axis === 'x' ? 'minY' : 'minX';
    const otherMax = axis === 'x' ? 'maxY' : 'maxX';

    let limit = globalThis.Math.abs(delta);
    let blocked = false;

    for (const box of boxes) {
        for (const blocker of blockers) {
            // STRICTLY, so a body resting on a floor is not stopped by that floor when it
            // walks along it: they share an edge, and an edge is not an overlap.
            if (!(box[otherMin] < blocker[otherMax] && blocker[otherMin] < box[otherMax])) continue;

            const gap = forward ? blocker[min] - box[max] : box[min] - blocker[max];
            if (gap < 0) continue;
            if (gap < limit) {
                limit = gap;
                blocked = true;
            }
        }
    }

    return { allowed: forward ? limit : -limit, blocked };
}

/**
 * Tell the caller about every collider this body passed clean through.
 *
 * WHAT A SNAPSHOT CANNOT SEE (ADR-0067 §11). A contact is reported here ONLY when the body
 * overlapped the other box at NEITHER end of the step: an overlap at the start was already
 * reported by the step that began there, and one at the end will be reported by the step that
 * begins where this one stopped. What is left is the passage that falls between two
 * snapshots — a bullet through a hitbox at three thousand units a second.
 *
 * IT IS NOT AN OVERLAP, AND IT IS NOT A SOLID CONTACT. Nothing here moves anything, nothing
 * here consults `solid`, and `Is Overlapping` never learns of it.
 *
 * @param {Function} onCross - Called with `(body, other)`
 * @param {object} object - The body that moved
 * @param {object[]} entries - Every colliding Object, in canonical order
 * @param {number[]|undefined} candidates - The indices the grid proposed
 * @param {object[]} start - Its boxes before the movement
 * @param {object[]|null} middle - Its boxes after the horizontal leg
 * @param {object[]} end - Its boxes now
 */
function report(onCross, object, entries, candidates, start, middle, end) {
    if (!candidates || !start) return;

    for (const index of candidates) {
        const other = entries[index];
        let crossed = false;

        for (let at = 0; at < start.length && !crossed; at++) {
            const legs = [
                unionOf([start[at], middle ? middle[at] : end[at]]),
                unionOf([middle ? middle[at] : start[at], end[at]])
            ];

            for (const box of other.boxes) {
                if (boxesOverlap(start[at], box) || boxesOverlap(end[at], box)) continue;
                if (legs.some(leg => boxesOverlap(leg, box))) {
                    crossed = true;
                    break;
                }
            }
        }

        if (crossed) onCross(object, other.object);
    }
}

/** A world box, copied, so a shifted one can still be compared with where it was. */
function copy(box) {
    return { minX: box.minX, minY: box.minY, maxX: box.maxX, maxY: box.maxY };
}

/**
 * Move a set of world boxes, in place.
 * @param {object[]} boxes - The boxes to move
 * @param {number} dx - Horizontal distance
 * @param {number} dy - Vertical distance
 */
function shift(boxes, dx, dy) {
    if (dx === 0 && dy === 0) return;

    for (const box of boxes) {
        box.minX += dx;
        box.maxX += dx;
        box.minY += dy;
        box.maxY += dy;
    }
}

/**
 * A bounds stretched to cover a movement, so the grid pairs where a body is GOING.
 * @param {object} bounds - The union bounds of an Object's boxes
 * @param {number} dx - Horizontal distance it intends to travel
 * @param {number} dy - Vertical distance it intends to travel
 * @returns {object} The swept bounds
 */
function stretch(bounds, dx, dy) {
    return {
        minX: bounds.minX + globalThis.Math.min(0, dx),
        maxX: bounds.maxX + globalThis.Math.max(0, dx),
        minY: bounds.minY + globalThis.Math.min(0, dy),
        maxY: bounds.maxY + globalThis.Math.max(0, dy)
    };
}

/**
 * Write a world movement onto a Transform.
 *
 * THE SWEEP IS IN WORLD SPACE AND A TRANSFORM IS IN ITS PARENT'S (ADR-0002), so the movement
 * crosses back through the inverse of the parent's matrix — its LINEAR part, because a
 * direction has no origin. Without it a body parented to anything scaled or rotated would
 * move by a number that means something else, which is the quiet disagreement
 * `Translate` documents for the same reason.
 *
 * @param {object} object - The Object being moved
 * @param {object} transform - Its Transform
 * @param {number} dx - How far it moved in world space
 * @param {number} dy - The same, vertically
 */
function translate(object, transform, dx, dy) {
    if (dx === 0 && dy === 0) return;

    const parent = object.parent ?? null;
    if (!parent) {
        transform.x += dx;
        transform.y += dy;
        return;
    }

    try {
        const inverse = worldMatrix(parent).invert();
        const origin = inverse.apply(0, 0);
        const moved = inverse.apply(dx, dy);
        transform.x += moved.x - origin.x;
        transform.y += moved.y - origin.y;
    } catch {
        // A parent scaled to nothing has no inverse and no sensible answer. Moving by the
        // world delta is wrong by exactly that scale, and refusing to move at all would
        // freeze a body for a reason nobody can see.
        transform.x += dx;
        transform.y += dy;
    }
}
