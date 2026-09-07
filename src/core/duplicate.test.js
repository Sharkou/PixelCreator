// Copying an Object into the Scene that holds it — the primitive `Spawn` is made of.
//
// WHAT THESE TESTS ARE REALLY PROTECTING is that a copy is a NEW Object and not the same
// one listed twice: fresh identities all the way down the subtree, links rewritten through
// the same table, and values carried over untouched. Every one of those was a way Legacy's
// `copy()` failed, and each fails silently — a scene that looks right and has two objects
// sharing an id is a scene that breaks on its next save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    duplicateObject,
    hierarchyOrder,
    serializeScene
} from './mod.js';

/** A scene with a `Model` carrying a Transform, and a `Barrel` under it. */
function staged() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const scene = new Scene('Level', { registry });
    const model = scene.add(new SceneObject('Model', { tag: 'model' }));
    model.addComponent(new Transform(5, 7));

    const barrel = scene.add(new SceneObject('Barrel'));
    barrel.addComponent(new Transform(1, 2));
    model.addChild(barrel);

    return { scene, model, barrel };
}

test('a copy is a new Object, and everything under it is new too', () => {
    const { scene, model, barrel } = staged();

    const copy = duplicateObject(scene, model);

    assert.ok(copy, 'a model that is in the scene is copyable');
    assert.notEqual(copy.id, model.id, 'a copy is not the same Object listed twice');
    assert.equal(copy.name, 'Model');
    assert.equal(copy.tag, 'model');
    assert.equal(scene.size, 4, 'two objects became four');

    assert.equal(copy.children.length, 1, 'the subtree came with it');
    assert.notEqual(copy.children[0].id, barrel.id, 'and its identity is new as well');
    assert.equal(copy.children[0].name, 'Barrel');
});

test('a copy carries the values its model held, component by component', () => {
    const { scene, model } = staged();

    const copy = duplicateObject(scene, model);

    assert.equal(copy.getComponent('Transform').x, 5);
    assert.equal(copy.getComponent('Transform').y, 7);
    assert.equal(copy.children[0].getComponent('Transform').x, 1);

    copy.getComponent('Transform').x = 99;
    assert.equal(model.getComponent('Transform').x, 5, 'and the two do not share their state');
});

test('a copy lands beside its model, last among its siblings', () => {
    // BESIDE, BECAUSE `Transform` IS A POSITION IN THE PARENT'S SPACE (ADR-0002). A copy
    // that joined the roots would keep its numbers and change where they mean.
    const { scene, model } = staged();
    const holder = scene.add(new SceneObject('Spawner'));
    scene.reparent(model, holder);

    const copy = duplicateObject(scene, model);

    assert.equal(copy.parent?.id, holder.id);
    assert.deepEqual(holder.children.map(child => child.name), ['Model', 'Model'],
        'appended, which is the one rank that is a function of the state');
});

test('two copies of one model are two distinct Objects', () => {
    const { scene, model } = staged();

    const first = duplicateObject(scene, model);
    const second = duplicateObject(scene, model);

    assert.notEqual(first.id, second.id);
    assert.notEqual(first.children[0].id, second.children[0].id);
    assert.equal(new Set(hierarchyOrder(scene).map(object => object.id)).size, 6,
        'six objects, six identities');
});

test('a copy is reachable from the roots, like everything else in a scene', () => {
    // ADR-0034 invariant 7, asked of the path this file opens. An object the canonical walk
    // cannot reach is one `serializeScene()` does not write and `Runtime.step()` never runs.
    const { scene, model } = staged();

    const copy = duplicateObject(scene, model);
    const reached = hierarchyOrder(scene).map(object => object.id);

    assert.ok(reached.includes(copy.id));
    assert.ok(reached.includes(copy.children[0].id));
});

test('a copy survives serialization, which is what says its links are real', () => {
    const { scene, model } = staged();
    duplicateObject(scene, model);

    const written = serializeScene(scene);
    const ids = written.objects.map(entry => entry.id);

    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4, 'no id is written twice');
    for (const entry of written.objects) {
        for (const child of entry.children) {
            assert.ok(ids.includes(child), 'every child named is an object of this payload');
        }
    }
});

test('copying produces no Operation', () => {
    // ADR-0034 invariant 5, at the level the node cannot reach around: the primitive itself
    // writes through the Scene's own methods, so a spawn is a simulation output and never
    // an authored intent (ADR-0019).
    const { scene, model } = staged();

    const submitted = [];
    scene.operations.on('operation', operation => submitted.push(operation));

    duplicateObject(scene, model);

    assert.deepEqual(submitted, [], 'nothing went through the pipeline');
});

test('there is nothing to copy from a model the scene does not hold', () => {
    const { scene, model } = staged();

    assert.equal(duplicateObject(scene, null), null, 'nothing at all');
    assert.equal(duplicateObject(scene, { id: 'nope' }), null, 'a stranger');

    scene.remove(model);
    assert.equal(duplicateObject(scene, model), null, 'a handle whose target has gone');
    assert.equal(scene.size, 0, 'and the scene is left exactly as it was');
});
