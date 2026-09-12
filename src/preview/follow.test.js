// A Preview following the Editor of the same project (ADR-0044 §3).
//
// THREE MODELS, ONE CHANNEL. A scene arrives as the operations that changed it, a `.px`
// arrives whole, and the manifest arrives as operations under the project's own name. What
// is asserted here is the third: a picture imported, a tileset recut or a prefab replaced
// reaches a window that is already open, and what the window had RESOLVED from the old
// payload is dropped.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, ResourceRegistry, Scene, Transform } from '../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind } from '../project/mod.js';
import { forwardOperations, openLiveChannel } from './live.js';
import { followEdits } from './client.js';

/** Every channel of one name, so two "pages" can meet the way BroadcastChannel lets them. */
function channels() {
    const open = new Map();

    class Fake {
        constructor(name) {
            this.name = name;
            this.onmessage = null;
            this.closed = false;
            (open.get(name) ?? open.set(name, []).get(name)).push(this);
        }

        postMessage(data) {
            for (const peer of open.get(this.name) ?? []) {
                if (peer !== this && !peer.closed) peer.onmessage?.({ data: structuredClone(data) });
            }
        }

        close() { this.closed = true; }
    }

    return { Fake };
}

/** A window already playing a project, and the Editor that is about to change it. */
function staged() {
    const { Fake } = channels();

    const authoring = new Project('Game', { store: new MemoryResourceStore() });
    const tileset = authoring.add(
        { kind: ResourceKind.TILESET, name: 'World.tileset' },
        { version: 1, source: 'img', tileWidth: 16, tileHeight: 16, columns: 4, count: 16 }
    );
    const image = authoring.add(
        { kind: ResourceKind.ASSET, name: 'sheet.png', mime: 'image/png' },
        'data:image/png;base64,AA'
    );

    // What the window was opened with: its own Project over its own store, as `openBundle()`
    // builds one.
    const store = new MemoryResourceStore();
    const playing = Project.deserialize(authoring.serialize(), { store });
    for (const entry of authoring.resources()) store.write(entry, authoring.read(entry.id));

    const resources = new ResourceRegistry();
    resources.set(tileset.id, store.read(tileset.id));

    const invalidated = [];
    const images = { invalidate: id => invalidated.push(id) };

    const registry = new ComponentRegistry();
    registry.register(Transform);

    const live = followEdits(
        { project: playing, store, scene: null, name: 'Game' },
        {
            scene: new Scene('Level', { registry }),
            behaviors: { bind: () => {} },
            registry,
            resources,
            images,
            Channel: Fake
        }
    );

    const editor = forwardOperations(
        openLiveChannel(authoring.id, { Channel: Fake }),
        authoring.id,
        authoring
    );

    return { authoring, playing, store, resources, images, invalidated, tileset, image, live, editor };
}

test('a tileset recut in the Editor reaches a window that is already playing', async () => {
    const it = staged();

    await it.authoring.setPayload(it.tileset.id, {
        version: 1, source: 'img', tileWidth: 32, tileHeight: 32, columns: 2, count: 4
    });

    assert.equal(it.playing.get(it.tileset.id).revision, 2, 'the manifest followed');
    assert.equal(it.store.read(it.tileset.id).tileWidth, 32, 'and so did the payload');
    assert.equal(it.resources.get(it.tileset.id).tileWidth, 32,
        'and the table a step reads was re-resolved, not left holding the old cutting');

    it.live.close();
});

test('a picture replaced is forgotten by the cache, so the next frame decodes the new one', async () => {
    const it = staged();

    await it.authoring.setPayload(it.image.id, 'data:image/png;base64,BB');

    assert.equal(it.store.read(it.image.id), 'data:image/png;base64,BB');
    assert.deepEqual(it.invalidated, [it.image.id]);

    it.live.close();
});

test('a resource deleted stops being spawnable in a window that is already playing', async () => {
    const it = staged();

    await it.authoring.remove(it.tileset.id);

    assert.equal(it.playing.has(it.tileset.id), false);
    assert.equal(it.resources.has(it.tileset.id), false, 'a game must not spawn what the project no longer holds');

    it.live.close();
});

test('a picture imported after the window opened is readable in it', async () => {
    const it = staged();

    const added = it.authoring.add(
        { kind: ResourceKind.ASSET, name: 'late.png', mime: 'image/png' },
        'data:image/png;base64,CC'
    );

    assert.equal(it.playing.has(added.id), true);
    assert.equal(it.store.read(added.id), 'data:image/png;base64,CC',
        'the store the window resolves from is the one the operation wrote into');

    it.live.close();
});

test('closing the window stops it following', async () => {
    const it = staged();
    it.live.close();

    await it.authoring.setPayload(it.image.id, 'data:image/png;base64,ZZ');

    assert.equal(it.store.read(it.image.id), 'data:image/png;base64,AA', 'nothing arrived');
});
