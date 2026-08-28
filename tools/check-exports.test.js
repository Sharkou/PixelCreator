// Every named import in src/ names something the target module actually exports.
//
// THE HOLE THIS CLOSES IS ONE THIS REPOSITORY HAS FALLEN INTO TWICE. `tools/layers/check.js`
// records the first: `editor/mod.js` re-exported `./windows/dock.js` for two commits after
// the file was split, and the Editor entry point was unloadable the whole time. That got a
// FILE-level guard — does the target exist. This is the NAME-level half, and the day it was
// written it found `editor/mod.js` re-exporting `paramBoxes` from a module that renamed it
// to `controlBoxes`: the same failure, the same file, still invisible to 1453 passing tests.
//
// It is a boot failure, and nothing in a unit suite reaches it: a test imports what it uses
// and passes, while the browser refuses the whole module graph with
// "does not provide an export named …" — naming a file that is correct.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { checkExports } from './check-exports.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

test('every named import in src/ resolves to a real export', () => {
    const missing = checkExports([join(ROOT, 'src')]);

    assert.deepEqual(missing, [],
        missing.map(entry => `${entry.file} imports "${entry.name}" from ${entry.from}`).join('\n'));
});

test('every named import in tools/ resolves to a real export', () => {
    assert.deepEqual(checkExports([join(ROOT, 'tools')]), []);
});
