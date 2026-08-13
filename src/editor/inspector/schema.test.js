import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transform, defineComponent } from '../../core/mod.js';
import { Camera, RectangleRenderer } from '../../runtime/mod.js';
import {
    FieldKind,
    describeComponent,
    formatValue,
    isNumeric,
    objectFields,
    parseValue,
    rows,
    toDisplay
} from './schema.js';

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
    assert.equal(byName(fields, 'rotation').unit, '°', 'radians are a model unit, degrees are what is shown');
});

test('schema constraints are carried through', () => {
    const alpha = byName(describeComponent(new RectangleRenderer()), 'alpha');
    assert.equal(alpha.min, 0);
    assert.equal(alpha.max, 1);

    const width = byName(describeComponent(new RectangleRenderer()), 'width');
    assert.equal(width.kind, FieldKind.NUMBER);
    assert.equal(width.min, 0);
    assert.equal(width.max, null);
});

test('a number bounded at both ends becomes a slider', () => {
    const alpha = byName(describeComponent(new RectangleRenderer()), 'alpha');
    assert.equal(alpha.kind, FieldKind.RANGE, 'a proportion deserves a slider, not a text box');
    assert.equal(isNumeric(alpha), true);

    // Bounded on one side only is still a plain number: there is nothing to slide along.
    const zoom = byName(describeComponent(new Camera()), 'zoom');
    assert.equal(zoom.kind, FieldKind.NUMBER);
});

test('rotation is stated in radians and shown in degrees', () => {
    const rotation = byName(describeComponent(new Transform()), 'rotation');

    assert.equal(rotation.unit, '°');
    assert.equal(formatValue(rotation, Math.PI / 4), '45');
    assert.equal(toDisplay(rotation, Math.PI), 180);
    assert.equal(parseValue(rotation, '90'), Math.PI / 2);
    assert.equal(parseValue(rotation, '45'), Math.PI / 4, 'the conversion round-trips exactly');
});

test('a bound is expressed in model units, whatever the display unit', () => {
    const alpha = byName(describeComponent(new RectangleRenderer()), 'alpha');
    assert.equal(parseValue(alpha, '4'), 1);
    assert.equal(parseValue(alpha, '-2'), 0);
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

test('the Object header carries no duplicate of the Hierarchy row', () => {
    const names = objectFields().map(field => field.name);

    assert.deepEqual(names, ['name', 'tag', 'layer', 'active']);
    assert.equal(names.includes('visible'), false, 'the Hierarchy row owns visibility');
    assert.equal(names.includes('lock'), false, 'and the lock');
    assert.equal(names.includes('id'), false, 'the id is never shown to a creator');
});

test('x and y are one row, and so are width and height', () => {
    const transform = rows(describeComponent(new Transform()));

    assert.equal(transform[0].label, 'Position');
    assert.deepEqual(transform[0].fields.map(field => field.name), ['x', 'y']);
    assert.deepEqual(transform[1].fields.map(field => field.name), ['rotation']);
    assert.equal(transform[2].label, 'Scale');
    assert.deepEqual(transform[2].fields.map(field => field.name), ['scaleX', 'scaleY']);

    const rectangle = rows(describeComponent(new RectangleRenderer()));
    assert.equal(rectangle[0].label, 'Size');
    assert.deepEqual(rectangle[0].fields.map(field => field.name), ['width', 'height']);
});

test('pairing is by property name, so a lone half stays a lone row', () => {
    class Sized {
        static type = 'Sized';
        static schema = { width: { type: 'number' }, depth: { type: 'number' } };
        constructor() { this.width = 1; this.depth = 1; }
    }

    const grouped = rows(describeComponent(new Sized()));
    assert.equal(grouped.length, 2);
    assert.deepEqual(grouped.map(row => row.label), ['Width', 'Depth']);
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

test('an int is rounded', () => {
    const layer = byName(objectFields(), 'layer');
    assert.equal(parseValue(layer, '3.7'), 4);
});
