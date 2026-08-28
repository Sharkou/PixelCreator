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
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { checkExports, stripNonCode } from './check-exports.js';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

/**
 * A throwaway module graph, written to disk, checked, and removed.
 *
 * THE RULES ARE TESTED ON MODULES THAT BREAK, which the repository's own files must never
 * do. Running the tool over `src/` proves it finds nothing; only a fixture proves it would
 * have found something — and a check nobody has seen fail is a check nobody can trust.
 *
 * @param {object} files - `{ 'a.js': 'source', … }`, paths relative to the fixture root
 * @returns {object[]} What the tool reported
 */
function checking(files) {
    const directory = mkdtempSync(join(tmpdir(), 'px-exports-'));
    try {
        for (const [name, source] of Object.entries(files)) {
            const path = join(directory, name);
            mkdirSync(join(path, '..'), { recursive: true });
            writeFileSync(path, source);
        }
        return checkExports([directory]).map(({ reason, name }) => ({ reason, name }));
    } finally {
        rmSync(directory, { recursive: true, force: true });
    }
}

test('every named import in src/ resolves to a real export', () => {
    const missing = checkExports([join(ROOT, 'src')]);

    assert.deepEqual(missing, [],
        missing.map(entry => `${entry.file} imports "${entry.name}" from ${entry.from}`).join('\n'));
});

test('every named import in tools/ resolves to a real export', () => {
    assert.deepEqual(checkExports([join(ROOT, 'tools')]), []);
});

// --- the rule that already existed, on a graph that breaks -------------------------------

test('a name re-exported through a chain that does not declare it is reported', () => {
    // THE EXACT SHAPE OF THE FAILURE THIS TOOL EXISTS FOR, and of the one that sent a
    // session chasing correct code: a barrel publishes a name, the module behind it does
    // not have it, and nothing but the browser says so.
    //
    //   SyntaxError: The requested module './graph/graph.js'
    //                does not provide an export named 'migrateGraph'
    const found = checking({
        'graph.js': 'export function migrateNode(node) { return node; }\n',
        'mod.js': "export { migrateNode, migrateGraph } from './graph.js';\n"
    });

    assert.deepEqual(found, [{ reason: 'missing-export', name: 'migrateGraph' }]);
});

test('the same chain passes once the name is really there', () => {
    assert.deepEqual(checking({
        'graph.js': 'export function migrateNode(node) { return node; }\n',
        'mod.js': "export { migrateNode } from './graph.js';\n"
    }), []);
});

test('a chain is followed to the end, and a rename is resolved to the name behind it', () => {
    assert.deepEqual(checking({
        'deep.js': 'export const value = 1;\n',
        'middle.js': "export { value as renamed } from './deep.js';\n",
        'top.js': "import { renamed } from './middle.js';\nexport const used = renamed;\n"
    }), [], 'two hops and an `as` still resolve');

    assert.deepEqual(checking({
        'deep.js': 'export const value = 1;\n',
        'middle.js': "export { value as renamed } from './deep.js';\n",
        'top.js': "import { value } from './middle.js';\nexport const used = value;\n"
    }), [{ reason: 'missing-export', name: 'value' }], 'the middle publishes the new name only');
});

// --- a target nobody can read used to pass ------------------------------------------------

test('a specifier naming a file this repository does not hold is reported', () => {
    // IT USED TO BE SILENT. `exposes()` answers `unknown` for a file it cannot open, and
    // unknown is not a failure — so the tool written to catch an unloadable barrel accepted
    // a barrel pointing at nothing.
    const found = checking({ 'mod.js': "export { thing } from './deleted.js';\n" });

    assert.deepEqual(found, [{ reason: 'missing-module', name: './deleted.js' }]);
});

test('a missing target is said once, however many names it was asked for', () => {
    const found = checking({ 'mod.js': "import { a, b, c } from './gone.js';\nexport { a, b, c };\n" });

    assert.equal(found.length, 1, 'one broken specifier is one finding');
    assert.equal(found[0].reason, 'missing-module');
});

test('a package specifier is not a file, and is not reported as one', () => {
    assert.deepEqual(checking({
        'mod.js': "import { readFileSync } from 'node:fs';\nexport const read = readFileSync;\n"
    }), [], 'only relative specifiers are this tool\'s business');
});

// --- one module, one name -------------------------------------------------------------------

test('a module publishing the same name twice is reported', () => {
    // The other SyntaxError a long barrel earns, and `core/mod.js` is ninety lines of
    // `export … from`, which is where two lines come to claim one name.
    const found = checking({
        'a.js': 'export const thing = 1;\n',
        'b.js': 'export const thing = 2;\n',
        'mod.js': "export { thing } from './a.js';\nexport { thing } from './b.js';\n"
    });

    assert.deepEqual(found, [{ reason: 'duplicate-export', name: 'thing' }]);
});

test('a declaration re-exported under another name is not a duplicate', () => {
    assert.deepEqual(checking({
        'a.js': 'export const thing = 1;\n',
        'mod.js': "export { thing as renamed } from './a.js';\nexport const thing = 2;\n"
    }), [], 'two names, so two exports');
});

// --- it reads code, not text -------------------------------------------------------------

test('a specifier written in a comment, a string or a regex is not an import', () => {
    // WITHOUT THIS THE TOOL REPORTS ITSELF: `check-exports.js` documents its own patterns in
    // comments that contain `from './x.js'`, and every one of those files does not exist.
    assert.deepEqual(checking({
        'mod.js': [
            "// an example: from './inAComment.js'",
            "/* and a block: from './inABlock.js' */",
            "const pattern = /from\\s*['\"]([^'\"]+)['\"]/g;",
            "export const sentence = \"import { x } from './inAString.js'\";"
        ].join('\n') + '\n'
    }), []);
});

test('blanking keeps the shape of the file, so a line number still means something', () => {
    const source = "import { a } from './real.js';\n// from './fake.js'\nexport const b = a;\n";
    const stripped = stripNonCode(source);

    assert.equal(stripped.length, source.length, 'same length');
    assert.equal(stripped.split('\n').length, source.split('\n').length, 'same lines');
    assert.ok(stripped.includes("from './real.js'"), 'a specifier survives');
    assert.equal(stripped.includes('fake'), false, 'a comment does not');
});
