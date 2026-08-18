import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatSize, imageSize, toBytes } from './image.js';

/** A data URL from raw bytes, the way the store holds an imported file. */
function dataUrl(bytes, mime = 'image/png') {
    const binary = globalThis.String.fromCharCode(...bytes);
    return `data:${mime};base64,${globalThis.btoa(binary)}`;
}

/** A PNG header: signature, chunk length, "IHDR", then the two sizes. */
function png(width, height) {
    return [
        0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a,
        0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52,
        ...be32(width), ...be32(height),
        8, 6, 0, 0, 0
    ];
}

function gif(width, height) {
    return [...ascii('GIF89a'), ...le16(width), ...le16(height), 0xf7, 0, 0];
}

function bmp(width, height) {
    return [
        ...ascii('BM'), 0, 0, 0, 0, 0, 0, 0, 0, 54, 0, 0, 0,
        40, 0, 0, 0, ...le32(width), ...le32(height), 1, 0, 24, 0
    ];
}

function jpeg(width, height, { padding = 0 } = {}) {
    const filler = [];
    if (padding > 0) {
        // An APP1 segment standing in for the EXIF block a camera writes.
        filler.push(0xff, 0xe1, ...be16(padding + 2), ...new Array(padding).fill(0x20));
    }
    return [
        0xff, 0xd8,
        ...filler,
        0xff, 0xc0, 0, 17, 8, ...be16(height), ...be16(width), 3
    ];
}

const ascii = value => [...value].map(character => character.charCodeAt(0));
const be16 = value => [(value >> 8) & 0xff, value & 0xff];
const be32 = value => [(value >> 24) & 0xff, (value >> 16) & 0xff, (value >> 8) & 0xff, value & 0xff];
const le16 = value => [value & 0xff, (value >> 8) & 0xff];
const le32 = value => [...le16(value), (value >> 16) & 0xff, (value >> 24) & 0xff];

test('a PNG states its size in its first chunk', () => {
    assert.deepEqual(imageSize(dataUrl(png(64, 32))), { width: 64, height: 32 });
});

test('a GIF states its size little-endian, and is read that way', () => {
    assert.deepEqual(imageSize(dataUrl(gif(320, 200), 'image/gif')), { width: 320, height: 200 });
});

test('a BMP with bottom-up rows reports a positive height', () => {
    assert.deepEqual(imageSize(dataUrl(bmp(16, 16), 'image/bmp')), { width: 16, height: 16 });
    // A negative height means top-down storage, not a negative picture.
    assert.deepEqual(imageSize(dataUrl(bmp(16, -16 >>> 0), 'image/bmp')), { width: 16, height: 16 });
});

test('a JPEG is walked to its frame header, however much metadata precedes it', () => {
    assert.deepEqual(imageSize(dataUrl(jpeg(800, 600), 'image/jpeg')), { width: 800, height: 600 });
    assert.deepEqual(
        imageSize(dataUrl(jpeg(48, 24, { padding: 2000 }), 'image/jpeg')),
        { width: 48, height: 24 },
        'two kilobytes of EXIF must not hide the size'
    );
});

test('a lossy WebP states its size after the VP8 start code', () => {
    const bytes = [
        ...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 '),
        0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(120), ...le16(90)
    ];
    assert.deepEqual(imageSize(dataUrl(bytes, 'image/webp')), { width: 120, height: 90 });
});

test('raw bytes are read as readily as a data URL', () => {
    assert.deepEqual(imageSize(new Uint8Array(png(8, 8))), { width: 8, height: 8 });
    assert.deepEqual(imageSize(new Uint8Array(png(8, 8)).buffer), { width: 8, height: 8 });
});

test('anything unreadable answers null rather than a guess', () => {
    assert.equal(imageSize(null), null);
    assert.equal(imageSize(''), null);
    assert.equal(imageSize('data:text/plain,hello'), null, 'a URL that is not base64');
    assert.equal(imageSize('data:image/png;base64,!!!!'), null, 'base64 that will not decode');
    assert.equal(imageSize(dataUrl(new Array(40).fill(7))), null, 'no format anyone knows');
    assert.equal(imageSize(42), null);
});

test('a payload with nothing in it is not an image', () => {
    assert.equal(toBytes('nonsense'), null);
    assert.equal(imageSize(dataUrl([1, 2, 3])), null, 'too short to hold any header');
});

test('a size is shown the way a creator reads one', () => {
    assert.equal(formatSize({ width: 64, height: 32 }), '64 × 32 px');
    assert.equal(formatSize(null), null);
});
