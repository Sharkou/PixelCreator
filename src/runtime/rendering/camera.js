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
 * Which Object of a scene a game looks through.
 *
 * THE FIRST ELIGIBLE CAMERA IN CANONICAL ORDER, and every word of that is an existing
 * contract rather than a new one:
 *
 *   canonical order   `findByComponent()` answers in hierarchy order — roots in their
 *                     order, depth first under each — which is the one order that is a
 *                     function of the scene's STATE rather than of its history (ADR-0034
 *                     §3.1). `Runtime.step()` runs in it and `SceneRenderer` draws in it.
 *   eligible          the same two questions the renderer asks of everything it draws and
 *                     the runtime asks of everything it runs: is the Object active, and is
 *                     this component switched on (ADR-0004, ADR-0012).
 *   the first         no priority, no `main`, no `primary`. Picking one of several cameras
 *                     is a product feature nobody has designed; what this fixes is that the
 *                     answer used to depend on the order objects happened to JOIN the scene.
 *
 * THE BUG IT CLOSES, EXACTLY. `preview/client.js` read `scene.objects()`, whose order is a
 * fact about how a scene was BUILT: a reparent leaves it behind, a reload rewrites it from
 * the payload, and a deletion undone puts the object back at the end. Two clients holding
 * the very same scene — one loaded from a snapshot, one that had been edited into that state
 * — could therefore look through two different cameras, and nothing on screen would say why.
 * It is the same defect ADR-0034 §3.1 measured on `findByTag`, one consumer later.
 *
 * NOTHING ELIGIBLE READS AS NO CAMERA, deliberately. A scene with no camera is playable and
 * centred (`viewMatrix` says so itself), and a scene whose only camera has been switched off
 * is the same statement made on purpose — falling back to it would make `active` mean nothing
 * on the one component where it is the obvious way to cut between two shots.
 *
 * @param {object} scene - The scene to look through
 * @returns {object|null} The Object carrying the camera, or null
 */
export function activeCamera(scene) {
    const cameras = scene?.findByComponent?.(Camera.type) ?? [];

    return cameras.find(object => object.active
        && object.getComponent?.(Camera.type)?.active !== false) ?? null;
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
