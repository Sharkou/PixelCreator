// Minimal synchronous event emitter.
//
// Dispatch is synchronous and ordered: listeners run in subscription order, and a
// change is fully observed before the emitting call returns. That is what lets the
// Editor stay in sync letter by letter without a reactive framework.
//
// Two Legacy defects are fixed here (see docs/architecture/CORE.md, "Events"):
//
//   - Legacy declared removeEventListener but never called it, so listeners piled up
//     for the lifetime of the page. Here `on()` returns an unsubscribe function.
//   - A throwing listener aborted Legacy's dispatch loop, silently starving every
//     later listener of the event. Here each listener is isolated.
//
// Errors are never swallowed. By default a failing listener is reported asynchronously,
// so the dispatch loop completes but the error still reaches the host (window error
// handler, test runner, process). Pass `onError` to intercept it instead.

export class Emitter {

    #listeners = new Map();
    #onError;

    /**
     * Create an emitter.
     * @param {object} [options] - Options
     * @param {Function} [options.onError] - Called with (error, event, payload) when a listener throws
     */
    constructor({ onError } = {}) {
        this.#onError = onError ?? defaultOnError;
    }

    /**
     * Subscribe to an event.
     * @param {string} event - Event name
     * @param {Function} listener - Called with the emitted payload
     * @returns {Function} Unsubscribe function, safe to call more than once
     */
    on(event, listener) {
        if (typeof listener !== 'function') {
            throw new TypeError(`Emitter.on: listener for "${event}" must be a function`);
        }

        let listeners = this.#listeners.get(event);
        if (!listeners) {
            listeners = new Set();
            this.#listeners.set(event, listeners);
        }
        listeners.add(listener);

        return () => this.off(event, listener);
    }

    /**
     * Unsubscribe a listener.
     * @param {string} event - Event name
     * @param {Function} listener - The listener passed to on()
     * @returns {boolean} True if the listener was subscribed
     */
    off(event, listener) {
        const listeners = this.#listeners.get(event);
        if (!listeners) return false;

        const removed = listeners.delete(listener);
        if (listeners.size === 0) this.#listeners.delete(event);
        return removed;
    }

    /**
     * Notify every listener of an event, in subscription order.
     * @param {string} event - Event name
     * @param {any} [payload] - Value passed to each listener
     * @returns {number} How many listeners were notified
     */
    emit(event, payload) {
        const listeners = this.#listeners.get(event);
        if (!listeners || listeners.size === 0) return 0;

        // Iterate a snapshot: subscribing or unsubscribing from inside a listener must
        // not affect the dispatch in flight, otherwise ordering stops being predictable
        // and a listener that re-subscribes could loop forever.
        const snapshot = [...listeners];

        for (const listener of snapshot) {
            try {
                listener(payload);
            } catch (error) {
                this.#onError(error, event, payload);
            }
        }

        return snapshot.length;
    }

    /**
     * Remove listeners.
     * @param {string} [event] - Event name; every event is cleared when omitted
     */
    clear(event) {
        if (event === undefined) this.#listeners.clear();
        else this.#listeners.delete(event);
    }

    /**
     * Count subscribed listeners.
     * @param {string} [event] - Event name; every event is counted when omitted
     * @returns {number} The listener count
     */
    listenerCount(event) {
        if (event !== undefined) return this.#listeners.get(event)?.size ?? 0;

        let total = 0;
        for (const listeners of this.#listeners.values()) total += listeners.size;
        return total;
    }
}

function defaultOnError(error, event) {
    // Rethrow out of band: the current dispatch still completes, but the error stays
    // visible to whatever handles uncaught errors. Never silently dropped.
    //
    // WRAPPED, NEVER REWRITTEN. Rewriting `error.message` mutates the very object a listener
    // threw, which is the one thing a reporting path must not do (ADR-0012, and the same
    // reasoning `runtime/errors.js` states for a component failure). It also compounded: one
    // error object reported twice grew a second prefix. The context travels in a wrapper, so
    // `thrown.cause` is the error exactly as the listener threw it.
    queueMicrotask(() => {
        throw new Error(
            `Emitter: listener for "${event}" threw: ${error?.message ?? error}`,
            { cause: error }
        );
    });
}
