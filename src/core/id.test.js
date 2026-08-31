import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createId } from './id.js';

test('createId returns an id of the requested length', () => {
    assert.equal(createId().length, 14);
    assert.equal(createId(8).length, 8);
    assert.equal(createId(1).length, 1);
});

test('createId only uses letters, and only unambiguous ones', () => {
    // AN IDENTIFIER IS READ ALOUD, TYPED FROM A SCREENSHOT AND PASTED INTO A URL, and a
    // digit beside a letter is where that goes wrong: `0`/`O`, `1`/`l` (ADR-0049).
    const allowed = /^[abcdefghjkmnpqrstvwxyz]+$/;
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
    assert.equal(seen.size, 22);
});

test('every letter is drawn about as often as every other', () => {
    // 22 DOES NOT DIVIDE 256, so masking or a bare remainder would make the first letters of
    // the alphabet likelier than the last — a bias that shrinks the real value space, and
    // that the test above would not catch because every letter would still appear.
    const counts = new Map();
    for (let i = 0; i < 20_000; i++) {
        for (const character of createId()) counts.set(character, (counts.get(character) ?? 0) + 1);
    }

    const frequencies = [...counts.values()];
    const flatness = Math.min(...frequencies) / Math.max(...frequencies);
    assert.ok(flatness > 0.9, `the alphabet is drawn unevenly (${flatness.toFixed(3)})`);
});

test('createId rejects an invalid length', () => {
    assert.throws(() => createId(0), RangeError);
    assert.throws(() => createId(-1), RangeError);
    assert.throws(() => createId(1.5), RangeError);
});
