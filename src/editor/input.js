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

// The pointer half of the same idea, and the differences from the keyboard are all
// consequences of one fact: a pointer has a PLACE, and a keyboard does not.
//
// IT LISTENS ON THE GAME SURFACE, NOT ON THE WINDOW (ADR-0038). That is what answers, for
// the pointer, the question `isEditing()` answers for the keyboard: a press in the Inspector
// or on a tab never reaches the viewport, so it is never a click in the game — not because
// a rule declined it, but because it was never aimed at the game. No notion of "game focus"
// is invented here, and none is needed while there is one surface the game is drawn on.
//
// A RELEASE IS HEARD ANYWHERE, AND THAT ASYMMETRY IS DELIBERATE. A press must start on the
// surface, but the release of that press regularly lands somewhere else — a drag that ran
// off the canvas, a pointer that left the window. Listening for `pointerup` on the window
// is what stops a button from being held forever by a release nobody heard, and releasing a
// button that was never pressed is a no-op on a Set, so an Inspector click passing by costs
// nothing and means nothing.
//
// IT NEVER CONVERTS COORDINATES. `locate()` is the Viewport's answer, because zoom, pan, the
// device ratio and the camera all live there and none of them may reach the Runtime. This
// adapter carries the answer across and writes it down.

export class PointerInput {

    #input;
    #target;
    #window;
    #locate;
    #owner;
    #listening = false;
    #handlers = null;
    #windowHandlers = null;

    /**
     * Wire a pointer to the input state a runtime reads.
     *
     * @param {object} context - What it feeds, what it listens to, and who resolves a point
     * @param {object} context.input - The runtime's `Input` (runtime/input/input.js)
     * @param {object} context.target - The game surface to listen on; the Viewport element
     * @param {Function} context.locate - (clientX, clientY) => `{ screenX, screenY, worldX, worldY }`
     * @param {object} [context.window] - Where a release is heard from; the window by default
     * @param {string|null} [context.owner] - Whose input this fills in; local by default
     */
    constructor({ input, target, locate, window = globalThis, owner = null }) {
        if (!input?.of) throw new TypeError('PointerInput: expected a runtime Input');
        if (!target?.addEventListener) throw new TypeError('PointerInput: expected a surface to listen on');
        if (typeof locate !== 'function') throw new TypeError('PointerInput: expected a locate function');

        this.#input = input;
        this.#target = target;
        this.#locate = locate;
        this.#window = window;
        this.#owner = owner;
    }

    /** Whether it is currently attached. */
    get listening() {
        return this.#listening;
    }

    /**
     * Start feeding the input state.
     *
     * IDEMPOTENT, for the reason `KeyboardInput.start()` is: Play, Stop, Play must attach
     * one set of listeners and not two.
     *
     * @returns {PointerInput} This adapter
     */
    start() {
        if (this.#listening) return this;

        this.#handlers = {
            pointermove: event => this.#move(event),
            // The press carries a position too: a tap on a touch screen is the first time
            // that pointer has been anywhere, so a button read without it would be a click
            // at wherever the last mouse happened to leave the cursor.
            pointerdown: event => { this.#move(event); this.#press(event, true); }
        };
        this.#windowHandlers = {
            pointerup: event => this.#press(event, false),
            // A cancelled pointer is one the platform took away — a system gesture, a
            // scroll taking over. It is a release that will never come otherwise.
            pointercancel: event => this.#press(event, false),
            blur: () => this.#state().clear()
        };

        for (const [type, handler] of globalThis.Object.entries(this.#handlers)) {
            this.#target.addEventListener(type, handler);
        }
        for (const [type, handler] of globalThis.Object.entries(this.#windowHandlers)) {
            this.#window.addEventListener?.(type, handler);
        }
        this.#listening = true;
        return this;
    }

    /**
     * Stop, and release whatever was held.
     * @returns {PointerInput} This adapter
     */
    stop() {
        if (!this.#listening) return this;

        for (const [type, handler] of globalThis.Object.entries(this.#handlers ?? {})) {
            this.#target.removeEventListener(type, handler);
        }
        for (const [type, handler] of globalThis.Object.entries(this.#windowHandlers ?? {})) {
            this.#window.removeEventListener?.(type, handler);
        }
        this.#handlers = null;
        this.#windowHandlers = null;
        this.#listening = false;
        this.#state().clear();
        return this;
    }

    /** The state this machine fills in — the local player's, unless told otherwise. */
    #state() {
        return this.#input.of(this.#owner);
    }

    /** Write where the pointer is, in both spaces, as the Viewport resolved them. */
    #move(event) {
        const at = this.#locate(event.clientX, event.clientY);
        if (!at) return;

        const state = this.#state();
        state.movePointer(at.screenX, at.screenY);
        state.movePointerInWorld(at.worldX, at.worldY);
    }

    /**
     * Press or release one button.
     *
     * `event.button` is the DOM's index — 0 primary, 1 auxiliary, 2 secondary — which is
     * already the numbering `InputState` documents, so nothing is translated (ADR-0014).
     */
    #press(event, down) {
        const button = event?.button;
        if (typeof button !== 'number') return;

        const state = this.#state();
        if (down) state.pressButton(button); else state.releaseButton(button);
    }
}
