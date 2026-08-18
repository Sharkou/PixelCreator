// How dense a grid is, at a given scale — the one law both infinite planes obey.
//
// TWO SURFACES, ONE PLANE. The Viewport draws a scene and the Graph draws a canvas, and a
// creator pans across both. They are both infinite planes, so they must not disagree about
// what a plane looks like: the same ratio of fine lines to emphasised ones, and the same
// answer to the question every infinite grid has to answer — what happens when you zoom
// out far enough that the lines would touch.
//
// THE ANSWER IS THE SPACING DOUBLES, and this file is the whole of it. Without it a fixed
// spacing turns to fog at low zoom and to three lines on screen at high zoom, which is what
// the Graph canvas did: its pattern was nailed to eight graph units at every zoom level.
//
// PURE, AND MEASURED IN CSS PIXELS. Expressed in device pixels the grid would be twice as
// dense on a 2x display as on a 1x one, for the same camera — the same scene looking
// different depending on the monitor, and drawing twice as many lines for the privilege.

/** How many fine lines make one emphasised line. */
export const MAJOR_EVERY = 4;

/** CSS pixels a spacing must stay within, so the grid is never fog and never three lines. */
export const MIN_SCREEN_SPACING = 14;
export const MAX_SCREEN_SPACING = 160;

/**
 * The spacing a grid draws at, given how far it is zoomed.
 *
 * Doubles and halves rather than interpolating: a grid whose spacing varies continuously
 * has no stable lines, so every wheel notch would shift every line by a fraction of a
 * pixel. Powers of two keep the emphasised lines on the same coordinates as the creator
 * zooms, which is what makes a grid readable as a measure rather than as a texture.
 *
 * @param {number} base - The finest spacing, in the plane's own units
 * @param {number} scale - Screen pixels per plane unit
 * @param {number} [density] - Device pixels per CSS pixel
 * @returns {number} The spacing to draw at, in the plane's own units
 */
export function adaptiveSpacing(base, scale, density = 1) {
    const perCss = scale / (density > 0 ? density : 1);
    if (!(base > 0) || !(perCss > 0)) return base;

    let spacing = base;
    while (spacing * perCss < MIN_SCREEN_SPACING) spacing *= 2;
    while (spacing * perCss > MAX_SCREEN_SPACING) spacing /= 2;
    return spacing;
}
