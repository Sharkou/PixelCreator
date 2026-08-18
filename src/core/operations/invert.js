// invert(operation) -> operation (ADR-0024).
//
// WHY THIS LIVES IN THE CORE, next to the format rather than next to the undo stack:
// one place knows the inversion rule of each type. An Editor that re-derived those rules
// would hold a second, silently divergent copy of the operation format — and a server
// replaying a session would have no way to reach them at all.
//
// WHAT IT IS NOT. It is not undo. Undo is an act of authorship: a stack, a grouping, a
// keystroke, a decision about *what* to take back. That belongs to the Editor
// (editor/history.js). This function only answers "what is the opposite of this
// mutation", and it answers it purely — no model, no scene, no side effect, testable
// under Node.
//
// The inverse of an inverse is the original, for every type here. That is the property
// the tests check, and it is what makes redo the same machinery as undo.
//
// `seq` is deliberately cleared: an inverse is a NEW intent, arbitrated on its own, and it
// gets its own sequence number from the pipeline that accepts it. Reusing the original's
// would make two distinct mutations claim one position in the order.

import { OperationType } from './operation.js';

/**
 * The operation that undoes another one.
 *
 * @param {object} operation - The operation to invert
 * @returns {object} A frozen Operation that reverses it
 */
export function invert(operation) {
    if (!operation?.type) throw new TypeError('invert: expected an operation');

    const rule = RULES[operation.type];
    if (!rule) throw new Error(`invert: no inversion rule for "${operation.type}"`);

    return globalThis.Object.freeze({
        ...operation,
        ...rule(operation),
        // Not a copy of the original: a fresh intent, arbitrated on its own terms.
        seq: null
    });
}

/**
 * Tell whether an operation type can be inverted.
 * @param {string} type - One of OperationType
 * @returns {boolean} True when a rule exists
 */
export function invertible(type) {
    return globalThis.Object.hasOwn(RULES, type);
}

const RULES = {
    // Swap the two values the operation already carries. ADR-0008 put `previous` in the
    // format for exactly this, so SET_PROPERTY has been invertible since it existed.
    [OperationType.SET_PROPERTY]: operation => ({
        value: operation.previous,
        previous: operation.value
    }),

    // Adding and removing are each other's inverse, and both carry the whole subtree with
    // its parent and rank — so undoing a deletion restores the shape, not just the node.
    [OperationType.ADD_OBJECT]: operation => ({
        type: OperationType.REMOVE_OBJECT
    }),

    [OperationType.REMOVE_OBJECT]: operation => ({
        type: OperationType.ADD_OBJECT
    }),

    // Same values, same rank: what comes back is the component that left, not a fresh one
    // reset to its defaults.
    [OperationType.ADD_COMPONENT]: operation => ({
        type: OperationType.REMOVE_COMPONENT
    }),

    [OperationType.REMOVE_COMPONENT]: operation => ({
        type: OperationType.ADD_COMPONENT
    }),

    [OperationType.MOVE_COMPONENT]: operation => ({
        index: operation.previousIndex,
        previousIndex: operation.index
    }),

    // A REPARENT inverts into a REPARENT: two operations that undo each other are the same
    // operation. This is the argument for having merged unparent and reorder into it.
    [OperationType.REPARENT]: operation => ({
        parent: operation.previousParent,
        index: operation.previousIndex,
        previousParent: operation.parent,
        previousIndex: operation.index
    }),

    [OperationType.ADD_RESOURCE]: operation => ({
        type: OperationType.REMOVE_RESOURCE
    }),

    // A move inverts into a move, for the same reason a REPARENT does: two operations that
    // undo each other are the same operation (ADR-0019, ADR-0026).
    [OperationType.MOVE_RESOURCE]: operation => ({
        parent: operation.previousParent,
        index: operation.previousIndex,
        previousParent: operation.parent,
        previousIndex: operation.index
    }),

    [OperationType.REMOVE_RESOURCE]: operation => ({
        type: OperationType.ADD_RESOURCE
    }),

    // `.px` scope (ADR-0027). Adding and removing a node are each other's inverse and both
    // carry the wiring, so undoing a deletion restores the graph's shape and not merely
    // its node — the argument REMOVE_OBJECT.subtree already makes.
    [OperationType.ADD_NODE]: operation => ({
        type: OperationType.REMOVE_NODE
    }),

    [OperationType.REMOVE_NODE]: operation => ({
        type: OperationType.ADD_NODE
    }),

    [OperationType.CONNECT]: operation => ({
        type: OperationType.DISCONNECT
    }),

    [OperationType.DISCONNECT]: operation => ({
        type: OperationType.CONNECT
    }),

    [OperationType.ADD_PROPERTY]: operation => ({
        type: OperationType.REMOVE_PROPERTY
    }),

    // Renaming a property, changing its type or its default are not here, and that is the
    // point: each is a field of a reactive record, so each is a SET_PROPERTY whose
    // inversion rule was written the day the format was (ADR-0027).
    [OperationType.REMOVE_PROPERTY]: operation => ({
        type: OperationType.ADD_PROPERTY
    })
};
