// Component definitions — a Component type described as data (ADR-0016, ADR-0021).
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
//   { type: 'res_c3', label: 'Controller',
//     properties: { speed: { type: 'number', default: 120 } }, graph: 'res_d4' }
//
// `defineComponent()` turns that record into an ordinary component class. Ordinary is the
// point: it goes into the ComponentRegistry, `addComponent()` attaches it, the Inspector
// reads its schema, serialization writes its properties, and nothing downstream can tell
// it was born from data rather than from a file. There is no second kind of Component.
//
// IDENTITY IS NOT A NAME (ADR-0021, and ADR-0010 applied past the game).
//
//   `type`    the stable identity. For a shipped component it is the class's own name,
//             which is code and therefore stable by nature. For a component a creator
//             made it is the ResourceId of its definition — opaque, minted once, never
//             edited. It is what `object.components` is keyed by, what serialization
//             writes, and what `behaviors` binds to.
//   `label`   what a creator reads. Freely editable. Renaming rewrites one field of one
//             resource, and touches no instance, no scene and no saved project.
//
// The asymmetry is deliberate: a shipped component's name is source code, a creator's
// component's name is data, and only the second one can change under you.
//
// THE DEFINITION BELONGS TO THE TYPE, NEVER TO THE INSTANCE.
// The schema and the graph reference live on the class. An instance carries its property
// values and nothing else, so a scene holding a thousand Controllers stores a thousand
// `speed` values and exactly one graph reference — and a snapshot or a replicated payload
// never carries a behavior.
//
// THE GRAPH IS REFERENCED, NOT INLINED (ADR-0016 as amended by ADR-0020).
// `graph` is a ResourceId, so a graph is a resource like any other: openable on its own in
// the Graph window, stored once, diffed on its own. The Core never resolves it and never
// reads it — resolving belongs to the Project layer, interpreting to the Runtime.
//
// A NEW INSTANCE HAS EXACTLY THE DECLARED PROPERTIES.
// Every schema key exists on a fresh instance, with its declared default. That is what
// makes the Inspector, serialization and the graph agree on what a Controller *is*, and
// it removes the drift ADR-0007 warns about, where a schema declares `speed` and the
// constructor forgot it.

import { defaultForProperty, isPropertyType } from './properties/types.js';

/**
 * A Component type, as data.
 *
 * @typedef {object} ComponentDefinition
 * @property {string} type - Stable identity: a ResourceId for a creator's component
 * @property {string} [label] - Displayed name; the type itself when absent
 * @property {object} [properties] - Property schema, in the ADR-0007 shape
 * @property {string|null} [graph] - ResourceId of the `.px` graph that is this behavior
 * @property {number} [revision] - Bumped when the definition changes, for invalidation
 * @property {string} [icon] - Icon name, honoured by the Editor
 * @property {string} [category] - Menu group, honoured by the Editor
 */

/**
 * Build a component class from a definition.
 *
 * @param {ComponentDefinition} definition - The definition
 * @returns {Function} A component class, ready to register and to attach
 */
export function defineComponent(definition) {
    const {
        type,
        label,
        properties = {},
        graph = null,
        revision = 1,
        icon,
        category
    } = definition ?? {};

    if (typeof type !== 'string' || type === '') {
        throw new TypeError('defineComponent: a definition needs a type');
    }
    if (label !== undefined && (typeof label !== 'string' || label === '')) {
        throw new TypeError(`defineComponent: the label of "${type}" must be a non-empty string`);
    }
    if (typeof properties !== 'object' || properties === null) {
        throw new TypeError(`defineComponent: "${type}" needs properties as an object`);
    }

    for (const [name, property] of globalThis.Object.entries(properties)) {
        if (typeof property !== 'object' || property === null) {
            throw new TypeError(`defineComponent: "${type}.${name}" must describe a property`);
        }
        // The Core answers three questions about a property — what does it start at, is a
        // value valid, how does it serialize — and it can answer none of them for a type
        // it does not know (ADR-0023). Refusing here is what stops a definition from
        // declaring a property the Inspector will silently show as read-only forever.
        if (!isPropertyType(property.type)) {
            throw new TypeError(
                `defineComponent: "${type}.${name}" declares unknown property type "${property.type}"`
            );
        }
    }

    // A ResourceId, or nothing. An inline graph is refused rather than tolerated: two
    // copies of one graph is a class of bug found late, and the Graph window has to be
    // able to open a graph without loading the definition that uses it (ADR-0016).
    if (graph !== null && typeof graph !== 'string') {
        throw new TypeError(
            `defineComponent: the graph of "${type}" must be a ResourceId or null, not an inline graph`
        );
    }

    const Component = class {
        static type = type;
        static label = label ?? type;
        static schema = properties;
        static definition = definition;
        static revision = revision;

        constructor() {
            for (const [name, property] of globalThis.Object.entries(properties)) {
                this[name] = defaultForProperty(property);
            }
        }
    };

    if (icon !== undefined) Component.icon = icon;
    if (category !== undefined) Component.category = category;

    // Named for stack traces and for anything that falls back to the constructor name;
    // `static type` is what actually keys the component (ADR-0004).
    globalThis.Object.defineProperty(Component, 'name', { value: label ?? type });

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
 * Read the ResourceId of the graph a component type's behavior lives in.
 *
 * The Core hands the identifier over and stops there. Resolving it into a graph belongs to
 * the Project layer, interpreting the graph to the Runtime (ADR-0015, ADR-0020).
 *
 * @param {Function|object} component - A component class or instance
 * @returns {string|null} The graph's ResourceId, or null
 */
export function componentGraphId(component) {
    return componentDefinition(component)?.graph ?? null;
}
