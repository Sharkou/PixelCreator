// Can the app be loaded — every module the entry points reach?
//
// THE REGRESSION THIS PINS. Two boots failed in a row on one import line, with a different
// symbol each time: `BUILT_IN`, then `registerBuiltIns`. Both were collateral. What was
// actually wrong was a MODULE that would not load, and a browser reports that at the
// consumer, three modules downstream, naming whichever symbol was asked for first.
//
// `check-exports` reads names. This reads the graph a browser walks, and names the file.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { ENTRIES, checkBoot } from './check-boot.js';

test('every module the real entry points reach can be loaded', async () => {
    const { broken, walked } = await checkBoot();

    assert.deepEqual(broken, [],
        broken.map(entry => `${entry.module}: ${entry.reason} (from ${entry.from})`).join('\n'));
    assert.ok(walked > 50, `only ${walked} modules walked — the graph was not really traversed`);
});

test('both applications are entry points, because both are booted', () => {
    // The Editor and the game client are two apps (ADR-0042 §2); a check that walked only
    // one of them would let the other rot.
    assert.deepEqual(ENTRIES, ['src/editor/index.html', 'src/preview/index.html']);
});

// --- what it catches, on a graph built to break ------------------------------------------

/** A throwaway app, written to disk and walked. */
async function walking(files) {
    const directory = mkdtempSync(join(tmpdir(), 'px-boot-'));
    try {
        for (const [name, source] of Object.entries(files)) {
            const path = join(directory, name);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, source);
        }
        // `checkBoot` resolves against the repository root, so the fixture is walked through
        // a file:// URL served by the disk reader with an absolute entry.
        return await checkBoot({ entries: [join(directory, 'index.html')] });
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

test('a module the graph reaches but the repository does not hold is named, by path', async () => {
    // EXACTLY THE FAILURE THAT HAPPENED: `mod.js` re-exports from a file that is not there,
    // and the consumer fails on a name. The name is not the problem; the file is.
    const { broken } = await walking({
        'index.html': '<script type="module">import { start } from "./app.js"; start();</script>',
        'app.js': "export { start } from './mod.js';",
        'mod.js': "export { registerBuiltIns } from './builtins.js';"
    });

    assert.equal(broken.length, 1);
    assert.match(broken[0].module, /builtins\.js$/);
    assert.match(broken[0].reason, /no such file/);
    assert.match(broken[0].from, /mod\.js$/, 'and it says who was asking');
});

test('an entry page that is not there is reported as itself', async () => {
    const { broken } = await checkBoot({ entries: ['src/nowhere/index.html'] });

    assert.equal(broken.length, 1);
    assert.match(broken[0].reason, /page itself/);
});

test('a missing module is reported once, however many modules import it', async () => {
    const { broken } = await walking({
        'index.html': '<script type="module">import "./a.js"; import "./b.js";</script>',
        'a.js': "export { x } from './gone.js';",
        'b.js': "export { y } from './gone.js';"
    });

    assert.equal(broken.length, 1, 'one missing file is one finding');
});

test('bare specifiers are the platform\'s business, not this check\'s', async () => {
    const { broken } = await walking({
        'index.html': '<script type="module">import "./a.js";</script>',
        'a.js': "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;"
    });

    assert.deepEqual(broken, []);
});

test('a specifier written in a comment or a string is not an import', async () => {
    // The same rule `check-exports` lives by, and for the same reason: this file's own
    // documentation contains examples that are not statements.
    const { broken } = await walking({
        'index.html': '<script type="module">import "./a.js";</script>',
        'a.js': ['// an example: from "./inAComment.js"',
            '/* block: from "./inABlock.js" */',
            "export const sentence = 'import { x } from \"./inAString.js\"';"].join('\n')
    });

    assert.deepEqual(broken, []);
});
