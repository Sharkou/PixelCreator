// What a turn of the wheel does to the zoom.
//
// Pure arithmetic, out of the element, for the reason the rest of `viewport/` already is
// (docs/architecture/EDITOR.md, decision 5): a number the creator can get stuck on is
// exactly the kind of thing that should be provable under Node rather than argued about
// in front of a canvas.
//
// A NOTCH MULTIPLIES, AND THAT PART WAS RIGHT. `zoom x e^(-deltaY x k)` makes the same
// turn of the wheel cover the same visual distance at 20% as at 400%, which is what every
// 2D editor does and what a linear step gets wrong at both ends.
//
// WHAT IT GETS WRONG IS 100%. The orbit of a multiplicative map does not contain 1 unless
// it started there. Measured on the previous implementation: sweeping the whole range one
// notch at a time — 42 notches from MIN_ZOOM to MAX_ZOOM — the zoom is never once exactly
// 1, and from a position reached by ordinary mixed scrolling the closest approach to 1 by
// scrolling towards it is 0.990446. `Math.round(zoom * 100)` then prints "100%" over a
// scene that is a percent off, so the readout hides the very thing that is wrong. It is
// also why the fault looks intermittent: scroll out N notches and back N notches and the
// factors cancel exactly, so it works — until anything at all happens in between.
//
// THE FIX IS A DETENT, NOT A CLAMP. A notch that would step across 1 lands on 1 instead;
// the next notch leaves normally, because a step that starts at 1 does not cross it. So
// 1:1 is always exactly one turn away from either side, nothing is sticky, and the value
// the renderer sees is the value the readout claims. The bounds stay where they were and
// are the only clamping there is.

/** How far out and how far in the view is allowed to go. */
export const MIN_ZOOM = 0.05;
export const MAX_ZOOM = 40;

/** The one zoom with a name: 1:1, one world unit to one CSS pixel. */
export const ZOOM_DETENT = 1;

/** Radians of wheel, roughly: how much of a notch one unit of deltaY is worth. */
const WHEEL_SENSITIVITY = 0.0016;

/**
 * Hold a zoom inside the bounds.
 *
 * @param {number} zoom - The candidate zoom
 * @returns {number} The zoom the camera may actually take
 */
export function clampZoom(zoom) {
    if (!Number.isFinite(zoom)) return ZOOM_DETENT;
    return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
}

/**
 * Where one turn of the wheel takes the zoom.
 *
 * Aimed from where the zoom is GOING rather than from where it is, so three quick notches
 * add up instead of fighting the ease already running — that is the caller's business, and
 * it passes `from` accordingly.
 *
 * @param {number} from - The zoom this notch starts from
 * @param {number} deltaY - The wheel event's deltaY; negative zooms in
 * @returns {number} The zoom to aim at, bounded, with the 100% detent applied
 */
export function notchZoom(from, deltaY) {
    const start = clampZoom(from);
    if (!Number.isFinite(deltaY) || deltaY === 0) return start;

    const next = clampZoom(start * Math.exp(-deltaY * WHEEL_SENSITIVITY));

    // Strictly across, so a notch that starts exactly on the detent is free to leave it.
    if ((start > ZOOM_DETENT && next < ZOOM_DETENT) || (start < ZOOM_DETENT && next > ZOOM_DETENT)) {
        return ZOOM_DETENT;
    }
    return next;
}
