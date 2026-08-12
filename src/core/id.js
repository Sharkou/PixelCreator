// Identifier generation.
//
// Identities are opaque: nothing is derived from a user-editable name (ADR-0010).
// Legacy used `Math.random().toString(36).substr(2, 9)`, which is neither uniformly
// distributed nor collision-resistant enough. This uses the platform CSPRNG, available
// both in browsers and in Node without any DOM dependency.

const ALPHABET = '0123456789abcdefghjkmnpqrstvwxyz';
const DEFAULT_LENGTH = 12;

/**
 * Create an opaque identifier.
 * @param {number} length - Number of characters, 12 by default (60 bits of entropy)
 * @returns {string} The identifier
 */
export function createId(length = DEFAULT_LENGTH) {
    if (!Number.isInteger(length) || length < 1) {
        throw new RangeError(`createId: length must be a positive integer, got ${length}`);
    }

    // The alphabet holds 32 symbols, so 256 is an exact multiple of it and masking a
    // random byte down to 5 bits keeps the distribution uniform without rejection.
    const bytes = new Uint8Array(length);
    globalThis.crypto.getRandomValues(bytes);

    let id = '';
    for (let i = 0; i < length; i++) {
        id += ALPHABET[bytes[i] & 31];
    }
    return id;
}
