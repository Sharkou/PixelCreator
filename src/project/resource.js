// Resource — the unit of identity, storage, loading and reference in a project (ADR-0020).
//
// ONE CONCEPT, NOT THREE. A scene, a component definition, a graph and an image are all
// Resources. `Asset` and `Document` were both evaluated and both rejected:
//
//   `Asset` as a peer of Resource would create two identity schemes, two shapes of
//   reference inside a property, two loading paths and two replication paths — and no
//   answer to "why is an image an Asset when a .px is a Resource, given that a property
//   references them the same way". An image is a Resource of `kind: 'asset'` whose payload
//   lives outside the JSON. "Asset" stays a word for a panel, not a concept in the model.
//
//   `Document` would be either an alias of Resource, or a mixture of model and IDE state.
//   Identity is `Resource.id`, content is the payload, persistence is the ResourceStore,
//   "modified" is derivable from the resource's operation pipeline, and the undo stack is
//   already per resource. What is left — scroll, zoom, which tabs were open — is Editor
//   state, and putting it in the project is exactly the mistake `scene.current` was in
//   Legacy. What a tab opens is an `OpenEditor`, an Editor object, never serialized here.
//
// AN IDENTIFIER IS NEVER A NAME AND NEVER A PATH. This is ADR-0010 applied past the game:
// Legacy derived a resource's identity from `path + name`, so renaming a file changed what
// it was and broke every reference to it. Here `id` is minted once and never changes:
//
//   move a project   paths change, ids do not      -> nothing to do
//   copy a project   ids are identical             -> nothing to do
//   rename anything  `name` changes, `id` does not -> nothing to do
//
// Importing a resource from another project is the one case that could collide, and the
// honest answer is a remapping pass at import. It is NOT built now.

import { createId } from '../core/mod.js';

/** What a Resource can be. The list is meant to stay short. */
export const ResourceKind = {
    /**
     * A folder is a Resource, not a second concept beside one (ADR-0025).
     *
     * It has an id, a name and a place in the manifest like everything else; what it does
     * not have is a payload. Making it a kind rather than a container means one identity
     * scheme, one set of Operations, one undo stack — renaming a folder is the same
     * `SET_PROPERTY` that renames a scene, and deleting one is the same `REMOVE_RESOURCE`.
     */
    FOLDER: 'folder',
    SCENE: 'scene',
    COMPONENT: 'component',
    GRAPH: 'graph',
    /**
     * A reusable model of an Object and everything under it (ADR-0061).
     *
     * IT IS A KIND AND NOT A SCENE WITH A FLAG. A Scene is a place a game is played in; a
     * prefab is a description used to make part of one. They share a payload SHAPE — both
     * are serialized Objects — and share nothing else: a scene has roots, a camera and a
     * name a player sees, a prefab has one root and is instantiated into somewhere else. A
     * flag on `scene` would make every reader ask which it was holding, and the first one
     * that forgot would open a prefab as a level.
     */
    PREFAB: 'prefab',
    /**
     * A sprite animation: a strip of a picture, and how fast to walk it (ADR-0062 §4).
     *
     * A RESOURCE RATHER THAN A FIELD ON EVERY INSTANCE, for the reason ADR-0026 §1 gives a
     * `.px` and ADR-0061 gives a prefab: ten enemies playing `Walk` name one clip, retiming
     * it retimes all ten, and an instance carries an identity instead of a copy.
     */
    ANIMATION: 'animation',
    ASSET: 'asset'
};

const KINDS = new Set(globalThis.Object.values(ResourceKind));

/**
 * A manifest entry.
 *
 * @typedef {object} Resource
 * @property {string} id - Opaque identity, immutable for as long as the resource exists
 * @property {string} kind - One of ResourceKind
 * @property {string} name - Displayed name. Editable, not unique, referenced by nothing
 * @property {string|null} parent - The folder holding it, by id, or null at the top level
 * @property {number} created - When it was declared, epoch milliseconds
 * @property {number} modified - When its payload was last written, epoch milliseconds
 * @property {string} [mime] - For an asset, what its payload is
 * @property {number} revision - Bumped when the payload changes, for invalidation
 */

/**
 * Mint a ResourceId.
 *
 * The same generator as an Object's, deliberately: one notion of identity in the whole
 * product, opaque everywhere (ADR-0010).
 *
 * @returns {string} A new identifier
 */
export function createResourceId() {
    return createId();
}

/**
 * Build a manifest entry.
 *
 * `parent` REPLACED `path` (ADR-0025). A string path made the hierarchy a naming
 * convention: renaming a folder meant rewriting every entry that mentioned it, two
 * entries could disagree about the same folder, and nothing said whether `assets/` was a
 * folder that existed. A parent NAMES the folder by its identity, which is the same thing
 * an Object's `parent` does — one idea, applied twice.
 *
 * @param {object} spec - The entry
 * @param {string} spec.kind - One of ResourceKind
 * @param {string} [spec.id] - Existing identifier, used when loading
 * @param {string} [spec.name] - Displayed name
 * @param {string|null} [spec.parent] - The folder holding it, by id
 * @param {string} [spec.mime] - For an asset, what its payload is
 * @param {number} [spec.revision] - Starting revision
 * @param {number} [spec.created] - When it was declared; now by default
 * @param {number} [spec.modified] - When its payload was last written; `created` by default
 * @returns {Resource} A frozen manifest entry
 */
export function createResource({ kind, id, name = '', parent = null, mime, revision = 1, created, modified }) {
    if (!KINDS.has(kind)) {
        throw new TypeError(`createResource: unknown resource kind "${kind}"`);
    }

    // Stamped by the author, like the identifier and for the same reason: a receiver that
    // stamped its own would make two machines disagree about when a thing was made.
    const at = created ?? Date.now();

    const resource = {
        id: id ?? createResourceId(),
        kind,
        name,
        parent: parent ?? null,
        revision,
        created: at,
        modified: modified ?? at
    };
    if (mime !== undefined) resource.mime = mime;

    return globalThis.Object.freeze(resource);
}

/**
 * Tell whether a kind can hold other resources.
 *
 * One place answers it, so a second container kind — should one ever be justified — is a
 * change here and nowhere else.
 *
 * @param {object|string} resource - A resource, or a kind
 * @returns {boolean} True when it is a folder
 */
export function isFolder(resource) {
    return (typeof resource === 'string' ? resource : resource?.kind) === ResourceKind.FOLDER;
}

/**
 * Tell whether a kind carries a payload of its own.
 *
 * A folder does not, which is why saving one, or reading one, is meaningless rather than
 * merely empty.
 *
 * @param {object|string} resource - A resource, or a kind
 * @returns {boolean} True when the kind has content in the store
 */
export function hasPayload(resource) {
    return !isFolder(resource);
}

/**
 * Tell whether a value is usable as a ResourceId.
 *
 * Deliberately shallow: an identifier is opaque, so the only thing that can be checked
 * without reaching storage is that it is a non-empty string.
 *
 * @param {any} id - The value to check
 * @returns {boolean} True when it could be an identifier
 */
export function isResourceId(id) {
    return typeof id === 'string' && id !== '';
}
