// What survives a change of scene, and nothing else (ADR-0063 §5).
//
// THE PROBLEM IT SOLVES, EXACTLY. A scene transition throws the whole world away — the
// Objects, their Components, the values a creator set on them (ADR-0063 §3). That is the
// right lifecycle and it has one consequence nobody can work around from a graph: a score
// carried from `Level` to `GameOver` has nowhere to live, because everything that could hold
// it dies on the way.
//
// IT IS NOT A SECOND PROPERTY SYSTEM, AND THE DIFFERENCES ARE THE POINT:
//
//   no reactivity        nothing observes it, nothing redraws from it, no Change is emitted
//   no Operations        it is not authored, not replicated, not undoable (ADR-0019)
//   no schema            three primitive types, declared nowhere, defaulted to nothing
//   no serialization     it is not in a scene payload and not in a project
//   no identity          a key is a name a creator types, not a `ResourceId`
//
// Every one of those is a thing the Property System HAS and this deliberately does not. A
// Component property is a description of an Object; this is a handful of numbers a play
// session is carrying. Building the first out of the second would make a save file out of a
// scratchpad, and the second out of the first would need an Object that outlives the scene —
// which is the thing a scene transition exists to destroy.
//
// THREE TYPES, AND ANYTHING ELSE IS REFUSED. `number`, `boolean`, `string`: what a graph can
// produce, what a `Text` can show and what a comparison can test. An Object handle would be a
// reference to a scene that has been thrown away; an array or a record would be a format
// nobody has decided, and the day one is decided it is a save file, not this.
//
// IT IS THE APPLICATION'S, NOT THE RUNTIME'S. A Runtime is built per scene (ADR-0063 §3) and
// this outlives several of them, so it is created by whoever owns the session and handed to
// each Runtime in turn — the same shape the audio output and the resource registry already
// have. Starting a new game is `clear()`, and it is the application that decides when.

/** What a session value may be. */
const ALLOWED = new globalThis.Set(['number', 'boolean', 'string']);

export class SessionState {

    #values = new globalThis.Map();

    /**
     * Read a value.
     *
     * A KEY THAT WAS NEVER WRITTEN READS AS `null`, not as `undefined` and not as zero. Null
     * is what "nothing is here" already means everywhere else in this model (ADR-0023), and
     * a zero would be indistinguishable from a score of zero.
     *
     * @param {string} key - The name
     * @returns {number|boolean|string|null} The value, or null
     */
    get(key) {
        return this.#values.get(globalThis.String(key ?? '')) ?? null;
    }

    /**
     * Write a value.
     *
     * ANYTHING THAT IS NOT ONE OF THE THREE TYPES CLEARS THE KEY rather than being stored.
     * A graph that hands over an Object handle or a `NaN` has produced something a session
     * cannot carry, and keeping it would mean a value that reads back as something else
     * after a transition — which is worse than the key being empty (ADR-0054).
     *
     * @param {string} key - The name
     * @param {any} value - What to store
     * @returns {number|boolean|string|null} What was stored
     */
    set(key, value) {
        const name = globalThis.String(key ?? '');
        if (name === '') return null;

        const usable = ALLOWED.has(typeof value)
            && (typeof value !== 'number' || globalThis.Number.isFinite(value));

        if (!usable) {
            this.#values.delete(name);
            return null;
        }

        this.#values.set(name, value);
        return value;
    }

    /**
     * Whether a key has been written.
     * @param {string} key - The name
     * @returns {boolean} True when it holds something
     */
    has(key) {
        return this.#values.has(globalThis.String(key ?? ''));
    }

    /**
     * Forget one key.
     * @param {string} key - The name
     * @returns {boolean} True when there was something
     */
    delete(key) {
        return this.#values.delete(globalThis.String(key ?? ''));
    }

    /** Forget everything. What "a new game" means. */
    clear() {
        this.#values.clear();
    }

    /** How many keys are set. */
    get size() {
        return this.#values.size;
    }

    /**
     * Everything it holds, as a plain object.
     *
     * FOR A TEST AND FOR A DEBUGGER, and deliberately not for a save file: a snapshot of a
     * scratchpad is still a scratchpad, and what a saved GAME is has not been decided.
     *
     * @returns {object} The values, by key
     */
    snapshot() {
        return globalThis.Object.fromEntries(this.#values);
    }
}
