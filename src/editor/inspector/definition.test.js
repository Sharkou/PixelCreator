// What the Inspector shows for a `.px` being edited (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentDefinition, NodeRegistry, PropertyType, propertyTypes, registerStandardNodes } from '../../core/mod.js';
import { FieldKind } from './schema.js';
import { PROPERTY_TYPE_LABELS, authorableTypes, defaultField, describeDefinition, describeProperty } from './definition.js';

function definition(payload = {}) {
    return new ComponentDefinition(payload, { registry: registerStandardNodes(new NodeRegistry()) });
}

test('nothing to inspect describes as nothing', () => {
    assert.equal(describeDefinition(null), null);
});

test('a `.px` reports its name and its properties, in declaration order', () => {
    const model = definition({ label: 'Controller' });
    model.addProperty({ name: 'speed' });
    model.addProperty({ name: 'health' });

    const description = describeDefinition(model);

    assert.equal(description.title, 'Controller');
    assert.deepEqual(description.properties.map(entry => entry.name), ['speed', 'health']);
});

test('a Component with no name still has a title rather than an empty header', () => {
    assert.equal(describeDefinition(definition()).title, 'Component');
});

test('a property is three fields: what it is called, what shape it has, what it starts at', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed', type: PropertyType.NUMBER, default: 120 });

    const row = describeProperty(property);

    assert.equal(row.id, property.id);
    assert.deepEqual(row.fields.map(field => field.name), ['name', 'type', 'default']);
    assert.equal(row.fields[0].kind, FieldKind.STRING);
    assert.equal(row.fields[1].kind, FieldKind.ENUM);
    assert.equal(row.fields[2].kind, FieldKind.NUMBER);
});

test('the type list is the Core\'s own, and each member is named for a creator', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });

    const type = describeProperty(property).fields[1];

    assert.equal(type.values.includes(PropertyType.COLOR), true);
    assert.equal(type.values.includes('object'), false, 'a type the Core dropped is not offered');
    assert.equal(type.labels[type.values.indexOf(PropertyType.COLOR)], PROPERTY_TYPE_LABELS[PropertyType.COLOR]);
    assert.equal(type.values.length, type.labels.length);
});

test('the control for the default follows the declared type', () => {
    const model = definition();

    assert.equal(defaultField(model.addProperty({ type: PropertyType.BOOLEAN })).kind, FieldKind.BOOLEAN);
    assert.equal(defaultField(model.addProperty({ type: PropertyType.COLOR })).kind, FieldKind.COLOR);
    assert.equal(defaultField(model.addProperty({ type: PropertyType.STRING })).kind, FieldKind.STRING);
    assert.equal(defaultField(model.addProperty({ type: PropertyType.INT })).kind, FieldKind.INT);
});

test('a resource default is picked, and a list default is still read-only', () => {
    const model = definition();

    // A reference has a control now (ui/resource-field.js), so declaring a `resource`
    // property lets a creator choose what a fresh instance starts pointing at.
    const reference = defaultField(model.addProperty({ type: PropertyType.RESOURCE }));
    assert.equal(reference.kind, FieldKind.RESOURCE);
    assert.equal(reference.readonly, false);

    // A list has no control yet, and says so rather than pretending.
    assert.equal(defaultField(model.addProperty({ type: PropertyType.ARRAY })).kind, FieldKind.READONLY);
});

test('a choice with nothing to choose from shows read-only rather than an empty dropdown', () => {
    const model = definition();
    const property = model.addProperty({ type: PropertyType.ENUM });

    const field = defaultField(property);

    assert.equal(field.kind, FieldKind.READONLY);
    assert.equal(field.readonly, true);
});

test('the description follows the model, so an edit is visible on the next read', () => {
    const model = definition();
    const property = model.addProperty({ name: 'speed' });

    model.renameProperty(property.id, 'walkSpeed');
    model.setPropertyType(property.id, PropertyType.BOOLEAN);

    const row = describeProperty(model.property(property.id));

    assert.equal(row.name, 'walkSpeed');
    assert.equal(row.fields[2].kind, FieldKind.BOOLEAN);
});

// --- what a creator may declare (§5.4, §5.7) -------------------------------------------

test('the Type picker does not offer Integer', () => {
    const offered = authorableTypes();

    assert.equal(offered.includes(PropertyType.INT), false,
        'Number and Integer differ by a promise a creator declaring `speed` cannot act on');
    assert.ok(offered.includes(PropertyType.NUMBER));
});

test('int stays a real Core type, because things depend on it', () => {
    // The Object's own `layer` is one, and the graph pairs int with number so a counter
    // can be incremented (ADR-0027). Dropping it from the Core would break both.
    assert.ok(propertyTypes().includes(PropertyType.INT));
});

test('the picker offers every other Core type, and only those', () => {
    const offered = new Set(authorableTypes());
    const core = propertyTypes().filter(type => type !== PropertyType.INT);

    assert.deepEqual([...offered], core);
});

test('every offered type has a name a creator can read', () => {
    for (const type of authorableTypes()) {
        assert.equal(typeof PROPERTY_TYPE_LABELS[type], 'string', `${type} has no label`);
        assert.notEqual(PROPERTY_TYPE_LABELS[type], type, `${type} shows its raw enum value`);
    }
});

test('the spelling is American, because the API is', () => {
    assert.equal(PROPERTY_TYPE_LABELS[PropertyType.COLOR], 'Color');
});

test('an Object reference is declarable, and is named for the thing rather than for the shape', () => {
    assert.ok(authorableTypes().includes(PropertyType.OBJECTREF));
    assert.equal(PROPERTY_TYPE_LABELS[PropertyType.OBJECTREF], 'Object');
});

test('an Object reference has no default a creator may author', () => {
    // A `.px` is of PROJECT scope and an ObjectId belongs to ONE scene (ADR-0034 §3.5), so
    // a picker here would write the open scene's identity into a file other scenes may use.
    const descriptor = defaultField({ id: 'p1', name: 'target', type: PropertyType.OBJECTREF, default: null });

    assert.equal(descriptor.kind, FieldKind.READONLY);
    assert.equal(descriptor.readonly, true);
    assert.notEqual(descriptor.kind, FieldKind.OBJECT, 'the scene must not be offered here');
    assert.ok(descriptor.placeholder, 'and it says where the reference IS set');
});

test('every other reference type still authors its default', () => {
    assert.equal(defaultField({ type: PropertyType.STRING }).readonly, false);
    assert.equal(defaultField({ type: PropertyType.NUMBER }).kind, FieldKind.NUMBER);
});
