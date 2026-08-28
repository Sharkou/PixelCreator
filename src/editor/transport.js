// Play, Pause, Stop — the three-state machine ADR-0029 describes.
//
// `editor.js` used to carry this, in words rather than in code:
//
//   "THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE. Play needs a scene snapshot
//    restored on stop, which does not exist yet. A green button that does nothing would be
//    the one kind of lie this Editor has consistently refused."
//
// The mechanism now exists — `serializeScene()`, `restoreScene()`, `Clock.reset()`, a
// `Runtime` the Viewport already holds a loop for — so the buttons arrive with it.
//
// ONE RUNTIME, ONE SCENE, NO COPY (ADR-0029 §1). The Runtime that draws the Viewport in
// edit mode is the one that plays. There is no second engine and no duplicate scene, which
// is what keeps the product's actual promise: change an object while the game runs and see
// the effect immediately. Playing on a copy would quietly destroy that.
//
// THE SNAPSHOT IS A VALUE (§2). `serializeScene()` produces JSON, so it cannot drift with
// the model it was taken from — which a held reference to live objects would.
//
// THE HISTORY STOPS AT THE DOOR (§5). Leaving EDITING clears the undo stacks and nothing
// is recorded while the simulation runs. Undo does not rewind a simulation: inverting an
// operation whose target a graph has since destroyed produces a valid operation towards a
// state that never existed. Clearing is blunt and honest; merging would be smooth and
// wrong.
//
// IT HOLDS NO DOM. The buttons live in the shell and call these three methods; the state
// is announced, and whoever draws it subscribes. That is what lets the machine be tested
// under Node, which is where the interesting cases are — a second Play, a Stop with
// nothing to restore, a Pause that must not take a new snapshot.

import { restoreScene, serializeScene } from '../core/mod.js';

/** The three states a scene can be in. */
export const TransportState = {
    /** Not running. The scene is the project. */
    EDITING: 'editing',
    /** Running: the clock advances and graphs execute. */
    PLAYING: 'playing',
    /** Running, with time held. Still drawn, still editable (ADR-0029 §6). */
    PAUSED: 'paused'
};

export class Transport {

    #scene;
    #runtime;
    #histories;
    #registry;

    #preview;

    #state = TransportState.EDITING;
    #snapshot = null;
    #listeners = new globalThis.Set();

    /**
     * Wire a transport to the scene and the runtime it drives.
     *
     * @param {object} context - What it acts on
     * @param {object} context.scene - The live scene
     * @param {object} context.runtime - The Runtime the Viewport draws with
     * @param {object} [context.histories] - The Histories to clear when play starts
     * @param {object} [context.registry] - Component registry used to restore
     * @param {Function} [context.preview] - Opens the game in its own window
     */
    constructor({ scene, runtime, histories = null, registry = null, preview = null }) {
        if (!scene) throw new TypeError('Transport: expected a scene');
        if (!runtime) throw new TypeError('Transport: expected a runtime');

        this.#scene = scene;
        this.#runtime = runtime;
        this.#histories = histories;
        this.#registry = registry;
        this.#preview = preview;
    }

    /**
     * Open the game in its own window.
     *
     * IT HANGS OFF THE TRANSPORT BUT IT IS NOT A TRANSPORT STATE. Play, Pause and Stop move
     * this Editor between three states (ADR-0029 §1); Preview leaves this window alone
     * entirely and opens another one on a snapshot (ADR-0042 §1). It lives here because the
     * button lives beside the other three, and for no deeper reason — the machine below does
     * not know it happened.
     *
     * @returns {object|null} Whatever the opener answered
     */
    preview() {
        return this.#preview?.() ?? null;
    }

    /** One of TransportState. */
    get state() {
        return this.#state;
    }

    /** Whether the simulation is advancing right now. */
    get running() {
        return this.#state === TransportState.PLAYING;
    }

    /** Whether a snapshot is being held — that is, whether Stop has anything to restore. */
    get held() {
        return this.#snapshot !== null;
    }

    /**
     * Start, or resume.
     *
     * FROM `EDITING` THIS TAKES A SNAPSHOT; FROM `PAUSED` IT DOES NOT (ADR-0029 §2).
     * Resuming is not starting: a creator who paused, moved an object and pressed Play
     * again expects the game to carry on from there, and re-snapshotting would make Stop
     * restore the middle of a play session instead of the project.
     *
     * @returns {string} The state it is now in
     */
    play() {
        if (this.#state === TransportState.PLAYING) return this.#state;

        if (this.#state === TransportState.EDITING) {
            this.#snapshot = serializeScene(this.#scene);
            // §5: leaving EDITING clears the stacks. Done before the clock moves, so an
            // operation authored by the first step cannot land on a stack about to go.
            this.#clearHistory();
        }

        this.#runtime.running = true;
        return this.#announce(TransportState.PLAYING);
    }

    /**
     * Hold time, without leaving the session.
     *
     * `PAUSED` is `PLAYING` without the clock: the scene keeps drawing and stays editable,
     * and everything changed while it is held is still lost at Stop like everything else
     * (ADR-0029 §4, §6).
     *
     * @returns {string} The state it is now in
     */
    pause() {
        if (this.#state !== TransportState.PLAYING) return this.#state;

        this.#runtime.running = false;
        return this.#announce(TransportState.PAUSED);
    }

    /**
     * Stop, and put the scene back exactly as Play found it (ADR-0029 §3).
     *
     * What it restores is the scene. What it deliberately does NOT restore: the Editor
     * camera, the selection, which sections are folded, which window is open — none of
     * those is in the scene, so none of them moves.
     *
     * @returns {string} The state it is now in
     */
    stop() {
        if (this.#state === TransportState.EDITING) return this.#state;

        this.#runtime.running = false;

        const snapshot = this.#snapshot;
        this.#snapshot = null;

        if (snapshot) restoreScene(this.#scene, snapshot, { registry: this.#registry ?? undefined });

        // The clock and the input belong to the session that just ended. Without the reset
        // a second Play would resume the first one's time, and a graph reading `time` would
        // observe a jump (ADR-0029 §7).
        //
        // THE GRAPHS' EXECUTION STATE NEEDS NO CALL, and that is worth stating rather than
        // leaving to be rediscovered: `Behaviors` keys its running state by COMPONENT
        // INSTANCE in a WeakMap, and the restore above replaced every object in the scene —
        // so the components those entries were keyed on no longer exist. §3's "the graphs'
        // execution state is abandoned" happens by construction, which is why ADR-0029 §7
        // could say the runtime needed exactly one addition.
        this.#runtime.clock?.reset?.();
        this.#runtime.input?.clear?.();

        // The restore wrote to the scene through the model's own primitives, which is not
        // an authored intent and must not be undoable (§5).
        this.#clearHistory();

        return this.#announce(TransportState.EDITING);
    }

    /**
     * Watch the state.
     * @param {Function} listener - Called with the new state, and immediately with the current one
     * @returns {Function} Unsubscribe
     */
    observe(listener) {
        this.#listeners.add(listener);
        listener(this.#state);
        return () => this.#listeners.delete(listener);
    }

    #announce(state) {
        this.#state = state;
        for (const listener of this.#listeners) listener(state);
        return state;
    }

    /** Empty every undo stack the Editor holds (ADR-0029 §5). */
    #clearHistory() {
        if (!this.#histories) return;
        for (const id of this.#histories.resources()) this.#histories.get(id)?.clear();
    }
}

/**
 * How much simulated time one frame accounts for.
 *
 * IT IS CLAMPED, AND THE CLAMP IS THE WHOLE REASON THIS IS A FUNCTION. A tab in the
 * background stops being given frames, and returning to it hands over a gap of several
 * seconds; without a ceiling the clock would faithfully catch every fixed step up, and a
 * creator looking back at their scene would watch it lurch forward half a minute. `Clock`
 * caps the steps it will run in one call, which covers the same ground — but a cap
 * expressed in steps is invisible at the call site, and this arithmetic is the one part of
 * the frame loop that can be checked without a browser.
 *
 * The first frame of a session accounts for nothing: there is no previous one to measure
 * against, and inventing a duration would run a step before the scene had been drawn once.
 *
 * @param {number} now - The current frame's timestamp, in milliseconds
 * @param {number} previous - The last frame's timestamp; 0 when there was none
 * @param {number} max - The most seconds one frame may account for
 * @returns {number} Seconds to advance the simulation by
 */
export function frameDelta(now, previous, max) {
    if (!globalThis.Number.isFinite(now) || !globalThis.Number.isFinite(previous)) return 0;
    if (previous === 0 || now <= previous) return 0;
    return Math.min((now - previous) / 1000, max);
}
