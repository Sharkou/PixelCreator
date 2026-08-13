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

import { Matrix, worldMatrix } from '../../core/mod.js';
import { editorBounds } from './picking.js';
import { matrixScale } from './grid.js';
import { HANDLES } from './resize.js';

/** Side of a resize handle, in screen pixels. */
export const HANDLE_SIZE = 7;

/** How far from a handle's centre a press still counts as grabbing it. */
export const HANDLE_REACH = 9;

/** The same, for a finger, which has no pixel to aim with. */
export const HANDLE_REACH_COARSE = 16;

/**
 * Outline an object.
 *
 * Drawn in the object's own space, so a rotated or scaled object gets an outline that
 * follows it instead of a screen-aligned box around it. The stroke width is divided back
 * out of the transform, so it stays one pixel whatever the zoom.
 *
 * @param {object} renderer - The renderer backend
 * @param {object} view - The view matrix in use
 * @param {object} object - The object to outline
 * @param {object} [options] - Options
 * @param {string} [options.color] - Outline colour
 * @param {number} [options.alpha] - Outline opacity
 * @param {number} [options.width] - Outline width in device pixels
 * @param {boolean} [options.pivot] - Also mark the object's origin
 */
export function outline(renderer, view, object, { color = '#339af0', alpha = 1, width = 1.5, pivot = false } = {}) {
    const matrix = view.multiply(worldMatrix(object));
    const scale = matrixScale(matrix);
    if (!(scale > 0)) return;

    const box = editorBounds(object);

    renderer.save();
    renderer.setTransform(matrix);
    renderer.strokeRect(box.x, box.y, box.width, box.height, {
        color,
        alpha,
        lineWidth: width / scale
    });

    if (pivot) {
        const arm = 7 / scale;
        const thickness = 1 / scale;
        renderer.fillRect(-arm, -thickness / 2, arm * 2, thickness, { color, alpha });
        renderer.fillRect(-thickness / 2, -arm, thickness, arm * 2, { color, alpha });
    }

    renderer.restore();
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
    const size = HANDLE_SIZE * scale;

    // Flat on the surface: handles keep their pixel size at any zoom.
    renderer.save();
    renderer.setTransform(Matrix.identity());

    for (const point of handlePoints(object, view)) {
        const highlighted = active === point.handle;
        renderer.fillRect(point.x - size / 2, point.y - size / 2, size, size, {
            color: highlighted ? '#339af0' : '#0e0e10'
        });
        renderer.strokeRect(point.x - size / 2, point.y - size / 2, size, size, {
            color: '#339af0',
            lineWidth: scale
        });
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
