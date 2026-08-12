// Operation: an intentional mutation of the model (ADR-0008).
//
// An Operation is data, not behaviour. It exists so a mutation can later be replicated,
// recorded, undone, attributed or arbitrated — the network is one destination among
// several, never the definition.
//
// Only setProperty() and its structural siblings create Operations. A plain write
// (`object.x = 100`) is a simulation output, not an intent, and produces none.

export const OperationType = {
    SET_PROPERTY: 'SET_PROPERTY'
};

let sequence = 0;

/**
 * Build an Operation.
 * @param {object} spec - Operation fields
 * @param {string} spec.type - One of OperationType
 * @param {object} spec.target - { object: id, component: type name or null }
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it, for authority and attribution
 * @param {string} [spec.batch] - Groups related operations into one history entry
 * @param {number} [spec.seq] - Sequence number; assigned when omitted
 * @returns {object} A frozen Operation
 */
export function createOperation({ type, target, origin, actor = null, batch = null, seq, ...payload }) {
    if (!type) throw new TypeError('createOperation: type is required');
    if (!target?.object) throw new TypeError('createOperation: target.object is required');
    if (!origin) throw new TypeError('createOperation: origin is required');

    return globalThis.Object.freeze({
        type,
        target: globalThis.Object.freeze({ object: target.object, component: target.component ?? null }),
        origin,
        actor,
        batch,
        seq: seq ?? ++sequence,
        ...payload
    });
}

/**
 * Build a SET_PROPERTY operation.
 * @param {object} spec - Operation fields
 * @param {object} spec.target - { object: id, component: type name or null }
 * @param {string} spec.prop - Property name
 * @param {any} spec.value - New value
 * @param {any} spec.previous - Value before the change, which is what makes undo possible
 * @param {string} spec.origin - One of Origin
 * @param {string} [spec.actor] - Who authored it
 * @param {string} [spec.batch] - History grouping
 * @returns {object} A frozen Operation
 */
export function setPropertyOperation({ target, prop, value, previous, origin, actor, batch }) {
    return createOperation({
        type: OperationType.SET_PROPERTY,
        target,
        prop,
        value,
        previous,
        origin,
        actor,
        batch
    });
}
