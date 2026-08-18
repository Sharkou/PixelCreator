// Scenes as Resources: declaring, saving, loading (ADR-0020).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    FORMAT_VERSION,
    Object,
    Scene,
    Transform,
    invert
} from '../core/mod.js';
import {
    MemoryResourceStore,
    Project,
    ResourceKind,
    addScene,
    loadScene,
    saveScene,
    sceneResources
} from './mod.js';

/** A registry holding only what these scenes use, so nothing global is relied on. */
function registry() {
    const types = new ComponentRegistry();
    types.register(Transform);
    return types;
}

function sampleScene() {
    const scene = new Scene('Level 1', { registry: registry() });
    const parent = scene.add(new Object('Parent'));
    parent.addComponent(new Transform(10, 20));

    const child = scene.add(new Object('Child'));
    parent.addChild(child);
    child.addComponent(new Transform(5, 0));

    scene.add(new Object('Second root'));
    return scene;
}

// --- declaring ------------------------------------------------------------------------

test('a scene is declared as a resource, and its payload is stored beside the manifest', () => {
    const project = new Project('My game');
    const scene = sampleScene();

    const folder = project.addFolder({ name: 'Scenes' });
    const entry = addScene(project, scene, { parent: folder.id });

    assert.equal(entry.kind, ResourceKind.SCENE);
    assert.equal(entry.name, 'Level 1', 'the scene\'s own name is the displayed one');
    assert.equal(entry.parent, folder.id);
    assert.notEqual(entry.id, scene.id, 'a ResourceId is not the model id it points at');
    assert.equal(project.read(entry.id).version, FORMAT_VERSION);
});

test('declaring a scene is one ADD_RESOURCE, so it is undoable like anything else', () => {
    const project = new Project('My game');
    const emitted = [];
    project.operations.on('operation', operation => emitted.push(operation));

    const entry = addScene(project, sampleScene());

    assert.equal(emitted.length, 1);
    project.operations.submit(invert(emitted[0]));

    assert.equal(project.has(entry.id), false);
    assert.equal(project.read(entry.id), null);
});

test('sceneResources lists only the scenes', () => {
    const project = new Project('My game');
    project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' }, null);
    const first = addScene(project, new Scene('A'));
    const second = addScene(project, new Scene('B'));

    assert.deepEqual(sceneResources(project).map(resource => resource.id), [first.id, second.id]);
});

// --- round trip -----------------------------------------------------------------------

test('a scene saved and loaded back is the same model, order included', async () => {
    const types = registry();
    const project = new Project('My game');
    const scene = sampleScene();
    const entry = addScene(project, scene);

    const loaded = await loadScene(project, entry.id, { registry: types });

    assert.equal(loaded.id, scene.id, 'the model keeps its own identity across storage');
    assert.equal(loaded.name, 'Level 1');
    assert.deepEqual(
        loaded.roots().map(object => object.name),
        scene.roots().map(object => object.name)
    );
    assert.deepEqual(
        loaded.roots()[0].children.map(child => child.name),
        ['Child']
    );
    assert.equal(loaded.get(scene.roots()[0].id).getComponent('Transform').x, 10);
});

test('saving again moves the revision and rewrites the payload', () => {
    const project = new Project('My game');
    const scene = sampleScene();
    const entry = addScene(project, scene);
    assert.equal(entry.revision, 1);

    scene.roots()[0].setProperty('name', 'Renamed');
    saveScene(project, entry.id, scene);

    assert.equal(project.get(entry.id).revision, 2);
    assert.equal(project.read(entry.id).objects[0].name, 'Renamed');
});

test('saving a scene does not rename its resource', () => {
    const project = new Project('My game');
    const scene = new Scene('Level 1');
    const entry = addScene(project, scene, { name: 'Opening level' });

    scene.name = 'Level 1 (draft)';
    saveScene(project, entry.id, scene);

    assert.equal(project.get(entry.id).name, 'Opening level');
});

test('loading a scene that has no payload answers null rather than throwing', async () => {
    const project = new Project('My game');
    const entry = project.add({ kind: ResourceKind.SCENE, name: 'Empty' }, null);

    assert.equal(await loadScene(project, entry.id), null);
});

test('a scene resource survives a manifest round trip, payload included', async () => {
    const store = new MemoryResourceStore();
    const project = new Project('My game', { store });
    const folder = project.addFolder({ name: 'Scenes' });
    const entry = addScene(project, sampleScene(), { parent: folder.id });

    const reopened = Project.deserialize(project.serialize(), { store });
    const loaded = await loadScene(reopened, entry.id, { registry: registry() });

    assert.equal(reopened.get(entry.id).parent, folder.id);
    assert.equal(loaded.roots().length, 2);
});

test('reading a scene is lazy: opening a project touches no payload', () => {
    const reads = [];
    const store = new MemoryResourceStore();
    const watched = {
        list: () => store.list(),
        read: id => {
            reads.push(id);
            return store.read(id);
        },
        write: (resource, payload) => store.write(resource, payload),
        delete: id => store.delete(id)
    };

    const project = new Project('My game', { store: watched });
    const entry = addScene(project, sampleScene());

    Project.deserialize(project.serialize(), { store: watched });

    assert.equal(reads.length, 0, 'nothing read a payload');
    assert.equal(project.read(entry.id).version, FORMAT_VERSION);
    assert.deepEqual(reads, [entry.id]);
});
