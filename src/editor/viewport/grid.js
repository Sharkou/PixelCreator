// The viewport grid.
//
// Drawn through the ordinary renderer contract — `setTransform` and `fillRect`, nothing
// added to it — on a canvas of its own beneath the scene. The separate surface is what
// lets the grid exist at all: `SceneRenderer.render()` starts by clearing, so anything
// drawn under the scene on the same canvas would be wiped a frame later. Two stacked
// canvases cost one extra context and keep the runtime untouched.
//
// Because it is drawn in world space, the grid pans, zooms and rotates with the camera
// for free, instead of being a screen-space pattern that only holds together while the
// camera is upright.

/** World units between the finest grid lines, before adaptive scaling. */
const BASE_SPACING = 32;

/** Screen pixels a spacing must stay within, so the grid never turns into a fog. */
const MIN_SCREEN_SPACING = 14;
const MAX_SCREEN_SPACING = 160;

/** How many fine lines make one emphasised line. */
const MAJOR_EVERY = 4;

/**
 * Draw the grid and the world axes.
 *
 * @param {object} renderer - The renderer backend to draw into
 * @param {object} view - The view matrix in use
 * @param {object} [options] - Options
 * @param {string} [options.background] - Colour the surface is filled with first
 * @param {string} [options.minor] - Colour of the fine lines
 * @param {string} [options.major] - Colour of the emphasised lines
 * @param {string} [options.axis] - Colour of the x = 0 and y = 0 lines
 */
export function drawGrid(renderer, view, {
    background = '#17171a',
    minor = '#212127',
    major = '#2a2a32',
    axis = '#3a3a46'
} = {}) {
    renderer.clear(background);

    const scale = matrixScale(view);
    if (!(scale > 0)) return;

    const spacing = adaptiveSpacing(scale);
    const area = visibleWorldArea(view, renderer.width, renderer.height);

    // One device pixel, expressed in the world units the transform is about to be set to.
    const thickness = 1 / scale;

    renderer.save();
    renderer.setTransform(view);

    const firstColumn = Math.floor(area.left / spacing);
    const lastColumn = Math.ceil(area.right / spacing);
    for (let column = firstColumn; column <= lastColumn; column++) {
        const x = column * spacing;
        renderer.fillRect(x, area.top, thickness, area.bottom - area.top, {
            color: lineColor(column, x, minor, major, axis)
        });
    }

    const firstRow = Math.floor(area.top / spacing);
    const lastRow = Math.ceil(area.bottom / spacing);
    for (let row = firstRow; row <= lastRow; row++) {
        const y = row * spacing;
        renderer.fillRect(area.left, y, area.right - area.left, thickness, {
            color: lineColor(row, y, minor, major, axis)
        });
    }

    renderer.restore();
}

/**
 * The uniform scale a matrix applies, as a single number.
 * @param {object} matrix - The matrix
 * @returns {number} Screen pixels per world unit
 */
export function matrixScale(matrix) {
    return Math.sqrt(Math.abs(matrix.a * matrix.d - matrix.b * matrix.c));
}

/**
 * The world-space rectangle a surface currently shows.
 *
 * Computed from the four screen corners rather than from width and height alone, so a
 * rotated camera still reports an area that covers what is on screen.
 *
 * @param {object} view - The view matrix in use
 * @param {number} width - Surface width in device pixels
 * @param {number} height - Surface height in device pixels
 * @returns {{left: number, top: number, right: number, bottom: number}} The area
 */
export function visibleWorldArea(view, width, height) {
    const inverse = view.invert();
    const corners = [
        inverse.apply(0, 0),
        inverse.apply(width, 0),
        inverse.apply(width, height),
        inverse.apply(0, height)
    ];

    return {
        left: Math.min(...corners.map(point => point.x)),
        right: Math.max(...corners.map(point => point.x)),
        top: Math.min(...corners.map(point => point.y)),
        bottom: Math.max(...corners.map(point => point.y))
    };
}

function adaptiveSpacing(scale) {
    let spacing = BASE_SPACING;
    while (spacing * scale < MIN_SCREEN_SPACING) spacing *= 2;
    while (spacing * scale > MAX_SCREEN_SPACING) spacing /= 2;
    return spacing;
}

function lineColor(index, position, minor, major, axis) {
    if (position === 0) return axis;
    return index % MAJOR_EVERY === 0 ? major : minor;
}
