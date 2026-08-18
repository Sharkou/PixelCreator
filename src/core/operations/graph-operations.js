// Operations that edit a `.px` — its graph, and the properties it declares (ADR-0027).
//
// A THIRD PIPELINE, NOT A THIRD SYSTEM. The argument is the one ADR-0020 makes for the
// Project: a Scene pipeline's `resolve` looks identifiers up among its Objects and cannot
// resolve a node. So a `.px` owns an `Operations` of its own — same class, same contract,
// same anti-echo, a different `resolve` — and every edit of a graph is arbitrable,
// replicable and invertible for free.
//
// THE INVERSION FIELDS ARE THE POINT, exactly as they are for the scene operations
// (ADR-0024 §6):
//
//   REMOVE_NODE.connections    without it, undoing a deletion returns an unwired node
//   REMOVE_NODE.index          without it, the node comes back at the end
//   REMOVE_PROPERTY.index      without it, a restored property lands last in the schema
//   REMOVE_PROPERTY.property   without it, undoing a deletion returns an empty declaration
//
// WHAT IS DELIBERATELY ABSENT. There is no operation for moving a node, for changing one
// of its params, or for renaming a declared property: each of those is a field of a
// reactive record, so each is `SET_PROPERTY`, which replicates and inverts already. An
// operation of its own would be a second way to say what the format says.
//
// These builders live beside the others rather than inside `operation.js` because that
// file is already the whole scene-and-project format; what they share is `createOperation`,
// and that is the only thing they import.

import { OperationType, createOperation } from './operation.js';

/**
 * Build an ADD_NODE operation.
 *
 * `connections` is empty for a fresh node and carries the wiring when this operation is
 * the inverse of a removal — which is what makes "delete a node, undo" put the wires back
 * rather than return an island.
 *
 * @param {object} spec - Operation fields
 * @param {object} spec.node - The node record, as plain data
 * @param {number|null} [spec.index] - Rank among the nodes
 * @param {object[]} [spec.connections] - Connections restored with it
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function addNodeOperation({ node, index = null, connections = [], origin, actor, batch }) {
    return createOperation({
        type: OperationType.ADD_NODE,
        target: { object: node.id, component: null },
        node,
        index,
        connections,
        origin,
        actor,
        batch
    });
}

/**
 * Build a REMOVE_NODE operation.
 *
 * @param {object} spec - Operation fields
 * @param {object} spec.node - The node record being removed, as plain data
 * @param {number|null} [spec.index] - The rank it held
 * @param {object[]} [spec.connections] - The connections that touched it
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function removeNodeOperation({ node, index = null, connections = [], origin, actor, batch }) {
    return createOperation({
        type: OperationType.REMOVE_NODE,
        target: { object: node.id, component: null },
        node,
        index,
        connections,
        origin,
        actor,
        batch
    });
}

/**
 * Build a CONNECT operation.
 *
 * The connection travels whole, identifier included, so every node builds the same wire
 * with the same id — the rule the format already follows for objects (ADR-0008).
 *
 * @param {object} spec - Operation fields
 * @param {object} spec.connection - The connection record
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function connectOperation({ connection, origin, actor, batch }) {
    return createOperation({
        type: OperationType.CONNECT,
        target: { object: connection.id, component: null },
        connection,
        origin,
        actor,
        batch
    });
}

/**
 * Build a DISCONNECT operation.
 * @param {object} spec - Operation fields
 * @param {object} spec.connection - The connection record being removed
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function disconnectOperation({ connection, origin, actor, batch }) {
    return createOperation({
        type: OperationType.DISCONNECT,
        target: { object: connection.id, component: null },
        connection,
        origin,
        actor,
        batch
    });
}

/**
 * Build an ADD_PROPERTY operation.
 *
 * @param {object} spec - Operation fields
 * @param {object} spec.property - `{ id, name, type, default }`
 * @param {number|null} [spec.index] - Rank in the schema
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function addPropertyOperation({ property, index = null, origin, actor, batch }) {
    return createOperation({
        type: OperationType.ADD_PROPERTY,
        target: { object: property.id, component: null },
        property,
        index,
        origin,
        actor,
        batch
    });
}

/**
 * Build a REMOVE_PROPERTY operation.
 * @param {object} spec - Operation fields
 * @param {object} spec.property - The descriptor being removed
 * @param {number|null} [spec.index] - The rank it held
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function removePropertyOperation({ property, index = null, origin, actor, batch }) {
    return createOperation({
        type: OperationType.REMOVE_PROPERTY,
        target: { object: property.id, component: null },
        property,
        index,
        origin,
        actor,
        batch
    });
}
