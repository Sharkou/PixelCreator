// What colour a node wears, and the invariant that keeps the table honest.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ANY_TYPE,
    NodeRegistry,
    OBJECT_TYPE,
    PropertyType,
    NODE_CATEGORIES,
    portsOf,
    registerStandardNodes
} from '../../core/mod.js';
import { NODE_CATEGORY_ICONS } from '../ui/icons.js';
import { CATEGORY_HUES, FLOW_HUE, LITERAL_CATEGORY, TYPE_HUES, categoryHue, nodeHue, typeHue } from './palette.js';

const registry = registerStandardNodes(new NodeRegistry());

// --- the table has a row for everything that can ask it ----------------------------------

test('every category the catalogue declares has a colour of its own', () => {
    // THE DEFECT THIS IS WRITTEN AGAINST WAS SILENT. `Input` had no row, so `Key` and
    // `Pointer` took the `?? any` fallback — grey, a hair from the steel `Flow` wears — and
    // the only way to notice was to look at the canvas and wonder why an event node read as
    // a control-flow one. A category with no row is now a failing test.
    const declared = new Set(registry.definitions().map(definition => definition.category ?? 'Other'));

    for (const category of declared) {
        // `Values` IS THE ONE DELIBERATE ABSENCE. A literal wears the colour of what it
        // holds rather than of its family (ADR-0033 §4), so a row here would be a colour
        // nothing reads — which is checked below rather than assumed.
        if (category === LITERAL_CATEGORY) continue;
        assert.ok(category in CATEGORY_HUES, `${category} has no colour`);
    }

    assert.ok(!(LITERAL_CATEGORY in CATEGORY_HUES), 'a literal takes its type\'s colour, not a family one');
});

test('every category the menu lists has a colour and a glyph', () => {
    // ONE TAXONOMY, THREE READERS: the menu groups by it, the canvas takes a colour from it,
    // and the glyph comes from the same word. A category that fell out of step with any of
    // the three is a node a creator cannot classify by looking at it.
    for (const category of NODE_CATEGORIES) {
        if (category !== LITERAL_CATEGORY) {
            assert.ok(category in CATEGORY_HUES, `${category} has no colour`);
        }
        assert.ok(category in NODE_CATEGORY_ICONS, `${category} has no glyph`);
    }
});

test('every declared category is one the menu lists', () => {
    // The other direction: a node that invents a category is legal (`groupNodes` places it),
    // but nothing SHIPPED should, because a shipped category with no row above is a node
    // wearing the fallback colour.
    for (const definition of registry.definitions()) {
        assert.ok(NODE_CATEGORIES.includes(definition.category),
            `${definition.type} declares "${definition.category}", which the menu does not list`);
    }
});

// --- what the taxonomy says apart ---------------------------------------------------------

test('a reference and a property access are told apart by colour', () => {
    // ADR-0034 §3.2 puts an Object handle and a violet `object` port together on purpose;
    // what was wrong was that READING a property wore the same violet, so `Self` — which
    // hands over an Object — and `Get Property On` — which reads a value off one — were one
    // colour on a canvas whose whole job is to say what a node is.
    assert.equal(categoryHue('Object'), typeHue(OBJECT_TYPE), 'the Object family IS its port');
    assert.notEqual(categoryHue('Properties'), categoryHue('Object'));
});

test('the world arriving wears one colour, and it is not the colour of control flow', () => {
    assert.equal(categoryHue('Input'), categoryHue('Events'), 'a moment and a state are one family');
    assert.notEqual(categoryHue('Input'), categoryHue('Flow'), 'and neither is Branch');
});

test('a literal wears the colour of what it holds, not of its family', () => {
    // ADR-0033 §4: for a literal, what it IS is its type — the one place a node takes the
    // colour of its value. `Values` is deliberately absent from the category table.
    for (const [type, expected] of [['value.number', PropertyType.NUMBER],
        ['value.boolean', PropertyType.BOOLEAN], ['value.string', PropertyType.STRING]]) {
        const definition = registry.get(type);
        const ports = portsOf(definition, { type, params: {} }, {});

        assert.equal(definition.category, LITERAL_CATEGORY);
        assert.equal(nodeHue(definition, ports), TYPE_HUES[expected], type);
    }
});

test('a node that is not a literal wears its category, whatever it produces', () => {
    const definition = registry.get('compare.equal');
    const ports = portsOf(definition, { type: 'compare.equal', params: {} }, {});

    assert.equal(nodeHue(definition, ports), categoryHue('Compare'));
});

// --- what a wire wears --------------------------------------------------------------------

test('a port and the wire leaving it read the same colour', () => {
    // The renderer asks this once per port and once per wire; they must not be two answers.
    for (const type of [PropertyType.NUMBER, PropertyType.BOOLEAN, PropertyType.STRING, OBJECT_TYPE]) {
        assert.equal(typeHue(type), TYPE_HUES[type], type);
    }
    assert.equal(typeHue('array<number>'), TYPE_HUES[PropertyType.ARRAY], 'a list is a list');
    assert.equal(typeHue('nonsense'), TYPE_HUES[ANY_TYPE], 'and an unknown shape is unconstrained');
});

test('execution is not a value, so it has a colour of its own', () => {
    for (const hue of globalThis.Object.values(TYPE_HUES)) {
        assert.notEqual(hue, FLOW_HUE, 'no data type may wear the flow colour');
    }
});
