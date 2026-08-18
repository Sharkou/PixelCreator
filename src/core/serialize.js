// Explicit, deterministic serialization.
//
// Legacy serialized by accidental enumeration — `JSON.stringify(object)` walked whatever
// happened to be enumerable, which meant the `_prop` shadow copies travelled too (a
// measured x3 payload) and every child was emitted twice: once nested inside its parent
// and once at the scene root. Its counterpart, `copy()`, walked the write-only `$prop`
// accessors and wiped `components`, `childs` and `image` to undefined.
//
// v2 states what it writes:
//   - an explicit field list for Object; ad-hoc properties on an Object are not
//     serialized, because user data belongs in components;
//   - a component writes its schema keys when it declares one (ADR-0007), and its own
//     data properties otherwise, which is safe now that no shadow storage exists;
//   - children and parents are references by id, never nested;
//   - internal state is symbol-keyed, so it cannot leak here.
//
// STRUCTURAL ORDER IS DATA (ADR-0018, format 2).
//
// `components` is an ARRAY, and the scene carries an ordered `roots` list. Format 1 wrote
// components as an object with alphabetically sorted keys — a shape that cannot carry an
// order, and a sort that actively destroyed the one the model had. The order now decides
// which component updates first, which one draws on top, and how the Inspector reads: it
// is project data, so it is written down.
//
// An array also makes the determinism the sort was reaching for free: two serializations
// of the same model are byte-identical because the model itself is ordered, not because
// the writer imposed an order over it.
//
// No compatibility layer with Legacy projects, and none with format 1: there are none to
// preserve (ARCHITECTURE.md §10).

import { Scene } from './scene.js';
import { components as defaultRegistry, componentSchema } from './component.js';
import { ownKeys } from './properties/reactive.js';
import { rebuildObject, restoreSubtree } from './rebuild.js';

/** Bumped when the shape changes; guards a future format migration, not a Legacy one. */
export const FORMAT_VERSION = 2;

/** Object fields that are part of the serialized contract, in a fixed order. */
const OBJECT_FIELDS = ['id', 'name', 'tag', 'layer', 'active', 'lock', 'owner'];

/**
 * Serialize an object.
 * @param {object} object - The object to serialize
 * @returns {object} A plain, JSON-safe structure
 */
export function serializeObject(object) {
    const data = {};
    for (const field of OBJECT_FIELDS) data[field] = object[field];

    data.parent = object.parent?.id ?? null;
    data.children = object.children.map(child => child.id);
    data.components = serializeComponents(object);

    return data;
}

/**
 * Serialize a component's values.
 * @param {object} component - The component to serialize
 * @returns {object} A plain, JSON-safe structure
 */
export function serializeComponent(component) {
    const schema = componentSchema(component);
    const keys = schema ? globalThis.Object.keys(schema) : ownKeys(component);

    const data = {};
    for (const key of keys) {
        const value = component[key];
        if (value !== undefined) data[key] = value;
    }

    // `active` belongs to the Component contract rather than to any schema (ADR-0004):
    // the runtime reads it, the Editor writes it, and ADR-0012 makes that write a real
    // intent, representable as an Operation. A schema-driven component would otherwise
    // replicate a deliberate deactivation and then lose it on the next save — the value
    // being absent from `static schema` is not a statement that it is transient.
    // Absent stays absent: a component that never carried `active` does not gain one.
    if (data.active === undefined && component.active !== undefined) data.active = component.active;

    return data;
}

/**
 * Serialize an object's components as an ordered list.
 * @param {object} object - The object
 * @returns {object[]} `{ type, values }` entries, in collection order
 */
export function serializeComponents(object) {
    return object.componentTypes().map(type => ({
        type,
        values: serializeComponent(object.getComponent(type))
    }));
}

/**
 * Serialize a scene.
 * @param {Scene} scene - The scene to serialize
 * @returns {object} A plain, JSON-safe structure
 */
export function serializeScene(scene) {
    return {
        version: FORMAT_VERSION,
        id: scene.id,
        name: scene.name,
        // The parentless objects, in the order the scene holds them. `objects` keeps the
        // flat storage; `roots` is what says which comes first at the top level.
        roots: scene.roots().map(object => object.id),
        objects: hierarchyOrder(scene).map(serializeObject)
    };
}

/**
 * Every object, roots first and depth first under each of them.
 *
 * WHY NOT INSERTION ORDER. The scene's flat storage keeps objects in the order they
 * joined, which is an accident of history: delete a subtree, undo, and the same model
 * serializes differently because the restored objects joined last. Order in the format is
 * either data or it is noise, and this one is noise (ADR-0018) — so the writer derives it
 * from the structure that IS data, `roots` and `children`. Two identical models now
 * produce identical bytes however they were built, which is what makes an undo comparable
 * to what came before it.
 *
 * Every object is reached: one that has no parent is a root by definition.
 *
 * @param {Scene} scene - The scene
 * @returns {object[]} The objects, in hierarchy order
 */
function hierarchyOrder(scene) {
    const ordered = [];

    const walk = object => {
        ordered.push(object);
        for (const child of object.children) walk(child);
    };
    for (const root of scene.roots()) walk(root);

    return ordered;
}

/**
 * Rebuild an object, without its hierarchy links.
 * @param {object} data - Data produced by serializeObject()
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @returns {object} The object
 */
export function deserializeObject(data, { registry = defaultRegistry } = {}) {
    return rebuildObject(data, { registry });
}

/**
 * Rebuild a scene, hierarchy included.
 * @param {object} data - Data produced by serializeScene()
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @param {object} [options.authority] - Authority for the scene's pipeline
 * @returns {Scene} The scene
 */
export function deserializeScene(data, { registry = defaultRegistry, authority } = {}) {
    if (data?.version !== FORMAT_VERSION) {
        throw new Error(`deserializeScene: unsupported format version ${data?.version}`);
    }

    const scene = new Scene(data.name ?? '', { id: data.id, authority, registry });

    for (const objectData of data.objects ?? []) {
        scene.add(deserializeObject(objectData, { registry }));
    }

    // Second pass: every object exists, so links can be restored deterministically in
    // the recorded child order.
    for (const objectData of data.objects ?? []) {
        const parent = scene.get(objectData.id);
        for (const childId of objectData.children ?? []) {
            const child = scene.get(childId);
            if (!child) throw new Error(`deserializeScene: unknown child ${childId} of ${objectData.id}`);
            parent.addChild(child);
        }
    }

    // Third pass: the roots, in their recorded order. Reparenting each one to `null` at
    // its rank is the same primitive the Editor uses, so there is no second way to order
    // the top level (ADR-0018).
    (data.roots ?? []).forEach((id, index) => {
        if (scene.has(id)) scene.reparent(id, null, index);
    });

    return scene;
}

export { restoreSubtree };
