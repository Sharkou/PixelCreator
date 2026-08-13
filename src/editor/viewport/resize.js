// Resizing an object from a handle — eight directions, one function.
//
// Legacy wrote this as a `switch` of eight cases, DUPLICATED between the object branch
// and the component branch: about 240 lines carrying its own `// TODO: Factoriser`
// (legacy/editor/system/handler.js:381-520). The eight cases differ by two signs. So the
// direction is data here, and there is exactly one piece of arithmetic.
//
// WHAT THE GESTURE MEANS: the edge you grabbed follows the pointer, and THE OPPOSITE EDGE
// DOES NOT MOVE. That is the whole specification, and it is what makes the object appear
// to be pulled rather than to grow around its centre.
//
// WHY THE SIZE MOVES IN TWOS, AND WHY IT HAS TO. The origin is the centre (ADR-0002 and
// every shipped renderer), so half of a size change is what moves the centre. The Editor
// writes whole units for both the size and the position. Those three facts together admit
// exactly one arithmetic: an odd change would put the centre on a half unit, and rounding
// it back is what used to shift the anchored edge by half a unit on every other pixel of
// the drag — a visible shimmer on the edge that is supposed to be nailed down. So the
// change on each axis is rounded to an even number of units and the parity of the size is
// preserved. A 64-wide box resizes 64, 66, 68; a 65-wide box resizes 65, 67, 69.
//
// This is a consequence of the model, not a preference. Reaching an odd size from an even
// one would need either a half-unit position or a declared anchor, and both are decisions
// well outside a rendering fix.
//
// The invariant is EXACT while the object is axis-aligned and unscaled relative to its
// parent. Under rotation or a scaled parent, an integer offset in the object's frame is
// an irrational one in the parent's, so writing whole units bounds the error at half a
// unit — inherent to integers, and measured by the tests rather than assumed away.
//
// WHERE THE NUMBERS GO. Size is not on Transform (ADR-0002): width and height describe
// what is drawn, so they live on the drawing component. Keeping the opposite edge still
// therefore takes two writes — the size on that component, and the position on Transform,
// because our renderers centre themselves on the origin and changing a size moves both
// edges by half.
//
// ROTATION AND PARENTS come out of the matrices rather than out of special cases. The
// pointer is measured in the object's own frame, so an object turned 30° resizes along
// its own axes; the resulting shift of the centre is pushed back through the object's
// local matrix, so what lands in `transform.x` is expressed in the parent's frame, which
// is what local values mean.

import { localMatrix, worldMatrix } from '../../core/mod.js';

/** The eight handles, as unit directions in the object's local frame. */
export const HANDLES = [
    { id: 'top-left', x: -1, y: -1, cursor: 'nwse-resize' },
    { id: 'top', x: 0, y: -1, cursor: 'ns-resize' },
    { id: 'top-right', x: 1, y: -1, cursor: 'nesw-resize' },
    { id: 'right', x: 1, y: 0, cursor: 'ew-resize' },
    { id: 'bottom-right', x: 1, y: 1, cursor: 'nwse-resize' },
    { id: 'bottom', x: 0, y: 1, cursor: 'ns-resize' },
    { id: 'bottom-left', x: -1, y: 1, cursor: 'nesw-resize' },
    { id: 'left', x: -1, y: 0, cursor: 'ew-resize' }
];

/** Smallest side a drag can leave, in local units. Below this a shape is unclickable. */
export const MIN_SIZE = 1;

/**
 * The component that decides how big an object is.
 *
 * Recognised by its schema declaring both `width` and `height` as numbers, never by its
 * type name — a component a creator defines with those two properties is resizable for
 * the same reason a `Sprite` is, and this file never learns either name (ADR-0007).
 *
 * @param {object} object - The object
 * @returns {object|null} The sizing component, or null when nothing has an extent
 */
export function sizingComponent(object) {
    const components = object.components;

    for (const type of globalThis.Object.keys(components)) {
        const component = components[type];
        const schema = component.constructor?.schema;
        if (!schema) continue;
        if (schema.width?.type !== 'number' || schema.height?.type !== 'number') continue;
        if (typeof component.width !== 'number' || typeof component.height !== 'number') continue;
        return component;
    }
    return null;
}

/**
 * Whether an object can be resized by its handles.
 * @param {object} object - The object
 * @returns {boolean} True when it has a size to change
 */
export function isResizable(object) {
    return sizingComponent(object) !== null;
}

/**
 * Everything a resize drag needs to remember at the moment it starts.
 *
 * Captured once rather than read per frame: reading the live size while writing it is
 * how a resize drifts, and the pointer's own starting position is the only fixed
 * reference the gesture has.
 *
 * @param {object} object - The object being resized
 * @param {object} handle - One of HANDLES
 * @param {{x: number, y: number}} pointerWorld - Where the drag began, in world space
 * @returns {object|null} The drag state, or null when the object has no size
 */
export function beginResize(object, handle, pointerWorld) {
    const component = sizingComponent(object);
    if (!component) return null;

    const transform = object.getComponent('Transform');
    if (!transform) return null;

    return {
        handle,
        component,
        transform,
        width: component.width,
        height: component.height,
        x: transform.x,
        y: transform.y,
        // World -> the object's own frame, and the object's frame -> the parent's. Both
        // fixed for the duration: the object's placement changes under us, so recomputing
        // them mid-drag would measure against a moving reference.
        toLocal: worldMatrix(object).invert(),
        toParent: localMatrix(object),
        origin: worldMatrix(object).invert().apply(pointerWorld.x, pointerWorld.y)
    };
}

/**
 * The size and position a resize drag has reached.
 *
 * Pure: it computes, the caller writes. That is what lets the eight directions be tested
 * without a canvas, and what keeps the choice of write path (`setProperty`, with a batch)
 * in the tool where it belongs.
 *
 * @param {object} drag - State from beginResize()
 * @param {{x: number, y: number}} pointerWorld - Where the pointer is now, in world space
 * @param {object} [options] - Options
 * @param {boolean} [options.round] - Snap the result to whole units
 * @returns {{width: number, height: number, x: number, y: number}} What to write
 */
export function resizeTo(drag, pointerWorld, { round = true } = {}) {
    const local = drag.toLocal.apply(pointerWorld.x, pointerWorld.y);
    const travelled = { x: local.x - drag.origin.x, y: local.y - drag.origin.y };

    // A handle that does not move along an axis contributes nothing to it, which is the
    // whole of the difference between 'right' and 'bottom-right'.
    const grown = {
        x: resizeAxis(drag.width, drag.handle.x, travelled.x, round),
        y: resizeAxis(drag.height, drag.handle.y, travelled.y, round)
    };

    // Half the size change, pushed the way the handle went: that is exactly what keeps
    // the opposite edge where it was, for a shape centred on its origin.
    const shift = {
        x: drag.handle.x * (grown.x - drag.width) / 2,
        y: drag.handle.y * (grown.y - drag.height) / 2
    };

    const moved = drag.toParent.apply(shift.x, shift.y);
    const still = drag.toParent.apply(0, 0);

    return {
        width: grown.x,
        height: grown.y,
        x: maybeRound(drag.x + moved.x - still.x, round),
        y: maybeRound(drag.y + moved.y - still.y, round)
    };
}

function resizeAxis(size, direction, travelled, round) {
    if (direction === 0) return size;

    const raw = size + direction * travelled;
    if (!round) return Math.max(MIN_SIZE, raw);

    // An even number of units, so that half of it — the distance the centre travels —
    // is a whole number and survives being written as an integer.
    const steps = Math.round((raw - size) / 2);
    return Math.max(smallest(size), size + steps * 2);
}

/**
 * The smallest size this axis may reach without breaking the parity it started with.
 * @param {number} size - The size the drag began at
 * @returns {number} MIN_SIZE, or one unit more when that is the wrong parity
 */
function smallest(size) {
    return isEven(size - MIN_SIZE) ? MIN_SIZE : MIN_SIZE + 1;
}

function isEven(value) {
    return Math.abs(value % 2) < Number.EPSILON;
}

function maybeRound(value, round) {
    return round ? Math.round(value) : value;
}
