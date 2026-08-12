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

export class Transform {

    static type = 'Transform';

    static exposes = ['x', 'y', 'rotation', 'scaleX', 'scaleY'];

    static schema = {
        x: { type: 'number', default: 0 },
        y: { type: 'number', default: 0 },
        rotation: { type: 'number', default: 0, unit: 'rad' },
        scaleX: { type: 'number', default: 1 },
        scaleY: { type: 'number', default: 1 }
    };

    /**
     * Create a transform. All values are local, relative to the parent.
     * @param {number} [x] - Horizontal position
     * @param {number} [y] - Vertical position
     * @param {number} [rotation] - Rotation in radians
     * @param {number} [scaleX] - Horizontal scale factor
     * @param {number} [scaleY] - Vertical scale factor
     */
    constructor(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) {
        this.x = x;
        this.y = y;
        this.rotation = rotation;
        this.scaleX = scaleX;
        this.scaleY = scaleY;
    }
}
