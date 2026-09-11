// Prefabs as Resources — declaring one, saving it, and resolving them all before a game runs.
//
// THIS IS THE COUNTERPART OF graphs.js AND scenes.js, AND IT IS THE ANSWER TO THE ONE
// QUESTION THAT MADE PREFABS IMPOSSIBLE (ADR-0061 §4). A Resource is read through
// asynchronous storage; a `Runtime.step()` may not wait. Both halves of that sentence stay
// true, and the resolution simply moves:
//
//   Bullet.prefab                      ONE resource: a serialized subtree
//        │
//        ▼
//   project.read(id)                   the Project reads the payload, once, BEFORE the game
//        │
//        ▼
//   PrefabRegistry.set(id, payload)    a plain map, in memory, that answers now
//        │
//        ▼
//   new Runtime(scene, { prefabs })    the Runtime receives a VALUE, never an identifier
//
// It is exactly the shape `loadComponentDefinitions()` already has, and for exactly the same
// reason: the Core never reaches storage, the Runtime must not, and putting the load in the
// Editor would stop a headless server from opening a project (ADR-0011, ADR-0020).
//
// NOTHING HERE INVENTS A FORMAT. `createPrefab()` and `instantiatePrefab()` are the Core's,
// and a payload that round-trips through this module is byte-identical to the one the Core
// produced — which is what makes a prefab in a bundle the same thing as a prefab in a store.

import { PrefabRegistry, createPrefab } from '../core/mod.js';
import { createResource, ResourceKind } from './resource.js';

/**
 * Declare a prefab in the project, modelled on an Object and everything under it.
 *
 * One ADD_RESOURCE operation, so it is arbitrable, replicable and undoable like every other
 * manifest mutation — making a prefab is not a special case (ADR-0019).
 *
 * WHAT WAS CLEARED IS RETURNED, NEVER SWALLOWED. A reference pointing outside the subtree
 * cannot travel with a project-scoped Resource (ADR-0061 §6), so it is emptied — and the
 * caller is told which, because a creator who loses a wiring silently loses an afternoon.
 *
 * @param {object} project - The project to declare it in
 * @param {object} object - The root of the subtree to model
 * @param {object} [options] - Options
 * @param {string} [options.name] - Displayed name; the object's own when omitted
 * @param {string|null} [options.parent] - The folder it goes in
 * @param {string} [options.id] - Existing ResourceId, used when loading a manifest
 * @param {number} [options.index] - Rank in the manifest
 * @param {object} [options.registry] - ComponentRegistry resolving the types
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {{resource: object|null, cleared: object[]}} The manifest entry and what was dropped
 */
export function addPrefab(project, object, { name, parent = null, id, index, registry, actor, batch } = {}) {
    const { definition, cleared } = createPrefab(object, { registry, scene: object?.scene ?? null });

    const resource = createResource({
        kind: ResourceKind.PREFAB,
        id,
        name: name ?? object.name ?? '',
        parent
    });

    return { resource: project.add(resource, definition, { index, actor, batch }), cleared };
}

/**
 * Write a prefab's payload again, from an Object.
 *
 * THE MANIFEST `name` IS DELIBERATELY NOT REWRITTEN, the same decision `saveScene()` makes:
 * they are two fields with two owners, and a save is not a rename (ADR-0020).
 *
 * @param {object} project - The project
 * @param {string} id - The prefab's ResourceId
 * @param {object} object - The root of the subtree to model
 * @param {object} [options] - Options
 * @param {object} [options.registry] - ComponentRegistry resolving the types
 * @param {string} [options.actor] - Who authored the intent
 * @returns {{resource: object|null, cleared: object[]}} The manifest entry and what was dropped
 */
export function savePrefab(project, id, object, { registry, actor } = {}) {
    const { definition, cleared } = createPrefab(object, { registry, scene: object?.scene ?? null });
    return { resource: project.save(id, definition, { actor }), cleared };
}

/**
 * Read one prefab's definition back.
 *
 * @param {object} project - The project
 * @param {string} id - The prefab's ResourceId
 * @returns {Promise<object|null>} The definition, or null when there is no payload
 */
export async function loadPrefab(project, id) {
    if (!id) return null;
    return await project.read(id) ?? null;
}

/**
 * Resolve every prefab of a project into a registry a simulation can read synchronously.
 *
 * CALLED BEFORE THE FIRST STEP, AND NEVER DURING ONE. That is the whole contract: this is
 * `async`, the registry it produces is not, and the Runtime only ever sees the registry
 * (ADR-0061 §4).
 *
 * A BROKEN PAYLOAD MUST NOT STOP A PROJECT FROM OPENING, in the spirit of ADR-0012 and of
 * `loadComponentDefinitions()` beside it: it is reported through `onError` and skipped, and
 * a `Spawn Prefab` aimed at it answers nothing at run time — which is already how a node
 * whose target is gone behaves (ADR-0034 §3.4).
 *
 * @param {object} project - The project to load from
 * @param {object} [options] - Options
 * @param {PrefabRegistry} [options.prefabs] - The registry to fill; a fresh one by default
 * @param {Function} [options.onError] - Called with { resource, error } instead of throwing
 * @returns {Promise<PrefabRegistry>} The registry
 */
export async function loadPrefabs(project, { prefabs = new PrefabRegistry(), onError } = {}) {
    for (const resource of project.resources(ResourceKind.PREFAB)) {
        try {
            const definition = await project.read(resource.id);
            if (definition) prefabs.set(resource.id, definition);
        } catch (error) {
            if (!onError) throw error;
            onError({ resource, error });
        }
    }

    return prefabs;
}

/**
 * The project's prefab resources, in manifest order.
 * @param {object} project - The project
 * @returns {object[]} The manifest entries
 */
export function prefabResources(project) {
    return project.resources(ResourceKind.PREFAB);
}
