// Editing a list of values (ADR-0023's missing control, as arithmetic).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object as SceneObject, PropertyType, Scene } from '../../core/mod.js';
import { Tilemap } from '../../runtime/mod.js';
import { describeComponent } from './schema.js';
import { FieldKind } from './schema.js';
import { ITEM_KEY, addItem, itemFieldFor, listOf, moveItem, removeItem, setItem } from './list.js';

// --- what a list is ----------------------------------------------------------------------

test('anything that is not an array reads as an empty list', () => {
    // A property whose value has never been set, or was set to something of another shape,
    // still has to draw. The Core keeps what it was given; this only says what to show.
    for (const value of [undefined, null, 0, '', 'abc', {}, true]) {
        assert.deepEqual(listOf(value), []);
    }
});

test('reading a list never hands back the array the model holds', () => {
    // THE DEFECT THIS EXISTS TO PREVENT. A control that mutated the stored array would
    // change what the model holds and tell nobody: no Change, no Operation, no undo.
    const stored = ['a', 'b'];
    const read = listOf(stored);

    read.push('c');

    assert.deepEqual(stored, ['a', 'b'], 'the stored array was written through');
    assert.notEqual(read, stored);
});

// --- adding ------------------------------------------------------------------------------

test('adding puts an element at the end, and leaves the original alone', () => {
    const stored = ['a'];
    const next = addItem(stored, 'b');

    assert.deepEqual(next, ['a', 'b']);
    assert.deepEqual(stored, ['a'], 'the original was mutated');
    assert.notEqual(next, stored);
});

test('a list with nothing in it is where a list starts', () => {
    assert.deepEqual(addItem(null, 'a'), ['a']);
    assert.deepEqual(addItem([], 'a'), ['a']);
});

test('an element with no value of its own is still an element', () => {
    // `null` is what a fresh reference or an unset choice holds, and a row for it has to
    // exist or a creator cannot fill it in.
    assert.deepEqual(addItem([], null), [null]);
    assert.equal(addItem(['a']).length, 2);
});

// --- removing ----------------------------------------------------------------------------

test('removing drops the element at that position, and only that one', () => {
    const stored = ['a', 'b', 'c'];

    assert.deepEqual(removeItem(stored, 1), ['a', 'c']);
    assert.deepEqual(stored, ['a', 'b', 'c'], 'the original was mutated');
});

test('removing the last element leaves an empty list, not a broken one', () => {
    assert.deepEqual(removeItem(['a'], 0), []);
    assert.deepEqual(removeItem([], 0), []);
});

test('removing a position the list does not have changes nothing', () => {
    // `splice(-1)` is a real answer to a nonsense question, and it is the wrong one: it
    // would drop the LAST element when asked about an element that is not there.
    const stored = ['a', 'b'];

    for (const index of [-1, 2, 99, 1.5, NaN, null, undefined]) {
        assert.deepEqual(removeItem(stored, index), ['a', 'b'], `index ${index}`);
    }
});

test('two elements holding one value are two elements', () => {
    // AN ELEMENT IS ITS POSITION, NEVER ITS VALUE. Nothing here looks a value up to decide
    // what to act on, so a list of three zeroes has three rows and removing one leaves two.
    assert.deepEqual(removeItem(['x', 'x', 'x'], 1), ['x', 'x']);
    assert.deepEqual(removeItem([0, 0], 0), [0]);
});

// --- moving ------------------------------------------------------------------------------

test('moving an element reorders the list, and undoes by moving it back', () => {
    const stored = ['a', 'b', 'c'];
    const moved = moveItem(stored, 1, 0);

    assert.deepEqual(moved, ['b', 'a', 'c']);
    assert.deepEqual(moveItem(moved, 0, 1), ['a', 'b', 'c'], 'the move is reversible');
    assert.deepEqual(stored, ['a', 'b', 'c'], 'the original was mutated');
});

test('a move counts its destination in the resulting order', () => {
    // The rank a move lands at is counted in the list AFTER the carried element has left —
    // the rule `previewOrder()` sets for every list in this Editor (dnd/reflow.js).
    assert.deepEqual(moveItem(['a', 'b', 'c'], 0, 2), ['b', 'c', 'a']);
    assert.deepEqual(moveItem(['a', 'b', 'c'], 2, 0), ['c', 'a', 'b']);
});

test('a move that lands where it started changes nothing', () => {
    assert.deepEqual(moveItem(['a', 'b'], 1, 1), ['a', 'b']);
});

test('a move naming a position the list does not have changes nothing', () => {
    for (const [from, to] of [[-1, 0], [0, 5], [3, 0], [0, -2]]) {
        assert.deepEqual(moveItem(['a', 'b'], from, to), ['a', 'b'], `${from} → ${to}`);
    }
});

test('elements holding the same value still move by position', () => {
    // The one case a value-keyed list gets wrong: the first `x` moves, not "an x".
    assert.deepEqual(moveItem(['x', 'y', 'x'], 0, 2), ['y', 'x', 'x']);
    assert.deepEqual(moveItem(['x', 'x'], 0, 1), ['x', 'x']);
});

// --- editing one element -----------------------------------------------------------------

test('writing one element leaves every other one exactly as it was', () => {
    const stored = ['a', 'b', 'c'];
    const next = setItem(stored, 1, 'B');

    assert.deepEqual(next, ['a', 'B', 'c']);
    assert.deepEqual(stored, ['a', 'b', 'c'], 'the original was mutated');
});

test('writing a position the list does not have changes nothing', () => {
    assert.deepEqual(setItem(['a'], 3, 'z'), ['a']);
    assert.deepEqual(setItem([], 0, 'z'), []);
});

test('writing one of two identical elements moves only that one', () => {
    assert.deepEqual(setItem(['x', 'x'], 0, 'y'), ['y', 'x']);
    assert.deepEqual(setItem(['x', 'x'], 1, 'y'), ['x', 'y']);
});

test('an element may be written to nothing', () => {
    assert.deepEqual(setItem(['a'], 0, null), [null]);
});

// --- the control each element is edited with ----------------------------------------------

test('an element is edited by the control its own type asks for', () => {
    // ONE MAPPING, THE EXISTING ONE (ADR-0023). A list of anything the Editor can already
    // edit becomes editable without a line written for that shape.
    assert.equal(itemFieldFor({ type: PropertyType.STRING }).kind, FieldKind.STRING);
    assert.equal(itemFieldFor({ type: PropertyType.NUMBER }).kind, FieldKind.NUMBER);
    assert.equal(itemFieldFor({ type: PropertyType.INT }).kind, FieldKind.INT);
    assert.equal(itemFieldFor({ type: PropertyType.BOOLEAN }).kind, FieldKind.BOOLEAN);
    assert.equal(itemFieldFor({ type: PropertyType.COLOR }).kind, FieldKind.COLOR);
    assert.equal(itemFieldFor({ type: PropertyType.OBJECTREF }).kind, FieldKind.OBJECT);
});

test('an element is a DECLARATION, so it brings its bounds and its unit with it', () => {
    // The reason this takes a record and not a type name: a bounded list is a list of
    // sliders, and the bound is said the way a property says it (ADR-0007).
    const descriptor = itemFieldFor({ type: PropertyType.NUMBER, min: 0, max: 1, unit: 'rad' });

    assert.equal(descriptor.kind, FieldKind.RANGE, 'bounded at both ends is a proportion');
    assert.equal(descriptor.min, 0);
    assert.equal(descriptor.unit, '°', 'the display unit is derived where it always is');
});

test('a choice element offers what its declaration offers', () => {
    const descriptor = itemFieldFor({ type: PropertyType.ENUM, values: ['up', 'down'] });

    assert.equal(descriptor.kind, FieldKind.ENUM);
    assert.deepEqual(descriptor.values, ['up', 'down']);
});

test('an element that declares nothing has no shape, and reads as read-only', () => {
    // What a list with no declared element must fall back to: what it already was.
    assert.equal(itemFieldFor(null).kind, FieldKind.READONLY);
    assert.equal(itemFieldFor(undefined).kind, FieldKind.READONLY);
    assert.equal(itemFieldFor({}).kind, FieldKind.READONLY);
});

test('every element is bound under one agreed key, and draws no label of its own', () => {
    // A row of a list is named by where it is; printing "Value" on each is the same word
    // repeated down a narrow panel.
    const descriptor = itemFieldFor({ type: PropertyType.STRING });

    assert.equal(descriptor.name, ITEM_KEY);
    assert.equal(descriptor.label, '');
});

test('an element declaration is never written through by the descriptor built from it', () => {
    const declared = { type: PropertyType.ENUM, values: ['up'] };
    const descriptor = itemFieldFor(declared);

    descriptor.values.push('down');

    assert.deepEqual(declared.values, ['up'], 'the declaration was written through');
});

// --- the whole chain, on the first property that declares an element ---------------------
//
//   Tilemap.palette → describeComponent → FieldKind.LIST → the list operations →
//   setProperty → the value the component now holds
//
// `<px-list>` is the one link asserted by inspection rather than by test: it needs a DOM,
// and this repository has no harness for one. Everything on either side of it is here.

/** A Tilemap attached to an object, so writes travel the pipeline they really travel. */
function painted(palette = []) {
    const scene = new Scene('Main');
    const object = scene.add(new SceneObject('Ground'));
    const tilemap = object.addComponent(new Tilemap(16, 2, 1, [1, 2], palette));

    return {
        scene,
        tilemap,
        descriptor: describeComponent(tilemap).find(entry => entry.name === 'palette'),
        /** What `<px-list>` does on every gesture: one new array, through the one writer. */
        commit: next => tilemap.setProperty('palette', next)
    };
}

test('the palette of a Tilemap is a list, and its elements are colours', () => {
    // THE FIRST REAL CONSUMER. `tiles` is a grid flattened into an array and stays read-only;
    // a palette has always been a short ordered list of colours, and now says so.
    const it = painted(['#000000', '#ff0000']);

    assert.equal(it.descriptor.kind, FieldKind.LIST);
    assert.equal(it.descriptor.element.type, PropertyType.COLOR);
    assert.equal(itemFieldFor(it.descriptor.element).kind, FieldKind.COLOR,
        'every row is drawn with the swatch a colour is drawn with');
});

test('a list that holds something shows what it holds', () => {
    const it = painted(['#000000', '#ff0000', '#00ff00']);

    assert.deepEqual(listOf(it.tilemap.palette), ['#000000', '#ff0000', '#00ff00']);
});

test('adding a colour lands at the end, and starts where its swatch already reads', () => {
    const it = painted(['#000000']);

    it.commit(addItem(it.tilemap.palette, itemFieldFor(it.descriptor.element).default));

    assert.deepEqual(it.tilemap.palette, ['#000000', '#000000']);
});

test('removing a colour drops that one, and the rest keep their indices in order', () => {
    // A palette is indexed BY TILE VALUE, so the order is the meaning: removing entry 1
    // shifts what every later tile draws, and that is the creator's business, not a bug.
    const it = painted(['#000000', '#ff0000', '#00ff00']);

    it.commit(removeItem(it.tilemap.palette, 1));

    assert.deepEqual(it.tilemap.palette, ['#000000', '#00ff00']);
});

test('moving a colour reorders the palette, and moving it back restores it', () => {
    const it = painted(['#000000', '#ff0000', '#00ff00']);

    it.commit(moveItem(it.tilemap.palette, 2, 1));
    assert.deepEqual(it.tilemap.palette, ['#000000', '#00ff00', '#ff0000']);

    it.commit(moveItem(it.tilemap.palette, 1, 2));
    assert.deepEqual(it.tilemap.palette, ['#000000', '#ff0000', '#00ff00']);
});

test('editing one colour changes that one and leaves the others untouched', () => {
    const it = painted(['#000000', '#ff0000', '#00ff00']);

    it.commit(setItem(it.tilemap.palette, 1, '#0000ff'));

    assert.deepEqual(it.tilemap.palette, ['#000000', '#0000ff', '#00ff00']);
});

test('two entries holding one colour stay two entries', () => {
    // The case a value-keyed list gets wrong. A palette may legitimately repeat a colour.
    const it = painted(['#ff0000', '#ff0000', '#00ff00']);

    it.commit(setItem(it.tilemap.palette, 0, '#0000ff'));
    assert.deepEqual(it.tilemap.palette, ['#0000ff', '#ff0000', '#00ff00']);

    it.commit(removeItem(it.tilemap.palette, 1));
    assert.deepEqual(it.tilemap.palette, ['#0000ff', '#00ff00']);
});

test('every edit is an Operation, so the palette undoes like any other property', () => {
    // The list writes a NEW array through `setProperty()` — the controlled path — so it
    // produces a Change and an Operation without a second mechanism (ADR-0008, ADR-0024).
    const it = painted(['#000000']);
    const seen = [];
    it.scene.operations.on('operation', operation => seen.push(operation));

    it.commit(addItem(it.tilemap.palette, '#ff0000'));

    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'SET_PROPERTY');
    assert.equal(seen[0].prop, 'palette');
    assert.deepEqual(seen[0].value, ['#000000', '#ff0000']);
    assert.deepEqual(seen[0].previous, ['#000000'], 'and it carries what to go back to');
});

test('the stored palette is never the array a control is holding', () => {
    const it = painted(['#000000']);
    const held = listOf(it.tilemap.palette);

    held.push('#ff0000');

    assert.deepEqual(it.tilemap.palette, ['#000000'], 'the component was written through');
});

test('the grid beside it is untouched, and still read-only', () => {
    const it = painted();
    const tiles = describeComponent(it.tilemap).find(entry => entry.name === 'tiles');

    assert.equal(tiles.kind, FieldKind.READONLY);
    assert.equal(tiles.element, null);
    assert.deepEqual(it.tilemap.tiles, [1, 2], 'and it still holds what it held');
});

test('a list declared read-only keeps its flag, whatever its elements say', () => {
    class Locked {
        static type = 'Locked';
        static schema = {
            swatches: { type: PropertyType.ARRAY, element: { type: PropertyType.COLOR }, readonly: true, default: [] }
        };
        constructor() { this.swatches = []; }
    }

    const descriptor = describeComponent(new Locked()).find(entry => entry.name === 'swatches');
    assert.equal(descriptor.readonly, true);
});
