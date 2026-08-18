// How big a picture is, read from the picture itself.
//
// THE INSPECTOR MUST NOT INVENT A NUMBER. "Dimensions" is the first thing a creator looks
// for when they select an image, and the two ways to get it that do not involve reading
// the file are both wrong: guessing from the name, and asking a decoded `HTMLImageElement`
// — which needs a browser, needs a load event, and answers `0 × 0` for the frame in which
// the panel is drawn. So the size is parsed out of the bytes the store already holds.
//
// IT IS A HEADER READ, NOT A DECODE. Every format this Editor can import writes its size
// within the first few dozen bytes, so nothing here allocates a bitmap or walks a stream:
// PNG says it in the IHDR chunk, GIF in the logical screen descriptor, BMP in its info
// header, WebP in the VP8 chunk, and JPEG in whichever start-of-frame marker its encoder
// chose — which is the only one that needs a walk, because JPEG puts arbitrary metadata
// in front of it.
//
// WHICH IS WHY IT IS HERE AND NOT IN THE EDITOR. It reads a payload a `Resource` carries
// and returns two numbers; there is no DOM in it, so it is testable under Node and usable
// by a headless build that wants to know what it imported (ADR-0020).
//
// AN UNKNOWN FORMAT ANSWERS null, NEVER A GUESS. A panel that shows nothing is honest; a
// panel that shows `0 × 0` is a bug report waiting to be filed.

/** The most bytes any supported format needs before it has stated its size. */
const SCAN_LIMIT = 64 * 1024;

/**
 * The pixel size of an image payload.
 *
 * @param {any} payload - What the store holds: a data URL, or raw bytes
 * @returns {{width: number, height: number}|null} Its size, or null when unreadable
 */
export function imageSize(payload) {
    const bytes = toBytes(payload);
    if (!bytes || bytes.length < 12) return null;

    return readPng(bytes)
        ?? readGif(bytes)
        ?? readBmp(bytes)
        ?? readWebp(bytes)
        ?? readJpeg(bytes)
        ?? null;
}

/**
 * A size, in the form a panel shows it.
 * @param {{width: number, height: number}|null} size - What `imageSize()` returned
 * @returns {string|null} `"64 × 64 px"`, or null
 */
export function formatSize(size) {
    if (!size) return null;
    return `${size.width} × ${size.height} px`;
}

/**
 * The bytes of a payload, however it is carried.
 *
 * ONLY BASE64 DATA URLS ARE DECODED. A `data:` URL may also be percent-encoded text, and
 * no image format this reads is text — so rather than decode a form that cannot contain an
 * answer, it declines and the caller shows nothing.
 *
 * @param {any} payload - The stored content
 * @returns {Uint8Array|null} The leading bytes, or null
 */
export function toBytes(payload) {
    if (payload instanceof globalThis.Uint8Array) return payload;
    if (payload instanceof globalThis.ArrayBuffer) return new globalThis.Uint8Array(payload);
    if (typeof payload !== 'string') return null;

    const comma = payload.indexOf(',');
    if (!payload.startsWith('data:') || comma === -1) return null;
    if (!payload.slice(0, comma).includes(';base64')) return null;

    try {
        // Bounded: a JPEG states its size early, and decoding a four-megabyte sprite sheet
        // to read four numbers is work nobody asked for. Base64 is four characters per
        // three bytes, and the slice is cut on a group boundary so the decoder never sees
        // a partial one.
        const encoded = payload.slice(comma + 1, comma + 1 + Math.ceil(SCAN_LIMIT / 3) * 4);
        const binary = globalThis.atob(encoded.slice(0, encoded.length - (encoded.length % 4)));
        const bytes = new globalThis.Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
        return bytes;
    } catch {
        // Not base64 after all. The caller shows nothing, which is the honest answer.
        return null;
    }
}

function readPng(bytes) {
    // \x89PNG\r\n\x1a\n, then an IHDR chunk whose first two fields are the size.
    const signature = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
    if (!starts(bytes, signature) || bytes.length < 24) return null;

    return { width: u32(bytes, 16), height: u32(bytes, 20) };
}

function readGif(bytes) {
    if (!starts(bytes, ascii('GIF8')) || bytes.length < 10) return null;
    // Little-endian, unlike everything else here: GIF came from a little-endian machine.
    return { width: u16le(bytes, 6), height: u16le(bytes, 8) };
}

function readBmp(bytes) {
    if (!starts(bytes, ascii('BM')) || bytes.length < 26) return null;
    // The height is signed: a negative one means the rows are stored top-down.
    const height = u32le(bytes, 22);
    return { width: u32le(bytes, 18), height: Math.abs(height | 0) };
}

function readWebp(bytes) {
    if (!starts(bytes, ascii('RIFF')) || bytes.length < 30) return null;
    if (!starts(bytes.subarray(8), ascii('WEBP'))) return null;

    const format = text(bytes, 12, 4);
    // Lossy: a VP8 keyframe puts a 14-bit size after its three-byte start code.
    if (format === 'VP8 ') return { width: u16le(bytes, 26) & 0x3fff, height: u16le(bytes, 28) & 0x3fff };
    // Lossless: 14 bits each, minus one, packed across four bytes.
    if (format === 'VP8L') {
        const bits = u32le(bytes, 21);
        return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 };
    }
    // Extended: 24-bit sizes, minus one.
    if (format === 'VP8X' && bytes.length >= 30) {
        return {
            width: (bytes[24] | (bytes[25] << 8) | (bytes[26] << 16)) + 1,
            height: (bytes[27] | (bytes[28] << 8) | (bytes[29] << 16)) + 1
        };
    }
    return null;
}

/**
 * JPEG, which is the only one that has to be walked.
 *
 * A JPEG is a chain of segments, and the size lives in a start-of-frame marker that may
 * sit behind any amount of EXIF, ICC and thumbnail data. So the segments are stepped
 * through by their declared lengths until one of the SOF markers turns up.
 */
function readJpeg(bytes) {
    if (bytes[0] !== 0xff || bytes[1] !== 0xd8) return null;

    let at = 2;
    while (at + 9 < bytes.length) {
        // Padding between segments is a run of 0xff; skip it rather than give up.
        if (bytes[at] !== 0xff) {
            at++;
            continue;
        }

        const marker = bytes[at + 1];
        if (marker === 0xff) {
            at++;
            continue;
        }

        // SOF0..SOF15, except the four that are not frame headers (DHT, JPG, DAC, RST).
        const isFrame = marker >= 0xc0 && marker <= 0xcf
            && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
        if (isFrame) return { width: u16(bytes, at + 7), height: u16(bytes, at + 5) };

        // Standalone markers carry no length; anything else states its own.
        if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) {
            at += 2;
            continue;
        }

        const length = u16(bytes, at + 2);
        if (length < 2) return null;
        at += 2 + length;
    }

    return null;
}

function starts(bytes, signature) {
    return signature.every((byte, index) => bytes[index] === byte);
}

function ascii(value) {
    return [...value].map(character => character.charCodeAt(0));
}

function text(bytes, at, length) {
    let value = '';
    for (let i = 0; i < length; i++) value += String.fromCharCode(bytes[at + i]);
    return value;
}

function u16(bytes, at) {
    return (bytes[at] << 8) | bytes[at + 1];
}

function u16le(bytes, at) {
    return bytes[at] | (bytes[at + 1] << 8);
}

function u32(bytes, at) {
    return ((bytes[at] << 24) | (bytes[at + 1] << 16) | (bytes[at + 2] << 8) | bytes[at + 3]) >>> 0;
}

function u32le(bytes, at) {
    return (bytes[at] | (bytes[at + 1] << 8) | (bytes[at + 2] << 16) | (bytes[at + 3] << 24)) >>> 0;
}
