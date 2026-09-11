// The stream itself: reproducible, and independent of its neighbours (ADR-0057).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Random, advance, unitOf } from './random.js';

/** The first `count` draws of a stream. */
function draws(seed, count = 20) {
    const stream = new Random(seed);
    return globalThis.Array.from({ length: count }, () => stream.next());
}

test('one seed is one run, however many times it is run', () => {
    assert.deepEqual(draws('level-one'), draws('level-one'));
});

test('two seeds are two runs', () => {
    assert.notDeepEqual(draws('level-one'), draws('level-two'));
});

test('a seed that differs by one character gives an unrelated stream', () => {
    // WHAT MAKES `seed:random` AND `seed:ids` INDEPENDENT. They are derived by NAME from one
    // seed, so the derivation has to spread neighbouring strings — otherwise the two streams
    // would run a few draws apart rather than apart.
    const [first] = draws('abc', 1);
    const [second] = draws('abd', 1);
    assert.notEqual(first, second);

    const together = draws('abc', 40);
    const apart = draws('abd', 40);
    assert.equal(apart.some(value => together.includes(value)), false, 'no shared draw');
});

test('every draw is a number from 0 inclusive to 1 exclusive', () => {
    for (const value of draws('bounds', 500)) {
        assert.equal(value >= 0 && value < 1, true, `${value} is out of range`);
    }
});

test('a coin flip is a coin flip, which the low bits of an LCG are not', () => {
    // THE REASON `unitOf()` DROPS THE LOW BYTE. Read whole, the last bit of an LCG state
    // alternates, so `next() < 0.5` comes out heads-tails-heads-tails for ever — patterned in
    // exactly the place a creator meets it first.
    const flips = draws('coin', 200).map(value => value < 0.5);

    let alternations = 0;
    for (let index = 1; index < flips.length; index++) {
        if (flips[index] !== flips[index - 1]) alternations++;
    }
    assert.equal(alternations < flips.length - 1, true, 'not a perfect alternation');

    const heads = flips.filter(Boolean).length;
    assert.equal(heads > 60 && heads < 140, true, `${heads} heads in 200 is not a coin`);
});

test('between maps a draw onto two bounds, and takes them as they are given', () => {
    const stream = new Random('between');
    for (let index = 0; index < 200; index++) {
        const value = stream.between(10, 20);
        assert.equal(value >= 10 && value < 20, true, `${value}`);
    }

    const backwards = new Random('between');
    const value = backwards.between(20, 10);
    assert.equal(value <= 20 && value > 10, true, 'reversed bounds count down rather than fail');
});

test('a stream fills bytes, which is how an identity is minted from it', () => {
    const first = new Random('bytes').fill(new Uint8Array(16));
    const second = new Random('bytes').fill(new Uint8Array(16));

    assert.deepEqual([...first], [...second], 'the same seed fills the same bytes');
    assert.equal(new Set(first).size > 1, true, 'and they are not all one value');
    assert.notDeepEqual([...new Random('other').fill(new Uint8Array(16))], [...first]);
});

test('drawing bytes and drawing numbers advance the same one stream', () => {
    // A STREAM HAS ONE POSITION. Two readers of it interleave rather than repeat, which is
    // what makes "one seed, one run" true whatever the callers do.
    const stream = new Random('shared');
    const before = stream.next();
    stream.fill(new Uint8Array(4));
    const after = stream.next();

    assert.notEqual(before, after);
});

test('the generator is one function, and it is the one a component may own', () => {
    // `ParticleSystem` keeps its own position in the stream and steps through this — the
    // constants live in one place (ADR-0057 §5).
    let state = 1;
    const walked = [];
    for (let index = 0; index < 5; index++) {
        state = advance(state);
        walked.push(unitOf(state));
    }

    assert.equal(new Set(walked).size, 5, 'five distinct values');
    assert.deepEqual(walked.map(value => value >= 0 && value < 1), walked.map(() => true));
    assert.equal(advance(1), advance(1), 'and it is a function of the state alone');
});
