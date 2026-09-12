// Turning a ResourceId into something a backend can draw, once (ADR-0062).
//
// THE THIRD USE OF ONE SEAM, NOT A THIRD SEAM. `AudioOutput` is built with a resolver and
// the Runtime is handed the output (ADR-0060 §5); `PrefabRegistry` is filled before the
// simulation and the Runtime is handed the map (ADR-0061 §4). This is the same sentence for
// pictures: the application owns the payloads, hands over a resolver, and what the
// simulation holds answers synchronously.
//
// WHAT WAS ACTUALLY BROKEN. `Sprite.source` held a `ResourceId` and `Sprite.image` held
// `null`, and nothing in the repository ever closed the gap — so a Sprite drew nothing,
// anywhere, in every build since it was written. The missing half was never the Component:
// it was this file.
//
// A RESOURCE IS RESOLVED BY THE BACKEND, NOT CARRIED BY THE COMPONENT. `drawImage()` takes
// the identity and the backend answers for it, which is what lets a Canvas 2D backend hold
// an `ImageBitmap` and a WebGL backend hold a GL texture without either of them appearing in
// a Component, in a scene payload or on a wire. A decoded `ImageBitmap` in `Sprite.image`
// was a Canvas-2D-shaped value living in the model, and it could never have been serialized.
//
// DECODING IS ASYNCHRONOUS AND DRAWING IS NOT, AND THAT IS THE WHOLE DESIGN. `get()` answers
// what is decoded RIGHT NOW — the image, or null — and starts the decode the first time it
// is asked. A frame that arrives before the picture does draws nothing and the next one
// draws it; nothing waits, nothing blocks, and `draw()` reaches no storage. `preload()`
// exists so an application that CAN wait (opening a bundle, pressing Play) waits once, up
// front, and the first frame is already complete.
//
// A HOST WITH NO IMAGE API IS NOT A CRASH. A server arbitrating a game, a worker, Node:
// `createImageBitmap` is absent and every `get()` answers null. The simulation is identical
// and nothing is drawn — the same statement `SilentAudio` makes about sound.

/**
 * What a decoder must do: turn a stored payload into something a backend can draw.
 *
 * @typedef {Function} ImageDecoder
 * @param {any} payload - Whatever the store holds: a data URL, a Blob, raw bytes
 * @returns {Promise<object|null>} The decoded image, or null when this host cannot decode
 */

/** How a cached entry is doing. */
const State = {
    LOADING: 'loading',
    READY: 'ready',
    FAILED: 'failed'
};

export class ImageCache {

    #resolve;
    #onArrival = null;
    #decode;
    #entries = new globalThis.Map();

    /**
     * Create the cache.
     *
     * @param {object} options - Options
     * @param {Function} options.resolve - (ResourceId) => the stored payload, or a promise of
     *   one, or null. IT MAY BE ASYNCHRONOUS, and that is the difference from the audio
     *   output's resolver: a sound is started from inside a step and must answer now, while a
     *   picture is decoded off the frame path anyway. So the Editor hands over
     *   `project.read` itself and no payload is mirrored into a second map (ADR-0062 §2).
     * @param {ImageDecoder} [options.decode] - Turns a payload into a drawable image
     * @param {Function} [options.onArrival] - Called with the ResourceId when a decode lands,
     *   for a caller that draws on demand rather than every frame
     */
    constructor({ resolve, decode, onArrival = null } = {}) {
        if (typeof resolve !== 'function') {
            throw new TypeError('ImageCache: a resolve(resourceId) function is required');
        }
        this.#resolve = resolve;
        // WHO TO TELL WHEN A PICTURE LANDS (ADR-0070 §5). A game client draws every frame and
        // never needs to be told; an Editor surface draws only when something changed, and a
        // decode finishing IS something changing. Optional, because the caller that does not
        // care must not pay for it.
        this.#onArrival = onArrival;
        // INJECTED SO THE CACHE ITSELF IS TESTABLE. `createImageBitmap` is the one line that
        // needs a browser; handing it in means the caching, the invalidation, the failure
        // path and the "no image API at all" path are all verified under Node against a
        // decoder that counts calls, rather than described in a comment and hoped for.
        this.#decode = decode ?? defaultDecoder();
    }

    /**
     * The decoded image for a resource, or null.
     *
     * SYNCHRONOUS, ALWAYS, AND IT STARTS THE WORK. Null means one of four things and the
     * caller treats them alike: nothing is pointed at, the payload is not in this project,
     * the decode has not finished, or it failed. A frame draws what it has.
     *
     * @param {string} id - The image's ResourceId
     * @returns {object|null} The decoded image, or null
     */
    get(id) {
        if (!id) return null;

        const entry = this.#entries.get(id);
        if (entry) return entry.state === State.READY ? entry.image : null;

        // ASKED FOR THE FIRST TIME: start the decode and answer null for this frame. The
        // entry is recorded BEFORE the promise is awaited, so a hundred Sprites pointed at
        // one picture start one decode between them.
        this.load(id);
        return null;
    }

    /**
     * The natural pixel size of a resource, or null when it is not decoded yet.
     *
     * READ OFF THE DECODED IMAGE, NEVER PARSED. Both `ImageBitmap` and `HTMLImageElement`
     * carry their own size, so there is no second reader of image headers here and no way
     * for it to disagree with what is actually drawn (`project/image.js` parses headers for
     * the Inspector, which has no decoder and must not need one).
     *
     * @param {string} id - The image's ResourceId
     * @returns {{width: number, height: number}|null} Its size, or null
     */
    size(id) {
        const image = this.get(id);
        if (!image) return null;

        const width = globalThis.Number(image.width) || 0;
        const height = globalThis.Number(image.height) || 0;
        return width > 0 && height > 0 ? { width, height } : null;
    }

    /**
     * Decode one resource, and answer when it is ready.
     *
     * Idempotent: asking twice while a decode is in flight awaits the same one.
     *
     * @param {string} id - The image's ResourceId
     * @returns {Promise<object|null>} The decoded image, or null
     */
    load(id) {
        if (!id) return globalThis.Promise.resolve(null);

        const existing = this.#entries.get(id);
        if (existing) return existing.done;

        const entry = { state: State.LOADING, image: null, done: null };
        this.#entries.set(id, entry);

        entry.done = globalThis.Promise.resolve()
            .then(() => this.#resolve(id))
            .then(payload => {
                // A RESOURCE THAT IS NOT THERE IS REMEMBERED AS NOT THERE. Without this, a
                // Sprite pointed at a deleted picture would ask the project sixty times a
                // second for ever.
                if (payload === null || payload === undefined) return null;
                return this.#decode(payload);
            })
            .then(image => {
                // INVALIDATED WHILE IT DECODED: the entry in the map is no longer this one,
                // so the picture that just finished belongs to nobody. Closing it here is
                // what stops a rename-and-replace from leaking one bitmap per edit.
                if (this.#entries.get(id) !== entry) {
                    close(image);
                    return null;
                }
                entry.state = image ? State.READY : State.FAILED;
                entry.image = image ?? null;
                // A surface that only draws when something changed has to be told that
                // something changed (ADR-0070 §5). ISOLATED, because a listener that throws
                // must not reach the `catch` below and mark a perfectly good picture as
                // failed — which would lose it for the rest of the session (ADR-0012).
                if (entry.image) {
                    try {
                        this.#onArrival?.(id);
                    } catch {
                        // Whoever wanted to know had a problem of their own.
                    }
                }
                return entry.image;
            })
            .catch(() => {
                // A BROKEN PICTURE IS A STATE OF THE PROJECT, NOT A CRASH (ADR-0012). It is
                // remembered as failed so it is attempted once, and the Sprite draws nothing.
                if (this.#entries.get(id) === entry) {
                    entry.state = State.FAILED;
                    entry.image = null;
                }
                return null;
            });

        return entry.done;
    }

    /**
     * Decode a set of resources, and answer when all of them are done.
     *
     * WHAT AN APPLICATION THAT MAY WAIT DOES ONCE. Opening a bundle and pressing Play are
     * both moments where waiting is allowed and a missing first frame is not; every other
     * caller relies on `get()` filling in as decodes land.
     *
     * @param {Iterable<string>} ids - The ResourceIds to decode
     * @returns {Promise<number>} How many are decoded and usable
     */
    async preload(ids) {
        const wanted = [...(ids ?? [])].filter(Boolean);
        await globalThis.Promise.all(wanted.map(id => this.load(id)));

        return wanted.filter(id => this.#entries.get(id)?.state === State.READY).length;
    }

    /**
     * Forget one resource, so the next ask decodes it again.
     *
     * WHAT A `revision` MEANS HERE. A picture replaced in the Project panel keeps its
     * identity and changes its payload (ADR-0020 §7), so the identity cannot be the whole
     * key — something has to say "that one is stale", and this is it.
     *
     * @param {string} id - The image's ResourceId
     * @returns {boolean} True when something was cached
     */
    invalidate(id) {
        const entry = this.#entries.get(id);
        if (!entry) return false;

        this.#entries.delete(id);
        close(entry.image);
        return true;
    }

    /** Forget everything, releasing what was decoded. */
    clear() {
        for (const entry of this.#entries.values()) close(entry.image);
        this.#entries.clear();
    }

    /** How many resources are decoded and drawable. */
    get ready() {
        return [...this.#entries.values()].filter(entry => entry.state === State.READY).length;
    }

    /** How many could not be decoded — absent, broken, or on a host with no image API. */
    get failed() {
        return [...this.#entries.values()].filter(entry => entry.state === State.FAILED).length;
    }

    /** Whether a resource has been asked for at all. */
    has(id) {
        return this.#entries.has(id);
    }
}

/**
 * The decoder a browser provides, or one that honestly answers nothing.
 *
 * `createImageBitmap` IS THE ONE TO USE WHERE IT EXISTS. It decodes off the main thread,
 * answers a value both Canvas 2D and WebGL accept, and — unlike an `Image` element — has a
 * promise rather than a load event, so nothing here has to invent one. The element is the
 * fallback for a browser without it; a host with neither answers null for every picture,
 * and the game simulates exactly as it would have.
 *
 * @returns {ImageDecoder} A decoder for this host
 */
export function defaultDecoder() {
    if (typeof globalThis.createImageBitmap === 'function' && typeof globalThis.fetch === 'function') {
        return async payload => {
            const blob = payload instanceof globalThis.Blob ? payload : await (await globalThis.fetch(payload)).blob();
            return globalThis.createImageBitmap(blob);
        };
    }

    if (typeof globalThis.Image === 'function') {
        return payload => new globalThis.Promise((resolve, reject) => {
            const element = new globalThis.Image();
            element.onload = () => resolve(element);
            element.onerror = () => reject(new Error('ImageCache: this picture could not be decoded'));
            element.src = typeof payload === 'string' ? payload : globalThis.URL.createObjectURL(payload);
        });
    }

    // NO IMAGE API AT ALL: a server, a worker, Node. The simulation is unaffected.
    return () => globalThis.Promise.resolve(null);
}

/**
 * A cache that decodes nothing, for a host that draws nothing.
 *
 * The counterpart of `SilentAudio`: it satisfies the shape so a caller need not check for
 * null, and it answers null for every picture.
 *
 * @returns {ImageCache} A cache with no pictures in it
 */
export function noImages() {
    return new ImageCache({ resolve: () => null, decode: () => globalThis.Promise.resolve(null) });
}

/** Release a decoded picture where the platform has a way to. */
function close(image) {
    if (typeof image?.close === 'function') image.close();
}
