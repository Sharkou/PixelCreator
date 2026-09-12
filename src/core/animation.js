// A sprite animation: a strip of a picture, and how fast to walk it (ADR-0062 §4).
//
// IT IS A RESOURCE, NOT A FIELD ON EVERY INSTANCE. Ten enemies playing `Walk` name one
// `Walk.animation`; retiming it retimes all ten, and an instance carries a `ResourceId`
// rather than a copy of the clip. That is the same argument ADR-0026 §1 makes for a `.px`
// carrying its own graph, and the same one ADR-0061 makes for a prefab: a description that
// several instances share belongs in the project, not in each of them.
//
// A REGULAR GRID, AND DELIBERATELY ONLY THAT. Frames are `frameWidth × frameHeight` cells
// read left to right and then top to bottom, starting at `first` and running for `count`.
// An atlas with arbitrary rectangles, a trim box, a per-frame pivot, a per-frame duration
// and an Aseprite importer are each a decision about a pipeline, and a pipeline is a product
// nobody has designed. What this ships is the shape every 2D sprite sheet in a tutorial has.
//
// IT COMPUTES A RECTANGLE AND NOTHING ELSE. No time, no state, no playhead: `frameAt()` is
// a pure function of the definition and an index, so the Core can answer it, a test can
// assert it, and the component that DOES hold a playhead (`runtime/components/...`) holds
// only a number.

/** Bumped when the shape below changes in a way an older reader cannot survive. */
export const ANIMATION_FORMAT = 1;

/**
 * Build an animation definition.
 *
 * @param {object} spec - The clip
 * @param {string} spec.source - ResourceId of the sheet
 * @param {number} [spec.frameWidth] - Cell width in pixels; the whole sheet when 0
 * @param {number} [spec.frameHeight] - Cell height in pixels; the whole sheet when 0
 * @param {number} [spec.count] - How many frames to play; 1 when unstated
 * @param {number} [spec.columns] - Cells per row of the sheet; 0 reads it as a single strip
 * @param {number} [spec.first] - Index of the first cell, counting across then down
 * @param {number} [spec.fps] - Frames per second
 * @param {boolean} [spec.loop] - Whether it starts again at the end
 * @returns {object} A plain, JSON-safe definition
 */
export function createAnimation({
    source = null,
    frameWidth = 0,
    frameHeight = 0,
    count = 1,
    columns = 0,
    first = 0,
    fps = 12,
    loop = true
} = {}) {
    return {
        version: ANIMATION_FORMAT,
        source,
        frameWidth: positive(frameWidth),
        frameHeight: positive(frameHeight),
        count: Math.max(1, Math.floor(positive(count) || 1)),
        // HOW WIDE THE SHEET IS, STATED BY WHOEVER MADE IT — never measured. Measuring would
        // mean asking the backend how many pixels across the decoded picture is, which would
        // make a frame rectangle depend on whether a decode had finished and would make this
        // module impure. A creator knows their sheet is four across; saying so once costs a
        // field and buys a pure, deterministic answer (ADR-0062 §4).
        columns: Math.max(0, Math.floor(positive(columns))),
        first: Math.max(0, Math.floor(positive(first))),
        // A CLIP WITH NO RATE IS A STILL, NOT A DIVISION BY ZERO. `fps: 0` is how a creator
        // says "hold this frame", and `frameAtTime()` reads it as exactly that.
        fps: Math.max(0, positive(fps)),
        loop: Boolean(loop)
    };
}

/**
 * Read a definition, or refuse it.
 *
 * A VERSION THIS BUILD DOES NOT KNOW IS REFUSED, like a graph from an unknown version
 * (ADR-0027), a bundle from one (preview/bundle.js) and a prefab from one (ADR-0061 §3).
 * It answers null rather than throwing: a clip that cannot be read is a state of the running
 * game, and an animator whose clip is unreadable simply does not animate.
 *
 * @param {object} definition - The payload
 * @returns {object|null} The definition, or null
 */
export function animationOf(definition) {
    if (!definition || definition.version !== ANIMATION_FORMAT) return null;
    if (!definition.source) return null;
    return definition;
}

/** How many frames a clip has, or 0 when it is not one. */
export function frameCount(definition) {
    return animationOf(definition)?.count ?? 0;
}

/**
 * The rectangle of the sheet one frame occupies.
 *
 * PURE, AND THAT IS THE WHOLE REASON `columns` IS DECLARED. Deriving the row from the decoded
 * sheet's width would make a frame rectangle depend on whether a decode had finished — the
 * same frame would be a different rectangle on the first frame and on the second — and would
 * put the renderer inside a Core function. The sheet's shape is a fact its author knows.
 *
 * A CLIP WITH NO CELL SIZE HAS NO RECTANGLE, which reads as "draw the whole picture": that is
 * how a still is expressed without a second shape for one.
 *
 * @param {object} definition - The payload
 * @param {number} index - Which frame, from 0
 * @returns {{x: number, y: number, width: number, height: number}|null} The rectangle
 */
export function frameAt(definition, index) {
    const clip = animationOf(definition);
    if (!clip) return null;
    if (clip.frameWidth <= 0 || clip.frameHeight <= 0) return null;

    const cell = clip.first + Math.max(0, Math.floor(index));
    const columns = clip.columns > 0 ? clip.columns : 0;

    const column = columns > 0 ? cell % columns : cell;
    const row = columns > 0 ? Math.floor(cell / columns) : 0;

    return {
        x: column * clip.frameWidth,
        y: row * clip.frameHeight,
        width: clip.frameWidth,
        height: clip.frameHeight
    };
}

/**
 * Which frame a clip is showing after a length of time, and whether it has finished.
 *
 * THE PLAYHEAD IS A NUMBER OF SECONDS, NOT A FRAME INDEX, and that is what keeps it
 * deterministic across frame rates: the same elapsed time gives the same frame on a machine
 * running at 30 and at 144, because the division happens once here rather than accumulating
 * a rounded index sixty times a second.
 *
 * A NON-LOOPING CLIP HOLDS ITS LAST FRAME AND REPORTS THAT IT IS DONE. It does not vanish
 * and it does not wrap: a death animation that snapped back to standing would be the one
 * failure nobody could miss.
 *
 * @param {object} definition - The payload
 * @param {number} elapsed - Seconds since the clip started
 * @returns {{index: number, finished: boolean}} Where the playhead is
 */
export function frameAtTime(definition, elapsed) {
    const clip = animationOf(definition);
    if (!clip) return { index: 0, finished: true };

    const seconds = globalThis.Number.isFinite(elapsed) && elapsed > 0 ? elapsed : 0;
    if (clip.fps <= 0 || clip.count <= 1) return { index: 0, finished: !clip.loop };

    const step = Math.floor(seconds * clip.fps);
    if (clip.loop) return { index: step % clip.count, finished: false };

    return step >= clip.count - 1
        ? { index: clip.count - 1, finished: true }
        : { index: step, finished: false };
}

/** How long a clip lasts, in seconds; 0 when it never ends or never advances. */
export function durationOf(definition) {
    const clip = animationOf(definition);
    if (!clip || clip.loop || clip.fps <= 0) return 0;
    return clip.count / clip.fps;
}

function positive(value) {
    const parsed = globalThis.Number(value);
    return globalThis.Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
}
