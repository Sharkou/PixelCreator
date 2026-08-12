import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Emitter } from './events.js';

test('emit notifies listeners with the payload', () => {
    const emitter = new Emitter();
    const seen = [];
    emitter.on('change', payload => seen.push(payload));

    const notified = emitter.emit('change', { prop: 'x', value: 100 });

    assert.equal(notified, 1);
    assert.deepEqual(seen, [{ prop: 'x', value: 100 }]);
});

test('emit on an event with no listener is a no-op', () => {
    const emitter = new Emitter();
    assert.equal(emitter.emit('change', 1), 0);
});

test('listeners run in subscription order', () => {
    const emitter = new Emitter();
    const order = [];
    emitter.on('change', () => order.push('first'));
    emitter.on('change', () => order.push('second'));
    emitter.on('change', () => order.push('third'));

    emitter.emit('change');

    assert.deepEqual(order, ['first', 'second', 'third']);
});

test('dispatch is synchronous', () => {
    const emitter = new Emitter();
    let value = 'before';
    emitter.on('change', () => { value = 'during'; });

    emitter.emit('change');

    // This is what letter-by-letter Editor synchronization relies on: the change is
    // fully observed by the time emit() returns.
    assert.equal(value, 'during');
});

test('on returns an unsubscribe function', () => {
    const emitter = new Emitter();
    let calls = 0;
    const off = emitter.on('change', () => { calls++; });

    emitter.emit('change');
    off();
    emitter.emit('change');

    assert.equal(calls, 1);
    assert.equal(emitter.listenerCount('change'), 0);
});

test('unsubscribing twice is safe', () => {
    const emitter = new Emitter();
    const off = emitter.on('change', () => {});

    off();
    assert.doesNotThrow(() => off());
    assert.equal(emitter.listenerCount('change'), 0);
});

test('off reports whether the listener was subscribed', () => {
    const emitter = new Emitter();
    const listener = () => {};
    emitter.on('change', listener);

    assert.equal(emitter.off('change', listener), true);
    assert.equal(emitter.off('change', listener), false);
    assert.equal(emitter.off('unknown', listener), false);
});

test('listeners do not accumulate once unsubscribed', () => {
    // Legacy declared removeEventListener but never called it, so every panel and every
    // script import leaked a listener for the lifetime of the page.
    const emitter = new Emitter();

    for (let i = 0; i < 100; i++) emitter.on('change', () => {})();

    assert.equal(emitter.listenerCount(), 0);
});

test('a throwing listener does not starve the following ones', () => {
    // In Legacy an error in one listener aborted the dispatch loop, so every listener
    // registered after it silently missed the event.
    const errors = [];
    const emitter = new Emitter({ onError: error => errors.push(error) });
    const reached = [];

    emitter.on('change', () => reached.push('before'));
    emitter.on('change', () => { throw new Error('listener failure'); });
    emitter.on('change', () => reached.push('after'));

    emitter.emit('change');

    assert.deepEqual(reached, ['before', 'after']);
    assert.equal(errors.length, 1);
    assert.equal(errors[0].message, 'listener failure');
});

test('onError receives the event name and payload', () => {
    const seen = [];
    const emitter = new Emitter({ onError: (error, event, payload) => seen.push({ event, payload }) });
    emitter.on('change', () => { throw new Error('boom'); });

    emitter.emit('change', { prop: 'x' });

    assert.deepEqual(seen, [{ event: 'change', payload: { prop: 'x' } }]);
});

test('subscribing during a dispatch does not affect that dispatch', () => {
    const emitter = new Emitter();
    let lateCalls = 0;

    emitter.on('change', () => {
        emitter.on('change', () => { lateCalls++; });
    });

    emitter.emit('change');
    assert.equal(lateCalls, 0, 'the listener added mid-dispatch must not run for that same emit');

    emitter.emit('change');
    assert.equal(lateCalls, 1);
});

test('unsubscribing during a dispatch does not affect that dispatch', () => {
    const emitter = new Emitter();
    const reached = [];
    let off;

    emitter.on('change', () => { off(); });
    off = emitter.on('change', () => reached.push('second'));

    emitter.emit('change');
    assert.deepEqual(reached, ['second'], 'the snapshot keeps the dispatch predictable');

    emitter.emit('change');
    assert.deepEqual(reached, ['second']);
});

test('the same listener is only registered once per event', () => {
    const emitter = new Emitter();
    let calls = 0;
    const listener = () => { calls++; };

    emitter.on('change', listener);
    emitter.on('change', listener);
    emitter.emit('change');

    assert.equal(calls, 1);
    assert.equal(emitter.listenerCount('change'), 1);
});

test('events are independent of one another', () => {
    const emitter = new Emitter();
    const seen = [];
    emitter.on('added', () => seen.push('added'));
    emitter.on('removed', () => seen.push('removed'));

    emitter.emit('added');

    assert.deepEqual(seen, ['added']);
});

test('clear removes one event or all of them', () => {
    const emitter = new Emitter();
    emitter.on('added', () => {});
    emitter.on('removed', () => {});

    emitter.clear('added');
    assert.equal(emitter.listenerCount('added'), 0);
    assert.equal(emitter.listenerCount('removed'), 1);

    emitter.clear();
    assert.equal(emitter.listenerCount(), 0);
});

test('on rejects a non-function listener', () => {
    const emitter = new Emitter();
    assert.throws(() => emitter.on('change', null), TypeError);
    assert.throws(() => emitter.on('change', 'handler'), TypeError);
});

test('emitters are independent instances', () => {
    // Legacy kept a single global System.events map, which is why the parity harness
    // has to snapshot and restore it between scenarios.
    const first = new Emitter();
    const second = new Emitter();
    let calls = 0;
    first.on('change', () => { calls++; });

    second.emit('change');

    assert.equal(calls, 0);
});
