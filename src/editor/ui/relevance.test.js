import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, normalise, rank, score } from './relevance.js';

/** The standard node catalogue, as the picker feeds it in. */
const NODES = [
    { label: 'On Start', type: 'event.start', category: 'Events' },
    { label: 'On Update', type: 'event.update', category: 'Events' },
    { label: 'Get Property', type: 'property.get', category: 'Properties' },
    { label: 'Set Property', type: 'property.set', category: 'Properties' },
    { label: 'Branch', type: 'flow.branch', category: 'Flow' },
    { label: 'Sequence', type: 'flow.sequence', category: 'Flow' },
    { label: 'Number', type: 'value.number', category: 'Values', keywords: ['float', 'int'] },
    { label: 'Boolean', type: 'value.boolean', category: 'Values' },
    { label: 'Text', type: 'value.string', category: 'Values', keywords: ['string'] },
    { label: 'Add', type: 'math.add', category: 'Math' },
    { label: 'Subtract', type: 'math.subtract', category: 'Math' },
    { label: 'Multiply', type: 'math.multiply', category: 'Math' },
    { label: 'Divide', type: 'math.divide', category: 'Math' },
    { label: 'Greater Than', type: 'compare.greater', category: 'Compare' },
    { label: 'Less Than', type: 'compare.less', category: 'Compare' },
    { label: 'Equal', type: 'compare.equal', category: 'Compare' },
    { label: 'Not', type: 'logic.not', category: 'Logic' },
    { label: 'And', type: 'logic.and', category: 'Logic' },
    { label: 'Or', type: 'logic.or', category: 'Logic' },
    { label: 'Log', type: 'debug.log', category: 'Debug' }
];

const labels = query => rank(NODES, query).map(entry => entry.label);

test('an empty query keeps the catalogue in the order it declared itself', () => {
    assert.deepEqual(rank(NODES, ''), NODES);
    assert.deepEqual(rank(NODES, '   '), NODES);
});

test('typing a node name puts that node first', () => {
    assert.equal(labels('multiply')[0], 'Multiply');
    assert.equal(labels('branch')[0], 'Branch');
    assert.equal(labels('sequence')[0], 'Sequence');
});

test('typing a keyword finds the node it belongs to', () => {
    // "float" appears in no label, no type and no category — which is exactly why the
    // previous `label.includes()` filter answered nothing at all.
    assert.ok(labels('float').includes('Number'), 'float must reach the Number node');
    assert.ok(labels('string').includes('Text'), 'string must reach the Text node');
});

test('typing a category name gathers that category', () => {
    const found = labels('event');
    assert.ok(found.includes('On Start'));
    assert.ok(found.includes('On Update'));
});

test('typing a type fragment finds the node', () => {
    assert.ok(labels('property.set').includes('Set Property'));
    assert.ok(labels('math').includes('Add'));
});

test('a name match always beats a category match', () => {
    // `Not` is a Logic node; `Logic` is a category. Typing "not" must not be answered by
    // every node in the Logic group first.
    assert.equal(labels('not')[0], 'Not');
});

test('a whole-word match beats the same letters buried in a word', () => {
    const entries = [
        { label: 'Untethered' },
        { label: 'The Rest' }
    ];
    assert.deepEqual(rank(entries, 'the').map(e => e.label), ['The Rest', 'Untethered']);
});

test('the shorter of two equally good answers comes first', () => {
    const entries = [{ label: 'Add Component Instance' }, { label: 'Add' }];
    assert.deepEqual(rank(entries, 'add').map(e => e.label), ['Add', 'Add Component Instance']);
});

test('a subsequence answers when nothing better does, and never before it', () => {
    assert.ok(labels('mlt').includes('Multiply'), 'initials still find the node');

    // `sub` is literally in Subtract, so Subtract must come before anything that only
    // contains s, u and b scattered about.
    assert.equal(labels('sub')[0], 'Subtract');
});

test('a query nothing answers returns nothing', () => {
    assert.deepEqual(labels('zzzz'), []);
    assert.equal(score({ label: 'Add' }, 'zzzz'), 0);
});

test('a camel hump is a word break', () => {
    assert.equal(normalise('setProperty'), 'set property');
    assert.equal(normalise('  On Start '), 'on start');
    assert.equal(normalise(null), '');

    const entries = [{ label: 'setProperty' }];
    assert.ok(score(entries[0], 'property') >= score(entries[0], 'roper'),
        'a word start scores at least as well as a fragment inside the word');
});

test('an exact label outranks a prefix, which outranks anything inside', () => {
    const exact = score({ label: 'Add' }, 'add');
    const prefix = score({ label: 'Address' }, 'add');
    const inside = score({ label: 'Padding' }, 'add');

    assert.ok(exact > prefix, 'exact beats prefix');
    assert.ok(prefix > inside, 'prefix beats substring');
    assert.ok(inside > 0);
});

test('matches() answers the same question as a non-zero score', () => {
    assert.ok(matches({ label: 'Multiply' }, ''), 'an empty query matches everything');
    assert.ok(matches({ label: 'Multiply' }, 'mult'));
    assert.ok(!matches({ label: 'Multiply' }, 'zzzz'));
});

test('an entry with no fields at all scores nothing rather than throwing', () => {
    assert.equal(score({}, 'add'), 0);
    assert.equal(score(null, 'add'), 0);
    assert.deepEqual(rank([{}], 'add'), []);
});

test('a query may name the group and the row at once', () => {
    // THE QUERY A CREATOR WRITES WHEN THEY KNOW EXACTLY WHAT THEY WANT, and the one that
    // used to find nothing: `Transform` is the entry's CATEGORY and `Position X` is its
    // LABEL, and no single field holds both (ADR-0048 §1). It became the common case the
    // moment the Component field was removed and the group became half of a property's name.
    const rows = [
        { label: 'Position X', category: 'Transform' },
        { label: 'Position Y', category: 'Transform' },
        { label: 'Rotation', category: 'Transform' },
        { label: 'Value', category: 'Health' },
        { label: 'Color', category: 'Sprite' }
    ];

    assert.deepEqual(rank(rows, 'Transform Position X').map(row => row.label), ['Position X']);
    assert.deepEqual(rank(rows, 'Health Value').map(row => row.label), ['Value']);
    assert.deepEqual(rank(rows, 'sprite color').map(row => row.label), ['Color']);
});

test('every word has to be answered, so typing more narrows the list', () => {
    // AN AND, NOT AN OR. A filter that grew as you typed would be the opposite of a filter.
    const rows = [
        { label: 'Position X', category: 'Transform' },
        { label: 'Position Y', category: 'Transform' },
        { label: 'Speed', category: 'Health' }
    ];

    assert.equal(rank(rows, 'transform').length, 2);
    assert.equal(rank(rows, 'transform position').length, 2);
    assert.equal(rank(rows, 'transform position y').length, 1);
    assert.equal(rank(rows, 'transform speed').length, 0, 'a word nothing answers rules the entry out');
});

test('one word still ranks exactly as it always did', () => {
    // The whole query against one field is tried FIRST, so nothing about a single-word
    // search moved when the multi-word reading was added.
    const rows = [
        { label: 'Add', category: 'Math' },
        { label: 'Add Component', category: 'Object' }
    ];

    assert.deepEqual(rank(rows, 'add').map(row => row.label), ['Add', 'Add Component'],
        'the shorter label still wins on an equal match');
});
