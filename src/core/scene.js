// Scene — a flat collection of Objects, and the unit of replication.
//
// Flat on purpose: hierarchy is a parent/child link between scene objects, not a
// nesting of storage. That is what lets an object be serialized once and referenced by
// id, instead of Legacy embedding each child inside its parent AND at the scene root.
//
// The scene owns the operation pipeline, since a scene is what a server arbitrates and
// what a transport replicates.
//
// THE ROOTS ARE AN ORDERED LIST, NOT A FILTER (ADR-0018). They used to be derived by
// filtering the objects for the parentless ones, which meant their order was the order
// they happened to be created in and could not be changed, saved, or undone. They are now
// a list the scene owns — the children of an implicit `null` parent — so reordering a root
// is the same gesture, and the same Operation, as reordering any other child.
//
// What deliberately does NOT live here: the Editor's selection. Legacy kept
// `scene.current` and `scene.currentComponent` in the Core, which is IDE state leaking
// into the model, read by five different modules.

import { createId } from './id.js';
import { Emitter } from './events.js';
import { Operations } from './operations/operations.js';
import { OperationType } from './operations/operation.js';
import { components as defaultRegistry } from './component.js';
import {
    attachToScene,
    clampIndex,
    isAncestorOf,
    linkChild,
    registerComponentHandlers,
    unlinkChild
} from './object.js';
import { restoreSubtree } from './rebuild.js';

export class Scene {

    #id;
    #name;
    #objects = new Map();
    #roots = [];
    #emitter = new Emitter();
    #operations;
    #registry;

    // Raised while reparent() is rearranging the tree itself, so the structural events it
    // causes do not also try to maintain the root list behind its back. Outside that
    // window the same events are exactly how a plain `parent.addChild(child)` from a
    // script keeps the roots correct.
    #rearranging = false;

    // The events raised in the middle of a rearrangement, held until it is finished.
    #pending = [];

    // Handed to every object that joins, so a structural change can be announced by the
    // object it happened on. Bound once: it is the scene's only writable entry point
    // into its own emitter, and nothing outside holds it.
    //
    // AN EVENT IS NEVER ANNOUNCED WHILE THE TREE IS HALF MOVED. A reparent unlinks and
    // then links; a listener that rebuilt on the 'child:removed' of the first half saw a
    // scene where the object belonged to nothing — no parent yet, not in the roots yet —
    // and drew a tree with the object missing, with no later event to correct it. So the
    // notifications of one rearrangement are held and flushed once, when the shape they
    // describe is the shape the scene actually has.
    #notify = (event, payload) => {
        if (this.#rearranging) {
            this.#pending.push([event, payload]);
            return;
        }
        this.#trackRoots(event, payload);
        this.#emitter.emit(event, payload);
    };

    /**
     * Create a scene.
     * @param {string} [name] - Display name
     * @param {object} [options] - Options
     * @param {string} [options.id] - Existing identifier, used when deserializing
     * @param {object} [options.authority] - Object exposing check(operation) => decision
     * @param {object} [options.registry] - Component registry used by ADD_COMPONENT
     */
    constructor(name = '', { id, authority, registry = defaultRegistry } = {}) {
        this.#id = id ?? createId();
        this.#name = name;
        this.#registry = registry;
        this.#operations = new Operations({
            authority,
            resolve: target => this.#resolveTarget(target)
        });

        this.#registerHandlers();
    }

    get id() {
        return this.#id;
    }

    get name() {
        return this.#name;
    }

    set name(name) {
        this.#name = name;
    }

    /**
     * The component registry this scene builds components from.
     * @returns {object} The registry
     */
    get registry() {
        return this.#registry;
    }

    /**
     * The operation pipeline every object in this scene submits to.
     * @returns {Operations} The pipeline
     */
    get operations() {
        return this.#operations;
    }

    /**
     * How many objects the scene holds.
     * @returns {number} The count
     */
    get size() {
        return this.#objects.size;
    }

    /**
     * Subscribe to scene events.
     *
     * Structure is announced here, values are not: a property change is observed on the
     * object that carries it (`object.observe`), because that is what lets a view watch
     * one field without waking on every mutation in the scene. What a property cannot
     * express is a change of *shape*, and these events are exactly that list — no more, so
     * this never becomes a general mutation bus.
     *
     *   'added' / 'removed'                              the object
     *   'component:added' / 'component:removed'          { object, component, type, index }
     *   'component:moved'                                { object, type, index, previousIndex }
     *   'child:added' / 'child:removed'                  { parent, child, index }
     *   'roots:reordered'                                { index, previousIndex }
     *
     * These stay a different layer from the Operations. An Operation is an intent that can
     * be arbitrated, replicated and undone; an event is a notification that the shape
     * changed, whatever caused it — including a plain `addChild()` from a script that
     * produces no Operation at all. Merging the two would make every script call
     * replicable and every replicated change unobservable (ADR-0019).
     *
     * @param {string} event - Event name
     * @param {Function} listener - Called with the payload
     * @returns {Function} Unsubscribe function
     */
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }

    /**
     * Add an object to the scene.
     * @param {object} object - The object to add
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank among the roots, when the object has no parent
     * @returns {object} The object
     */
    add(object, { index } = {}) {
        if (!object?.id) throw new TypeError('Scene.add: expected an object with an id');

        const existing = this.#objects.get(object.id);
        if (existing === object) return object;
        if (existing) throw new Error(`Scene.add: id ${object.id} is already used by another object`);

        this.#objects.set(object.id, object);
        // A ROOT IS AN OBJECT WITH NO PARENT **IN THIS SCENE**, and the second half is not a
        // pedantry: an object joining while its parent is somewhere else was neither a root
        // nor the child of anything the scene could reach, so it fell out of the canonical
        // walk — out of what `serializeScene()` writes, and now out of what the Runtime
        // simulates (ADR-0035). The scene held it, `objects()` listed it, and nothing else
        // ever saw it again.
        //
        // The ordinary case is untouched: attaching a child to a parent that IS here, and
        // then adding it, still gives a child rather than a root.
        const parent = object.parent;
        if (!parent || !this.#objects.has(parent.id)) this.#insertRoot(object.id, index);

        attachToScene(object, this, this.#notify);
        this.#emitter.emit('added', object);
        return object;
    }

    /**
     * Remove an object from the scene, along with its subtree.
     * @param {object|string} object - The object or its id
     * @returns {boolean} True when an object was removed
     */
    remove(object) {
        const id = typeof object === 'string' ? object : object?.id;
        const target = this.#objects.get(id);
        if (!target) return false;

        // Depth first, so a child is never left in the scene pointing at a parent that
        // has already gone.
        for (const child of target.children) this.remove(child);

        target.parent?.removeChild(target);

        this.#objects.delete(id);
        this.#removeRoot(id);
        attachToScene(target, null, null);
        this.#emitter.emit('removed', target);
        return true;
    }

    /**
     * Tell whether the scene holds an object.
     * @param {object|string} object - The object or its id
     * @returns {boolean} True when present
     */
    has(object) {
        return this.#objects.has(typeof object === 'string' ? object : object?.id);
    }

    /**
     * Look an object up by identifier.
     * @param {string} id - The identifier
     * @returns {object|undefined} The object, or undefined
     */
    get(id) {
        return this.#objects.get(id);
    }

    /**
     * Every object in the scene, in insertion order.
     * @returns {object[]} The objects
     */
    objects() {
        return [...this.#objects.values()];
    }

    /**
     * The parentless objects, in their persisted order.
     * @returns {object[]} The roots
     */
    roots() {
        return this.#roots.map(id => this.#objects.get(id)).filter(Boolean);
    }

    /**
     * Move an object to another parent, at a given rank.
     *
     * ONE PRIMITIVE FOR FOUR GESTURES: reparent, unparent (`parent: null`), reorder among
     * siblings (same parent, new index), reorder among the roots (`parent: null`, new
     * index). They are one mutation, so they get one primitive and one inverse (ADR-0019).
     *
     * Carried by the Scene rather than by Object because reordering a root has no owning
     * Object — the Scene owns that list — and because a reparent touches two parents, so
     * hanging it off either of them would be arbitrary.
     *
     * REFUSES rather than throws: an invalid reparent is answered with `false`, which the
     * pipeline turns into `applied: false`. A throw would travel up into the transport.
     *
     * @param {object|string} object - The object to move, or its id
     * @param {object|string|null} parent - The new parent, its id, or null for a root
     * @param {number} [index] - Rank among the new siblings; appended when omitted
     * @returns {boolean} True when the tree changed
     */
    reparent(object, parent = null, index) {
        const moved = this.#resolveObject(object);
        if (!moved) return false;

        const target = parent === null || parent === undefined ? null : this.#resolveObject(parent);
        if (parent !== null && parent !== undefined && !target) return false;

        // A cycle is refused wherever the operation came from, including replication —
        // which is why the guard lives here and not only in addChild() (ADR-0019).
        if (target && isAncestorOf(moved, target)) return false;

        const previousParent = moved.parent;
        const previousIndex = previousParent
            ? previousParent.childIndex(moved)
            : this.#roots.indexOf(moved.id);

        const siblings = target ? target.children.length : this.#roots.length;
        // Moving within the same collection, the object first leaves it, so the highest
        // reachable rank is one less than the current count.
        const staying = previousParent === target;
        const last = staying ? siblings - 1 : siblings;
        const to = clampIndex(index, last);

        if (staying && to === previousIndex) return false;

        this.#rearranging = true;
        try {
            if (previousParent) unlinkChild(previousParent, moved);
            else this.#removeRoot(moved.id);

            if (target) linkChild(target, moved, to);
            else this.#insertRoot(moved.id, to);
        } finally {
            this.#rearranging = false;
        }

        // Now, and not before: the object has left one collection and joined the other,
        // so every listener reads a tree that is whole.
        this.#flush();

        if (!previousParent && !target) {
            this.#emitter.emit('roots:reordered', { object: moved, index: to, previousIndex });
        }

        return true;
    }

    /**
     * The rank an object holds among its siblings, or among the roots.
     * @param {object|string} object - The object or its id
     * @returns {number} The index, or -1 when the scene does not hold it
     */
    indexOf(object) {
        const target = this.#resolveObject(object);
        if (!target) return -1;
        return target.parent ? target.parent.childIndex(target) : this.#roots.indexOf(target.id);
    }

    // THE THREE SEARCHES ANSWER IN CANONICAL ORDER, NOT IN INSERTION ORDER (ADR-0034 §3.1).
    // They used to read `objects()`, whose order is a fact about how the scene was BUILT: a
    // reparent leaves it behind, a reload rewrites it from the payload, and a deletion undone
    // puts the object back at the end. The same scene therefore answered `findByTag` with a
    // different object depending on its history — which is exactly what a graph asking "the
    // player" must not depend on, and what two machines holding the same state must never
    // disagree about (ADR-0011).
    //
    // Hierarchy order is a function of the STATE: it reads `roots` and `children`, both
    // ordered, both maintained by REPARENT alone, both replicated and both serialized.

    /**
     * Find objects by name. Names are not identities, so several may match (ADR-0010).
     * @param {string} name - The name to match
     * @returns {object[]} The matching objects, in canonical order
     */
    findByName(name) {
        return hierarchyOrder(this).filter(object => object.name === name);
    }

    /**
     * Find objects by tag.
     * @param {string} tag - The tag to match
     * @returns {object[]} The matching objects, in canonical order
     */
    findByTag(tag) {
        return hierarchyOrder(this).filter(object => object.tag === tag);
    }

    /**
     * Find objects carrying a component type.
     * @param {string|Function} component - Type name or class
     * @returns {object[]} The matching objects, in canonical order
     */
    findByComponent(component) {
        return hierarchyOrder(this).filter(object => object.hasComponent(component));
    }

    #resolveObject(object) {
        if (typeof object === 'string') return this.#objects.get(object) ?? null;
        return object && this.#objects.has(object.id) ? object : null;
    }

    #resolveTarget(target) {
        const object = this.#objects.get(target.object);
        if (!object) return null;
        return target.component ? object.getComponent(target.component) ?? null : object;
    }

    #insertRoot(id, index) {
        if (this.#roots.includes(id)) return;
        const at = index === undefined || index === null
            ? this.#roots.length
            : clampIndex(index, this.#roots.length);
        this.#roots.splice(at, 0, id);
    }

    #removeRoot(id) {
        const index = this.#roots.indexOf(id);
        if (index !== -1) this.#roots.splice(index, 1);
    }

    /** Announce what a rearrangement raised, in the order it was raised. */
    #flush() {
        const pending = this.#pending;
        this.#pending = [];
        // The root list is maintained by reparent() itself in this window, so these are
        // announced without going through #trackRoots — which would undo its work.
        for (const [event, payload] of pending) this.#emitter.emit(event, payload);
    }

    // Keeps the root list true when the tree is rearranged by anything other than
    // reparent() — `parent.addChild(child)` from a script, or from deserialization.
    #trackRoots(event, payload) {
        if (this.#rearranging) return;
        if (event === 'child:added' && this.#objects.has(payload.child?.id)) {
            this.#removeRoot(payload.child.id);
        }
        if (event === 'child:removed' && this.#objects.has(payload.child?.id) && !payload.child.parent) {
            this.#insertRoot(payload.child.id);
        }
    }

    #registerHandlers() {
        registerComponentHandlers(
            this.#operations,
            id => this.#objects.get(id) ?? null,
            { registry: this.#registry }
        );

        // Every handler below writes through the Scene's own primitives, which produce no
        // Operation. Applying a replicated operation therefore submits nothing back — the
        // echo is unrepresentable rather than merely prevented (ADR-0019).
        this.#operations.register(OperationType.ADD_OBJECT, operation => {
            return restoreSubtree(this, operation, { registry: this.#registry });
        }, { resolveTarget: false });

        this.#operations.register(OperationType.REMOVE_OBJECT, operation => {
            return this.remove(operation.target.object);
        }, { resolveTarget: false });

        this.#operations.register(OperationType.REPARENT, operation => {
            return this.reparent(operation.target.object, operation.parent, operation.index);
        }, { resolveTarget: false });
    }
}

/**
 * Every object of a scene, roots first and depth first under each of them.
 *
 * THE CANONICAL ORDER OF A SCENE (ADR-0034 §3.1). It is the one order that is a function of
 * the scene's STATE rather than of its history: it reads `roots` and `children`, both
 * ordered, both maintained by REPARENT alone, both replicated and both serialized. Insertion
 * order is the other one, and it is an accident — delete a subtree, undo, and the same model
 * lists its objects differently.
 *
 * IT LIVES HERE AND NOT IN `serialize.js`, WHICH IS WHERE IT USED TO BE. The Scene needs it
 * for its own searches and `serialize.js` already imports the Scene, so keeping it there
 * would have closed a cycle — the same argument `rebuild.js` was split out for. There is one
 * definition, and the writer and the searches read it.
 *
 * Every object is reached, because an object with no parent is a root by definition. Nothing
 * falls back for an object that is neither: such an object would be a defect in whatever put
 * it in the scene, and a fallback would hide it rather than surface it.
 *
 * @param {Scene} scene - The scene to walk
 * @returns {object[]} The objects, in canonical order
 */
export function hierarchyOrder(scene) {
    const ordered = [];

    const walk = object => {
        ordered.push(object);
        for (const child of object.children) walk(child);
    };
    for (const root of scene.roots()) walk(root);

    return ordered;
}
