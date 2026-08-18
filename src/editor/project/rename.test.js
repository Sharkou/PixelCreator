// Renaming a resource: what the model sees, whichever gesture asked for it (ADR-0026).
//
// The gestures themselves are DOM — a second click in the Project panel, a keystroke in the
// Inspector — and what they must produce is what is asserted here: the extension survives,
// the model moves on every keystroke, and one typing session is ONE undo entry.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createId } from '../../core/mod.js';
import { Project, ResourceKind, baseNameOf, withExtension } from '../../project/mod.js';
import { History } from '../history.js';

function project() {
    const created = new Project('Game');
    const asset = created.add(
        { kind: ResourceKind.ASSET, name: 'player.png', mime: 'image/png' },
        'data:image/png;base64,AAAA'
    );
    return { project: created, asset };
}

/** What the Inspector's field does: one write per keystroke, all under one batch. */
function type(project, id, text, { batch = createId() } = {}) {
    const entry = project.get(id);
    for (let length = 1; length <= text.length; length++) {
        project.setProperty(id, 'name', withExtension(text.slice(0, length), entry), { batch });
    }
    return batch;
}

// --- what a rename may do ----------------------------------------------------------------

test('renaming keeps the extension the kind decides', () => {
    const { project: game, asset } = project();

    game.setProperty(asset.id, 'name', withExtension('player_idle', game.get(asset.id)));

    assert.equal(game.get(asset.id).name, 'player_idle.png');
    assert.equal(baseNameOf(game.get(asset.id)), 'player_idle');
});

test('typing another extension does not convert anything', () => {
    const { project: game, asset } = project();

    game.setProperty(asset.id, 'name', withExtension('player.txt', game.get(asset.id)));

    assert.equal(game.get(asset.id).name, 'player.png');
    assert.equal(game.get(asset.id).mime, 'image/png', 'and the payload is what it always was');
});

// --- reactive, and still one undo --------------------------------------------------------

test('the model moves on every keystroke, so every view is live', () => {
    const { project: game, asset } = project();
    const seen = [];
    // What a Project tile and a panel title do: observe the entry, redraw on each change.
    game.operations.on('operation', operation => seen.push(operation.value));

    type(game, asset.id, 'Tes');

    assert.deepEqual(seen, ['T.png', 'Te.png', 'Tes.png']);
    assert.equal(game.get(asset.id).name, 'Tes.png');
});

test('one typing session is one undo entry', () => {
    const { project: game, asset } = project();
    const history = new History(game.operations);

    type(game, asset.id, 'Villain');

    assert.equal(history.depth, 1, 'seven keystrokes, one entry');

    history.undo();
    assert.equal(game.get(asset.id).name, 'player.png', 'and it goes back in one gesture');

    history.redo();
    assert.equal(game.get(asset.id).name, 'Villain.png');
});

test('two typing sessions are two entries', () => {
    const { project: game, asset } = project();
    const history = new History(game.operations);

    type(game, asset.id, 'One');
    type(game, asset.id, 'Two');

    assert.equal(history.depth, 2);
    history.undo();
    assert.equal(game.get(asset.id).name, 'One.png');
});

test('a rename that changes nothing is not an operation at all', () => {
    const { project: game, asset } = project();
    const seen = [];
    game.operations.on('operation', operation => seen.push(operation));

    game.setProperty(asset.id, 'name', 'player.png');

    assert.deepEqual(seen, [], 'the same name is not an intent');
});

test('a folder renames without gaining an extension', () => {
    const game = new Project('Game');
    const folder = game.addFolder({ name: 'Assets' });

    game.setProperty(folder.id, 'name', withExtension('Art', game.get(folder.id)));

    assert.equal(game.get(folder.id).name, 'Art');
});

test('a component keeps its `.px`, because that is what it is', () => {
    const game = new Project('Game');
    const component = game.add({ kind: ResourceKind.COMPONENT, name: 'Controller.px' });

    game.setProperty(component.id, 'name', withExtension('Movement.scene', game.get(component.id)));

    assert.equal(game.get(component.id).name, 'Movement.px');
});
