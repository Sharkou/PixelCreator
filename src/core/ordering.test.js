// Structural order is data (ADR-0018).
//
// The decision these tests encode is the reverse of the one the repository held before:
// the order of an Object's components, and the order of a Scene's roots, are part of the
// project. They decide what updates first, what draws on top, what the Inspector shows,
// and they are persisted.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object,
    Scene,
    Transform,
    deserializeScene,
    serializeObject,
    serializeScene
} from './mod.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
    update() {}
}

class Marker {
    static type = 'Marker';
}

function registry() {
    const known = new ComponentRegistry();
    known.register(Transform);
    known.register(Rotator);
    known.register(Marker);
    return known;
}

// --- components ---------------------------------------------------------------------

test('components keep the order they were attached in', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator());
    object.addComponent(new Transform());
    object.addComponent(new Marker());

    assert.deepEqual(object.componentTypes(), ['Rotator', 'Transform', 'Marker']);
    assert.deepEqual(globalThis.Object.keys(object.components), ['Rotator', 'Transform', 'Marker'],
        'the snapshot carries the order, so every existing reader sees it');
});

test('a component can be attached at a rank', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator());
    object.addComponent(new Marker());
    object.addComponent(new Transform(), { index: 1 });

    assert.deepEqual(object.componentTypes(), ['Rotator', 'Transform', 'Marker']);
    assert.equal(object.componentIndex('Transform'), 1);
    assert.equal(object.componentIndex('Nothing'), -1);
});

test('moveComponent reorders without touching a value', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20));
    object.addComponent(new Rotator(42));

    assert.equal(object.moveComponent('Rotator', 0), true);

    assert.deepEqual(object.componentTypes(), ['Rotator', 'Transform']);
    assert.equal(object.getComponent('Rotator').speed, 42, 'nothing was detached');
    assert.equal(object.x, 10, 'and nothing was rebuilt');
});

test('moving a component to where it already is changes nothing', () => {
    const object = new Object('Player');
    object.addComponent(new Transform());
    object.addComponent(new Rotator());

    assert.equal(object.moveComponent('Transform', 0), false);
    assert.equal(object.moveComponent('Absent', 0), false);
});

test('an out-of-range rank is clamped rather than refused', () => {
    const object = new Object('Player');
    object.addComponent(new Transform());
    object.addComponent(new Rotator());
    object.addComponent(new Marker());

    object.moveComponent('Transform', 99);
    assert.deepEqual(object.componentTypes(), ['Rotator', 'Marker', 'Transform']);

    object.moveComponent('Transform', -5);
    assert.deepEqual(object.componentTypes(), ['Transform', 'Rotator', 'Marker']);
});

test('a reorder is announced on the scene', () => {
    const scene = new Scene('Main', { registry: registry() });
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    object.addComponent(new Rotator());

    const seen = [];
    scene.on('component:moved', payload => seen.push([payload.type, payload.previousIndex, payload.index]));
    object.moveComponent('Rotator', 0);

    assert.deepEqual(seen, [['Rotator', 1, 0]]);
});

// --- roots --------------------------------------------------------------------------

test('the roots are an ordered list, not a filter over the objects', () => {
    const scene = new Scene('Main', { registry: registry() });
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    const third = scene.add(new Object('Third'));

    assert.deepEqual(scene.roots(), [first, second, third]);

    scene.reparent(third, null, 0);
    assert.deepEqual(scene.roots().map(object => object.name), ['Third', 'First', 'Second']);
});

test('a root that gains a parent leaves the root list, and comes back when it loses one', () => {
    const scene = new Scene('Main', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));

    parent.addChild(child);
    assert.deepEqual(scene.roots(), [parent], 'a plain addChild() keeps the list true');

    parent.removeChild(child);
    assert.deepEqual(scene.roots(), [parent, child]);
});

test('an object added under a parent never enters the root list', () => {
    const scene = new Scene('Main', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    const child = new Object('Child');
    parent.addChild(child);
    scene.add(child);

    assert.deepEqual(scene.roots(), [parent]);
});

test('removing an object takes it out of the root list', () => {
    const scene = new Scene('Main', { registry: registry() });
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    const child = scene.add(new Object('Child'));
    first.addChild(child);

    scene.remove(first);

    assert.deepEqual(scene.roots(), [second], 'the subtree went with it');
    assert.equal(scene.size, 1);
});

// --- reparent, the one primitive --------------------------------------------------

test('reparent covers reparenting, unparenting and both kinds of reorder', () => {
    const scene = new Scene('Main', { registry: registry() });
    const a = scene.add(new Object('A'));
    const b = scene.add(new Object('B'));
    const child = scene.add(new Object('Child'));

    // reparent
    assert.equal(scene.reparent(child, a), true);
    assert.equal(child.parent, a);

    // reparent to another parent
    assert.equal(scene.reparent(child, b), true);
    assert.equal(child.parent, b);

    // unparent
    assert.equal(scene.reparent(child, null), true);
    assert.equal(child.parent, null);
    assert.deepEqual(scene.roots().map(object => object.name), ['A', 'B', 'Child']);

    // reorder among the roots
    assert.equal(scene.reparent(child, null, 0), true);
    assert.deepEqual(scene.roots().map(object => object.name), ['Child', 'A', 'B']);
});

test('reordering among siblings is a reparent onto the same parent', () => {
    const scene = new Scene('Main', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    parent.addChild(first);
    parent.addChild(second);

    assert.equal(scene.reparent(second, parent, 0), true);
    assert.deepEqual(parent.children.map(object => object.name), ['Second', 'First']);
    assert.equal(scene.indexOf(second), 0);
});

test('a reparent that changes nothing is a no-op, not an error', () => {
    const scene = new Scene('Main', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    assert.equal(scene.reparent(child, parent, 0), false);
    assert.equal(scene.reparent(parent, null, 0), false);
});

test('a reparent that would close a cycle is refused rather than thrown', () => {
    // Refused, because a replicated operation goes through the same path and a throw
    // inside a pipeline would reach the transport (ADR-0019).
    const scene = new Scene('Main', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    assert.equal(scene.reparent(parent, child), false);
    assert.equal(scene.reparent(parent, parent), false);
    assert.equal(parent.parent, null, 'the tree is untouched');
});

test('reparenting something the scene does not hold is refused', () => {
    const scene = new Scene('Main', { registry: registry() });
    const inside = scene.add(new Object('Inside'));
    const outside = new Object('Outside');

    assert.equal(scene.reparent(outside, inside), false);
    assert.equal(scene.reparent(inside, outside), false);
    assert.equal(scene.reparent('nope', null), false);
});

// --- update and draw both read the order --------------------------------------------

test('the order the runtime and the renderer read is the serialized one', () => {
    const scene = new Scene('Main', { registry: registry() });
    const object = scene.add(new Object('Player'));
    object.addComponent(new Rotator());
    object.addComponent(new Transform());
    object.moveComponent('Transform', 0);

    const inMemory = globalThis.Object.keys(object.components);
    const serialized = serializeObject(object).components.map(entry => entry.type);

    // Both the runtime's `update` loop and the scene renderer's `draw` loop walk
    // `Object.keys(object.components)`, so this is the order both of them use.
    assert.deepEqual(inMemory, ['Transform', 'Rotator']);
    assert.deepEqual(serialized, inMemory);

    const restored = deserializeScene(
        JSON.parse(JSON.stringify(serializeScene(scene))), { registry: registry() });
    assert.deepEqual(globalThis.Object.keys(restored.get(object.id).components), inMemory);
});
