import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createId } from './id.js';

test('createId returns an id of the requested length', () => {
    assert.equal(createId().length, 12);
    assert.equal(createId(8).length, 8);
    assert.equal(createId(1).length, 1);
});

test('createId only uses the unambiguous alphabet', () => {
    const allowed = /^[0-9abcdefghjkmnpqrstvwxyz]+$/;
    for (let i = 0; i < 200; i++) {
        assert.match(createId(), allowed, 'id contains a character outside the alphabet');
    }
});

test('createId does not collide over a large sample', () => {
    const ids = new Set();
    for (let i = 0; i < 20_000; i++) ids.add(createId());
    assert.equal(ids.size, 20_000);
});

test('createId uses the whole alphabet', () => {
    // Guards against a masking mistake that would silently shrink the value space.
    const seen = new Set();
    for (let i = 0; i < 5_000; i++) {
        for (const character of createId()) seen.add(character);
    }
    assert.equal(seen.size, 32);
});

test('createId rejects an invalid length', () => {
    assert.throws(() => createId(0), RangeError);
    assert.throws(() => createId(-1), RangeError);
    assert.throws(() => createId(1.5), RangeError);
});
