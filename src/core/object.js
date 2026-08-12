// Object — the scene entity. Never renamed Entity (ADR-0001).
//
// An Object is a container: identity, hierarchy, components. Everything else lives in
// components, Transform included (ADR-0002). Legacy's editor concerns — mouse picking,
// selection outline, thumbnail generation — are not here; they belong to the Editor and
// are what made the Legacy Core impossible to load cleanly on a server.
//
// Renamed and dropped, since no v1 project needs preserving:
//   childs -> children      spelling
//   uid    -> owner         the field designates the owning player, not the object
//   static -> removed       declared in Legacy, never read
//
// Note on the implementation: an Object is returned wrapped in a Proxy, so internal
// state is kept under symbols rather than in `#private` fields. Private fields are not
// reachable through a Proxy, whereas symbol-keyed state is, and stays out of
// enumeration and serialization all the same.

import { createId } from './id.js';
import { makeReactive, observe, ownKeys, setOwner, setFacadeResolver } from './properties/reactive.js';
import { Origin } from './properties/origin.js';
import { Operations } from './operations/operations.js';
import { setPropertyOperation } from './operations/operation.js';
import { componentType, componentExposes } from './component.js';

const STATE = globalThis.Symbol('pixelcreator.object.state');

export class Object {

    /**
     * Create an object.
     * @param {string} [name] - Display name, free-form and not an identity (ADR-0010)
     * @param {object} [options] - Options
     * @param {string} [options.id] - Existing identifier, used when deserializing
     * @param {string} [options.tag] - Free-form tag used for lookups
     * @param {number} [options.layer] - Draw order
     * @param {string} [options.owner] - Identifier of the player owning this object
     */
    constructor(name = '', { id, tag = '', layer = 0, owner = null } = {}) {
        globalThis.Object.defineProperty(this, 'id', {
            value: id ?? createId(),
            enumerable: true,
            writable: false,
            configurable: false
        });

        this.name = name;
        this.tag = tag;
        this.layer = layer;
        this.active = true;
        this.visible = true;
        this.lock = false;
        this.owner = owner;

        globalThis.Object.defineProperty(this, STATE, {
            value: {
                components: new globalThis.Map(),
                /** Facade index: exposed property name -> providing component. */
                exposed: new globalThis.Map(),
                children: [],
                parent: null,
                scene: null,
                detachedOperations: null
            },
            enumerable: false,
            writable: false,
            configurable: false
        });

        const proxy = makeReactive(this);
        setFacadeResolver(proxy, prop => proxy[STATE].exposed.get(prop) ?? null);
        return proxy;
    }

    /**
     * The operation pipeline this object submits to.
     *
     * A scene owns one, because a scene is the unit of replication. An object that has
     * not joined a scene yet gets its own, so setProperty() keeps its full semantics —
     * operation built, authority traversed, Change emitted — instead of silently
     * degrading into a plain write.
     *
     * @returns {Operations} The pipeline
     */
    get operations() {
        const state = this[STATE];
        if (state.scene) return state.scene.operations;

        state.detachedOperations ??= new Operations({
            resolve: target => resolveTarget(this, target)
        });
        return state.detachedOperations;
    }

    /**
     * The scene this object belongs to, or null.
     * @returns {object|null} The scene
     */
    get scene() {
        return this[STATE].scene;
    }

    /**
     * The parent object, or null.
     * @returns {Object|null} The parent
     */
    get parent() {
        return this[STATE].parent;
    }

    /**
     * The child objects, as a snapshot in insertion order.
     * @returns {Object[]} The children
     */
    get children() {
        return [...this[STATE].children];
    }

    /**
     * The components, keyed by type name.
     * @returns {object} A frozen snapshot, so mutating it cannot corrupt the object
     */
    get components() {
        const snapshot = {};
        for (const [type, component] of this[STATE].components) snapshot[type] = component;
        return globalThis.Object.freeze(snapshot);
    }

    /**
     * Mutate a property through the Property System.
     *
     * This is the controlled path: it builds an Operation, submits it to authority, and
     * applies it only when allowed (ADR-0003, ADR-0008). Use it for an intent — an
     * Editor edit, a player action. Use a plain write (`object.x = 100`) for a
     * simulation output, which must not produce an Operation on every frame.
     *
     * The property may be provided by a component: `setProperty('x', 100)` targets
     * Transform when Transform exposes `x`.
     *
     * WARNING: this is not what setProperty() meant in Legacy, where it wrote `_x`
     * directly and did NOT replicate. Reasoning from Legacy by analogy will mislead.
     *
     * @param {string} prop - Property name
     * @param {any} value - New value
     * @param {object} [options] - Options
     * @param {string} [options.origin] - One of Origin, 'editor' by default
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object} { applied, operation, decision }, or { applied: false } when the value is unchanged
     */
    setProperty(prop, value, { origin = Origin.EDITOR, actor, batch } = {}) {
        const provider = this[STATE].exposed.get(prop) ?? null;
        const target = provider ?? this;
        const previous = target[prop];

        // Nothing changed: no Operation, nothing to replicate, nothing to undo.
        if (previous === value) return { applied: false, operation: null, decision: null };

        const operation = setPropertyOperation({
            target: { object: this.id, component: provider ? componentType(provider) : null },
            prop,
            value,
            previous,
            origin,
            actor,
            batch
        });

        return this.operations.submit(operation);
    }

    /**
     * Subscribe to property changes on this object.
     *
     * A property provided by a component is observable from the object too, so a view
     * can watch `object.x` without knowing Transform provides it. This is what keeps
     * every view in sync, letter by letter, from a single source of truth.
     *
     * @param {string|Function} prop - Property name, or the listener to observe every property
     * @param {Function} [listener] - Called with the Change
     * @returns {Function} Unsubscribe function
     */
    observe(prop, listener) {
        return observe(this, prop, listener);
    }

    /**
     * Attach a component.
     *
     * An object holds at most one component of a given type. Adding a second one throws
     * rather than replacing it silently, because a silent replacement discards state and
     * is exactly the kind of accident v2 should surface.
     *
     * @param {object} component - The component instance
     * @returns {object} The component, made reactive
     */
    addComponent(component) {
        if (!component || typeof component !== 'object') {
            throw new TypeError('addComponent: expected a component instance');
        }

        const state = this[STATE];
        const type = componentType(component);

        if (state.components.has(type)) {
            throw new Error(`addComponent: "${type}" is already attached to object ${this.id}`);
        }

        const exposes = componentExposes(component);
        for (const prop of exposes) {
            if (ownKeys(this).includes(prop)) {
                throw new Error(
                    `addComponent: "${type}" exposes "${prop}", which object ${this.id} already ` +
                    'holds as its own property. That would create two sources of truth.'
                );
            }
            const conflicting = state.exposed.get(prop);
            if (conflicting) {
                throw new Error(
                    `addComponent: "${type}" and "${componentType(conflicting)}" both expose "${prop}". ` +
                    'Reach the property through getComponent() instead.'
                );
            }
        }

        const reactive = makeReactive(component);
        setOwner(reactive, this, exposes);
        installComponentSetProperty(this, reactive, type);

        state.components.set(type, reactive);
        for (const prop of exposes) state.exposed.set(prop, reactive);

        reactive.onAttach?.(this);
        return reactive;
    }

    /**
     * Detach a component.
     * @param {string|Function|object} component - Type name, class or instance
     * @returns {boolean} True when a component was detached
     */
    removeComponent(component) {
        const state = this[STATE];
        const type = componentType(component);
        const attached = state.components.get(type);
        if (!attached) return false;

        for (const [prop, provider] of [...state.exposed]) {
            if (provider === attached) state.exposed.delete(prop);
        }
        state.components.delete(type);

        attached.onDetach?.(this);
        setOwner(attached, null, null);
        return true;
    }

    /**
     * Read an attached component.
     * @param {string|Function|object} component - Type name, class or instance
     * @returns {object|undefined} The component, or undefined when not attached
     */
    getComponent(component) {
        return this[STATE].components.get(componentType(component));
    }

    /**
     * Tell whether a component type is attached.
     * @param {string|Function|object} component - Type name, class or instance
     * @returns {boolean} True when attached
     */
    hasComponent(component) {
        return this[STATE].components.has(componentType(component));
    }

    /**
     * Attach a child, detaching it from its previous parent when needed.
     * @param {Object} child - The object to attach
     * @returns {Object} The child
     */
    addChild(child) {
        if (!child || typeof child !== 'object') {
            throw new TypeError('addChild: expected an object');
        }
        if (child === this) {
            throw new Error('addChild: an object cannot be its own child');
        }
        if (isAncestorOf(child, this)) {
            throw new Error(`addChild: attaching ${child.id} to ${this.id} would create a cycle`);
        }

        child.parent?.removeChild(child);

        this[STATE].children.push(child);
        child[STATE].parent = this;
        return child;
    }

    /**
     * Detach a child.
     * @param {Object} child - The object to detach
     * @returns {boolean} True when the child was attached
     */
    removeChild(child) {
        const children = this[STATE].children;
        const index = children.indexOf(child);
        if (index === -1) return false;

        children.splice(index, 1);
        child[STATE].parent = null;
        return true;
    }
}

/**
 * Internal wiring: bind an object to a scene, or detach it.
 * @param {Object} object - The object
 * @param {object|null} scene - The scene, or null
 */
export function attachToScene(object, scene) {
    object[STATE].scene = scene;
}

/**
 * Internal wiring: resolve an operation target within an object.
 * @param {Object} object - The object
 * @param {object} target - { object: id, component: type name or null }
 * @returns {object|null} The reactive target, or null when it does not match
 */
export function resolveTarget(object, target) {
    if (target.object !== object.id) return null;
    return target.component ? object.getComponent(target.component) ?? null : object;
}

function installComponentSetProperty(owner, component, type) {
    // Components are plain classes with no base class, so the controlled write path is
    // installed on attachment instead of inherited. Non-enumerable, so it never reaches
    // enumeration or serialization.
    globalThis.Object.defineProperty(component, 'setProperty', {
        value(prop, value, { origin = Origin.EDITOR, actor, batch } = {}) {
            const previous = component[prop];
            if (previous === value) return { applied: false, operation: null, decision: null };

            const operation = setPropertyOperation({
                target: { object: owner.id, component: type },
                prop,
                value,
                previous,
                origin,
                actor,
                batch
            });
            return owner.operations.submit(operation);
        },
        enumerable: false,
        writable: true,
        configurable: true
    });
}

function isAncestorOf(candidate, object) {
    for (let current = object; current; current = current.parent) {
        if (current === candidate) return true;
    }
    return false;
}
