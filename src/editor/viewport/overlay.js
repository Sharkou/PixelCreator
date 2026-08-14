// What the Editor draws on top of the scene.
//
// Overlays are the Editor's, drawn after `Runtime.render()` on the same surface, and the
// runtime knows nothing about them. That is the boundary Legacy crossed the other way,
// with `Renderer.render()` importing `editor/system/dnd.js` to draw its selection —
// which is why a game could not run without an IDE loaded (tools/layers/rules.js still
// tracks it).
//
// Everything here goes through the same renderer contract as a game component. There is
// no editor-only drawing API and no second backend.
//
// WORLD SPACE DRAWS THE OBJECT. SCREEN SPACE DRAWS THE TOOLS. That line is the whole of
// this file, and it used to be drawn in only half of it: `handles()` already placed its
// squares through the matrices and then drew them flat, while `outline()` set the
// transform to `view x worldMatrix(object)` and tried to divide the object's own scale
// back out of a stroke width. One scalar cannot undo a transform that is not uniform.
// `matrixScale()` is `sqrt(|det|)` — the geometric mean of the two axis scales — so on an
// object scaled 1 x 4 it compensated by 2 in both directions, and measured against a
// 1.5 px target the outline came out 3 px on the horizontal edges and 0.75 px on the
// vertical ones, with the pivot cross at 3.5 px across and 14 px down. The cross was
// literally being stretched by the object it marks.
//
// So nothing here is drawn under the object's transform any more. Geometry is carried
// into device pixels by `matrix.apply()`, and every stroke is laid down flat, in the units
// it is specified in. Rotation, non-uniform scale, a scaled parent and camera zoom are all
// handled the same way: they move where a mark goes, never how big it is.
//
// SIZES ARE CSS PIXELS, SCALED BY DENSITY. `handles()` already worked this way and the
// outline did not, so on a 2x display the selection contour was drawn at half the visual
// weight of the handles sitting on it. One rule now: a number in this file is CSS pixels,
// and `scale` — device pixels per CSS pixel — is what turns it into what the canvas takes.

import { Matrix, worldMatrix } from '../../core/mod.js';
import { editorBounds } from './picking.js';
import { HANDLES } from './resize.js';

/** Side of a resize handle, in CSS pixels. */
export const HANDLE_SIZE = 7;

/** Half-length of the arms of the pivot cross, in CSS pixels. */
export const PIVOT_ARM = 7;

/** How far from a handle's centre a press still counts as grabbing it. */
export const HANDLE_REACH = 9;

/** The same, for a finger, which has no pixel to aim with. */
export const HANDLE_REACH_COARSE = 16;

/**
 * How many reaches the shorter side must span before handles appear at all.
 *
 * Derived, not chosen. The eight handles sit on the corners and the edge midpoints, so
 * two adjacent ones are half a side apart. For their round hit zones not to overlap that
 * spacing must be at least two reaches, which makes the side at least four — and the same
 * number leaves a central corridor two reaches wide, which is the area that has to keep
 * meaning "move me". Below it the handles would cover the object and it would become
 * impossible to drag, which is exactly what used to happen when zoomed out.
 */
export const HANDLE_MIN_REACHES = 4;

/** The Editor's accent, as the renderer contract takes colours: a literal. */
const ACCENT = '#ff7a45';

/** The fill of an idle handle — the deepest surface, so the accent outline reads. */
const HANDLE_FILL = '#101216';

/**
 * The four corners of an object's editorial box, in device pixels.
 *
 * The shape still follows the object exactly — a rotated object gets a rotated outline,
 * a non-uniformly scaled one gets the parallelogram it actually occupies — because the
 * corners go through the same matrix the renderer would have used. What does not follow
 * the object is anything measured in pixels, and that is the point of stopping here.
 *
 * @param {object} object - The object
 * @param {object} view - The view matrix in use
 * @returns {Array<{x: number, y: number}>|null} Corners clockwise from the box's origin,
 *   or null when the object has no drawable extent on screen
 */
export function outlinePoints(object, view) {
    const matrix = view.multiply(worldMatrix(object));
    const box = editorBounds(object);

    const corners = [
        matrix.apply(box.x, box.y),
        matrix.apply(box.x + box.width, box.y),
        matrix.apply(box.x + box.width, box.y + box.height),
        matrix.apply(box.x, box.y + box.height)
    ];

    for (const point of corners) {
        if (!Number.isFinite(point.x) || !Number.isFinite(point.y)) return null;
    }
    return corners;
}

/**
 * Outline an object, and optionally mark where its origin is.
 *
 * @param {object} renderer - The renderer backend
 * @param {object} view - The view matrix in use
 * @param {object} object - The object to outline
 * @param {object} [options] - Options
 * @param {string} [options.color] - Outline colour
 * @param {number} [options.alpha] - Outline opacity
 * @param {number} [options.width] - Outline width in CSS pixels
 * @param {boolean} [options.pivot] - Also mark the object's origin
 * @param {number} [options.scale] - Device pixels per CSS pixel
 */
export function outline(renderer, view, object, {
    color = ACCENT,
    alpha = 1,
    width = 1.5,
    pivot = false,
    scale = 1
} = {}) {
    const corners = outlinePoints(object, view);
    if (!corners) return;

    // At least one whole device pixel: an outline thinner than the raster is a grey haze
    // on both of its sides rather than a line, which is the same reason a handle is
    // rounded to whole pixels below.
    const thickness = Math.max(1, width * scale);

    renderer.save();

    for (let i = 0; i < corners.length; i++) {
        segment(renderer, corners[i], corners[(i + 1) % corners.length], { color, alpha, thickness });
    }

    if (pivot) {
        // The origin, not the middle of the box: the pivot is what the object rotates and
        // scales about, and on an object whose bounds are off-centre those are different
        // points. Flat on the surface, so the cross is a cross at every scale.
        const origin = view.multiply(worldMatrix(object)).apply(0, 0);
        if (Number.isFinite(origin.x) && Number.isFinite(origin.y)) {
            const arm = PIVOT_ARM * scale;
            renderer.setTransform(Matrix.identity());
            renderer.fillRect(origin.x - arm, origin.y - thickness / 2, arm * 2, thickness, { color, alpha });
            renderer.fillRect(origin.x - thickness / 2, origin.y - arm, thickness, arm * 2, { color, alpha });
        }
    }

    renderer.restore();
}

/**
 * Lay one straight mark down between two points on the surface.
 *
 * A filled rectangle under a rotate-and-translate transform, rather than a stroked path:
 * the transform carries no scale at all, so `thickness` is device pixels and stays device
 * pixels whatever the object, the camera or the parent chain are doing. It also needs
 * nothing the renderer contract does not already have (runtime/rendering/renderer.js) —
 * an editor-only drawing API is exactly what this file exists not to introduce.
 *
 * @param {object} renderer - The renderer backend
 * @param {{x: number, y: number}} from - Start, in device pixels
 * @param {{x: number, y: number}} to - End, in device pixels
 * @param {object} options - { color, alpha, thickness }
 */
function segment(renderer, from, to, { color, alpha, thickness }) {
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const length = Math.hypot(dx, dy);
    if (!(length > 0)) return;

    renderer.setTransform(new Matrix(dx / length, dy / length, -dy / length, dx / length, from.x, from.y));
    renderer.fillRect(0, -thickness / 2, length, thickness, { color, alpha });
}

/**
 * Where each resize handle sits on screen.
 *
 * Screen space, not local: a handle has to stay the same size however far the camera has
 * zoomed out, so it is placed by the matrices and then drawn flat.
 *
 * @param {object} object - The object
 * @param {object} view - The view matrix in use
 * @returns {object[]} One `{ handle, x, y }` per entry in HANDLES
 */
export function handlePoints(object, view) {
    const matrix = view.multiply(worldMatrix(object));
    const box = editorBounds(object);
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    return HANDLES.map(handle => {
        const point = matrix.apply(
            centre.x + handle.x * box.width / 2,
            centre.y + handle.y * box.height / 2
        );
        return { handle, x: point.x, y: point.y };
    });
}

/**
 * How long the object's two sides are on screen, in device pixels.
 *
 * Measured through the matrices rather than from the bounds, so rotation and a scaled
 * parent are included: what decides whether handles fit is what the creator sees, not
 * what the model says.
 *
 * @param {object} object - The object
 * @param {object} view - The view matrix in use
 * @returns {{x: number, y: number}} The two side lengths on screen
 */
export function screenSpan(object, view) {
    const matrix = view.multiply(worldMatrix(object));
    const box = editorBounds(object);

    const origin = matrix.apply(0, 0);
    const alongX = matrix.apply(box.width, 0);
    const alongY = matrix.apply(0, box.height);

    return {
        x: Math.hypot(alongX.x - origin.x, alongX.y - origin.y),
        y: Math.hypot(alongY.x - origin.x, alongY.y - origin.y)
    };
}

/**
 * Whether the object is big enough on screen for its handles to be usable.
 *
 * @param {object} object - The object
 * @param {object} view - The view matrix in use
 * @param {number} [reach] - Radius counting as a grab, in device pixels
 * @returns {boolean} True when handles should be offered
 */
export function handlesFit(object, view, reach = HANDLE_REACH) {
    const span = screenSpan(object, view);
    if (!Number.isFinite(span.x) || !Number.isFinite(span.y)) return false;
    return Math.min(span.x, span.y) >= reach * HANDLE_MIN_REACHES;
}

/**
 * Draw the resize handles.
 *
 * @param {object} renderer - The renderer backend
 * @param {object} view - The view matrix in use
 * @param {object} object - The object being handled
 * @param {object} [options] - Options
 * @param {object} [options.active] - The handle under the pointer, drawn filled
 * @param {number} [options.scale] - Device pixels per CSS pixel
 */
export function handles(renderer, view, object, { active = null, scale = 1 } = {}) {
    // A whole number of device pixels: HANDLE_SIZE x 1.25 is 8.75, and a handle drawn on
    // three quarters of a pixel is a grey smudge on both of its edges.
    const size = Math.max(3, Math.round(HANDLE_SIZE * scale));

    // Flat on the surface: handles keep their pixel size at any zoom.
    renderer.save();
    renderer.setTransform(Matrix.identity());

    for (const point of handlePoints(object, view)) {
        const highlighted = active === point.handle;
        // Whole device pixels, and no radius: a resize handle is the one control in the
        // Editor that is literally made of pixels, and a blurred one is a handle you
        // cannot tell you are on.
        const left = Math.round(point.x - size / 2);
        const top = Math.round(point.y - size / 2);
        renderer.fillRect(left, top, size, size, { color: highlighted ? ACCENT : HANDLE_FILL });
        renderer.strokeRect(left, top, size, size, { color: ACCENT, lineWidth: scale });
    }

    renderer.restore();
}

/**
 * The handle a screen point is grabbing, if any.
 *
 * @param {object} object - The object being handled
 * @param {object} view - The view matrix in use
 * @param {number} x - Horizontal screen coordinate
 * @param {number} y - Vertical screen coordinate
 * @param {number} [reach] - Radius counting as a grab, in device pixels
 * @returns {object|null} The handle, or null
 */
export function handleAt(object, view, x, y, reach = HANDLE_REACH) {
    let closest = null;
    let best = reach;

    for (const point of handlePoints(object, view)) {
        const distance = Math.hypot(point.x - x, point.y - y);
        if (distance <= best) {
            best = distance;
            closest = point.handle;
        }
    }
    return closest;
}

/**
 * The cursor a handle should show, turned with the object.
 *
 * A box rotated 90° still offers `ew-resize` on the handle that now points up, which
 * reads as a bug. The handle's actual direction on screen decides instead, snapped to the
 * four cursors a browser has.
 *
 * @param {object} handle - One of HANDLES
 * @param {object} object - The object being handled
 * @param {object} view - The view matrix in use
 * @returns {string} A CSS cursor
 */
export function handleCursor(handle, object, view) {
    const matrix = view.multiply(worldMatrix(object));
    const origin = matrix.apply(0, 0);
    const point = matrix.apply(handle.x, handle.y);

    const angle = Math.atan2(point.y - origin.y, point.x - origin.x);
    const eighth = Math.round((angle * 4) / Math.PI) & 7;

    // 0 = east, 1 = south-east, and so on clockwise; opposite directions share a cursor.
    return ['ew-resize', 'nwse-resize', 'ns-resize', 'nesw-resize'][eighth % 4];
}
