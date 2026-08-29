// Dragging a label to change a number, and the edge of the screen that used to stop it.
//
// THE REGRESSION THIS FILE IS FOR: the value was `clientX - start`, so once the pointer
// reached the side of the display it stopped moving and the number stopped changing. The
// tests below drag PAST that point — `clientX` frozen, `movementX` still arriving, which
// is exactly what Pointer Lock reports — and expect the number to keep going.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SCRUB_PER_STEP, attachScrub } from './scrub.js';

/** A handle, with just enough of an element and its document to drive the gesture. */
function handle({ lockable = true } = {}) {
    const listeners = new Map();
    const classes = new Set();
    let lock = null;
    let captured = null;

    const element = {
        classList: {
            add: name => classes.add(name),
            remove: name => classes.delete(name),
            has: name => classes.has(name)
        },
        ownerDocument: {
            get pointerLockElement() { return lock; },
            exitPointerLock() { lock = null; }
        },
        requestPointerLock() {
            if (!lockable) return globalThis.Promise.reject(new Error('refused'));
            lock = element;
            return globalThis.Promise.resolve();
        },
        setPointerCapture(id) { captured = id; },
        releasePointerCapture() { captured = null; },
        hasPointerCapture(id) { return captured === id; },
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
        },
        removeEventListener(name, fn) { listeners.get(name)?.delete(fn); },

        // --- test-side helpers ---
        classes,
        listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
        locked: () => lock !== null,
        release: () => { lock = null; },
        send(name, event = {}) {
            for (const fn of [...(listeners.get(name) ?? [])]) {
                fn({ button: 0, pointerId: 1, clientX: 0, preventDefault() {}, ...event });
            }
        }
    };

    return element;
}

/** A handle already attached to a value, with everything written to it recorded. */
function scrubbing(options = {}) {
    const element = handle(options);
    const written = [];
    let value = 100;

    const detach = attachScrub(element, {
        read: () => value,
        write: next => { value = next; written.push(next); },
        step: () => options.step ?? 1
    });

    return { element, written, detach, last: () => written.at(-1) };
}

test('dragging right raises the number, one step every few pixels', () => {
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200 });
    it.element.send('pointermove', { clientX: 200 + SCRUB_PER_STEP * 3, movementX: SCRUB_PER_STEP * 3 });
    assert.equal(it.last(), 103);
});

test('dragging left lowers it', () => {
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200 });
    it.element.send('pointermove', { clientX: 200 - SCRUB_PER_STEP * 5, movementX: -SCRUB_PER_STEP * 5 });
    assert.equal(it.last(), 95);
});

test('the same rounded value is never written twice', () => {
    // A drag reports hundreds of moves for one step, and each write would be an Operation.
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200 });
    for (let x = 201; x <= 203; x++) it.element.send('pointermove', { clientX: x, movementX: 1 });
    assert.equal(it.written.length, 1);
});

test('the screen edge does not end the gesture', () => {
    // THE POINT OF THE FILE. Past the edge the cursor cannot move, so `clientX` repeats;
    // the lock keeps reporting how far the mouse actually travelled.
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 1900 });
    assert.equal(it.element.locked(), true, 'the drag asked for the cursor');

    for (let n = 0; n < 10; n++) {
        it.element.send('pointermove', { clientX: 1919, movementX: SCRUB_PER_STEP });
    }
    assert.equal(it.last(), 110);
});

test('a browser that refuses the lock still scrubs', () => {
    const it = scrubbing({ lockable: false });
    it.element.send('pointerdown', { clientX: 200 });
    it.element.send('pointermove', { clientX: 200 + SCRUB_PER_STEP * 4, movementX: SCRUB_PER_STEP * 4 });
    assert.equal(it.last(), 104);
});

test('losing the lock mid-drag continues from where the cursor is', () => {
    // Esc releases the cursor where the lock took it; the drag re-anchors there rather
    // than jumping by however far the mouse had travelled meanwhile.
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 500 });
    it.element.send('pointermove', { clientX: 500, movementX: SCRUB_PER_STEP * 6 });
    assert.equal(it.last(), 106);

    it.element.release();
    it.element.send('pointermove', { clientX: 500 + SCRUB_PER_STEP * 2, movementX: SCRUB_PER_STEP * 2 });
    assert.equal(it.last(), 108);
});

test('a step of ten moves the value by ten', () => {
    const it = scrubbing({ step: 10 });
    it.element.send('pointerdown', { clientX: 0 });
    it.element.send('pointermove', { clientX: SCRUB_PER_STEP * 2, movementX: SCRUB_PER_STEP * 2 });
    assert.equal(it.last(), 120);
});

test('releasing gives the cursor back', () => {
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200 });
    it.element.send('pointerup', {});
    assert.equal(it.element.locked(), false);
    assert.equal(it.element.classes.has('scrubbing'), false);
});

test('a cancelled gesture gives it back too', () => {
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200 });
    it.element.send('pointercancel', {});
    assert.equal(it.element.locked(), false);

    // And nothing is written afterwards.
    it.element.send('pointermove', { clientX: 400, movementX: 200 });
    assert.equal(it.written.length, 0);
});

test('detaching leaves no listeners behind', () => {
    const it = scrubbing();
    assert.ok(it.element.listenerCount() > 0);
    it.detach();
    assert.equal(it.element.listenerCount(), 0);
});

test('a right-click is not a drag', () => {
    const it = scrubbing();
    it.element.send('pointerdown', { clientX: 200, button: 2 });
    it.element.send('pointermove', { clientX: 400, movementX: 200 });
    assert.equal(it.written.length, 0);
    assert.equal(it.element.locked(), false);
});
