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
//     properties: { speed: { type: 'number', default: 120 } },
//     graph: { version: 1, nodes: [], connections: [] } }
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
// THE DEFINITION AND ITS GRAPH ARE ONE RESOURCE (ADR-0016 as amended by ADR-0026).
// `MyComponent.px` IS the component: its identity, its properties and its behaviour, in
// one payload. `graph` therefore holds the graph itself, not an identifier.
//
// This reverses the earlier rule, and the reason the earlier rule existed is the reason
// the reversal is safe. A ResourceId was required so that one graph could not be copied
// into two places and so the Graph window could open a graph without loading a definition.
// With ONE resource there is exactly one copy — the payload — and opening the graph IS
// opening the `.px`. What the id bought is now structural rather than enforced.
//
// The Core still neither resolves nor interprets: it hands the graph over as data, the
// Project layer reads the payload, the Runtime runs it (ADR-0015, ADR-0020).
//
// A NEW INSTANCE HAS EXACTLY THE DECLARED PROPERTIES.
// Every schema key exists on a fresh instance, with its declared default. That is what
// makes the Inspector, serialization and the graph agree on what a Controller *is*, and
// it removes the drift ADR-0007 warns about, where a schema declares `speed` and the
// constructor forgot it.

import { componentSchema } from './component.js';
import { defaultForProperty, isPropertyType } from './properties/types.js';

/**
 * A Component type, as data.
 *
 * @typedef {object} ComponentDefinition
 * @property {string} type - Stable identity: a ResourceId for a creator's component
 * @property {string} [label] - Displayed name; the type itself when absent
 * @property {object} [properties] - Property schema, in the ADR-0007 shape
 * @property {object|null} [graph] - The behaviour graph itself, carried in this payload
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

    // The graph itself, or nothing. A STRING IS REFUSED, and the message says why: an
    // identifier here meant a second resource for one thing a creator thinks of as one
    // file, which is exactly what ADR-0026 removed. An array is refused too — a graph is a
    // record with nodes, not a list.
    if (graph !== null && (typeof graph !== 'object' || globalThis.Array.isArray(graph))) {
        throw new TypeError(
            `defineComponent: the graph of "${type}" must be a graph object or null`
            + (typeof graph === 'string' ? ' — a `.px` carries its graph, it does not point at one' : '')
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
 * The properties a component type declares, as everything that addresses them reads them.
 *
 * A `.px` carries an `id` inside every descriptor, minted once, and that is what a graph
 * node stores — so renaming a property leaves the graph wired (ADR-0027). A hand-written
 * class with a `static schema` has no such ids, so its property names stand in: a graph
 * bound to a shipped component still works, and nothing had to be added to that component.
 *
 * IT LIVES HERE BECAUSE TWO CALLERS NEED THE SAME ANSWER. The interpreter reads it for the
 * component a graph belongs to; a node that reaches another Object reads it for the
 * component it found there (ADR-0034 §3.3). Written twice, the two would eventually
 * disagree about what a property IS.
 *
 * @param {Function|object} component - A component class or instance
 * @returns {object[]} Descriptors carrying `id` and `name`, in declaration order
 */
export function declaredProperties(component) {
    const declared = componentDefinition(component)?.properties ?? componentSchema(component) ?? {};

    return globalThis.Object.entries(declared).map(([name, descriptor]) => ({
        ...descriptor,
        id: descriptor?.id ?? name,
        name
    }));
}

/**
 * Read the behaviour graph a component type carries.
 *
 * The Core hands the graph over as data and stops there: interpreting it belongs to the
 * Runtime, and reading the resource it came from to the Project layer (ADR-0015, ADR-0020,
 * ADR-0026).
 *
 * @param {Function|object} component - A component class or instance
 * @returns {object|null} The graph, or null when the type carries none
 */
export function componentGraph(component) {
    return componentDefinition(component)?.graph ?? null;
}
