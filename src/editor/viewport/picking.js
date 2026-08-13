// Editor picking: which object is under the pointer.
//
// THIS IS NOT COLLISION, AND IT MUST NOT BECOME COLLISION. Three kinds of geometry stay
// distinct (core/component.js): what a game collides with, what a component draws, and
// what a creator can click on. Reusing a Collider here would make an object unselectable
// until it was given gameplay physics it does not want — a light, a spawn point, an empty
// grouping node — which is exactly the trap Legacy fell into by reading `Dnd.hovering`
// from inside the renderer.
//
// So an object always has an editorial extent:
//
//   - the union of what its components report through the optional `bounds(self)`
//     capability, when any of them has one;
//   - otherwise a fixed handle-sized square on its origin, so an object made of pure
//     logic is still a thing you can click.
//
// The test itself runs in the object's LOCAL space: the pointer is pushed through the
// inverse of `view · worldMatrix(object)`, so rotation, scale and parent composition are
// handled by the matrices instead of by special cases here.

import { worldMatrix } from '../../core/mod.js';

/**
 * Side, in local units, of the square an object with no geometry is picked by.
 *
 * Chosen to match the visual weight of an empty object's marker in the viewport: what
 * you see is what you can click.
 */
export const HANDLE_SIZE = 24;

/**
 * The area an object occupies for Editor purposes, in its own local space.
 *
 * @param {object} object - The object
 * @returns {{x: number, y: number, width: number, height: number}} The local bounds
 */
export function editorBounds(object) {
    const components = object.components;
    let box = null;

    for (const type of globalThis.Object.keys(components)) {
        const component = components[type];
        if (typeof component.bounds !== 'function') continue;

        const reported = component.bounds(object);
        if (!isBox(reported)) continue;

        box = box ? union(box, reported) : reported;
    }

    if (!box || box.width <= 0 || box.height <= 0) {
        return { x: -HANDLE_SIZE / 2, y: -HANDLE_SIZE / 2, width: HANDLE_SIZE, height: HANDLE_SIZE };
    }
    return box;
}

/**
 * Whether a screen point falls on an object.
 *
 * @param {object} object - The object to test
 * @param {object} view - The view matrix in use
 * @param {number} screenX - Horizontal screen coordinate
 * @param {number} screenY - Vertical screen coordinate
 * @returns {boolean} True when the point is on the object
 */
export function hitTest(object, view, screenX, screenY) {
    const toLocal = view.multiply(worldMatrix(object)).invert();
    const local = toLocal.apply(screenX, screenY);
    const box = editorBounds(object);

    return local.x >= box.x
        && local.y >= box.y
        && local.x <= box.x + box.width
        && local.y <= box.y + box.height;
}

/**
 * The topmost object under a screen point.
 *
 * Topmost means last drawn: the scene renderer sorts by `layer`, so picking walks the
 * same order backwards. An invisible or inactive object is not pickable — you cannot
 * click what you cannot see — and neither is a locked one, which is what `lock` is for.
 *
 * @param {object[]} objects - Candidate objects, in scene order
 * @param {object} view - The view matrix in use
 * @param {number} screenX - Horizontal screen coordinate
 * @param {number} screenY - Vertical screen coordinate
 * @returns {object|null} The object under the point, or null
 */
export function pick(objects, view, screenX, screenY) {
    // Topmost is the largest (layer, position) pair, which is what sorting by layer and
    // walking backwards found — the scene renderer's sort is stable, so equal layers keep
    // scene order. Reading it as a single pass costs no copy and no sort, and skips the
    // hit test entirely for anything that could not win anyway. This runs on every
    // pointer move over a whole scene, so the allocation was the expensive part.
    let found = null;
    let bestLayer = -Infinity;

    for (let i = 0; i < objects.length; i++) {
        const object = objects[i];
        if (!object.active || !object.visible || object.lock) continue;
        // Equal layers are decided by position, and i only ever grows, so a later object
        // always wins a tie: no comparison against the found index is needed.
        if (object.layer < bestLayer) continue;
        if (!hitTest(object, view, screenX, screenY)) continue;

        found = object;
        bestLayer = object.layer;
    }

    return found;
}

/**
 * The four corners of an object's editorial extent, in screen space.
 *
 * Returned as points rather than as a rectangle because a rotated object does not have
 * a screen-aligned one, and flattening it to its bounding box would draw an outline
 * that does not match what the creator sees.
 *
 * @param {object} object - The object
 * @param {object} view - The view matrix in use
 * @returns {{x: number, y: number}[]} The corners, clockwise from top-left
 */
export function screenCorners(object, view) {
    const matrix = view.multiply(worldMatrix(object));
    const { x, y, width, height } = editorBounds(object);

    return [
        matrix.apply(x, y),
        matrix.apply(x + width, y),
        matrix.apply(x + width, y + height),
        matrix.apply(x, y + height)
    ];
}

function isBox(box) {
    return Boolean(box)
        && globalThis.Number.isFinite(box.x)
        && globalThis.Number.isFinite(box.y)
        && globalThis.Number.isFinite(box.width)
        && globalThis.Number.isFinite(box.height);
}

function union(first, second) {
    const x = Math.min(first.x, second.x);
    const y = Math.min(first.y, second.y);
    return {
        x,
        y,
        width: Math.max(first.x + first.width, second.x + second.width) - x,
        height: Math.max(first.y + first.height, second.y + second.height) - y
    };
}
