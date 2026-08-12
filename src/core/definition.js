// Component definitions — a Component type described as data (ADR-0016).
//
// A Component is properties + behavior:
//
//   Controller.px
//        ↓
//   Component Controller
//   ├── properties     the schema, and therefore what serializes (ADR-0007)
//   └── behavior       the `.px` graph bound to the type (ADR-0015)
//
// A shipped component writes that in JavaScript: a class with a `static schema` and
// methods. A component a creator makes in the Editor cannot be a hand-written class, so
// it is described as a plain record instead — the same two halves, expressed as data:
//
//   { type: 'Controller', properties: { speed: { type: 'number', default: 120 } }, graph }
//
// `defineComponent()` turns that record into an ordinary component class. Ordinary is the
// point: it goes into the ComponentRegistry, `addComponent()` attaches it, the Inspector
// reads its schema, serialization writes its properties, and nothing downstream can tell
// it was born from data rather than from a file. There is no second kind of Component.
//
// THE DEFINITION BELONGS TO THE TYPE, NEVER TO THE INSTANCE.
// The schema and the graph live on the class. An instance carries its property values and
// nothing else, so a scene holding a thousand Controllers stores a thousand `speed`
// values and exactly one graph — and a snapshot or a replicated payload never carries a
// behavior. This file therefore holds no graph logic at all: the graph is data passing
// through, interpreted by the runtime, which the core does not depend on.
//
// A NEW INSTANCE HAS EXACTLY THE DECLARED PROPERTIES.
// Every schema key exists on a fresh instance, with its declared default. That is what
// makes the Inspector, serialization and the graph agree on what a Controller *is*, and
// it removes the drift ADR-0007 warns about, where a schema declares `speed` and the
// constructor forgot it.

/**
 * A Component type, as data.
 *
 * @typedef {object} ComponentDefinition
 * @property {string} type - Type name, unique within a project
 * @property {object} [properties] - Property schema, in the ADR-0007 shape
 * @property {object|null} [graph] - The `.px` graph that is this type's behavior
 */

/** Fallback values, used when a property declares no explicit default. */
const DEFAULTS = {
    number: 0,
    int: 0,
    boolean: false,
    string: '',
    color: '',
    array: () => [],
    object: () => ({})
};

/**
 * Build a component class from a definition.
 *
 * @param {ComponentDefinition} definition - The definition
 * @returns {Function} A component class, ready to register and to attach
 */
export function defineComponent(definition) {
    const { type, properties = {}, graph = null } = definition ?? {};

    if (typeof type !== 'string' || type === '') {
        throw new TypeError('defineComponent: a definition needs a type name');
    }
    if (typeof properties !== 'object' || properties === null) {
        throw new TypeError(`defineComponent: "${type}" needs properties as an object`);
    }
    for (const [name, property] of globalThis.Object.entries(properties)) {
        if (typeof property !== 'object' || property === null) {
            throw new TypeError(`defineComponent: "${type}.${name}" must describe a property`);
        }
    }
    if (graph !== null && (typeof graph !== 'object' || globalThis.Array.isArray(graph))) {
        throw new TypeError(`defineComponent: the graph of "${type}" must be a graph resource or null`);
    }

    const Component = class {
        static type = type;
        static schema = properties;
        static definition = definition;

        constructor() {
            for (const [name, property] of globalThis.Object.entries(properties)) {
                this[name] = defaultValue(property);
            }
        }
    };

    // Named for stack traces and for anything that falls back to the constructor name;
    // `static type` is what actually keys the component (ADR-0004).
    globalThis.Object.defineProperty(Component, 'name', { value: type });

    return Component;
}

/**
 * Read the definition a component type was built from.
 *
 * @param {Function|object} component - A component class or instance
 * @returns {ComponentDefinition|null} The definition, or null for a hand-written component
 */
export function componentDefinition(component) {
    const ctor = typeof component === 'function' ? component : component?.constructor;
    return ctor?.definition ?? null;
}

/**
 * The value a fresh instance starts a property at.
 *
 * A declared default is used as it is, except when it is a container: sharing one array
 * between every instance of a type is the kind of aliasing that shows up as two objects
 * mysteriously editing each other's state.
 *
 * @param {object} property - The property descriptor
 * @returns {any} The starting value
 */
function defaultValue(property) {
    const declared = property.default;
    if (declared !== undefined) return copy(declared);

    const fallback = DEFAULTS[property.type];
    if (typeof fallback === 'function') return fallback();
    return fallback ?? null;
}

function copy(value) {
    if (globalThis.Array.isArray(value)) return value.map(copy);
    if (value && typeof value === 'object') {
        return globalThis.Object.fromEntries(
            globalThis.Object.entries(value).map(([key, item]) => [key, copy(item)])
        );
    }
    return value;
}
