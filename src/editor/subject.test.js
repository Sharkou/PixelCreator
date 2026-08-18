// One subject at a time, whichever window announced it (ADR-0032).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Selection } from './selection.js';
import { Subject } from './subject.js';

/** The half of a Workspace this cares about: a resource id, and a notification. */
function workspaceStub() {
    let selected = null;
    const listeners = [];

    return {
        get selectedId() {
            return selected;
        },
        select(id) {
            const next = id ?? null;
            if (next === selected) return next;
            selected = next;
            for (const listener of [...listeners]) listener(next);
            return next;
        },
        on(event, listener) {
            if (event === 'selection') listeners.push(listener);
            return () => {};
        }
    };
}

function editor() {
    const selection = new Selection();
    const workspace = workspaceStub();
    return { selection, workspace, subject: new Subject({ selection, workspace }) };
}

test('a Subject needs a Selection to route into', () => {
    assert.throws(() => new Subject({}), TypeError);
});

test('selecting an object drops the resource', () => {
    const { selection, workspace, subject } = editor();
    const object = { name: 'Player' };

    subject.resource('res_a');
    subject.object(object);

    assert.equal(selection.object, object);
    assert.equal(workspace.selectedId, null);
});

test('selecting a resource drops the object', () => {
    const { selection, workspace, subject } = editor();

    subject.object({ name: 'Player' });
    subject.resource('res_a');

    assert.equal(workspace.selectedId, 'res_a');
    assert.equal(selection.object, null);
});

// THE BUG THIS EXISTS FOR. Clearing used to be propagated from a Selection change, and
// `Selection.set(null)` emits nothing when it was already empty — so a click on the empty
// scene left the Project tile selected, in a panel nobody had touched.
test('clearing drops the resource even when no object was selected', () => {
    const { selection, workspace, subject } = editor();

    subject.resource('res_a');
    subject.clear();

    assert.equal(workspace.selectedId, null);
    assert.equal(selection.object, null);
});

test('clearing drops the object even when no resource was selected', () => {
    const { selection, workspace, subject } = editor();

    subject.object({ name: 'Player' });
    subject.clear();

    assert.equal(selection.object, null);
    assert.equal(workspace.selectedId, null);
});

test('selecting nothing is the same intention as clearing', () => {
    const { selection, workspace, subject } = editor();

    subject.resource('res_a');
    subject.object(null);

    assert.equal(selection.object, null);
    assert.equal(workspace.selectedId, null);
});

test('at most one holder is ever full, whatever the sequence', () => {
    const { selection, workspace, subject } = editor();
    const object = { name: 'Player' };

    const gestures = [
        () => subject.object(object),
        () => subject.resource('res_a'),
        () => subject.clear(),
        () => subject.resource('res_b'),
        () => subject.object(object),
        () => subject.object(null)
    ];

    for (const gesture of gestures) {
        gesture();
        const full = [selection.object, workspace.selectedId].filter(Boolean);
        assert.ok(full.length <= 1, `two subjects at once: ${JSON.stringify(full)}`);
    }
});

test('kind names the subject, and derives it rather than storing it', () => {
    const { subject } = editor();

    assert.equal(subject.kind, 'none');
    subject.object({ name: 'Player' });
    assert.equal(subject.kind, 'object');
    subject.resource('res_a');
    assert.equal(subject.kind, 'resource');
    subject.clear();
    assert.equal(subject.kind, 'none');
});

// An observer that selects something else must not interleave its writes with the gesture
// in flight: the first gesture wins, and the holders are left consistent either way.
test('an observer that re-selects during a change cannot leave both holders full', () => {
    const { selection, workspace, subject } = editor();

    selection.observe(() => subject.resource('res_echo'));
    workspace.on('selection', () => subject.object({ name: 'Echo' }));

    subject.object({ name: 'Player' });
    assert.equal(workspace.selectedId, null);

    subject.resource('res_a');
    assert.equal(selection.object, null);
    assert.equal(workspace.selectedId, 'res_a');
});

test('a Subject with no workspace still routes the object side', () => {
    const selection = new Selection();
    const subject = new Subject({ selection });
    const object = { name: 'Player' };

    subject.object(object);
    assert.equal(selection.object, object);

    subject.clear();
    assert.equal(selection.object, null);
});
