// What the Inspector shows for a component, and how (ADR-0007).
//
// Schema-driven when the component declares one, reflective when it does not — and the
// reflective path is a requirement, not a tolerance: a component a beginner wrote with
// no `static schema` still has to inspect correctly.
//
// No DOM here on purpose. This module answers "what fields, of what kind, with what
// constraints"; building inputs out of that answer is the element's job. That is what
// makes the hardest part of the Inspector testable under Node.
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
    BOOLEAN: 'boolean',
    STRING: 'string',
    COLOR: 'color',
    ENUM: 'enum',
    READONLY: 'readonly'
};

const SCHEMA_KINDS = new Set([
    FieldKind.NUMBER,
    FieldKind.INT,
    FieldKind.BOOLEAN,
    FieldKind.STRING,
    FieldKind.COLOR,
    FieldKind.ENUM
]);

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
 * Fixed and hand-written, unlike a component's: these are the Object's own contract
 * (core/serialize.js writes exactly this list), not user data, so there is nothing to
 * discover and nothing that can drift.
 *
 * @returns {object[]} Field descriptors
 */
export function objectFields() {
    return [
        field('name', { type: FieldKind.STRING }),
        field('tag', { type: FieldKind.STRING }),
        field('layer', { type: FieldKind.INT, tooltip: 'Draw order: higher draws later' }),
        field('active', { type: FieldKind.BOOLEAN, tooltip: 'Simulated and drawn' }),
        field('visible', { type: FieldKind.BOOLEAN }),
        field('lock', { type: FieldKind.BOOLEAN, tooltip: 'Ignored by viewport picking' })
    ];
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
 * @param {any} raw - The raw value read from the input
 * @returns {any} The value to store, or undefined when the input is incomplete
 */
export function parseValue(descriptor, raw) {
    switch (descriptor.kind) {
        case FieldKind.NUMBER:
        case FieldKind.INT: {
            if (typeof raw === 'string' && raw.trim() === '') return undefined;
            const parsed = globalThis.Number(raw);
            if (!globalThis.Number.isFinite(parsed)) return undefined;
            const rounded = descriptor.kind === FieldKind.INT ? Math.round(parsed) : parsed;
            return clamp(rounded, descriptor.min, descriptor.max);
        }
        case FieldKind.BOOLEAN:
            return Boolean(raw);
        default:
            return globalThis.String(raw);
    }
}

/**
 * Format a model value for display in an input.
 *
 * Numbers keep their decimals — Legacy ran them through `parseInt`, so a speed of 0.4
 * was shown as 0 and saved as 0 the moment the field was touched.
 *
 * @param {object} descriptor - A field descriptor
 * @param {any} value - The value held by the model
 * @returns {string} The text to display
 */
export function formatValue(descriptor, value) {
    if (value === null || value === undefined) return '';

    if (descriptor.kind === FieldKind.NUMBER || descriptor.kind === FieldKind.INT) {
        if (typeof value !== 'number' || !globalThis.Number.isFinite(value)) return '';
        // Rounded only to shake off binary-float noise (0.30000000000000004), never to a
        // fixed number of decimals, which would silently rewrite the creator's value.
        return globalThis.String(globalThis.Number(value.toPrecision(12)));
    }

    if (descriptor.kind === FieldKind.READONLY) return describeOpaque(value);

    return globalThis.String(value);
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
    const kind = SCHEMA_KINDS.has(declared) ? declared : FieldKind.READONLY;
    const values = kind === FieldKind.ENUM ? [...(property.values ?? [])] : null;

    return {
        name,
        label: property.label ?? humanize(name),
        kind: kind === FieldKind.ENUM && values.length === 0 ? FieldKind.READONLY : kind,
        min: numeric(property.min),
        max: numeric(property.max),
        step: numeric(property.step) ?? (kind === FieldKind.INT ? 1 : null),
        unit: property.unit ?? null,
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
