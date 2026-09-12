// The resolved resources a simulation may reach, by ResourceId (ADR-0062 §1).
//
// ONE TABLE WHERE THERE WERE GOING TO BE FOUR. Prefabs arrived with a `PrefabRegistry`
// (ADR-0061 §4); animations would have arrived with an `AnimationRegistry`, and the next
// definition kind with a third. They are the same object under three names: a map filled by
// the layer that may wait, read by the layer that may not. So there is one class, one
// loader (`project/resources.js`) and one field on the Runtime, and a fourth kind of
// definition costs a row in a list rather than a parallel pipeline.
//
// IT IS NOT A CACHE. A cache decides when to refill itself; this is filled by whoever owns
// the project and never refills itself, so there is no policy in it to get wrong. It is also
// not a store: nothing here reads, writes or knows what storage is.
//
// WHAT IT HOLDS IS A PAYLOAD, AND THE READER SAYS WHAT IT WANTS. `Spawn Prefab` asks
// `recordsOf()` and `SpriteAnimator` asks `framesOf()`; both refuse a payload whose shape
// they do not recognise and answer null (ADR-0061 §3). So a single table cannot confuse a
// prefab with an animation — not because the table is careful, but because the READER is,
// which is the same rule that already governs a graph from an unknown version.
//
// PICTURES AND SOUNDS ARE NOT IN HERE, and the reason is a real difference rather than an
// oversight. What this holds is DATA the Core can interpret — records, frame rectangles —
// and it is the same value on a server and in a browser. A decoded picture and a sounding
// clip are HOST objects: an `ImageBitmap`, an `HTMLAudioElement`. They live behind the
// backend that made them (`rendering/images.js`, `audio/audio.js`), which is what keeps them
// out of the Core entirely.

export class ResourceRegistry {

    #definitions = new globalThis.Map();

    /**
     * Declare what a ResourceId is the definition of.
     * @param {string} id - The resource's identifier
     * @param {object} definition - The payload
     * @returns {object} The definition, as stored
     */
    set(id, definition) {
        this.#definitions.set(id, definition);
        return definition;
    }

    /**
     * Look one up.
     * @param {string} id - The resource's identifier
     * @returns {object|null} The definition, or null
     */
    get(id) {
        return this.#definitions.get(id) ?? null;
    }

    /**
     * Tell whether one is resolved.
     * @param {string} id - The resource's identifier
     * @returns {boolean} True when it is
     */
    has(id) {
        return this.#definitions.has(id);
    }

    /**
     * Forget one.
     * @param {string} id - The resource's identifier
     * @returns {boolean} True when there was one
     */
    delete(id) {
        return this.#definitions.delete(id);
    }

    /** Every resolved identifier, in the order they were declared. */
    ids() {
        return [...this.#definitions.keys()];
    }

    /** How many are resolved. */
    get size() {
        return this.#definitions.size;
    }
}
