// Where a dragged row lands, worked out from geometry alone.
//
// A DROP IN A HIERARCHY IS ONE GESTURE WITH TWO ANSWERS: between two rows it reorders,
// on a row it nests. Both are the same mutation of the model — `REPARENT { parent, index }`
// — which is exactly the argument ADR-0019 makes for having one operation instead of an
// `ADD_CHILD` and a `REMOVE_CHILD` that would always have to travel together.
//
// This module is pure: rectangles and a scene in, `{ parent, index }` out. No DOM events,
// no element, no drag state. That is what lets the rule that decides between "into" and
// "after" be tested under Node instead of being discovered by dragging things around.
//
// THE INDEX IS THE ONE PLACE THIS IS SUBTLE. The Hierarchy computes a rank in the list as
// the creator sees it — object included — while `Scene.reparent()` removes the object
// first and then inserts. Moving a row DOWN within its own parent therefore lands one
// position too far unless the rank is decremented, and that adjustment belongs here, with
// the rest of the geometry, rather than in the Core (which would then have two meanings
// for `index` depending on who called it).

/** What the pointer's position within a row means. */
export const DropPosition = {
    BEFORE: 'before',
    INTO: 'into',
    AFTER: 'after'
};

/**
 * How much of a row's height, at each edge, means "between rows" rather than "onto".
 *
 * A third leaves the middle third for nesting, which is the gesture that needs the most
 * room: dropping between two rows can always be retried a pixel away, dropping into the
 * wrong parent moves an object's world placement through a reparent (ADR-0022).
 */
export const EDGE = 1 / 3;

/**
 * Read a pointer position inside a row as a drop position.
 *
 * @param {number} clientY - The pointer's vertical position
 * @param {DOMRect|{top: number, height: number}} rect - The row's box
 * @param {object} [options] - Options
 * @param {boolean} [options.canNest] - Whether dropping onto this row may nest; false
 *   turns the whole row into a before/after target
 * @returns {string} One of DropPosition
 */
export function dropPositionAt(clientY, rect, { canNest = true } = {}) {
    const ratio = rect.height > 0 ? (clientY - rect.top) / rect.height : 0;

    if (!canNest) return ratio < 0.5 ? DropPosition.BEFORE : DropPosition.AFTER;
    if (ratio < EDGE) return DropPosition.BEFORE;
    if (ratio > 1 - EDGE) return DropPosition.AFTER;
    return DropPosition.INTO;
}

/**
 * Tell whether an object may be dropped relative to another.
 *
 * Refused, not thrown, and refused here as well as in the Core: the Scene guards the
 * cycle for every caller including a replicated operation (ADR-0019), and the Hierarchy
 * needs the same answer earlier, to decide whether to draw an indicator at all.
 *
 * @param {object} moved - The object being dragged
 * @param {object|null} target - The row under the pointer, or null for the empty area
 * @returns {boolean} True when the drop can be resolved
 */
export function canDrop(moved, target) {
    if (!moved) return false;
    if (!target) return true;
    if (moved === target) return false;
    return !contains(moved, target);
}

/**
 * Resolve a drop into the parent and rank a REPARENT needs.
 *
 * @param {object} scene - The scene being edited
 * @param {object} moved - The object being dragged
 * @param {object|null} target - The row under the pointer, or null to drop at the end of
 *   the top level
 * @param {string} position - One of DropPosition
 * @returns {{parent: object|null, index: number}|null} The drop, or null when refused
 */
export function dropTarget(scene, moved, target, position) {
    if (!canDrop(moved, target)) return null;

    if (!target) {
        return adjust(scene, moved, null, scene.roots().length);
    }

    if (position === DropPosition.INTO) {
        return adjust(scene, moved, target, target.children.length);
    }

    const parent = target.parent ?? null;
    const siblings = parent ? parent.children : scene.roots();
    const rank = siblings.indexOf(target);
    if (rank === -1) return null;

    return adjust(scene, moved, parent, position === DropPosition.AFTER ? rank + 1 : rank);
}

/**
 * The rank to submit, given a rank in the list as the creator sees it.
 *
 * Every ordered primitive in the Core — `Scene.reparent()`, `Object.moveComponent()` —
 * removes the item before it inserts it, so a move DOWN inside one collection lands one
 * position too far unless the displayed rank is decremented. A move up, or a move into
 * another collection, needs nothing.
 *
 * @param {number} current - The rank the item holds now, or -1 when it is arriving
 * @param {number} displayed - The rank it was dropped at, counting itself
 * @returns {number} The rank to hand the primitive
 */
export function insertionIndex(current, displayed) {
    return current !== -1 && current < displayed ? displayed - 1 : displayed;
}

/** The rank to hand `Scene.reparent()`, for a drop resolved above. */
function adjust(scene, moved, parent, index) {
    const current = moved.parent ?? null;
    if (current !== parent) return { parent, index };

    return { parent, index: insertionIndex(scene.indexOf(moved), index) };
}

/**
 * Whether an object is somewhere under another.
 * @param {object} object - The possible ancestor
 * @param {object} candidate - The object to look for
 * @returns {boolean} True when candidate hangs from object
 */
function contains(object, candidate) {
    for (let parent = candidate.parent; parent; parent = parent.parent) {
        if (parent === object) return true;
    }
    return false;
}
