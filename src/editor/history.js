// Undo / Redo (ADR-0024).
//
// THE SPLIT, AND WHY IT FALLS HERE.
//
//   an Operation carries what it takes to reverse it   Core — the format (ADR-0008)
//   invert(operation) -> operation                     Core — one place per rule
//   the stack, the grouping, the shortcut              Editor — undoing is authorship
//
// A headless server replaying a session does not undo anything. Undo is a creator taking
// something back, so the stack is Editor state, exactly as the selection is (ADR-0017).
//
// FOUR RULES, AND THEY ARE THE WHOLE DESIGN.
//
// 1. WHAT IS RECORDED IS WHAT `submit()` ANNOUNCED. An operation that arrived through
//    `apply()` — a replicated one — emits nothing, so it never reaches this listener. The
//    anti-echo protects the history for free.
//
// 2. ONLY MY OWN OPERATIONS. Without `actor`, Ctrl Z would take back a collaborator's
//    work. No machinery: the field is already in the format.
//
// 3. UNDO GOES THROUGH `submit(invert(op))`, NEVER THROUGH `apply()`. An undo is a new
//    intent: the server may refuse it, and it has to replicate. Applying it locally would
//    desynchronise the project in silence. *This is the single easiest thing in the whole
//    system to get wrong*, so it is worth saying twice: an undo produces an Operation, and
//    anything watching the pipeline sees it.
//
// 4. A `batch` IS ONE ENTRY, inverted in reverse order. A drag is one undo, and so is a
//    reparent that also rewrote five Transform values (ADR-0022).
//
// NO SECOND PATH OF MUTATION. This module never writes to the model. Its only action is
// `submit(invert(op))` — so nothing is undoable that is not replicable, and there is no
// way for the history and the network to disagree about what happened.
//
// WHAT IS NOT RESTORED, and it should be said rather than discovered: a graph's execution
// state (the `WeakMap` in `Behaviors`) and a component's working fields. Those are live
// state, not project data. Undo does not rewind a simulation, for the same reason a plain
// write is not an Operation (ADR-0003).

import { createId, invert, invertible } from '../core/mod.js';

export class History {

    #operations;
    #actor;
    #limit;

    #undo = [];
    #redo = [];
    #unsubscribe;

    // Raised while this module is submitting inverses of its own. The operations it emits
    // come back through the same listener, and without this they would be recorded as
    // fresh work — an undo that immediately becomes its own undo.
    #replaying = null;

    #listeners = new Set();

    /**
     * Watch a pipeline and keep an undo stack for it.
     *
     * @param {object} operations - The pipeline to record and submit to
     * @param {object} [options] - Options
     * @param {string|null} [options.actor] - Record only this actor's operations; when
     *   null, everything announced on this pipeline is recorded, which is the single-user
     *   case and the current one
     * @param {number} [options.limit] - How many entries to keep
     */
    constructor(operations, { actor = null, limit = 200 } = {}) {
        if (!operations?.on || !operations?.submit) {
            throw new TypeError('History: expected an Operations pipeline');
        }

        this.#operations = operations;
        this.#actor = actor;
        this.#limit = limit;
        this.#unsubscribe = operations.on('operation', operation => this.#record(operation));
    }

    /** Whether there is anything to take back. */
    get canUndo() {
        return this.#undo.length > 0;
    }

    /** Whether there is anything to put back. */
    get canRedo() {
        return this.#redo.length > 0;
    }

    /** How many entries the undo stack holds. */
    get depth() {
        return this.#undo.length;
    }

    /**
     * Subscribe to changes of the stacks, for a menu item or a button.
     * @param {Function} listener - Called with { canUndo, canRedo }
     * @returns {Function} Unsubscribe function
     */
    observe(listener) {
        this.#listeners.add(listener);
        return () => this.#listeners.delete(listener);
    }

    /**
     * Take back the last entry.
     * @returns {boolean} True when something was undone
     */
    undo() {
        return this.#replay(this.#undo, this.#redo);
    }

    /**
     * Put back the last thing taken away.
     * @returns {boolean} True when something was redone
     */
    redo() {
        return this.#replay(this.#redo, this.#undo);
    }

    /** Forget both stacks. */
    clear() {
        this.#undo = [];
        this.#redo = [];
        this.#announce();
    }

    /** Stop listening to the pipeline. */
    dispose() {
        this.#unsubscribe?.();
        this.#unsubscribe = null;
        this.#listeners.clear();
    }

    #record(operation) {
        if (this.#actor !== null && operation.actor !== this.#actor) return;
        // A type with no inversion rule is not silently dropped from the stack in the
        // middle of a batch — it is simply not recorded, and the batch it belonged to
        // keeps whatever else it carried.
        if (!invertible(operation.type)) return;

        if (this.#replaying) {
            this.#replaying.push(operation);
            return;
        }

        const last = this.#undo.at(-1);
        // A batch is one entry: a drag of two hundred moves undoes once, and so does a
        // reparent that rewrote five Transform values along with it.
        if (operation.batch && last?.batch === operation.batch) last.operations.push(operation);
        else this.#undo.push({ batch: operation.batch ?? null, operations: [operation] });

        if (this.#undo.length > this.#limit) this.#undo.shift();

        // Any new work makes the redo stack a description of a future that no longer
        // exists.
        this.#redo = [];
        this.#announce();
    }

    #replay(from, to) {
        const entry = from.pop();
        if (!entry) return false;

        // One batch for the whole inversion, so undoing an entry is itself a single entry
        // on the other stack. Without it, undoing a six-operation drop would need six
        // redos.
        const batch = entry.operations.length > 1 || entry.batch ? createId() : null;
        const produced = [];
        this.#replaying = produced;

        try {
            // Reverse order: the last thing that happened is the first thing undone.
            for (const operation of [...entry.operations].reverse()) {
                const inverse = invert(operation);
                // submit(), never apply(). An undo is arbitrated and replicated like any
                // other intent — rule 3, and the one worth being loud about.
                this.#operations.submit(batch ? { ...inverse, batch } : inverse);
            }
        } finally {
            this.#replaying = null;
        }

        if (produced.length === 0) {
            // Nothing applied — the authority refused, or the target has gone. The entry
            // is not put back on the other stack, because there is nothing there to undo.
            this.#announce();
            return false;
        }

        to.push({ batch, operations: produced });
        this.#announce();
        return true;
    }

    #announce() {
        const state = { canUndo: this.canUndo, canRedo: this.canRedo };
        for (const listener of this.#listeners) listener(state);
    }
}

/**
 * One History per resource (ADR-0024).
 *
 * A single global stack is the classic mistake: Ctrl Z in the Graph window would take back
 * an edit made in the scene. A stack belongs to the thing being edited, so it is keyed by
 * ResourceId — the project's manifest, each open scene, each open graph.
 */
export class Histories {

    #byResource = new Map();
    #actor;

    /**
     * @param {object} [options] - Options
     * @param {string|null} [options.actor] - Passed to every History created here
     */
    constructor({ actor = null } = {}) {
        this.#actor = actor;
    }

    /**
     * The stack for a resource, created on first use.
     * @param {string} resourceId - The resource being edited
     * @param {object} operations - Its pipeline
     * @returns {History} The stack
     */
    for(resourceId, operations) {
        const existing = this.#byResource.get(resourceId);
        if (existing) return existing;

        const history = new History(operations, { actor: this.#actor });
        this.#byResource.set(resourceId, history);
        return history;
    }

    /**
     * The stack for a resource, without creating one.
     * @param {string} resourceId - The resource
     * @returns {History|null} The stack, or null
     */
    get(resourceId) {
        return this.#byResource.get(resourceId) ?? null;
    }

    /**
     * Drop a resource's stack — when its editor is closed, or the resource is gone.
     * @param {string} resourceId - The resource
     * @returns {boolean} True when a stack was dropped
     */
    close(resourceId) {
        const history = this.#byResource.get(resourceId);
        if (!history) return false;

        history.dispose();
        return this.#byResource.delete(resourceId);
    }

    /** The resource identifiers that have a stack. */
    resources() {
        return [...this.#byResource.keys()];
    }
}
