// Which component types this application knows about, and how the Add menu reads them.
//
// Registration is an APPLICATION concern, not a library one. `core/component.js` ships
// the registry empty and nothing registers itself on import: a server, a headless test
// and the Editor do not need the same set, and a module with a registration side effect
// cannot be imported without accepting it.
//
// This is also the seam a project's own component definitions come through (ADR-0016):
// `components.register(defineComponent(definition))` puts a creator's Component in the
// very same registry, and from here on nothing can tell the two apart.
//
// PRESENTATION IS EDITOR-SIDE, AND ONLY EDITOR-SIDE. A creator opening the menu should
// read "Rendering ▸ Rectangle", not "RectangleRenderer". `CONVENTIONS.md` gives a
// component `static category` for exactly this and it is honoured first, so a component
// somebody writes can place itself; the tables below only stand in for the shipped types,
// which do not declare one. Nothing in `runtime/` is edited to make a menu read better —
// and grouping is the whole of the change. It does NOT say an Object has one renderer:
// several renderers on one Object still work and still all draw.

import { components as defaultRegistry, declaredProperties, Transform } from '../core/mod.js';
import { Camera, ParticleSystem, RectangleRenderer, Sprite, Tilemap } from '../runtime/mod.js';

/** The component types shipped with the engine. */
export const BUILT_IN = [Transform, RectangleRenderer, Sprite, ParticleSystem, Tilemap, Camera];

/** Groups, in the order the menu shows them. Anything unclaimed lands in the last one. */
export const CATEGORIES = ['Rendering', 'Scene', 'Other'];

const SHIPPED = {
    Transform: { category: 'Scene', label: 'Transform' },
    RectangleRenderer: { category: 'Rendering', label: 'Rectangle' },
    Sprite: { category: 'Rendering', label: 'Sprite' },
    ParticleSystem: { category: 'Rendering', label: 'Particles' },
    Tilemap: { category: 'Rendering', label: 'Tilemap' },
    Camera: { category: 'Scene', label: 'Camera' }
};

/**
 * Register the engine's component types.
 * @param {object} [registry] - The registry to fill
 * @returns {object} The registry
 */
export function registerBuiltIns(registry = defaultRegistry) {
    for (const ComponentClass of BUILT_IN) registry.register(ComponentClass);
    return registry;
}

/**
 * How a component type is presented in the Editor.
 * @param {string} type - The component type name
 * @param {object} [registry] - Registry to resolve the class in
 * @returns {{type: string, label: string, category: string}} Its presentation
 */
export function describeType(type, registry = defaultRegistry) {
    const ComponentClass = registry.get(type);
    const shipped = SHIPPED[type];

    return {
        type,
        label: ComponentClass?.label ?? shipped?.label ?? type,
        category: ComponentClass?.category ?? shipped?.category ?? 'Other'
    };
}

/**
 * The Component types this session knows about, as a graph node reads them.
 *
 * A node that names a Component needs three things about each type: the identity it stores,
 * the name a creator picks from, and the properties that type declares — which is what
 * types its ports and fills its second picker (ADR-0034 §3.3). It is derived on demand
 * rather than held: the registry is what installs a `.px`, and a catalogue kept beside it
 * would be a second thing to keep in step.
 *
 * @param {object} [registry] - The registry to read
 * @returns {Array<{type: string, label: string, properties: object[]}>} The catalogue
 */
export function componentCatalogue(registry = defaultRegistry) {
    return registry.types().map(type => ({
        type,
        label: describeType(type, registry).label,
        properties: declaredProperties(registry.get(type))
    }));
}

/**
 * Group type names for a menu, in category order.
 *
 * @param {string[]} types - Type names to arrange
 * @param {object} [registry] - Registry to resolve the classes in
 * @returns {object[]} `{ category, entries }` groups, empty ones dropped
 */
export function groupTypes(types, registry = defaultRegistry) {
    const described = types.map(type => describeType(type, registry));
    const order = [...CATEGORIES];

    // A category a creator invented takes its place after the known ones rather than
    // being flattened into "Other" — they named it for a reason.
    for (const entry of described) {
        if (!order.includes(entry.category)) order.splice(order.length - 1, 0, entry.category);
    }

    return order
        .map(category => ({
            category,
            entries: described
                .filter(entry => entry.category === category)
                .sort((first, second) => first.label.localeCompare(second.label))
        }))
        .filter(group => group.entries.length > 0);
}
