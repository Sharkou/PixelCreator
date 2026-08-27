// The browser adapter — the one place in the Editor that turns key events into the input
// state a simulation reads (ADR-0014).
//
// ADR-0014 DEFINED THE CONTRACT AND DELIBERATELY DID NOT BUILD THIS: "L'adaptateur
// navigateur n'est pas construit ici. Il appartient à la couche qui possède le DOM, et le
// runtime n'en définit que le contrat." This is that layer, and this file is the whole of
// the DOM half. Everything below it — `InputState`, `Runtime.step(input)`, the `Key` node —
// has never heard of a `KeyboardEvent`, which is what lets the same graph run on a server
// replaying names off the network.
//
// IT PUSHES, IT IS NEVER PULLED FROM. The runtime already holds an `Input` and reads it on
// every step; this writes into it and nothing more. There is no second input system, no
// global, and no path by which the Runtime could reach back for a keyboard.
//
//   keydown / keyup  ──►  InputState.press / release  ──►  Runtime.step  ──►  Key node
//
// WHAT IT LISTENS FOR AND WHEN. Only during a play session, and only while nothing is being
// typed into. The transport starts and stops it (`editor.js`), so a session that ends takes
// its listeners with it and a second Play does not add a second set — the counted case, and
// the reason `start()` and `stop()` are both idempotent rather than merely safe to call.
//
// IT NEVER CALLS `preventDefault()`. Deciding that a running game owns a key would be
// deciding that `Ctrl S` no longer saves and that `F` no longer frames the selection, and
// this Editor does not take a key away from a creator to give it to their game. What it
// takes instead is the narrower rule below: a key going into a FIELD is not a game action.
//
// KEYS ARE `KeyboardEvent.code`, NOT `key`. `code` is the physical key — `KeyW` is the same
// key on QWERTY and on AZERTY, where `key` would read `z` — and it does not change under
// Shift. ADR-0014 §2 already named it as what an adapter writes in, and the whole point of
// the names being opaque below this line is that only this file has to know.

import { isEditing } from './ui/focus.js';

export class KeyboardInput {

    #input;
    #target;
    #editing;
    #owner;
    #listening = false;
    #handlers = null;

    /**
     * Wire a keyboard to the input state a runtime reads.
     *
     * @param {object} context - What it feeds and what it listens to
     * @param {object} context.input - The runtime's `Input` (runtime/input/input.js)
     * @param {object} [context.target] - What to listen on; the window by default
     * @param {Function} [context.editing] - Whether a field has focus, so keys are not ours
     * @param {string|null} [context.owner] - Whose input this machine fills in; local by default
     */
    constructor({ input, target = globalThis, editing = isEditing, owner = null }) {
        if (!input?.of) throw new TypeError('KeyboardInput: expected a runtime Input');

        this.#input = input;
        this.#target = target;
        this.#editing = editing;
        this.#owner = owner;
    }

    /** Whether it is currently attached. */
    get listening() {
        return this.#listening;
    }

    /**
     * Start feeding the input state.
     *
     * IDEMPOTENT, AND THAT IS THE POINT OF THE FLAG. Play, Stop, Play must attach one set of
     * listeners and not two — two would press the same key twice, which is invisible on a
     * `Set` and would not stay invisible the moment anything counted.
     *
     * @returns {KeyboardInput} This adapter
     */
    start() {
        if (this.#listening) return this;

        this.#handlers = {
            keydown: event => this.#onKey(event, true),
            keyup: event => this.#onKey(event, false),
            // A KEY HELD WHEN THE WINDOW GOES AWAY IS NEVER RELEASED, because the keyup
            // lands wherever the focus went. Without this, alt-tabbing while walking leaves
            // the character walking forever.
            blur: () => this.#state().clear()
        };

        for (const [type, handler] of globalThis.Object.entries(this.#handlers)) {
            this.#target.addEventListener?.(type, handler);
        }
        this.#listening = true;
        return this;
    }

    /**
     * Stop, and release whatever was held.
     *
     * The release matters as much as the detach: a session that ends with a key down would
     * otherwise hand the next one a keyboard that is already pressed.
     *
     * @returns {KeyboardInput} This adapter
     */
    stop() {
        if (!this.#listening) return this;

        for (const [type, handler] of globalThis.Object.entries(this.#handlers ?? {})) {
            this.#target.removeEventListener?.(type, handler);
        }
        this.#handlers = null;
        this.#listening = false;
        this.#state().clear();
        return this;
    }

    /** The state this machine fills in — the local player's, unless told otherwise. */
    #state() {
        return this.#input.of(this.#owner);
    }

    /**
     * Translate one key event, or decline it.
     *
     * A KEY GOING INTO A FIELD IS NOT A GAME ACTION, and the check is on the way IN rather
     * than on the way out: typing `w` into the Project's rename box while the scene runs
     * must not also walk. The release is checked the same way, which leaves one case worth
     * naming — a key pressed on the canvas and released after clicking into a field stays
     * held. `blur` covers the window; a field taking focus does not raise one here, and the
     * alternative — releasing everything whenever focus moves — would drop a key a creator
     * is still holding every time a panel takes focus for its own reasons.
     */
    #onKey(event, down) {
        if (this.#editing()) return;

        const code = event?.code;
        if (!code) return;

        const state = this.#state();
        if (down) state.press(code); else state.release(code);
    }
}
