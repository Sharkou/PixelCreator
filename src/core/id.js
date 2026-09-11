// Identifier generation.
//
// Identities are opaque: nothing is derived from a user-editable name (ADR-0010).
// Legacy used `Math.random().toString(36).substr(2, 9)`, which is neither uniformly
// distributed nor collision-resistant enough. This uses the platform CSPRNG, available
// both in browsers and in Node without any DOM dependency.

// LETTERS ONLY, AND UNAMBIGUOUS ONES (ADR-0049). An identifier is read aloud, typed from a
// screenshot and pasted into a URL, and a digit beside a letter is where that goes wrong:
// `0`/`O`, `1`/`l`. Dropping the digits also makes an id look like a WORD rather than like a
// hash, which is what a creator sharing a link expects to see.
//
// IT IS STILL DRAWN, NEVER DERIVED. ADR-0010 forbids an identity that comes from a name a
// creator can change; nothing here reads a name. What changed is the alphabet, not where the
// value comes from — so renaming a project still breaks nothing.
//
// `i`, `l`, `o` AND `u` ARE OUT: the first three because they are the classic misreadings,
// and `u` because leaving it in is how a random string spells something nobody wanted.
const ALPHABET = 'abcdefghjkmnpqrstvwxyz';

// FOURTEEN, BECAUSE TWENTY-TWO SYMBOLS ARE WORTH LESS THAN THIRTY-TWO. The old alphabet gave
// exactly 5 bits a character; this one gives log2(22) ≈ 4.46, so twelve characters would be
// 53 bits where the guarantee was 60. Fourteen restores it (62 bits) at the cost of two
// characters nobody reads anyway.
const DEFAULT_LENGTH = 14;

/**
 * Create an opaque identifier.
 *
 * WHERE THE BYTES COME FROM IS THE ONE THING A CALLER MAY CHANGE, and nothing else about an
 * identifier is (ADR-0057 §4). A simulation has to be able to mint the SAME identity on a
 * server and on every client — an object spawned by a graph is a consequence of a step, so
 * two machines running that step must agree on what was created (ADR-0011). What they cannot
 * share is the platform CSPRNG, so the Runtime hands its own seeded byte source instead.
 *
 * THE ALPHABET, THE LENGTH AND THE REJECTION RULE DO NOT MOVE. An identifier minted in a
 * simulation is an ordinary identifier — same shape, same guarantees, readable aloud in the
 * same way (ADR-0049) — and pushing the seam this far down is what keeps it that way. A
 * second id function for the Runtime would be a second answer to "what is an identity".
 *
 * @param {number} [length] - Number of characters, 14 by default (62 bits of entropy)
 * @param {object} [options] - Options
 * @param {Function} [options.randomBytes] - Fills a Uint8Array in place; the platform
 *   CSPRNG by default. A deterministic source makes the identifier reproducible, and
 *   therefore no longer unguessable — see the caution in the header.
 * @returns {string} The identifier
 */
export function createId(length = DEFAULT_LENGTH, { randomBytes = secureBytes } = {}) {
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError(`createId: length must be a positive integer, got ${length}`);
    }

    // REJECTION, BECAUSE 22 DOES NOT DIVIDE 256. Masking or taking a remainder would make
    // the first few letters of the alphabet likelier than the last — a bias that shrinks the
    // real value space and that no test of "does it use every character" would catch. The
    // largest exact multiple of 22 below 256 is 242, so a byte at or above it is thrown away
    // and redrawn; that happens for 14 values in 256, about 5% of the time.
    const limit = 256 - (256 % ALPHABET.length);

    let id = '';
    while (id.length < length) {
        const bytes = randomBytes(new Uint8Array(length - id.length));
        for (const byte of bytes) {
            if (byte >= limit) continue;
            id += ALPHABET[byte % ALPHABET.length];
        }
    }
    return id;
}

/**
 * The default byte source: the platform CSPRNG, in a browser and in Node alike.
 *
 * @param {Uint8Array} bytes - The array to fill, in place
 * @returns {Uint8Array} The same array
 */
function secureBytes(bytes) {
    globalThis.crypto.getRandomValues(bytes);
    return bytes;
}
