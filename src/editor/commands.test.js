import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object as SceneObject, PropertyType, Scene, Transform, defineComponent } from '../core/mod.js';
import { RectangleRenderer } from '../runtime/mod.js';
import { Project, ResourceKind } from '../project/mod.js';
import { createResourceOfKind } from './project/commands.js';
import { describeType, groupTypes, registerBuiltIns } from './registry.js';
import { Selection } from './selection.js';
import { addComponent, availableComponents, createObject, deleteObject, pointSocketAt, removeComponent, uniqueName } from './commands.js';

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

// --- what a `.px` is called -------------------------------------------------------------
//
// A `.px` IS A RESOURCE AND A TYPE AT ONCE (ADR-0026), and the two carry different names on
// purpose (ADR-0021): the identity is the ResourceId, the name is data a creator edits.
// Creating one used to COPY the file name into the definition, which made a third name that
// was true until the first rename — the Project panel read `Counter.px` and Add Component
// went on offering `New Component.px`.

test('a `.px` with no label of its own is called what the project calls it', () => {
    const known = registry();
    const project = new Project('Game');
    const resource = createResourceOfKind(project, ResourceKind.COMPONENT);
    known.register(defineComponent({ type: resource.id, properties: {} }));

    assert.equal(describeType(resource.id, known, { project }).label, 'New Component',
        'the resource name, without the extension: this names a TYPE, beside Sprite and Transform');
});

test('renaming the `.px` renames the Component, with nothing to invalidate', () => {
    const known = registry();
    const project = new Project('Game');
    const resource = createResourceOfKind(project, ResourceKind.COMPONENT);
    known.register(defineComponent({ type: resource.id, properties: {} }));

    project.setProperty(resource.id, 'name', 'Counter.px');

    assert.equal(describeType(resource.id, known, { project }).label, 'Counter');
    assert.equal(groupTypes([resource.id], known, { project })[0].entries[0].label, 'Counter',
        'and the Add Component menu reads the same answer');
});

test('a label a creator really chose survives a rename of the file', () => {
    const known = registry();
    const project = new Project('Game');
    const resource = createResourceOfKind(project, ResourceKind.COMPONENT);
    // What `setLabel()` writes: a name for the TYPE, apart from the name of the file.
    known.register(defineComponent({ type: resource.id, label: 'Health', properties: {} }));

    project.setProperty(resource.id, 'name', 'Counter.px');

    assert.equal(describeType(resource.id, known, { project }).label, 'Health',
        'two fields mean two answers, and the chosen one wins (ADR-0016)');
});

test('a shipped type is unaffected by any of it', () => {
    const known = registry();
    const project = new Project('Game');

    assert.equal(describeType('RectangleRenderer', known, { project }).label, 'Rectangle');
    assert.equal(describeType('Transform', known, { project }).label, 'Transform');
    assert.equal(describeType('Transform', known).label, 'Transform', 'and with no project at all');
});

/** A scene with two objects carrying one `.px`, and a Crate for them to point at. */
function socketScene() {
    const type = 'res_door';
    const payload = {
        type,
        label: 'Door',
        properties: { target: { id: 'p_target', type: PropertyType.OBJECTREF, default: null } },
        graph: { version: 1, nodes: [], connections: [] }
    };
    const Door = defineComponent(payload);

    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Door);

    const scene = new Scene('Level', { registry });
    const submitted = [];
    scene.operations.on('operation', operation => submitted.push(operation));

    const make = name => {
        const object = scene.add(new SceneObject(name));
        object.addComponent(new Transform());
        return object;
    };

    const doorA = make('Door A');
    const doorB = make('Door B');
    doorA.addComponent(new Door());
    doorB.addComponent(new Door());
    const crate = make('Crate');
    const other = make('Other');

    return {
        scene, type, doorA, doorB, crate, other, submitted,
        socket: { id: 'p_target', name: 'target', type: PropertyType.OBJECTREF }
    };
}

// --- pointing a `.px`'s Object socket at a scene Object (ADR-0043) ------------------------

test('pointing a socket fills every instance that has no answer yet', () => {
    const it = socketScene();

    const pointed = pointSocketAt(it.scene, it.socket, { type: it.type, object: it.crate.id });

    assert.equal(pointed.length, 2, 'both doors were given the Crate');
    assert.equal(it.doorA.getComponent(it.type).target, it.crate.id);
    assert.equal(it.doorB.getComponent(it.type).target, it.crate.id);
});

test('an answer a creator already gave is never overwritten', () => {
    // A GESTURE THAT NAMES A DEFAULT MUST NOT UNDO A DECISION. Door B was aimed somewhere
    // else by hand; the drop fills the empty one and leaves the other exactly as it is.
    const it = socketScene();
    it.doorB.getComponent(it.type).target = it.other.id;

    const pointed = pointSocketAt(it.scene, it.socket, { type: it.type, object: it.crate.id });

    assert.equal(pointed.length, 1);
    assert.equal(it.doorA.getComponent(it.type).target, it.crate.id);
    assert.equal(it.doorB.getComponent(it.type).target, it.other.id, 'left alone');
});

test('objects that do not carry the Component are not touched', () => {
    const it = socketScene();

    pointSocketAt(it.scene, it.socket, { type: it.type, object: it.crate.id });

    assert.ok(!it.crate.getComponent(it.type), 'the Crate carries no Door');
    assert.equal(Reflect.has(it.crate, 'target'), false, 'nothing was written onto a stranger');
});

test('a gesture that names no Object writes nothing at all', () => {
    // THE COMMON CASE OF THE SECOND HALF: `Get Property` declares a socket as a MEANS, and
    // the payload it came from may carry no identity. Nothing to point at, nothing written.
    const it = socketScene();

    assert.deepEqual(pointSocketAt(it.scene, it.socket, { type: it.type, object: null }), []);
    assert.deepEqual(pointSocketAt(null, it.socket, { type: it.type, object: it.crate.id }), []);
    assert.deepEqual(pointSocketAt(it.scene, null, { type: it.type, object: it.crate.id }), []);
    assert.equal(it.doorA.getComponent(it.type).target, null);
});

test('the writes are authored, so one gesture is one undo on the scene', () => {
    const it = socketScene();
    const batch = 'one-gesture';

    pointSocketAt(it.scene, it.socket, { type: it.type, object: it.crate.id, batch });

    // AUTHORED, NOT PLAIN. A plain write would reach the value and never the history, so
    // the scene half of the gesture could not be taken back — and the `.px` half can
    // (ADR-0024). What this asserts is that they went through the pipeline at all.
    const writes = it.submitted.filter(operation => operation.prop === 'target');
    assert.equal(writes.length, 2, 'two instances, two authored writes');
    assert.ok(writes.every(operation => operation.batch === batch), 'under one batch');
});
