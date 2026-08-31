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

    static exposes = ['x', 'y', 'rotationX', 'rotationY', 'scaleX', 'scaleY'];

    static schema = {
        x: { type: 'number', default: 0 },
        y: { type: 'number', default: 0 },
        // ROTATION IS A PAIR, LIKE POSITION AND SCALE (ADR-0051). It was one scalar beside
        // two pairs, which made the panel read as three shapes for one idea. The Inspector
        // pairs `x`/`y` and `scaleX`/`scaleY` by declaration (inspector/schema.js, `PAIRS`),
        // so rotation joins that table rather than inventing a vector type — ADR-0023 §2
        // removed vectors from the Property System deliberately, and this needs none.
        //
        // X IS THE ROTATION THAT ALWAYS EXISTED: in the plane of the screen, like a clock
        // hand. Y turns the sprite about the vertical axis, out of the plane — which under
        // the orthographic projection this renderer already uses is exactly a horizontal
        // foreshortening by `cos`. Neither is an approximation of the other.
        //
        // BOTH IN RADIANS, because the first always was and migrating it would rewrite every
        // scene. One unit for one property: the Inspector converts both to degrees through
        // the same `DISPLAY_UNITS` entry, so a creator types 45 into either half.
        rotationX: { type: 'number', default: 0, unit: 'rad' },
        rotationY: { type: 'number', default: 0, unit: 'rad' },
        scaleX: { type: 'number', default: 1 },
        scaleY: { type: 'number', default: 1 }
    };

    /**
     * Read a Transform saved before rotation became a pair.
     *
     * A SCENE SAVED YESTERDAY CARRIES `rotation`, AND `reconcileValues()` DROPS WHAT THE
     * SCHEMA DOES NOT DECLARE — so without this an old project would open with every object
     * unrotated, silently. The rename is the whole migration: the value meant the in-plane
     * rotation then and means it now, in the same unit.
     *
     * DECLARED, NOT SPECIAL-CASED. `static migrate` is read by `reconcileValues()` for any
     * component that has one, so a shipped type can rename a property without every caller
     * of the serializer learning about it (ADR-0051 §3).
     *
     * @param {object} values - Serialized values, as they were written
     * @returns {object} The values this version of the schema understands
     */
    static migrate(values) {
        if (!values || !globalThis.Object.hasOwn(values, 'rotation')) return values;

        const { rotation, ...rest } = values;
        // A value the newer schema already carries wins: this only fills a gap.
        return globalThis.Object.hasOwn(rest, 'rotationX') ? rest : { ...rest, rotationX: rotation };
    }

    /**
     * Create a transform. All values are local, relative to the parent.
     * @param {number} [x] - Horizontal position
     * @param {number} [y] - Vertical position
     * THE SCHEMA'S ORDER IS NOT THIS ONE, AND THAT IS DELIBERATE. `rotationY` is declared
     * beside `rotationX` because the Inspector reads the schema to draw its rows, and comes
     * LAST here because the positional signature is a compatibility surface: every
     * `new Transform(x, y, rotation, scaleX, scaleY)` written before rotation became a pair
     * still means what it meant.
     *
     * @param {number} [rotationX] - Rotation in the plane of the screen, in radians
     * @param {number} [scaleX] - Horizontal scale factor
     * @param {number} [scaleY] - Vertical scale factor
     * @param {number} [rotationY] - Rotation about the vertical axis, in radians
     */
    constructor(x = 0, y = 0, rotationX = 0, scaleX = 1, scaleY = 1, rotationY = 0) {
        this.x = x;
        this.y = y;
        this.rotationX = rotationX;
        this.rotationY = rotationY;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
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

    // THE ONE PLACE THE PAIR BECOMES GEOMETRY (ADR-0051). Everything that reads a placement
    // — the renderer, picking, the camera — goes through `worldMatrix()` and therefore
    // through here, so it is composed once and nothing downstream learns a new word. The
    // pipeline is untouched: what leaves is the same affine 2x3 it always was.
    //
    // Y IS A HORIZONTAL FORESHORTENING, AND THAT IS NOT AN APPROXIMATION. Under the
    // orthographic projection this renderer already uses, turning by φ about the vertical
    // axis maps (x, y, 0) to (x·cos φ, y, -x·sin φ); dropping z leaves (x·cos φ, y). A
    // horizontal scale by cos φ IS that rotation, exactly — 1 at rest, 0 edge on at 90°,
    // -1 showing its back at 180°. That the back reads as a mirror is a consequence of the
    // cosine, not a case anybody wrote.
    return Matrix.compose(
        transform.x,
        transform.y,
        // X IS THE ROTATION THAT ALWAYS EXISTED, passed exactly where it always was.
        angle(transform.rotationX),
        transform.scaleX * Math.cos(angle(transform.rotationY)),
        transform.scaleY
    );
}

/**
 * An angle a Transform is holding, or zero when it is holding nothing usable.
 *
 * A Transform reached through a migration, or written by hand, may carry `undefined` where a
 * number belongs; `Math.cos(undefined)` is NaN, and a NaN in a matrix takes the object off
 * screen with nothing to show for it.
 *
 * @param {any} value - What the component holds
 * @returns {number} The angle in radians
 */
function angle(value) {
    return typeof value === 'number' && Number.isFinite(value) ? value : 0;
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
