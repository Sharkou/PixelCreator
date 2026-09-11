// What a running session is handed, and when (ADR-0060 §5, ADR-0061 §4).
//
// THE ONE PROPERTY WORTH ASSERTING is the boundary: reading the project is asynchronous and
// happens when Play is pressed; what the Runtime then holds answers without waiting. The
// rest is bookkeeping — a payload read once per revision, and a deleted resource forgotten.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind, addPrefab } from '../../project/mod.js';
import { createSession } from './session.js';

function world() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    return new Scene('Level', { registry });
}

function modelIn(scene, name = 'Bullet') {
    const object = scene.add(new SceneObject(name));
    object.addComponent(new Transform(3, 4));
    return object;
}

function project() {
    return new Project('Game', { store: new MemoryResourceStore() });
}

test('a session resolves prefabs and sounds, and nothing else', async () => {
    const scene = world();
    const store = project();
    const prefab = addPrefab(store, modelIn(scene), { name: 'Bullet.prefab' }).resource;
    const sound = store.add({ kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav' }, 'data:audio/wav;base64,AA');
    const image = store.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' }, 'data:image/png;base64,AA');
    store.add({ kind: ResourceKind.SCENE, name: 'Level.scene' }, { version: 2 });

    const session = createSession({ project: store });
    const counts = await session.refresh();

    assert.deepEqual(counts, { prefabs: 1, sounds: 1 });
    assert.equal(session.prefabs.has(prefab.id), true);
    assert.equal(session.sounds.get(sound.id), 'data:audio/wav;base64,AA');
    assert.equal(session.sounds.has(image.id), false, 'a picture is not a sound');
});

test('the audio output resolves a clip from what the session read, and refuses a picture', async () => {
    const store = project();
    const sound = store.add({ kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav' }, 'data:audio/wav;base64,AA');

    const sources = [];
    const session = createSession({
        project: store,
        createAudioElement: source => {
            sources.push(source);
            return { volume: 1, loop: false, playbackRate: 1, play: () => globalThis.Promise.resolve(), pause: () => {} };
        }
    });
    await session.refresh();

    // The output was built with a resolver over `sounds`; nothing else can answer it.
    assert.ok(session.audio.play(sound.id, { volume: 1 }));
    assert.deepEqual(sources, ['data:audio/wav;base64,AA']);
    assert.equal(session.audio.play('res_unknown'), null, 'a clip nobody resolved plays nothing');
});

test('a payload is read once per revision, and again when it changes', async () => {
    const scene = world();
    const store = project();
    const object = modelIn(scene);
    const prefab = addPrefab(store, object, { name: 'Bullet.prefab' }).resource;

    const reads = [];
    const spy = {
        resources: kind => store.resources(kind),
        read: id => {
            reads.push(id);
            return store.read(id);
        }
    };

    const session = createSession({ project: spy });
    await session.refresh();
    await session.refresh();
    assert.deepEqual(reads, [prefab.id], 'nothing changed, so nothing was read again');

    object.getComponent('Transform').x = 99;
    store.save(prefab.id, { version: 1, root: object.id, objects: [] });
    await session.refresh();
    assert.equal(reads.length, 2, 'the revision moved, so the payload was read again');
});

test('a deleted resource is forgotten, or a game would spawn what the panel no longer shows', async () => {
    const scene = world();
    const store = project();
    const prefab = addPrefab(store, modelIn(scene), { name: 'Bullet.prefab' }).resource;

    const session = createSession({ project: store });
    await session.refresh();
    assert.equal(session.prefabs.has(prefab.id), true);

    store.remove(prefab.id);
    await session.refresh();

    assert.equal(session.prefabs.has(prefab.id), false);
    assert.equal(session.prefabs.size, 0);
});

test('one unreadable payload is reported and skipped', async () => {
    const scene = world();
    const store = project();
    const good = addPrefab(store, modelIn(scene)).resource;
    const bad = store.add({ kind: ResourceKind.PREFAB, name: 'Broken.prefab' }, { version: 1 });

    const failing = {
        resources: kind => store.resources(kind),
        read: id => (id === bad.id ? globalThis.Promise.reject(new Error('unreadable')) : store.read(id))
    };

    const reported = [];
    const session = createSession({ project: failing, onError: entry => reported.push(entry.resource.id) });
    await session.refresh();

    assert.equal(session.prefabs.has(good.id), true);
    assert.deepEqual(reported, [bad.id]);
});

test('a session with no project answers honestly rather than throwing', async () => {
    const session = createSession({});
    assert.deepEqual(await session.refresh(), { prefabs: 0, sounds: 0 });
});
