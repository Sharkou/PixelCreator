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

/**
 * A scene that knows the shipped types.
 *
 * A Scene builds components through its own registry now, because ADD_OBJECT and
 * ADD_COMPONENT rebuild from a payload — which is what lets any node, including a server,
 * apply the same operation (ADR-0019).
 */
function sceneWith(known = registry()) {
    return new Scene('Main', { registry: known });
}

test('a created object joins the scene with a Transform', () => {
    const scene = sceneWith();
    const object = createObject(scene, { kind: 'rectangle', x: 30, y: -10 });

    assert.equal(scene.has(object), true);
    assert.equal(object.hasComponent('Transform'), true);
    assert.equal(object.hasComponent('RectangleRenderer'), true);
    assert.equal(object.x, 30);
    assert.equal(object.y, -10);
});

test('each kind carries what it is meant to', () => {
    const scene = sceneWith();

    assert.equal(createObject(scene, { kind: 'camera' }).hasComponent('Camera'), true);

    const empty = createObject(scene, { kind: 'empty' });
    assert.deepEqual(globalThis.Object.keys(empty.components), ['Transform']);
});

test('creating under a parent announces the link', () => {
    const scene = sceneWith();
    const parent = createObject(scene, { kind: 'empty' });

    const links = [];
    scene.on('child:added', payload => links.push(payload.child.name));
    const child = createObject(scene, { kind: 'empty', parent });

    assert.equal(child.parent, parent);
    assert.deepEqual(links, [child.name]);
});

test('names do not collide inside a scene', () => {
    const scene = sceneWith();
    const names = [
        createObject(scene, { kind: 'rectangle' }).name,
        createObject(scene, { kind: 'rectangle' }).name,
        createObject(scene, { kind: 'rectangle' }).name
    ];

    assert.deepEqual(names, ['Rectangle', 'Rectangle 2', 'Rectangle 3']);
    assert.equal(uniqueName(scene, 'Ground'), 'Ground');
});

test('deleting takes the subtree with it', () => {
    const scene = sceneWith();
    const parent = createObject(scene, { kind: 'empty' });
    createObject(scene, { kind: 'empty', parent });

    assert.equal(deleteObject(scene, parent), true);
    assert.equal(scene.size, 0);
    assert.equal(deleteObject(scene, null), false);
});

test('components are added and removed through the registry', () => {
    const known = registry();
    const scene = sceneWith(known);
    const object = createObject(scene, { kind: 'empty' });

    const component = addComponent(object, 'RectangleRenderer', known);
    assert.ok(component instanceof RectangleRenderer);
    assert.equal(object.hasComponent('RectangleRenderer'), true);

    assert.equal(removeComponent(object, 'RectangleRenderer'), true);
    assert.equal(object.hasComponent('RectangleRenderer'), false);
});

test('the add menu never offers a type already attached', () => {
    const known = registry();
    const scene = sceneWith(known);
    const object = createObject(scene, { kind: 'rectangle' });

    const available = availableComponents(object, known);
    assert.equal(available.includes('Transform'), false);
    assert.equal(available.includes('RectangleRenderer'), false);
    assert.equal(available.includes('Sprite'), true);
});

test('a component built from a definition is offered like any other', () => {
    const known = registry();
    const scene = sceneWith(known);
    known.register(defineComponent({
        type: 'res_health',
        label: 'Health',
        properties: { maxHealth: { type: 'number', default: 100 } }
    }));

    const object = createObject(scene, { kind: 'empty' });
    assert.equal(availableComponents(object, known).includes('res_health'), true);

    const health = addComponent(object, 'res_health', known);
    assert.equal(health.maxHealth, 100);
});

test('registering the built-ins twice is not an error', () => {
    const known = registry();
    assert.doesNotThrow(() => registerBuiltIns(known));
    assert.equal(known.get('Transform'), Transform);
});

test('the selection is announced and is not part of the model', () => {
    const scene = sceneWith();
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
    const Health = defineComponent({
        type: 'res_health',
        label: 'Health',
        category: 'Gameplay',
        properties: {}
    });
    known.register(Health);

    const groups = groupTypes(['res_health', 'Camera'], known);
    assert.deepEqual(groups.map(group => group.category), ['Scene', 'Gameplay']);
    assert.equal(describeType('res_health', known).label, 'Health',
        'the menu reads the label, never the identity (ADR-0021)');
});

test('an unknown type is grouped rather than dropped', () => {
    const known = registry();
    known.register(defineComponent({ type: 'res_mystery', label: 'Mystery', properties: {} }));

    const groups = groupTypes(['res_mystery'], known);
    assert.deepEqual(groups, [{
        category: 'Other',
        entries: [{ type: 'res_mystery', label: 'Mystery', category: 'Other' }]
    }]);
});
