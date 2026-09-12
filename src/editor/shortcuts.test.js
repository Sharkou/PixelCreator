// Which keystroke means what, and what it acts on (ADR-0069 §3).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../core/mod.js';
import { MemoryResourceStore, Project } from '../project/mod.js';
import { Workspace } from './project/workspace.js';
import { Shortcut, applyShortcut, shortcutFor } from './shortcuts.js';

const key = (value, extra = {}) => ({ key: value, ctrlKey: false, metaKey: false, shiftKey: false, ...extra });

function registry() {
    const types = new ComponentRegistry();
    types.register(Transform);
    return types;
}

/** A workspace with one scene open, the way the shell has one. */
async function staged() {
    const workspace = new Workspace({ project: new Project('Game', { store: new MemoryResourceStore() }) });
    const scene = new Scene('Level', { registry: registry() });
    const hero = scene.add(new SceneObject('Hero'));
    hero.addComponent(new Transform(0, 0));

    const resource = workspace.create(scene);
    await workspace.open(resource.id, { registry: registry() });
    return { workspace, scene, hero, resource };
}

// --- the table -------------------------------------------------------------------------

test('Ctrl and Cmd both, and both conventions for redo', () => {
    assert.equal(shortcutFor(key('z', { ctrlKey: true })), Shortcut.UNDO);
    assert.equal(shortcutFor(key('z', { metaKey: true })), Shortcut.UNDO, 'macOS presses Cmd');
    assert.equal(shortcutFor(key('Z', { ctrlKey: true })), Shortcut.UNDO, 'a capital Z is the same key');

    assert.equal(shortcutFor(key('z', { ctrlKey: true, shiftKey: true })), Shortcut.REDO);
    assert.equal(shortcutFor(key('z', { metaKey: true, shiftKey: true })), Shortcut.REDO);
    assert.equal(shortcutFor(key('y', { ctrlKey: true })), Shortcut.REDO, 'and what half of them try first');

    assert.equal(shortcutFor(key('s', { ctrlKey: true })), Shortcut.SAVE);
});

test('a key with no modifier is not a shortcut, and neither is an unbound one', () => {
    assert.equal(shortcutFor(key('z')), null);
    assert.equal(shortcutFor(key('Delete')), null);
    assert.equal(shortcutFor(key('q', { ctrlKey: true })), null);
    assert.equal(shortcutFor(null), null);
});

// --- what it acts on -------------------------------------------------------------------

test('undo is aimed at the document being edited, asked for at the moment it is pressed', async () => {
    const it = await staged();

    it.hero.setProperty('name', 'Heroine');
    assert.equal(applyShortcut(Shortcut.UNDO, { workspace: it.workspace }), true);
    assert.equal(it.hero.name, 'Hero');

    assert.equal(applyShortcut(Shortcut.REDO, { workspace: it.workspace }), true);
    assert.equal(it.hero.name, 'Heroine');
});

test('an autosave in between changes nothing about where undo is aimed', async () => {
    const it = await staged();

    it.hero.setProperty('name', 'Heroine');
    // What the debounced autosave does, six hundred milliseconds later (ADR-0065 §3).
    it.workspace.save();

    assert.equal(applyShortcut(Shortcut.UNDO, { workspace: it.workspace }), true);
    assert.equal(it.hero.name, 'Hero', 'the rename, not the bookkeeping of the save');
});

test('with nothing of ours to take back, the keystroke is left alone', async () => {
    // A PROJECT REOPENED, WHICH IS THE STATE EVERY MORNING STARTS IN (ADR-0065): nothing
    // has been authored in this session, so there is nothing to undo.
    const store = new MemoryResourceStore();
    const source = await staged();
    const reopened = new Workspace({
        project: Project.deserialize(source.workspace.project.serialize(), { store })
    });
    for (const resource of source.workspace.project.resources()) {
        store.write(resource, source.workspace.project.read(resource.id));
    }
    const scene = await reopened.open(source.resource.id, { registry: registry() });

    // THE TEXT-FIELD RULE (ADR-0069 §3). `applyShortcut` answering false is what stops
    // `editor.js` from calling `preventDefault()`, so a focused input keeps its own undo.
    assert.equal(applyShortcut(Shortcut.UNDO, { workspace: reopened }), false);
    assert.equal(applyShortcut(Shortcut.REDO, { workspace: reopened }), false);

    // And once there IS something of ours, the Editor takes the key.
    scene.objects()[0].setProperty('name', 'Heroine');
    assert.equal(applyShortcut(Shortcut.UNDO, { workspace: reopened }), true);
    assert.equal(scene.objects()[0].name, 'Hero');
});

test('a shortcut with no workspace does nothing rather than throwing', () => {
    assert.equal(applyShortcut(Shortcut.UNDO, {}), false);
    assert.equal(applyShortcut(null, { workspace: {} }), false);
});

// --- two projects ------------------------------------------------------------------------

test('undo in one project never reaches into another', async () => {
    const first = await staged();
    const second = await staged();

    first.hero.setProperty('name', 'Heroine');
    second.hero.setProperty('name', 'Villain');

    applyShortcut(Shortcut.UNDO, { workspace: second.workspace });

    assert.equal(second.hero.name, 'Hero', 'the one that was asked');
    assert.equal(first.hero.name, 'Heroine', 'and only that one');

    // Nothing of the second's is reachable from the first, however many times it is asked.
    applyShortcut(Shortcut.UNDO, { workspace: second.workspace });
    assert.equal(second.hero.name, 'Hero');
});

test('opening another scene replaces the first, and undo never reaches back into it', async () => {
    const it = await staged();
    it.hero.setProperty('name', 'Heroine');

    // ONE SCENE AT A TIME, which is the Workspace's own rule: every window is bound to the
    // open scene, so a second one takes its place — and its stack goes with it.
    const other = new Scene('Second', { registry: registry() });
    const villain = other.add(new SceneObject('Villain'));
    villain.addComponent(new Transform(0, 0));
    it.workspace.create(other);

    assert.equal(it.workspace.histories.get(it.resource.id), null, 'the first scene took its stack with it');

    villain.setProperty('name', 'Villainess');
    applyShortcut(Shortcut.UNDO, { workspace: it.workspace });

    assert.equal(villain.name, 'Villain', 'the scene being edited');
    assert.equal(it.hero.name, 'Heroine', 'and the one that was closed is never touched');

    // And undoing again cannot walk back into the closed scene either: what is left on the
    // manifest is the manifest's own history.
    applyShortcut(Shortcut.UNDO, { workspace: it.workspace });
    assert.equal(it.hero.name, 'Heroine');
});

test('closing an editor takes its stack with it', async () => {
    const it = await staged();
    it.hero.setProperty('name', 'Heroine');

    it.workspace.close(it.resource.id);

    assert.equal(it.workspace.histories.get(it.resource.id), null, 'no listener left behind');
    // The manifest is still there, and undo falls back to it rather than to nothing.
    assert.equal(it.workspace.activeHistory, it.workspace.projectHistory);
});
