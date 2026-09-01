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
import { ComponentRegistry, Transform } from '../../core/mod.js';
import { componentCatalogue } from '../registry.js';
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

test('one picker names the Component and the property together', () => {
    // TWO FIELDS WAS ONE TOO MANY (ADR-0047 §1). A creator thinks "this object's rotation",
    // not "the Transform Component, and within it, rotation"; the second is the engine's
    // decomposition wearing the creator's clothes.
    const description = describeNode(node('property.get'), { registry, properties, components });

    assert.deepEqual(description.fields.map(field => field.name), ['target', 'property'],
        'the Object, and the property. Nothing between them.');

    const picker = fieldNamed(description, 'property');
    assert.equal(picker.kind, FieldKind.ENUM);
    assert.equal(picker.browse, true, 'it opens on its Components, and is walked into');
});

test('the picker offers every property this project can name, grouped by its Component', () => {
    const picker = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');

    // THE COMPONENT BEING EDITED COMES FIRST, because "my own Health" is what a `.px` is
    // written to talk about — walking past `Camera` to reach it would be the list arguing.
    assert.equal(picker.groups[0], 'This Component');
    assert.deepEqual(picker.labels.slice(0, 2), ['Speed', 'Alive']);

    // And every other Component's properties are there, under its own name — read as the
    // Inspector reads them, so `x` is `Position X` and not a bare `X` beside `Scale X`
    // (ADR-0048 §2).
    assert.ok(picker.groups.includes('Transform'));
    assert.ok(picker.labels.includes('Position X'));
});

test('a row says the short name, and the group beside it says whose', () => {
    // `Transform \u25b8 X` in the shut control was tried and MEASURED: it does not fit a
    // 176 px card, so it truncated to `Transform \u25b8 \u2026` — hiding the half that
    // identifies the choice and keeping the half the picker had already shown as a heading.
    // The group belongs where the choosing happens (ADR-0047 §1).
    const picker = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');
    const at = picker.values.indexOf('Transform/t1');

    assert.ok(at >= 0, 'the value carries both halves');
    assert.equal(picker.labels[at], 'Position X',
        'the row says the name a creator reads in the Inspector, pair included');
    assert.equal(picker.groups[at], 'Transform', 'and its group says whose');
    assert.equal(picker.paths, null, 'nothing longer is drawn in a card that cannot hold it');
});

test('choosing a path writes the two params the model has always held', () => {
    // A COMPOSITE IN THE PICKER IS AN ENCODING; a composite in the payload would be a format.
    const definition = registry.get('property.get');
    const target = node('property.get');
    const context = { properties, components };

    assert.deepEqual(paramWrites(definition, target, 'property', 'Transform/t1', context), [
        { name: 'component', value: 'Transform' },
        { name: 'property', value: 't1' }
    ]);

    // The Component being edited is stored as no Component at all — the sentinel every
    // graph has carried since ADR-0040 §2.
    assert.deepEqual(paramWrites(definition, target, 'property', '/p1', context), [
        { name: 'component', value: null },
        { name: 'property', value: 'p1' }
    ]);
});

test('what the model holds is read back as the path the control shows', () => {
    const chosen = node('property.get', { component: 'Transform', property: 't1' });
    const picker = fieldNamed(describeNode(chosen, { registry, properties, components }), 'property');
    assert.equal(picker.value, 'Transform/t1');

    const own = node('property.get', { property: 'p1' });
    assert.equal(fieldNamed(describeNode(own, { registry, properties, components }), 'property').value, '/p1');
});

test('the Component is stored and never asked', () => {
    // `hidden` is ADR-0007's word for a param that is model and not interface. The Core
    // still needs to know whose property this is; the creator never answers it twice.
    const definition = registry.get('property.get');

    assert.equal(definition.params.component.hidden, true);
    assert.equal(definition.params.property.hidden, undefined);
});

test('a picker with nothing to offer is a read-only row, never an empty dropdown', () => {
    const description = describeNode(node('property.get'), { registry, properties: [], components: [] });
    const picker = fieldNamed(description, 'property');

    assert.deepEqual(picker.values, []);
    assert.equal(picker.kind, FieldKind.READONLY);
    assert.match(picker.placeholder, /nothing declares a property/i);
});

test('a Component installed after the panel was drawn is offered, because the catalogue is asked again', () => {
    const before = fieldNamed(describeNode(node('property.get'), { registry, properties, components: [] }), 'property');
    const after = fieldNamed(describeNode(node('property.get'), { registry, properties, components }), 'property');

    assert.ok(after.values.length > before.values.length);
    assert.ok(after.groups.includes('Transform'));
});


test('a property that still exists under the new Component is kept', () => {
    const twins = [
        { type: 'A', label: 'A', properties: [{ id: 'shared', name: 'speed', type: PropertyType.NUMBER }] },
        { type: 'B', label: 'B', properties: [{ id: 'shared', name: 'speed', type: PropertyType.NUMBER }] }
    ];
    const record = node('property.get', { component: 'A', property: 'shared' });

    assert.deepEqual(
        paramWrites(registry.get('property.get'), record, 'component', 'B', { properties, components: twins }),
        [{ name: 'component', value: 'B' }]
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

    // AND IT IS A ROW, SO THERE IS A WAY BACK (ADR-0045 §5). An enum offers what it lists;
    // `Self` was only a placeholder, so a creator who picked `Player` by mistake was stuck
    // with it.
    assert.deepEqual(offered.values, ['', 'p9']);
    assert.deepEqual(offered.labels, ['Self', 'Player']);
    assert.equal(offered.value, '', 'and an unset target is showing that first row');
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
    assert.equal(described.category, 'Object');
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

// --- the Object's own properties, offered like any other (ADR-0043) ----------------------

test('the Object leads the picker, and its four fields read as one group', () => {
    // THE FOUR A BEGINNER MEETS FIRST — the rows at the top of the Inspector — were the four
    // a graph could not touch, because nothing registers them as a Component. They are a
    // group of the one picker now, like every other Component (ADR-0043, ADR-0047 §1).
    const types = new ComponentRegistry();
    types.register(Transform);
    const catalogue = componentCatalogue(types);

    const picker = fieldNamed(describeNode(node('property.set'), { registry, components: catalogue }), 'property');
    const objectRows = picker.values
        .map((value, index) => ({ value, label: picker.labels[index], group: picker.groups[index] }))
        .filter(row => row.group === 'Object');

    assert.deepEqual(objectRows.map(row => row.label), ['Name', 'Tag', 'Layer', 'Active'],
        'in the words the Inspector\'s own header uses for them');
    assert.deepEqual(objectRows.map(row => row.value),
        ['Object/name', 'Object/tag', 'Object/layer', 'Object/active'],
        'and each carries the namespace it belongs to');

    // It is the outermost thing a creator points at, so it comes before the Components.
    assert.ok(picker.groups.indexOf('Object') < picker.groups.indexOf('Transform'));
});

test('choosing the Object namespace stores it exactly as a Component type is stored', () => {
    const definition = registry.get('property.set');
    const types = new ComponentRegistry();
    types.register(Transform);

    assert.deepEqual(
        paramWrites(definition, node('property.set'), 'component', 'Object', { properties: [], components: componentCatalogue(types) }),
        [{ name: 'component', value: 'Object' }]
    );
});

test('an untouched picker shows what the runtime will read, not an empty box', () => {
    // THE DEFECT THIS TEST IS FOR (ADR-0054 §2). A fresh `On Key` stores no key and its
    // interpreter reads `params.key ?? 'Space'` — so the card said `None` while the
    // simulation was already watching Space. It is the same defect `value.number` was fixed
    // for once already: the box and the simulation disagreeing about one value.
    const key = fieldNamed(describeNode(node('input.onKey'), { registry }), 'key');
    assert.equal(key.value, 'Space');
    assert.equal(registry.get('input.onKey').params.key.default, 'Space',
        'and it is the declared default that is shown, not a guess');

    // ONLY WHERE A DEFAULT WAS DECLARED. A picker whose default is null still reads its
    // placeholder, because there nothing IS the answer and saying so is the point.
    const description = describeNode(node('property.get'), { registry, properties, components });
    assert.equal(fieldNamed(description, 'property').value, '');
    assert.equal(fieldNamed(description, 'target').value, '');
});
