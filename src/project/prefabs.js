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
//   ResourceRegistry.set(id, payload)  a plain map, in memory, that answers now
//        │
//        ▼
//   new Runtime(scene, { resources })  the Runtime receives a VALUE, never an identifier
//
// It is exactly the shape `loadComponentDefinitions()` already has, and for exactly the same
// reason: the Core never reaches storage, the Runtime must not, and putting the load in the
// Editor would stop a headless server from opening a project (ADR-0011, ADR-0020).
//
// THE LOADING ITSELF MOVED NEXT DOOR (`project/resources.js`, ADR-0062 §1). An animation
// needed the very same pass with one word changed, so there is one `loadDefinitions()` for
// every definition kind; what stays here is what is specific to a PREFAB — writing one from
// a live subtree, and the external references that cannot travel with it.
//
// NOTHING HERE INVENTS A FORMAT. `createPrefab()` and `instantiatePrefab()` are the Core's,
// and a payload that round-trips through this module is byte-identical to the one the Core
// produced — which is what makes a prefab in a bundle the same thing as a prefab in a store.

import { createAnimation, createPrefab } from '../core/mod.js';
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
 * The project's prefab resources, in manifest order.
 * @param {object} project - The project
 * @returns {object[]} The manifest entries
 */
export function prefabResources(project) {
    return project.resources(ResourceKind.PREFAB);
}

// --- animations ----------------------------------------------------------------------------
//
// THE SAME THREE VERBS, ONE KIND DOWN. A clip is declared, saved and listed exactly as a
// prefab is, because both are Resources and the Resource system is what makes that true
// without a second identity scheme, a second store or a second undo stack (ADR-0020).

/**
 * Declare a sprite animation in the project.
 *
 * @param {object} project - The project to declare it in
 * @param {object} spec - The clip, as `createAnimation()` takes it
 * @param {object} [options] - Options
 * @param {string} [options.name] - Displayed name
 * @param {string|null} [options.parent] - The folder it goes in
 * @param {string} [options.id] - Existing ResourceId, used when loading a manifest
 * @param {number} [options.index] - Rank in the manifest
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {object|null} The manifest entry, or null when the operation was refused
 */
export function addAnimation(project, spec, { name = 'New Animation.animation', parent = null, id, index, actor, batch } = {}) {
    const resource = createResource({ kind: ResourceKind.ANIMATION, id, name, parent });
    return project.add(resource, createAnimation(spec), { index, actor, batch });
}

/**
 * Write a clip's payload again.
 *
 * @param {object} project - The project
 * @param {string} id - The clip's ResourceId
 * @param {object} spec - The clip, as `createAnimation()` takes it
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @returns {object|null} The manifest entry, or null when the resource is unknown
 */
export function saveAnimation(project, id, spec, { actor } = {}) {
    return project.save(id, createAnimation(spec), { actor });
}

/**
 * The project's animation resources, in manifest order.
 * @param {object} project - The project
 * @returns {object[]} The manifest entries
 */
export function animationResources(project) {
    return project.resources(ResourceKind.ANIMATION);
}
