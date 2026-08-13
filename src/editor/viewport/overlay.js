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

import { worldMatrix } from '../../core/mod.js';
import { editorBounds } from './picking.js';
import { matrixScale } from './grid.js';

/** Size of the pivot marker, in device pixels. */
const PIVOT_SIZE = 7;

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
        const arm = PIVOT_SIZE / scale;
        const thickness = 1 / scale;
        renderer.fillRect(-arm, -thickness / 2, arm * 2, thickness, { color, alpha });
        renderer.fillRect(-thickness / 2, -arm, thickness, arm * 2, { color, alpha });
    }

    renderer.restore();
}
