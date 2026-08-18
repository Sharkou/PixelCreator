// What the Inspector shows for a selected graph node (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { NodeRegistry, PropertyType, registerStandardNodes, GraphIssueCode, GraphSeverity } from '../../core/mod.js';
import { FieldKind } from './schema.js';
import { describeNode, paramFields } from './node.js';

const registry = registerStandardNodes(new NodeRegistry());

function node(type, params = {}) {
    return { id: 'n1', type, x: 0, y: 0, params };
}

const properties = [
    { id: 'p1', name: 'speed', type: PropertyType.NUMBER, default: 5 },
    { id: 'p2', name: 'alive', type: PropertyType.BOOLEAN, default: true }
];

test('nothing to inspect describes as nothing', () => {
    assert.equal(describeNode(null, { registry }), null);
});

test('a node reports its label, its category and its ports', () => {
    const description = describeNode(node('flow.branch'), { registry });

    assert.equal(description.title, 'Branch');
    assert.equal(description.category, 'Flow');
    assert.equal(description.known, true);
    assert.deepEqual(description.ports.inputs.map(port => port.id), ['in', 'condition']);
    assert.deepEqual(description.ports.outputs.map(port => port.id), ['true', 'false']);
});

test('a node with no params has no fields, and the panel shows its ports anyway', () => {
    const description = describeNode(node('event.start'), { registry });

    assert.deepEqual(description.fields, []);
    assert.equal(description.ports.outputs.length, 1);
});

test('a param is a field of the kind its declared type asks for', () => {
    const description = describeNode(node('value.number', { value: 3 }), { registry });

    assert.equal(description.fields.length, 1);
    assert.equal(description.fields[0].name, 'value');
    assert.equal(description.fields[0].kind, FieldKind.NUMBER);
});

test('a param that names a property becomes a choice of identities, labelled by name', () => {
    const description = describeNode(node('property.get', { property: 'p1' }), { registry, properties });

    const field = description.fields[0];

    assert.equal(field.kind, FieldKind.ENUM);
    assert.deepEqual(field.values, ['p1', 'p2']);
    assert.deepEqual(field.labels, ['speed', 'alive'], 'a creator picks a name, the graph stores an identity');
});

test('a property node takes the shape of the property it names', () => {
    const description = describeNode(node('property.set', { property: 'p2' }), { registry, properties });

    const value = description.ports.inputs.find(port => port.id === 'value');

    assert.equal(value.type, PropertyType.BOOLEAN);
    assert.equal(value.label, 'alive');
});

test('a Component with no properties offers an empty choice rather than a broken field', () => {
    const description = describeNode(node('property.get'), { registry, properties: [] });

    assert.deepEqual(description.fields[0].values, []);
    assert.equal(description.fields[0].kind, FieldKind.READONLY, 'a choice with nothing in it is not a dropdown');
});

test('only the findings about this node reach its panel', () => {
    const issues = [
        { code: GraphIssueCode.MISSING_PROPERTY, severity: GraphSeverity.ERROR, message: 'Gone.', node: 'n1' },
        { code: GraphIssueCode.MISSING_REFERENCE, severity: GraphSeverity.WARNING, message: 'Elsewhere.', node: 'n2' }
    ];

    const description = describeNode(node('property.get', { property: 'gone' }), { registry, issues });

    assert.equal(description.issues.length, 1);
    assert.equal(description.issues[0].message, 'Gone.');
});

test('a node whose type this build has never heard of still inspects, and says why', () => {
    const description = describeNode(node('magic.thing'), { registry });

    assert.equal(description.known, false);
    assert.equal(description.title, 'magic.thing');
    assert.deepEqual(description.fields, []);
    assert.match(description.tooltip, /no node type/);
});

test('param fields come out in declaration order, whatever the node', () => {
    const definition = {
        type: 'test.two',
        label: 'Two',
        params: {
            first: { type: PropertyType.STRING },
            second: { type: PropertyType.INT }
        }
    };

    assert.deepEqual(paramFields(definition).map(field => field.name), ['first', 'second']);
});
