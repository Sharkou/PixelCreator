// What counts as a link this check is responsible for.
//
// The whole risk of this tool is the two ways it can be wrong. Miss a real link and the
// documentation rots exactly as before. Report a link that was never navigation — a path
// inside an example, a URL, a bare anchor — and the check fails on something nobody can fix,
// which is how a verification step comes to be ignored.
//
// So the extraction is what is tested, not the file walk: the walk is `readdirSync`, and the
// judgement is all here.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { relativeLinks } from './check-links.js';

test('an inline relative link is a link', () => {
    const links = relativeLinks('See [the guide](user/getting-started.md).');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'user/getting-started.md');
    assert.equal(links[0].line, 1);
});

test('an anchor is dropped from the path, and the path is still checked', () => {
    const links = relativeLinks('[layers](developer/architecture.md#the-layers)');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'developer/architecture.md');
});

test('a bare anchor names no file', () => {
    assert.deepEqual(relativeLinks('[status](#project-status)'), []);
});

test('a URL and a mailto are somebody else’s problem', () => {
    const source = [
        '[editor](https://editor.pixelcreator.io)',
        '[mail](mailto:contact@pixelcreator.io)',
        '[protocol-relative](//example.com/x.md)'
    ].join('\n');

    assert.deepEqual(relativeLinks(source), []);
});

// A path in an example is illustration. Requiring it to exist would make it impossible to
// document a path that belongs to somebody else's repository.
test('a link inside a fenced block is illustration, not navigation', () => {
    const source = [
        'Before:',
        '```md',
        '[gone](does-not-exist.md)',
        '```',
        'After: [real](README.md)'
    ].join('\n');

    const links = relativeLinks(source);

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'README.md');
    assert.equal(links[0].line, 5, 'the line number survives the fence');
});

test('a tilde fence closes the same way a backtick fence does', () => {
    const source = ['~~~', '[gone](nope.md)', '~~~', '[real](README.md)'].join('\n');

    assert.deepEqual(relativeLinks(source).map(link => link.target), ['README.md']);
});

// A reference definition renders as a link and rots as one, so it is one.
test('a reference definition is a link', () => {
    const links = relativeLinks('[adr]: decisions/ADR-0001-object-stays-object.md');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'decisions/ADR-0001-object-stays-object.md');
});

test('a title after the target is not part of the target', () => {
    const links = relativeLinks('[licence](LICENSE.md "The licence")');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'LICENSE.md');
});

test('an angle-bracketed target is unwrapped', () => {
    const links = relativeLinks('[a doc](<a file with spaces.md>)');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'a file with spaces.md');
});

test('a percent-encoded target is decoded, because readdir does not decode', () => {
    const links = relativeLinks('[a doc](a%20file.md)');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'a file.md');
});

test('two links on one line are two links', () => {
    const links = relativeLinks('[one](a.md) and [two](b.md)');

    assert.deepEqual(links.map(link => link.target), ['a.md', 'b.md']);
});

// REPORTED RATHER THAN RESOLVED, and the run script is what refuses it: a root-relative path
// is a site path, and it does not work when browsing the repository on GitHub either.
test('a root-relative link is still collected, so it can be reported', () => {
    const links = relativeLinks('[absolute](/docs/README.md)');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, '/docs/README.md');
});

test('an image reference is a link to a file like any other', () => {
    const links = relativeLinks('![a diagram](images/layers.png)');

    assert.equal(links.length, 1);
    assert.equal(links[0].target, 'images/layers.png');
});
