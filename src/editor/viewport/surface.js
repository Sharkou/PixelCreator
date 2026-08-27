// How the viewport maps onto physical pixels.
//
// Two questions, both pure arithmetic, both previously answered wrong inside the element:
//
//   how many device pixels is this surface, exactly?
//   where may the camera sit so that world coordinates land on whole device pixels?
//
// WHY clientWidth WAS THE BUG. `clientWidth` is a rounded integer. A panel that lays out
// at 450.6 CSS px reports 451, and the backing store became `round(451 * dpr)`. On
// Windows at 125% or 150% — the two defaults — the backing store then covered a slightly
// different area than the element did, so the browser resampled the whole canvas on every
// frame. That is a permanent global blur, not a resize artefact, and no amount of
// rounding inside the renderer can undo it.
//
// `ResizeObserver` answers the question properly: `devicePixelContentBoxSize` is the
// content box measured in whole device pixels, which is exactly what a backing store
// must be. It is the only API that reports it, and when it is missing the fractional
// `contentBoxSize` (or the element's rectangle) times the ratio is the best available
// answer.
//
// THE SECOND NUMBER THAT MATTERS is the scale between the two. Everything the pointer
// produces is in CSS pixels and everything the canvas consumes is in device pixels, and
// the conversion has to be the true ratio `device / css` rather than `devicePixelRatio`.
// They differ whenever the device size was rounded, and that difference is the half pixel
// that pushed every edge of the scene into an antialiased seam.

import { screenToWorld } from '../../runtime/mod.js';

/**
 * Where a page coordinate falls, in the surface's own pixels.
 *
 * ONE RULE, ONE PLACE. The Viewport converts a pointer for its tools, its guides and its
 * zoom anchor, and the pointer adapter converts the same pointer for the running game
 * (`editor/input.js`). Two copies of `(client - rect) * scale` would be two chances to
 * disagree about where the pointer is, in the one file whose whole subject is that the
 * mapping is exact.
 *
 * @param {number} clientX - Horizontal page coordinate
 * @param {number} clientY - Vertical page coordinate
 * @param {object} rect - The surface's bounding rectangle
 * @param {object|null} metrics - The measurement, for the CSS-to-device ratio
 * @returns {[number, number]} The point in device pixels
 */
export function devicePoint(clientX, clientY, rect, metrics) {
    return [
        (clientX - (rect?.left ?? 0)) * (metrics?.scaleX ?? 1),
        (clientY - (rect?.top ?? 0)) * (metrics?.scaleY ?? 1)
    ];
}

/**
 * The two things a running game needs to know about a pointer (ADR-0038).
 *
 * THE WHOLE CHAIN, IN ONE READABLE PLACE:
 *
 *   PointerEvent.clientX/Y  →  the surface's top-left  →  device pixels  →  screenToWorld
 *
 * SCREEN IS IN CSS PIXELS, WORLD COMES FROM THE ENGINE'S OWN CONVERSION. The device step in
 * between is a fact about the canvas's backing store, not about the game: a creator's `.px`
 * must read the same numbers whether the Editor is on a Retina display or not, so what
 * leaves here is the CSS-pixel offset into the surface and the world point the engine's
 * `screenToWorld()` answers — never a device pixel, and never a page coordinate.
 *
 * IT IS PURE, WHICH IS WHY IT IS HERE AND NOT IN THE ELEMENT. The conversion is the one
 * part of the pointer path that can be wrong in a way no screenshot reveals, so it is
 * checked under Node against the very matrices the renderer draws with.
 *
 * @param {number} clientX - Horizontal page coordinate
 * @param {number} clientY - Vertical page coordinate
 * @param {object} context - `{ rect, metrics, view }` as the Viewport holds them
 * @returns {{screenX: number, screenY: number, worldX: number, worldY: number}} Both spaces
 */
export function locatePointer(clientX, clientY, { rect, metrics, view }) {
    const world = screenToWorld(view, ...devicePoint(clientX, clientY, rect, metrics));

    return {
        screenX: clientX - (rect?.left ?? 0),
        screenY: clientY - (rect?.top ?? 0),
        worldX: world.x,
        worldY: world.y
    };
}

/**
 * Measure a surface in both units.
 *
 * @param {object|null} entry - A ResizeObserverEntry, or null when measuring by hand
 * @param {object|null} rect - The element's bounding rectangle, used as the fallback
 * @param {number} [ratio] - devicePixelRatio at the moment of measuring
 * @returns {{cssWidth: number, cssHeight: number, deviceWidth: number, deviceHeight: number,
 *   scaleX: number, scaleY: number}} The surface, in CSS pixels, in device pixels, and the
 *   exact ratio between them
 */
export function measureSurface(entry, rect, ratio = 1) {
    const dpr = ratio > 0 && Number.isFinite(ratio) ? ratio : 1;

    // The CSS size is the real, fractional layout size. Reading it rounded is what
    // started the whole problem.
    const cssWidth = positive(axis(entry?.contentBoxSize, 'inlineSize') ?? rect?.width);
    const cssHeight = positive(axis(entry?.contentBoxSize, 'blockSize') ?? rect?.height);

    // Whole device pixels when the browser will tell us, the honest estimate otherwise.
    const exact = entry?.devicePixelContentBoxSize;
    const deviceWidth = positive(Math.round(axis(exact, 'inlineSize') ?? cssWidth * dpr));
    const deviceHeight = positive(Math.round(axis(exact, 'blockSize') ?? cssHeight * dpr));

    return {
        cssWidth,
        cssHeight,
        deviceWidth,
        deviceHeight,
        // The true ratio, not devicePixelRatio: composing the view with this puts the
        // centre of the view at exactly deviceWidth / 2, whatever rounding happened.
        scaleX: deviceWidth / cssWidth,
        scaleY: deviceHeight / cssHeight
    };
}

/**
 * Whether two measurements describe the same surface.
 *
 * Resizing a canvas clears it, so a resize that changed nothing is a frame thrown away.
 *
 * @param {object|null} a - A measurement
 * @param {object|null} b - Another measurement
 * @returns {boolean} True when the device size is unchanged
 */
export function sameSurface(a, b) {
    return Boolean(a) && Boolean(b)
        && a.deviceWidth === b.deviceWidth
        && a.deviceHeight === b.deviceHeight
        && a.scaleX === b.scaleX
        && a.scaleY === b.scaleY;
}

/**
 * The camera position that puts the world grid on whole device pixels.
 *
 * A camera at x = 137.4183 shifts every edge in the scene by a fraction of a pixel, and
 * the rasteriser answers with a grey seam on both sides of it. Snapping the point of view
 * — never the objects — removes that without touching a single value the Runtime owns:
 * the editor camera is an Editor-local Object that is never serialized and never
 * replicated (ADR-0013).
 *
 * Only applied once a world unit is worth at least one device pixel. Below that, one step
 * would be several world units and panning would visibly stutter, while nothing is crisp
 * at that scale anyway.
 *
 * @param {number} x - Camera world x
 * @param {number} y - Camera world y
 * @param {number} scale - Device pixels per world unit, i.e. matrixScale(view)
 * @returns {{x: number, y: number}} The position to write
 */
export function quantiseCamera(x, y, scale) {
    if (!Number.isFinite(scale) || scale < 1) return { x, y };
    if (!Number.isFinite(x) || !Number.isFinite(y)) return { x, y };
    return { x: Math.round(x * scale) / scale, y: Math.round(y * scale) / scale };
}

function axis(box, name) {
    // ResizeObserver reports an array; older implementations reported a bare object.
    if (!box) return null;
    const entry = Array.isArray(box) || typeof box.length === 'number' ? box[0] : box;
    const value = entry?.[name];
    return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function positive(value) {
    return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : 1;
}
