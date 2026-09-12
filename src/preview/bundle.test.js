// A whole project, across a frontier that is a format rather than an object (ADR-0042 §2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryArea, MemoryResourceStore, PersistentResourceStore, Project, ResourceKind } from '../project/mod.js';
import { BUNDLE_FORMAT, bundleProject, openBundle } from './bundle.js';

/** A project with a scene, a `.px` and an image — the three things a game is made of. */
function made() {
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });

    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level.scene' });
    project.save(scene.id, { name: 'Level', objects: [{ id: 'o1', name: 'Hero' }] });

    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Mover.px' });
    project.save(component.id, { type: component.id, properties: {}, graph: { nodes: [], connections: [] } });

    const image = project.add({ kind: ResourceKind.ASSET, name: 'hero.png' });
    project.save(image.id, { mime: 'image/png', data: 'data:image/png;base64,AA' });

    return { project, store, scene, component, image };
}

test('a bundle carries the manifest, every payload it names, and which scene to open', async () => {
    const it = made();

    const bundle = await bundleProject(it.project, it.store);

    assert.equal(bundle.format, BUNDLE_FORMAT);
    assert.equal(bundle.name, 'Game');
    assert.equal(bundle.scene, it.scene.id, 'the first scene, when nothing says otherwise');
    assert.deepEqual(
        globalThis.Object.keys(bundle.payloads).sort(),
        [it.scene.id, it.component.id, it.image.id].sort(),
        'a game is a project: the scene, the behaviour AND the picture'
    );
});

test('a bundle is JSON, because that is what makes the frontier a frontier', async () => {
    const it = made();

    const bundle = await bundleProject(it.project, it.store);

    assert.doesNotThrow(() => JSON.parse(JSON.stringify(bundle)));
    assert.deepEqual(JSON.parse(JSON.stringify(bundle)), bundle, 'nothing that only lives in memory');
});

test('a bundle reopened is the project that was bundled', async () => {
    const it = made();

    const opened = openBundle(JSON.parse(JSON.stringify(await bundleProject(it.project, it.store))));

    assert.equal(opened.name, 'Game');
    assert.equal(opened.scene, it.scene.id);
    assert.deepEqual(
        opened.project.resources().map(entry => entry.name).sort(),
        it.project.resources().map(entry => entry.name).sort()
    );
    assert.deepEqual(opened.store.read(it.component.id), it.store.read(it.component.id),
        'the behaviour came across, not just its name');
    assert.deepEqual(opened.store.read(it.image.id), it.store.read(it.image.id));
});

test('a resource with no payload yet is left out rather than written as nothing', async () => {
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    project.add({ kind: ResourceKind.FOLDER, name: 'Art' });

    const bundle = await bundleProject(project, store);

    assert.deepEqual(bundle.payloads, {}, 'absent is not the same as empty');
    assert.equal(bundle.manifest.resources.length, 1, 'and the folder is still in the manifest');
});

test('the scene to open can be named, because a project may hold several', async () => {
    const it = made();
    const second = it.project.add({ kind: ResourceKind.SCENE, name: 'Boss.scene' });

    const bundle = await bundleProject(it.project, it.store, { scene: second.id });
    assert.equal(bundle.scene, second.id);
});

test('a project with no scene at all bundles, and says it has none', async () => {
    const store = new MemoryResourceStore();
    const project = new Project('Empty', { store });

    const bundle = await bundleProject(project, store);
    assert.equal(bundle.scene, null, 'a page can say so rather than guess');
});

// --- what will not open --------------------------------------------------------------------

test('something that is not a bundle is refused by name', () => {
    for (const bad of [null, undefined, 'a string', 42]) {
        assert.throws(() => openBundle(bad), /not a bundle/);
    }
});

test('a bundle from a format this build does not read is fatal on its own', () => {
    // The same rule a graph payload lives by (ADR-0027): nothing below can be trusted to
    // mean what it says in a shape this build has never seen.
    assert.throws(() => openBundle({ format: 99, manifest: {}, payloads: {} }),
        /unsupported bundle format 99/);
});

test('opening a bundle touches no DOM, so a headless server can arbitrate a game', () => {
    // ADR-0042 §2: `openBundle` is pure. Stated as a guard rather than as a promise, and
    // read off the source the way `nodes.test.js` guards the Core.
    const source = bundleProject.toString() + openBundle.toString();

    for (const forbidden of ['document', 'window', 'localStorage', 'canvas']) {
        assert.equal(source.includes(forbidden), false, `it reaches for ${forbidden}`);
    }
});

// --- a store that answers later (ADR-0020 §4, ADR-0065 §3) ----------------------------------

test('a bundle carries what the store holds, even when the store answers later', async () => {
    // THE REGRESSION THIS FILE EXISTED WITHOUT. Every test above uses the in-memory store,
    // which answers synchronously — so the bundler reading `store.read(id)` and looking at
    // the answer passed all of them, while the store a browser actually keeps a project in
    // answered a promise. A promise is neither null nor undefined, so every payload was
    // bundled as one, and `JSON.stringify` writes a promise as `{}`: Preview opened a window
    // on a game whose scene, graphs and pictures were all empty objects.
    const area = new MemoryArea();
    const declared = new Project('Game');
    const store = new PersistentResourceStore(area, declared.id);
    const project = Project.deserialize(declared.serialize(), { store });

    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level.scene' });
    project.save(scene.id, { version: 2, id: 's1', name: 'Level', roots: [], objects: [] });

    const bundle = await bundleProject(project, project.store, { scene: scene.id });

    assert.deepEqual(bundle.payloads[scene.id],
        { version: 2, id: 's1', name: 'Level', roots: [], objects: [] });
    assert.equal(globalThis.JSON.parse(globalThis.JSON.stringify(bundle)).payloads[scene.id].name, 'Level',
        'and it survives the frontier, which is JSON');
});

test('what is bundled is what was just saved, not what the store held before', async () => {
    // A WRITE IS QUEUED AND A READ IS NOT AWAITED BY ITS CALLER, so the two have to share one
    // queue or Preview shows the project as it was one gesture ago (persistence.js).
    const area = new MemoryArea();
    const declared = new Project('Game');
    const store = new PersistentResourceStore(area, declared.id);
    const project = Project.deserialize(declared.serialize(), { store });

    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level.scene' });
    project.save(scene.id, { version: 2, name: 'Before' });
    project.save(scene.id, { version: 2, name: 'After' });

    const bundle = await bundleProject(project, project.store, { scene: scene.id });
    assert.equal(bundle.payloads[scene.id].name, 'After');
});
