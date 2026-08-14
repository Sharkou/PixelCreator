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
import { OperationType, setPropertyOperation } from './operations/operation.js';
import {
    componentType,
    componentExposes,
    instantiateComponent,
    components as defaultRegistry
} from './component.js';

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
                /** Announces structural changes to the scene; see attachToScene(). */
                notify: null,
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

        if (!state.detachedOperations) {
            state.detachedOperations = new Operations({
                resolve: target => resolveTarget(this, target)
            });
            // Component operations target this object alone; the hierarchy ones need a
            // Scene to resolve a parent, so a detached object cannot carry them.
            registerComponentHandlers(
                state.detachedOperations,
                id => (id === this.id ? this : null),
                { registry: defaultRegistry }
            );
        }
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
     * The components, keyed by type name, IN THEIR COLLECTION ORDER (ADR-0018).
     *
     * The shape is unchanged on purpose — every reader written against it still works —
     * but the key order is now meaningful rather than incidental: it is the order the
     * runtime runs `update()` in, the order the scene renderer runs `draw()` in, the
     * order the Inspector shows, and the order that is persisted.
     *
     * `Object.keys()` on a plain object preserves insertion order for non-numeric string
     * keys, and a component type is never a numeric string, so the snapshot carries the
     * order faithfully.
     *
     * @returns {object} A frozen snapshot, so mutating it cannot corrupt the object
     */
    get components() {
        const snapshot = {};
        for (const [type, component] of this[STATE].components) snapshot[type] = component;
        return globalThis.Object.freeze(snapshot);
    }

    /**
     * The component type names, in collection order.
     * @returns {string[]} The type names
     */
    componentTypes() {
        return [...this[STATE].components.keys()];
    }

    /**
     * The components themselves, in collection order.
     * @returns {object[]} The components
     */
    componentList() {
        return [...this[STATE].components.values()];
    }

    /**
     * The rank of a component within the ordered collection.
     * @param {string|Function|object} component - Type name, class or instance
     * @returns {number} The index, or -1 when not attached
     */
    componentIndex(component) {
        return this.componentTypes().indexOf(componentType(component));
    }

    /**
     * Move a component to another rank in the collection.
     *
     * Nothing is detached, nothing is re-instantiated, no value is touched — this is a
     * splice on the ordered collection. That is the difference between reordering and
     * "remove then add again", which loses the values and the rank both (ADR-0018).
     *
     * @param {string|Function|object} component - Type name, class or instance
     * @param {number} index - The rank to move it to; clamped to the collection
     * @returns {boolean} True when the order changed
     */
    moveComponent(component, index) {
        const type = componentType(component);
        const state = this[STATE];
        if (!state.components.has(type)) return false;

        const from = this.componentIndex(type);
        const to = clampIndex(index, state.components.size - 1);
        if (from === to) return false;

        reorderComponent(state, type, to);
        state.notify?.('component:moved', { object: this, type, index: to, previousIndex: from });
        return true;
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
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank in the ordered collection; appended when omitted
     * @returns {object} The component, made reactive
     */
    addComponent(component, { index } = {}) {
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

        insertComponent(state, type, reactive, index);
        for (const prop of exposes) state.exposed.set(prop, reactive);

        reactive.onAttach?.(this);
        state.notify?.('component:added', {
            object: this,
            component: reactive,
            type,
            index: this.componentIndex(type)
        });
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

        const index = this.componentIndex(type);

        for (const [prop, provider] of [...state.exposed]) {
            if (provider === attached) state.exposed.delete(prop);
        }
        state.components.delete(type);

        attached.onDetach?.(this);
        setOwner(attached, null, null);
        state.notify?.('component:removed', { object: this, component: attached, type, index });
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
     * The rank of a child within this object's ordered children.
     * @param {Object} child - The child
     * @returns {number} The index, or -1 when it is not a child of this object
     */
    childIndex(child) {
        return this[STATE].children.indexOf(child);
    }

    /**
     * Attach a child, detaching it from its previous parent when needed.
     *
     * KEEPS THE LOCAL TRANSFORM, deliberately. This is what a script expects when it
     * parents a bullet to a turret. Preserving the *world* placement instead is an editor
     * policy, composed as a batch of Operations by the Editor (ADR-0022), never hidden
     * inside the Core.
     *
     * @param {Object} child - The object to attach
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank among the children; appended when omitted
     * @returns {Object} The child
     */
    addChild(child, { index } = {}) {
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
        linkChild(this, child, index);
        return child;
    }

    /**
     * Detach a child.
     * @param {Object} child - The object to detach
     * @returns {boolean} True when the child was attached
     */
    removeChild(child) {
        return unlinkChild(this, child);
    }
}

/**
 * Internal wiring: put a child under a parent at a rank, and announce it.
 *
 * The one place the parent/child link is written. Both the public `addChild()` and the
 * REPARENT operation handler go through it, so a structural Operation mutates internal
 * storage directly and can never re-submit an Operation of its own (ADR-0019).
 *
 * @param {Object} parent - The parent
 * @param {Object} child - The child
 * @param {number} [index] - Rank among the children; appended when omitted
 */
export function linkChild(parent, child, index) {
    const children = parent[STATE].children;
    const at = index === undefined || index === null
        ? children.length
        : clampIndex(index, children.length);

    children.splice(at, 0, child);
    child[STATE].parent = parent;
    // The parent announces, because the parent is where the tree changed shape. A child
    // that joined a scene before its parent did still gets announced, through its own
    // notifier.
    (parent[STATE].notify ?? child[STATE].notify)?.('child:added', { parent, child, index: at });
}

/**
 * Internal wiring: detach a child from its parent, and announce it.
 * @param {Object} parent - The parent
 * @param {Object} child - The child
 * @returns {boolean} True when the child was attached
 */
export function unlinkChild(parent, child) {
    const children = parent[STATE].children;
    const index = children.indexOf(child);
    if (index === -1) return false;

    children.splice(index, 1);
    child[STATE].parent = null;
    (parent[STATE].notify ?? child[STATE].notify)?.('child:removed', { parent, child, index });
    return true;
}

/**
 * Teach a pipeline the component operations, applied by direct writes.
 *
 * ANTI-ECHO. Every handler mutates through the object's own API, which produces no
 * Operation of its own — `addComponent`, `removeComponent` and `moveComponent` emit scene
 * events, never operations. Applying a replicated operation therefore submits nothing
 * back, and the loop stays unrepresentable rather than merely guarded (ADR-0019).
 *
 * @param {object} operations - The pipeline to register on
 * @param {(id: string) => object|null} resolveObject - Object lookup by identifier
 * @param {object} options - Options
 * @param {object} options.registry - Component registry used to build instances
 */
export function registerComponentHandlers(operations, resolveObject, { registry }) {
    operations.register(OperationType.ADD_COMPONENT, operation => {
        const object = resolveObject(operation.target.object);
        if (!object) return false;
        if (object.hasComponent(operation.component)) return false;

        object.addComponent(
            instantiateComponent(registry, operation.component, operation.values),
            { index: operation.index }
        );
        return true;
    }, { resolveTarget: false });

    operations.register(OperationType.REMOVE_COMPONENT, operation => {
        const object = resolveObject(operation.target.object);
        if (!object) return false;
        return object.removeComponent(operation.component);
    }, { resolveTarget: false });

    operations.register(OperationType.MOVE_COMPONENT, operation => {
        const object = resolveObject(operation.target.object);
        if (!object) return false;
        return object.moveComponent(operation.component, operation.index);
    }, { resolveTarget: false });
}

/**
 * Internal wiring: bind an object to a scene, or detach it.
 *
 * The scene hands over the function its own structural events are emitted through, so
 * an Object can announce a change of shape — a component attached, a child reparented —
 * without importing Scene, and without anyone but the Scene being able to emit on it.
 *
 * @param {Object} object - The object
 * @param {object|null} scene - The scene, or null
 * @param {Function|null} [notify] - (event, payload) => void, provided by the scene
 */
export function attachToScene(object, scene, notify = null) {
    object[STATE].scene = scene;
    object[STATE].notify = notify;
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

/**
 * Tell whether an object sits anywhere above another in the tree.
 *
 * The cycle guard. It lives here because it reads the parent chain, and it is exported so
 * the REPARENT handler can refuse an operation instead of throwing (ADR-0019): a throw
 * inside a pipeline would reach the transport.
 *
 * @param {Object} candidate - The possible ancestor
 * @param {Object} object - The object to walk up from
 * @returns {boolean} True when candidate is object, or above it
 */
export function isAncestorOf(candidate, object) {
    for (let current = object; current; current = current.parent) {
        if (current === candidate) return true;
    }
    return false;
}

/**
 * Clamp an index into a collection, treating anything unusable as "at the end".
 * @param {number} index - The requested index
 * @param {number} last - The highest legal index
 * @returns {number} The index to use
 */
export function clampIndex(index, last) {
    if (typeof index !== 'number' || !globalThis.Number.isFinite(index)) return last;
    return Math.max(0, Math.min(Math.trunc(index), last));
}

/** Insert a component into the ordered collection, appending when no index is given. */
function insertComponent(state, type, component, index) {
    if (index === undefined || index === null || index >= state.components.size) {
        state.components.set(type, component);
        return;
    }

    const entries = [...state.components];
    entries.splice(clampIndex(index, entries.length), 0, [type, component]);
    rewrite(state.components, entries);
}

/** Move an already-present component to another rank. */
function reorderComponent(state, type, index) {
    const entries = [...state.components];
    const from = entries.findIndex(([key]) => key === type);
    const [entry] = entries.splice(from, 1);
    entries.splice(index, 0, entry);
    rewrite(state.components, entries);
}

// A Map keeps insertion order and has no splice, so a reorder is a rewrite. It is O(n) on
// a collection that holds a handful of components, and it keeps ONE storage rather than a
// Map plus an order array that could drift apart.
function rewrite(map, entries) {
    map.clear();
    for (const [key, value] of entries) map.set(key, value);
}
