// Selection, deselection, and the one flag that says an object is live (ADR-0026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object as SceneObject, Scene, Transform, serializeObject } from '../core/mod.js';
import { ResourceKind } from '../project/mod.js';
import { Selection } from './selection.js';
import { Workspace } from './project/workspace.js';
import { objectFields } from './inspector/schema.js';

function editor() {
    const workspace = new Workspace();
    const registry = new ComponentRegistry();
    registry.register(Transform);
    const scene = new Scene('Main', { registry });
    workspace.create(scene);

    const selection = new Selection();
    // The exclusivity the shell wires (editor.js): one Inspector, so one subject.
    selection.observe(({ object }) => {
        if (object) workspace.select(null);
    });
    workspace.on('selection', ({ id }) => {
        if (id) selection.clear();
    });

    return { workspace, scene, selection };
}

// --- one subject at a time ---------------------------------------------------------------

test('selecting a resource clears the object selection, and the other way round', () => {
    const { workspace, scene, selection } = editor();
    const object = scene.add(new SceneObject('Hero'));
    const folder = workspace.project.addFolder({ name: 'Assets' });

    selection.set(object);
    assert.equal(selection.object, object);
    assert.equal(workspace.selected, null);

    workspace.select(folder.id);
    assert.equal(workspace.selectedId, folder.id);
    assert.equal(selection.object, null, 'the Inspector shows one thing');

    selection.set(object);
    assert.equal(workspace.selected, null);
});

test('clearing either selection leaves nothing selected anywhere', () => {
    const { workspace, scene, selection } = editor();
    const object = scene.add(new SceneObject('Hero'));

    selection.set(object);
    selection.clear();

    assert.equal(selection.object, null);
    assert.equal(workspace.selected, null);
});

test('deselecting a resource does not select an object by accident', () => {
    const { workspace, selection } = editor();
    const folder = workspace.project.addFolder({ name: 'Assets' });

    workspace.select(folder.id);
    workspace.select(null);

    assert.equal(workspace.selected, null);
    assert.equal(selection.object, null);
});

// --- active is the Hierarchy's eye -------------------------------------------------------

test('an object has ONE flag for live, and both controls write it', () => {
    const { scene } = editor();
    const object = scene.add(new SceneObject('Hero'));

    assert.equal(object.active, true);
    assert.equal(object.visible, undefined, 'the second flag is gone (ADR-0026 §13)');

    // What the Hierarchy's eye does.
    object.setProperty('active', false);
    assert.equal(object.active, false);

    // What the Inspector's checkbox does — the same field, so they cannot disagree.
    object.setProperty('active', true);
    assert.equal(object.active, true);
});

test('the Inspector shows `active`, and the row and the panel read one value', () => {
    const names = objectFields().map(field => field.name);

    assert.ok(names.includes('active'));
    assert.equal(names.includes('visible'), false);
});

test('hiding an object is replicable and undoable like any other intent', () => {
    const { scene } = editor();
    const object = scene.add(new SceneObject('Hero'));

    const seen = [];
    scene.operations.on('operation', operation => seen.push(operation));

    object.setProperty('active', false);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].prop, 'active');
    assert.equal(seen[0].previous, true);
});

test('what serializes is the one flag, and nothing shadows it', () => {
    const { scene } = editor();
    const object = scene.add(new SceneObject('Hero'));
    object.setProperty('active', false);

    const data = serializeObject(object);

    assert.equal(data.active, false);
    assert.equal('visible' in data, false);
});

// --- a removed resource cannot stay selected ---------------------------------------------

test('deleting the selected resource deselects it, in both directions', () => {
    const { workspace, selection } = editor();
    const asset = workspace.project.add(
        { kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' },
        'data:image/png;base64,AAAA'
    );

    workspace.select(asset.id);
    workspace.project.removeTree(asset.id);

    assert.equal(workspace.selected, null);
    assert.equal(selection.object, null);
});
