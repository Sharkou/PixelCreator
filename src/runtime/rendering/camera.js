// Camera — how the scene is looked at, and the view matrix that follows from it.
//
// A CAMERA IS AN ORDINARY OBJECT (ADR-0013). It sits in the world with a Transform like
// everything else: `camera.x`, `camera.y`, `camera.rotation` are its position and its
// rotation, read by exactly the same rules as any other object's. There is no second
// position API, no `camera.offset`, and nothing to keep in sync. Parent a camera to the
// player and it follows the player, because that is what parenting already means.
//
// The `Camera` component adds the one thing a transform cannot express: the lens.
//
// THE VIEW MATRIX IS DERIVED, NEVER STORED. It is built on demand from the camera's
// world matrix and the viewport, so it cannot drift from the camera the way a cached
// projection would. The renderer receives a matrix and knows nothing about cameras —
// which is what keeps `Core -> renderer` from ever existing.
//
//   view = centre(viewport) · zoom · inverse(worldMatrix(camera))
//
// Read it right to left: undo the camera's placement so the camera sits at the origin
// looking straight, apply the lens, then move the origin to the middle of the screen.
//
// The camera's own scale is part of its world matrix and is therefore inverted along
// with the rest — scaling a camera object up shows more of the world, which is what
// inverting a transform means. `zoom` is a separate, named multiplier because that is
// the control a creator and the Editor actually reach for; it is not a duplicate of
// scale, it composes with it.
//
// This file is not under `components/`: everything there draws, and a camera does not.
// It decides what is drawn.

import { Matrix } from '../../core/math/matrix.js';
import { worldMatrix } from '../../core/components/transform.js';

export class Camera {

    static type = 'Camera';

    static schema = {
        zoom: { type: 'number', default: 1, min: 0.01 }
    };

    /**
     * Create a camera lens.
     * @param {number} [zoom] - Magnification; above 1 moves closer, below 1 pulls back
     */
    constructor(zoom = 1) {
        this.zoom = zoom;
    }
}

/**
 * Build the view matrix a renderer needs from a camera and a viewport.
 *
 * @param {object|null} camera - The Object acting as the camera; null looks at the origin
 * @param {object} viewport - The viewport being drawn into
 * @returns {Matrix} The world-to-screen matrix
 */
export function viewMatrix(camera, viewport) {
    const centre = Matrix.compose(viewport.centerX, viewport.centerY);
    if (!camera) return centre;

    const zoom = camera.getComponent?.('Camera')?.zoom ?? 1;
    // Checked here rather than left to collapse. A zoom of zero still produces a
    // perfectly invertible camera matrix, so nothing would throw: the view would simply
    // squash the whole scene onto one point, and the only symptom would come much later,
    // out of screenToWorld, naming a matrix nobody wrote.
    if (typeof zoom !== 'number' || !Number.isFinite(zoom) || zoom <= 0) {
        throw new RangeError(`Camera: zoom must be a positive finite number, got ${zoom}`);
    }
    const lens = Matrix.compose(0, 0, 0, zoom, zoom);

    return centre.multiply(lens).multiply(worldMatrix(camera).invert());
}

/**
 * Convert a world point to screen space.
 * @param {Matrix} view - The view matrix
 * @param {number} x - Horizontal world coordinate
 * @param {number} y - Vertical world coordinate
 * @returns {{x: number, y: number}} The screen point
 */
export function worldToScreen(view, x, y) {
    return view.apply(x, y);
}

/**
 * Convert a screen point to world space.
 *
 * This is the first link of the Editor's picking chain — pointer position, then
 * screenToWorld, then whatever geometry a tool decides to test against. The rest of that
 * chain belongs to the Editor and is deliberately not built here: the runtime provides
 * the mapping, not the selection policy (ADR-0013).
 *
 * Inverts on each call. A tool testing many objects against one pointer should invert
 * once and reuse the matrix; that is a caller's optimisation, not a cache to hide here.
 *
 * @param {Matrix} view - The view matrix
 * @param {number} x - Horizontal screen coordinate
 * @param {number} y - Vertical screen coordinate
 * @returns {{x: number, y: number}} The world point
 */
export function screenToWorld(view, x, y) {
    return view.invert().apply(x, y);
}
