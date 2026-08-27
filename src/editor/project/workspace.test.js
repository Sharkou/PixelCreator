// What the Editor has open, and where it saves it (ADR-0020, ADR-0024).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object, Scene, Transform, registerStandardNodes } from '../../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind } from '../../project/mod.js';
import { createResourceOfKind } from './commands.js';
import { Workspace } from './workspace.js';

function registry() {
    const types = new ComponentRegistry();
    types.register(Transform);
    return types;
}

function sceneWithOne(name = 'Level 1') {
    const scene = new Scene(name, { registry: registry() });
    const object = scene.add(new Object('Hero'));
    object.addComponent(new Transform(4, 8));
    return scene;
}

// --- opening ---------------------------------------------------------------------------

test('creating a scene declares it and opens it', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();

    const resource = workspace.create(scene, { name: 'Level 1' });

    assert.equal(workspace.scene, scene);
    assert.equal(workspace.resource.id, resource.id);
    assert.equal(workspace.project.get(resource.id).kind, ResourceKind.SCENE);
    assert.equal(workspace.dirty, false);
});

test('a scene read back from the store becomes the open one', async () => {
    const store = new MemoryResourceStore();
    const source = new Workspace({ project: new Project('Game', { store }) });
    const resource = source.create(sceneWithOne());

    const reopened = new Workspace({
        project: Project.deserialize(source.project.serialize(), { store })
    });
    const scene = await reopened.open(resource.id, { registry: registry() });

    assert.equal(reopened.scene, scene);
    assert.equal(scene.objects()[0].getComponent('Transform').x, 4);
    assert.equal(reopened.dirty, false);
});

test('opening what the project does not declare answers null', async () => {
    const workspace = new Workspace();
    assert.equal(await workspace.open('nothing'), null);
});

// --- unsaved work ----------------------------------------------------------------------

test('an authored operation makes the workspace dirty, saving makes it clean', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    const resource = workspace.create(scene);

    const seen = [];
    workspace.on('dirty', payload => seen.push(payload.dirty));

    scene.objects()[0].setProperty('name', 'Heroine');
    assert.equal(workspace.dirty, true);

    workspace.save();
    assert.equal(workspace.dirty, false);
    assert.deepEqual(seen, [true, false]);
    assert.equal(workspace.project.read(resource.id).objects[0].name, 'Heroine');
});

test('a plain write is not unsaved work, because it is not an intent', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    workspace.create(scene);

    // A simulation output, not something a creator authored (ADR-0003).
    scene.objects()[0].x = 120;

    assert.equal(workspace.dirty, false);
});

test('a replicated operation does not report the local creator as having work to save', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    workspace.create(scene);
    const object = scene.objects()[0];

    scene.operations.apply({
        type: 'SET_PROPERTY',
        target: { object: object.id, component: null },
        prop: 'name',
        value: 'From the server',
        previous: 'Hero',
        origin: 'network',
        actor: 'someone-else',
        batch: null,
        seq: 12
    });

    assert.equal(object.name, 'From the server');
    assert.equal(workspace.dirty, false);
});

// --- undo stacks -----------------------------------------------------------------------

test('the open scene and the manifest have separate stacks', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    workspace.create(scene);

    scene.objects()[0].setProperty('name', 'Heroine');

    assert.equal(workspace.history.canUndo, true);
    assert.equal(workspace.projectHistory.canUndo, true, 'declaring the scene was an intent');

    workspace.history.undo();
    assert.equal(scene.objects()[0].name, 'Hero');
    assert.equal(workspace.projectHistory.canUndo, true, 'a scene undo left the manifest alone');
});

test('Ctrl Z in the Project panel takes back a rename of a resource, not of an object', () => {
    const workspace = new Workspace();
    const resource = workspace.create(sceneWithOne());

    workspace.project.setProperty(resource.id, 'name', 'Opening level');
    assert.equal(workspace.project.get(resource.id).name, 'Opening level');

    workspace.projectHistory.undo();
    assert.equal(workspace.project.get(resource.id).name, 'Level 1');
});

test('closing releases the scene stack and stops watching its pipeline', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    const resource = workspace.create(scene);

    assert.equal(workspace.close(), true);
    assert.equal(workspace.scene, null);
    assert.equal(workspace.history, null);
    assert.equal(workspace.histories.get(resource.id), null);

    scene.objects()[0].setProperty('name', 'Still edited');
    assert.equal(workspace.dirty, false, 'a closed scene cannot dirty the workspace');
});

test('opening a second scene closes the first', () => {
    const workspace = new Workspace();
    const first = workspace.create(sceneWithOne('One'));
    const events = [];
    workspace.on('closed', ({ resource }) => events.push(`closed:${resource.id}`));
    workspace.on('opened', ({ resource }) => events.push(`opened:${resource.id}`));

    const second = workspace.create(sceneWithOne('Two'));

    assert.deepEqual(events, [`closed:${first.id}`, `opened:${second.id}`]);
    assert.equal(workspace.histories.resources().includes(first.id), false);
});

// --- what a workspace is not -----------------------------------------------------------

test('nothing about the workspace reaches the serialized project', () => {
    const workspace = new Workspace();
    workspace.create(sceneWithOne());
    workspace.save();

    const data = workspace.project.serialize();

    assert.deepEqual(globalThis.Object.keys(data), ['format', 'id', 'name', 'resources']);
    assert.equal(globalThis.JSON.stringify(data).includes('dirty'), false);
    assert.equal(globalThis.JSON.stringify(data).includes('history'), false);
});

// --- selecting a resource ---------------------------------------------------------------

test('a resource is selected by id, and resolved from the manifest on every read', () => {
    const workspace = new Workspace();
    const resource = workspace.create(sceneWithOne());

    workspace.select(resource.id);

    assert.equal(workspace.selectedId, resource.id);
    assert.equal(workspace.selected.name, 'Level 1');

    // Renaming does not invalidate the selection: what is held is the identity.
    workspace.project.setProperty(resource.id, 'name', 'Opening level');
    assert.equal(workspace.selected.name, 'Opening level');
});

test('selecting announces the change, and selecting the same thing twice does not', () => {
    const workspace = new Workspace();
    const resource = workspace.create(sceneWithOne());
    const seen = [];
    workspace.on('selection', payload => seen.push(payload.id));

    workspace.select(resource.id);
    workspace.select(resource.id);
    workspace.select(null);

    assert.deepEqual(seen, [resource.id, null]);
});

test('selecting something the project does not declare selects nothing', () => {
    const workspace = new Workspace();
    workspace.create(sceneWithOne());

    assert.equal(workspace.select('nothing'), null);
    assert.equal(workspace.selected, null);
});

test('a removed resource stops being selected, however it was removed', () => {
    const workspace = new Workspace();
    const folder = workspace.project.addFolder({ name: 'Assets' });
    const asset = workspace.project.add(
        { kind: ResourceKind.ASSET, name: 'hero.png', parent: folder.id },
        'binary'
    );

    workspace.select(asset.id);
    workspace.project.removeTree(folder.id);

    assert.equal(workspace.selected, null, 'the Inspector cannot go on editing what is gone');
    assert.equal(workspace.selectedId, null);
});

test('undoing a creation clears a selection that pointed at it', () => {
    const workspace = new Workspace();
    const folder = workspace.project.addFolder({ name: 'Assets' });

    workspace.select(folder.id);
    workspace.projectHistory.undo();

    assert.equal(workspace.project.has(folder.id), false);
    assert.equal(workspace.selected, null);
});

test('the selection is Editor state, and reaches nothing that is persisted', () => {
    const workspace = new Workspace();
    const resource = workspace.create(sceneWithOne());
    workspace.select(resource.id);

    const data = globalThis.JSON.stringify(workspace.project.serialize());

    assert.equal(data.includes('selected'), false);
    assert.equal(data.includes('selection'), false);
});

// --- what may be deleted, and which stack undoes it --------------------------------------

test('the open scene cannot be deleted, nor can a folder holding it', () => {
    const workspace = new Workspace();
    const folder = workspace.project.addFolder({ name: 'Scenes' });
    const resource = workspace.create(sceneWithOne());
    workspace.project.move(resource.id, folder.id);

    assert.equal(workspace.canRemove(resource.id).allowed, false);
    assert.match(workspace.canRemove(resource.id).reason, /open/);
    assert.equal(workspace.canRemove(folder.id).allowed, false, 'a folder takes its contents');
    assert.match(workspace.canRemove(folder.id).reason, /open scene/);
    assert.equal(workspace.canRemove('nothing').allowed, false);
});

test('anything the Editor does not have open may be deleted', () => {
    const workspace = new Workspace();
    workspace.create(sceneWithOne());
    const folder = workspace.project.addFolder({ name: 'Assets' });

    assert.equal(workspace.canRemove(folder.id).allowed, true);
});

test('the active stack follows the last authored intent, not the selection', () => {
    const workspace = new Workspace();
    const scene = sceneWithOne();
    workspace.create(scene);
    const folder = workspace.project.addFolder({ name: 'Assets' });

    assert.equal(workspace.context, 'project');
    assert.equal(workspace.activeHistory, workspace.projectHistory);

    // Deleting clears the selection — and the undo that puts it back must still be aimed
    // at the manifest, which is what a selection-driven rule got wrong.
    workspace.select(folder.id);
    workspace.project.removeTree(folder.id);
    assert.equal(workspace.selected, null);
    assert.equal(workspace.activeHistory, workspace.projectHistory);

    workspace.activeHistory.undo();
    assert.equal(workspace.project.has(folder.id), true);

    // A scene edit hands the shortcut back to the scene's stack.
    scene.objects()[0].setProperty('name', 'Heroine');
    assert.equal(workspace.context, 'scene');
    assert.equal(workspace.activeHistory, workspace.history);
});

// --- opening a `.px`, and closing it (ADR-0027) -----------------------------------------

function componentResource(workspace, name = 'Controller.px') {
    const resource = workspace.project.add({ kind: ResourceKind.COMPONENT, name }, null);
    workspace.project.save(resource.id, {
        type: resource.id,
        label: 'Controller',
        properties: {},
        graph: { version: 1, nodes: [], connections: [] }
    });
    return resource;
}

test('a `.px` opens as a live definition, properties and graph in one model', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);

    const model = await workspace.open(resource.id);

    assert.equal(model.type, resource.id);
    assert.equal(model.label, 'Controller');
    assert.equal(model.graph.operations, model.operations, 'one resource, one pipeline');
    assert.equal(workspace.isOpen(resource.id), true);
    assert.equal(workspace.opened().length, 1);
});

test('a scene and a `.px` are open at once, each with its own stack', async () => {
    const workspace = new Workspace();
    const sceneModel = sceneWithOne();
    const scene = workspace.create(sceneModel);
    const component = componentResource(workspace);

    const model = await workspace.open(component.id);
    model.addProperty({ name: 'speed' });

    assert.equal(workspace.scene, sceneModel, 'opening a `.px` does not close the scene');
    assert.notEqual(workspace.histories.get(scene.id), null);
    assert.notEqual(workspace.histories.get(component.id), null);
    assert.notEqual(workspace.histories.get(scene.id), workspace.histories.get(component.id));

    // Ctrl Z follows the last authored intent, which was the Component's.
    assert.equal(workspace.activeHistory, workspace.histories.get(component.id));
    workspace.activeHistory.undo();
    assert.equal(model.properties().length, 0);
});

test('editing a `.px` makes it dirty, and saving writes the payload back', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);
    const model = await workspace.open(resource.id);

    model.addProperty({ name: 'speed', type: 'number', default: 12 });
    assert.equal(workspace.dirty, true);

    workspace.save();
    assert.equal(workspace.dirty, false);
    assert.equal(workspace.project.read(resource.id).properties.speed.default, 12);
});

test('an attached `.px` is editable but not open, so it can still be deleted', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);

    const model = await workspace.attach(resource.id);

    assert.notEqual(model, null);
    assert.equal(workspace.isOpen(resource.id), false);
    assert.equal(workspace.canRemove(resource.id).allowed, true);

    await workspace.open(resource.id);
    assert.equal(workspace.canRemove(resource.id).allowed, false);
    assert.match(workspace.canRemove(resource.id).reason, /Component is open/);
});

test('attaching twice hands back the same model, so two panels edit one thing', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);

    const first = await workspace.attach(resource.id);
    const second = await workspace.attach(resource.id);

    assert.equal(first, second);
});

test('closing a `.px` releases it, and the resource becomes deletable', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);
    await workspace.open(resource.id);

    const closed = [];
    workspace.on('closed', payload => closed.push(payload.resource.id));

    assert.equal(workspace.close(resource.id), true);
    assert.deepEqual(closed, [resource.id]);
    assert.equal(workspace.attached(resource.id), null);
    assert.equal(workspace.histories.get(resource.id), null);
    assert.equal(workspace.canRemove(resource.id).allowed, true);
    assert.equal(workspace.project.removeTree(resource.id), 1);
});

test('closing the scene lets it be deleted, which is what closing is for', () => {
    const workspace = new Workspace();
    const resource = workspace.create(sceneWithOne());

    assert.equal(workspace.canRemove(resource.id).allowed, false);
    workspace.close();
    assert.equal(workspace.canRemove(resource.id).allowed, true);
    assert.equal(workspace.project.removeTree(resource.id), 1);
});

test('deleting a resource closes whatever was editing it', async () => {
    const workspace = new Workspace();
    const resource = componentResource(workspace);
    await workspace.attach(resource.id);

    workspace.project.removeTree(resource.id);

    assert.equal(workspace.attached(resource.id), null);
    assert.equal(workspace.histories.get(resource.id), null);
});

test('a kind with no editor opens as nothing rather than as a broken window', async () => {
    const workspace = new Workspace();
    const folder = workspace.project.addFolder({ name: 'Assets' });

    assert.equal(await workspace.open(folder.id), null);
    assert.equal(workspace.isOpen(folder.id), false);
});

test('the active editor is the one the shortcuts act on, and it can be switched', async () => {
    const workspace = new Workspace();
    const scene = workspace.create(sceneWithOne());
    const component = componentResource(workspace);
    await workspace.open(component.id);

    assert.equal(workspace.activeId, component.id);
    assert.equal(workspace.resource.id, component.id);

    assert.equal(workspace.activate(scene.id), true);
    assert.equal(workspace.history, workspace.histories.get(scene.id));
    assert.equal(workspace.activate(scene.id), false, 'activating the active one changes nothing');
});

test('save writes the editor being worked in, not the tab that is showing', async () => {
    // THE WORKBENCH PUT TWO SURFACES ON SCREEN AT ONCE. The scene keeps the stage while a
    // `.px` is wired in the band below it, so "the active editor" and "what the creator is
    // editing" stopped being one fact. Undo has always followed the last authored intent
    // (ADR-0024); save follows it now too, or a creator moving objects would press Ctrl S
    // and write the graph.
    const workspace = new Workspace();
    const scene = sceneWithOne();
    const sceneResource = workspace.create(scene);
    const component = componentResource(workspace);
    const definition = await workspace.open(component.id);

    assert.equal(workspace.activeId, component.id, 'the graph is the active editor');

    scene.objects()[0].setProperty('name', 'Heroine');
    assert.equal(workspace.save(), true);
    assert.equal(workspace.project.read(sceneResource.id).objects[0].name, 'Heroine');
    assert.equal(workspace.project.read(component.id).properties.speed, undefined);

    // And the other way round: an edit in the graph hands the save back to the graph.
    definition.addProperty({ name: 'speed', type: 'number', default: 12 });
    workspace.save();
    assert.equal(workspace.project.read(component.id).properties.speed.default, 12);
});

test('save falls back to the active editor when the last intent was the manifest', async () => {
    // Selecting a resource in the Project panel makes the manifest the context, and the
    // manifest has no model to write. A save then still has to mean something.
    const workspace = new Workspace();
    const component = componentResource(workspace);
    const definition = await workspace.open(component.id);

    definition.addProperty({ name: 'speed', type: 'number', default: 3 });
    workspace.select(component.id);
    assert.equal(workspace.context, 'project');

    assert.equal(workspace.save(), true);
    assert.equal(workspace.project.read(component.id).properties.speed.default, 3);
});

test('unsaved work is answered per editor, not only for the active one', async () => {
    // The workbench shows every open `.px` at once, so each tab asks about ITSELF. Asking
    // about the active editor made a graph with unsaved work go unmarked the moment the
    // creator touched the scene.
    const workspace = new Workspace();
    const scene = sceneWithOne();
    workspace.create(scene);
    const component = componentResource(workspace);
    const definition = await workspace.open(component.id);

    definition.addProperty({ name: 'speed', type: 'number', default: 1 });
    assert.equal(workspace.dirtyOf(component.id), true);

    workspace.activate(workspace.project.resources()
        .find(resource => resource.kind === ResourceKind.SCENE).id);
    assert.equal(workspace.dirty, false, 'the scene has nothing to save');
    assert.equal(workspace.dirtyOf(component.id), true, 'the graph still does');

    assert.equal(workspace.dirtyOf('nothing'), false);
});

// WHOEVER ATTACHES FIRST MUST NOT DECIDE WHAT THE MODEL CAN RESOLVE. Selecting a `.px`
// attaches it (the Inspector edits its properties that way); opening it attaches it too.
// Only the second used to carry a registry, so a `Set Property On` in a `.px` that had been
// SELECTED before it was opened could never resolve a Component type — its value port stayed
// `any`, and no later open() repaired it, because the model already existed (ADR-0034 §3.3).
test('a `.px` resolves Component types however it was attached', async () => {
    const components = new ComponentRegistry();
    components.register(Transform);
    registerStandardNodes();

    const workspace = new Workspace({ components });
    const px = createResourceOfKind(workspace.project, ResourceKind.COMPONENT, { parent: null });

    // Attached the way a SELECTION does it: no registry in sight.
    const model = await workspace.attach(px.id);
    const node = model.graph.addNode({
        type: 'property.setOn',
        params: { component: 'Transform', property: 'x' }
    });

    const value = model.graph.portsOf(node).inputs.find(port => port.id === 'value');
    assert.equal(value.type, 'number', 'the port is typed from the Component the node names');
    assert.equal(value.label, 'x');
});

test('a workspace given no components still opens a `.px`', async () => {
    registerStandardNodes();
    const workspace = new Workspace();
    const px = createResourceOfKind(workspace.project, ResourceKind.COMPONENT, { parent: null });

    const model = await workspace.attach(px.id);
    const node = model.graph.addNode({ type: 'property.setOn', params: { component: 'Transform' } });

    // Nothing to resolve against, so the port says so rather than guessing (ADR-0034 §3.3).
    assert.equal(model.graph.portsOf(node).inputs.find(port => port.id === 'value').type, 'any');
});
