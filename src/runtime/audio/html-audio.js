// The browser audio backend.
//
// This is the only file in the runtime that knows what an `HTMLAudioElement` is, the way
// `canvas2d.js` is the only one that knows what a canvas is. A Web Audio backend
// implements the same contract next to this one; nothing in the model, the components or
// the nodes changes when it does.
//
// WHY AN ELEMENT AND NOT `AudioContext`. An element takes the data URL the store already
// holds and plays it, with a volume, a loop and a rate, in four lines and with no decode
// step to schedule. A Web Audio graph buys sample-accurate scheduling, effects and mixing —
// all three of which are the product nobody has designed (ADR-0060 §5). The day one is
// designed, it is a second file here.
//
// THE AUTOPLAY RULE IS REAL AND IS NOT HIDDEN. Every current browser refuses to sound
// before the person has interacted with the page, and a `play()` that is refused rejects
// its promise rather than throwing — so a game that started its music on step one would
// simply be silent, with an unhandled rejection in the console and nothing else to go on.
// What happens instead:
//
//   the refusal is caught and counted, and the output says so through `blocked`
//   a SUSTAINED sound — one that loops — is remembered, and started by `unlock()`
//   a ONE-SHOT is dropped, because a gunshot from eight seconds ago is not a gunshot
//
// `unlock()` is called by the application on the first real input (preview/input.js). That
// is the honest shape of it: the simulation asked for a sound and got one as soon as the
// browser would allow it, and nothing in the graph had to know that browsers have rules.

import { assertAudioOutput, volumeOf } from './audio.js';

export class HtmlAudioOutput {

    #resolve;
    #create;
    #unlocked = false;
    #blocked = 0;
    /** The sustained sounds a browser refused, waiting for a gesture. */
    #deferred = new globalThis.Set();
    /** ResourceId -> the decoded source a new element is built from. */
    #sources = new globalThis.Map();

    /**
     * Create the backend.
     *
     * @param {object} options - Options
     * @param {Function} options.resolve - (ResourceId) => a URL an element can play, or null
     * @param {Function} [options.create] - Builds an element; `new Audio(src)` by default
     */
    constructor({ resolve, create } = {}) {
        if (typeof resolve !== 'function') {
            throw new TypeError('HtmlAudioOutput: a resolve(resourceId) function is required');
        }
        this.#resolve = resolve;
        // INJECTED SO THE BACKEND ITSELF IS TESTABLE. `new Audio()` is the one line that
        // needs a browser; handing it in means the autoplay policy, the deferral and the
        // volume clamp are all verified under Node against an element that counts calls,
        // rather than described in a comment and hoped for.
        // AND A HOST WITH NO AUDIO AT ALL IS NOT A CRASH. `globalThis.Audio` is absent on a
        // server, in a worker and under Node; a game that asked for a sound there gets
        // nothing back, which is the same answer an unknown clip already gives.
        this.#create = create ?? (source => (typeof globalThis.Audio === 'function'
            ? new globalThis.Audio(source)
            : null));
    }

    /** How many sounds a browser has refused so far, because the person had not clicked. */
    get blocked() {
        return this.#blocked;
    }

    /** Whether a user gesture has been seen, so sound is allowed. */
    get unlocked() {
        return this.#unlocked;
    }

    /**
     * Start a sound.
     *
     * ONE ELEMENT PER SOUND, NOT ONE PER CLIP. Two shots fired in the same second have to
     * overlap, and an element rewound to zero cuts the first one off — which is exactly
     * what a shared element does and exactly what it sounds like.
     *
     * @param {string} clip - The ResourceId of an audio asset
     * @param {object} [options] - `{ volume, loop, rate }`
     * @returns {object|null} A handle, or null when there is nothing to play
     */
    play(clip, { volume = 1, loop = false, rate = 1 } = {}) {
        const source = this.#sourceOf(clip);
        if (!source) return null;

        const element = this.#create(source);
        if (!element) return null;

        element.volume = volumeOf(volume);
        element.loop = Boolean(loop);
        if (typeof rate === 'number' && globalThis.Number.isFinite(rate) && rate > 0) {
            element.playbackRate = rate;
        }

        const handle = { clip, element, loop: Boolean(loop) };
        this.#start(handle);
        return handle;
    }

    /**
     * Stop one sound.
     * @param {any} handle - What `play()` answered
     */
    stop(handle) {
        if (!handle?.element) return;

        this.#deferred.delete(handle);
        try {
            handle.element.pause();
            handle.element.currentTime = 0;
        } catch {
            // An element that was never able to start refuses to be rewound. Stopping a
            // sound that is not sounding is what was asked for, so there is nothing to
            // report and nothing to repair.
        }
    }

    /**
     * Change a sounding sound.
     * @param {any} handle - What `play()` answered
     * @param {object} options - `{ volume, rate }`
     */
    set(handle, { volume, rate } = {}) {
        if (!handle?.element) return;

        if (volume !== undefined) handle.element.volume = volumeOf(volume);
        if (typeof rate === 'number' && globalThis.Number.isFinite(rate) && rate > 0) {
            handle.element.playbackRate = rate;
        }
    }

    /**
     * Note that a user gesture has happened, and start what was waiting for it.
     *
     * Idempotent and cheap: the application calls it on every early input rather than
     * tracking whether it has already done so.
     */
    unlock() {
        this.#unlocked = true;
        if (this.#deferred.size === 0) return;

        const waiting = [...this.#deferred];
        this.#deferred.clear();
        for (const handle of waiting) this.#start(handle);
    }

    /** Stop everything and forget the resolved sources. */
    dispose() {
        for (const handle of this.#deferred) this.stop(handle);
        this.#deferred.clear();
        this.#sources.clear();
    }

    #start(handle) {
        let started = null;
        try {
            started = handle.element.play();
        } catch {
            this.#refused(handle);
            return;
        }

        // `play()` answers a promise in every current engine and nothing in older ones.
        if (started && typeof started.catch === 'function') {
            started.catch(() => this.#refused(handle));
        }
    }

    #refused(handle) {
        this.#blocked++;
        // A LOOP IS A STATE, A ONE-SHOT IS A MOMENT. The first is still true once the
        // person clicks; the second was true eight seconds ago and playing it now would be
        // a sound with no cause on screen.
        if (handle.loop && !this.#unlocked) this.#deferred.add(handle);
    }

    #sourceOf(clip) {
        if (!clip) return null;
        if (this.#sources.has(clip)) return this.#sources.get(clip);

        // RESOLVED ONCE PER CLIP, INCLUDING THE ANSWER "there is no such sound". A data URL
        // is a long string and a project may fire the same shot a hundred times a minute;
        // caching the lookup costs one map entry and saves a hundred payload reads.
        const source = this.#resolve(clip) ?? null;
        this.#sources.set(clip, source);
        return source;
    }
}

// The backend answers the contract, checked here rather than described: a typo in a method
// name would otherwise surface as a silent game.
assertAudioOutput(HtmlAudioOutput.prototype);
