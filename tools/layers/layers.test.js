import { test } from 'node:test';
import assert from 'node:assert/strict';
import { evaluateProfile, layerOf, isForbidden } from './check.js';
import { resolveSpecifier } from './scan.js';
import { profiles } from './rules.js';

/** A profile shaped like v2, used to exercise the rules without touching the tree. */
function testProfile(knownViolations = []) {
    return {
        name: 'test',
        root: 'src',
        layers: [
            { name: 'core', test: path => path.startsWith('core/') },
            { name: 'runtime', test: path => path.startsWith('runtime/') },
            { name: 'editor', test: path => path.startsWith('editor/') }
        ],
        forbidden: [
            { from: 'core', to: 'runtime' },
            { from: 'core', to: 'editor' },
            { from: 'runtime', to: 'editor' }
        ],
        knownViolations
    };
}

function edge(file, specifier) {
    return { file, specifier, target: resolveSpecifier(specifier, file) };
}

// --- specifier resolution --------------------------------------------------------

test('a relative specifier resolves against the importing file', () => {
    assert.equal(resolveSpecifier('./events.js', 'core/object.js'), 'core/events.js');
    assert.equal(resolveSpecifier('../core/mod.js', 'runtime/runtime.js'), 'core/mod.js');
    assert.equal(resolveSpecifier('./components/transform.js', 'core/mod.js'), 'core/components/transform.js');
    assert.equal(resolveSpecifier('../../core/mod.js', 'runtime/rendering/canvas2d.js'), 'core/mod.js');
});

test('an absolute specifier is taken from the root', () => {
    assert.equal(resolveSpecifier('/editor/system/dnd.js', 'src/core/renderer.js'), 'editor/system/dnd.js');
});

test('a bare specifier belongs to no layer', () => {
    assert.equal(resolveSpecifier('node:test', 'core/object.js'), null);
    assert.equal(resolveSpecifier('some-package', 'core/object.js'), null);
});

test('a specifier climbing above the root leaves the profile', () => {
    assert.equal(resolveSpecifier('../../outside.js', 'core/object.js'), null);
});

// --- layer matching ---------------------------------------------------------------

test('a path is matched to its layer', () => {
    const profile = testProfile();

    assert.equal(layerOf(profile, 'core/object.js'), 'core');
    assert.equal(layerOf(profile, 'runtime/runtime.js'), 'runtime');
    assert.equal(layerOf(profile, 'editor/window.js'), 'editor');
    assert.equal(layerOf(profile, 'tools/thing.js'), null);
    assert.equal(layerOf(profile, null), null);
});

test('forbidden edges are declared, not inferred', () => {
    const profile = testProfile();

    assert.equal(isForbidden(profile, 'core', 'runtime'), true);
    assert.equal(isForbidden(profile, 'runtime', 'core'), false, 'the allowed direction');
    assert.equal(isForbidden(profile, 'editor', 'runtime'), false);
});

// --- allowed dependencies ---------------------------------------------------------

test('an allowed dependency passes', () => {
    const result = evaluateProfile(testProfile(), [
        edge('runtime/runtime.js', '../core/mod.js'),
        edge('editor/window.js', '../runtime/mod.js'),
        edge('editor/window.js', '../core/mod.js')
    ]);

    assert.deepEqual(result.unexpected, []);
    assert.deepEqual(result.tracked, []);
    assert.equal(result.scanned, 3);
});

test('an import within one layer is not a cross-layer edge', () => {
    const result = evaluateProfile(testProfile(), [
        edge('core/object.js', './events.js'),
        edge('core/mod.js', './components/transform.js')
    ]);

    assert.deepEqual(result.unexpected, []);
});

test('an import of something outside every layer is ignored', () => {
    const result = evaluateProfile(testProfile(), [
        edge('core/object.test.js', 'node:test'),
        edge('core/object.js', '../../tools/helper.js')
    ]);

    assert.deepEqual(result.unexpected, []);
});

// --- forbidden dependencies -------------------------------------------------------

test('a forbidden dependency is detected', () => {
    const result = evaluateProfile(testProfile(), [
        edge('core/object.js', '../runtime/clock/clock.js')
    ]);

    assert.equal(result.unexpected.length, 1);
    assert.deepEqual(result.unexpected[0], {
        file: 'core/object.js',
        specifier: '../runtime/clock/clock.js',
        from: 'core',
        to: 'runtime'
    });
});

test('the core reaching for the editor is detected', () => {
    // The exact shape of Legacy's renderer.js -> editor/system/dnd.js.
    const result = evaluateProfile(testProfile(), [
        edge('core/renderer.js', '../editor/system/dnd.js')
    ]);

    assert.equal(result.unexpected.length, 1);
    assert.equal(result.unexpected[0].to, 'editor');
});

test('the runtime reaching for the editor is detected', () => {
    const result = evaluateProfile(testProfile(), [
        edge('runtime/rendering/scene-renderer.js', '../../editor/selection.js')
    ]);

    assert.equal(result.unexpected.length, 1);
    assert.deepEqual([result.unexpected[0].from, result.unexpected[0].to], ['runtime', 'editor']);
});

test('several violations are all reported', () => {
    const result = evaluateProfile(testProfile(), [
        edge('core/a.js', '../runtime/x.js'),
        edge('core/b.js', '../editor/y.js'),
        edge('runtime/c.js', '../editor/z.js'),
        edge('runtime/d.js', '../core/ok.js')
    ]);

    assert.equal(result.unexpected.length, 3);
});

// --- known violations --------------------------------------------------------------

test('a declared violation is tracked instead of failing', () => {
    const known = {
        file: 'core/renderer.js',
        specifier: '../editor/system/dnd.js',
        from: 'core',
        to: 'editor',
        reason: 'documented',
        ref: 'docs/...'
    };
    const result = evaluateProfile(testProfile([known]), [
        edge('core/renderer.js', '../editor/system/dnd.js')
    ]);

    assert.deepEqual(result.unexpected, []);
    assert.equal(result.tracked.length, 1);
    assert.equal(result.tracked[0].known.reason, 'documented');
});

test('a declaration only covers the exact import it names', () => {
    const known = {
        file: 'core/renderer.js',
        specifier: '../editor/system/dnd.js',
        from: 'core',
        to: 'editor',
        reason: 'documented',
        ref: ''
    };
    const result = evaluateProfile(testProfile([known]), [
        edge('core/renderer.js', '../editor/system/dnd.js'),
        edge('core/renderer.js', '../editor/selection.js')
    ]);

    assert.equal(result.tracked.length, 1);
    assert.equal(result.unexpected.length, 1, 'a different import is still a regression');
    assert.equal(result.unexpected[0].specifier, '../editor/selection.js');
});

test('a violation that no longer exists is reported as stale', () => {
    const known = {
        file: 'core/renderer.js',
        specifier: '../editor/system/dnd.js',
        from: 'core',
        to: 'editor',
        reason: 'documented',
        ref: ''
    };
    const result = evaluateProfile(testProfile([known]), [
        edge('runtime/runtime.js', '../core/mod.js')
    ]);

    assert.equal(result.stale.length, 1);
    assert.equal(result.stale[0], known);
    assert.deepEqual(result.unexpected, []);
});

test('a fixed violation stops being tracked and becomes stale', () => {
    const known = {
        file: 'core/renderer.js',
        specifier: '../editor/system/dnd.js',
        from: 'core',
        to: 'editor',
        reason: 'documented',
        ref: ''
    };
    const profile = testProfile([known]);

    const before = evaluateProfile(profile, [edge('core/renderer.js', '../editor/system/dnd.js')]);
    assert.equal(before.tracked.length, 1);
    assert.equal(before.stale.length, 0);

    const after = evaluateProfile(profile, []);
    assert.equal(after.tracked.length, 0);
    assert.equal(after.stale.length, 1);
});

// --- the real profiles --------------------------------------------------------------

test('the v2 profile protects the boundaries the architecture declares', () => {
    const v2 = profiles.find(profile => profile.name === 'v2');

    assert.equal(isForbidden(v2, 'core', 'runtime'), true);
    assert.equal(isForbidden(v2, 'core', 'editor'), true);
    assert.equal(isForbidden(v2, 'core', 'network'), true);
    assert.equal(isForbidden(v2, 'runtime', 'editor'), true);
    assert.equal(isForbidden(v2, 'network', 'editor'), true);
});

test('the v2 profile leaves the allowed directions alone', () => {
    const v2 = profiles.find(profile => profile.name === 'v2');

    assert.equal(isForbidden(v2, 'runtime', 'core'), false);
    assert.equal(isForbidden(v2, 'editor', 'core'), false);
    assert.equal(isForbidden(v2, 'editor', 'runtime'), false);
    assert.equal(isForbidden(v2, 'network', 'core'), false);
    assert.equal(isForbidden(v2, 'editor', 'network'), false, 'the Editor talks to the server');
});

test('the legacy profile still declares its one known violation', () => {
    const legacy = profiles.find(profile => profile.name === 'legacy');

    assert.equal(legacy.knownViolations.length, 1);
    assert.equal(legacy.knownViolations[0].file, 'src/core/renderer.js');
});
