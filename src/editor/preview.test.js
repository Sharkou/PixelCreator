// Bundling what is being edited and opening it somewhere else (ADR-0042).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene, components } from '../core/mod.js';
import { Workspace } from './project/workspace.js';
import { openPreview } from './preview.js';
import { idFromHash } from '../preview/store.js';

/** A workspace with a scene open, and a storage that behaves like the browser's. */
function editing() {
    const workspace = new Workspace({ components });
    workspace.create(new Scene('Level', { registry: components }));

    const map = new Map();
    const storage = {
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => map.set(key, value),
        removeItem: key => map.delete(key)
    };
    globalThis.localStorage = storage;

    return { workspace, storage, map };
}

test('Preview bundles the project, stores it, and opens a window at its URL', () => {
    const it = editing();
    const opened = [];

    const result = openPreview(it.workspace, { open: url => (opened.push(url), { closed: false }) });

    assert.ok(result, 'it opened');
    assert.equal(result.id, it.workspace.project.id, 'the preview of a project IS the project');
    assert.deepEqual(opened, [result.url]);
    assert.equal(idFromHash(new URL(result.url, 'http://x/').hash), result.id,
        'the URL carries the id the client will ask for');
});

test('what is stored is the project, not a handle to it', () => {
    const it = editing();

    const result = openPreview(it.workspace, { open: () => ({}) });
    const stored = JSON.parse(it.storage.getItem(`px.preview.${result.id}`));

    assert.equal(stored.format, 1);
    assert.ok(stored.manifest, 'the manifest crossed');
    assert.ok(stored.scene, 'and which scene to open');
    assert.doesNotThrow(() => JSON.parse(JSON.stringify(stored)), 'it is JSON all the way down');
});

test('the live scene is saved first, so a preview plays what is on screen', () => {
    // THE SURPRISE A PREVIEW EXISTS TO REMOVE. Without this the window plays the project as
    // it was at the last save, and a creator sees their previous attempt.
    const it = editing();
    const saved = [];
    it.workspace.save = ({ id }) => (saved.push(id), true);

    openPreview(it.workspace, { open: () => ({}) });

    assert.deepEqual(saved, it.workspace.opened().map(resource => resource.id),
        'every open editor was written, not only the active one');
});

test('a storage that refuses is reported, and no window is opened onto nothing', () => {
    const it = editing();
    it.storage.setItem = () => { throw new Error('QuotaExceededError'); };
    const said = [];
    const opened = [];

    const result = openPreview(it.workspace, {
        open: url => (opened.push(url), {}),
        report: message => said.push(message)
    });

    assert.equal(result, null);
    assert.deepEqual(opened, [], 'nothing was opened');
    assert.equal(said.length, 1);
    assert.match(said[0], /private window|quota/i, 'and it says what a creator can act on');
});

test('a blocked pop-up is not a failed preview, and says so', () => {
    // The bundle IS stored and the link IS good; what is missing is permission.
    const it = editing();
    const said = [];

    const result = openPreview(it.workspace, { open: () => null, report: message => said.push(message) });

    assert.ok(result, 'the id and the URL are still handed back');
    assert.match(said[0], /pop-?ups/i);
    assert.ok(it.storage.getItem(`px.preview.${result.id}`), 'and the bundle is waiting at it');
});

test('two previews are two windows on ONE game, sharing one identity', () => {
    // WHAT A MINTED ID PER PRESS COULD NOT GIVE (ADR-0044 §2). Two clients of one game have
    // to agree on what the game is called before they can share a channel — or, later, a
    // server and a URL. So the id is the project's, and pressing twice reaches one bundle.
    const it = editing();

    const first = openPreview(it.workspace, { open: () => ({}) });
    const second = openPreview(it.workspace, { open: () => ({}) });

    assert.equal(first.id, second.id);
    assert.equal(first.url, second.url, 'so both windows are the same address');
    assert.ok(it.storage.getItem(`px.preview.${first.id}`), 'and one bundle is waiting at it');
});

test('no project is answered, not thrown', () => {
    const said = [];

    assert.equal(openPreview(null, { report: message => said.push(message) }), null);
    assert.equal(said.length, 1);
});
