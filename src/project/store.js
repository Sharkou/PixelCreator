// ResourceStore — the only point of contact with storage (ADR-0020).
//
// One interface, several implementations, none of them in the Core:
//
//   list()            manifest entries
//   read(id)          the payload
//   write(id, data)   persist
//   delete(id)
//
//   memory      tests, and starting up with nothing on disk
//   IndexedDB   local / offline (`Store` is already written and unused, ARCHITECTURE.md §9)
//   HTTP        later; the implementation alone changes, plus a caching policy
//
// LOADING IS LAZY AND BY IDENTIFIER. Opening a project reads the manifest, not the
// payloads — so a project with two hundred sprites opens as fast as one with two.
//
// A BINARY PAYLOAD IS NEVER BASE64 INSIDE A SCENE. That was the defect ARCHITECTURE.md §9
// records, and it is what made a replicated scene snapshot carry every image in it. An
// asset's payload lives outside the JSON, reached by its ResourceId.
//
// This module is deliberately synchronous in its in-memory form and asynchronous in its
// contract: every method may return a promise, and callers await. A store that talks to
// IndexedDB or to a server cannot be synchronous, and pretending otherwise here would
// force a rewrite of every caller the day one arrives.

/**
 * What every store must provide.
 *
 * Written as a class so the shape is documented in one place and a partial implementation
 * fails loudly rather than silently returning undefined. It is not a base class anyone has
 * to extend — duck-typing is enough, exactly as for Components (ADR-0004).
 */
export class ResourceStore {

    /**
     * Every manifest entry the store holds.
     * @returns {Promise<object[]>|object[]} The entries
     */
    list() {
        throw new Error('ResourceStore.list: not implemented');
    }

    /**
     * Read a payload.
     * @param {string} id - The ResourceId
     * @returns {Promise<any>|any} The payload, or null when absent
     */
    read(id) {
        throw new Error('ResourceStore.read: not implemented');
    }

    /**
     * Persist a resource and its payload.
     * @param {object} resource - The manifest entry
     * @param {any} payload - The content
     * @returns {Promise<object>|object} The stored entry
     */
    write(resource, payload) {
        throw new Error('ResourceStore.write: not implemented');
    }

    /**
     * Forget a resource.
     * @param {string} id - The ResourceId
     * @returns {Promise<boolean>|boolean} True when something was removed
     */
    delete(id) {
        throw new Error('ResourceStore.delete: not implemented');
    }

    /**
     * How many bytes a payload occupies, when the store can say.
     *
     * OPTIONAL, AND HONEST ABOUT IT. An HTTP store knows from a header, IndexedDB from the
     * blob, and a store that cannot tell answers `null` rather than guessing — a panel
     * showing "0 B" for a file it never measured is worse than a panel showing nothing.
     *
     * @param {string} id - The ResourceId
     * @returns {Promise<number|null>|number|null} The size in bytes, or null
     */
    size(id) {
        return null;
    }
}

/**
 * A store that keeps everything in memory.
 *
 * What tests use, and what a project starts from before anything is saved. It is the
 * reference implementation: if a behaviour is not expressible against this one, the
 * interface is wrong.
 */
export class MemoryResourceStore extends ResourceStore {

    #entries = new Map();
    #payloads = new Map();

    /**
     * Create a store, optionally pre-filled.
     * @param {object[]} [entries] - `{ resource, payload }` pairs to start from
     */
    constructor(entries = []) {
        super();
        for (const { resource, payload = null } of entries) this.write(resource, payload);
    }

    list() {
        return [...this.#entries.values()];
    }

    read(id) {
        // Cloned on the way out, so a caller mutating what it read cannot reach into the
        // store. A graph handed to `behaviors.bind()` must be a value, not a live handle.
        return this.#payloads.has(id) ? clone(this.#payloads.get(id)) : null;
    }

    write(resource, payload = null) {
        if (!resource?.id) throw new TypeError('MemoryResourceStore.write: expected a resource with an id');

        this.#entries.set(resource.id, resource);
        this.#payloads.set(resource.id, clone(payload));
        return resource;
    }

    delete(id) {
        this.#payloads.delete(id);
        return this.#entries.delete(id);
    }

    /**
     * Tell whether the store holds a resource.
     * @param {string} id - The ResourceId
     * @returns {boolean} True when present
     */
    has(id) {
        return this.#entries.has(id);
    }

    size(id) {
        if (!this.#payloads.has(id)) return null;
        return byteLength(this.#payloads.get(id));
    }
}

/**
 * The size a payload would occupy, measured the way it is stored.
 *
 * A binary payload knows its own length; anything else is JSON here and on the wire, so
 * its serialized length is the honest number rather than a guess about object overhead.
 *
 * @param {any} payload - The content
 * @returns {number|null} Bytes, or null when there is nothing to measure
 */
function byteLength(payload) {
    if (payload === null || payload === undefined) return null;
    if (payload instanceof globalThis.ArrayBuffer) return payload.byteLength;
    if (globalThis.ArrayBuffer?.isView(payload)) return payload.byteLength;

    const text = typeof payload === 'string' ? payload : globalThis.JSON.stringify(payload);
    if (typeof text !== 'string') return null;

    // Counted in UTF-8, which is what a store writes and a transport sends. Available in
    // every environment this runs in: browsers, Node, Deno.
    return new globalThis.TextEncoder().encode(text).length;
}

function clone(value) {
    if (value === null || typeof value !== 'object') return value;
    if (globalThis.Array.isArray(value)) return value.map(clone);
    // A binary payload is handed over as it is: copying an ArrayBuffer on every read would
    // be the exact cost this layer exists to avoid.
    if (globalThis.ArrayBuffer?.isView(value) || value instanceof globalThis.ArrayBuffer) return value;
    return globalThis.Object.fromEntries(
        globalThis.Object.entries(value).map(([key, item]) => [key, clone(item)])
    );
}
