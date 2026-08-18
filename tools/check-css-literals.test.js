// The guard that failed at the one thing it exists for.
//
// A backtick inside a `sheet(`…`)` comment ends the literal and the Editor stops booting.
// The first version of this scanner toggled "inside a template" on EVERY backtick in the
// file — including the ones in ordinary `//` comments quoting a module name — so by the
// time it reached a real CSS literal its idea of where it was depended on how many
// backticks the file's header happened to contain. It passed a broken file.
//
// These are the shapes it has to get right, and the reason the fix is skipping rather than
// counting.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { findStrayBackticks } from './check-css-literals.js';

test('a backtick inside a CSS comment is reported', () => {
    const source = [
        'static styles = sheet(`',
        '    /* the `grid` token */',
        '    .a { color: red; }',
        '`);'
    ].join('\n');

    const offences = findStrayBackticks(source);

    assert.equal(offences.length, 2, 'both halves of the quoted token end the literal');
    assert.equal(offences[0].line, 2);
});

// THE REGRESSION. This file used to pass, because the two backticks in the line comment
// left the scanner believing it was outside a template when the real one began.
test('backticks in a line comment do not blind the scan that follows', () => {
    const source = [
        '// `view.js` holds the arithmetic, `graph.js` draws it.',
        'static styles = sheet(`',
        '    /* a `token` quoted like prose */',
        '    .a { color: red; }',
        '`);'
    ].join('\n');

    const offences = findStrayBackticks(source);

    assert.equal(offences.length, 2);
    assert.equal(offences[0].line, 3);
});

test('backticks in a block comment outside a template are prose', () => {
    const source = [
        '/*',
        ' * `portsOf()` answers this, and `nodeRows()` lays it out.',
        ' */',
        'static styles = sheet(`',
        '    /* a `token` */',
        '`);'
    ].join('\n');

    assert.equal(findStrayBackticks(source).length, 2);
});

test('a backtick inside a quoted string is not a template boundary', () => {
    const source = [
        "const tip = 'press ` to open the console';",
        'static styles = sheet(`',
        '    /* a `token` */',
        '`);'
    ].join('\n');

    assert.equal(findStrayBackticks(source).length, 2);
});

test('a clean file reports nothing', () => {
    const source = [
        '// `view.js` and `graph.js`.',
        'static styles = sheet(`',
        '    /* the grid token, no quoting */',
        '    .a { color: var(--px-accent); }',
        '`);',
        'const label = `${name} (${type})`;'
    ].join('\n');

    assert.deepEqual(findStrayBackticks(source), []);
});

test('an interpolation inside a CSS literal is not mistaken for its end', () => {
    const source = [
        'static styles = sheet(`',
        '    /* fine, this one has no quoting */',
        '    .a { width: ${WIDTH}px; }',
        '`);',
        'static more = sheet(`',
        '    /* but this `one` does */',
        '`);'
    ].join('\n');

    const offences = findStrayBackticks(source);

    assert.equal(offences.length, 2);
    assert.equal(offences[0].line, 6);
});

test('an escaped backtick inside a template is not a boundary', () => {
    const source = [
        'const help = `press \\` twice`;',
        'static styles = sheet(`',
        '    /* a `token` */',
        '`);'
    ].join('\n');

    assert.equal(findStrayBackticks(source).length, 2);
});
