// Chance, as a thing the simulation owns rather than reaches for (ADR-0057).
//
// `runtime/random/`, NOT `core/random/`, AND THE ARGUMENT IS ADR-0014's WORD FOR WORD. That
// ADR settled the same question for input: "Le Core ne connaît aucun input. Un `Object` n'a
// pas d'entrées ; une simulation en a." An Object has no luck either. What has luck is a
// SIMULATION — and a simulation is what the Runtime is, which is why the three things the
// environment would otherwise hand a game are three folders side by side:
//
//   runtime/clock/    when                 fixed step, never the display's rate
//   runtime/input/    what a player did    passed in, never a global (ADR-0014)
//   runtime/random/   chance               seeded, never `Math.random()`
//
// A SEEDED STREAM IS NOT A WEAKER RANDOM, IT IS THE ONLY ONE A REPLICATED GAME CAN HAVE. A
// server arbitrates the simulation (ADR-0011) and every client runs the same one; an unseeded
// `Math.random()` makes them disagree on the first draw and never agree again. Legacy could
// not have this problem because Legacy had no authority to disagree with.
//
// ONE ALGORITHM IN THE REPOSITORY, AND IT WAS ALREADY HERE. `ParticleSystem` shipped a
// deterministic LCG inline for exactly this reason, with exactly this comment, and it now
// steps through `advance()` rather than through a second copy of the constants — one
// generator, two owners of state.
//
// WHAT THIS IS NOT: a cryptographic source, and it must never be used as one. `createId()`
// draws from the platform CSPRNG for identities that leave the machine; this draws from a
// number a server can send you, which is the opposite property and the point.

/**
 * One step of the generator, on a 32-bit state.
 *
 * A LINEAR CONGRUENTIAL GENERATOR, with the Numerical Recipes constants — the pair that
 * gives a full period over the whole 32-bit range, so the stream never short-cycles. It is
 * exported because a component may own its own position in a stream (`ParticleSystem` does)
 * and the alternative is a second copy of these two numbers.
 *
 * `Math.imul` RATHER THAN `*`: the product of two 32-bit numbers exceeds what a double holds
 * exactly, so a plain multiply silently loses the low bits of the very state it is deriving.
 *
 * @param {number} state - The current 32-bit state
 * @returns {number} The next state, as an unsigned 32-bit integer
 */
export function advance(state) {
    return (Math.imul(state >>> 0, 1664525) + 1013904223) >>> 0;
}

/**
 * A state read as a number from 0 inclusive to 1 exclusive.
 *
 * THE TOP TWENTY-FOUR BITS, NOT ALL THIRTY-TWO. The low bits of an LCG have a short period —
 * the last bit alternates — so a stream read whole is visibly patterned in exactly the place
 * a creator will notice it: a coin flip taken as `next() < 0.5`. Dropping the low byte costs
 * nothing and removes the pattern.
 *
 * @param {number} state - A 32-bit state
 * @returns {number} A number in [0, 1)
 */
export function unitOf(state) {
    return (state >>> 8) / 16777216;
}

/**
 * A named, reproducible stream of chance.
 *
 * TWO RUNS OF ONE SEED ARE THE SAME RUN. That is the whole contract, and everything else here
 * exists to keep it: no clock, no counter of its own beyond the state, nothing read from an
 * environment. Give a client and a server the same seed and the same steps, and they draw the
 * same numbers in the same order.
 */
export class Random {

    #state;

    /**
     * Open a stream.
     *
     * A SEED IS A STRING, LIKE EVERY OTHER IDENTITY IN THIS PRODUCT (ADR-0010). It is what a
     * server sends, what a replay names and what a bug report quotes — so it has to survive a
     * URL and a paste, which a float does not. A number is accepted too and used as it is,
     * because a test that wants `new Random(1)` should be allowed to say so.
     *
     * @param {string|number} seed - What the stream is derived from
     */
    constructor(seed) {
        this.#state = stateOf(seed);
    }

    /**
     * The next number in the stream, from 0 inclusive to 1 exclusive.
     * @returns {number} The draw
     */
    next() {
        this.#state = advance(this.#state);
        return unitOf(this.#state);
    }

    /**
     * The next number, mapped between two bounds.
     *
     * The bounds are used as they are given: `between(10, 0)` counts down, which is the
     * reading of the two numbers rather than a mistake to correct. `max` is exclusive because
     * `next()` is, so `between(0, 3)` floored is a fair choice of three.
     *
     * @param {number} min - Lower bound, inclusive
     * @param {number} max - Upper bound, exclusive
     * @returns {number} The draw
     */
    between(min, max) {
        return min + this.next() * (max - min);
    }

    /**
     * Fill a byte array from the stream.
     *
     * THE SEAM `createId()` TAKES, and why this stream can mint an identity without knowing
     * what an identity looks like: the alphabet, the length and the rejection rule stay in
     * `core/id.js`, and what changes is only where the bytes come from (ADR-0057 §4).
     *
     * ONE DRAW PER BYTE, TAKING THE TOP EIGHT BITS. Slicing one draw into four bytes would
     * hand out the weak low bits `unitOf()` exists to drop.
     *
     * @param {Uint8Array} bytes - The array to fill, in place
     * @returns {Uint8Array} The same array
     */
    fill(bytes) {
        for (let index = 0; index < bytes.length; index++) {
            this.#state = advance(this.#state);
            bytes[index] = this.#state >>> 24;
        }
        return bytes;
    }
}

/**
 * The 32-bit state a seed opens a stream at.
 *
 * FNV-1a over the characters, which is enough and is not a choice worth more than a line: what
 * a hash has to do here is spread two seeds that differ by one character to two unrelated
 * states, so that `"abc:random"` and `"abc:ids"` are independent streams of one seed. It is
 * not protecting anything from anyone.
 *
 * @param {string|number} seed - The seed
 * @returns {number} An unsigned 32-bit state
 */
function stateOf(seed) {
    if (typeof seed === 'number' && Number.isFinite(seed)) return seed >>> 0;

    const text = globalThis.String(seed ?? '');
    let hash = 2166136261;
    for (let index = 0; index < text.length; index++) {
        hash ^= text.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
    }
    return hash >>> 0;
}
