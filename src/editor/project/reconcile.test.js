// Bringing existing instances up to a changed schema (ADR-0031 §4).
//
// The interesting cases are all about what a creator KEEPS. Adding a property must not cost
// the thirty values already set on thirty objects; renaming one must not look like deleting
// it; removing one must not leave data nothing reads.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Object as SceneObject, Scene, Transform, components, defineComponent } from '../../core/mod.js';
import { registerBuiltIns } from '../registry.js';
import { reconcileScene, reconcileValues } from './reconcile.js';

registerBuiltIns(components);

/** A `.px` schema, in the shape `defineComponent()` reads. */
const schema = entries => globalThis.Object.fromEntries(
    entries.map(([id, name, type, fallback]) => [name, { id, type, default: fallback }])
);

const OLD = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5]]);

// --- the decision itself, without a scene ------------------------------------------------

test('a new property arrives at its declared default', () => {
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);

    const { set, remove } = reconcileValues({ health: 42, speed: 9 }, next, OLD);

    assert.deepEqual(set, { damage: 7 });
    assert.deepEqual(remove, []);
});

test('values a creator set are left exactly where they are', () => {
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);

    const { set } = reconcileValues({ health: 42, speed: 9 }, next, OLD);

    assert.equal('health' in set, false, 'declaring a property must not cost the ones already set');
    assert.equal('speed' in set, false);
});

test('a removed property is dropped rather than kept as data nothing reads', () => {
    const next = schema([['p1', 'health', 'number', 100]]);

    const { set, remove } = reconcileValues({ health: 42, speed: 9 }, next, OLD);

    assert.deepEqual(set, {});
    assert.deepEqual(remove, ['speed']);
});

test('a rename moves the value, because identity is what a rename keeps', () => {
    // Same id, different name: one descriptor renamed, not one deleted and one added.
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'movementSpeed', 'number', 5]]);

    const { set, remove } = reconcileValues({ health: 42, speed: 9 }, next, OLD);

    assert.deepEqual(set, { movementSpeed: 9 }, 'the value follows its identity');
    assert.deepEqual(remove, ['speed'], 'and stops answering to the old name');
});

test('without the previous schema a rename is a deletion and an addition', () => {
    // Honest degradation: with nothing to compare identities against, the value is lost —
    // which is why `install()` reads the old schema before overwriting the registry.
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'movementSpeed', 'number', 5]]);

    const { set, remove } = reconcileValues({ health: 42, speed: 9 }, next, null);

    assert.deepEqual(set, { movementSpeed: 5 }, 'the new name starts at its default');
    assert.deepEqual(remove, ['speed']);
});

test('an unchanged schema changes nothing at all', () => {
    const { set, remove } = reconcileValues({ health: 42, speed: 9 }, OLD, OLD);

    assert.deepEqual(set, {});
    assert.deepEqual(remove, []);
});

test('an instance that never held a value still gets the new ones', () => {
    const { set } = reconcileValues({}, OLD, OLD);
    assert.deepEqual(set, { health: 100, speed: 5 });
});

test('a falsy value is a value, and is not mistaken for an absence', () => {
    const { set, remove } = reconcileValues({ health: 0, speed: 0 }, OLD, OLD);

    assert.deepEqual(set, {}, '0 is set, so it is not re-defaulted');
    assert.deepEqual(remove, []);
});

// --- the same thing, applied to a scene ----------------------------------------------------

/** A scene with two objects carrying the same Component, set to different values. */
function scenario() {
    const scene = new Scene('Test', { registry: components });
    const Before = defineComponent({ type: 'res_recon', label: 'Stats', properties: OLD });

    const objects = ['Hero', 'Rival'].map((name, index) => {
        const object = new SceneObject(name);
        object.addComponent(new Transform());
        object.addComponent(new Before());
        object.getComponent('res_recon').setProperty('health', 10 * (index + 1));
        scene.add(object);
        return object;
    });

    return { scene, objects };
}

test('every instance in the scene gains a new property', () => {
    const { scene, objects } = scenario();
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: next });

    const changed = reconcileScene(scene, 'res_recon', { Component: After, previous: OLD });

    assert.equal(changed.objects, 2);
    for (const object of objects) {
        assert.equal(object.getComponent('res_recon').damage, 7);
    }
});

test('and keeps what each of them was set to', () => {
    const { scene, objects } = scenario();
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: next });

    reconcileScene(scene, 'res_recon', { Component: After, previous: OLD });

    assert.equal(objects[0].getComponent('res_recon').health, 10);
    assert.equal(objects[1].getComponent('res_recon').health, 20);
});

test('a rename carries each instance\'s own value across', () => {
    const { scene, objects } = scenario();
    const next = schema([['p1', 'vitality', 'number', 100], ['p2', 'speed', 'number', 5]]);
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: next });

    reconcileScene(scene, 'res_recon', { Component: After, previous: OLD });

    assert.equal(objects[0].getComponent('res_recon').vitality, 10);
    assert.equal(objects[1].getComponent('res_recon').vitality, 20);
    assert.equal(objects[0].getComponent('res_recon').health, undefined);
});

test('reconciling writes Operations, so it undoes as one thing', () => {
    const { scene } = scenario();
    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: next });

    const seen = [];
    scene.operations.on('operation', operation => seen.push(operation));

    reconcileScene(scene, 'res_recon', { Component: After, previous: OLD });

    assert.ok(seen.length > 0, 'a reconciliation is authored, not a silent write');
    assert.ok(seen.every(operation => operation.type === 'SET_PROPERTY'));
});

test('objects without the Component are left alone', () => {
    const { scene } = scenario();
    const bystander = new SceneObject('Camera');
    bystander.addComponent(new Transform());
    scene.add(bystander);

    const next = schema([['p1', 'health', 'number', 100], ['p2', 'speed', 'number', 5], ['p3', 'damage', 'number', 7]]);
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: next });

    const changed = reconcileScene(scene, 'res_recon', { Component: After, previous: OLD });

    assert.equal(changed.objects, 2, 'the third object carries no Stats');
    assert.equal(bystander.getComponent('res_recon'), undefined);
});

test('reconciling a scene nobody passed is not a crash', () => {
    const After = defineComponent({ type: 'res_recon', label: 'Stats', properties: OLD });
    assert.deepEqual(reconcileScene(null, 'res_recon', { Component: After }), { objects: 0, set: 0, removed: 0 });
});
