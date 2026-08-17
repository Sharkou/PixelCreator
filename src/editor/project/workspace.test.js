// What the Editor has open, and where it saves it (ADR-0020, ADR-0024).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object, Scene, Transform } from '../../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind } from '../../project/mod.js';
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

    const resource = workspace.create(scene, { path: 'scenes/' });

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
