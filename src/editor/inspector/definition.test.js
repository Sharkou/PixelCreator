// What the Inspector shows for a `.px` being edited (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentDefinition, NodeRegistry, PropertyType, registerStandardNodes } from '../../core/mod.js';
import { FieldKind } from './schema.js';
import { PROPERTY_TYPE_LABELS, defaultField, describeDefinition, describeProperty } from './definition.js';

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
