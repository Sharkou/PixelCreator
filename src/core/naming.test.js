// Object is the name of the Pixel Creator scene entity — conceptually and publicly.
//
// It shadows globalThis.Object inside a module that imports it, which is intended and
// harmless: a module needing the native constructor writes globalThis.Object. There is
// no PixelObject, no alias, and nothing to disambiguate at a call site.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from './mod.js';

test('the public entry point exposes Object', async () => {
    const mod = await import('./mod.js');

    assert.equal(typeof mod.Object, 'function');
    assert.equal(mod.Object.name, 'Object');
    assert.equal(mod.PixelObject, undefined, 'no alias is kept in the public API');
});

test('an object is created with new Object()', () => {
    const object = new Object('Player');

    assert.equal(object.name, 'Player');
    assert.ok(object instanceof Object);
});

test('Object shadows the native constructor without breaking it', () => {
    // Inside this module `Object` is ours; the native one stays one word away.
    const object = new Object('Player');

    assert.notEqual(Object, globalThis.Object);
    assert.equal(globalThis.Object.name, 'Object');
    assert.ok(object instanceof globalThis.Object, 'ours is still an ordinary JS object');
});

test('globalThis.Object remains fully usable next to ours', () => {
    const plain = globalThis.Object.freeze({ a: 1 });

    assert.deepEqual(globalThis.Object.keys(plain), ['a']);
    assert.deepEqual(globalThis.Object.entries(plain), [['a', 1]]);
    assert.equal(globalThis.Object.isFrozen(plain), true);
    assert.deepEqual(globalThis.Object.assign({}, plain, { b: 2 }), { a: 1, b: 2 });
});

test('an Object works with the native reflection helpers', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(1, 2));

    assert.deepEqual(globalThis.Object.keys(object), [
        'id', 'name', 'tag', 'layer', 'active', 'lock', 'owner'
    ]);
    assert.equal(globalThis.Object.getPrototypeOf(object), Object.prototype);
});

test('a Scene holds Objects', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));

    assert.equal(scene.get(object.id), object);
    assert.ok(scene.objects()[0] instanceof Object);
});
