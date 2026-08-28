// The keys a creator may pick, and the adapter that produces the names (ADR-0014 §2).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Input } from '../runtime/mod.js';
import { KEY_REFERENCE, NodeRegistry, registerStandardNodes } from '../core/mod.js';
import { keyCodes, keyLabel, keyOptions } from './keys.js';

// --- the list is a list of real names ------------------------------------------------------

test('every key offered is a name the runtime can be pressed with', () => {
    // THE POINT OF THE LIST, checked rather than asserted in a comment: a creator picks one
    // of these and the graph asks `InputState` about that very string. A name this side
    // could not be pressed on the other side is a node that answers false for ever.
    const input = new Input();
    const state = input.of(null);

    for (const { value } of keyOptions()) {
        state.press(value);
        assert.equal(state.isDown(value), true, value);
        state.release(value);
        assert.equal(state.isDown(value), false, value);
    }
});

test('nothing is offered twice, and nothing is offered blank', () => {
    const options = keyOptions();
    const values = options.map(option => option.value);

    assert.equal(new Set(values).size, values.length, 'a duplicate would be two rows for one key');
    assert.equal(values.length, keyCodes().size);
    for (const option of options) {
        assert.ok(option.value.length > 0, 'a blank key matches nothing');
        assert.ok(option.label.length > 0, `${option.value} has no label`);
        assert.ok(option.group.length > 0, `${option.value} has no group`);
    }
});

test('the default the Key node ships with is one a creator could have picked', () => {
    // A node nobody has touched reads `Space`; if that were not in the list, the picker would
    // open showing a value it does not offer.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.key');

    assert.ok(keyCodes().has(definition.params.key.default));
});

// --- how a code reads --------------------------------------------------------------------

test('a label is derived from the code, so the list carries codes and nothing else', () => {
    assert.equal(keyLabel('KeyW'), 'W');
    assert.equal(keyLabel('Digit7'), '7');
    assert.equal(keyLabel('ArrowLeft'), 'Arrow Left');
    assert.equal(keyLabel('ShiftLeft'), 'Shift Left');
    assert.equal(keyLabel('Numpad3'), 'Numpad 3');
    assert.equal(keyLabel('F11'), 'F11', 'a function key is already read as its code');
    assert.equal(keyLabel('Space'), 'Space');
});

test('a key whose code names a position shows the mark on its cap', () => {
    // `BracketLeft` is where the key IS; `[` is what is printed on it, and what a creator is
    // looking for when they scan the list.
    assert.ok(keyLabel('BracketLeft').startsWith('['));
    assert.ok(keyLabel('Slash').startsWith('/'));
});

// --- the groups --------------------------------------------------------------------------

test('groups are contiguous, so a heading is drawn once per group', () => {
    // `ui/field.js` inserts a heading where the group CHANGES rather than by sorting, which
    // is what lets the reading order below be a reading order. A group that appeared twice
    // would draw its heading twice.
    const groups = keyOptions().map(option => option.group);
    const seen = new Set();

    for (let index = 0; index < groups.length; index++) {
        if (index > 0 && groups[index] === groups[index - 1]) continue;
        assert.ok(!seen.has(groups[index]), `${groups[index]} appears in two runs`);
        seen.add(groups[index]);
    }
});

test('the keys a game binds first come first', () => {
    const groups = [...new Set(keyOptions().map(option => option.group))];

    assert.deepEqual(groups.slice(0, 3), ['Common', 'Arrows', 'Letters']);
    assert.equal(groups.at(-1), 'Punctuation', 'and the ones nobody hunts for come last');
});

// --- what the node declares ----------------------------------------------------------------

test('the Key node names a key rather than asking for free text', () => {
    // WHAT MAKES THE PICKER APPEAR AT ALL. The Core keeps the value an opaque string — a
    // server replaying names never sees a keyboard — and says only what KIND of name it is;
    // the Editor is what has a list (ADR-0014 §2).
    const definition = registerStandardNodes(new NodeRegistry()).get('input.key');

    assert.equal(definition.params.key.reference, KEY_REFERENCE);
    assert.equal(definition.params.key.type, 'string', 'and it is still stored as a string');
});
