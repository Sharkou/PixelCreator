// Undo / Redo (ADR-0024).
//
// The property these tests exist to protect: AN UNDO IS AN OPERATION. It goes through
// `submit(invert(op))`, so it is arbitrated and replicated like any other intent. Undoing
// with a silent `apply()` would desynchronise a shared project without a sound, and it is
// the single easiest thing in this system to get wrong.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object,
    Scene,
    Transform,
    serializeScene
} from '../core/mod.js';
import { registerBuiltIns } from './registry.js';
import {
    addComponent,
    createObject,
    deleteObject,
    moveComponent,
    removeComponent,
    reparentObject
} from './commands.js';
import { Histories, History } from './history.js';

function registry() {
    return registerBuiltIns(new ComponentRegistry());
}

function setup() {
    const scene = new Scene('Main', { registry: registry() });
    const history = new History(scene.operations);
    return { scene, history };
}

// --- the property that matters ------------------------------------------------------

test('an undo produces an Operation, it does not write behind the pipeline', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'empty' });
    object.setProperty('name', 'Hero');

    const announced = [];
    scene.operations.on('operation', operation => announced.push(operation));

    assert.equal(history.undo(), true);

    assert.equal(announced.length, 1, 'anything watching the pipeline saw it');
    assert.equal(announced[0].type, 'SET_PROPERTY');
    assert.equal(announced[0].value, 'Empty', 'and it is a real, replicable mutation');
    assert.equal(object.name, 'Empty');
});

test('a rejected undo leaves both stacks alone', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'empty' });
    object.setProperty('name', 'Hero');

    scene.operations.authority = { check: () => ({ allowed: false, reason: 'read only' }) };

    assert.equal(history.undo(), false);
    assert.equal(object.name, 'Hero', 'the server refused, so nothing moved');
    assert.equal(history.canRedo, false);
});

test('an operation that arrived through apply() is never recorded', () => {
    // `apply()` announces nothing, so the anti-echo protects the history for free: a
    // collaborator's change cannot end up on this creator's undo stack.
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'empty' });
    const edit = object.setProperty('name', 'Hero').operation;

    history.clear();
    scene.operations.apply({ ...edit, value: 'Other', previous: 'Hero' });

    assert.equal(object.name, 'Other');
    assert.equal(history.canUndo, false);
});

test('only my own operations are recorded when an actor is named', () => {
    const scene = new Scene('Main', { registry: registry() });
    const history = new History(scene.operations, { actor: 'me' });
    const object = createObject(scene, { kind: 'empty', actor: 'me' });

    object.setProperty('name', 'Mine', { actor: 'me' });
    object.setProperty('tag', 'theirs', { actor: 'someone-else' });

    history.undo();

    assert.equal(object.tag, 'theirs', 'Ctrl Z does not take back a collaborator’s work');
    assert.equal(object.name, 'Empty');
});

// --- what has to be undoable ---------------------------------------------------------

test('a property change', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'rectangle' });

    object.setProperty('x', 250);
    assert.equal(object.x, 250);

    history.undo();
    assert.equal(object.x, 0);

    history.redo();
    assert.equal(object.x, 250);
});

test('creating an object', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'rectangle' });

    assert.equal(history.undo(), true);
    assert.equal(scene.size, 0);

    assert.equal(history.redo(), true);
    assert.equal(scene.get(object.id).id, object.id, 'the same identifier came back');
    assert.equal(scene.get(object.id).hasComponent('RectangleRenderer'), true);
});

test('adding and removing a component, values and rank included', () => {
    const { scene, history } = setup();
    const known = registry();
    const object = createObject(scene, { kind: 'empty' });

    addComponent(object, 'RectangleRenderer', known);
    object.getComponent('RectangleRenderer').setProperty('width', 42);
    assert.equal(object.getComponent('RectangleRenderer').width, 42);

    removeComponent(object, 'RectangleRenderer');
    assert.equal(object.hasComponent('RectangleRenderer'), false);

    // This is the `42 -> 1` the Phase 1 audit measured: undoing a removal has to give back
    // the component that left, not a fresh one reset to its defaults.
    history.undo();
    assert.equal(object.getComponent('RectangleRenderer').width, 42);
});

test('reordering components', () => {
    const { scene, history } = setup();
    const known = registry();
    const object = createObject(scene, { kind: 'empty' });
    addComponent(object, 'RectangleRenderer', known);

    assert.deepEqual(object.componentTypes(), ['Transform', 'RectangleRenderer']);
    moveComponent(object, 'RectangleRenderer', 0);
    assert.deepEqual(object.componentTypes(), ['RectangleRenderer', 'Transform']);

    history.undo();
    assert.deepEqual(object.componentTypes(), ['Transform', 'RectangleRenderer']);

    history.redo();
    assert.deepEqual(object.componentTypes(), ['RectangleRenderer', 'Transform']);
});

test('a reparent is one entry, geometry included', () => {
    const { scene, history } = setup();
    const parent = createObject(scene, { kind: 'empty', x: 100, y: 50 });
    const child = createObject(scene, { kind: 'empty', x: 10, y: 10 });

    const before = JSON.stringify(serializeScene(scene));
    reparentObject(scene, child, parent);
    assert.equal(child.parent, parent);
    assert.equal(child.x, -90, 'the world was held');

    // Six operations, one batch, one undo.
    assert.equal(history.depth, 3, 'two creations and one drop');
    assert.equal(history.undo(), true);

    assert.equal(child.parent, null);
    assert.equal(JSON.stringify(serializeScene(scene)), before);
});

test('deleting a subtree and putting it back keeps its shape and its rank', () => {
    // The named risk of the audit: a REMOVE_OBJECT without its subtree or its index gives
    // back a stripped object at the end of the list.
    const { scene, history } = setup();
    const first = createObject(scene, { kind: 'empty' });
    const parent = createObject(scene, { kind: 'empty' });
    const child = createObject(scene, { kind: 'rectangle', parent });
    const grandchild = createObject(scene, { kind: 'empty', parent: child });
    const last = createObject(scene, { kind: 'empty' });

    child.getComponent('RectangleRenderer').setProperty('width', 123);
    reparentObject(scene, parent, null, 0);

    const before = JSON.stringify(serializeScene(scene));

    assert.equal(deleteObject(scene, parent), true);
    assert.equal(scene.size, 2);

    assert.equal(history.undo(), true);

    assert.equal(scene.size, 5);
    assert.equal(JSON.stringify(serializeScene(scene)), before,
        'the whole subtree came back, in its shape, at its rank, with its values');
    assert.deepEqual(scene.roots().map(object => object.id), [parent.id, first.id, last.id]);
    assert.equal(scene.get(child.id).getComponent('RectangleRenderer').width, 123);
    assert.equal(scene.get(grandchild.id).parent.id, child.id);
});

// --- stacks -------------------------------------------------------------------------

test('a batch is one entry, undone in reverse order', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'empty' });
    history.clear();

    object.setProperty('name', 'A', { batch: 'drag-1' });
    object.setProperty('name', 'B', { batch: 'drag-1' });
    object.setProperty('name', 'C', { batch: 'drag-1' });

    assert.equal(history.depth, 1, 'a drag is one undo, not two hundred');
    history.undo();
    assert.equal(object.name, 'Empty');
});

test('new work clears the redo stack', () => {
    const { scene, history } = setup();
    const object = createObject(scene, { kind: 'empty' });
    object.setProperty('name', 'Hero');

    history.undo();
    assert.equal(history.canRedo, true);

    object.setProperty('tag', 'enemy');
    assert.equal(history.canRedo, false, 'the redo stack described a future that is gone');
});

test('the stack announces itself, for a menu item that has to grey out', () => {
    const { scene, history } = setup();
    const seen = [];
    const stop = history.observe(state => seen.push(`${state.canUndo}/${state.canRedo}`));

    const object = createObject(scene, { kind: 'empty' });
    history.undo();
    stop();
    object.setProperty('name', 'Hero');

    assert.deepEqual(seen, ['true/false', 'false/true']);
});

test('undo and redo on an empty stack say so instead of throwing', () => {
    const { history } = setup();

    assert.equal(history.undo(), false);
    assert.equal(history.redo(), false);
    assert.equal(history.canUndo, false);
});

test('a history stops listening when it is disposed', () => {
    const { scene, history } = setup();
    history.dispose();

    createObject(scene, { kind: 'empty' });

    assert.equal(history.canUndo, false);
});

test('History needs a pipeline', () => {
    assert.throws(() => new History(null), TypeError);
    assert.throws(() => new History({}), TypeError);
});

// --- one stack per resource ----------------------------------------------------------

test('one stack per resource, so Ctrl Z never crosses a window', () => {
    // A single global stack is the classic mistake: undoing in the Graph window would take
    // back an edit made in the scene (ADR-0024).
    const first = new Scene('First', { registry: registry() });
    const second = new Scene('Second', { registry: registry() });
    const histories = new Histories();

    const one = histories.for(first.id, first.operations);
    const two = histories.for(second.id, second.operations);

    const a = createObject(first, { kind: 'empty' });
    createObject(second, { kind: 'empty' });

    assert.equal(histories.for(first.id, first.operations), one, 'asked twice, the same stack');
    assert.deepEqual(histories.resources().sort(), [first.id, second.id].sort());

    one.undo();
    assert.equal(first.size, 0);
    assert.equal(second.size, 1, 'the other scene is untouched');
    assert.equal(two.canUndo, true);
    assert.equal(a.id.length > 0, true);
});

test('closing an editor drops its stack', () => {
    const scene = new Scene('Main', { registry: registry() });
    const histories = new Histories();
    histories.for(scene.id, scene.operations);

    assert.equal(histories.close(scene.id), true);
    assert.equal(histories.get(scene.id), null);
    assert.equal(histories.close(scene.id), false);
});
