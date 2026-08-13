// Filtering the Hierarchy.
//
// The rule that matters: A MATCH BRINGS ITS ANCESTORS WITH IT. Legacy filtered a flat
// list with `style.display = 'none'` per row, which cannot express that — in a tree it
// would hide a matching child along with the parent that does not match, and the search
// would appear to find nothing.
//
// Filtering is a view concern and touches nothing: the Scene is unchanged, the selection
// is unchanged, and clearing the field puts the tree back exactly as it was.
//
// No DOM here, so the interesting half of the search is testable under Node.

/**
 * The objects a query leaves visible.
 *
 * @param {object[]} roots - The scene's root objects
 * @param {string} query - What the creator typed
 * @returns {Set<object>|null} The objects to show, or null when nothing is filtered
 */
export function visibleObjects(roots, query) {
    const needle = query.trim().toLowerCase();
    if (needle === '') return null;

    const visible = new globalThis.Set();
    for (const root of roots) collect(root, needle, [], visible);
    return visible;
}

/**
 * Whether an object answers a query.
 *
 * Name and tag, case-insensitive, substring. Not the id: a creator does not know it, and
 * it is deliberately not shown anywhere in the Editor.
 *
 * @param {object} object - The object to test
 * @param {string} needle - Lower-cased query
 * @returns {boolean} True when it matches
 */
export function matches(object, needle) {
    return object.name.toLowerCase().includes(needle)
        || (object.tag !== '' && object.tag.toLowerCase().includes(needle));
}

function collect(object, needle, ancestors, visible) {
    const path = [...ancestors, object];

    if (matches(object, needle)) {
        // The whole chain, so a match nested three levels down is reachable.
        for (const step of path) visible.add(step);
    }

    for (const child of object.children) collect(child, needle, path, visible);
}
