// Scene — a flat collection of Objects, and the unit of replication.
//
// Flat on purpose: hierarchy is a parent/child link between scene objects, not a
// nesting of storage. That is what lets an object be serialized once and referenced by
// id, instead of Legacy embedding each child inside its parent AND at the scene root.
//
// The scene owns the operation pipeline, since a scene is what a server arbitrates and
// what a transport replicates.
//
// What deliberately does NOT live here: the Editor's selection. Legacy kept
// `scene.current` and `scene.currentComponent` in the Core, which is IDE state leaking
// into the model, read by five different modules.

import { createId } from './id.js';
import { Emitter } from './events.js';
import { Operations } from './operations/operations.js';
import { attachToScene } from './object.js';

export class Scene {

    #id;
    #name;
    #objects = new Map();
    #emitter = new Emitter();
    #operations;

    /**
     * Create a scene.
     * @param {string} [name] - Display name
     * @param {object} [options] - Options
     * @param {string} [options.id] - Existing identifier, used when deserializing
     * @param {object} [options.authority] - Object exposing check(operation) => decision
     */
    constructor(name = '', { id, authority } = {}) {
        this.#id = id ?? createId();
        this.#name = name;
        this.#operations = new Operations({
            authority,
            resolve: target => this.#resolveTarget(target)
        });
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
     * Subscribe to scene events: 'added' and 'removed', each with the object.
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
     * @returns {object} The object
     */
    add(object) {
        if (!object?.id) throw new TypeError('Scene.add: expected an object with an id');

        const existing = this.#objects.get(object.id);
        if (existing === object) return object;
        if (existing) throw new Error(`Scene.add: id ${object.id} is already used by another object`);

        this.#objects.set(object.id, object);
        attachToScene(object, this);
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
        attachToScene(target, null);
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
     * Objects that have no parent.
     * @returns {object[]} The roots, in insertion order
     */
    roots() {
        return this.objects().filter(object => !object.parent);
    }

    /**
     * Find objects by name. Names are not identities, so several may match (ADR-0010).
     * @param {string} name - The name to match
     * @returns {object[]} The matching objects
     */
    findByName(name) {
        return this.objects().filter(object => object.name === name);
    }

    /**
     * Find objects by tag.
     * @param {string} tag - The tag to match
     * @returns {object[]} The matching objects
     */
    findByTag(tag) {
        return this.objects().filter(object => object.tag === tag);
    }

    /**
     * Find objects carrying a component type.
     * @param {string|Function} component - Type name or class
     * @returns {object[]} The matching objects
     */
    findByComponent(component) {
        return this.objects().filter(object => object.hasComponent(component));
    }

    #resolveTarget(target) {
        const object = this.#objects.get(target.object);
        if (!object) return null;
        return target.component ? object.getComponent(target.component) ?? null : object;
    }
}
