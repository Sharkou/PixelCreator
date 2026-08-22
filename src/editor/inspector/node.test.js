// What the Inspector shows for a selected graph node (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    NodeRegistry,
    OBJECT_TYPE,
    PropertyType,
    registerStandardNodes,
    GraphIssueCode,
    GraphSeverity,
    portsOf
} from '../../core/mod.js';
import { FieldKind } from './schema.js';
import { NOTHING_SELECTED, describeNode, inputFields, paramFields, paramWrites } from './node.js';

const registry = registerStandardNodes(new NodeRegistry());

function node(type, params = {}) {
    return { id: 'n1', type, x: 0, y: 0, params };
}

const properties = [
    { id: 'p1', name: 'speed', type: PropertyType.NUMBER, default: 5 },
    { id: 'p2', name: 'alive', type: PropertyType.BOOLEAN, default: true }
];

/** A project whose Component types a node may name (ADR-0034 3.3). */
const components = [
    {
        type: 'Transform',
        label: 'Transform',
        properties: [
            { id: 't1', name: 'x', type: PropertyType.NUMBER, default: 0 },
            { id: 't2', name: 'y', type: PropertyType.NUMBER, default: 0 }
        ]
    },
    {
        type: 'Health',
        label: 'Health',
        properties: [{ id: 'h1', name: 'hp', type: PropertyType.INT, default: 3 }]
    }
];

const fieldNamed = (description, name) => description.fields.find(entry => entry.name === name);

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

// --- the two pickers of a node that reaches another Object (ADR-0034 3.3) ----------------

test('a Component picker offers the project\'s types, labelled as a creator reads them', () => {
    const description = describeNode(node('property.getOn'), { registry, components });

    assert.equal(fieldNamed(description, 'component').kind, FieldKind.ENUM);
    assert.deepEqual(fieldNamed(description, 'component').values, ['Transform', 'Health']);
    assert.deepEqual(fieldNamed(description, 'component').labels, ['Transform', 'Health']);
});

test('the property picker offers the properties of the Component the node names, and no others', () => {
    const description = describeNode(node('property.getOn', { component: 'Health' }), { registry, components });

    assert.deepEqual(fieldNamed(description, 'property').values, ['h1']);
    assert.deepEqual(fieldNamed(description, 'property').labels, ['hp']);
});

test('changing the Component recomputes what the property picker offers', () => {
    const before = describeNode(node('property.setOn', { component: 'Transform' }), { registry, components });
    const after = describeNode(node('property.setOn', { component: 'Health' }), { registry, components });

    assert.deepEqual(before.fields.find(entry => entry.name === 'property').values, ['t1', 't2']);
    assert.deepEqual(after.fields.find(entry => entry.name === 'property').values, ['h1']);
});

test('a Component installed after the panel was drawn is offered, because the catalogue is asked again', () => {
    const later = [...components, { type: 'Patrol', label: 'Patrol', properties: [{ id: 'x1', name: 'speed', type: PropertyType.NUMBER }] }];

    assert.deepEqual(
        fieldNamed(describeNode(node('property.getOn'), { registry, components: later }), 'component').values,
        ['Transform', 'Health', 'Patrol']
    );
    assert.deepEqual(
        fieldNamed(describeNode(node('property.getOn', { component: 'Patrol' }), { registry, components: later }), 'property').values,
        ['x1']
    );
});

test('a property picker with no Component chosen says what to do first', () => {
    const description = describeNode(node('property.getOn'), { registry, components });
    const property = fieldNamed(description, 'property');

    assert.equal(property.kind, FieldKind.READONLY, 'a choice with nothing in it is not a dropdown');
    assert.match(property.placeholder, /Component/, 'and it says why there is nothing in it');
});

test('a picker with something to offer and nothing chosen reads as empty rather than as blank', () => {
    assert.equal(fieldNamed(describeNode(node('property.getOn'), { registry, components }), 'component').placeholder,
        NOTHING_SELECTED);
    assert.equal(describeNode(node('property.get'), { registry, properties }).fields[0].placeholder,
        NOTHING_SELECTED);
});

test('a Component with no properties says so, rather than showing an empty strip', () => {
    const empty = [{ type: 'Marker', label: 'Marker', properties: [] }];
    const description = describeNode(node('property.getOn', { component: 'Marker' }), { registry, components: empty });

    assert.equal(fieldNamed(description, 'property').kind, FieldKind.READONLY);
    assert.match(fieldNamed(description, 'property').placeholder, /no properties/i);
});

// --- what one param change amounts to ----------------------------------------------------

test('choosing another Component drops a property that Component does not declare', () => {
    const record = node('property.getOn', { component: 'Transform', property: 't1' });

    assert.deepEqual(paramWrites(registry.get('property.getOn'), record, 'component', 'Health', { components }), [
        { name: 'component', value: 'Health' },
        { name: 'property', value: null }
    ]);
});

test('a property the new Component still declares is kept', () => {
    const shared = [
        { type: 'A', label: 'A', properties: [{ id: 'shared', name: 'hp', type: PropertyType.INT }] },
        { type: 'B', label: 'B', properties: [{ id: 'shared', name: 'hp', type: PropertyType.INT }] }
    ];
    const record = node('property.setOn', { component: 'A', property: 'shared' });

    assert.deepEqual(
        paramWrites(registry.get('property.setOn'), record, 'component', 'B', { components: shared }),
        [{ name: 'component', value: 'B' }]
    );
});

test('a param that names nothing takes nothing with it', () => {
    const record = node('value.number', { value: 1 });

    assert.deepEqual(paramWrites(registry.get('value.number'), record, 'value', 2, {}),
        [{ name: 'value', value: 2 }]);
});

test('picking the property itself never disturbs the Component', () => {
    const record = node('property.getOn', { component: 'Transform', property: 't1' });

    assert.deepEqual(paramWrites(registry.get('property.getOn'), record, 'property', 't2', { components }),
        [{ name: 'property', value: 't2' }]);
});

test('a catalogue that cannot answer drops nothing', () => {
    // The rule validateGraph() already lives by: a reference that cannot be CHECKED is not
    // a reference that is wrong. A headless caller has no Component types at all.
    const record = node('property.getOn', { component: 'Transform', property: 't1' });

    assert.deepEqual(paramWrites(registry.get('property.getOn'), record, 'component', 'Health', {}),
        [{ name: 'component', value: 'Health' }]);
});

// --- which input ports a creator may type into --------------------------------------------

test('an object port gets no field, because there is nothing to type into it', () => {
    for (const type of ['scene.parent', 'object.isValid', 'property.getOn', 'property.setOn']) {
        const record = node(type);
        const ports = portsOf(registry.get(type), record, { properties, components });

        const objects = ports.inputs.filter(port => port.type === OBJECT_TYPE);
        assert.ok(objects.length > 0, `${type} has no object input to check`);

        const named = new globalThis.Set(inputFields(ports).map(entry => entry.port));
        for (const port of objects) {
            assert.equal(named.has(port.id), false, `${type} offers a box for ${port.id}`);
        }
    }
});

test('a flow port and an untyped port get no field either', () => {
    const ports = portsOf(registry.get('debug.log'), node('debug.log'), {});

    assert.deepEqual(inputFields(ports), [], 'a flow input and an `any` input have no shape to edit');
});

test('a value port gets a field of its own shape, carrying the port it edits', () => {
    const ports = portsOf(registry.get('flow.branch'), node('flow.branch'), {});
    const [condition] = inputFields(ports);

    assert.equal(condition.port, 'condition');
    assert.equal(condition.kind, FieldKind.BOOLEAN);
    assert.equal(condition.default, false);
});

test('Find By Tag takes its tag in the node, and says what leaving it empty means', () => {
    const ports = portsOf(registry.get('scene.findByTag'), node('scene.findByTag'), {});
    const [tag] = inputFields(ports);

    assert.equal(tag.port, 'tag');
    assert.equal(tag.kind, FieldKind.STRING, 'a creator types the tag where the node is');
    assert.ok(tag.placeholder, 'an empty tag finds nothing, so the empty box does not read as unfilled');
});

test('the Scene nodes all declare a sentence saying what they do', () => {
    for (const type of ['scene.self', 'scene.parent', 'scene.findByTag', 'object.isValid', 'property.getOn', 'property.setOn']) {
        assert.ok(describeNode(node(type), { registry, components }).tooltip, `${type} explains itself nowhere`);
    }
});

// --- what a configured node reads as (ADR-0037) ------------------------------------------

test('a node that names nothing reads as its type; one that names something says what it does', () => {
    const bare = describeNode(node('property.getOn'), { registry, components });
    assert.equal(bare.title, 'Get Property On', 'half a name is less readable than the type');

    // A COMPONENT CHOSEN AND NO PROPERTY IS ITS OWN STATE, and the title says exactly that:
    // the half that would follow the dot is the half that is missing.
    const half = describeNode(node('property.getOn', { component: 'Transform' }), { registry, components });
    assert.equal(half.title, 'Get Transform');

    const named = describeNode(node('property.getOn', { component: 'Transform', property: 't1' }),
        { registry, components });
    assert.equal(named.title, 'Get Transform.x');

    const written = describeNode(node('property.setOn', { component: 'Health', property: 'h1' }),
        { registry, components });
    assert.equal(written.title, 'Set Health.hp', 'Get and Set stay told apart by the node type');
});

test('a node reading the Component own property is titled by what it reads', () => {
    assert.equal(describeNode(node('property.get', { property: 'p1' }), { registry, properties }).title,
        'Get speed');
    assert.equal(describeNode(node('property.set', { property: 'p1' }), { registry, properties }).title,
        'Set speed');
});

test('an Object socket reads as the thing itself, because that is what it is', () => {
    // ADR-0037: an `objectref` property IS the reference, so the node a drop declares reads
    // `Player` rather than `Get Player`. Every other shape is a value the node READS.
    const sockets = [{ id: 'p9', name: 'Player', type: PropertyType.OBJECTREF, default: null }];

    assert.equal(describeNode(node('property.get', { property: 'p9' }), { registry, properties: sockets }).title,
        'Player');
});

test('a node whose reference cannot be resolved keeps its type label', () => {
    assert.equal(describeNode(node('property.get', { property: 'gone' }), { registry, properties }).title,
        'Get Property');
    // A Component this project does not declare resolves to nothing, so nothing is claimed.
    assert.equal(describeNode(node('property.getOn', { component: 'Nope', property: 'x' }),
        { registry, components }).title, 'Get Property On');
    assert.equal(describeNode(node('property.setOn', {}), { registry, components }).title,
        'Set Property On');
});
