// Input — the abstract state the simulation reads, with no idea where it came from.
//
// Nothing here knows about KeyboardEvent, MouseEvent, window, document or a gamepad.
// What a component sees is a set of pressed keys, a set of pressed buttons, a pointer
// position and named axes. A browser adapter fills that in on a client; the network
// layer fills it in on a server, from what players sent. Neither is visible from here,
// and that is what lets the same simulation run on both sides.
//
// Legacy got this backwards: `Controller` reached for the `Keyboard` singleton, which
// reached for `Network.users`, which is undefined offline. The result was a TypeError on
// every frame, swallowed, and single-player simply did not work. Input is passed in as
// an argument here for exactly that reason — a runtime given no input runs on empty
// input, it does not go looking for a global.
//
// INDEXED BY OWNER. `Object.owner` names the player an object belongs to (ADR-0001), so
// input is a state per owner rather than one global keyboard. A server steps one
// simulation holding every player's input; a client fills in its own. The `local` owner
// always exists, which is what makes offline play work with no special case.
//
// DETERMINISM. The runtime is handed an input, runs a step, and the state does not
// change underneath it. Two runtimes given the same initial scene and the same inputs
// reach the same result — the property server reconciliation depends on.

/** Owner of the input produced by the machine running the simulation. */
export const LOCAL = 'local';

export class InputState {

    #keys = new Set();
    #buttons = new Set();
    #previousKeys = new Set();
    #previousButtons = new Set();
    #axes = new Map();
    #pointerX = 0;
    #pointerY = 0;
    #pointerWorldX = 0;
    #pointerWorldY = 0;

    /**
     * Press a key.
     *
     * Key names are opaque strings. A browser adapter passes `KeyboardEvent.code`
     * values such as 'ArrowLeft' or 'KeyW'; nothing here depends on that choice, and a
     * server replaying names from the network never has to produce an event.
     *
     * @param {string} key - Key name
     */
    press(key) {
        this.#keys.add(key);
    }

    /**
     * Release a key.
     * @param {string} key - Key name
     */
    release(key) {
        this.#keys.delete(key);
    }

    /**
     * Whether a key is held down.
     * @param {string} key - Key name
     * @returns {boolean} True while it is held
     */
    isDown(key) {
        return this.#keys.has(key);
    }

    /**
     * Whether a key went down since the previous step.
     * @param {string} key - Key name
     * @returns {boolean} True on the single step that observes the press
     */
    pressed(key) {
        return this.#keys.has(key) && !this.#previousKeys.has(key);
    }

    /**
     * Whether a key came up since the previous step.
     * @param {string} key - Key name
     * @returns {boolean} True on the single step that observes the release
     */
    released(key) {
        return !this.#keys.has(key) && this.#previousKeys.has(key);
    }

    /** The keys currently held, sorted so the value is stable to compare and to log. */
    keys() {
        return [...this.#keys].sort();
    }

    /**
     * Press a pointer button.
     * @param {number} button - Button index, 0 being the primary one
     */
    pressButton(button) {
        this.#buttons.add(button);
    }

    /**
     * Release a pointer button.
     * @param {number} button - Button index
     */
    releaseButton(button) {
        this.#buttons.delete(button);
    }

    /**
     * Whether a button is held down.
     * @param {number} button - Button index
     * @returns {boolean} True while it is held
     */
    isButtonDown(button) {
        return this.#buttons.has(button);
    }

    /**
     * Whether a button went down since the previous step.
     * @param {number} button - Button index
     * @returns {boolean} True on the single step that observes the press
     */
    buttonPressed(button) {
        return this.#buttons.has(button) && !this.#previousButtons.has(button);
    }

    /**
     * Whether a button came up since the previous step.
     * @param {number} button - Button index
     * @returns {boolean} True on the single step that observes the release
     */
    buttonReleased(button) {
        return !this.#buttons.has(button) && this.#previousButtons.has(button);
    }

    /** The buttons currently held, sorted. */
    buttons() {
        return [...this.#buttons].sort((first, second) => first - second);
    }

    /**
     * Move the pointer, in screen space.
     *
     * THE RAW DEVICE FACT: where on the surface the pointer is, origin top left, in the
     * surface's own pixels (ADR-0013 §3). It says nothing about what is being pointed AT,
     * because the same coordinates mean a different place the moment the camera moves.
     *
     * NOTHING CONVERTS IT HERE. Turning a screen point into a world point is the camera's
     * job (`screenToWorld`), because only the camera and the viewport know the mapping —
     * which is why the world point arrives through `movePointerInWorld()` from whoever has
     * one, rather than being computed from this (ADR-0014 §2, ADR-0038).
     *
     * @param {number} x - Horizontal position
     * @param {number} y - Vertical position
     */
    movePointer(x, y) {
        this.#pointerX = x;
        this.#pointerY = y;
    }

    /**
     * Move the pointer, in world space.
     *
     * WHAT IS BEING POINTED AT, which is the fact gameplay is about: aim here, click that.
     * It is a SECOND fact and not a derivation of the first — no arithmetic here relates
     * the two, and none could, because the mapping belongs to a viewport this file must
     * never learn about.
     *
     * WHO FILLS IT IN. Whoever holds a viewport: the Editor's pointer adapter on a client
     * (`editor/input.js`), the network layer on a server, replaying what a player aimed at.
     * A headless test calls it directly with the point it means, which is exactly what
     * makes the same graph runnable with no browser at all (ADR-0038).
     *
     * @param {number} x - Horizontal world coordinate
     * @param {number} y - Vertical world coordinate
     */
    movePointerInWorld(x, y) {
        this.#pointerWorldX = x;
        this.#pointerWorldY = y;
    }

    /** Pointer position in screen space. */
    get pointerX() {
        return this.#pointerX;
    }

    get pointerY() {
        return this.#pointerY;
    }

    /** Pointer position in world space — what it is pointing at. */
    get pointerWorldX() {
        return this.#pointerWorldX;
    }

    get pointerWorldY() {
        return this.#pointerWorldY;
    }

    /**
     * Set a named axis.
     *
     * Axes cover what a key cannot: a stick, a trigger, a steering value. The name is
     * free-form so a game can define its own without the engine knowing about devices.
     *
     * @param {string} name - Axis name
     * @param {number} value - Axis value, conventionally within -1..1
     */
    setAxis(name, value) {
        this.#axes.set(name, value);
    }

    /**
     * Read a named axis.
     * @param {string} name - Axis name
     * @returns {number} The value, 0 when the axis was never set
     */
    axis(name) {
        return this.#axes.get(name) ?? 0;
    }

    /** The axis names currently set, sorted. */
    axes() {
        return [...this.#axes.keys()].sort();
    }

    /**
     * Close the step: what is held now becomes what was held before.
     *
     * This is what makes `pressed()` and `released()` fire on exactly one step. The
     * runtime calls it after each step, so a press observed once is never observed
     * twice, whatever the frame rate.
     */
    commit() {
        this.#previousKeys = new Set(this.#keys);
        this.#previousButtons = new Set(this.#buttons);
    }

    /** Release everything and forget the pointer. Used when focus is lost. */
    clear() {
        this.#keys.clear();
        this.#buttons.clear();
        this.#previousKeys.clear();
        this.#previousButtons.clear();
        this.#axes.clear();
        this.#pointerX = 0;
        this.#pointerY = 0;
        this.#pointerWorldX = 0;
        this.#pointerWorldY = 0;
    }
}

export class Input {

    #states = new Map([[LOCAL, new InputState()]]);

    /**
     * The input state of one owner.
     *
     * A missing owner gets a fresh empty state rather than a shared one, so a component
     * reading an owner nobody has filled in yet sees "nothing pressed" and cannot
     * accidentally write into every other unknown owner's input.
     *
     * @param {string|null} [owner] - Owner id; null or undefined means the local player
     * @returns {InputState} The state, created on first use
     */
    of(owner) {
        const key = owner ?? LOCAL;
        let state = this.#states.get(key);
        if (!state) {
            state = new InputState();
            this.#states.set(key, state);
        }
        return state;
    }

    /** The state of the machine running the simulation. */
    get local() {
        return this.of(LOCAL);
    }

    /**
     * Replace an owner's state wholesale.
     *
     * This is the path the network layer uses: a snapshot arrives for a player and takes
     * the place of what was there, rather than being merged key by key.
     *
     * @param {string|null} owner - Owner id; null or undefined means the local player
     * @param {InputState} state - The state to install
     * @returns {InputState} The installed state
     */
    set(owner, state) {
        if (!(state instanceof InputState)) {
            throw new TypeError('Input.set: expected an InputState');
        }
        this.#states.set(owner ?? LOCAL, state);
        return state;
    }

    /**
     * Forget an owner, for instance when a player disconnects.
     *
     * The local owner cannot be removed: it always exists, which is what keeps
     * single-player working without a special case.
     *
     * @param {string} owner - Owner id
     * @returns {boolean} True when a state was removed
     */
    remove(owner) {
        if ((owner ?? LOCAL) === LOCAL) return false;
        return this.#states.delete(owner);
    }

    /** The owners currently known, sorted. */
    owners() {
        return [...this.#states.keys()].sort();
    }

    /** Close the step for every owner. Called by the runtime after each step. */
    commit() {
        for (const state of this.#states.values()) state.commit();
    }

    /** Release everything, for every owner. */
    clear() {
        for (const state of this.#states.values()) state.clear();
    }
}
