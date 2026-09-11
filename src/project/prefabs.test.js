// A prefab as a Resource: declared, stored, renamed, filed, bundled and resolved.
//
// THE ONE THING THESE TESTS EXIST TO PROVE is the boundary ADR-0061 §4 draws: reading a
// prefab is asynchronous and happens BEFORE a game runs; what the game holds is a map that
// answers now. Everything else here is the generic Resource system doing what it already
// does, which is exactly the claim worth checking.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../core/mod.js';
import { Project } from './project.js';
import { MemoryResourceStore } from './store.js';
import { ResourceKind } from './resource.js';
import { baseNameOf, extensionOf, withExtension } from './naming.js';
import { childrenOf, descendantsOf } from './folders.js';
import { addPrefab, loadPrefab, loadPrefabs, prefabResources, savePrefab } from './prefabs.js';

function world() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    return new Scene('Level', { registry });
}

function bulletIn(scene, { name = 'Bullet' } = {}) {
    const object = scene.add(new SceneObject(name, { tag: 'bullet' }));
    object.addComponent(new Transform(5, 7));

    const trail = scene.add(new SceneObject('Trail'));
    trail.addComponent(new Transform(0, 4));
    object.addChild(trail);

    return object;
}

function project() {
    return new Project('Game', { store: new MemoryResourceStore() });
}

// --- the resource ------------------------------------------------------------------------

test('a prefab is an ordinary Resource, with the extension its kind decides', () => {
    const scene = world();
    const store = project();
    const { resource } = addPrefab(store, bulletIn(scene), {
        name: withExtension('Bullet', { kind: ResourceKind.PREFAB })
    });

    assert.equal(resource.kind, ResourceKind.PREFAB);
    assert.equal(resource.name, 'Bullet.prefab');
    assert.equal(extensionOf(resource), '.prefab');
    assert.equal(baseNameOf(resource), 'Bullet');
    assert.deepEqual(prefabResources(store).map(entry => entry.id), [resource.id]);
});

test('declaring one is an operation, so it undoes like every other manifest change', () => {
    const scene = world();
    const store = project();
    const announced = [];
    store.operations.on('operation', operation => announced.push(operation.type));

    addPrefab(store, bulletIn(scene));

    assert.deepEqual(announced, ['ADD_RESOURCE'], 'one intent, one operation (ADR-0019)');
});

test('the payload round-trips through the store unchanged', async () => {
    const scene = world();
    const store = project();
    const object = bulletIn(scene);
    const { resource } = addPrefab(store, object);

    const definition = await loadPrefab(store, resource.id);

    assert.equal(definition.objects.length, 2);
    assert.equal(definition.root, object.id);
    assert.equal(definition.objects[0].components[0].values.x, 5);
    assert.equal(await loadPrefab(store, null), null);
});

test('saving again bumps the revision, and does not rewrite the displayed name', () => {
    const scene = world();
    const store = project();
    const object = bulletIn(scene);
    const { resource } = addPrefab(store, object, { name: 'Bullet.prefab' });
    // The NUMBER, not the entry: a manifest entry is the live record, so holding it and
    // comparing later would be comparing a value with itself.
    const before = resource.revision;

    object.name = 'Something Else';
    object.getComponent('Transform').x = 99;
    savePrefab(store, resource.id, object);

    const entry = store.get(resource.id);
    assert.equal(entry.name, 'Bullet.prefab', 'a save is not a rename (ADR-0020)');
    assert.ok(entry.revision > before);
});

test('renaming, moving and deleting one need no code of their own', () => {
    const scene = world();
    const store = project();
    const folder = store.addFolder({ name: 'Prefabs' });
    const { resource } = addPrefab(store, bulletIn(scene), { name: 'Bullet.prefab' });

    store.move(resource.id, folder.id);
    assert.deepEqual(childrenOf(store, folder.id).map(entry => entry.id), [resource.id]);
    assert.deepEqual(descendantsOf(store, folder.id).map(entry => entry.id), [resource.id]);

    store.setProperty(resource.id, 'name', 'Rocket.prefab');
    assert.equal(store.get(resource.id).name, 'Rocket.prefab');
    assert.equal(store.get(resource.id).id, resource.id, 'the identity never moves');

    store.remove(resource.id);
    assert.equal(store.get(resource.id), null);
    assert.deepEqual(prefabResources(store), []);
});

test('what a prefab could not take with it is reported at the moment it is made', () => {
    const scene = world();
    const store = project();
    const object = bulletIn(scene);
    // A `Transform` declares no reference, so this needs a type that does — the same shape a
    // creator's `.px` has. Written straight into the record the store keeps.
    const other = scene.add(new SceneObject('Player'));
    scene.registry.register(class Chaser {
        static type = 'Chaser';
        static schema = { target: { type: 'objectref', default: null } };
        constructor(target = null) { this.target = target; }
    });
    object.addComponent(new (scene.registry.get('Chaser'))(other.id));

    const { cleared } = addPrefab(store, object, { registry: scene.registry });

    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].component, 'Chaser');
});

// --- resolving before a game runs -----------------------------------------------------------

test('every prefab is resolved into a registry that answers synchronously', async () => {
    const scene = world();
    const store = project();
    const bullet = addPrefab(store, bulletIn(scene), { name: 'Bullet.prefab' }).resource;
    const enemy = addPrefab(store, bulletIn(scene, { name: 'Enemy' }), { name: 'Enemy.prefab' }).resource;
    store.add({ kind: ResourceKind.SCENE, name: 'Level.scene' }, { version: 2 });

    const prefabs = await loadPrefabs(store);

    assert.equal(prefabs.size, 2, 'only prefabs, and every one of them');
    assert.deepEqual(prefabs.ids().sort(), [bullet.id, enemy.id].sort());
    // THE POINT: no promise, no await, no storage — this is what a `Runtime.step()` gets.
    assert.equal(prefabs.get(bullet.id).version, 1);
    assert.equal(prefabs.get('res_nothing'), null);
});

test('a prefab with no payload yet is simply absent, not a broken entry', async () => {
    const store = project();
    store.add({ kind: ResourceKind.PREFAB, name: 'Empty.prefab' }, null);

    const prefabs = await loadPrefabs(store);
    assert.equal(prefabs.size, 0);
});

test('one unreadable payload does not stop a project from opening', async () => {
    const scene = world();
    const store = project();
    const good = addPrefab(store, bulletIn(scene)).resource;
    const bad = store.add({ kind: ResourceKind.PREFAB, name: 'Broken.prefab' }, { version: 1 });

    // A store that throws for exactly one identifier.
    const failing = {
        resources: kind => store.resources(kind),
        read: id => (id === bad.id ? globalThis.Promise.reject(new Error('unreadable')) : store.read(id))
    };

    const reported = [];
    const prefabs = await loadPrefabs(failing, { onError: entry => reported.push(entry.resource.id) });

    assert.equal(prefabs.has(good.id), true);
    assert.deepEqual(reported, [bad.id]);
});

test('an existing registry can be filled again, which is what a refresh is', async () => {
    const scene = world();
    const store = project();
    addPrefab(store, bulletIn(scene));

    const first = await loadPrefabs(store);
    const second = await loadPrefabs(store, { prefabs: first });

    assert.equal(second, first);
    assert.equal(second.size, 1);
});
