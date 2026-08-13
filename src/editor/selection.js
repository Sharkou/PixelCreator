// What the creator is currently working on.
//
// SELECTION IS AN EDITOR CONCERN, AND ONLY AN EDITOR CONCERN. Legacy kept it in the
// model as `scene.current` and `scene.currentComponent`, read by five modules, which is
// IDE state leaking into something a server also runs (core/scene.js says so). Here it
// is a small object the Editor owns, and the Core knows nothing about it.
//
// It is deliberately not an Operation and not replicated: two creators looking at the
// same project each have their own selection.
//
// Single selection for now. Multi-selection changes what every consumer means by "the
// selected object", so it is a decision to take with the tools that need it, not one to
// pre-empt with an array nobody reads.

import { Emitter } from '../core/mod.js';

export class Selection {

    #object = null;
    #emitter = new Emitter();

    /** The selected object, or null. */
    get object() {
        return this.#object;
    }

    /**
     * Select an object, or clear the selection.
     * @param {object|null} object - The object to select
     * @returns {object|null} The selected object
     */
    set(object) {
        const next = object ?? null;
        if (next === this.#object) return next;

        const previous = this.#object;
        this.#object = next;
        this.#emitter.emit('changed', { object: next, previous });
        return next;
    }

    /** Clear the selection. */
    clear() {
        return this.set(null);
    }

    /**
     * Tell whether an object is the selected one.
     * @param {object} object - The object to test
     * @returns {boolean} True when selected
     */
    has(object) {
        return this.#object !== null && this.#object === object;
    }

    /**
     * Subscribe to selection changes.
     * @param {Function} listener - Called with { object, previous }
     * @returns {Function} Unsubscribe function
     */
    observe(listener) {
        return this.#emitter.on('changed', listener);
    }
}
