// Turning a `.px` into an attachable Component type, and keeping the objects that already
// carry one up to date (ADR-0031 §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    Object as SceneObject,
    ComponentRegistry,
    PropertyType,
    Scene,
    Transform,
    componentSchema,
    nodes,
    registerStandardNodes
} from '../../core/mod.js';

// The catalogue a `.px` model resolves its node types in, and the one the interpreter
// reads. The Workspace uses the default registry, so this is the registry to fill.
registerStandardNodes();
import { Project, ResourceKind } from '../../project/mod.js';
import { Behaviors, createGraphInterpreter } from '../../runtime/mod.js';
import { Workspace } from './workspace.js';
import { createResourceOfKind } from './commands.js';
import { createDefinitions } from './definitions.js';

/** A workspace with an open scene, an installer, and one `.px` to play with. */
async function setup() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const workspace = new Workspace();
    const scene = new Scene('Test', { registry });
    workspace.create(scene);

    const px = createResourceOfKind(workspace.project, ResourceKind.COMPONENT, { parent: null });
    // The other half of what a `.px` is: the shell holds one host for the session and hands
    // it over, exactly as `project/graphs.js` requires (ADR-0015, ADR-0020).
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    const definitions = createDefinitions({
        project: workspace.project,
        registry,
        workspace,
        scene,
        behaviors
    });

    return { workspace, scene, registry, px, definitions, behaviors };
}

/** An object in the scene carrying the installed Component. */
function carrier(scene, registry, type, name = 'Hero') {
    const object = new SceneObject(name);
    object.addComponent(new Transform());
    object.addComponent(new (registry.get(type))());
    scene.add(object);
    return object;
}

test('a .px installs under its own ResourceId, so installing twice is idempotent', async () => {
    const { registry, px, definitions } = await setup();

    assert.equal(await definitions.install(px.id), px.id);
    assert.equal(registry.has(px.id), true);

    const first = registry.get(px.id);
    await definitions.install(px.id);
    assert.equal(registry.get(px.id), first, 'one class per type, for the session');
});

test('anything that is not a .px does not install', async () => {
    const { workspace, definitions } = await setup();
    const folder = workspace.project.addFolder({ name: 'Assets' });

    assert.equal(await definitions.install(folder.id), null);
    assert.equal(await definitions.install('nope'), null);
});

test('declaring a property reaches an object that already carries the Component', async () => {
    const { scene, registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);
    const object = carrier(scene, registry, px.id);

    const model = await workspace.attach(px.id, { registry });
    model.addProperty({ name: 'health', type: PropertyType.NUMBER, default: 100 });
    await definitions.install(px.id);

    assert.equal(object.getComponent(px.id).health, 100, 'the value arrives');
    assert.ok('health' in componentSchema(object.getComponent(px.id)),
        'and the instance reports the schema, so a panel can draw a row for it');
});

test('the class is updated in place, so old and new instances agree', async () => {
    const { scene, registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);
    const before = carrier(scene, registry, px.id, 'Old');

    const model = await workspace.attach(px.id, { registry });
    model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 7 });
    await definitions.install(px.id);

    const after = carrier(scene, registry, px.id, 'New');

    assert.equal(before.getComponent(px.id).constructor, after.getComponent(px.id).constructor,
        'two classes for one type was always the anomaly (ADR-0021)');
    assert.equal(before.getComponent(px.id).speed, 7);
    assert.equal(after.getComponent(px.id).speed, 7);
});

test('a value a creator set survives the next schema change', async () => {
    const { scene, registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);
    const object = carrier(scene, registry, px.id);

    const model = await workspace.attach(px.id, { registry });
    model.addProperty({ name: 'health', type: PropertyType.NUMBER, default: 100 });
    await definitions.install(px.id);

    object.getComponent(px.id).setProperty('health', 42);

    model.addProperty({ name: 'damage', type: PropertyType.NUMBER, default: 7 });
    await definitions.install(px.id);

    assert.equal(object.getComponent(px.id).health, 42, 'declaring a property must not cost the others');
    assert.equal(object.getComponent(px.id).damage, 7);
});

test('a renamed property carries its value across', async () => {
    const { scene, registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);
    const object = carrier(scene, registry, px.id);

    const model = await workspace.attach(px.id, { registry });
    const speed = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 5 });
    await definitions.install(px.id);
    object.getComponent(px.id).setProperty('speed', 12);

    model.renameProperty(speed.id, 'movementSpeed');
    await definitions.install(px.id);

    assert.equal(object.getComponent(px.id).movementSpeed, 12, 'identity is what a rename keeps');
    assert.equal(object.getComponent(px.id).speed, undefined);
});

test('a removed property is dropped from the objects carrying it', async () => {
    const { scene, registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);
    const object = carrier(scene, registry, px.id);

    const model = await workspace.attach(px.id, { registry });
    const speed = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 5 });
    await definitions.install(px.id);

    model.removeProperty(speed.id);
    await definitions.install(px.id);

    assert.equal(object.getComponent(px.id).speed, undefined);
    assert.equal('speed' in componentSchema(object.getComponent(px.id)), false);
});

test('the label follows the definition without touching any instance', async () => {
    const { registry, px, definitions, workspace } = await setup();
    await definitions.install(px.id);

    const model = await workspace.attach(px.id, { registry });
    model.setLabel('Controller');
    await definitions.install(px.id);

    assert.equal(registry.get(px.id).label, 'Controller');
});

test('an open .px installs the model being edited, not the payload last saved', async () => {
    const { registry, px, definitions, workspace } = await setup();
    const model = await workspace.attach(px.id, { registry });

    // Never saved: the store still holds the empty definition.
    model.addProperty({ name: 'unsaved', type: PropertyType.NUMBER, default: 3 });
    await definitions.install(px.id);

    assert.ok('unsaved' in componentSchema(registry.get(px.id)),
        'a creator who declares a property and drops the .px expects it to be there');
});

test('installing a .px binds its graph, so the type has a behaviour and not just a schema', async () => {
    const { px, definitions, behaviors, workspace, registry } = await setup();

    const model = await workspace.attach(px.id, { registry });
    model.graph.addNode({ type: 'event.update' });

    await definitions.install(px.id);

    assert.equal(behaviors.has(px.id), true, 'a Component is properties AND behaviour');
    assert.equal(behaviors.graphOf(px.id).nodes.length, 1);
});

test('refresh re-reads an open .px, so a graph edited after the install is the one that runs', async () => {
    const { px, definitions, behaviors, workspace, registry } = await setup();

    const model = await workspace.attach(px.id, { registry });
    await definitions.install(px.id);
    const first = behaviors.graphOf(px.id);

    // A node added is not a schema change, so nothing re-installs on its own — which is
    // exactly the gap `refresh()` closes at the moment a session starts.
    model.graph.addNode({ type: 'event.update' });
    assert.equal(behaviors.graphOf(px.id), first, 'a graph nudge does not rebuild the class');

    await definitions.refresh();

    assert.notEqual(behaviors.graphOf(px.id), first, 'a new payload, so a new behaviour');
    assert.equal(behaviors.graphOf(px.id).nodes.length, 1);
});

test('refresh reads the model being edited, saved or not', async () => {
    const { px, definitions, behaviors, workspace, registry } = await setup();
    await definitions.install(px.id);

    const model = await workspace.attach(px.id, { registry });
    model.graph.addNode({ type: 'event.start' });
    await definitions.refresh();

    assert.equal(behaviors.graphOf(px.id).nodes[0].type, 'event.start',
        'a creator who wires a graph and presses Play expects THAT graph to run');
});

test('a .px with no behaviours host installs all the same', async () => {
    const registry = new ComponentRegistry();
    const workspace = new Workspace();
    const project = workspace.project;
    const px = createResourceOfKind(project, ResourceKind.COMPONENT, { parent: null });
    const definitions = createDefinitions({ project, registry });

    assert.equal(await definitions.install(px.id), px.id);
    assert.deepEqual(await definitions.refresh(), [px.id]);
});
