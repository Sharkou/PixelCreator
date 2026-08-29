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

import { OBJECT_COMPONENT, componentDefinition, declaredProperties, objectProperties } from '../core/mod.js';
import { baseNameOf } from '../project/mod.js';
import { registerBuiltIns } from '../runtime/mod.js';

// RE-EXPORTED, NOT REDECLARED. Installing the shipped types moved to `runtime/builtins.js`
// the day the game client needed it too (ADR-0042 §2); the Editor goes on offering the same
// call from the same place it always did.
//
// THE LIST ITSELF IS NOT RE-EXPORTED, and that is the correction. `BUILT_IN` used to travel
// from `runtime/builtins.js` through `runtime/mod.js`, through this file, and out of
// `editor/mod.js` — four modules to reach nobody: nothing in the repository ever read it.
// A name that crosses a barrel without a consumer is pure risk, because the only thing it
// can ever do is fail to link. Whoever needs the list one day imports it from the module
// that owns it, which is what `nodes.test.js` already does with `STANDARD_NODES`.
export { registerBuiltIns };

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
 * How a component type is presented in the Editor.
 *
 * THREE ANSWERS TO ONE QUESTION, IN THE ORDER THEY DESERVE TO WIN:
 *
 *   the label the definition CARRIES   what a creator chose to call the type
 *   the resource's name                what a `.px` is called when it was never renamed AS a type
 *   the shipped table, then the type   for a class, which has no resource
 *
 * WHY THE MIDDLE ONE IS RESOLVED HERE AND NEVER STORED. A `.px` is a resource and a type at
 * once (ADR-0026), and the two carry different names for a reason ADR-0021 is explicit
 * about: the identity is the ResourceId, the name is data a creator edits. Copying the name
 * into the definition — which is what creating one used to do — makes a third thing that is
 * true only until the next rename, and `Add Component` went on offering `New Component.px`
 * after the Project panel had shown `Counter.px` for an hour. Reading the manifest at the
 * moment the name is drawn has no copy to go stale.
 *
 * WITHOUT THE EXTENSION, because this names a TYPE. `Counter.px` is the file; `Counter` is
 * the Component, and it stands in a menu beside `Sprite` and `Transform`, which are not
 * spelled with the language they were written in either.
 *
 * A LABEL THAT WAS REALLY CHOSEN STILL WINS. `setLabel()` exists on the model and a `.px`
 * authored elsewhere may carry one; renaming the file then leaves it alone, which is what
 * having two fields means.
 *
 * AND AN IDENTITY IS NEVER A NAME (ADR-0021, ADR-0046 §5). A `.px` is keyed by its own
 * ResourceId, so falling through to the type is falling through to a twelve-character
 * string a creator has never seen — which is exactly what a deleted file produced: the
 * Component stayed on the Object and its section was titled `ffs2qex9nw0v`. A type nothing
 * can name is reported as missing, because that is what it is.
 *
 * @param {string} type - The component type name
 * @param {object} [registry] - Registry to resolve the class in
 * @param {object} [options] - Options
 * @param {object} [options.project] - Consulted for a `.px`'s current name
 * @returns {{type: string, label: string, category: string}} Its presentation
 */
export function describeType(type, registry = defaultRegistry, { project = null } = {}) {
    const ComponentClass = registry.get(type);
    const shipped = SHIPPED[type];

    return {
        type,
        label: componentDefinition(ComponentClass)?.label
            || resourceName(type, project)
            || shipped?.label
            || classLabel(ComponentClass, type)
            || (isFile(ComponentClass) ? MISSING_LABEL : type),
        category: ComponentClass?.category ?? shipped?.category ?? 'Other'
    };
}

/** What a Component whose file cannot be found is called, since its name lived in the file. */
export const MISSING_LABEL = 'Missing Component';

/**
 * Whether this class came from a `.px` rather than from the engine.
 *
 * `static definition` is what `defineComponent()` stamps on a class it builds from a
 * project payload; a shipped Component declares `static schema` and no definition. That is
 * the only honest way to ask "is this type's name supposed to come from a file", and it is
 * what separates a deleted `.px` from a hand-written class whose type name reads fine.
 *
 * @param {Function|null} ComponentClass - The class, when there is one
 * @returns {boolean} True when the type is a project resource
 */
function isFile(ComponentClass) {
    return Boolean(componentDefinition(ComponentClass));
}

/**
 * The name a class gives itself, when it is a name and not its own identity.
 *
 * A `.px` installed with no label of its own is stamped with its ResourceId
 * (project/definitions.js), so `label === type` means "nobody has named this".
 *
 * @param {Function|null} ComponentClass - The class, when there is one
 * @param {string} type - The type name it is registered under
 * @returns {string|null} Its label, or null when it has none worth showing
 */
function classLabel(ComponentClass, type) {
    const label = ComponentClass?.label ?? null;
    return label && label !== type ? label : null;
}

/**
 * What the project calls a type, when the type is one of its resources.
 *
 * @param {string} type - The component type name, which for a `.px` is its ResourceId
 * @param {object|null} project - The project, when the caller has one
 * @returns {string|null} Its name without the extension, or null
 */
function resourceName(type, project) {
    const resource = project?.get?.(type) ?? null;
    return resource ? baseNameOf(resource) || null : null;
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
 * @param {object} [options] - Options
 * @param {object} [options.project] - Consulted so a renamed `.px` reads as its new name
 * @returns {Array<{type: string, label: string, properties: object[]}>} The catalogue
 */
export function componentCatalogue(registry = defaultRegistry, { project = null } = {}) {
    return [
        // THE OBJECT ITSELF, FIRST, AND IT IS NOT IN THE REGISTRY (ADR-0043). `name`, `tag`,
        // `layer` and `active` belong to the Object rather than to any component, so nothing
        // registers them and the property picker could not see them at all — the four fields
        // a beginner meets FIRST, in the Inspector's own header, were the four a graph could
        // not touch. It leads the list because it is the outermost thing a creator points at:
        // `Object ▸ Name`, then `Transform ▸ X`, then whatever the object is made of.
        //
        // IT IS A CATALOGUE ENTRY AND NEVER A REGISTRY ONE, which is what keeps it out of Add
        // Component: `availableComponents()` reads the registry, and an Object is not
        // something you can give to an Object.
        { type: OBJECT_COMPONENT, label: OBJECT_COMPONENT, properties: objectProperties() },
        ...registry.types().map(type => ({
            type,
            label: describeType(type, registry, { project }).label,
            properties: declaredProperties(registry.get(type))
        }))
    ];
}

/**
 * Group type names for a menu, in category order.
 *
 * @param {string[]} types - Type names to arrange
 * @param {object} [registry] - Registry to resolve the classes in
 * @param {object} [options] - Options
 * @param {object} [options.project] - Consulted so a renamed `.px` reads as its new name
 * @returns {object[]} `{ category, entries }` groups, empty ones dropped
 */
export function groupTypes(types, registry = defaultRegistry, { project = null } = {}) {
    const described = types.map(type => describeType(type, registry, { project }));
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
