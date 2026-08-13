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

import { componentSchema } from '../../core/mod.js';

/**
 * Field kinds the Inspector knows how to render.
 *
 * A schema type outside this list falls back to READONLY rather than to a text input:
 * showing an unsupported value as editable text invites the creator to destroy it.
 */
export const FieldKind = {
    NUMBER: 'number',
    INT: 'int',
    RANGE: 'range',
    BOOLEAN: 'boolean',
    STRING: 'string',
    COLOR: 'color',
    ENUM: 'enum',
    READONLY: 'readonly'
};

const SCHEMA_KINDS = new Set([
    FieldKind.NUMBER,
    FieldKind.INT,
    FieldKind.RANGE,
    FieldKind.BOOLEAN,
    FieldKind.STRING,
    FieldKind.COLOR,
    FieldKind.ENUM
]);

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
 * `visible` and `lock` are absent on purpose — the Hierarchy row carries them, where they
 * are one click away for every object at once instead of one at a time. `id` is absent
 * because a creator never needs it and showing it makes the panel look like a debugger.
 *
 * @returns {object[]} Field descriptors
 */
export function objectFields() {
    return [
        field('name', { type: FieldKind.STRING }),
        field('tag', { type: FieldKind.STRING, tooltip: 'One free-form tag, used by findByTag()' }),
        field('layer', { type: FieldKind.INT, tooltip: 'Draw order: higher draws later' }),
        field('active', { type: FieldKind.BOOLEAN, tooltip: 'Simulated and drawn' })
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
 * A model value as the number a control should hold.
 * @param {object} descriptor - A field descriptor
 * @param {any} value - The value held by the model
 * @returns {number|null} The display number, or null when there is nothing to show
 */
export function toDisplay(descriptor, value) {
    if (typeof value !== 'number' || !globalThis.Number.isFinite(value)) return null;
    const scaled = value * descriptor.scale;
    // Rounded only to shake off binary-float noise (0.30000000000000004, or 45.000000001
    // degrees), never to a fixed number of decimals, which would rewrite the value.
    return globalThis.Number(scaled.toPrecision(12));
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

function inferType(value) {
    if (typeof value === 'boolean') return FieldKind.BOOLEAN;
    if (typeof value === 'number') return FieldKind.NUMBER;
    // Without a schema a colour is indistinguishable from a string, so it stays a
    // string. Guessing from a leading '#' is what turned Legacy text fields into colour
    // pickers; declaring `type: 'color'` is how a component says it means a colour.
    if (typeof value === 'string') return FieldKind.STRING;
    return FieldKind.READONLY;
}

function field(name, property = {}) {
    const declared = property.type;
    const values = declared === FieldKind.ENUM ? [...(property.values ?? [])] : null;
    const min = numeric(property.min);
    const max = numeric(property.max);
    const display = DISPLAY_UNITS[property.unit] ?? { scale: 1, unit: property.unit ?? null, step: null };

    let kind = SCHEMA_KINDS.has(declared) ? declared : FieldKind.READONLY;
    if (kind === FieldKind.ENUM && values.length === 0) kind = FieldKind.READONLY;
    // A number bounded at both ends is a proportion, and a proportion deserves a slider.
    // ADR-0007 lists `range` as a type; this is the same conclusion reached from the
    // constraints a component already declares, so no component has to be rewritten.
    if (kind === FieldKind.NUMBER && min !== null && max !== null) kind = FieldKind.RANGE;

    return {
        name,
        label: property.label ?? humanize(name),
        kind,
        min,
        max,
        step: numeric(property.step) ?? display.step ?? (kind === FieldKind.INT ? 1 : null),
        unit: display.unit,
        /** Model value x scale = what the creator sees. */
        scale: display.scale,
        values,
        readonly: Boolean(property.readonly),
        tooltip: property.tooltip ?? null
    };
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
