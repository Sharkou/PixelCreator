// Structural edits the Editor performs on the model.
//
// Thin on purpose: every function here is a couple of Core calls with a name on it. The
// value is not abstraction, it is having ONE place where "the creator created an object"
// is written down — which is where ADD_OBJECT and its siblings will be produced when the
// structural Operations of ADR-0008 land, and where undo will hook in.
//
// Property edits are deliberately NOT here. They go straight through
// `target.setProperty()` from the field that made them, because the Property System is
// already the controlled path (CONVENTIONS.md) and wrapping it would add a layer that
// only forwards.

import { Object, Transform, components as defaultRegistry } from '../core/mod.js';
import { Camera, RectangleRenderer } from '../runtime/mod.js';

/** What the "create" menu offers, and what each entry is made of. */
export const OBJECT_KINDS = [
    { id: 'rectangle', label: 'Rectangle' },
    { id: 'empty', label: 'Empty' },
    { id: 'camera', label: 'Camera' }
];

/**
 * Create an object and add it to the scene.
 *
 * @param {object} scene - The scene to add to
 * @param {object} [options] - Options
 * @param {string} [options.kind] - One of OBJECT_KINDS
 * @param {number} [options.x] - Horizontal world position
 * @param {number} [options.y] - Vertical world position
 * @param {object} [options.parent] - Object to attach the new one to
 * @returns {object} The new object
 */
export function createObject(scene, { kind = 'rectangle', x = 0, y = 0, parent = null } = {}) {
    const object = new Object(uniqueName(scene, labelOf(kind)));
    object.addComponent(new Transform(x, y));

    if (kind === 'rectangle') object.addComponent(new RectangleRenderer(64, 64, '#4a4a52'));
    if (kind === 'camera') object.addComponent(new Camera());

    scene.add(object);
    // Parented after joining the scene, so the scene is there to announce the link.
    if (parent) parent.addChild(object);

    return object;
}

/**
 * Remove an object and everything under it.
 * @param {object} scene - The scene
 * @param {object} object - The object to delete
 * @returns {boolean} True when an object was removed
 */
export function deleteObject(scene, object) {
    if (!object) return false;
    return scene.remove(object);
}

/**
 * Attach a component of a registered type.
 * @param {object} object - The object to attach to
 * @param {string} type - The component type name
 * @param {object} [registry] - Component registry to resolve the type in
 * @returns {object} The attached component
 */
export function addComponent(object, type, registry = defaultRegistry) {
    return object.addComponent(registry.create(type));
}

/**
 * Detach a component.
 * @param {object} object - The object to detach from
 * @param {string} type - The component type name
 * @returns {boolean} True when a component was detached
 */
export function removeComponent(object, type) {
    return object.removeComponent(type);
}

/**
 * The component types that can still be added to an object.
 *
 * An Object holds at most one component per type, so what is already attached is not
 * offered again — the alternative is a menu entry that always throws.
 *
 * @param {object} object - The object
 * @param {object} [registry] - Component registry to list
 * @returns {string[]} Type names, sorted
 */
export function availableComponents(object, registry = defaultRegistry) {
    return registry.types().filter(type => !object.hasComponent(type));
}

/**
 * A name no other object in the scene is using.
 *
 * Names are not identities (ADR-0010), so duplicates are legal — they are just unhelpful
 * in a Hierarchy, which is the only reason this exists.
 *
 * @param {object} scene - The scene to look in
 * @param {string} base - The name to start from
 * @returns {string} The name to use
 */
export function uniqueName(scene, base) {
    if (scene.findByName(base).length === 0) return base;

    for (let suffix = 2; ; suffix++) {
        const candidate = `${base} ${suffix}`;
        if (scene.findByName(candidate).length === 0) return candidate;
    }
}

function labelOf(kind) {
    return OBJECT_KINDS.find(entry => entry.id === kind)?.label ?? 'Object';
}
