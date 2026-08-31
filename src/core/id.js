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
 * @param {number} length - Number of characters, 12 by default (60 bits of entropy)
 * @returns {string} The identifier
 */
export function createId(length = DEFAULT_LENGTH) {
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
        const bytes = new Uint8Array(length - id.length);
        globalThis.crypto.getRandomValues(bytes);
        for (const byte of bytes) {
            if (byte >= limit) continue;
            id += ALPHABET[byte % ALPHABET.length];
        }
    }
    return id;
}
