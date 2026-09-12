// Saving without being asked, and not once per keystroke (ADR-0065 §2).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../../core/mod.js';
import { MemoryArea, PersistentResourceStore } from '../../project/persistence.js';
import { Project } from '../../project/project.js';
import { ResourceKind } from '../../project/resource.js';
import { Workspace } from './workspace.js';
import { createAutosave } from './autosave.js';

/** A clock a test drives, so nothing here waits on a real timer. */
function clock() {
    let next = 0;
    const due = new globalThis.Map();

    return {
        schedule: (run, delay) => {
            const handle = ++next;
            due.set(handle, { run, at: delay });
            return handle;
        },
        cancel: handle => due.delete(handle),
        /** Fire everything that was scheduled. */
        tick: () => {
            const pending = [...due.values()];
            due.clear();
            for (const entry of pending) entry.run();
        },
        get waiting() {
            return due.size;
        }
    };
}

/** Let the store's queue drain: a write is a chain of promises, not one turn. */
function settle() {
    return new globalThis.Promise(resolve => globalThis.setTimeout(resolve, 0));
}

function world() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const area = new MemoryArea();
    const store = new PersistentResourceStore(area, 'proj_1');
    const project = new Project('My Game', { store });
    const workspace = new Workspace({ components: registry, project });

    const scene = new Scene('Level', { registry });
    const player = scene.add(new SceneObject('Player'));
    player.addComponent(new Transform(1, 2));
    const resource = workspace.create(scene);

    return { area, store, project, workspace, scene, player, resource, registry };
}

// --- when it writes -----------------------------------------------------------------------

test('a change waits for quiet, and then writes once', async () => {
    const it = world();
    const timer = clock();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...timer });

    // Ten writes in a row — a creator dragging a slider. Each is a real, replicable intent.
    for (let at = 0; at < 10; at++) it.player.setProperty('x', at);

    assert.equal(autosave.saves(), 0, 'nothing is written while the model is still moving');
    assert.equal(autosave.pending(), true);

    timer.tick();
    await settle();

    assert.equal(autosave.saves(), 1, 'ten intents, one write');
    autosave.stop();
});

test('a rename reaches the store even though it touches no payload', async () => {
    const it = world();
    const timer = clock();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...timer });

    it.project.setProperty(it.resource.id, 'name', 'Arena.scene');
    timer.tick();
    await autosave.flush();

    const entries = await it.store.list();
    assert.equal(entries.find(entry => entry.id === it.resource.id).name, 'Arena.scene');
    autosave.stop();
});

test('an edited scene is written, not only declared', async () => {
    const it = world();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...clock() });

    it.player.setProperty('x', 99);
    await autosave.flush();

    const payload = await it.store.read(it.resource.id);
    assert.equal(payload.objects[0].components[0].values.x, 99);
    autosave.stop();
});

test('nothing to save writes nothing', async () => {
    const it = world();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...clock() });

    await autosave.flush();
    assert.equal(autosave.saves(), 0);
    autosave.stop();
});

test('a save does not ask for another one, or the Editor never stops writing', async () => {
    // THE LOOP THIS EXISTS TO REFUSE. A flush writes payloads through `Project.save()`, which
    // stamps `revision` and `modified` on the manifest — two operations on the very pipeline
    // this listens to. Taken for edits, they re-armed the timer, the next flush wrote again,
    // and a browser sitting on an untouched Editor put the whole project through IndexedDB
    // every 600 ms for as long as the tab was open. Measured at 21 writes in three seconds.
    const it = world();
    const timer = clock();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...timer });

    it.player.setProperty('x', 7);
    timer.tick();
    await settle();

    assert.equal(autosave.saves(), 1);
    assert.equal(autosave.pending(), false, 'the write is not itself a reason to write again');
    assert.equal(timer.waiting, 0, 'and nothing is scheduled');

    autosave.stop();
});

test('a flush writes only what changed, so a clean document keeps its revision', async () => {
    // A REVISION IS WHAT SAYS A PAYLOAD MOVED, and every cache in the Editor is keyed on one.
    // Re-writing an untouched document bumps it, which throws away a decoded picture, a read
    // payload and a bound graph for nothing — and stamps `modified` with a time at which
    // nothing was modified.
    const it = world();
    const timer = clock();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...timer });

    it.project.setProperty(it.resource.id, 'name', 'Arena.scene');
    const before = it.project.get(it.resource.id).revision;

    timer.tick();
    await settle();

    assert.equal(it.project.get(it.resource.id).revision, before,
        'the manifest was written, the payload was not');
    autosave.stop();
});

test('a save that fails leaves the model dirty, so the next quiet period tries again', async () => {
    const it = world();
    const timer = clock();
    const failures = [];

    const refusing = {
        saveManifest: async () => {
            throw new Error('quota exceeded');
        }
    };

    const autosave = createAutosave({
        workspace: it.workspace,
        store: refusing,
        onError: error => failures.push(error.message),
        ...timer
    });

    it.player.setProperty('x', 5);
    await autosave.flush();

    assert.deepEqual(failures, ['quota exceeded']);
    assert.equal(autosave.pending(), true, 'a full quota now may not be full in a minute');
    autosave.stop();
});

test('stopping releases everything, so a closed editor writes nothing more', async () => {
    const it = world();
    const timer = clock();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...timer });

    autosave.stop();
    it.player.setProperty('x', 7);

    assert.equal(timer.waiting, 0);
    assert.equal(autosave.pending(), false);
});

// --- what it writes ------------------------------------------------------------------------

test('the whole project comes back after a reload, from what the autosave wrote', async () => {
    const it = world();
    const autosave = createAutosave({ workspace: it.workspace, store: it.store, ...clock() });

    it.project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' }, 'data:image/png;base64,AA');
    it.player.setProperty('x', 42);
    await autosave.flush();
    autosave.stop();

    // A SECOND SESSION over the same area: nothing of the first is in memory.
    const reopened = Project.deserialize(
        await new PersistentResourceStore(it.area, 'proj_1').manifest(),
        { store: new PersistentResourceStore(it.area, 'proj_1') }
    );

    assert.equal(reopened.name, 'My Game');
    assert.deepEqual(reopened.resources().map(entry => entry.name), ['Level', 'hero.png']);
    assert.equal((await reopened.read(it.resource.id)).objects[0].components[0].values.x, 42);
});

test('COUNTER-PROOF: without the manifest write, the project name and its filing are lost', async () => {
    // The regression the manifest half exists to prevent. `Workspace.save()` writes PAYLOADS,
    // and a project's own name and the folder a resource sits in are in neither of them — so
    // an autosave that only saved payloads would reopen every scene under the wrong name, in
    // the wrong place, silently, and only visibly tomorrow.
    const it = world();
    const folder = it.project.addFolder({ name: 'Levels' });
    it.project.name = 'Renamed Game';
    it.project.move(it.resource.id, folder.id);
    await settle();

    for (const resource of it.workspace.opened()) it.workspace.save({ id: resource.id });
    await settle();

    const stale = await it.store.manifest();
    assert.notEqual(stale.name, 'Renamed Game', 'the project name never reached the store');

    // And with the manifest write, both arrive.
    await it.store.saveManifest(it.project.serialize());
    const saved = await it.store.manifest();
    assert.equal(saved.name, 'Renamed Game');
    assert.equal(saved.resources.find(entry => entry.id === it.resource.id).parent, folder.id);
});
