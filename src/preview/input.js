// The keyboard and the pointer, from the browser into the Input the simulation reads.
//
// THE SAME PIPELINE THE EDITOR HAS, AND DELIBERATELY NOT THE SAME CODE. ADR-0014 fixes the
// shape — DOM event → `InputState.press` / `release` → `Runtime.step` → the graph — and
// `editor/input.js` implements it over the Editor's viewport, with its pan, its zoom, its
// tool overlay and its rules about which surface has focus. None of that exists here: a game
// client is one canvas filling the window. Sharing the file would mean carrying the Editor's
// view model into an application that has none, which is exactly the dependency ADR-0042 §2
// forbids — so what is shared is the CONTRACT, and this is thirty lines of it.
//
// TWO SPACES, BECAUSE A GRAPH ONLY GETS ONE. `Pointer` yields world coordinates and must
// (ADR-0038): a graph has no camera and cannot convert. The screen position is written too,
// for whatever reads it, and the conversion happens here where the view matrix is known.

import { screenToWorld } from '../runtime/mod.js';

/**
 * Feed one canvas's keyboard and pointer into an Input.
 *
 * @param {HTMLCanvasElement} canvas - The surface the game is drawn on
 * @param {object} input - The Runtime's Input
 * @param {object} options - `{ view, density, owner }`
 * @returns {{stop: Function}} A handle that unbinds everything
 */
export function bindInput(canvas, input, { view, density = () => 1, owner = null } = {}) {
    const state = () => input.of(owner);
    const off = [];

    const bind = (target, name, handler, options) => {
        target.addEventListener(name, handler, options);
        off.push(() => target.removeEventListener(name, handler, options));
    };

    // WHAT IS STORED IS `event.code`, NEVER `event.key` (ADR-0014 §2). `code` is the
    // physical key and survives a creator's keyboard layout; `key` is what the layout
    // produced, so a graph watching `KeyW` would stop working on an AZERTY keyboard.
    bind(globalThis, 'keydown', event => {
        if (event.repeat) return;
        state().press(event.code);
    });
    bind(globalThis, 'keyup', event => state().release(event.code));

    // A WINDOW THAT LOSES FOCUS KEEPS NO KEYS DOWN. Alt-tabbing while holding a direction
    // used to leave the character walking for ever, because the `keyup` was delivered to
    // whatever took the focus.
    bind(globalThis, 'blur', () => state().clear?.());

    const locate = event => {
        const box = canvas.getBoundingClientRect();
        const scale = density();
        const screenX = (event.clientX - box.left) * scale;
        const screenY = (event.clientY - box.top) * scale;
        const world = screenToWorld(view(), screenX, screenY);
        return { screenX, screenY, world };
    };

    const move = event => {
        const at = locate(event);
        const player = state();
        player.movePointer(at.screenX, at.screenY);
        player.movePointerInWorld(at.world.x, at.world.y);
    };

    bind(canvas, 'pointermove', move);
    bind(canvas, 'pointerdown', event => {
        move(event);
        // `event.button` is already the numbering `InputState` documents — 0 primary,
        // 1 auxiliary, 2 secondary — so nothing is translated.
        if (typeof event.button === 'number') state().pressButton(event.button);
    });
    bind(canvas, 'pointerup', event => {
        if (typeof event.button === 'number') state().releaseButton(event.button);
    });
    bind(canvas, 'pointercancel', event => {
        if (typeof event.button === 'number') state().releaseButton(event.button);
    });
    // A GAME OWNS ITS RIGHT BUTTON. Without this a right-click aims and opens the browser's
    // menu over the game at the same time.
    bind(canvas, 'contextmenu', event => event.preventDefault());

    return {
        stop: () => {
            for (const unbind of off) unbind();
            off.length = 0;
        }
    };
}
