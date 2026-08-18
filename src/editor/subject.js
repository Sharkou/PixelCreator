// What the creator is working on — announced once, by whoever caused it (ADR-0032).
//
// THREE SUBJECTS, TWO HOLDERS, AND THIS IS THE THING THAT JOINS THEM. An Object lives in
// `Selection` (ADR-0017), a Resource lives in the `Workspace` (ADR-0025), and a graph node
// means "the `.px` is the subject" (ADR-0027 §10). Both holders are right to exist — an
// Object's selection has no lifecycle, a Resource's does — but nothing said what happens to
// one when the other changes.
//
// WHAT USED TO SAY IT, AND WHY IT COULD NOT. `editor.js` propagated each holder's change to
// the other, behind a re-entrancy flag. It failed on the one case that matters most:
// `Selection.set(null)` emits nothing when the selection was already empty, so clicking the
// empty scene never announced anything, and a resource selected in Project stayed selected.
// Two windows had discovered this and cleared both holders by hand; the Viewport never did.
//
// SO AN INTENTION IS ANNOUNCED RATHER THAN DEDUCED. A window says `subject.object(o)`,
// `subject.resource(id)` or `subject.clear()`, and this routes it. It holds NO state of its
// own: a third holder would be a third thing to keep in step for an idea that is already
// readable from the two that exist.
//
// THE INVARIANT, and it is a test rather than an inspection: after any call below, AT MOST
// ONE of the two holders is non-empty.

export class Subject {

    #selection;
    #workspace;

    /**
     * Whether a routing pass is already in flight.
     *
     * NOT THE ANTI-ECHO FLAG THIS REPLACES. Nothing re-propagates any more, so there is no
     * echo left to cut. What this guards is an observer that reacts to a selection by
     * selecting something else — a panel that clears what was just announced, say. The
     * first gesture wins and the reaction is ignored, instead of the two interleaving their
     * writes and leaving both holders full.
     */
    #routing = false;

    /**
     * @param {object} holders - The two holders this routes between
     * @param {object} holders.selection - The Editor's object Selection (ADR-0017)
     * @param {object} [holders.workspace] - The Workspace holding the resource selection
     */
    constructor({ selection, workspace = null }) {
        if (!selection) throw new TypeError('Subject: an object Selection is required');
        this.#selection = selection;
        this.#workspace = workspace;
    }

    /**
     * Which of the three subjects is current.
     *
     * Derived, never stored: the two holders already know, and a stored answer would be a
     * third thing to keep in step with them.
     *
     * @returns {string} `object`, `resource` or `none`
     */
    get kind() {
        if (this.#selection.object) return 'object';
        if (this.#workspace?.selectedId) return 'resource';
        return 'none';
    }

    /**
     * Work on an Object. A null object means "on nothing", and says so to BOTH holders.
     * @param {object|null} object - The scene object
     * @returns {object|null} What is now the subject
     */
    object(object) {
        return this.select({ object });
    }

    /**
     * Work on a Resource. A null id means "on nothing", and says so to BOTH holders.
     * @param {string|null} id - The ResourceId
     * @returns {string|null} What is now the subject
     */
    resource(id) {
        return this.select({ resource: id });
    }

    /** Work on nothing. Writes to BOTH holders, unconditionally — that is the whole fix. */
    clear() {
        return this.select({});
    }

    /**
     * Announce an intention.
     *
     * ONE WRITE ORDER, AND IT IS DELIBERATE: the holder being SET is written first, so a
     * view that redraws on the first notification already sees the new subject rather than
     * a moment in which nothing is selected at all.
     *
     * @param {object} [intent] - `{ object }`, `{ resource }`, or neither for nothing
     * @returns {any} What is now the subject, or null
     */
    select({ object = null, resource = null } = {}) {
        if (this.#routing) return this.#selection.object ?? this.#workspace?.selectedId ?? null;

        this.#routing = true;
        try {
            if (object) {
                this.#selection.set(object);
                this.#workspace?.select(null);
                return object;
            }

            if (resource) {
                this.#workspace?.select(resource);
                this.#selection.set(null);
                return resource;
            }

            this.#selection.set(null);
            this.#workspace?.select(null);
            return null;
        } finally {
            this.#routing = false;
        }
    }
}
