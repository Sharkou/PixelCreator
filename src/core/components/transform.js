// Transform — the object's local placement, as a component (ADR-0002).
//
// It holds the values; Object only exposes a facade. `object.x` and
// `object.getComponent('Transform').x` are the same storage read two ways, never two
// values that could drift. Legacy's `x -> _x -> __x` chain does not exist in v2.
//
// EVERY VALUE HERE IS LOCAL, relative to the parent.
//
// That is the whole user-facing model: `object.x` is where the object sits within its
// parent. There is deliberately no `localX` / `worldX` pair to keep straight — a
// creator manipulates one coordinate system, not two.
//
// The world transform is derived, not stored: the engine composes an object's local
// transform with its parents' when it needs to render or run physics. Being derived, it
// is never a second source of truth, is never serialized, and is never something the
// user has to keep in sync. Parenting an object therefore does not touch its stored
// values — unlike Legacy, which pushed a delta into every child on each move and left
// width and rotation inconsistent by not propagating them at all.
//
// Composition itself belongs to the runtime and arrives with the rendering pipeline.
// Nothing here has to change when it does.
//
// Size is not a transform. Width and height describe what is drawn or collided with, so
// they belong to the rendering and collision components rather than here.

import { Matrix } from '../math/matrix.js';

export class Transform {

    static type = 'Transform';

    static exposes = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'flipX', 'flipY'];

    static schema = {
        x: { type: 'number', default: 0 },
        y: { type: 'number', default: 0 },
        rotation: { type: 'number', default: 0, unit: 'rad' },
        scaleX: { type: 'number', default: 1 },
        scaleY: { type: 'number', default: 1 },
        // FACING IS NOT ROTATION, AND IT IS NOT A NEGATIVE SCALE EITHER (ADR-0047 §3).
        //
        // A 2D character that turns around does not rotate — it is MIRRORED, and the engine
        // stays strictly 2D: `rotation` remains one scalar and no third axis is invented.
        // What was missing is the word for the other half of "which way is this facing".
        //
        // TWO BOOLEANS AND NOT `scaleX < 0`. Reusing the sign would make one number answer
        // two questions — how big, and which way round — so a creator who scaled an object
        // to 2 and then flipped it would have to type -2 and remember why. They compose
        // instead: the scale says the size, the flip says the facing, and the matrix
        // multiplies them.
        flipX: { type: 'boolean', default: false },
        flipY: { type: 'boolean', default: false }
    };

    /**
     * Create a transform. All values are local, relative to the parent.
     * @param {number} [x] - Horizontal position
     * @param {number} [y] - Vertical position
     * @param {number} [rotation] - Rotation in radians
     * @param {number} [scaleX] - Horizontal scale factor
     * @param {number} [scaleY] - Vertical scale factor
     * @param {boolean} [flipX] - Mirror horizontally
     * @param {boolean} [flipY] - Mirror vertically
     */
    constructor(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, flipX = false, flipY = false) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.flipX = flipX;
        this.flipY = flipY;
    }
}

/**
 * The object's own placement, ignoring its parents.
 * @param {object} object - The object
 * @returns {Matrix} The local matrix, identity when the object has no Transform
 */
export function localMatrix(object) {
    const transform = object.getComponent('Transform');
    if (!transform) return Matrix.identity();
    // THE ONE PLACE A FLIP BECOMES GEOMETRY (ADR-0047 §3). Everything that reads a placement
    // — the renderer, picking, physics — goes through `worldMatrix()` and therefore through
    // here, so mirroring is composed once and nothing downstream learns a new word. A mirror
    // IS a negative scale in the matrix; what the model refuses is to make the creator write
    // it as one.
    return Matrix.compose(
        transform.x,
        transform.y,
        transform.rotation,
        transform.flipX ? -transform.scaleX : transform.scaleX,
        transform.flipY ? -transform.scaleY : transform.scaleY
    );
}

/**
 * The object's placement in the scene, composed with every parent above it.
 *
 * DERIVED, never stored. This is the read API the engine uses for rendering, physics
 * and picking; it is deliberately a function rather than a property on Object, so that
 * it can never be mistaken for a second position the user has to maintain. Mutation
 * stays on the local values: `object.x`, `object.y`, `object.rotation`, and so on.
 *
 * Recomputed on demand rather than cached: a cache would need invalidating on every
 * ancestor's every write, and the cost is one small matrix multiply per level of depth.
 *
 * @param {object} object - The object
 * @returns {Matrix} The world matrix
 */
export function worldMatrix(object) {
    let matrix = localMatrix(object);
    for (let parent = object.parent; parent; parent = parent.parent) {
        matrix = localMatrix(parent).multiply(matrix);
    }
    return matrix;
}

/**
 * The object's position in the scene.
 * @param {object} object - The object
 * @returns {{x: number, y: number}} The world position
 */
export function worldPosition(object) {
    const matrix = worldMatrix(object);
    return { x: matrix.e, y: matrix.f };
}
