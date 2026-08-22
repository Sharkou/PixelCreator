import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Transform, defineComponent } from '../../core/mod.js';
import { Camera, RectangleRenderer } from '../../runtime/mod.js';
import { PropertyType, propertyTypes } from '../../core/mod.js';
import {
    FieldKind,
    fieldFor,
    fieldKindFor,
    describeComponent,
    formatValue,
    isNumeric,
    objectFields,
    parseValue,
    rows,
    toDisplay,
    toDisplayExact
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
    assert.equal(names.includes('lock'), false, 'the Hierarchy row owns the lock');
    assert.equal(names.includes('active'), true, 'and `active` is shown in both, being one value');
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

test('a converted value is shown at a length a creator can act on', () => {
    const rotation = byName(describeComponent(new Transform()), 'rotation');

    // 0.3 rad is 17.188733853924695 degrees. Twelve significant digits of that is noise
    // in a field ninety pixels wide.
    assert.equal(formatValue(rotation, 0.3), '17.189');
    assert.equal(toDisplay(rotation, 0.3), 17.189);
});

test('rounding for display never rewrites the model', () => {
    const rotation = byName(describeComponent(new Transform()), 'rotation');
    const shown = toDisplay(rotation, 0.3);

    // The field shows the short form and reports nothing, so the stored value keeps
    // every digit it was given until the creator actually edits it.
    assert.notEqual(parseValue(rotation, String(shown)), 0.3, 'the short form is not the stored one');
    assert.ok(Math.abs(parseValue(rotation, String(shown)) - 0.3) < 1e-5,
        'and editing it back lands within a thousandth of a degree');
});

test('the readable form and the value are two different numbers', () => {
    const x = byName(describeComponent(new Transform()), 'x');
    const stored = 0.1 + 0.2;                       // 0.30000000000000004

    assert.equal(toDisplay(x, stored), 0.3, 'what the box shows is short');
    assert.equal(toDisplayExact(x, stored), stored, 'what a gesture starts from is not');
    assert.notEqual(toDisplay(x, stored), toDisplayExact(x, stored));
});

test('a gesture starts from the model, so the display rounding cannot become the value', () => {
    // Rotation, because the conversion to degrees is what makes the two forms visibly
    // different: 0.3 rad is 17.188733853924695 degrees and the box shows 17.189.
    const rotation = byName(describeComponent(new Transform()), 'rotation');
    const stored = 0.3;

    const fromModel = toDisplayExact(rotation, stored);
    const fromBox = toDisplay(rotation, stored);
    assert.notEqual(fromModel, fromBox, 'the readable form is not the value');

    // What a stepper, a scrub or an arrow key does: base + steps x step.
    const nudgedFromModel = parseValue(rotation, fromModel + 1);
    const nudgedFromBox = parseValue(rotation, fromBox + 1);

    assert.notEqual(nudgedFromModel, nudgedFromBox,
        'starting from the box would land somewhere the creator never asked for');

    // One degree more than what was stored, to the last bit the model can hold.
    assert.ok(Math.abs(nudgedFromModel - (stored + Math.PI / 180)) < 1e-15,
        'a nudge of one degree from the stored value is exactly that');
});

test('the exact form converts units like the readable one, without shortening', () => {
    const rotation = byName(describeComponent(new Transform()), 'rotation');

    assert.equal(toDisplay(rotation, 0.3), 17.189, 'readable');
    assert.equal(toDisplayExact(rotation, 0.3), 0.3 * 180 / Math.PI, 'exact, and still in degrees');
    assert.equal(toDisplayExact(rotation, null), null);
    assert.equal(toDisplayExact(rotation, NaN), null);
});

test('a value too small for three decimals is not shown as nothing', () => {
    const scale = byName(describeComponent(new Transform()), 'scaleX');

    assert.equal(toDisplay(scale, 0.0004), 0.0004, 'showing 0 would invite typing over it');
    assert.equal(toDisplay(scale, 0), 0);
});

test('an int never shows a decimal point', () => {
    const layer = byName(objectFields(), 'layer');

    assert.equal(toDisplay(layer, 3.7), 4);
    assert.equal(formatValue(layer, 3.2), '3');
});

test('float noise still disappears', () => {
    const x = byName(describeComponent(new Transform()), 'x');
    const rotation = byName(describeComponent(new Transform()), 'rotation');

    assert.equal(formatValue(x, 0.1 + 0.2), '0.3');
    assert.equal(formatValue(rotation, Math.PI / 4), '45');
    assert.equal(formatValue(rotation, Math.PI), '180');
});

// --- FieldKind is derived from PropertyType (ADR-0023) ------------------------------

test('every Core property type maps to a control, explicitly', () => {
    // Not by name collision: a type that fell through to READONLY by accident is exactly
    // the dead end this split exists to remove. Every one of the eight is written down.
    for (const type of propertyTypes()) {
        assert.ok(fieldKindFor(type), `${type} has no control`);
    }

    assert.equal(fieldKindFor(PropertyType.NUMBER), FieldKind.NUMBER);
    assert.equal(fieldKindFor(PropertyType.INT), FieldKind.INT);
    assert.equal(fieldKindFor(PropertyType.BOOLEAN), FieldKind.BOOLEAN);
    assert.equal(fieldKindFor(PropertyType.STRING), FieldKind.STRING);
    assert.equal(fieldKindFor(PropertyType.COLOR), FieldKind.COLOR);
    assert.equal(fieldKindFor(PropertyType.ENUM), FieldKind.ENUM);
    // A reference is picked, dropped or cleared — never typed (ui/resource-field.js).
    assert.equal(fieldKindFor(PropertyType.RESOURCE), FieldKind.RESOURCE);
    // A list is still shown read-only: it is a real type at the Core, and what it lacks
    // is a control, which is a visible piece of work rather than a silent dead end.
    assert.equal(fieldKindFor(PropertyType.ARRAY), FieldKind.READONLY);
});

test('range and readonly are Editor vocabulary, absent from the Core', () => {
    const core = propertyTypes();

    assert.equal(core.includes(FieldKind.RANGE), false, 'a range is a bounded number');
    assert.equal(core.includes(FieldKind.READONLY), false, 'read-only is a display fallback');
    assert.equal(core.includes('object'), false, 'and `object` is gone entirely');
    assert.equal(core.includes('vector2'), false);
    assert.equal(core.includes('action'), false);
});

test('a range is still derived from the constraints a component already declares', () => {
    class Bounded {
        static type = 'Bounded';
        static schema = { mix: { type: 'number', min: 0, max: 1 } };
        constructor() { this.mix = 0.5; }
    }

    assert.equal(describeComponent(new Bounded())[0].kind, FieldKind.RANGE);
});

test('a resource property is a reference control, never a text box', () => {
    // A ResourceId is opaque. Offering it as a text field invites a creator to type over
    // it and break the reference — so it gets a control that shows what it points at.
    const Sprited = defineComponent({
        type: 'res_sprited',
        label: 'Sprited',
        properties: { source: { type: 'resource' } }
    });
    const field = describeComponent(new Sprited())[0];

    assert.equal(field.kind, FieldKind.RESOURCE);
    assert.equal(field.readonly, false);
    assert.deepEqual(field.accepts, { kind: null, mime: null }, 'undeclared means any resource');
});

test('a resource property carries the narrowing it declared', () => {
    const Sprited = defineComponent({
        type: 'res_narrowed',
        label: 'Narrowed',
        properties: { source: { type: 'resource', kind: 'asset', mime: 'image/' } }
    });
    const field = describeComponent(new Sprited())[0];

    assert.deepEqual(field.accepts, { kind: 'asset', mime: 'image/' },
        'the picker and the drop rule read the same declaration');
});

test('only a resource property carries an accepts clause', () => {
    const descriptor = fieldFor('speed', { type: PropertyType.NUMBER });
    assert.equal(descriptor.accepts, null);
});

test('an Object reference is edited with its own control, never with a text field', () => {
    // ADR-0034 §3.5, which is ADR-0030 §1 one scope down: the value is an opaque identity,
    // and a text field over one invites a creator to type across a reference they cannot
    // read back. `readonly` would have been the silent dead end ADR-0023 §3 refuses.
    assert.equal(fieldKindFor(PropertyType.OBJECTREF), FieldKind.OBJECT);

    const descriptor = fieldFor('target', { type: PropertyType.OBJECTREF, default: null });

    assert.equal(descriptor.kind, FieldKind.OBJECT);
    assert.equal(descriptor.default, null);
    assert.equal(descriptor.label, 'Target');
    assert.notEqual(descriptor.kind, FieldKind.READONLY);
});

test('a descriptor carries what an empty control should read, and nothing carries one by default', () => {
    assert.equal(fieldFor('speed', { type: PropertyType.NUMBER }).placeholder, null);
    assert.equal(fieldFor('tag', { type: PropertyType.STRING, placeholder: 'None' }).placeholder, 'None');
});
