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
import { CHOOSE_PROPERTY, NOTHING_SELECTED, PATH_ARROW, describeNode, inputFields, joinPath, paramFields, paramWrites, splitPath } from './node.js';

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
    const field = fieldNamed(description, 'property');

    assert.equal(field.kind, FieldKind.ENUM);
    assert.deepEqual(field.values.map(splitPath).map(pair => pair.property), ['p1', 'p2']);
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
    const picker = fieldNamed(description, 'property');

    assert.deepEqual(picker.values, []);
    assert.equal(picker.kind, FieldKind.READONLY, 'a choice with nothing in it is not a dropdown');
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

// --- ONE PICKER FOR "WHICH PROPERTY" (ADR-0040 §2) ---------------------------------------
//
// A creator wants "the Player's rotation". They used to meet `Component [ Transform ]` above
// `Property [ Rotation ]` and had to know that rotation belongs to a Component before they
// could read a number. `Component` is an abstraction of the engine; standing between someone
// and their intention is not what it is for. The groups ARE the Components now — the idea is
// still visible, as structure rather than as a question.

test('the property picker offers every property, grouped by the Component that declares it', () => {
    const description = describeNode(node('property.get'), { registry, properties, components });
    const picker = fieldNamed(description, 'property');

    assert.equal(picker.kind, FieldKind.ENUM);
    assert.deepEqual(picker.labels, ['speed', 'alive', 'x', 'y', 'hp']);
    assert.deepEqual(picker.groups,
        ['This Component', 'This Component', 'Transform', 'Transform', 'Health']);
});

test('this Component comes first, because its own fields are what a graph reaches for most', () => {
    const picker = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');

    assert.equal(picker.groups[0], 'This Component');
    assert.deepEqual(picker.values.slice(0, 2).map(splitPath), [
        { component: null, property: 'p1' },
        { component: null, property: 'p2' }
    ]);
});

test('a value carries both identities, and the Component half is what the Core stores', () => {
    const picker = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');
    const health = picker.values[picker.labels.indexOf('hp')];

    assert.deepEqual(splitPath(health), { component: 'Health', property: 'h1' });
});

test('the picker shows the pair the node holds, not the half filed under its own name', () => {
    // A node holding `Health` + `h1` has to find itself in a list keyed by both, or it would
    // read as nothing chosen.
    const picker = fieldNamed(
        describeNode(node('property.get', { component: 'Health', property: 'h1' }), { registry, properties, components }),
        'property'
    );

    assert.equal(picker.held, joinPath('Health', 'h1'));
    assert.ok(picker.values.includes(picker.held), 'and that value is one the list offers');
});

test('the closed control says which Component, because the list heading is gone', () => {
    // TWO COMPONENTS DECLARING `speed` ARE ONE WORD APART. In the list a heading answers
    // which is which; on the node there is no heading, and `speed` alone was ambiguous the
    // moment a project had two of them (ADR-0041 §2).
    const description = describeNode(node('property.get'), { registry, properties, components });
    const picker = fieldNamed(description, 'property');

    const own = picker.values.indexOf(joinPath(null, 'p1'));
    const other = picker.values.indexOf(joinPath('Transform', 't1'));

    assert.equal(picker.labels[other], 'x', 'the LIST keeps the short name, under its heading');
    assert.equal(picker.paths[other], `Transform ${PATH_ARROW} x`, 'the ANSWER carries the path');
    assert.equal(picker.paths[own], 'speed', 'your own fields get no prefix: there is only one');
    assert.equal(picker.paths[other].includes('.'), false, 'and it is never a dot: that is code');
});

test('a Component is never a question of its own', () => {
    // It is still STORED — the Core needs to know which type declares the property — but it
    // is written by the picker and never shown as a control (ADR-0040 §2).
    const description = describeNode(node('property.get'), { registry, properties, components });

    assert.equal(description.fields.some(field => field.name === 'component'), false);
    assert.deepEqual(description.fields.map(field => field.name), ['target', 'property']);
});

test('a Component installed after the panel was drawn is offered, because the catalogue is asked again', () => {
    const later = [...components, { type: 'Patrol', label: 'Patrol', properties: [{ id: 'x1', name: 'speed', type: PropertyType.NUMBER }] }];
    const picker = fieldNamed(describeNode(node('property.get'), { registry, components: later }), 'property');

    assert.ok(picker.groups.includes('Patrol'));
    assert.ok(picker.values.includes(joinPath('Patrol', 'x1')));
});

test('nothing to choose from is a read-only row, never an empty dropdown', () => {
    const description = describeNode(node('property.get'), { registry, properties: [], components: [] });
    const picker = fieldNamed(description, 'property');

    assert.equal(picker.kind, FieldKind.READONLY);
    assert.match(picker.placeholder, /no properties/i);
});

test('a picker with nothing chosen holds the empty string a field understands', () => {
    // `joinPath(null, '')` is a NUL — a value no option carries — so the control drew an
    // invisible character where its placeholder belonged, and the row came out blank.
    const picker = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');

    assert.equal(picker.held, '');
    assert.equal(picker.values.includes(picker.held), false, 'and it is not one of the choices');
});

test('a property picker with nothing chosen says what it is for, not just that it is empty', () => {
    // IT STANDS IN FOR ITS OWN LABEL. On a node the compound picker takes the whole row so
    // the path has room (ADR-0041 §2), so `None` would be a dropdown naming neither the
    // question nor the answer.
    assert.equal(
        fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property').placeholder,
        CHOOSE_PROPERTY
    );
});

test('a picker that is not compound still reads as plainly empty', () => {
    // `None` is right exactly where a label beside the control already asks the question:
    // the Key picker keeps its `Key` label, so the control only has to say "not chosen".
    const key = fieldNamed(describeNode(node('input.key'), { registry, properties }), 'key');

    assert.equal(key.placeholder, NOTHING_SELECTED);
});

// --- what one param change amounts to ----------------------------------------------------

test('picking a property writes both identities, and only those', () => {
    // ONE CONTROL, TWO PARAMS. The interface asks one question; the Core stores the pair it
    // has always stored, so nothing on disk changes.
    const record = node('property.get', { component: 'Transform', property: 't1' });

    assert.deepEqual(
        paramWrites(registry.get('property.get'), record, 'property', joinPath('Health', 'h1'), { components }),
        [{ name: 'component', value: 'Health' }, { name: 'property', value: 'h1' }]
    );
});

test('picking one of this Component\'s own fields clears the Component half', () => {
    // `component` absent MEANS this Component (core/graph/standard.js). Leaving a stale type
    // behind would aim the node at someone else's property of the same id.
    const record = node('property.set', { component: 'Health', property: 'h1' });

    assert.deepEqual(
        paramWrites(registry.get('property.set'), record, 'property', joinPath(null, 'p1'), { properties, components }),
        [{ name: 'component', value: null }, { name: 'property', value: 'p1' }]
    );
});

test('a param that names nothing takes nothing with it', () => {
    const record = node('value.number', { value: 1 });

    assert.deepEqual(paramWrites(registry.get('value.number'), record, 'value', 2, {}),
        [{ name: 'value', value: 2 }]);
});

// --- which input ports a creator may type into --------------------------------------------

test('an object port gets no field, because there is nothing to type into it', () => {
    for (const type of ['scene.parent', 'object.isValid', 'property.get', 'property.set']) {
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
    for (const type of ['scene.self', 'scene.parent', 'scene.findByTag', 'object.isValid', 'property.get', 'property.set']) {
        assert.ok(describeNode(node(type), { registry, components }).tooltip, `${type} explains itself nowhere`);
    }
});

// --- a node is named for what it IS, never for what it holds (ADR-0039 §5) ---------------

test('a target nobody has chosen reads as Self, not as nothing', () => {
    // THE COMMONEST STATE ON THE CANVAS, and it used to read `None`. A property node with no
    // Object named acts on the Object its Component is attached to, so `None` said the
    // opposite of what the node does (ADR-0040 §3).
    const sockets = [{ id: 'p9', name: 'Player', type: PropertyType.OBJECTREF, default: null }];

    const alone = fieldNamed(describeNode(node('property.get'), { registry, properties }), 'target');
    const offered = fieldNamed(describeNode(node('property.get'), { registry, properties: sockets }), 'target');

    assert.equal(alone.placeholder, 'Self', 'nothing to choose from, and it still acts on itself');
    assert.equal(offered.placeholder, 'Self', 'something to choose, nothing chosen: still itself');
    assert.deepEqual(offered.values, ['p9'], 'and the Objects this .px declares are the choices');
});

test('Get Object with nothing chosen does not read as Self, because it is not', () => {
    // THE SAME REFERENCE KIND, THE OPPOSITE FALLBACK. `Set Property`'s target answers the
    // Object the Component is attached to; `Get Object` answers NOTHING. Both used the
    // `object-socket` kind, and the kind said `Self` for both — so a node that hands out
    // null wore the name of the node that hands out itself, and a creator who had declared
    // no Object read a card that looked finished.
    const sockets = [{ id: 'p9', name: 'Player', type: PropertyType.OBJECTREF, default: null }];

    const alone = fieldNamed(describeNode(node('reference.object'), { registry, properties }), 'object');
    const offered = fieldNamed(describeNode(node('reference.object'), { registry, properties: sockets }), 'object');

    assert.equal(alone.placeholder, NOTHING_SELECTED, 'no socket declared: nothing to hand on');
    assert.equal(offered.placeholder, NOTHING_SELECTED, 'sockets declared, none chosen: still nothing');
    assert.deepEqual(offered.values, ['p9'], 'and the Objects this .px declares are the choices');
});

test('a node reads as its type, whatever it has been pointed at', () => {
    // `Get Ground`, `Set Sprite.height`, `Middle Button` — every one of those put a VALUE
    // where the type's name belongs, so the same node had a different name in every graph
    // and no tutorial could name it. The configuration is drawn inside the node instead.
    const bare = describeNode(node('property.get'), { registry, components });
    const named = describeNode(node('property.get', { component: 'Transform', property: 't1' }),
        { registry, components });

    assert.equal(bare.title, 'Get Property');
    assert.equal(named.title, 'Get Property', 'configuring it changed nothing about its name');
});

test('an Object socket read is its own node, and that node has a stable name', () => {
    const sockets = [{ id: 'p9', name: 'Player', type: PropertyType.OBJECTREF, default: null }];
    const described = describeNode(node('reference.object', { object: 'p9' }), { registry, properties: sockets });

    assert.equal(described.title, 'Get Object');
    assert.equal(described.category, 'References');
});

test('a node whose reference cannot be resolved keeps its type label', () => {
    assert.equal(describeNode(node('property.get', { property: 'gone' }), { registry, properties }).title,
        'Get Property');
    // A Component this project does not declare resolves to nothing, so nothing is claimed.
    assert.equal(describeNode(node('property.get', { component: 'Nope', property: 'x' }),
        { registry, components }).title, 'Get Property');
    assert.equal(describeNode(node('property.set', {}), { registry, components }).title,
        'Set Property');
});

// --- a port carries a type, and a control needs a declaration -----------------------------

test('a parameterised port reaches the control mapping as the type it is a parameterisation of', () => {
    // `array<number>` says a list of numbers travels here; what a port does not carry is the
    // element's bounds or a Choice's options, which are what those two controls need — they
    // live on the property, and a port is not one. So both land on the read-only row by the
    // rule ADR-0031 §2 and §3 state, rather than by falling through an unknown name.
    const declared = [
        { id: 'p_mood', name: 'mood', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'calm' },
        { id: 'p_tags', name: 'tags', type: PropertyType.ARRAY, of: PropertyType.STRING, default: [] }
    ];

    for (const property of declared) {
        const ports = portsOf(registry.get('property.set'),
            node('property.set', { property: property.id }), { properties: declared });
        const [value] = inputFields(ports);

        assert.equal(value.port, 'value');
        assert.equal(value.kind, FieldKind.READONLY, `${property.type} drew a control it cannot fill`);
    }
});
