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
// No compatibility layer with Legacy projects: there are none to preserve.

import { Object } from './object.js';
import { Scene } from './scene.js';
import { components as defaultRegistry, componentSchema } from './component.js';
import { ownKeys } from './properties/reactive.js';

/** Bumped when the shape changes; guards a future format migration, not a Legacy one. */
export const FORMAT_VERSION = 1;

/** Object fields that are part of the serialized contract, in a fixed order. */
const OBJECT_FIELDS = ['id', 'name', 'tag', 'layer', 'active', 'visible', 'lock', 'owner'];

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
 * Serialize a component.
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
 * Serialize a scene.
 * @param {Scene} scene - The scene to serialize
 * @returns {object} A plain, JSON-safe structure
 */
export function serializeScene(scene) {
    return {
        version: FORMAT_VERSION,
        id: scene.id,
        name: scene.name,
        objects: scene.objects().map(serializeObject)
    };
}

/**
 * Rebuild an object, without its hierarchy links.
 *
 * Links are restored by deserializeScene() in a second pass, because a child may be
 * described before its parent.
 *
 * @param {object} data - Data produced by serializeObject()
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @returns {object} The object
 */
export function deserializeObject(data, { registry = defaultRegistry } = {}) {
    const object = new Object(data.name ?? '', {
        id: data.id,
        tag: data.tag ?? '',
        layer: data.layer ?? 0,
        owner: data.owner ?? null
    });

    object.active = data.active ?? true;
    object.visible = data.visible ?? true;
    object.lock = data.lock ?? false;

    for (const [type, componentData] of globalThis.Object.entries(data.components ?? {})) {
        object.addComponent(deserializeComponent(type, componentData, registry));
    }

    return object;
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

    const scene = new Scene(data.name ?? '', { id: data.id, authority });

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

    return scene;
}

function serializeComponents(object) {
    const data = {};
    // Sorted: component type carries no ordering meaning, and a stable key order keeps
    // two serializations of the same model byte-identical.
    for (const type of globalThis.Object.keys(object.components).sort()) {
        data[type] = serializeComponent(object.components[type]);
    }
    return data;
}

function deserializeComponent(type, data, registry) {
    const component = registry.create(type);
    for (const [key, value] of globalThis.Object.entries(data ?? {})) {
        component[key] = value;
    }
    return component;
}
