import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from './scene.js';
import { Object } from './object.js';
import { Transform } from './components/transform.js';
import { Origin } from './properties/origin.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
}

test('objects are added and looked up by id', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));

    assert.equal(scene.size, 1);
    assert.equal(scene.get(object.id), object);
    assert.equal(scene.has(object), true);
    assert.equal(scene.has(object.id), true);
});

test('adding announces the object', () => {
    const scene = new Scene('Main');
    const seen = [];
    scene.on('added', object => seen.push(object.name));

    scene.add(new Object('Player'));

    assert.deepEqual(seen, ['Player']);
});

test('adding the same object twice is idempotent', () => {
    const scene = new Scene('Main');
    const object = new Object('Player');

    scene.add(object);
    scene.add(object);

    assert.equal(scene.size, 1);
});

test('two objects cannot share an id', () => {
    const scene = new Scene('Main');
    const first = scene.add(new Object('Player'));
    const clash = new Object('Other', { id: first.id });

    assert.throws(() => scene.add(clash), /already used/);
});

test('removing announces the object and detaches it', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const seen = [];
    scene.on('removed', removed => seen.push(removed.name));

    assert.equal(scene.remove(object), true);
    assert.equal(scene.size, 0);
    assert.equal(object.scene, null);
    assert.deepEqual(seen, ['Player']);
    assert.equal(scene.remove(object), false);
});

test('removing an object removes its subtree', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    const grandchild = scene.add(new Object('Grandchild'));
    parent.addChild(child);
    child.addChild(grandchild);

    scene.remove(parent);

    assert.equal(scene.size, 0, 'no child is left pointing at a parent that is gone');
});

test('removing a child detaches it from its parent', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    scene.remove(child);

    assert.deepEqual(parent.children, []);
    assert.equal(scene.size, 1);
});

test('an object joining a scene adopts its pipeline', () => {
    const scene = new Scene('Main');
    const object = new Object('Player');

    assert.notEqual(object.operations, scene.operations);

    scene.add(object);

    assert.equal(object.operations, scene.operations);
    assert.equal(object.scene, scene);
});

test('objects in a scene share one operation stream', () => {
    const scene = new Scene('Main');
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    const operations = [];
    scene.operations.on('operation', operation => operations.push(operation.target.object));

    first.setProperty('name', 'A');
    second.setProperty('name', 'B');

    assert.deepEqual(operations, [first.id, second.id]);
});

test('the scene resolves operation targets, components included', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const transform = object.addComponent(new Transform());

    scene.operations.apply({
        type: 'SET_PROPERTY',
        target: { object: object.id, component: 'Transform' },
        prop: 'x',
        value: 99,
        previous: 0,
        origin: Origin.NETWORK,
        actor: null,
        batch: null,
        seq: 1
    });

    assert.equal(transform.x, 99);
    assert.equal(object.x, 99);
});

test('roots are the objects without a parent', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    const loose = scene.add(new Object('Loose'));
    parent.addChild(child);

    assert.deepEqual(scene.roots(), [parent, loose]);
});

test('lookups by name, tag and component', () => {
    const scene = new Scene('Main');
    const first = scene.add(new Object('Enemy', { tag: 'hostile' }));
    const second = scene.add(new Object('Enemy', { tag: 'hostile' }));
    const player = scene.add(new Object('Player', { tag: 'friendly' }));
    player.addComponent(new Rotator());

    // Names are not identities, so several objects may share one (ADR-0010).
    assert.deepEqual(scene.findByName('Enemy'), [first, second]);
    assert.deepEqual(scene.findByTag('friendly'), [player]);
    assert.deepEqual(scene.findByComponent('Rotator'), [player]);
    assert.deepEqual(scene.findByComponent(Rotator), [player]);
});

test('objects keep insertion order', () => {
    const scene = new Scene('Main');
    scene.add(new Object('A'));
    scene.add(new Object('B'));
    scene.add(new Object('C'));

    assert.deepEqual(scene.objects().map(object => object.name), ['A', 'B', 'C']);
});

test('a scene has an identity and a mutable name', () => {
    const scene = new Scene('Main');
    assert.equal(typeof scene.id, 'string');
    assert.equal(scene.name, 'Main');

    scene.name = 'Renamed';
    assert.equal(scene.name, 'Renamed');
});

test('the Editor selection is not part of the scene', () => {
    // Legacy kept scene.current and scene.currentComponent in the Core, IDE state read
    // by five different modules.
    const scene = new Scene('Main');
    assert.equal(scene.current, undefined);
    assert.equal(scene.currentComponent, undefined);
});

test('Scene.add rejects a value without an id', () => {
    const scene = new Scene('Main');
    assert.throws(() => scene.add({}), TypeError);
    assert.throws(() => scene.add(null), TypeError);
});
