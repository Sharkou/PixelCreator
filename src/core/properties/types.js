// PropertyType — the shape of a value, as the Core understands it (ADR-0023).
//
// TWO QUESTIONS, TWO VOCABULARIES, ONE SOURCE.
//
//   "what shape does this value have?"   default, validation, serialization,
//                                        replication                       -> Core
//   "with which control is it edited?"   slider, checkbox, picker          -> Editor
//
// Asking both with a single word is what let `range` and `readonly` — neither of which is
// a shape of value — sit in the same list as `number` and `color`. The Core owns
// `PropertyType`; the Editor derives `FieldKind` from it (editor/inspector/schema.js).
// A type is added here only when the Core has an answer for all three of its duties.
//
// WHAT IS DELIBERATELY ABSENT:
//
//   `object`   removed. No schema, no validation, no editor, and no meaning for
//              replication. Nothing shipped ever declared it.
//   `range`    not a shape: a `number` bounded at both ends. The Editor derives it.
//   `readonly` a display fallback, not a shape of value.
//   `vector2`  the Inspector already pairs `x` / `y` on one row.
//   `action`   a button is a command, not serializable data.

/** The shapes of value a Component property can declare. */
export const PropertyType = {
    NUMBER: 'number',
    INT: 'int',
    BOOLEAN: 'boolean',
    STRING: 'string',
    COLOR: 'color',
    ENUM: 'enum',
    /** A reference to a Resource, carried as its ResourceId (ADR-0020). */
    RESOURCE: 'resource',
    ARRAY: 'array'
};

const KNOWN = new Set(globalThis.Object.values(PropertyType));

/**
 * Tell whether a declared property type is one the Core supports.
 * @param {any} type - The declared type
 * @returns {boolean} True when known
 */
export function isPropertyType(type) {
    return KNOWN.has(type);
}

/**
 * Every supported property type.
 * @returns {string[]} The type names, in declaration order
 */
export function propertyTypes() {
    return [...KNOWN];
}

/**
 * The value a fresh instance starts a property at.
 *
 * A declared default is used as it is, except when it is a container: sharing one array
 * between every instance of a type is the kind of aliasing that shows up as two objects
 * mysteriously editing each other's state.
 *
 * `enum` has no fixed fallback — its first declared value is the only sensible one, and a
 * component that declares an enum without values has declared nothing.
 *
 * @param {object} property - The property descriptor
 * @returns {any} The starting value
 */
export function defaultForProperty(property) {
    const declared = property?.default;
    if (declared !== undefined) return copyValue(declared);

    switch (property?.type) {
        case PropertyType.NUMBER:
        case PropertyType.INT:
            return 0;
        case PropertyType.BOOLEAN:
            return false;
        case PropertyType.STRING:
        case PropertyType.COLOR:
            return '';
        case PropertyType.ENUM:
            return copyValue(property.values?.[0] ?? null);
        case PropertyType.RESOURCE:
            return null;
        case PropertyType.ARRAY:
            return [];
        default:
            return null;
    }
}

/**
 * Tell whether a value is acceptable for a property descriptor.
 *
 * Deliberately permissive about numbers within bounds: clamping belongs to the control
 * that produced the value, and rejecting a stored value would lose project data. What
 * this catches is a value of the wrong *shape* — a string where an array belongs.
 *
 * @param {object} property - The property descriptor
 * @param {any} value - The value to check
 * @returns {boolean} True when the value fits the declared shape
 */
export function isValidValue(property, value) {
    switch (property?.type) {
        case PropertyType.NUMBER:
            return typeof value === 'number' && globalThis.Number.isFinite(value);
        case PropertyType.INT:
            return typeof value === 'number' && globalThis.Number.isInteger(value);
        case PropertyType.BOOLEAN:
            return typeof value === 'boolean';
        case PropertyType.STRING:
        case PropertyType.COLOR:
            return typeof value === 'string';
        case PropertyType.ENUM:
            return (property.values ?? []).includes(value);
        // A resource reference is a ResourceId or nothing. It is not resolved here: the
        // Core never reaches storage (ADR-0020).
        case PropertyType.RESOURCE:
            return value === null || typeof value === 'string';
        case PropertyType.ARRAY:
            return globalThis.Array.isArray(value);
        default:
            return true;
    }
}

/**
 * Deep-copy a declared default so instances never share a container.
 * @param {any} value - The value to copy
 * @returns {any} A copy, or the value itself when it is a primitive
 */
export function copyValue(value) {
    if (globalThis.Array.isArray(value)) return value.map(copyValue);
    if (value && typeof value === 'object') {
        return globalThis.Object.fromEntries(
            globalThis.Object.entries(value).map(([key, item]) => [key, copyValue(item)])
        );
    }
    return value;
}
