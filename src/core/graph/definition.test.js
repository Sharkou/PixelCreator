// The live model of a `.px`: its user-declared properties, its graph, one pipeline
// (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType } from '../properties/types.js';
import { observe } from '../properties/reactive.js';
import { invert } from '../operations/invert.js';
import { defineComponent } from '../definition.js';
import { ComponentDefinition } from './definition.js';
import { NodeRegistry, PortDirection } from './nodes.js';
import { registerStandardNodes } from './standard.js';
import { GraphIssueCode } from './errors.js';

function definition(payload = {}) {
    return new ComponentDefinition(payload, { registry: registerStandardNodes(new NodeRegistry()) });
}

function record(model) {
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));
    return seen;
}

// --- declaring properties ------------------------------------------------------------------

test('a property is declared with an identity, a name, a type and a default', () => {
    const model = definition();

    const property = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 120 });

    assert.equal(typeof property.id, 'string');
    assert.equal(property.name, 'speed');
    assert.equal(property.type, PropertyType.NUMBER);
    assert.equal(property.default, 120);
    assert.equal(model.property(property.id), property);
    assert.equal(model.propertyNamed('speed'), property);
});

test('a property with no default starts at the type\'s own', () => {
    const model = definition();

    assert.equal(model.addProperty({ type: PropertyType.BOOLEAN }).default, false);
    assert.equal(model.addProperty({ type: PropertyType.STRING }).default, '');
    assert.equal(model.addProperty({ type: PropertyType.NUMBER }).default, 0);
});

test('a name already taken is made unique, because the schema is keyed by name', () => {
    const model = definition();

    model.addProperty({ name: 'speed' });
    const second = model.addProperty({ name: 'speed' });

    assert.equal(second.name, 'speed 2');
});

test('a property type the Core does not know is refused', () => {
    const model = definition();

    assert.throws(() => model.addProperty({ name: 'thing', type: 'object' }), TypeError);
});

test('declaring and undeclaring a property are one operation each, and invert', () => {
    const model = definition();
    const seen = record(model);

    const property = model.addProperty({ name: 'speed', default: 4 });
    assert.deepEqual(seen.map(operation => operation.type), ['ADD_PROPERTY']);

    model.operations.submit(invert(seen[0]));
    assert.equal(model.property(property.id), null);
});

test('a removed property comes back with its values and at its rank', () => {
    const model = definition();
    model.addProperty({ name: 'first' });
    const middle = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 42 });
    model.addProperty({ name: 'last' });

    const seen = record(model);
    assert.equal(model.removeProperty(middle.id), true);
    model.operations.submit(invert(seen[0]));

    assert.equal(model.indexOf(middle.id), 1);
    assert.equal(model.property(middle.id).default, 42, 'not a property reset to its defaults');
});

// --- editing properties --------------------------------------------------------------------

test('renaming keeps the identity, which is what keeps a graph wired', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });
    const node = model.graph.addNode({ type: 'property.get', params: { property: property.id } });

    assert.equal(model.renameProperty(property.id, 'walkSpeed'), true);

    assert.equal(model.property(property.id).name, 'walkSpeed');
    assert.equal(node.params.property, property.id, 'the node still names the same property');
    assert.deepEqual(model.validate(), []);
});

test('a rename is reactive, and undoes as an ordinary property write', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });

    const seen = [];
    observe(property, 'name', change => seen.push(change.value));
    const operations = record(model);

    model.renameProperty(property.id, 'walkSpeed');

    assert.deepEqual(seen, ['walkSpeed']);
    assert.equal(operations[0].type, 'SET_PROPERTY');

    model.operations.submit(invert(operations[0]));
    assert.equal(property.name, 'speed');
});

test('a rename to a name already taken, or to nothing, is refused', () => {
    const model = definition();
    model.addProperty({ name: 'speed' });
    const other = model.addProperty({ name: 'health' });

    assert.equal(model.renameProperty(other.id, 'speed'), false);
    assert.equal(model.renameProperty(other.id, '   '), false);
    assert.equal(other.name, 'health');
});

test('changing a type resets the default with it, as one history entry', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 120 });
    const seen = record(model);

    assert.equal(model.setPropertyType(property.id, PropertyType.BOOLEAN), true);

    assert.equal(property.type, PropertyType.BOOLEAN);
    assert.equal(property.default, false, 'a number default is not a legal boolean');
    assert.deepEqual(seen.map(operation => operation.type), ['SET_PROPERTY', 'SET_PROPERTY']);
    assert.equal(seen[0].batch, seen[1].batch);
});

test('a default value is edited, and the edit inverts', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed', default: 1 });
    const seen = record(model);

    assert.equal(model.setPropertyDefault(property.id, 9), true);
    assert.equal(property.default, 9);

    model.operations.submit(invert(seen[0]));
    assert.equal(property.default, 1);
});

test('the Component\'s displayed name is a field like any other', () => {
    const model = definition({ label: 'Controller' });
    const seen = record(model);

    assert.equal(model.setLabel('Walker'), true);
    assert.equal(model.label, 'Walker');

    model.operations.submit(invert(seen[0]));
    assert.equal(model.label, 'Controller');
});

// --- one pipeline for the whole `.px` ---------------------------------------------------------

test('a property edit and a graph edit travel the same pipeline', () => {
    const model = definition();
    const seen = record(model);

    model.addProperty({ name: 'speed' });
    model.graph.addNode({ type: 'event.update' });

    assert.deepEqual(seen.map(operation => operation.type), ['ADD_PROPERTY', 'ADD_NODE']);
    assert.equal(model.graph.operations, model.operations, 'one resource, one undo stack');
});

// --- serialization -----------------------------------------------------------------------------

test('the payload is exactly what defineComponent reads', () => {
    const model = definition({ type: 'res_c3', label: 'Controller' });
    const speed = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 120 });
    model.graph.addNode({ type: 'event.update', x: 40, y: 40 });

    const payload = model.serialize();

    assert.equal(payload.type, 'res_c3');
    assert.equal(payload.label, 'Controller');
    assert.equal(payload.properties.speed.type, PropertyType.NUMBER);
    assert.equal(payload.properties.speed.default, 120);
    assert.equal(payload.properties.speed.id, speed.id, 'identity travels inside the descriptor');
    assert.equal(payload.graph.nodes.length, 1);

    const Component = defineComponent(payload);
    assert.equal(new Component().speed, 120);
    assert.equal(Component.label, 'Controller');
});

test('a `.px` round-trips, identities included', () => {
    const model = definition({ type: 'res_c3', label: 'Controller' });
    const property = model.addProperty({ name: 'speed', default: 3 });
    const node = model.graph.addNode({ type: 'property.set', params: { property: property.id } });

    const restored = ComponentDefinition.deserialize(model.serialize(), {
        registry: registerStandardNodes(new NodeRegistry())
    });

    assert.deepEqual(restored.serialize(), model.serialize());
    assert.equal(restored.property(property.id).name, 'speed');
    assert.equal(restored.graph.node(node.id).params.property, property.id);
});

test('a definition read from a payload that never had identities gets them', () => {
    const model = definition({
        type: 'res_c3',
        properties: { speed: { type: PropertyType.NUMBER, default: 2 } }
    });

    const property = model.propertyNamed('speed');

    assert.equal(typeof property.id, 'string');
    assert.equal(property.default, 2);
});

// --- validation ----------------------------------------------------------------------------------

test('deleting a property leaves the node reported, never silently dangling', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });
    const node = model.graph.addNode({ type: 'property.get', params: { property: property.id } });

    assert.deepEqual(model.validate(), []);

    model.removeProperty(property.id);
    const issues = model.validate();

    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, GraphIssueCode.MISSING_PROPERTY);
    assert.equal(issues[0].node, node.id);
    assert.equal(issues[0].property, property.id);
});

test('undoing the deletion makes the graph valid again', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });
    model.graph.addNode({ type: 'property.get', params: { property: property.id } });

    const seen = record(model);
    model.removeProperty(property.id);
    model.operations.submit(invert(seen[0]));

    assert.deepEqual(model.validate(), []);
});

// --- reordering the schema (ADR-0028: a flat list, so the rank is the only question) ---

test('a property moves to another rank, and keeps its identity', () => {
    const model = definition();
    const a = model.addProperty({ name: 'a' });
    const b = model.addProperty({ name: 'b' });
    const c = model.addProperty({ name: 'c' });

    assert.equal(model.moveProperty(a.id, 2), true);
    assert.deepEqual(model.properties().map(property => property.name), ['b', 'c', 'a']);
    assert.equal(model.indexOf(a.id), 2);
    assert.ok(model.property(a.id), 'the identifier a node stores still resolves');
    assert.deepEqual([b.id, c.id].map(id => Boolean(model.property(id))), [true, true]);
});

test('moving a property upwards works the same way', () => {
    const model = definition();
    model.addProperty({ name: 'a' });
    model.addProperty({ name: 'b' });
    const c = model.addProperty({ name: 'c' });

    model.moveProperty(c.id, 0);
    assert.deepEqual(model.properties().map(property => property.name), ['c', 'a', 'b']);
});

test('a move is one history entry, made of two existing operations', () => {
    const model = definition();
    const a = model.addProperty({ name: 'a' });
    model.addProperty({ name: 'b' });

    const seen = record(model);
    model.moveProperty(a.id, 1);

    assert.deepEqual(seen.map(operation => operation.type), ['REMOVE_PROPERTY', 'ADD_PROPERTY']);
    assert.equal(seen[0].batch, seen[1].batch, 'one batch is one Ctrl Z (ADR-0024 §4)');
    assert.ok(seen[0].batch, 'and the batch is a real identifier');
});

test('inverting a move, in reverse, puts the property back', () => {
    const model = definition();
    const a = model.addProperty({ name: 'a' });
    model.addProperty({ name: 'b' });
    model.addProperty({ name: 'c' });

    const seen = record(model);
    model.moveProperty(a.id, 2);
    assert.deepEqual(model.properties().map(property => property.name), ['b', 'c', 'a']);

    // What History does with a batch: invert each operation, newest first.
    for (const operation of [...seen].reverse()) model.operations.submit(invert(operation));

    assert.deepEqual(model.properties().map(property => property.name), ['a', 'b', 'c']);
    assert.equal(model.property(a.id).name, 'a', 'and it is the same property, not a copy');
});

test('a move that changes nothing is refused rather than recorded', () => {
    const model = definition();
    const a = model.addProperty({ name: 'a' });
    model.addProperty({ name: 'b' });

    const seen = record(model);
    assert.equal(model.moveProperty(a.id, 0), false, 'to where it already is');
    assert.equal(model.moveProperty('nope', 1), false, 'a property nobody declared');
    assert.deepEqual(seen, []);
});

test('a rank beyond the ends lands at the nearest end', () => {
    const model = definition();
    const a = model.addProperty({ name: 'a' });
    model.addProperty({ name: 'b' });
    model.addProperty({ name: 'c' });

    model.moveProperty(a.id, 99);
    assert.deepEqual(model.properties().map(property => property.name), ['b', 'c', 'a']);

    model.moveProperty(a.id, -5);
    assert.deepEqual(model.properties().map(property => property.name), ['a', 'b', 'c']);
});

test('a reordered schema serializes in its new order', () => {
    const model = definition();
    const a = model.addProperty({ name: 'speed', type: PropertyType.NUMBER });
    model.addProperty({ name: 'jump', type: PropertyType.NUMBER });

    model.moveProperty(a.id, 1);
    assert.deepEqual(globalThis.Object.keys(model.serialize().properties), ['jump', 'speed']);
});

// --- declaring a Choice and a List (ADR-0031 §2, §3) -------------------------------------
//
// Both types take a PARAMETER — the options a Choice offers, the type a List is a list of —
// and until this tranche neither had anywhere to put one: the Type dropdown offered them and
// nothing could say what they held. Both live in the descriptor, so declaring one is an
// ordinary SET_PROPERTY that replicates, inverts and lands in the history like every other.

test('a Choice declares its options on its own descriptor', () => {
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });

    assert.equal(model.setPropertyOptions(property.id, ['calm', 'angry']), true);

    assert.deepEqual(property.values, ['calm', 'angry']);
    assert.equal(property.default, 'calm', 'the first option is what a fresh instance starts at');
});

test('a Choice keeps a default that is still an option, and follows one that is not', () => {
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(property.id, ['calm', 'angry', 'sad']);
    model.setPropertyDefault(property.id, 'angry');

    // Adding and reordering leave a legal default exactly where it is: editing the rest of
    // the list is free.
    model.setPropertyOptions(property.id, ['sad', 'angry', 'calm', 'bored']);
    assert.equal(property.default, 'angry');

    // Removing the one it defaulted to has to carry the default with it: a Choice whose
    // default is not among its options holds a value `isValidValue()` refuses (ADR-0031 §2).
    model.setPropertyOptions(property.id, ['sad', 'calm']);
    assert.equal(property.default, 'sad', 'the first option is the only candidate');
});

test('renaming an option is changing the value, and the default follows', () => {
    // An option has no identity of its own — it IS its value (ADR-0031 §2) — so there is no
    // rename to track, and the model says so by treating it as a removal and an addition.
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(property.id, ['calm', 'angry']);

    model.setPropertyOptions(property.id, ['serene', 'angry']);

    assert.equal(property.default, 'serene');
});

test('editing the options of a Choice is one history entry', () => {
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(property.id, ['calm']);

    const seen = record(model);
    model.setPropertyOptions(property.id, ['angry']);

    assert.equal(seen.length, 2, 'the options and the default it invalidated');
    assert.equal(seen[0].batch, seen[1].batch, 'one intent, one batch, one Ctrl Z (ADR-0024 §4)');
});

test('a List declares the type of its elements', () => {
    const model = definition();
    const property = model.addProperty({ name: 'waypoints', type: PropertyType.ARRAY });

    assert.equal(model.setPropertyElement(property.id, PropertyType.NUMBER), true);

    assert.equal(property.of, PropertyType.NUMBER);
    assert.deepEqual(property.default, [], 'a fresh list is empty, never null');
});

test('changing what a List holds empties its default, in one entry', () => {
    const model = definition();
    const property = model.addProperty({ name: 'waypoints', type: PropertyType.ARRAY });
    model.setPropertyElement(property.id, PropertyType.NUMBER);
    model.setPropertyDefault(property.id, [1, 2, 3]);

    const seen = record(model);
    model.setPropertyElement(property.id, PropertyType.COLOR);

    assert.deepEqual(property.default, [], 'numbers are not colours, and no control could draw them');
    assert.equal(seen[0].batch, seen[1].batch);
});

test('a List of Lists is refused where a creator would declare it', () => {
    // ADR-0031 §3 admits every PropertyType as an element except `array`.
    const model = definition();
    const property = model.addProperty({ name: 'grid', type: PropertyType.ARRAY });

    model.setPropertyElement(property.id, PropertyType.ARRAY);

    assert.equal(property.of, null, 'a structure is the question ADR-0023 leaves open');
});

test('only a List has an element type', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed', type: PropertyType.NUMBER });

    assert.equal(model.setPropertyElement(property.id, PropertyType.INT), false);
    assert.equal(property.of, undefined);
});

test('changing the type drops the configuration that belonged to the old one', () => {
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(property.id, ['calm', 'angry']);

    model.setPropertyType(property.id, PropertyType.ARRAY);

    assert.equal(property.values, undefined, 'a List does not offer options');
    model.setPropertyElement(property.id, PropertyType.NUMBER);

    model.setPropertyType(property.id, PropertyType.NUMBER);
    assert.equal(property.of, undefined, 'a Number is not a list of anything');

    // And the clause disappears from the payload rather than lingering as an empty one.
    const written = model.serialize().properties.mood;
    assert.equal('values' in written, false);
    assert.equal('of' in written, false);
});

// --- a Choice and a List survive the payload ---------------------------------------------

test('a declared Choice and List round trip through the `.px` payload', () => {
    const model = definition({ label: 'Controller' });
    const mood = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(mood.id, ['calm', 'angry']);
    const waypoints = model.addProperty({ name: 'waypoints', type: PropertyType.ARRAY });
    model.setPropertyElement(waypoints.id, PropertyType.NUMBER);
    model.setPropertyDefault(waypoints.id, [1, 2]);

    const payload = model.serialize();
    const reopened = ComponentDefinition.deserialize(payload, {
        registry: registerStandardNodes(new NodeRegistry())
    });

    assert.deepEqual(JSON.parse(JSON.stringify(payload)), payload, 'the payload is already JSON');
    assert.deepEqual(reopened.propertyNamed('mood').values, ['calm', 'angry']);
    assert.equal(reopened.propertyNamed('mood').default, 'calm');
    assert.equal(reopened.propertyNamed('waypoints').of, PropertyType.NUMBER);
    assert.deepEqual(reopened.propertyNamed('waypoints').default, [1, 2]);

    // The identity survives too, which is what keeps every node that reads them wired.
    assert.equal(reopened.propertyNamed('mood').id, mood.id);
});

test('a component built from the payload starts every instance at the declared default', () => {
    const model = definition({ label: 'Controller' });
    const mood = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(mood.id, ['calm', 'angry']);
    const tags = model.addProperty({ name: 'tags', type: PropertyType.ARRAY });
    model.setPropertyElement(tags.id, PropertyType.STRING);

    const Component = defineComponent(model.serialize());
    const first = new Component();
    const second = new Component();

    assert.equal(first.mood, 'calm');
    assert.deepEqual(first.tags, []);

    first.tags.push('a');
    assert.deepEqual(second.tags, [], 'two instances never share one container');
});

test('what a removed property carries is a copy, so editing it after cannot rewrite the undo', () => {
    // A descriptor can hold a container now, and a shallow snapshot would leave the very
    // array the live descriptor holds inside the operation payload.
    const model = definition();
    const property = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(property.id, ['calm', 'angry']);

    const seen = record(model);
    model.removeProperty(property.id);

    const carried = seen[0].property;
    assert.deepEqual(carried.values, ['calm', 'angry']);

    // Re-adding from the inverse puts back exactly what was taken away.
    const back = invert(seen[0]);
    model.operations.submit(back);
    assert.deepEqual(model.property(property.id).values, ['calm', 'angry']);
});

// --- Property → Graph, with a Choice and a List -------------------------------------------

test('a node pointed at a property is typed by that property, parameter included', () => {
    // This is what dropping a property onto the canvas produces: a `property.get` carrying
    // the property's IDENTITY and nothing else (ADR-0027, editor/dnd/rules.js). Everything
    // the port knows is derived from the declaration, so a Choice and a List need no case
    // of their own anywhere along that path.
    const model = definition();
    const mood = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(mood.id, ['calm', 'angry']);
    const tags = model.addProperty({ name: 'tags', type: PropertyType.ARRAY });
    model.setPropertyElement(tags.id, PropertyType.STRING);

    const readMood = model.graph.addNode({ type: 'property.get', params: { property: mood.id } });
    const readTags = model.graph.addNode({ type: 'property.get', params: { property: tags.id } });
    const writeMood = model.graph.addNode({ type: 'property.set', params: { property: mood.id } });

    assert.equal(model.graph.portOf(readMood, PortDirection.OUTPUT, 'value').type, 'enum<angry|calm>');
    assert.equal(model.graph.portOf(readTags, PortDirection.OUTPUT, 'value').type, 'array<string>');
    assert.equal(model.graph.portOf(writeMood, PortDirection.INPUT, 'value').type, 'enum<angry|calm>',
        'read and write agree, which is what lets a creator wire one into the other');
});

test('a node follows the property it names when the parameter changes under it', () => {
    // The declaration is the source; the port is derived on every read, so nothing caches a
    // type across an edit (core/graph/nodes.js).
    const model = definition();
    const mood = model.addProperty({ name: 'mood', type: PropertyType.ENUM });
    model.setPropertyOptions(mood.id, ['calm']);
    const read = model.graph.addNode({ type: 'property.get', params: { property: mood.id } });

    assert.equal(model.graph.portOf(read, PortDirection.OUTPUT, 'value').type, 'enum<calm>');

    model.setPropertyOptions(mood.id, ['calm', 'angry']);

    assert.equal(model.graph.portOf(read, PortDirection.OUTPUT, 'value').type, 'enum<angry|calm>');
});
