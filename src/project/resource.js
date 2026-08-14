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

/** What a Resource can be. Four kinds, and the list is meant to stay short. */
export const ResourceKind = {
    SCENE: 'scene',
    COMPONENT: 'component',
    GRAPH: 'graph',
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
 * @property {string} path - Where it is filed. Indicative; moving it breaks nothing
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
 * @param {object} spec - The entry
 * @param {string} spec.kind - One of ResourceKind
 * @param {string} [spec.id] - Existing identifier, used when loading
 * @param {string} [spec.name] - Displayed name
 * @param {string} [spec.path] - Where it is filed
 * @param {string} [spec.mime] - For an asset, what its payload is
 * @param {number} [spec.revision] - Starting revision
 * @returns {Resource} A frozen manifest entry
 */
export function createResource({ kind, id, name = '', path = '', mime, revision = 1 }) {
    if (!KINDS.has(kind)) {
        throw new TypeError(`createResource: unknown resource kind "${kind}"`);
    }

    const resource = { id: id ?? createResourceId(), kind, name, path, revision };
    if (mime !== undefined) resource.mime = mime;

    return globalThis.Object.freeze(resource);
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
