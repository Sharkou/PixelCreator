import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, hierarchyOrder } from './scene.js';
import { Object } from './object.js';
import { Transform } from './components/transform.js';
import { Origin } from './properties/origin.js';
import { deserializeScene, serializeObject, serializeScene } from './serialize.js';
import { removeObjectOperation } from './operations/operation.js';
import { invert } from './operations/invert.js';

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

test('attaching and detaching a component is announced', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const seen = [];
    scene.on('component:added', payload => seen.push(['added', payload.type, payload.object.name]));
    scene.on('component:removed', payload => seen.push(['removed', payload.type, payload.object.name]));

    const rotator = object.addComponent(new Rotator());
    assert.equal(object.removeComponent(rotator), true);

    assert.deepEqual(seen, [['added', 'Rotator', 'Player'], ['removed', 'Rotator', 'Player']]);
});

test('a component attached before the object joins a scene is not announced', () => {
    const scene = new Scene('Main');
    const object = new Object('Player');
    object.addComponent(new Rotator());

    const seen = [];
    scene.on('component:added', payload => seen.push(payload.type));
    scene.add(object);

    assert.deepEqual(seen, [], 'nobody was watching when it happened');
});

test('parenting and unparenting are announced', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    const seen = [];
    scene.on('child:added', payload => seen.push(['added', payload.parent.name, payload.child.name]));
    scene.on('child:removed', payload => seen.push(['removed', payload.parent.name, payload.child.name]));

    parent.addChild(child);
    parent.removeChild(child);

    assert.deepEqual(seen, [['added', 'Parent', 'Child'], ['removed', 'Parent', 'Child']]);
});

test('reparenting announces the departure before the arrival', () => {
    const scene = new Scene('Main');
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    const child = scene.add(new Object('Child'));
    first.addChild(child);

    const seen = [];
    scene.on('child:added', payload => seen.push(`+${payload.parent.name}`));
    scene.on('child:removed', payload => seen.push(`-${payload.parent.name}`));

    second.addChild(child);

    assert.deepEqual(seen, ['-First', '+Second']);
});

test('a structural event never announces a tree that is half moved', () => {
    // A reparent unlinks and then links. A listener that rebuilt on the first half used to
    // read a scene where the object belonged to nothing — not under a parent, not among
    // the roots — and nothing came afterwards to correct it. The Hierarchy drew a tree
    // with the object missing, which is how undoing a drop appeared to delete it.
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    const shapes = [];
    const record = () => shapes.push({
        roots: scene.roots().map(object => object.name),
        parent: child.parent?.name ?? null
    });
    for (const event of ['child:added', 'child:removed', 'roots:reordered']) scene.on(event, record);

    scene.reparent(child, null, 0);

    assert.ok(shapes.length > 0, 'the move was announced');
    for (const shape of shapes) {
        assert.deepEqual(shape.roots, ['Child', 'Parent']);
        assert.equal(shape.parent, null);
    }
});

test('a reparent into another branch is announced once the object is in it', () => {
    const scene = new Scene('Main');
    const first = scene.add(new Object('First'));
    const second = scene.add(new Object('Second'));
    const child = scene.add(new Object('Child'));
    first.addChild(child);

    const seen = [];
    scene.on('child:removed', () => seen.push({ event: 'removed', parent: child.parent?.name ?? null }));
    scene.on('child:added', () => seen.push({ event: 'added', parent: child.parent?.name ?? null }));

    scene.reparent(child, second, 0);

    assert.deepEqual(seen, [
        { event: 'removed', parent: 'Second' },
        { event: 'added', parent: 'Second' }
    ]);
});

test('removing an object announces the subtree it takes with it', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    const removed = [];
    scene.on('removed', object => removed.push(object.name));
    scene.remove(parent);

    assert.deepEqual(removed, ['Child', 'Parent']);
});

test('a detached object announces nothing', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    scene.remove(object);

    const seen = [];
    scene.on('component:added', payload => seen.push(payload.type));
    object.addComponent(new Rotator());

    assert.deepEqual(seen, []);
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

// --- the canonical order of a scene (ADR-0034 §3.1) -------------------------------------
//
// The order the searches answer in has to be a fact about the scene's STATE, never about
// the order its objects happened to join. These tests are the demonstration, not an
// illustration: each one builds two scenes that hold the same thing and reached it by a
// different road, and asks the searches to agree.

/** Three objects sharing a tag, so the order a search answers in is observable. */
function tagged() {
    const scene = new Scene('Main');
    const a = scene.add(new Object('A', { tag: 'enemy' }));
    const b = scene.add(new Object('B', { tag: 'enemy' }));
    const c = scene.add(new Object('C', { tag: 'enemy' }));
    return { scene, a, b, c };
}

const names = objects => objects.map(object => object.name);

test('the searches answer in hierarchy order, and objects() keeps insertion order', () => {
    const { scene, a, c } = tagged();
    scene.reparent(c, a, 0);

    // The storage is untouched by a reparent; the shape of the tree is not.
    assert.deepEqual(names(scene.objects()), ['A', 'B', 'C'], 'objects() is still insertion order');
    assert.deepEqual(names(hierarchyOrder(scene)), ['A', 'C', 'B']);

    assert.deepEqual(names(scene.findByTag('enemy')), ['A', 'C', 'B']);
    assert.deepEqual(names(scene.findByName('B')), ['B']);
});

test('findByName and findByComponent answer in the same order as findByTag', () => {
    const { scene, a, b, c } = tagged();
    for (const object of [a, b, c]) object.addComponent(new Rotator());
    scene.reparent(c, a, 0);

    assert.deepEqual(names(scene.findByComponent('Rotator')), ['A', 'C', 'B']);
    // Names are not identities, so several may match and the order still has to be stable.
    for (const object of [a, b, c]) object.name = 'Same';
    assert.deepEqual(scene.findByName('Same').map(object => object.id), [a.id, c.id, b.id]);
});

test('a save and a reload do not change what the searches answer', () => {
    const { scene, a, c } = tagged();
    scene.reparent(c, a, 0);

    const reloaded = deserializeScene(serializeScene(scene));

    assert.deepEqual(names(reloaded.findByTag('enemy')), names(scene.findByTag('enemy')));
    // And the reload is exactly what makes insertion order untrustworthy: the storage of the
    // reloaded scene is now in hierarchy order, while the original's is not.
    assert.deepEqual(names(reloaded.objects()), ['A', 'C', 'B']);
    assert.deepEqual(names(scene.objects()), ['A', 'B', 'C']);
});

test('a deletion and its inverse do not change what the searches answer', () => {
    // THE CASE THAT DECIDED ADR-0034 §3.1, and it is reached through the real pipeline:
    // REMOVE_OBJECT, then the operation `invert()` produces from it. The state is identical
    // on both sides of the round trip; the storage order is not, because a restored object
    // joins the scene last.
    const { scene } = tagged();
    const before = names(scene.findByTag('enemy'));

    const target = scene.roots()[0];
    const removal = removeObjectOperation({
        object: serializeObject(target),
        subtree: [],
        parent: null,
        index: scene.indexOf(target),
        origin: Origin.EDITOR
    });

    assert.equal(scene.operations.submit(removal).applied, true);
    assert.equal(scene.operations.submit(invert(removal)).applied, true);

    assert.deepEqual(names(scene.objects()), ['B', 'C', 'A'], 'the storage order did change');
    assert.deepEqual(names(scene.findByTag('enemy')), before, 'the answer did not');
});

test('the canonical order reaches every object the scene holds', () => {
    // ADR-0034 invariant 7. Nothing falls back for an object that is neither a root nor a
    // child of one: such an object would be a defect in whatever added it, and a fallback
    // would hide it. So the invariant is guarded here instead.
    const { scene, a, b, c } = tagged();
    scene.reparent(c, a, 0);
    const d = scene.add(new Object('D'));
    b.addChild(d);
    const e = scene.add(new Object('E'));
    scene.reparent(e, d, 0);

    assert.equal(hierarchyOrder(scene).length, scene.size);
    assert.deepEqual(
        new Set(hierarchyOrder(scene).map(object => object.id)),
        new Set(scene.objects().map(object => object.id))
    );
});
