// Which documents the upper area holds, and which one it shows.
//
// The strip itself is DOM and is checked in the browser; what is tested here is the part
// that decides — which documents have a tab, which of them may be closed, and which one is
// on screen. The last test is the important one: it pins the correspondence that lets
// reordering a tab be `Workspace.reorder()` and nothing else.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Scene } from '../../core/mod.js';
import { ResourceKind } from '../../project/mod.js';
import { Workspace } from '../project/workspace.js';
import { DOCUMENT_SURFACES, activeDocument, documentViews } from './documents.js';

const scene = { id: 'scene-1', kind: ResourceKind.SCENE, name: 'Level 1' };
const player = { id: 'px-1', kind: ResourceKind.COMPONENT, name: 'Player.px' };
const enemy = { id: 'px-2', kind: ResourceKind.COMPONENT, name: 'Enemy.px' };

test('every open document gets a tab, in the order the Workspace holds them', () => {
    const views = documentViews([scene, player, enemy]);

    assert.deepEqual(views.map(view => view.id), [scene.id, player.id, enemy.id]);
    assert.deepEqual(views.map(view => view.label), ['Level 1', 'Player.px', 'Enemy.px']);
    assert.deepEqual(views.map(view => view.surface), ['scene', 'graph', 'graph']);
});

test('the Scene is a permanent tab and everything else closes', () => {
    // Closing a `.px` releases its model and its undo stack and lets it be deleted
    // (ADR-0027 §10). Closing the scene would leave every window bound to a model the
    // project no longer presents, which is why it is the one tab with no close button.
    const views = documentViews([scene, player]);

    assert.equal(views[0].closable, false);
    assert.equal(views[1].closable, true);
});

test('the Scene is a tab like any other, so it takes its place from the Workspace', () => {
    // Which is what makes reordering it an ordinary reorder rather than a special case.
    const views = documentViews([player, scene, enemy]);
    assert.deepEqual(views.map(view => view.id), [player.id, scene.id, enemy.id]);
});

test('a kind with no surface gets no tab rather than an empty one', () => {
    const folder = { id: 'f', kind: ResourceKind.FOLDER, name: 'Assets' };
    const asset = { id: 'a', kind: ResourceKind.ASSET, name: 'hero.png' };

    assert.deepEqual(documentViews([folder, asset]), []);
    assert.deepEqual(documentViews([]), []);
});

test('an unnamed resource is labelled rather than blank', () => {
    assert.equal(documentViews([{ id: 'px-3', kind: ResourceKind.COMPONENT, name: '' }])[0].label, 'Untitled');
});

// --- which one shows ------------------------------------------------------------------

test('the area shows the active editor', () => {
    const views = documentViews([scene, player, enemy]);
    assert.equal(activeDocument(views, enemy.id), enemy.id);
});

test('an active editor with no tab falls back rather than showing nothing', () => {
    // `activeId` also names a resource that is merely ATTACHED — a `.px` selected in the
    // Project panel has a live model without any window presenting it (ADR-0027 §10).
    const views = documentViews([scene, player]);

    assert.equal(activeDocument(views, 'attached-only', player.id), player.id,
        'the document already on screen is kept');
    assert.equal(activeDocument(views, 'attached-only', 'gone-too'), scene.id);
    assert.equal(activeDocument(views, null), scene.id);
    assert.equal(activeDocument([], 'anything'), null);
});

// --- the correspondence reordering depends on ------------------------------------------

test('the strip is `opened()` rank for rank, so a tab rank is a Workspace rank', async () => {
    // THE ASSUMPTION THAT REMOVED A TRANSLATION. Only kinds with a surface can be opened at
    // all, so nothing is dropped on the way through `documentViews()` and the two lists
    // cannot drift. If a kind is ever openable without a surface, this fails first.
    const workspace = new Workspace();
    workspace.create(new Scene('Level 1', { registry: new ComponentRegistry() }));

    const ids = [];
    for (const name of ['A.px', 'B.px', 'C.px']) {
        const resource = workspace.project.add({ kind: ResourceKind.COMPONENT, name }, null);
        workspace.project.save(resource.id, {
            type: resource.id, label: name, properties: {}, graph: { version: 1, nodes: [], connections: [] }
        });
        await workspace.open(resource.id);
        ids.push(resource.id);
    }

    const opened = () => workspace.opened();
    assert.deepEqual(documentViews(opened()).map(view => view.id), opened().map(r => r.id));

    // Every openable kind has a surface, which is what the equality above depends on.
    for (const resource of opened()) assert.ok(DOCUMENT_SURFACES[resource.kind]);

    const labels = () => documentViews(opened()).map(view => view.label);
    assert.deepEqual(labels(), ['Level 1', 'A.px', 'B.px', 'C.px']);

    // A rank read straight off the strip, handed straight to the Workspace.
    workspace.reorder(ids[2], 1);
    assert.deepEqual(labels(), ['Level 1', 'C.px', 'A.px', 'B.px']);

    workspace.reorder(ids[2], 3);
    assert.deepEqual(labels(), ['Level 1', 'A.px', 'B.px', 'C.px']);
});
