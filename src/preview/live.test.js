// The wire between an Editor and the Previews of one project (ADR-0044 §3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object as SceneObject, Scene, Transform, ComponentRegistry } from '../core/mod.js';
import { Workspace } from '../editor/project/workspace.js';
import { broadcastEdits } from '../editor/live.js';
import { LiveMessage, forwardOperations, openLiveChannel, sendDefinition } from './live.js';

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
            if (this.closed) throw new Error('closed');
            // Like the browser's: everyone on the name EXCEPT the sender.
            for (const peer of open.get(this.name) ?? []) {
                if (peer !== this && !peer.closed) peer.onmessage?.({ data: structuredClone(data) });
            }
        }

        close() { this.closed = true; }
    }

    return { Fake, on: name => open.get(name) ?? [] };
}

test('a channel is named after the project, so every window of it meets', () => {
    const { Fake, on } = channels();

    openLiveChannel('proj_a', { Channel: Fake });
    openLiveChannel('proj_a', { Channel: Fake });
    openLiveChannel('proj_b', { Channel: Fake });

    assert.equal(on('px.live.proj_a').length, 2, 'two windows of one project, one name');
    assert.equal(on('px.live.proj_b').length, 1);
});

test('no project and no BroadcastChannel are both answered with nothing to follow', () => {
    // A Preview that cannot follow the Editor is still a Preview. It must play, not fail.
    //
    // `null` RATHER THAN `undefined` FOR THE MISSING CONSTRUCTOR: a default parameter only
    // fills in for `undefined`, so passing that would reach for Node's own real
    // BroadcastChannel — which is a live handle, and holds the test process open for ever.
    assert.equal(openLiveChannel(null, { Channel: channels().Fake }), null);
    assert.equal(openLiveChannel('proj_a', { Channel: null }), null);
});

test('what a pipeline announces crosses, and what a follower applies does not come back', () => {
    // THE PROPERTY THE WHOLE DESIGN RESTS ON (ADR-0011). `submit()` announces, `apply()`
    // does not — so a follower cannot echo, and there is no loop to break.
    const { Fake } = channels();
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const editorScene = new Scene('Level', { registry });
    const hero = editorScene.add(new SceneObject('Hero'));
    hero.addComponent(new Transform());

    const previewScene = new Scene('Level', { registry });
    const twin = previewScene.add(new SceneObject('Hero', { id: hero.id }));
    twin.addComponent(new Transform());

    const editorChannel = openLiveChannel('proj_a', { Channel: Fake });
    const previewChannel = openLiveChannel('proj_a', { Channel: Fake });
    const seen = [];
    previewChannel.onmessage = event => {
        seen.push(event.data);
        previewScene.operations.apply(event.data.operation);
    };
    forwardOperations(editorChannel, 'scene_1', editorScene);

    hero.getComponent('Transform').setProperty('x', 42);

    assert.equal(seen.length, 1, 'one authored change, one message');
    assert.equal(seen[0].kind, LiveMessage.OPERATION);
    assert.equal(seen[0].resource, 'scene_1');
    assert.equal(twin.getComponent('Transform').x, 42, 'and the follower is in step');

    const before = seen.length;
    previewScene.operations.apply(seen[0].operation);
    assert.equal(seen.length, before, 'applying announces nothing, so nothing echoes');
});

test('a definition crosses whole, because a definition is read rather than lived in', () => {
    const { Fake } = channels();
    const editorChannel = openLiveChannel('proj_a', { Channel: Fake });
    const previewChannel = openLiveChannel('proj_a', { Channel: Fake });
    const seen = [];
    previewChannel.onmessage = event => seen.push(event.data);

    sendDefinition(editorChannel, 'res_px', { type: 'res_px', properties: {}, graph: { version: 1, nodes: [], connections: [] } });

    assert.equal(seen[0].kind, LiveMessage.DEFINITION);
    assert.equal(seen[0].resource, 'res_px');
    assert.ok(seen[0].payload.graph, 'the graph travelled, which is what rebinding needs');
});

test('a channel that has been closed does not make an edit throw', () => {
    // The window at the other end may go at any moment; a creator's edit must not care.
    const { Fake } = channels();
    const registry = new ComponentRegistry();
    registry.register(Transform);
    const scene = new Scene('Level', { registry });
    const hero = scene.add(new SceneObject('Hero'));
    hero.addComponent(new Transform());

    const channel = openLiveChannel('proj_a', { Channel: Fake });
    forwardOperations(channel, 'scene_1', scene);
    channel.close();

    assert.doesNotThrow(() => hero.getComponent('Transform').setProperty('x', 1));
    assert.equal(hero.getComponent('Transform').x, 1, 'and the edit still happened');
});

test('the Editor follows the scene it already has, not only the models that arrive later', async () => {
    // The scene exists before anything subscribes — it is what the Editor is built around.
    const { Fake } = channels();
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const workspace = new Workspace({ components: registry });
    const scene = new Scene('Level', { registry });
    workspace.create(scene);
    const hero = scene.add(new SceneObject('Hero'));
    hero.addComponent(new Transform());

    const listener = openLiveChannel(workspace.project.id, { Channel: Fake });
    const seen = [];
    listener.onmessage = event => seen.push(event.data);

    const live = broadcastEdits(workspace, { Channel: Fake });
    hero.getComponent('Transform').setProperty('y', 7);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].operation.prop, 'y');

    live.close();
    hero.getComponent('Transform').setProperty('y', 9);
    assert.equal(seen.length, 1, 'and closing really stops it');
});

test('a project with no id publishes nothing rather than opening a nameless channel', () => {
    const { Fake } = channels();
    assert.doesNotThrow(() => broadcastEdits(null, { Channel: Fake }).close());
    assert.doesNotThrow(() => broadcastEdits({ project: {} }, { Channel: Fake }).close());
});
