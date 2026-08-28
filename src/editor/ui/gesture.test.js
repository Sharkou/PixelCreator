// One press-drag-release, and the ending that must always come.
//
// THE REGRESSION THIS FILE IS FOR: a gesture that starts and never ends. Every symptom the
// panel showed — a component stuck half-lifted, a ghost that would not go away, rows that
// never slid back — is one missing call to `end`. So the tests are about the ENDING, and
// there is one per way a gesture can stop.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ClickGuard, onDrag } from './gesture.js';

/** A DOM handle, with just enough of an element to drive the primitive. */
function handle() {
    const listeners = new Map();
    let captured = null;

    return {
        captured: () => captured,
        listenerCount: () => [...listeners.values()].reduce((total, set) => total + set.size, 0),
        addEventListener(name, fn) {
            if (!listeners.has(name)) listeners.set(name, new Set());
            listeners.get(name).add(fn);
        },
        removeEventListener(name, fn) {
            listeners.get(name)?.delete(fn);
        },
        setPointerCapture(id) { captured = id; },
        releasePointerCapture() { captured = null; },
        hasPointerCapture(id) { return captured === id; },
        send(name, event = {}) {
            for (const fn of [...(listeners.get(name) ?? [])]) fn({ button: 0, pointerId: 1, ...event });
        },
        contains: () => false
    };
}

/** A gesture watcher, with everything it was told recorded. */
function watching(options = {}) {
    const element = handle();
    const endings = [];
    const moves = [];
    const stop = onDrag(element, {
        move: (event, gesture) => moves.push({ x: event.clientX, travelled: gesture.travelled }),
        end: ending => endings.push(ending),
        ...options
    });

    const press = (x = 0, y = 0) => element.send('pointerdown', { clientX: x, clientY: y });
    const move = (x, y = 0) => element.send('pointermove', { clientX: x, clientY: y });

    return { element, endings, moves, stop, press, move };
}

// --- the ending always comes ------------------------------------------------------------

test('a release ends the gesture, and says it was not cancelled', () => {
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.element.send('pointerup', { clientX: 20, clientY: 0 });

    assert.equal(it.endings.length, 1);
    assert.equal(it.endings[0].cancelled, false);
    assert.equal(it.endings[0].travelled, true);
});

test('a pointercancel ends it too, and says so', () => {
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.element.send('pointercancel', {});

    assert.equal(it.endings.length, 1);
    assert.equal(it.endings[0].cancelled, true);
});

test('LOSING THE CAPTURE ends it — the one nobody writes by hand', () => {
    // The commonest way this happened in the panel: a redraw replaces the element the press
    // is captured on, the capture goes with it, and no pointerup is ever delivered. Without
    // this listener the gesture simply never ends, which is the stuck component.
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.element.send('lostpointercapture', {});

    assert.equal(it.endings.length, 1, 'a lost capture is an ending');
    assert.equal(it.endings[0].cancelled, true);
});

test('a press that never travelled still ends, and says it did not travel', () => {
    const it = watching();

    it.press(0, 0);
    it.element.send('pointerup', { clientX: 1, clientY: 0 });

    assert.equal(it.endings.length, 1);
    assert.equal(it.endings[0].travelled, false, 'a click is a gesture that went nowhere');
    assert.deepEqual(it.moves, [], 'and nothing was reported as a move');
});

test('the ending runs exactly once, whatever arrives afterwards', () => {
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.element.send('pointerup', { clientX: 20, clientY: 0 });
    it.element.send('pointerup', { clientX: 20, clientY: 0 });
    it.element.send('pointercancel', {});
    it.element.send('lostpointercapture', {});

    assert.equal(it.endings.length, 1);
});

test('an end that redraws cannot end the same gesture twice', () => {
    // Every `end` in this Editor redraws something, and a redraw can deliver another event
    // synchronously. The gesture is cleared BEFORE `end` runs, so re-entry finds nothing.
    const element = handle();
    const endings = [];
    onDrag(element, {
        end: ending => {
            endings.push(ending);
            element.send('pointerup', { clientX: 0, clientY: 0 });
            element.send('lostpointercapture', {});
        }
    });

    element.send('pointerdown', { clientX: 0, clientY: 0 });
    element.send('pointerup', { clientX: 0, clientY: 0 });

    assert.equal(endings.length, 1);
});

// --- what it leaves behind --------------------------------------------------------------

test('capture is taken at the press and given back at the ending', () => {
    const it = watching();

    it.press(0, 0);
    assert.equal(it.element.captured(), 1, 'captured from the first pixel, not from the threshold');

    it.element.send('pointerup', { clientX: 0, clientY: 0 });
    assert.equal(it.element.captured(), null);
});

test('every listener the gesture added is removed when it ends', () => {
    const it = watching();
    const idle = it.element.listenerCount();

    it.press(0, 0);
    assert.ok(it.element.listenerCount() > idle, 'a live gesture listens');

    it.element.send('pointercancel', {});
    assert.equal(it.element.listenerCount(), idle, 'and an ended one does not');
});

test('a second press ends the first gesture rather than running two', () => {
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.press(0, 0);

    assert.equal(it.endings.length, 1, 'the orphan was ended');
    assert.equal(it.endings[0].cancelled, true);
});

test('watching can be stopped, and stopping ends a gesture in flight', () => {
    const it = watching();

    it.press(0, 0);
    it.move(20, 0);
    it.stop();

    assert.equal(it.endings.length, 1);
    it.press(0, 0);
    assert.equal(it.endings.length, 1, 'and no new gesture starts');
});

// --- the threshold ------------------------------------------------------------------------

test('nothing is reported as a move until the pointer has really travelled', () => {
    const it = watching();

    it.press(0, 0);
    it.move(1, 0);
    it.move(2, 0);
    assert.deepEqual(it.moves, [], 'a hand resting on a button is not a drag');

    it.move(20, 0);
    assert.equal(it.moves.length, 1);
    assert.equal(it.moves[0].travelled, true);

    it.move(21, 0);
    assert.equal(it.moves.length, 2, 'and every move after it counts');
});

test('a refused press starts nothing', () => {
    const it = watching({ start: () => false });

    it.press(0, 0);
    it.move(20, 0);

    assert.deepEqual(it.moves, []);
    assert.equal(it.element.captured(), null);
    assert.equal(it.endings.length, 0, 'nothing began, so nothing ends');
});

test('a press that is not the primary button is not a gesture', () => {
    const it = watching();

    it.element.send('pointerdown', { button: 2, clientX: 0, clientY: 0 });

    assert.equal(it.element.captured(), null, 'a right-click opens a menu, it does not drag');
});

// --- the click that is really the tail of a drag ------------------------------------------

test('a guard swallows the click on the element it was armed for, once', () => {
    const guard = new ClickGuard();
    const header = { contains: () => false };

    guard.arm(header);

    assert.equal(guard.swallows(header), true);
    assert.equal(guard.swallows(header), false, 'one drag, one swallowed click');
});

test('a guard never swallows a click on something else', () => {
    // THE BUG THIS REPLACES. A panel-wide flag was cleared by the next click on ANY
    // foldable thing, so a drag on one component ate a fold on another, later.
    const guard = new ClickGuard();
    const dragged = { contains: () => false };
    const other = { contains: () => false };

    guard.arm(dragged);

    assert.equal(guard.swallows(other), false, 'a different header folds normally');
});

test('a guard that is never asked is disarmed by the next press', () => {
    const guard = new ClickGuard();
    const header = { contains: () => false };

    guard.arm(header);
    guard.disarm();

    assert.equal(guard.swallows(header), false, 'a trap cannot outlive the gesture that set it');
});

test('a click inside the armed element is the same click', () => {
    const guard = new ClickGuard();
    const caret = {};
    const header = { contains: node => node === caret };

    guard.arm(header);

    assert.equal(guard.swallows(caret), true, 'the caret is part of the header');
});
