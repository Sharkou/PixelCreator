// What the Inspector shows for a component, and how (ADR-0007).
//
// Schema-driven when the component declares one, reflective when it does not — and the
// reflective path is a requirement, not a tolerance: a component a beginner wrote with
// no `static schema` still has to inspect correctly.
//
// No DOM here on purpose. This module answers "what fields, of what kind, with what
// constraints, shown in what unit"; building controls out of that answer is the element's
// job. That is what makes the hardest part of the Inspector testable under Node.
//
// TWO IDEAS BEYOND THE PLAIN MAPPING, both of which exist so the Inspector can be
// pleasant without any component knowing about the Inspector:
//
//   a display scale — the Core keeps rotation in radians because maths does; a creator
//   thinks in degrees. `unit: 'rad'` is enough for the conversion to happen, exactly, in
//   one place;
//
//   pairing — `x` and `y` are one idea and belong on one line. Declared as a table of
//   property names, so any component with `width` and `height` gets a Size row without
//   this file knowing that RectangleRenderer exists.
//
// The Legacy defects this closes, all measured in ADR-0007: numbers truncated by
// parseInt, colours guessed from whether a string happens to start with '#', a hard-coded
// blacklist of field names, and four dead `TODO Range` style branches.

import { PropertyType, componentSchema, isPropertyType } from '../../core/mod.js';

/**
 * Field kinds the Inspector knows how to render.
 *
 * DERIVED FROM `PropertyType`, NOT PARALLEL TO IT (ADR-0023). The Core answers "what shape
 * is this value"; this list answers "with which control is it edited". They are different
 * questions, and asking both with one word is what let `range` and `readonly` — neither of
 * which is a shape of value — sit in the Core's list of types.
 *
 * Two kinds here have no counterpart in the Core, on purpose:
 *
 *   RANGE     a `number` bounded at both ends is a proportion, and a proportion deserves
 *             a slider. Derived from constraints a component already declares, so no
 *             component has to be rewritten to get one.
 *   READONLY  a display fallback. Not a shape of value, and never stored as one.
 */
export const FieldKind = {
    NUMBER: 'number',
    INT: 'int',
    RANGE: 'range',
    BOOLEAN: 'boolean',
    STRING: 'string',
    COLOR: 'color',
    ENUM: 'enum',
    RESOURCE: 'resource',
    OBJECT: 'object',
    /**
     * A list of values, each edited by the control ITS OWN type asks for.
     *
     * `array` fell back to READONLY until now, and ADR-0023 §4 said why in as many words:
     * it is a real type at the Core — a starting value, a validation, a serialization —
     * and "what it lacks is a control, and that is a visible piece of work rather than a
     * silent dead end". This is that work landing; the ADR is honoured, not amended.
     */
    LIST: 'list',
    READONLY: 'readonly'
};

/**
 * The kinds a control draws from the VALUE ALONE.
 *
 * It is the question a list has to ask about its elements, and it has exactly one honest
 * answer per kind. A `resource` is resolved against the project and a reference against the
 * scene, so their controls are handed a project and a scene by the panel that builds them
 * (windows/inspector.js) — a row inside a list has neither, and drawing them with the value
 * control instead would put a text box over an opaque identity, which is the one thing
 * ADR-0030 §1 and ADR-0034 §3.5 both refuse. A nested list is a rendering nobody has
 * designed. A read-only element has nothing to edit.
 *
 * So a list of those is not "unsupported": it is a list whose elements this Editor cannot
 * yet edit, and it stays read-only — showing what it holds, as it already did.
 */
const SELF_CONTAINED = new globalThis.Set([
    FieldKind.NUMBER,
    FieldKind.INT,
    FieldKind.RANGE,
    FieldKind.BOOLEAN,
    FieldKind.STRING,
    FieldKind.COLOR,
    FieldKind.ENUM
]);

/**
 * The control each Core property type is edited with.
 *
 * Written out rather than left to a name collision: `number` mapping to `number` is a
 * decision, not a coincidence, and `resource` and `array` need to be here to be SUPPORTED
 * rather than to fall through a default and land on READONLY by accident.
 *
 * `resource` NOW HAS A CONTROL, and the reasoning that kept it read-only has been paid
 * off rather than overruled. It used to say: "picking one needs a resource browser — the
 * Project window is where that will live, and inventing a text field for an opaque
 * identifier would invite a creator to type over it and break the reference." The Project
 * window exists, resources carry icons and previews, and the drag rules already know what
 * `resource-to-property` means — so `ui/resource-field.js` shows what the reference points
 * at and offers pick, drop and clear. It is still not a text field, and never will be.
 *
 * `array` remains read-only, and honestly: it shows its element count, which is true and
 * useful, and editing one needs a list control that does not exist yet. It is a real type
 * at the Core (ADR-0023); what it lacks is a control, and that is a visible piece of work
 * rather than a silent dead end.
 */
const KIND_BY_PROPERTY_TYPE = {
    [PropertyType.NUMBER]: FieldKind.NUMBER,
    [PropertyType.INT]: FieldKind.INT,
    [PropertyType.BOOLEAN]: FieldKind.BOOLEAN,
    [PropertyType.STRING]: FieldKind.STRING,
    [PropertyType.COLOR]: FieldKind.COLOR,
    [PropertyType.ENUM]: FieldKind.ENUM,
    [PropertyType.RESOURCE]: FieldKind.RESOURCE,
    // An Object reference gets its own control for the reason a resource one does: the value
    // is an opaque identity, and a text field over one invites a creator to type across a
    // reference they cannot read back (ADR-0030 §1, one scope down — ui/object-field.js).
    [PropertyType.OBJECTREF]: FieldKind.OBJECT,
    // A list HAS a control now (ui/list-field.js). Whether it earns one depends on what it
    // says its elements are, which is a declaration and not a type — so the decision is
    // made in `field()`, beside the one that turns a choice with nothing to choose from
    // back into a read-only row.
    [PropertyType.ARRAY]: FieldKind.LIST
};

/**
 * The control a declared property type is edited with.
 *
 * @param {string} type - One of PropertyType
 * @returns {string} One of FieldKind; READONLY for anything unknown
 */
export function fieldKindFor(type) {
    return KIND_BY_PROPERTY_TYPE[type] ?? FieldKind.READONLY;
}

/** Properties shown side by side, and what the pair is called. */
const PAIRS = [
    { first: 'x', second: 'y', label: 'Position' },
    { first: 'width', second: 'height', label: 'Size' },
    { first: 'scaleX', second: 'scaleY', label: 'Scale' }
];

/** Model unit -> how it is shown. The Core keeps its unit; only the display converts. */
const DISPLAY_UNITS = {
    rad: { scale: 180 / Math.PI, unit: '°', step: 1 }
};

/**
 * Describe the fields the Inspector should show for a component.
 *
 * @param {object} component - The component instance
 * @returns {object[]} Field descriptors, in declaration order
 */
export function describeComponent(component) {
    const schema = componentSchema(component);
    return schema ? fromSchema(schema) : reflect(component);
}

/**
 * Describe the fields of the Object itself, above its components.
 *
 * Fixed and hand-written, unlike a component's: these are the Object's own contract, not
 * user data, so there is nothing to discover and nothing that can drift.
 *
 * `lock` is absent on purpose — the Hierarchy row carries it, where it is one click away
 * for every object at once instead of one at a time. `active` IS here as well as in the
 * row, because they are the same field: the checkbox and the eye read and write one value
 * (ADR-0026 §13). `id` is absent because a creator never needs it and showing it makes the
 * panel look like a debugger.
 *
 * @returns {object[]} Field descriptors
 */
export function objectFields() {
    return [
        field('name', { type: FieldKind.STRING }),
        field('tag', { type: FieldKind.STRING, tooltip: 'One free-form tag, used by findByTag()' }),
        field('layer', { type: FieldKind.INT, tooltip: 'Draw order: higher draws later' }),
        // The same value the Hierarchy's eye writes: one flag, two controls, no drift
        // (ADR-0026 §13).
        field('active', { type: FieldKind.BOOLEAN, tooltip: 'Simulated and drawn — the Hierarchy eye' })
    ];
}

/**
 * Group descriptors into the rows the Inspector draws.
 *
 * @param {object[]} fields - Field descriptors
 * @returns {object[]} Rows, each `{ label, fields }` — one field, or a pair
 */
export function rows(fields) {
    const remaining = new globalThis.Map(fields.map(entry => [entry.name, entry]));
    const grouped = [];

    for (const entry of fields) {
        if (!remaining.has(entry.name)) continue;

        const pair = PAIRS.find(candidate => candidate.first === entry.name);
        const second = pair && remaining.get(pair.second);

        if (pair && second) {
            remaining.delete(pair.first);
            remaining.delete(pair.second);
            grouped.push({ label: pair.label, fields: [entry, second] });
            continue;
        }

        remaining.delete(entry.name);
        grouped.push({ label: entry.label, fields: [entry] });
    }

    return grouped;
}

/**
 * Turn a raw input value into what the model should store.
 *
 * Returns `undefined` when the input does not yet represent a value — a number field
 * holding "-" or "1e" while the creator is still typing. The caller must then leave the
 * model alone, which is what makes letter-by-letter editing survive without the field
 * fighting back.
 *
 * @param {object} descriptor - A field descriptor
 * @param {any} raw - The raw value read from the control, in display units
 * @returns {any} The value to store, in model units, or undefined when incomplete
 */
export function parseValue(descriptor, raw) {
    switch (descriptor.kind) {
        case FieldKind.NUMBER:
        case FieldKind.RANGE:
        case FieldKind.INT: {
            if (typeof raw === 'string' && raw.trim() === '') return undefined;
            const parsed = globalThis.Number(raw);
            if (!globalThis.Number.isFinite(parsed)) return undefined;
            const rounded = descriptor.kind === FieldKind.INT ? Math.round(parsed) : parsed;
            return clamp(rounded / descriptor.scale, descriptor.min, descriptor.max);
        }
        case FieldKind.BOOLEAN:
            return Boolean(raw);
        default:
            return globalThis.String(raw);
    }
}

/**
 * Format a model value for display in a control.
 *
 * Numbers keep their decimals — Legacy ran them through `parseInt`, so a speed of 0.4
 * was shown as 0 and saved as 0 the moment the field was touched.
 *
 * @param {object} descriptor - A field descriptor
 * @param {any} value - The value held by the model
 * @returns {string} The text to display, in display units
 */
export function formatValue(descriptor, value) {
    if (value === null || value === undefined) return '';

    if (isNumeric(descriptor)) {
        const shown = toDisplay(descriptor, value);
        return shown === null ? '' : globalThis.String(shown);
    }

    if (descriptor.kind === FieldKind.READONLY) return describeOpaque(value);

    return globalThis.String(value);
}

/**
 * Most decimals a value is ever shown with.
 *
 * A rotation of 0.3 rad is 17.188733853924695 degrees, and `toPrecision(12)` showed
 * 17.1887338539 — twelve characters of noise in a field ninety pixels wide, for a value
 * nobody can act on past the second decimal.
 *
 * THIS IS A DISPLAY RULE, NOT A STORAGE ONE. The model keeps every digit it was given,
 * and a field the creator does not touch is never written back — so the precision is
 * lost only if they deliberately edit the value, which is exactly when they have said
 * what they want it to be. Blender and Unity both round the same way, for the same
 * reason.
 */
export const MAX_DECIMALS = 3;

/**
 * A model value in display units, with nothing rounded away.
 *
 * THE READABLE FORM IS NOT THE VALUE. `toDisplay()` shortens a number so it fits a field
 * and can be read; this one converts it and stops there. Every gesture that changes a
 * value by an amount — a stepper, a scrub, an arrow key — starts from this one, so that
 * nudging a stored 0.30000000000000004 by one gives 1.3000000000000000 and not 1.3.
 * Starting from what the box happens to show would let a rounding meant for the eye
 * quietly become the value.
 *
 * @param {object} descriptor - A field descriptor
 * @param {any} value - The value held by the model
 * @returns {number|null} The display number at full precision, or null
 */
export function toDisplayExact(descriptor, value) {
    if (typeof value !== 'number' || !globalThis.Number.isFinite(value)) return null;
    return value * descriptor.scale;
}

/**
 * A model value as the number a control should SHOW.
 * @param {object} descriptor - A field descriptor
 * @param {any} value - The value held by the model
 * @returns {number|null} The display number, or null when there is nothing to show
 */
export function toDisplay(descriptor, value) {
    if (typeof value !== 'number' || !globalThis.Number.isFinite(value)) return null;

    const scaled = value * descriptor.scale;
    if (descriptor.kind === FieldKind.INT) return Math.round(scaled);

    // Rounding also shakes off the binary-float noise `toPrecision` was there for:
    // 0.30000000000000004 and 45.000000001 both land where they should.
    const rounded = globalThis.Number(scaled.toFixed(MAX_DECIMALS));

    // A value too small to survive three decimals is still not nothing. Showing 0 for a
    // scale of 0.0004 would invite the creator to believe it, and to type over it.
    if (rounded === 0 && scaled !== 0) return globalThis.Number(scaled.toPrecision(2));

    return rounded;
}

/**
 * Whether a descriptor holds a number.
 * @param {object} descriptor - A field descriptor
 * @returns {boolean} True for number, int and range
 */
export function isNumeric(descriptor) {
    return descriptor.kind === FieldKind.NUMBER
        || descriptor.kind === FieldKind.INT
        || descriptor.kind === FieldKind.RANGE;
}

/**
 * One field descriptor, from a property in the ADR-0007 shape.
 *
 * Exported because a Resource, a Component property being DECLARED and a graph node's
 * params all need the same answer — what control, what bounds, what unit — and each
 * re-deriving it would be three copies of the mapping ADR-0023 exists to write down once.
 *
 * @param {string} name - The property's name
 * @param {object} [property] - The declared descriptor
 * @returns {object} A field descriptor
 */
export function fieldFor(name, property = {}) {
    return field(name, property);
}

function fromSchema(schema) {
    const fields = [];
    for (const [name, property] of globalThis.Object.entries(schema)) {
        if (property?.hidden) continue;
        fields.push(field(name, property));
    }
    return fields;
}

function reflect(component) {
    const fields = [];
    for (const [name, value] of globalThis.Object.entries(component)) {
        // A leading underscore is the one convention worth honouring: it is how a
        // component without a schema says "runtime state, not project data".
        if (name.startsWith('_')) continue;
        if (typeof value === 'function') continue;
        // `active` is the contract's, not the component's data, and it already has a
        // control in the section header.
        if (name === 'active') continue;
        fields.push(field(name, { type: inferType(value) }));
    }
    return fields;
}

// Reflection answers the Core's question — what shape is this value — so it produces a
// PropertyType, and the control is derived from it like any other. `null` is the shape it
// cannot name, and an unnamed shape shows read-only.
function inferType(value) {
    if (typeof value === 'boolean') return PropertyType.BOOLEAN;
    if (typeof value === 'number') return PropertyType.NUMBER;
    // Without a schema a colour is indistinguishable from a string, so it stays a
    // string. Guessing from a leading '#' is what turned Legacy text fields into colour
    // pickers; declaring `type: 'color'` is how a component says it means a colour.
    if (typeof value === 'string') return PropertyType.STRING;
    // Not `array`: an array reached by reflection has no declared element shape, and
    // showing "3 items" is the honest thing either way.
    return null;
}

function field(name, property = {}) {
    const declared = property.type;
    const values = declared === PropertyType.ENUM ? [...(property.values ?? [])] : null;
    const min = numeric(property.min);
    const max = numeric(property.max);
    const display = DISPLAY_UNITS[property.unit] ?? { scale: 1, unit: property.unit ?? null, step: null };

    const element = declared === PropertyType.ARRAY ? elementOf(property.element) : null;

    let kind = fieldKindFor(declared);
    if (kind === FieldKind.ENUM && values.length === 0) kind = FieldKind.READONLY;
    // A LIST WITH NOTHING SAID ABOUT ITS ELEMENTS IS THE SAME SENTENCE AS A CHOICE WITH
    // NOTHING TO CHOOSE FROM: a declaration that does not earn its control keeps the
    // read-only row it already had, rather than becoming a control that guesses.
    if (kind === FieldKind.LIST && !editableElement(element)) kind = FieldKind.READONLY;
    // A number bounded at both ends is a proportion, and a proportion deserves a slider.
    // ADR-0007 lists `range` as a type; this is the same conclusion reached from the
    // constraints a component already declares, so no component has to be rewritten.
    if (kind === FieldKind.NUMBER && min !== null && max !== null) kind = FieldKind.RANGE;

    return {
        name,
        label: property.label ?? humanize(name),
        kind,
        // WHAT A REFERENCE WILL TAKE, declared and never guessed (ADR-0007). A `resource`
        // property may narrow itself to a kind and to a mime prefix, and the picker's list
        // and `rules.acceptsResource()` read the same two words — so a resource the menu
        // offers can never be the one the drop refuses. Nested rather than spread, because
        // `kind` above already means "which control", and one word cannot mean both.
        // WHAT A FRESH ONE STARTS AT, carried so a view can SHOW it without writing it.
        // A graph node's params are stored only once a creator has touched them, so a
        // `Number` node drawn from an empty `params` had a blank box while the runtime was
        // quietly using 0 — the box and the simulation disagreeing about the same value.
        default: property.default ?? null,
        // WHAT AN EMPTY CONTROL SAYS. A blank box and a blank dropdown both read as "not
        // filled in yet", which is the right message exactly when it is true — and the wrong
        // one when empty MEANS something: a property picker with nothing to offer until a
        // Component is chosen, a tag that finds nothing when it is left blank. It is
        // presentation and never a value: nothing is written when it is shown.
        placeholder: property.placeholder ?? null,
        accepts: declared === PropertyType.RESOURCE
            ? { kind: property.kind ?? null, mime: property.mime ?? null }
            : null,
        // WHAT ONE ELEMENT OF A LIST IS, declared where everything else about a property is
        // declared. A list of numbers bounded at both ends and a list of choices need more
        // than a type name — the bounds, the unit, the options — so what is carried is a
        // property declaration in the ADR-0007 shape, nested. That is the same move
        // `accepts` above makes for a resource: a per-type nested clause, normalised here,
        // null for every other type. It is not a second vocabulary; it is the first one,
        // one level down.
        element,
        min,
        max,
        step: numeric(property.step) ?? display.step ?? (kind === FieldKind.INT ? 1 : null),
        unit: display.unit,
        /** Model value x scale = what the creator sees. */
        scale: display.scale,
        values,
        // WHAT AN ENUM VALUE IS CALLED, when the stored value is not readable. A graph node
        // stores a property's IDENTITY so a rename cannot break it (ADR-0027), and an
        // opaque identifier in a dropdown would be unusable — so the option list may carry
        // display names alongside the values it stores. Absent everywhere else, and then
        // the value is its own label.
        labels: declared === PropertyType.ENUM && property.labels ? [...property.labels] : null,
        // AND WHAT IT LOOKS LIKE. The Editor's dropdown draws a glyph beside each entry
        // like every other menu in the Editor does; a choice whose options have no natural
        // icon simply declares none, and the rows are text as before.
        icons: declared === PropertyType.ENUM && property.icons ? [...property.icons] : null,
        readonly: Boolean(property.readonly),
        tooltip: property.tooltip ?? null
    };
}

/**
 * Whether a list's elements can be edited with the controls this Editor has.
 *
 * ASKED THROUGH `field()` ITSELF, so the answer is the kind an element would ACTUALLY get —
 * a choice with no options is read-only there too, and stating that rule a second time here
 * is how two rules that were one start to disagree. The recursion is one level deep and no
 * deeper: a nested list is refused above it, which is also the honest answer while nobody
 * has designed how a list of lists is drawn.
 *
 * @param {object|null} element - The element's declaration, already normalised
 * @returns {boolean} True when every row can be drawn from its value alone
 */
function editableElement(element) {
    if (!element || element.type === PropertyType.ARRAY) return false;
    return SELF_CONTAINED.has(field('', element).kind);
}

/**
 * The declaration of one element of a list, or null when there is none to honour.
 *
 * DECLARED, NEVER GUESSED — the rule ADR-0023 §7 states for the reflective fallback, applied
 * here: a list whose elements are not declared, or are declared as something the Core has no
 * type for, has no element shape at all. It stays read-only, which is what it already was,
 * rather than being edited through a control chosen by guesswork.
 *
 * Copied rather than referenced, so the descriptor a control holds and the schema a
 * component declares cannot be written through one another.
 *
 * @param {any} element - What the property declared for its elements
 * @returns {object|null} The element's declaration, copied
 */
function elementOf(element) {
    if (!element || typeof element !== 'object' || globalThis.Array.isArray(element)) return null;
    if (!isPropertyType(element.type)) return null;

    return { ...element };
}

function numeric(value) {
    // `min: 'max'` is legal in ADR-0007 — a bound naming another property. Nothing reads
    // that form yet, so it is dropped rather than half-honoured as NaN.
    return typeof value === 'number' && globalThis.Number.isFinite(value) ? value : null;
}

function clamp(value, min, max) {
    if (min !== null && value < min) return min;
    if (max !== null && value > max) return max;
    return value;
}

function humanize(name) {
    return name
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, first => first.toUpperCase());
}

function describeOpaque(value) {
    if (globalThis.Array.isArray(value)) return `${value.length} item${value.length === 1 ? '' : 's'}`;
    if (typeof value === 'object') return value.constructor?.name ?? 'object';
    return globalThis.String(value);
}
