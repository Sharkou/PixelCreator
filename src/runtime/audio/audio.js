// The audio output contract — the second backend, and it is shaped like the first.
//
// NOTHING OUTSIDE A BACKEND KNOWS HOW A SOUND IS MADE. A component and a node receive an
// output and call these operations; whether they end up in an `HTMLAudioElement`, a Web
// Audio graph or nothing at all is the backend's business alone. That is the same seam
// `rendering/renderer.js` draws, and it is drawn again here for the same three reasons: the
// Core and the simulation stay free of the DOM, a server that arbitrates a game constructs
// a Runtime with no output and simply never sounds, and a test is a twenty-line literal
// rather than a mocked browser (ADR-0060 §5).
//
// A CLIP IS A ResourceId, AND THE BACKEND RESOLVES IT. The simulation names what it wants
// to hear by identity, exactly as `Sprite.source` names a picture (ADR-0020) — no Blob URL,
// no element and no bytes ever reach a Component, so nothing that could not be serialized
// gets near a value that is. Turning an identity into something a speaker can use needs the
// project's payloads, which is knowledge the application has and the Runtime must not: the
// backend is built with a resolver and the Runtime is handed the backend.
//
// A HANDLE IS OPAQUE AND IS NEVER SERIALIZED. `play()` answers something `stop()` and
// `set()` accept, and nothing else may be assumed about it. It lives in a Component's
// runtime state beside `Sprite.image`, absent from the schema, so a scene saved while music
// is playing carries `playing: true` and not a pointer to a sound that stopped existing.
//
// @typedef {object} AudioOutput
//
// @property {(clip: string, options?: object) => any} play
//     Start a sound. `{ volume, loop, rate }`, all optional. Answers a handle, or null when
//     there is nothing to play — an unknown clip, a browser that refused, a silent output.
//
// @property {(handle: any) => void} stop
//     Stop one sound. A handle that has already finished, or null, is not an error.
//
// @property {(handle: any, options: object) => void} set
//     Change a sounding sound: `{ volume, rate }`. This is what makes a fade a `Tween` on
//     `AudioSource.volume` rather than a feature of a mixer that does not exist.
//
// @property {() => void} unlock
//     Tell the output that a user gesture has happened, so a browser that refuses to sound
//     before one can start what it was asked for. The application calls it; the simulation
//     never does, because "has this person clicked yet" is not a fact about the game.
//
// WHAT IS DELIBERATELY NOT HERE: buses, groups, ducking, effects, panning, listeners and
// 3D attenuation. Each of them is a decision about a mixer, and a mixer is a product nobody
// has designed yet. The five things above are what a game that fires a shot and plays a
// tune actually needs.

/** Methods an audio backend must provide to satisfy the contract. */
export const AUDIO_OPERATIONS = globalThis.Object.freeze(['play', 'stop', 'set', 'unlock']);

/**
 * Check that a value implements the audio contract.
 *
 * @param {object} output - The candidate backend
 * @returns {string[]} The missing operation names, empty when the contract is satisfied
 */
export function missingAudioOperations(output) {
    if (!output || typeof output !== 'object') return [...AUDIO_OPERATIONS];
    return AUDIO_OPERATIONS.filter(name => typeof output[name] !== 'function');
}

/**
 * Throw unless a value implements the audio contract.
 * @param {object} output - The candidate backend
 * @returns {object} The output, unchanged
 */
export function assertAudioOutput(output) {
    const missing = missingAudioOperations(output);
    if (missing.length > 0) {
        throw new TypeError(`Audio output is missing required operations: ${missing.join(', ')}`);
    }
    return output;
}

/**
 * The clamp every backend and every caller applies to a volume.
 *
 * ONE RULE, READ FROM ONE PLACE. `AudioSource.volume` is declared `0 → 1` in its schema and
 * a `Play Sound` node takes a number off a wire, which no schema bounds — so a graph that
 * computes `health / 10` can hand over anything at all. Clamping in each of the three
 * places it arrives is how the three would come to disagree.
 *
 * @param {any} value - What was asked for
 * @param {number} [fallback] - What nothing at all means
 * @returns {number} A volume between 0 and 1
 */
export function volumeOf(value, fallback = 1) {
    const parsed = globalThis.Number(value);
    if (!globalThis.Number.isFinite(parsed)) return fallback;
    return Math.min(1, Math.max(0, parsed));
}

/**
 * An output that hears everything and plays nothing.
 *
 * WHAT IT IS FOR, AND IT IS NOT ONLY TESTS. A server arbitrating a game runs the same
 * graphs a player's browser does, and one of them says `Play Sound`; a Runtime built
 * without an output already answers that by doing nothing at all, and this exists for the
 * caller who would rather pass something than check for null. It also makes the contract
 * executable: a backend is measured against this shape, not against a description.
 */
export class SilentAudio {

    /**
     * Start a sound that nobody hears.
     * @param {string} clip - The ResourceId
     * @param {object} [options] - `{ volume, loop, rate }`
     * @returns {object|null} A handle, or null when there is no clip
     */
    play(clip, options = {}) {
        return clip ? { clip, ...options } : null;
    }

    /**
     * Stop one.
     * @param {any} handle - What `play()` answered
     */
    stop(handle) {}

    /**
     * Change one.
     * @param {any} handle - What `play()` answered
     * @param {object} options - `{ volume, rate }`
     */
    set(handle, options) {}

    /** Note that a user gesture has happened. */
    unlock() {}
}
