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
import { KeyboardInput } from './input.js';

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
