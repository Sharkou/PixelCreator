import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeReactive, observe, isReactive, applyProperty, ownKeys } from './reactive.js';
import { Origin, currentOrigin, withOrigin } from './origin.js';

function reactiveTarget(values = {}) {
    return makeReactive({ ...values });
}

test('a write is visible through the proxy', () => {
    const target = reactiveTarget({ x: 0 });
    target.x = 100;
    assert.equal(target.x, 100);
});

test('a write emits a Change carrying the previous value', () => {
    const target = reactiveTarget({ x: 10 });
    const changes = [];
    observe(target, 'x', change => changes.push(change));

    target.x = 100;

    assert.equal(changes.length, 1);
    assert.equal(changes[0].prop, 'x');
    assert.equal(changes[0].value, 100);
    assert.equal(changes[0].previous, 10);
    assert.equal(changes[0].object, target);
    assert.equal(changes[0].component, null);
});

test('observing every property receives all changes', () => {
    const target = reactiveTarget({ x: 0, y: 0 });
    const seen = [];
    observe(target, change => seen.push(change.prop));

    target.x = 1;
    target.y = 2;

    assert.deepEqual(seen, ['x', 'y']);
});

test('observe returns an unsubscribe function', () => {
    const target = reactiveTarget({ x: 0 });
    let calls = 0;
    const off = observe(target, 'x', () => { calls++; });

    target.x = 1;
    off();
    target.x = 2;

    assert.equal(calls, 1);
});

test('writing an unchanged value emits nothing', () => {
    const target = reactiveTarget({ x: 5 });
    let calls = 0;
    observe(target, 'x', () => { calls++; });

    target.x = 5;

    assert.equal(calls, 0);
});

test('a property added after creation is reactive', () => {
    // Legacy could not do this: System.sync() froze the property list at construction,
    // so anything added later was silently inert.
    const target = reactiveTarget({});
    const changes = [];
    observe(target, 'health', change => changes.push(change));

    target.health = 100;
    target.health = 50;

    assert.equal(target.health, 50);
    assert.deepEqual(changes.map(change => change.value), [100, 50]);
});

test('no shadow storage leaks into the keys', () => {
    // Legacy stored `_prop` and `$prop` next to every property, tripling the payload.
    const target = reactiveTarget({ x: 1, y: 2, name: 'Player' });
    target.x = 10;

    assert.deepEqual(ownKeys(target), ['x', 'y', 'name']);
    assert.deepEqual(globalThis.Object.keys(target), ['x', 'y', 'name']);
    assert.equal(target._x, undefined);
    assert.equal(target.__x, undefined);
    assert.equal(target.$x, undefined);
});

test('the reactive marker stays out of enumeration and JSON', () => {
    const target = reactiveTarget({ x: 1 });
    assert.deepEqual(JSON.parse(JSON.stringify(target)), { x: 1 });
    assert.equal(globalThis.Object.getOwnPropertySymbols(target).length, 1);
});

test('changes default to the local origin', () => {
    const target = reactiveTarget({ x: 0 });
    let origin = null;
    observe(target, 'x', change => { origin = change.origin; });

    target.x = 1;

    assert.equal(origin, Origin.LOCAL);
});

test('withOrigin scopes the origin and restores it', () => {
    const target = reactiveTarget({ x: 0 });
    const origins = [];
    observe(target, 'x', change => origins.push(change.origin));

    withOrigin(Origin.RUNTIME, () => { target.x = 1; });
    target.x = 2;

    assert.deepEqual(origins, [Origin.RUNTIME, Origin.LOCAL]);
    assert.equal(currentOrigin(), Origin.LOCAL);
});

test('withOrigin restores the origin even when the function throws', () => {
    assert.throws(() => withOrigin(Origin.EDITOR, () => { throw new Error('boom'); }));
    assert.equal(currentOrigin(), Origin.LOCAL);
});

test('applyProperty writes under the given origin', () => {
    const target = reactiveTarget({ x: 0 });
    let change = null;
    observe(target, 'x', received => { change = received; });

    applyProperty(target, 'x', 42, Origin.NETWORK);

    assert.equal(target.x, 42);
    assert.equal(change.origin, Origin.NETWORK);
});

test('isReactive distinguishes wrapped targets', () => {
    assert.equal(isReactive(reactiveTarget({})), true);
    assert.equal(isReactive({}), false);
    assert.equal(isReactive(null), false);
    assert.equal(isReactive(42), false);
});

test('wrapping the same target twice returns the same proxy', () => {
    const raw = { x: 1 };
    const first = makeReactive(raw);
    const second = makeReactive(raw);
    assert.equal(first, second);
});

test('writing a read-only property throws', () => {
    const raw = {};
    globalThis.Object.defineProperty(raw, 'id', { value: 'fixed', enumerable: true, writable: false });
    const target = makeReactive(raw);

    assert.throws(() => { target.id = 'other'; }, TypeError);
    assert.equal(target.id, 'fixed');
});

test('observing an unrelated property is not notified', () => {
    const target = reactiveTarget({ x: 0, y: 0 });
    let calls = 0;
    observe(target, 'y', () => { calls++; });

    target.x = 1;

    assert.equal(calls, 0);
});

test('observe rejects a non-reactive target', () => {
    assert.throws(() => observe({}, 'x', () => {}), TypeError);
});
