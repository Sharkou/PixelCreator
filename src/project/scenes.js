// Scenes as Resources — declaring one, saving it, reading it back (ADR-0020).
//
// A scene is a Resource like any other: `kind: 'scene'`, an opaque id, a payload read by
// identifier. There is no `SceneDocument` and no second identity scheme, for the reason
// ADR-0020 gives — `Document` would be either an alias of `Resource` or a mixture of
// model and IDE state, and the second is the mistake `scene.current` was in Legacy.
//
// THIS IS THE COUNTERPART OF graphs.js. The same layer that resolves a component's graph
// resolves a scene's payload, because it is the only layer that may: the Core never
// reaches storage, the Runtime must not, and putting it in the Editor would stop a
// headless server from opening a project (ADR-0011).
//
//   serializeScene(scene)   Core   turns the model into data
//   project.save(id, data)  here   persists it and bumps the revision
//   project.read(id)        here   reads it back, by id, lazily
//   deserializeScene(data)  Core   turns data into a model again
//
// Nothing in between rewrites the format. A scene that round-trips through this module is
// byte-identical to the one `serializeScene()` produced, which is what makes a saved
// project comparable to the model it came from.

import { deserializeScene, serializeScene } from '../core/mod.js';
import { createResource, ResourceKind } from './resource.js';

/**
 * Declare a scene in the project and store its current state.
 *
 * One ADD_RESOURCE operation, so it is arbitrable, replicable and undoable like every
 * other manifest mutation — creating a scene is not a special case (ADR-0019).
 *
 * @param {object} project - The project to declare it in
 * @param {object} scene - The scene to store
 * @param {object} [options] - Options
 * @param {string} [options.name] - Displayed name; the scene's own when omitted
 * @param {string} [options.path] - Where it is filed
 * @param {string} [options.id] - Existing ResourceId, used when loading a manifest
 * @param {number} [options.index] - Rank in the manifest
 * @param {string} [options.actor] - Who authored the intent
 * @param {string} [options.batch] - Groups this into a larger history entry
 * @returns {object|null} The manifest entry, or null when the operation was refused
 */
export function addScene(project, scene, { name, path, id, index, actor, batch } = {}) {
    const resource = createResource({
        kind: ResourceKind.SCENE,
        id,
        name: name ?? scene.name ?? '',
        path: path ?? ''
    });

    return project.add(resource, serializeScene(scene), { index, actor, batch });
}

/**
 * Write a scene's current state to its resource.
 *
 * The revision moves, which is what tells the Editor a panel is out of date. The manifest
 * `name` is deliberately NOT rewritten from `scene.name`: they are two fields with two
 * owners, and a save is not a rename (ADR-0020).
 *
 * @param {object} project - The project
 * @param {string} id - The scene's ResourceId
 * @param {object} scene - The scene to store
 * @param {object} [options] - Options
 * @param {string} [options.actor] - Who authored the intent
 * @returns {object|null} The manifest entry, or null when the resource is unknown
 */
export function saveScene(project, id, scene, { actor } = {}) {
    return project.save(id, serializeScene(scene), { actor });
}

/**
 * Read a scene back from the project.
 *
 * Asynchronous because the store's contract is: a store that talks to IndexedDB or to a
 * server cannot answer synchronously, and a caller written against a synchronous memory
 * store would have to be rewritten the day one arrives (ADR-0020).
 *
 * @param {object} project - The project
 * @param {string} id - The scene's ResourceId
 * @param {object} [options] - Options
 * @param {object} [options.registry] - Component registry used to resolve type names
 * @param {object} [options.authority] - Authority for the rebuilt scene's pipeline
 * @returns {Promise<object|null>} The scene, or null when there is no payload
 */
export async function loadScene(project, id, { registry, authority } = {}) {
    const data = await project.read(id);
    if (!data) return null;

    return deserializeScene(data, { registry, authority });
}

/**
 * The project's scene resources, in manifest order.
 * @param {object} project - The project
 * @returns {object[]} The manifest entries
 */
export function sceneResources(project) {
    return project.resources(ResourceKind.SCENE);
}
