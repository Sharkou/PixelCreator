// A project that survives the tab (ADR-0065).
//
// EVERY BEHAVIOUR HERE IS VERIFIED WITHOUT A BROWSER, and that is the reason the store is
// split in two. `PersistentResourceStore` holds all the reasoning — what a key is, how order
// survives, what a delete removes — and reaches a key-value area for four operations;
// `MemoryArea` is that area under Node and `IndexedDbArea` is that area in a browser. So what
// is tested is what can be wrong, and what is verified in the browser is forty lines of
// database plumbing.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../core/mod.js';
import { Project, MANIFEST_VERSION } from './project.js';
import { ResourceKind } from './resource.js';
import { MemoryArea, PersistentResourceStore, listProjects } from './persistence.js';
import { addScene, loadScene } from './scenes.js';
import { addPrefab } from './prefabs.js';
import { childrenOf } from './folders.js';
import { available } from './indexeddb.js';

const PNG = 'data:image/png;base64,iVBORw0KGgo=';

function registry() {
    const types = new ComponentRegistry();
    types.register(Transform);
    return types;
}

/** A project with one of everything, built the way the Editor builds one. */
function furnish(project) {
    const types = registry();
    const folder = project.addFolder({ name: 'Assets' });

    const scene = new Scene('Level', { registry: types });
    const player = scene.add(new SceneObject('Player'));
    player.addComponent(new Transform(12, 34));
    const sceneResource = addScene(project, scene, { name: 'Level.scene' });

    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png', parent: folder.id }, PNG);
    const sound = project.add({ kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav' }, 'data:audio/wav;base64,AA');
    const px = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller.px' },
        { type: 'res_ctl', properties: {}, graph: { version: 1, nodes: [], connections: [] } });

    const model = new Scene('Authoring', { registry: types });
    const bullet = model.add(new SceneObject('Bullet'));
    bullet.addComponent(new Transform());
    const prefab = addPrefab(project, bullet, { name: 'Bullet.prefab' }).resource;

    return { folder, scene, sceneResource, image, sound, px, prefab, types };
}

// --- the store ------------------------------------------------------------------------------

test('a project written to an area comes back with everything in it', async () => {
    const area = new MemoryArea();
    const project = new Project('My Game', { store: new PersistentResourceStore(area, 'proj_1') });
    const made = furnish(project);
    await project.store.saveManifest(project.serialize());

    // A SECOND SESSION: nothing of the first is in memory any more.
    const reopened = Project.deserialize(
        await new PersistentResourceStore(area, 'proj_1').manifest(),
        { store: new PersistentResourceStore(area, 'proj_1') }
    );

    assert.equal(reopened.name, 'My Game');
    assert.equal(reopened.id, project.id);
    assert.deepEqual(
        reopened.resources().map(entry => entry.name),
        project.resources().map(entry => entry.name),
        'every resource, in the order the manifest had them'
    );

    assert.equal(await reopened.read(made.image.id), PNG, 'a picture comes back byte for byte');
    assert.equal((await reopened.read(made.px.id)).type, 'res_ctl');
    assert.equal((await reopened.read(made.prefab.id)).version, 1);

    const scene = await loadScene(reopened, made.sceneResource.id, { registry: made.types });
    assert.equal(scene.objects()[0].getComponent('Transform').x, 12);
});

test('folders come back as folders, with what was in them', async () => {
    const area = new MemoryArea();
    const project = new Project('My Game', { store: new PersistentResourceStore(area, 'proj_2') });
    const made = furnish(project);
    await project.store.saveManifest(project.serialize());

    const reopened = Project.deserialize(await new PersistentResourceStore(area, 'proj_2').manifest(), {
        store: new PersistentResourceStore(area, 'proj_2')
    });

    assert.deepEqual(childrenOf(reopened, made.folder.id).map(entry => entry.name), ['hero.png']);
});

test('renaming and moving reach the store through the manifest, not through a payload', async () => {
    const area = new MemoryArea();
    const store = new PersistentResourceStore(area, 'proj_3');
    const project = new Project('My Game', { store });
    const made = furnish(project);

    project.setProperty(made.image.id, 'name', 'villain.png');
    project.move(made.sound.id, made.folder.id);
    await store.saveManifest(project.serialize());

    const entries = await store.list();
    assert.equal(entries.find(entry => entry.id === made.image.id).name, 'villain.png');
    assert.equal(entries.find(entry => entry.id === made.sound.id).parent, made.folder.id);
});

test('deleting removes the entry and the payload together', async () => {
    const area = new MemoryArea();
    const store = new PersistentResourceStore(area, 'proj_4');
    const project = new Project('My Game', { store });
    const made = furnish(project);
    await store.saveManifest(project.serialize());

    assert.equal(await store.delete(made.image.id), true);
    assert.equal(await store.read(made.image.id), null);
    assert.equal((await store.list()).some(entry => entry.id === made.image.id), false);
});

test('a resource written is in the manifest at once, without waiting for an autosave', async () => {
    // A STORE WHOSE MANIFEST ONLY CAUGHT UP LATER WOULD LOSE THE LAST SECOND before a tab
    // closed, and "mostly saved" is the one thing a save must never be.
    const area = new MemoryArea();
    const store = new PersistentResourceStore(area, 'proj_5');

    await store.write({ id: 'res_a', kind: ResourceKind.SCENE, name: 'A.scene' }, { version: 2 });
    assert.deepEqual((await store.list()).map(entry => entry.id), ['res_a']);

    // Rewriting one keeps its rank rather than moving it to the end.
    await store.write({ id: 'res_b', kind: ResourceKind.SCENE, name: 'B.scene' }, { version: 2 });
    await store.write({ id: 'res_a', kind: ResourceKind.SCENE, name: 'A2.scene' }, { version: 2 });
    assert.deepEqual((await store.list()).map(entry => entry.name), ['A2.scene', 'B.scene']);
});

test('a store measures what it holds, and answers nothing for what it does not', async () => {
    const store = new PersistentResourceStore(new MemoryArea(), 'proj_6');
    await store.write({ id: 'res_a', kind: ResourceKind.ASSET, name: 'a.png' }, PNG);

    assert.equal(await store.size('res_a'), PNG.length);
    assert.equal(await store.size('res_missing'), null);
});

test('a store is a view of one project, and cannot see another', async () => {
    const area = new MemoryArea();
    const first = new PersistentResourceStore(area, 'proj_a');
    const second = new PersistentResourceStore(area, 'proj_b');

    await first.write({ id: 'res_x', kind: ResourceKind.SCENE, name: 'Shared id' }, { version: 2 });

    assert.equal(await second.read('res_x'), null, 'one identity per project, never a shared key');
    assert.deepEqual(await second.list(), []);
});

test('destroying a project leaves the others alone', async () => {
    const area = new MemoryArea();
    const first = new PersistentResourceStore(area, 'proj_a');
    const second = new PersistentResourceStore(area, 'proj_b');

    await first.saveManifest({ format: MANIFEST_VERSION, id: 'proj_a', name: 'A', resources: [] });
    await first.write({ id: 'res_x', kind: ResourceKind.SCENE, name: 'x' }, { version: 2 });
    await second.saveManifest({ format: MANIFEST_VERSION, id: 'proj_b', name: 'B', resources: [] });

    await first.destroy();

    assert.deepEqual(await first.list(), []);
    assert.equal(await first.read('res_x'), null);
    assert.equal((await second.manifest()).name, 'B');
});

test('a store needs an area and an identity', () => {
    assert.throws(() => new PersistentResourceStore(null, 'proj'), /area/);
    assert.throws(() => new PersistentResourceStore(new MemoryArea(), ''), /project/);
});

// --- the library ------------------------------------------------------------------------------

test('every project in an area is listed, newest first, without reading a payload', async () => {
    const area = new MemoryArea();

    for (const [id, name, modified] of [['p1', 'Older', 100], ['p2', 'Newer', 900], ['p3', 'Middle', 500]]) {
        const store = new PersistentResourceStore(area, id);
        await store.write({ id: `${id}_scene`, kind: ResourceKind.SCENE, name: 'Level.scene' }, { version: 2 });
        await area.put(`${id} manifest`, {
            format: MANIFEST_VERSION,
            id,
            name,
            modified,
            resources: [{ id: `${id}_scene`, kind: ResourceKind.SCENE, name: 'Level.scene' }]
        });
    }

    const projects = await listProjects(area);

    assert.deepEqual(projects.map(entry => entry.name), ['Newer', 'Middle', 'Older']);
    assert.equal(projects[0].resources, 1);
});

test('an empty area holds no projects, and says so rather than failing', async () => {
    assert.deepEqual(await listProjects(new MemoryArea()), []);
});

// --- the browser half --------------------------------------------------------------------------

test('this host says honestly whether it has IndexedDB', () => {
    // Under Node it does not, which is exactly why the library falls back to memory rather
    // than refusing to start (ADR-0065 §4). In a browser this is the other branch.
    assert.equal(typeof available(), 'boolean');
    assert.equal(available(), typeof globalThis.indexedDB?.open === 'function');
});
