// The live model of a `.px`: its user-declared properties, its graph, one pipeline
// (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType } from '../properties/types.js';
import { observe } from '../properties/reactive.js';
import { invert } from '../operations/invert.js';
import { defineComponent } from '../definition.js';
import { ComponentDefinition } from './definition.js';
import { NodeRegistry } from './nodes.js';
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
