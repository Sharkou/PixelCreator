import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Scene, Transform, defineComponent } from '../core/mod.js';
import { RectangleRenderer } from '../runtime/mod.js';
import { describeType, groupTypes, registerBuiltIns } from './registry.js';
import { Selection } from './selection.js';
import { addComponent, availableComponents, createObject, deleteObject, removeComponent, uniqueName } from './commands.js';

function registry() {
    return registerBuiltIns(new ComponentRegistry());
}

test('a created object joins the scene with a Transform', () => {
    const scene = new Scene('Main');
    const object = createObject(scene, { kind: 'rectangle', x: 30, y: -10 });

    assert.equal(scene.has(object), true);
    assert.equal(object.hasComponent('Transform'), true);
    assert.equal(object.hasComponent('RectangleRenderer'), true);
    assert.equal(object.x, 30);
    assert.equal(object.y, -10);
});

test('each kind carries what it is meant to', () => {
    const scene = new Scene('Main');

    assert.equal(createObject(scene, { kind: 'camera' }).hasComponent('Camera'), true);

    const empty = createObject(scene, { kind: 'empty' });
    assert.deepEqual(globalThis.Object.keys(empty.components), ['Transform']);
});

test('creating under a parent announces the link', () => {
    const scene = new Scene('Main');
    const parent = createObject(scene, { kind: 'empty' });

    const links = [];
    scene.on('child:added', payload => links.push(payload.child.name));
    const child = createObject(scene, { kind: 'empty', parent });

    assert.equal(child.parent, parent);
    assert.deepEqual(links, [child.name]);
});

test('names do not collide inside a scene', () => {
    const scene = new Scene('Main');
    const names = [
        createObject(scene, { kind: 'rectangle' }).name,
        createObject(scene, { kind: 'rectangle' }).name,
        createObject(scene, { kind: 'rectangle' }).name
    ];

    assert.deepEqual(names, ['Rectangle', 'Rectangle 2', 'Rectangle 3']);
    assert.equal(uniqueName(scene, 'Ground'), 'Ground');
});

test('deleting takes the subtree with it', () => {
    const scene = new Scene('Main');
    const parent = createObject(scene, { kind: 'empty' });
    createObject(scene, { kind: 'empty', parent });

    assert.equal(deleteObject(scene, parent), true);
    assert.equal(scene.size, 0);
    assert.equal(deleteObject(scene, null), false);
});

test('components are added and removed through the registry', () => {
    const scene = new Scene('Main');
    const known = registry();
    const object = createObject(scene, { kind: 'empty' });

    const component = addComponent(object, 'RectangleRenderer', known);
    assert.ok(component instanceof RectangleRenderer);
    assert.equal(object.hasComponent('RectangleRenderer'), true);

    assert.equal(removeComponent(object, 'RectangleRenderer'), true);
    assert.equal(object.hasComponent('RectangleRenderer'), false);
});

test('the add menu never offers a type already attached', () => {
    const scene = new Scene('Main');
    const known = registry();
    const object = createObject(scene, { kind: 'rectangle' });

    const available = availableComponents(object, known);
    assert.equal(available.includes('Transform'), false);
    assert.equal(available.includes('RectangleRenderer'), false);
    assert.equal(available.includes('Sprite'), true);
});

test('a component built from a definition is offered like any other', () => {
    const scene = new Scene('Main');
    const known = registry();
    known.register(defineComponent({
        type: 'Health',
        properties: { maxHealth: { type: 'number', default: 100 } }
    }));

    const object = createObject(scene, { kind: 'empty' });
    assert.equal(availableComponents(object, known).includes('Health'), true);

    const health = addComponent(object, 'Health', known);
    assert.equal(health.maxHealth, 100);
});

test('registering the built-ins twice is not an error', () => {
    const known = registry();
    assert.doesNotThrow(() => registerBuiltIns(known));
    assert.equal(known.get('Transform'), Transform);
});

test('the selection is announced and is not part of the model', () => {
    const scene = new Scene('Main');
    const selection = new Selection();
    const object = createObject(scene, { kind: 'empty' });

    const seen = [];
    selection.observe(change => seen.push(change.object?.name ?? null));

    selection.set(object);
    selection.set(object);
    selection.clear();

    assert.deepEqual(seen, [object.name, null], 'selecting the same object twice says nothing');
    assert.equal(selection.object, null);
    assert.equal('current' in scene, false, 'Legacy kept the selection on the Scene');
});

test('the Add menu is grouped and reads in plain language', () => {
    const known = registry();
    const groups = groupTypes(['RectangleRenderer', 'Camera', 'ParticleSystem', 'Transform'], known);

    assert.deepEqual(groups.map(group => group.category), ['Rendering', 'Scene']);
    assert.deepEqual(groups[0].entries.map(entry => entry.label), ['Particles', 'Rectangle']);
    assert.deepEqual(groups[1].entries.map(entry => entry.label), ['Camera', 'Transform']);
});

test('a component that names its own category keeps it', () => {
    const known = registry();
    const Health = defineComponent({ type: 'Health', properties: {} });
    Health.category = 'Gameplay';
    Health.label = 'Health';
    known.register(Health);

    const groups = groupTypes(['Health', 'Camera'], known);
    assert.deepEqual(groups.map(group => group.category), ['Scene', 'Gameplay']);
    assert.equal(describeType('Health', known).label, 'Health');
});

test('an unknown type is grouped rather than dropped', () => {
    const known = registry();
    known.register(defineComponent({ type: 'Mystery', properties: {} }));

    const groups = groupTypes(['Mystery'], known);
    assert.deepEqual(groups, [{ category: 'Other', entries: [{ type: 'Mystery', label: 'Mystery', category: 'Other' }] }]);
});
