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

/** What one degree is worth in radians, since `rotationX` and `rotationY` are stored in degrees. */
const DEGREES_TO_RADIANS = Math.PI / 180;

export class Transform {

    static type = 'Transform';

    static exposes = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'rotationX', 'rotationY'];

    static schema = {
        x: { type: 'number', default: 0 },
        y: { type: 'number', default: 0 },
        rotation: { type: 'number', default: 0, unit: 'rad' },
        scaleX: { type: 'number', default: 1 },
        scaleY: { type: 'number', default: 1 },
        // TURNING OUT OF THE SCREEN, IN A RENDERER THAT HAS NO DEPTH (ADR-0050).
        //
        // `rotation` turns an object IN the plane and stays exactly what it was. These two
        // turn it OUT of the plane — and under the orthographic projection this renderer
        // already uses, that is not an approximation of anything: a rotation of θ about the
        // X axis maps (x, y, 0) to (x, y·cosθ, y·sinθ), and dropping z leaves (x, y·cosθ).
        // A vertical scale by cos θ IS the rotation, exactly.
        //
        // SO THESE ARE CONTINUOUS, AND THAT IS THE POINT. 45° is a card caught mid-turn, 90°
        // is its edge, 180° is its back. That 180° looks like a mirror is a consequence of
        // the cosine, not the model: nothing here is a flip with a longer name.
        //
        // DEGREES, STORED AS TYPED. `rotation` is kept in radians because it always was and
        // migrating it would rewrite every scene; these are new, so they hold the number a
        // creator wrote. The unit is declared for the suffix alone — `DISPLAY_UNITS` has no
        // entry for `°`, so the scale stays 1 and nothing is converted.
        rotationX: { type: 'number', default: 0, unit: '\u00b0' },
        rotationY: { type: 'number', default: 0, unit: '\u00b0' }
    };

    /**
     * Create a transform. All values are local, relative to the parent.
     * @param {number} [x] - Horizontal position
     * @param {number} [y] - Vertical position
     * @param {number} [rotation] - Rotation in radians
     * @param {number} [scaleX] - Horizontal scale factor
     * @param {number} [scaleY] - Vertical scale factor
     * @param {number} [rotationX] - Turn about the X axis, in degrees
     * @param {number} [rotationY] - Turn about the Y axis, in degrees
     */
    constructor(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1, rotationX = 0, rotationY = 0) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
        this.rotationX = rotationX;
        this.rotationY = rotationY;
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

    // THE ONE PLACE A TURN OUT OF THE PLANE BECOMES GEOMETRY (ADR-0050). Everything that
    // reads a placement — the renderer, picking, the camera — goes through `worldMatrix()`
    // and therefore through here, so it is composed once and nothing downstream learns a new
    // word. The pipeline is untouched: what leaves is the same affine 2x3 it always was.
    //
    // X TURNS ABOUT THE HORIZONTAL AXIS, SO IT FORESHORTENS THE VERTICAL ONE, and Y the
    // other way round. Reading it as "rotationX scales Y" looks like a transposition and is
    // not: an axis you turn about is the axis that keeps its length.
    return Matrix.compose(
        transform.x,
        transform.y,
        transform.rotation,
        transform.scaleX * foreshorten(transform.rotationY),
        transform.scaleY * foreshorten(transform.rotationX)
    );
}

/**
 * How much an axis is shortened by turning the object about the perpendicular one.
 *
 * `cos` OF THE ANGLE, AND NOTHING ELSE. Under an orthographic projection a turn of θ about
 * an axis leaves the perpendicular one measuring `cos θ` of what it did — 1 at rest, 0 edge
 * on, -1 showing its back. The sign is what makes 180° read as a mirror, which is a
 * consequence of the cosine rather than a case anybody wrote.
 *
 * @param {number} degrees - The turn, in degrees, as the model stores it
 * @returns {number} The factor to apply to the perpendicular axis
 */
function foreshorten(degrees) {
    const angle = typeof degrees === 'number' && Number.isFinite(degrees) ? degrees : 0;
    return Math.cos(angle * DEGREES_TO_RADIANS);
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
