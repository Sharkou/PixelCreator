// Component contract and registry (ADR-0004).
//
// There is no base class to extend. A component is any class, and the contract is
// duck-typed — that is what keeps writing one a ten-line affair:
//
//   export class Rotator {
//       static type = 'Rotator';                  // optional, see componentType()
//       static exposes = ['spin'];                // optional, see below
//       static schema = { speed: { type: 'number', default: 2 } };   // optional, ADR-0007
//
//       constructor(speed = 2) { this.speed = speed; }
//
//       update(self, ctx) { }                     // simulation, client and server
//       draw(self, renderer) { }                  // rendering, client only
//       bounds(self) { }                          // optional geometry, see below
//       onAttach(self) { }
//       onDetach(self) { }
//   }
//
// `active` — WHO READS IT, WHO WRITES IT.
//
// A component may carry an `active` property. It is an ordinary reactive property, with
// no special machinery behind it, and the rule about it is a rule about direction:
//
//   READ by the runtime and the scene renderer, to decide whether to run `update()` and
//   `draw()`. An absent `active` means active — a component does not have to declare it.
//
//   WRITTEN by user code, by a component, or by the Editor, through the normal Property
//   System. Never by the runtime.
//
// The runtime does not switch a component off, in particular not in reaction to an
// exception. Writing `active` is a model mutation like any other — it emits a Change and
// is replicable — so a runtime that did it would let a script's failure rewrite the
// simulation state, differently on each machine. Isolation and policy are separated for
// exactly this reason (ADR-0012).
//
// `bounds(self)` — AN OPTIONAL GEOMETRIC CAPABILITY, NOT A PICKING API.
//
// A component that genuinely has an extent may report it, in the object's local space,
// as `{ x, y, width, height }`. Components shipped with a size do (RectangleRenderer,
// Sprite, Tilemap); a particle system or a piece of pure logic does not, and must not
// be made to.
//
// This is not the selection system. Editor picking must also reach objects that carry no
// geometry at all, so it needs an editorial representation that `bounds()` alone cannot
// provide — and picking belongs to the Editor, not to the Core (docs/architecture/
// EDITOR.md). Nothing in the runtime calls `bounds()` today, and nothing should be built
// on top of it until the Editor's selection model is designed. Three kinds of geometry
// stay distinct: gameplay, rendering, and Editor picking.
//
// `self` is passed as an argument and never stored. A component holding a reference
// back to its Object would create a cycle and break serialization and replication.
//
// NO `#private` MEMBERS IN A COMPONENT.
//
// Attaching a component wraps it in a Proxy so its properties stay observable, and
// `this` inside its methods is therefore the proxy, not the raw instance. Private
// members are reachable only from the exact instance that declares them, so
// `this.#anything` throws "Receiver must be an instance of class X".
//
// The alternative — binding methods to the raw instance so private members work — is
// worse: `this.speed = 0` inside update() would then bypass the Proxy and silently stop
// notifying the Inspector. Losing reactivity without a sound is the exact class of bug
// v2 exists to remove, so the Proxy keeps `this` and components use ordinary methods.
//
// This costs nothing in practice: prototype methods are not own enumerable properties,
// so they are never serialized and never shown by the Inspector either way.
//
// `draw(self, renderer)` receives a rendering abstraction rather than reading a global
// 2D context, so a component such as a particle system can produce pixels without the
// notion of Component being coupled to Canvas 2D. The backend arrives in 2.8.
//
// `static exposes` opts a component into the Object facade: the listed properties become
// readable and writable as `object.<prop>` (ADR-0002). It stays opt-in because two
// components would otherwise collide on ordinary names like `speed` or `color`, and an
// Object's public surface would change unpredictably as components are added.

import { isMissingComponent, missingComponent } from './missing.js';
import { copyValue } from './properties/types.js';

/**
 * Resolve the type name that keys a component on an Object.
 *
 * `static type` is preferred over the constructor name, which minification rewrites.
 *
 * For a component born from a definition, `static type` is the ResourceId of that
 * definition and `static label` is the name a creator reads (ADR-0021). Nothing here
 * needs to know which of the two it is holding: the type is an opaque key.
 *
 * @param {Function|object} component - A component class or instance
 * @returns {string} The type name
 */
export function componentType(component) {
    if (typeof component === 'string') return component;

    // Guard the primitive case explicitly: every primitive has a constructor, so
    // componentType(42) would otherwise happily answer 'Number'.
    const isClass = typeof component === 'function';
    const isInstance = typeof component === 'object' && component !== null;
    if (!isClass && !isInstance) {
        throw new TypeError('componentType: expected a component class, instance or type name');
    }

    const ctor = isClass ? component : component.constructor;
    if (typeof ctor !== 'function') {
        throw new TypeError('componentType: expected a component class, instance or type name');
    }

    const type = ctor.type ?? ctor.name;
    if (!type) throw new TypeError('componentType: component class has no type name');
    return type;
}

/**
 * Read the property names a component publishes on its Object.
 * @param {Function|object} component - A component class or instance
 * @returns {Set<string>} The exposed property names, possibly empty
 */
export function componentExposes(component) {
    const ctor = typeof component === 'function' ? component : component?.constructor;
    const exposes = ctor?.exposes;
    if (!exposes) return new Set();
    if (!globalThis.Array.isArray(exposes)) {
        throw new TypeError(`${componentType(component)}: static exposes must be an array`);
    }
    return new Set(exposes);
}

/**
 * Read a component's optional property schema (ADR-0007).
 * @param {Function|object} component - A component class or instance
 * @returns {object|null} The schema, or null when the component does not declare one
 */
export function componentSchema(component) {
    const ctor = typeof component === 'function' ? component : component?.constructor;
    return ctor?.schema ?? null;
}

/**
 * Read the name a component type is shown under (ADR-0021).
 *
 * The type is an identity and may be an opaque ResourceId; the label is what a creator
 * reads. Renaming a definition rewrites the label alone, so no instance is touched.
 *
 * @param {Function|object} component - A component class, instance or type name
 * @returns {string} The displayed name, falling back to the type
 */
export function componentLabel(component) {
    if (typeof component === 'string') return component;
    const ctor = typeof component === 'function' ? component : component?.constructor;
    return ctor?.label ?? componentType(component);
}

/**
 * Write serialized values onto a component, filtered by its current schema.
 *
 * STRUCTURAL RECONCILIATION (S1, ADR-0021): a key the schema no longer declares is
 * dropped, a key it declares but the payload lacks keeps the constructor default. That is
 * ADR-0016 §4 — "a fresh instance has exactly the declared properties" — applied at load
 * time and not only at construction, and it is what makes a definition editable without
 * writing a migration.
 *
 * A component with no schema keeps everything it was given: the reflective path is a
 * requirement, not a tolerance (ADR-0007), and a beginner's component has no schema to
 * filter against.
 *
 * `active` is never filtered: it belongs to the Component contract rather than to any
 * schema (ADR-0004).
 *
 * @param {object} component - The component to fill
 * @param {object} [values] - Serialized values
 * @returns {object} The same component
 */
export function reconcileValues(component, values = {}) {
    const schema = componentSchema(component);
    const entries = globalThis.Object.entries(values ?? {});

    for (const [key, value] of entries) {
        if (key === 'active') {
            component.active = value;
            continue;
        }
        if (schema && !globalThis.Object.hasOwn(schema, key)) continue;
        // COPIED, FOR THE REASON `defaultForProperty()` COPIES A DECLARED DEFAULT: sharing
        // one array between two instances is the aliasing that shows up as two objects
        // mysteriously editing each other's state. One payload rebuilt twice — a scene
        // opened beside itself, an undo replaying a deleted subtree — would otherwise hand
        // both components the very same list. A primitive is returned as it is, so this
        // costs a type check on the values that are not containers.
        component[key] = copyValue(value);
    }

    return component;
}

/**
 * Build a component of a type, preserving its values when the type cannot be resolved.
 *
 * @param {object} registry - The registry to resolve the type in
 * @param {string} type - The component type name
 * @param {object} [values] - Serialized values
 * @returns {object} The component, or a MissingComponent carrying the values
 */
export function instantiateComponent(registry, type, values = {}) {
    const ComponentClass = registry?.get?.(type);
    const component = ComponentClass ? new ComponentClass() : missingComponent(type);
    return reconcileValues(component, values);
}

export { isMissingComponent, missingComponent };

/**
 * Registry of known component types.
 *
 * Deserialization resolves classes through a registry rather than by looking a name up
 * in a module namespace, which is what made Legacy fail silently whenever a component
 * was not re-exported from its aggregate module.
 */
export class ComponentRegistry {

    #types = new Map();

    /**
     * Register a component class.
     *
     * A name collision is refused, because two unrelated classes claiming one type name
     * is the bug this registry exists to catch. Redefining a type on purpose — a creator
     * editing their custom component in the Editor — is a different act and says so with
     * `replace`. It rebinds the name for what is created next; components already
     * attached to objects keep the class they were built from.
     *
     * @param {Function} ComponentClass - The class to register
     * @param {object} [options] - Options
     * @param {boolean} [options.replace] - Deliberately rebind a type name already taken
     * @returns {Function} The same class, so registration can wrap a declaration
     */
    register(ComponentClass, { replace = false } = {}) {
        if (typeof ComponentClass !== 'function') {
            throw new TypeError('ComponentRegistry.register: expected a class');
        }

        const type = componentType(ComponentClass);
        const existing = this.#types.get(type);
        if (existing && existing !== ComponentClass && !replace) {
            throw new Error(`ComponentRegistry: "${type}" is already registered by another class`);
        }

        this.#types.set(type, ComponentClass);
        return ComponentClass;
    }

    /**
     * Look a component class up.
     * @param {string} type - The type name
     * @returns {Function|undefined} The class, or undefined when unknown
     */
    get(type) {
        return this.#types.get(type);
    }

    /**
     * Tell whether a type is registered.
     * @param {string} type - The type name
     * @returns {boolean} True when known
     */
    has(type) {
        return this.#types.has(type);
    }

    /**
     * Instantiate a registered component with no constructor argument.
     * @param {string} type - The type name
     * @returns {object} A new component instance
     */
    create(type) {
        const ComponentClass = this.#types.get(type);
        if (!ComponentClass) {
            throw new Error(`ComponentRegistry: unknown component type "${type}"`);
        }
        return new ComponentClass();
    }

    /**
     * List registered type names.
     * @returns {string[]} The type names, sorted
     */
    types() {
        return [...this.#types.keys()].sort();
    }
}

/** Registry used by deserialization when no other one is supplied. */
export const components = new ComponentRegistry();
