// Reading a payload into a view that cannot wait (ADR-0020 §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { MemoryArea, MemoryResourceStore, PersistentResourceStore, Project, ResourceKind } from '../../project/mod.js';
import { PayloadCache } from './payloads.js';

/** A project whose store answers later, which is the one a browser actually keeps. */
function slow() {
    const area = new MemoryArea();
    const declared = new Project('Game');
    const store = new PersistentResourceStore(area, declared.id);
    return Project.deserialize(declared.serialize(), { store });
}

/**
 * Everything a fixture proxy does not intercept, answered by the real project.
 *
 * BOUND, because a method reached through a Proxy runs with the proxy as `this`, and a class
 * method reading a private field refuses that. The cache asks `has()` as well as `read()`.
 */
const through = (target, prop) => (typeof target[prop] === 'function' ? target[prop].bind(target) : target[prop]);

/** Let every queued read and write land. */
const settle = () => new globalThis.Promise(resolve => globalThis.setTimeout(resolve, 0));

test('a payload the project no longer declares is dropped once the redraw is over', async () => {
    // A DELETED PICTURE MUST NOT BE HELD FOR THE LIFE OF THE PANEL. Nothing removed an entry
    // but `clear()`, so forty pictures thrown away were forty data URLs kept in memory.
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    const cache = new PayloadCache();
    const gone = project.add({ kind: ResourceKind.ASSET, name: 'gone.png', mime: 'image/png' }, 'data:image/png;base64,AA');
    const kept = project.add({ kind: ResourceKind.ASSET, name: 'kept.png', mime: 'image/png' }, 'data:image/png;base64,BB');
    const record = { ...gone };

    assert.equal(cache.payload(project, gone), 'data:image/png;base64,AA');
    await project.remove(gone.id);

    // The panel redraws what is left, and the sweep rides on that redraw.
    assert.equal(cache.payload(project, kept), 'data:image/png;base64,BB');
    await new Promise(resolve => globalThis.queueMicrotask(resolve));

    assert.equal(cache.payload(project, record), null, 'asked again, and the store has nothing');
    assert.equal(cache.payload(project, kept), 'data:image/png;base64,BB', 'what is still declared is still held');
});

test('a payload that is not here yet reads as nothing, and arrives', async () => {
    const project = slow();
    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png' }, 'data:image/png;base64,AA');

    const cache = new PayloadCache();
    let arrivals = 0;

    assert.equal(cache.payload(project, image, () => arrivals++), null, 'nothing to draw yet');
    await settle();

    assert.equal(arrivals, 1, 'and the view is told when there is');
    assert.equal(cache.payload(project, image), 'data:image/png;base64,AA');
});

test('one revision is asked for once, however many times it is drawn', async () => {
    const project = slow();
    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png' }, 'AA');

    let reads = 0;
    const counting = new globalThis.Proxy(project, {
        get: (target, prop) => (prop === 'read' ? id => (reads++, target.read(id)) : through(target, prop))
    });

    const cache = new PayloadCache();
    for (let i = 0; i < 5; i++) cache.payload(counting, image, () => {});
    await settle();
    for (let i = 0; i < 5; i++) cache.payload(counting, image, () => {});

    assert.equal(reads, 1, 'a redraw while one is in flight must not ask again');
});

test('a payload written again is read again, because the revision moved', async () => {
    const project = slow();
    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png' }, 'first');

    const cache = new PayloadCache();
    cache.payload(project, image, () => {});
    await settle();
    assert.equal(cache.payload(project, image), 'first');

    project.save(image.id, 'second');
    assert.equal(cache.payload(project, image, () => {}), null, 'the key moved with the revision');
    await settle();
    assert.equal(cache.payload(project, image), 'second');
});

test('a folder has no payload and no size, so neither is ever asked for', async () => {
    const project = slow();
    const folder = project.addFolder({ name: 'Assets' });

    let reads = 0;
    const counting = new globalThis.Proxy(project, {
        get: (target, prop) => (prop === 'read' ? id => (reads++, target.read(id)) : through(target, prop))
    });

    const cache = new PayloadCache();
    assert.equal(cache.payload(counting, folder, () => {}), null);
    assert.equal(cache.size(counting, folder, () => {}), null);
    await settle();

    assert.equal(reads, 0, 'reading a folder is meaningless rather than merely empty');
});

test('a size the store answers later still reaches the panel', async () => {
    const project = slow();
    const graph = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: ['a'] });

    const cache = new PayloadCache();
    let arrivals = 0;

    assert.equal(cache.size(project, graph, () => arrivals++), null);
    await settle();

    assert.equal(arrivals, 1);
    assert.equal(cache.size(project, graph), globalThis.JSON.stringify({ nodes: ['a'] }).length);
});

test('a payload that cannot be read leaves the view drawing what it has', async () => {
    const project = slow();
    const resource = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: [] });

    const failing = new globalThis.Proxy(project, {
        get: (target, prop) => (prop === 'read'
            ? () => globalThis.Promise.reject(new Error('unreadable'))
            : through(target, prop))
    });

    const cache = new PayloadCache();
    let arrivals = 0;
    assert.equal(cache.payload(failing, resource, () => arrivals++), null);
    await settle();

    assert.equal(arrivals, 0, 'nothing arrived, so nothing is redrawn');
    assert.equal(cache.payload(failing, resource), null);
});

test('one entry per resource, not one per revision, so a panel holds no history', async () => {
    // A PAYLOAD IS A DATA URL. Keyed on the revision as well, ten edits of one sprite sheet
    // would be ten copies of it held for the life of the panel.
    const project = slow();
    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png' }, 'v1');

    const cache = new PayloadCache();
    for (let at = 2; at <= 6; at++) {
        cache.payload(project, image, () => {});
        await settle();
        project.save(image.id, `v${at}`);
    }
    cache.payload(project, image, () => {});
    await settle();

    assert.equal(cache.payload(project, image), 'v6', 'the current one');
    assert.equal(cache.size(project, image, () => {}) === null, true, 'and a size not asked for yet');
});
