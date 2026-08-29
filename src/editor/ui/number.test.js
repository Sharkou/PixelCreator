// What a number field lets through while it is being typed into (ADR-0045 §7).
//
// THE REGRESSION THIS FILE IS FOR: typing one letter emptied a field that still held a
// value. `12a` was admitted, `Number('12a')` is NaN, and `format(NaN)` is `''` — so a
// position of 120 read as nothing until the panel was rebuilt. The rule below is the fix,
// and it is written about the RESULTING TEXT so that one rule covers a keystroke, a paste,
// a drop and dictation alike.
//
// The half-typed entries matter as much as the refusals: a control that refuses `-` is
// unusable, because `-` is how `-5` starts.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { admits, format, parse } from './number.js';

test('a number is admitted', () => {
    for (const text of ['0', '12', '-5', '3.5', '-0.25', '+7']) {
        assert.equal(admits(text), true, `${text} is a number`);
    }
});

test('what is only on the way to a number is admitted too', () => {
    // Refusing any of these is refusing the keystroke that starts the value.
    for (const text of ['', '-', '+', '.', '1.', '-.', '1e', '1e-', '-1.5e']) {
        assert.equal(admits(text), true, `${text} is on the way to a number`);
    }
});

test('a letter never gets in', () => {
    for (const text of ['a', '12a', '1.2.3', '12px', '1,5', '--1', '1-2', ' 12']) {
        assert.equal(admits(text), false, `${text} is not on the way to a number`);
    }
});

test('an exponent survives, because the field can display one', () => {
    // `format()` shortens a very small number to `1e-7`; a control that refused to accept
    // what it had just shown could not re-parse its own value.
    assert.equal(admits('1e-7'), true);
    assert.equal(admits('1.5e+10'), true);
});

test('a whole-number field takes no point and no exponent', () => {
    const integer = { integer: true };
    assert.equal(admits('12', integer), true);
    assert.equal(admits('-12', integer), true);
    assert.equal(admits('1.', integer), false);
    assert.equal(admits('1.5', integer), false);
    assert.equal(admits('1e3', integer), false);
});

test('a field that cannot go below zero refuses the sign as it is typed', () => {
    // Not a taste: `-5` would be clamped to `0` on read, so admitting the sign only to
    // take it away is the control arguing with the person using it.
    assert.equal(admits('-', { min: 0 }), false);
    assert.equal(admits('-5', { min: 0 }), false);
    assert.equal(admits('-5', { min: -10 }), true);
    assert.equal(admits('-5', { min: null }), true);
    assert.equal(admits('5', { min: 0 }), true);
});

test('a bound below zero is not a bound on the sign', () => {
    assert.equal(admits('-', { min: -1 }), true);
});

test('what is shown is the value, without binary float noise', () => {
    assert.equal(format(12), '12');
    assert.equal(format(-0.25), '-0.25');
    // 0.1 nudged three times; a panel full of the raw form is unreadable.
    assert.equal(format(0.30000000000000004), '0.3');
    assert.equal(format(0), '0');
});

test('a value with no number in it shows nothing', () => {
    assert.equal(format(null), '');
    assert.equal(format(NaN), '');
    assert.equal(format(Infinity), '');
});

test('the field can re-read everything it displays', () => {
    // The two rules are inverses: whatever `format()` writes into the box must survive
    // being typed back into it, or the control argues with its own output.
    for (const value of [12, -0.25, 1e-7, 1.5e21, 0.3]) {
        assert.equal(admits(format(value)), true, `${format(value)} is re-readable`);
    }
});

test('an empty box is holding nothing, not zero', () => {
    // THE DEFECT THIS PAIR OF LINES IS FOR. `Number('')` is 0, so a field cleared on the way
    // to being retyped read as the value zero — and leaving it put 0 on screen for an object
    // the scene still had at 200. Every other half-typed entry answered NaN already; the
    // empty string was the one that answered a plausible lie.
    assert.equal(parse(''), null);
    assert.equal(parse('   '), null);
    assert.equal(parse(null), null);
});

test('what is still on the way to a number is not one yet either', () => {
    for (const text of ['-', '+', '.', '1e', '-1.5e']) {
        assert.equal(parse(text), null, `${text} is not a value yet`);
    }
});

test('a number is read as itself', () => {
    assert.equal(parse('0'), 0);
    assert.equal(parse('12.59'), 12.59);
    assert.equal(parse('-40'), -40);
    assert.equal(parse(' 7 '), 7, 'surrounding space is not part of the entry');
    assert.equal(parse('1e-7'), 1e-7);
});
