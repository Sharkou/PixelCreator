// Folders, and the questions a manifest is asked once it has a shape (ADR-0025).
//
// A FOLDER IS A RESOURCE, AND THE HIERARCHY IS A PARENT LINK. Not a path string parsed
// into a tree: a path made the hierarchy a naming convention, so renaming a folder meant
// rewriting every entry that mentioned it, two entries could disagree about the same
// folder, and nothing could say whether `assets/` was a folder that existed or a prefix
// somebody typed. `parent` names the folder by identity — the same answer ADR-0010 gives
// for everything else in this product, and the same shape `Object.parent` already has.
//
// Everything here is pure and reads the manifest. The mutations live on `Project`,
// because they are Operations and an Operation is arbitrated by a pipeline: moving is
// `SET_PROPERTY parent`, deleting a tree is a batch of `REMOVE_RESOURCE`. No new
// operation type was needed, which is the honest test of whether folders fit the model.

import { ResourceKind, isFolder } from './resource.js';

/**
 * The resources a folder holds, in manifest order.
 *
 * @param {object} project - The project
 * @param {string|null} [parent] - The folder's id, or null for the top level
 * @returns {object[]} The entries
 */
export function childrenOf(project, parent = null) {
    return project.resources().filter(resource => (resource.parent ?? null) === (parent ?? null));
}

/**
 * The folders a resource sits in, outermost first.
 *
 * The breadcrumb a panel draws, and the cycle guard's raw material.
 *
 * @param {object} project - The project
 * @param {string|object|null} resource - The resource, or its id
 * @returns {object[]} The chain of folders, excluding the resource itself
 */
export function ancestorsOf(project, resource) {
    const entry = resolve(project, resource);
    const chain = [];

    // Bounded by the manifest's size: a cycle can only exist if something built one, and
    // this function is what stops it from hanging when it reads one anyway.
    const seen = new globalThis.Set();
    let parent = entry?.parent ?? null;

    while (parent && !seen.has(parent)) {
        seen.add(parent);
        const folder = project.get(parent);
        if (!folder) break;
        chain.unshift(folder);
        parent = folder.parent ?? null;
    }

    return chain;
}

/**
 * The displayed path of a resource — what a breadcrumb reads out.
 *
 * DERIVED, NEVER STORED. That is the whole point of the parent link: the path is a view
 * of the hierarchy, so renaming a folder changes every path at once and rewrites nothing.
 *
 * @param {object} project - The project
 * @param {string|object} resource - The resource, or its id
 * @param {object} [options] - Options
 * @param {boolean} [options.self] - Include the resource's own name
 * @param {string} [options.separator] - What joins the names
 * @returns {string} The path, empty at the top level
 */
export function folderPath(project, resource, { self = false, separator = '/' } = {}) {
    const entry = resolve(project, resource);
    const names = ancestorsOf(project, entry).map(folder => folder.name || 'Untitled');
    if (self && entry) names.push(entry.name || 'Untitled');
    return names.join(separator);
}

/**
 * Every resource under a folder, depth first, parents before their children.
 *
 * The order matters when the list is replayed: undoing a deletion restores in reverse, so
 * a parent comes back before the children that name it.
 *
 * @param {object} project - The project
 * @param {string|object} folder - The folder, or its id
 * @returns {object[]} The descendants, the folder itself excluded
 */
export function descendantsOf(project, folder) {
    const entry = resolve(project, folder);
    if (!entry) return [];

    const found = [];
    for (const child of childrenOf(project, entry.id)) {
        found.push(child, ...descendantsOf(project, child));
    }
    return found;
}

/**
 * Tell whether a resource sits under a folder, at any depth.
 *
 * @param {object} project - The project
 * @param {string|object} folder - The possible ancestor
 * @param {string|object} candidate - The resource to test
 * @returns {boolean} True when candidate hangs from folder
 */
export function isDescendantOf(project, folder, candidate) {
    const target = resolve(project, folder);
    const entry = resolve(project, candidate);
    if (!target || !entry) return false;

    return ancestorsOf(project, entry).some(ancestor => ancestor.id === target.id);
}

/**
 * Tell whether a resource can be moved into a folder.
 *
 * Refused rather than thrown, and asked in two places for the reason ADR-0019 gives: the
 * pipeline validates every move including a replicated one, and a panel needs the same
 * answer earlier, to decide whether to draw a drop target at all.
 *
 * @param {object} project - The project
 * @param {string|object} resource - What is moving
 * @param {string|null} parent - Where it is going, by id, or null for the top level
 * @returns {boolean} True when the move is legal
 */
export function canMove(project, resource, parent) {
    const entry = resolve(project, resource);
    if (!entry) return false;
    if (parent === null || parent === undefined) return true;
    if (parent === entry.id) return false;

    const folder = project.get(parent);
    if (!folder || !isFolder(folder)) return false;

    // A folder dropped into its own subtree would take the manifest with it: the branch
    // would still exist and be reachable from nothing.
    return !isDescendantOf(project, entry, folder);
}

/**
 * A name no sibling is using, derived deterministically.
 *
 * Names are not identities (ADR-0010), so duplicates are legal — they are just unhelpful
 * in a list. Deterministic on purpose: the same manifest and the same base always produce
 * the same name, which is what makes creation testable and two machines agree.
 *
 * @param {object} project - The project
 * @param {string} base - The name to start from
 * @param {string|null} [parent] - The folder the name has to be free in
 * @returns {string} The name to use
 */
export function uniqueResourceName(project, base, parent = null) {
    const taken = new globalThis.Set(childrenOf(project, parent).map(resource => resource.name));
    if (!taken.has(base)) return base;

    // THE COUNTER GOES BEFORE THE EXTENSION, never after it: `hero 2.png`, because
    // `hero.png 2` is not a file name anybody would type (ADR-0026).
    const match = /(\.[A-Za-z0-9]{1,5})$/.exec(base);
    const stem = match ? base.slice(0, -match[1].length) : base;
    const extension = match ? match[1] : '';

    for (let suffix = 2; ; suffix++) {
        const candidate = `${stem} ${suffix}${extension}`;
        if (!taken.has(candidate)) return candidate;
    }
}

/** The default name a new resource of each kind is given. */
export const KIND_LABELS = {
    [ResourceKind.FOLDER]: 'New Folder',
    [ResourceKind.SCENE]: 'New Scene',
    [ResourceKind.COMPONENT]: 'New Component',
    [ResourceKind.GRAPH]: 'New Graph',
    [ResourceKind.ASSET]: 'New Asset'
};

function resolve(project, resource) {
    if (resource === null || resource === undefined) return null;
    return typeof resource === 'string' ? project.get(resource) : resource;
}
