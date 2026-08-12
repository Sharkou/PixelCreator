// Ambient origin of the mutation currently being applied.
//
// Every Change carries an origin so subscribers know where a mutation came from
// (ADR-0003). Threading an origin argument through every write would push the concern
// into every call site, which is exactly what v2 avoids: a call site chooses its API
// (`object.x = v` or `object.setProperty(...)`), never a synchronization flag.
//
// Dispatch is synchronous, so a simple scoped variable is enough and always accurate:
// the origin is restored before withOrigin() returns.

export const Origin = {
    /** A local script or an unattributed write. Default. */
    LOCAL: 'local',
    /** Output of the simulation: a component's update(). */
    RUNTIME: 'runtime',
    /** Explicit intent from the Editor. */
    EDITOR: 'editor',
    /** Explicit intent from a player in game. */
    PLAYER: 'player',
    /** An operation received from the network, already authoritative. */
    NETWORK: 'network'
};

let current = Origin.LOCAL;

/**
 * Read the origin in effect for the mutation being applied.
 * @returns {string} The current origin
 */
export function currentOrigin() {
    return current;
}

/**
 * Run a function with a given ambient origin.
 * @param {string} origin - One of Origin
 * @param {Function} fn - Function to run
 * @returns {any} Whatever fn returns
 */
export function withOrigin(origin, fn) {
    const previous = current;
    current = origin;
    try {
        return fn();
    } finally {
        current = previous;
    }
}
