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

/**
 * Resolve the type name that keys a component on an Object.
 *
 * `static type` is preferred over the constructor name, which minification rewrites.
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
     * @param {Function} ComponentClass - The class to register
     * @returns {Function} The same class, so registration can wrap a declaration
     */
    register(ComponentClass) {
        if (typeof ComponentClass !== 'function') {
            throw new TypeError('ComponentRegistry.register: expected a class');
        }

        const type = componentType(ComponentClass);
        const existing = this.#types.get(type);
        if (existing && existing !== ComponentClass) {
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
