import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transform, defineComponent } from '../../core/mod.js';
import { RectangleRenderer } from '../../runtime/mod.js';
import { FieldKind, describeComponent, formatValue, objectFields, parseValue } from './schema.js';

class Plain {
    static type = 'Plain';
    constructor() {
        this.speed = 0.4;
        this.enabled = true;
        this.label = 'hello';
        this.target = { id: 'abc' };
        this._cache = [1, 2, 3];
    }
    update() {}
}

class Layouted {
    static type = 'Layouted';
    static schema = {
        layout: { type: 'enum', values: ['wasd', 'zqsd', 'arrows'], default: 'zqsd' },
        secret: { type: 'string', hidden: true },
        ratio: { type: 'number', min: 0, max: 1, step: 0.1, label: 'Mix ratio', unit: '%' },
        wheels: { type: 'int' },
        notes: { type: 'array', default: [] }
    };
    constructor() {
        this.layout = 'zqsd';
        this.secret = 'x';
        this.ratio = 0.5;
        this.wheels = 4;
        this.notes = [];
    }
}

const byName = (fields, name) => fields.find(field => field.name === name);

test('a schema drives the fields, in declaration order', () => {
    const fields = describeComponent(new Transform());
    assert.deepEqual(fields.map(field => field.name), ['x', 'y', 'rotation', 'scaleX', 'scaleY']);
    assert.equal(fields[0].kind, FieldKind.NUMBER);
    assert.equal(byName(fields, 'rotation').unit, 'rad');
});

test('schema constraints are carried through', () => {
    const alpha = byName(describeComponent(new RectangleRenderer()), 'alpha');
    assert.equal(alpha.kind, FieldKind.NUMBER);
    assert.equal(alpha.min, 0);
    assert.equal(alpha.max, 1);
});

test('a declared colour is a colour, whatever its current value', () => {
    const rectangle = new RectangleRenderer();
    rectangle.color = '';

    assert.equal(byName(describeComponent(rectangle), 'color').kind, FieldKind.COLOR,
        'Legacy guessed from a leading #, so an empty colour became a text field');
});

test('hidden properties are not shown', () => {
    const names = describeComponent(new Layouted()).map(field => field.name);
    assert.equal(names.includes('secret'), false);
});

test('an enum becomes a choice, an unsupported type becomes read-only', () => {
    const fields = describeComponent(new Layouted());

    assert.equal(byName(fields, 'layout').kind, FieldKind.ENUM);
    assert.deepEqual(byName(fields, 'layout').values, ['wasd', 'zqsd', 'arrows']);
    assert.equal(byName(fields, 'notes').kind, FieldKind.READONLY, 'no array editor exists yet');
});

test('labels are humanised unless the schema names them', () => {
    const fields = describeComponent(new Layouted());
    assert.equal(byName(fields, 'ratio').label, 'Mix ratio');
    assert.equal(byName(fields, 'wheels').label, 'Wheels');
    assert.equal(byName(describeComponent(new RectangleRenderer()), 'lineWidth').label, 'Line Width');
});

test('a component with no schema falls back to reflection', () => {
    const fields = describeComponent(new Plain());

    assert.deepEqual(fields.map(field => field.name), ['speed', 'enabled', 'label', 'target']);
    assert.equal(byName(fields, 'speed').kind, FieldKind.NUMBER);
    assert.equal(byName(fields, 'enabled').kind, FieldKind.BOOLEAN);
    assert.equal(byName(fields, 'label').kind, FieldKind.STRING);
    assert.equal(byName(fields, 'target').kind, FieldKind.READONLY);
});

test('reflection skips underscored state and methods', () => {
    const names = describeComponent(new Plain()).map(field => field.name);
    assert.equal(names.includes('_cache'), false);
    assert.equal(names.includes('update'), false);
});

test('a component built from a definition inspects like any other', () => {
    const Health = defineComponent({
        type: 'Health',
        properties: {
            maxHealth: { type: 'number', default: 100, min: 0 },
            regeneration: { type: 'number', default: 0 }
        }
    });

    const fields = describeComponent(new Health());
    assert.deepEqual(fields.map(field => field.name), ['maxHealth', 'regeneration']);
    assert.equal(fields[0].min, 0);
});

test('the Object header shows the serialized contract', () => {
    assert.deepEqual(
        objectFields().map(field => field.name),
        ['name', 'tag', 'layer', 'active', 'visible', 'lock']
    );
});

test('decimals survive a round trip', () => {
    const descriptor = byName(describeComponent(new Transform()), 'x');

    assert.equal(formatValue(descriptor, 0.4), '0.4', 'Legacy showed 0 here, then saved 0');
    assert.equal(parseValue(descriptor, '0.4'), 0.4);
    assert.equal(formatValue(descriptor, 0.1 + 0.2), '0.3', 'float noise is not shown');
});

test('an incomplete entry leaves the model alone', () => {
    const descriptor = byName(describeComponent(new Transform()), 'x');

    assert.equal(parseValue(descriptor, ''), undefined);
    assert.equal(parseValue(descriptor, '-'), undefined);
    assert.equal(parseValue(descriptor, 'abc'), undefined);
    assert.equal(parseValue(descriptor, '-12.5'), -12.5);
});

test('a value is clamped to the declared range and rounded for an int', () => {
    const alpha = byName(describeComponent(new RectangleRenderer()), 'alpha');
    assert.equal(parseValue(alpha, '4'), 1);
    assert.equal(parseValue(alpha, '-2'), 0);

    const layer = byName(objectFields(), 'layer');
    assert.equal(parseValue(layer, '3.7'), 4);
});
