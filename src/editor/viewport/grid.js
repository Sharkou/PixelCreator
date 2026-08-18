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
//
// HOW DENSE IT IS AT A GIVEN ZOOM IS NOT THIS FILE'S DECISION. It is `editor/grid.js`, and
// it is shared with the Graph canvas: two infinite planes a creator pans across must not
// disagree about what a plane looks like.

import { MAJOR_EVERY, adaptiveSpacing } from '../grid.js';

/** World units between the finest grid lines, before adaptive scaling. */
const BASE_SPACING = 32;

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
 * @param {number} [options.density] - Device pixels per CSS pixel
 */
export function drawGrid(renderer, view, {
    background = '#131418',
    minor = '#1c1e24',
    major = '#24272f',
    axis = '#343945',
    density = 1
} = {}) {
    renderer.clear(background);

    const scale = matrixScale(view);
    if (!(scale > 0)) return;

    const spacing = adaptiveSpacing(BASE_SPACING, scale, density);
    const area = visibleWorldArea(view, renderer.width, renderer.height);

    // One device pixel, expressed in the world units the transform is about to be set to.
    const thickness = 1 / scale;

    // Collected first, drawn second. The backend writes fillStyle on every call, so a
    // grid drawn in source order alternates between three colours a few hundred times
    // per frame; drawn in three passes it writes it three times. The pixels are
    // identical — minor, major and axis lines never overlap, because a position belongs
    // to exactly one of the three.
    const passes = [[], [], []];
    const push = (index, x, y, width, height) => passes[index].push(x, y, width, height);

    const firstColumn = Math.floor(area.left / spacing);
    const lastColumn = Math.ceil(area.right / spacing);
    for (let column = firstColumn; column <= lastColumn; column++) {
        const x = column * spacing;
        push(lineKind(column, x), x, area.top, thickness, area.bottom - area.top);
    }

    const firstRow = Math.floor(area.top / spacing);
    const lastRow = Math.ceil(area.bottom / spacing);
    for (let row = firstRow; row <= lastRow; row++) {
        const y = row * spacing;
        push(lineKind(row, y), area.left, y, area.right - area.left, thickness);
    }

    renderer.save();
    renderer.setTransform(view);

    const colors = [minor, major, axis];
    for (let kind = 0; kind < passes.length; kind++) {
        const rects = passes[kind];
        const color = colors[kind];
        for (let i = 0; i < rects.length; i += 4) {
            renderer.fillRect(rects[i], rects[i + 1], rects[i + 2], rects[i + 3], { color });
        }
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

/**
 * Which of the three passes a line belongs to.
 * @param {number} index - The line's index in the grid
 * @param {number} position - Its world coordinate
 * @returns {number} 0 minor, 1 major, 2 axis
 */
function lineKind(index, position) {
    if (position === 0) return 2;
    return index % MAJOR_EVERY === 0 ? 1 : 0;
}
