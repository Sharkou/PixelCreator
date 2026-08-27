// The browser adapter: what it feeds, when it listens, and what it declines (ADR-0014).
//
// TESTED WITHOUT A BROWSER, ON PURPOSE. The adapter is the only piece of the input chain
// that knows what a `KeyboardEvent` is, and the interesting questions about it are not
// rendering questions: does a second Play attach a second set of listeners, does Stop take
// them away, and does a key typed into a field stay in the field. All three are answered by
// handing it a target that records what was attached — the same shape `windows/documents.js`
// is tested with, for the same reason.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../runtime/mod.js';
import { KeyboardInput, PointerInput } from './input.js';

/** A stand-in for the window, counting what is attached to it and dispatching by hand. */
function target() {
    const listeners = new Map();
    return {
        listeners,
        count: type => (listeners.get(type) ?? []).length,
        addEventListener(type, handler) {
            if (!listeners.has(type)) listeners.set(type, []);
            listeners.get(type).push(handler);
        },
        removeEventListener(type, handler) {
            const held = listeners.get(type) ?? [];
            const at = held.indexOf(handler);
            if (at >= 0) held.splice(at, 1);
        },
        send(type, event = {}) {
            for (const handler of [...(listeners.get(type) ?? [])]) handler(event);
        }
    };
}

function setup({ editing = () => false, owner = null } = {}) {
    const input = new Input();
    const window = target();
    const keyboard = new KeyboardInput({ input, target: window, editing, owner });
    return { input, window, keyboard };
}

test('an adapter needs an input to write into', () => {
    assert.throws(() => new KeyboardInput({ input: null }), TypeError);
    assert.throws(() => new KeyboardInput({ input: {} }), TypeError);
});

// --- what it feeds ----------------------------------------------------------------------

test('a key event reaches the state the runtime reads', () => {
    const { input, window, keyboard } = setup();
    keyboard.start();

    window.send('keydown', { code: 'Space' });
    assert.equal(input.local.isDown('Space'), true);

    window.send('keyup', { code: 'Space' });
    assert.equal(input.local.isDown('Space'), false);
});

test('a key is named by its code, so the physical key is what a graph names', () => {
    // `KeyW` is the same key on QWERTY and AZERTY, where `event.key` would read `z`, and it
    // does not change under Shift. ADR-0014 §2 names `code` as what an adapter writes in.
    const { input, window, keyboard } = setup();
    keyboard.start();

    window.send('keydown', { code: 'KeyW', key: 'z' });

    assert.deepEqual(input.local.keys(), ['KeyW']);
});

test('an event carrying no code is declined rather than pressing nothing', () => {
    const { input, window, keyboard } = setup();
    keyboard.start();

    window.send('keydown', {});
    window.send('keydown', { code: '' });

    assert.deepEqual(input.local.keys(), []);
});

test('the adapter fills in the owner it was given', () => {
    // The local player by default, which is what makes offline play work with no special
    // case; a named owner is the seam a networked client fills in (ADR-0014 §3).
    const { input, window, keyboard } = setup({ owner: 'alice' });
    keyboard.start();

    window.send('keydown', { code: 'Space' });

    assert.equal(input.of('alice').isDown('Space'), true);
    assert.equal(input.local.isDown('Space'), false);
});

// --- when it listens --------------------------------------------------------------------

test('Play, Stop, Play attaches one set of listeners and not two', () => {
    // THE CASE THIS FLAG EXISTS FOR. Two sets would press the same key twice, which a `Set`
    // hides — right up until something counts, and then it counts double.
    const { window, keyboard } = setup();

    keyboard.start();
    keyboard.start();
    assert.equal(window.count('keydown'), 1, 'starting twice does not attach twice');

    keyboard.stop();
    keyboard.start();
    assert.equal(window.count('keydown'), 1, 'a second session attaches one set');
    assert.equal(window.count('keyup'), 1);
    assert.equal(window.count('blur'), 1);
});

test('Stop takes every listener away', () => {
    const { window, keyboard } = setup();

    keyboard.start();
    keyboard.stop();

    assert.equal(keyboard.listening, false);
    for (const type of ['keydown', 'keyup', 'blur']) {
        assert.equal(window.count(type), 0, `${type} is still attached`);
    }
});

test('stopping twice is not an error, and stopping before starting is not either', () => {
    const { keyboard } = setup();

    assert.doesNotThrow(() => keyboard.stop());
    keyboard.start();
    keyboard.stop();
    assert.doesNotThrow(() => keyboard.stop());
});

test('a key still held when the session ends does not carry into the next one', () => {
    const { input, window, keyboard } = setup();
    keyboard.start();
    window.send('keydown', { code: 'Space' });

    keyboard.stop();

    assert.deepEqual(input.local.keys(), [], 'Stop released what was held');
    keyboard.start();
    assert.equal(input.local.isDown('Space'), false);
});

test('losing the window releases everything, so a key held on the way out is not stuck', () => {
    const { input, window, keyboard } = setup();
    keyboard.start();
    window.send('keydown', { code: 'ArrowRight' });

    window.send('blur');

    assert.deepEqual(input.local.keys(), []);
});

// --- what it declines -------------------------------------------------------------------

test('a key typed into a field is not also a game action', () => {
    // The rule the Editor already applies to its own shortcuts (`ui/focus.js`), applied to
    // the running game: a creator renaming an object types `w` and nothing walks.
    let typing = false;
    const { input, window, keyboard } = setup({ editing: () => typing });
    keyboard.start();

    typing = true;
    window.send('keydown', { code: 'KeyW' });
    assert.deepEqual(input.local.keys(), [], 'the field kept the key');

    typing = false;
    window.send('keydown', { code: 'KeyW' });
    assert.deepEqual(input.local.keys(), ['KeyW'], 'and the canvas gets it back');
});

test('the field rule applies to releases too, and the window still releases everything', () => {
    let typing = false;
    const { input, window, keyboard } = setup({ editing: () => typing });
    keyboard.start();
    window.send('keydown', { code: 'KeyW' });

    typing = true;
    window.send('keyup', { code: 'KeyW' });
    assert.equal(input.local.isDown('KeyW'), true, 'a release aimed at a field is not ours');

    // Which is why `blur` does not ask: it is the backstop for exactly this.
    window.send('blur');
    assert.deepEqual(input.local.keys(), []);
});

// --- no DOM -----------------------------------------------------------------------------

test('the adapter is the only side that knows about events, and it is not required to', () => {
    // Running this under Node at all is the proof: `Input` is imported here from the runtime
    // and never learns where its keys came from.
    assert.equal(typeof globalThis.KeyboardEvent, 'undefined');

    const { input, window, keyboard } = setup();
    keyboard.start();
    window.send('keydown', { code: 'Space' });

    assert.equal(input.local.isDown('Space'), true);
});

// --- the pointer (ADR-0038) --------------------------------------------------------------
//
// The interesting questions are the same three as for the keyboard — what it feeds, when it
// listens, what it declines — plus the one only a pointer has: it never does arithmetic of
// its own. `locate` is the Viewport's answer, and the conversion behind it is checked in
// `viewport/surface.test.js` against the matrices the renderer draws with.

/** The Viewport's answer, faked: a surface 240 px into the page, at 1:1, camera at origin. */
function locator() {
    const calls = [];
    const locate = (clientX, clientY) => {
        calls.push([clientX, clientY]);
        return {
            screenX: clientX - 240,
            screenY: clientY - 56,
            worldX: clientX - 240 - 400,
            worldY: clientY - 56 - 300
        };
    };
    return { calls, locate };
}

function pointing({ owner = null } = {}) {
    const input = new Input();
    const surface = target();
    const window = target();
    const { calls, locate } = locator();
    const pointer = new PointerInput({ input, target: surface, locate, window, owner });
    return { input, surface, window, calls, pointer };
}

test('a pointer adapter needs an input, a surface and a way to locate a point', () => {
    const surface = target();
    const locate = () => ({ screenX: 0, screenY: 0, worldX: 0, worldY: 0 });

    assert.throws(() => new PointerInput({ input: null, target: surface, locate }), TypeError);
    assert.throws(() => new PointerInput({ input: new Input(), target: null, locate }), TypeError);
    assert.throws(() => new PointerInput({ input: new Input(), target: surface, locate: null }), TypeError);
});

// --- what it feeds ----------------------------------------------------------------------

test('a move writes both spaces, and neither is the page coordinate', () => {
    // THE POINT OF THE WHOLE ADAPTER. A page coordinate reaching the Runtime would put every
    // click hundreds of units off the moment anyone panned.
    const { input, surface, pointer } = pointing();
    pointer.start();

    surface.send('pointermove', { clientX: 640, clientY: 356 });

    const state = input.local;
    assert.deepEqual([state.pointerX, state.pointerY], [400, 300], 'screen is from the surface');
    assert.deepEqual([state.pointerWorldX, state.pointerWorldY], [0, 0], 'and the centre is the origin');
});

test('the adapter does no arithmetic of its own — it asks, and writes the answer', () => {
    const { input, surface, calls, pointer } = pointing();
    pointer.start();

    surface.send('pointermove', { clientX: 900, clientY: 456 });

    assert.deepEqual(calls, [[900, 456]], 'the page coordinate is what it hands over');
    assert.deepEqual([input.local.pointerWorldX, input.local.pointerWorldY], [260, 100]);
});

test('a press carries a position, so a tap is a click where the finger landed', () => {
    // A touch pointer has never moved before it presses: reading the button without the
    // position would be a click at wherever a mouse last left the cursor.
    const { input, surface, pointer } = pointing();
    pointer.start();

    surface.send('pointerdown', { clientX: 740, clientY: 406, button: 0 });

    assert.deepEqual([input.local.pointerWorldX, input.local.pointerWorldY], [100, 50]);
    assert.equal(input.local.isButtonDown(0), true);
});

test('a button is held until it is released, and the index is the DOM\'s', () => {
    const { input, surface, window, pointer } = pointing();
    pointer.start();

    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 2 });
    assert.equal(input.local.isButtonDown(2), true);
    assert.equal(input.local.isButtonDown(0), false, 'right is not primary');

    window.send('pointerup', { clientX: 640, clientY: 356, button: 2 });
    assert.equal(input.local.isButtonDown(2), false);
});

test('the adapter fills in the owner it was given', () => {
    const { input, surface, pointer } = pointing({ owner: 'alice' });
    pointer.start();

    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 0 });

    assert.equal(input.of('alice').isButtonDown(0), true);
    assert.equal(input.local.isButtonDown(0), false);
    assert.deepEqual([input.of('alice').pointerWorldX, input.of('alice').pointerWorldY], [0, 0]);
});

test('an event with no button index is declined rather than pressing button undefined', () => {
    const { input, surface, pointer } = pointing();
    pointer.start();

    surface.send('pointerdown', { clientX: 640, clientY: 356 });

    assert.deepEqual(input.local.buttons(), []);
});

// --- when it listens --------------------------------------------------------------------

test('Play, Stop, Play attaches one set of listeners and not two', () => {
    const { surface, window, pointer } = pointing();

    pointer.start();
    pointer.start();
    assert.equal(surface.count('pointermove'), 1, 'starting twice does not attach twice');

    pointer.stop();
    pointer.start();
    assert.equal(surface.count('pointermove'), 1);
    assert.equal(surface.count('pointerdown'), 1);
    assert.equal(window.count('pointerup'), 1);
    assert.equal(window.count('pointercancel'), 1);
    assert.equal(window.count('blur'), 1);
});

test('Stop takes every listener away, on the surface and on the window', () => {
    const { surface, window, pointer } = pointing();

    pointer.start();
    pointer.stop();

    assert.equal(pointer.listening, false);
    for (const type of ['pointermove', 'pointerdown']) {
        assert.equal(surface.count(type), 0, `${type} is still on the surface`);
    }
    for (const type of ['pointerup', 'pointercancel', 'blur']) {
        assert.equal(window.count(type), 0, `${type} is still on the window`);
    }
});

test('stopping twice is not an error, and stopping before starting is not either', () => {
    const { pointer } = pointing();

    assert.doesNotThrow(() => pointer.stop());
    pointer.start();
    pointer.stop();
    assert.doesNotThrow(() => pointer.stop());
});

test('a button still held when the session ends does not carry into the next one', () => {
    const { input, surface, pointer } = pointing();
    pointer.start();
    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 0 });

    pointer.stop();

    assert.deepEqual(input.local.buttons(), []);
    assert.deepEqual([input.local.pointerWorldX, input.local.pointerWorldY], [0, 0]);
});

// --- what it declines -------------------------------------------------------------------

test('a press that never reached the game surface is not a click in the game', () => {
    // The pointer's whole focus rule, and why no notion of "game focus" is invented here: a
    // press in the Inspector is aimed somewhere else, so it never arrives. Only the release
    // passes the window on its way by, and a release of something never held changes nothing.
    const { input, window, pointer } = pointing();
    pointer.start();

    window.send('pointerup', { clientX: 1300, clientY: 200, button: 0 });
    input.commit();

    assert.deepEqual(input.local.buttons(), []);
    assert.equal(input.local.buttonReleased(0), false, 'and it is not a release either');
});

test('a release outside the surface still ends the press that started on it', () => {
    // A drag that ran off the canvas: the release lands on the window, and without it the
    // button would stay held forever. `commit()` is the step boundary the runtime draws, so
    // the press is observed by one step and the release by the next — the same shape a key
    // has, and the reason a press and a release inside ONE step is not a click.
    const { input, surface, window, pointer } = pointing();
    pointer.start();
    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 0 });

    assert.equal(input.local.buttonPressed(0), true);
    input.commit();

    window.send('pointerup', { clientX: 1300, clientY: 900, button: 0 });

    assert.equal(input.local.isButtonDown(0), false);
    assert.equal(input.local.buttonReleased(0), true, 'observed as a release, once');
    input.commit();
    assert.equal(input.local.buttonReleased(0), false, 'and only once');
});

test('a pointer the platform took away is released rather than left held', () => {
    const { input, surface, window, pointer } = pointing();
    pointer.start();
    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 0 });

    window.send('pointercancel', { clientX: 640, clientY: 356, button: 0 });

    assert.equal(input.local.isButtonDown(0), false);
});

test('losing the window releases every button', () => {
    const { input, surface, window, pointer } = pointing();
    pointer.start();
    surface.send('pointerdown', { clientX: 640, clientY: 356, button: 0 });

    window.send('blur');

    assert.deepEqual(input.local.buttons(), []);
});
