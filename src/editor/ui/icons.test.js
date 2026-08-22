// The four families of glyph, and the promise that they stay apart (ADR-0026 §11).
//
// An icon set is the kind of thing that drifts silently: a table gains a row, a window
// borrows a drawing "for now", and six months later a `.px` in the Project panel wears the
// Add Component cube. These tests assert the distinctions rather than the drawings — what
// a glyph looks like is a design decision, that two different ideas do not share one is a
// contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ICON_FAMILIES, iconForComponent, iconForNode, iconForPropertyType, iconForResource, iconPaths, iconSize, IconSize } from './icons.js';
import { NODE_CATEGORIES, PropertyType, propertyTypes } from '../../core/mod.js';
import { ResourceKind } from '../../project/mod.js';

test('every resource kind has a glyph, and it is drawn', () => {
    for (const kind of globalThis.Object.values(ResourceKind)) {
        const name = iconForResource(kind);
        assert.ok(name, `${kind} has no glyph`);
        assert.ok(iconPaths(name).length > 0, `${name} is not drawn`);
    }
});

test('the prototype settles what a scene and a .px look like', () => {
    // `design/prototype.js`: `arena.scene` carries `layers`, `walk.px` carries `graph`,
    // and the Add Component menu lists "Behavior Graph" with the same `graph`.
    assert.equal(iconForResource(ResourceKind.SCENE), 'layers');
    assert.equal(iconForResource(ResourceKind.COMPONENT), 'graph');
    assert.equal(iconForResource(ResourceKind.GRAPH), 'graph');
});

test('a resource glyph is never a window glyph', () => {
    const windows = new globalThis.Set(globalThis.Object.values(ICON_FAMILIES.window));
    const shared = globalThis.Object.entries(ICON_FAMILIES.resource)
        .filter(([, glyph]) => windows.has(glyph))
        .map(([kind]) => kind);

    // `folder` is the one deliberate sharing: the Project window IS a folder.
    assert.deepEqual(shared, ['folder'], 'a resource must not borrow a panel\'s glyph');
});

test('a .px resource and a Component instance are different ideas, drawn differently', () => {
    // One is a file a creator opens; the other is a capability an object has.
    assert.notEqual(iconForResource(ResourceKind.COMPONENT), iconForComponent(null, 'Whatever'));
});

test('a node is drawn by its category, never by the canvas it sits on', () => {
    const canvas = iconForResource(ResourceKind.GRAPH);

    for (const category of NODE_CATEGORIES) {
        const glyph = iconForNode(category);
        assert.ok(iconPaths(glyph).length > 0, `${category} is not drawn`);
        assert.notEqual(glyph, canvas, `${category} borrows the graph canvas's glyph`);
    }
});

test('two node categories never share a glyph', () => {
    // A category exists to say what KIND of node this is, so two of them drawn the same way
    // answer the question with a lie. The Scene nodes wore the `Values` brackets, which put
    // `Self` and `Number` under one drawing.
    const seen = new globalThis.Map();

    for (const category of NODE_CATEGORIES) {
        const glyph = iconForNode(category);
        assert.equal(seen.has(glyph), false, `${category} shares a glyph with ${seen.get(glyph)}`);
        seen.set(glyph, category);
    }
});

test('a node definition may declare its own glyph, and an unknown one still draws', () => {
    assert.equal(iconForNode({ category: 'Math' }), iconForNode('Math'));
    assert.equal(iconForNode({ category: 'Math', icon: 'sprite' }), 'sprite');
    assert.equal(iconForNode({ category: 'Math', icon: 'not-a-glyph' }), iconForNode('Math'),
        'a glyph nobody drew falls back rather than rendering nothing');
    assert.ok(iconPaths(iconForNode('Nonexistent Category')).length > 0);
});

test('every property type has its own glyph', () => {
    const seen = new globalThis.Map();

    for (const type of propertyTypes()) {
        const glyph = iconForPropertyType(type);
        assert.ok(iconPaths(glyph).length > 0, `${type} is not drawn`);
        assert.equal(seen.has(glyph), false,
            `${type} shares a glyph with ${seen.get(glyph)}`);
        seen.set(glyph, type);
    }
});

test('the Inspector\'s two resource sections do not share a glyph', () => {
    // "What it declares" and "what is true of it" are opposites; they read as the same
    // list when they wear the same drawing.
    assert.notEqual(iconPaths('properties'), iconPaths('info'));
    assert.notEqual(iconPaths('properties'), iconPaths('inspector'));
});

test('an icon exists at exactly two sizes', () => {
    assert.equal(iconSize(11), IconSize.SM);
    assert.equal(iconSize(16), IconSize.SM);
    assert.equal(iconSize(17), IconSize.SM);
    assert.equal(iconSize(18), IconSize.MD);
    assert.equal(iconSize(26), IconSize.MD);
});

test('a glyph nobody drew falls back rather than rendering nothing', () => {
    assert.equal(iconPaths('nope'), iconPaths('object'));
    assert.equal(iconForResource('nope'), 'component');
    assert.equal(iconForPropertyType(PropertyType.NUMBER), 'type-number');
});
