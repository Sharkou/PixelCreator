// Rebuilding Objects from serialized data.
//
// Split out of `serialize.js` for one structural reason: the Scene has to rebuild an
// object when it applies an `ADD_OBJECT` operation, and `serialize.js` imports the Scene.
// Putting the rebuild here keeps the dependency one-way — `scene.js -> rebuild.js` and
// `serialize.js -> rebuild.js`, never a cycle and never a module-level global handed
// between the two.
//
// Writing serialized data onto a component goes through `reconcileValues()`, so a scene
// saved before a definition changed still loads: unknown keys are dropped, missing ones
// keep their default (ADR-0021). A type nothing can resolve becomes a MissingComponent
// rather than throwing and losing the whole scene.

import { Object } from './object.js';
import { components as defaultRegistry, instantiateComponent } from './component.js';

/**
 * Rebuild an object, without its hierarchy links.
 *
 * Links are restored in a second pass by whoever holds the whole set, because a child may
 * be described before its parent.
 *
 * @param {object} data - Data produced by serializeObject()
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @returns {object} The object
 */
export function rebuildObject(data, { registry = defaultRegistry } = {}) {
    const object = new Object(data.name ?? '', {
        id: data.id,
        tag: data.tag ?? '',
        layer: data.layer ?? 0,
        owner: data.owner ?? null
    });

    object.active = data.active ?? true;
    object.lock = data.lock ?? false;

    // An array, in order: the collection order IS the data (ADR-0018), so components are
    // attached in the order they were written and no sorting happens anywhere.
    for (const entry of componentEntries(data.components)) {
        object.addComponent(instantiateComponent(registry, entry.type, entry.values));
    }

    return object;
}

/**
 * Read a serialized `components` field as an ordered list.
 *
 * Format 2 writes an array. Nothing else is accepted: an object cannot carry an order, and
 * silently tolerating the old shape would let a v1 payload load with its order quietly
 * alphabetised (ADR-0018).
 *
 * @param {object[]} components - The serialized components
 * @returns {{type: string, values: object}[]} The entries, in order
 */
export function componentEntries(components) {
    if (!components) return [];
    if (!globalThis.Array.isArray(components)) {
        throw new TypeError('components must be an ordered array of { type, values }');
    }
    return components.map(entry => ({ type: entry.type, values: entry.values ?? {} }));
}

/**
 * Put an object and its descendants back into a scene, links and ranks included.
 *
 * This is what `ADD_OBJECT` applies, and therefore what undoing a deletion runs. The
 * subtree travels with the operation, so restoring is a rebuild, not a re-derivation.
 *
 * @param {object} scene - The scene to restore into
 * @param {object} spec - The payload
 * @param {object} spec.object - The serialized object
 * @param {object[]} [spec.subtree] - Its serialized descendants
 * @param {string|null} [spec.parent] - Parent identifier, or null for a root
 * @param {number} [spec.index] - Rank among its siblings, or among the roots
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @returns {boolean} True when the object was restored
 */
export function restoreSubtree(scene, { object, subtree = [], parent = null, index = null }, { registry } = {}) {
    if (!object?.id) return false;

    const all = [object, ...subtree];
    const rebuilt = new globalThis.Map();

    for (const data of all) {
        if (scene.has(data.id)) return false;
        rebuilt.set(data.id, rebuildObject(data, { registry: registry ?? scene.registry }));
    }

    // Added detached first, so a child never joins before the parent it will hang from.
    for (const data of all) scene.add(rebuilt.get(data.id));

    for (const data of all) {
        const owner = rebuilt.get(data.id);
        for (const childId of data.children ?? []) {
            const child = rebuilt.get(childId) ?? scene.get(childId);
            if (child) owner.addChild(child);
        }
    }

    // The root of the restored subtree goes back where it came from — same parent, same
    // rank. Without the rank it would land at the end of the list, which is the classic
    // way an undo "works" and still loses the arrangement.
    scene.reparent(rebuilt.get(object.id), parent, index ?? undefined);
    return true;
}
