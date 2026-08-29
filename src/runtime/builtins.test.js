// The component types the engine ships, and the one call that installs them.
//
// THE REGRESSION THIS FILE PINS. `BUILT_IN` travelled from this module through
// `runtime/mod.js`, through `editor/registry.js` and out of `editor/mod.js` — four modules
// to reach nobody: nothing in the repository ever read the list. A name that crosses a
// barrel without a consumer cannot succeed at anything; the only thing it can do is fail to
// link, which is exactly what it did in the browser.
//
// So the barrels publish `registerBuiltIns`, the list stays here, and the assertions below
// say so — the last of them would have failed before that correction.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, OBJECT_COMPONENT, Transform } from '../core/mod.js';
import * as runtime from './mod.js';
import * as builtins from './builtins.js';
import { BUILT_IN, registerBuiltIns } from './builtins.js';

test('the shipped types install through the runtime barrel, which is the public surface', () => {
    // THROUGH THE BARREL ON PURPOSE. `src/editor/` and `src/preview/` both reach the engine
    // this way, so the import a boot actually performs is the one under test.
    const registry = new ComponentRegistry();

    runtime.registerBuiltIns(registry);

    assert.equal(registry.get('Transform'), Transform);
    for (const name of ['RectangleRenderer', 'Sprite', 'ParticleSystem', 'Tilemap', 'Camera']) {
        assert.ok(registry.get(name), `${name} was not installed`);
    }
});

test('installing twice is installing once, so a second app may ask again', () => {
    // The game client and a test may both install into the same registry; registration is
    // an application concern and asking twice must not be an error.
    const registry = new ComponentRegistry();

    registerBuiltIns(registry);
    assert.doesNotThrow(() => registerBuiltIns(registry));
    for (const Component of BUILT_IN) {
        assert.equal(registry.get(Component.type ?? Component.name), Component);
    }
});

test('the list is read from the module that owns it, like STANDARD_NODES is', () => {
    // The precedent is `core/graph/nodes.test.js`, which imports `STANDARD_NODES` from
    // `./standard.js` rather than from the `core/mod.js` barrel: a symbol is consumed where
    // it is declared, and the barrel carries the API.
    assert.ok(Array.isArray(BUILT_IN));
    assert.ok(BUILT_IN.includes(Transform), 'Transform is the Core\'s, and ships with the rest');
    assert.equal(new Set(BUILT_IN).size, BUILT_IN.length, 'no type ships twice');
    for (const Component of BUILT_IN) {
        assert.equal(typeof Component, 'function', 'every entry is a component class');
    }
});

test('the runtime barrel publishes the registrar and NOT the list', () => {
    // THE ASSERTION THAT WOULD HAVE FAILED BEFORE. `BUILT_IN` was re-exported here, read by
    // nobody, and the boot broke on the name rather than on anything it does.
    assert.equal(typeof runtime.registerBuiltIns, 'function');
    assert.equal('BUILT_IN' in runtime, false, 'the ingredient list is not public API');
    assert.equal('BUILT_IN' in builtins, true, 'it stays reachable from the module that owns it');
});

test('nothing the engine ships is called Object, which is the name the graph reserves', () => {
    // THE ONE RISK THE `Object` NAMESPACE CARRIES, AND IT IS A TEST RATHER THAN A HOPE
    // (ADR-0043). `component: 'Object'` in a `.px` resolves to the Object itself, so a
    // registered class taking that name would silently steal every `Object ▸ Name` in every
    // graph. A `.px` is named by its own ResourceId and can never claim it; a shipped class
    // could, and this is what says it may not.
    const registry = new ComponentRegistry();
    registerBuiltIns(registry);

    assert.equal(registry.has(OBJECT_COMPONENT), false,
        `a shipped Component is registered as "${OBJECT_COMPONENT}"`);
    assert.ok(registry.types().length > 0, 'and the registry really was filled');
});
