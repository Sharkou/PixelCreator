// Authority: the point every submitted Operation must traverse (ADR-0011).
//
// What exists now is the insertion point, not the policy. The permission system —
// roles, project ownership, per-scene or per-object granularity — is deliberately out
// of scope; the architecture only has to leave room for it.
//
// Authority is NOT "server always allowed, client always denied". Which side arbitrates
// is decided by which entry point is used (Operations.submit vs Operations.apply), and
// a decision is taken per operation from its origin and actor. That is what lets an
// Editor holding the right permissions mutate an authoritative simulation.

/**
 * Allow an operation.
 * @param {object} [details] - Extra fields carried to the caller
 * @returns {object} An allowing decision
 */
export function allow(details = {}) {
    return { allowed: true, reason: null, ...details };
}

/**
 * Deny an operation.
 * @param {string} reason - Why it was denied, surfaced to the caller for reconciliation
 * @param {object} [details] - Extra fields carried to the caller
 * @returns {object} A denying decision
 */
export function deny(reason, details = {}) {
    return { allowed: false, reason, ...details };
}

/**
 * Authority that accepts everything.
 *
 * The default for single-player, for the Editor working offline, and for tests. It is
 * a real authority that is really traversed, not a bypass: swapping it for a
 * restrictive one changes no call site.
 */
export class AllowAllAuthority {

    /**
     * Decide whether an operation may be applied.
     * @param {object} operation - The operation under review
     * @returns {object} The decision
     */
    check(operation) {   // eslint-disable-line no-unused-vars
        return allow();
    }
}

/**
 * Authority driven by a predicate, for the cases a full policy object would overstate.
 */
export class PredicateAuthority {

    #predicate;

    /**
     * Create a predicate-based authority.
     * @param {Function} predicate - (operation) => boolean, or a decision object
     */
    constructor(predicate) {
        if (typeof predicate !== 'function') {
            throw new TypeError('PredicateAuthority: predicate must be a function');
        }
        this.#predicate = predicate;
    }

    /**
     * Decide whether an operation may be applied.
     * @param {object} operation - The operation under review
     * @returns {object} The decision
     */
    check(operation) {
        const result = this.#predicate(operation);
        if (typeof result === 'boolean') {
            return result ? allow() : deny('denied by policy');
        }
        return result;
    }
}
