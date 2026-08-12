// Operation pipeline.
//
// TWO ENTRY POINTS, AND THE DIFFERENCE BETWEEN THEM IS THE WHOLE ANTI-ECHO DESIGN:
//
//   submit(op)  "I arbitrate this operation."
//               authority.check -> apply -> emit 'operation'
//               Transports and history listen to 'operation', so a submitted intent
//               travels.
//
//   apply(op)   "This operation is already authoritative."
//               apply only. No authority, no 'operation' event.
//               A client applying what the server sent uses this, so nothing is
//               re-emitted and replication cannot loop.
//
// Neither path can create an Operation: applying one performs a plain property write
// (see properties/reactive.js), and plain writes never produce Operations. The loop
// Legacy fought with dispatch flags is not prevented here, it is unrepresentable.
//
// Note that origin and arbitration are independent. `origin` says who authored an
// intent ('editor', 'player', ...); submit vs apply says whether this node decides.
// A server receiving a player's operation still submits it — it arbitrates — and the
// broadcast that follows is what the client applies.

import { Emitter } from '../events.js';
import { applyProperty } from '../properties/reactive.js';
import { OperationType } from './operation.js';
import { AllowAllAuthority } from './authority.js';

export class Operations {

    #authority;
    #resolve;
    #handlers = new Map();
    #emitter = new Emitter();

    /**
     * Create a pipeline.
     * @param {object} [options] - Options
     * @param {object} [options.authority] - Object exposing check(operation) => decision
     * @param {Function} [options.resolve] - (target) => reactive target, or null when unknown
     */
    constructor({ authority = new AllowAllAuthority(), resolve = null } = {}) {
        this.#authority = authority;
        this.#resolve = resolve;
        this.register(OperationType.SET_PROPERTY, (operation, target) => {
            applyProperty(target, operation.prop, operation.value, operation.origin);
        });
    }

    get authority() {
        return this.#authority;
    }

    set authority(authority) {
        this.#authority = authority;
    }

    /**
     * Teach the pipeline how to apply an operation type.
     *
     * Keeps the pipeline unaware of the model: Scene and Object register their own
     * structural operations instead of this module importing them.
     *
     * @param {string} type - One of OperationType
     * @param {Function} handler - (operation, target) => void
     */
    register(type, handler) {
        if (typeof handler !== 'function') {
            throw new TypeError(`Operations.register: handler for "${type}" must be a function`);
        }
        this.#handlers.set(type, handler);
    }

    /**
     * Subscribe to pipeline events: 'operation' when one is applied after arbitration,
     * 'rejected' when authority denies one.
     * @param {string} event - Event name
     * @param {Function} listener - Called with the payload
     * @returns {Function} Unsubscribe function
     */
    on(event, listener) {
        return this.#emitter.on(event, listener);
    }

    /**
     * Arbitrate an operation, apply it when allowed, and announce it.
     * @param {object} operation - The operation to arbitrate
     * @returns {object} { applied, operation, decision }
     */
    submit(operation) {
        const decision = this.#authority.check(operation);

        if (!decision?.allowed) {
            this.#emitter.emit('rejected', { operation, decision });
            return { applied: false, operation, decision };
        }

        // An operation whose target does not exist here is not announced either: a
        // server must not broadcast a mutation it could not apply itself.
        const applied = this.#applyNow(operation);
        if (!applied) return { applied: false, operation, decision };

        // Only a submitted operation is announced. This is what a transport forwards,
        // and it is why applying a remote operation sends nothing back.
        this.#emitter.emit('operation', operation);

        return { applied: true, operation, decision };
    }

    /**
     * Apply an already-authoritative operation without arbitrating or announcing it.
     * @param {object} operation - The operation to apply
     * @returns {boolean} True when a target was resolved and the operation applied
     */
    apply(operation) {
        return this.#applyNow(operation);
    }

    #applyNow(operation) {
        const handler = this.#handlers.get(operation.type);
        if (!handler) {
            throw new Error(`Operations: no handler registered for "${operation.type}"`);
        }

        const target = this.#resolve?.(operation.target) ?? null;
        if (!target) return false;

        handler(operation, target);
        return true;
    }
}
