// A sheet cut into tiles, and the one rectangle two resources have to agree on (ADR-0070).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createAnimation, frameAt } from './animation.js';
import { frameRect } from './frames.js';
import { DEFAULT_TILE, TILESET_FORMAT, createTileset, tileCount, tileRect, tilesetOf } from './tileset.js';

const sheet = (spec = {}) => createTileset({
    source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 4, count: 12, ...spec
});

// --- the definition ------------------------------------------------------------------------

test('a tileset is plain data, and survives a round trip through JSON', () => {
    const tileset = sheet();

    assert.deepEqual(tileset, {
        version: TILESET_FORMAT,
        source: 'res_sheet',
        tileWidth: 16,
        tileHeight: 16,
        columns: 4,
        count: 12
    });
    assert.deepEqual(JSON.parse(JSON.stringify(tileset)), tileset, 'nothing of it is a class');
});

test('what a tileset is when nobody says', () => {
    const tileset = createTileset({ source: 'res_sheet' });

    assert.equal(tileset.tileWidth, DEFAULT_TILE);
    assert.equal(tileset.tileHeight, DEFAULT_TILE);
    assert.equal(tileset.columns, 1);
    assert.equal(tileset.count, 1);
});

test('numbers that make no sense are clamped, never carried', () => {
    // THE RULE THIS EXISTS FOR: a rectangle of NaN reaches a canvas, draws nothing and
    // reports nothing. It is caught where the value is built, once.
    const broken = createTileset({ source: 'res_sheet', tileWidth: -8, tileHeight: 0, columns: 'four', count: -3 });

    assert.deepEqual([broken.tileWidth, broken.tileHeight, broken.columns, broken.count], [0, 0, 1, 0]);
    assert.equal(tilesetOf(broken), null, 'and a tileset that could answer nothing is not one');
    assert.equal(tileRect(broken, 1), null);
    assert.equal(tileCount(broken), 0);
});

test('a tileset with no sheet, and a version nobody here knows, are both refused', () => {
    assert.equal(tilesetOf(createTileset({ source: null })), null);
    assert.equal(tilesetOf({ ...sheet(), version: 99 }), null);
    assert.equal(tilesetOf(null), null);
    assert.equal(tilesetOf({}), null);
});

// --- the rectangles -------------------------------------------------------------------------

test('tile 0 is empty, and it is not the first tile', () => {
    // A CELL'S 0 HAS MEANT EMPTY SINCE `Tilemap` EXISTED (ADR-0068 §3), so the sheet is read
    // from 1. Answering a rectangle for 0 would paint the first tile everywhere a creator
    // erased.
    assert.equal(tileRect(sheet(), 0), null);
    assert.equal(tileRect(sheet(), -1), null);
});

test('the first tile is the top-left cell, and the last one is the last', () => {
    assert.deepEqual(tileRect(sheet(), 1), { x: 0, y: 0, width: 16, height: 16 });
    assert.deepEqual(tileRect(sheet(), 4), { x: 48, y: 0, width: 16, height: 16 }, 'end of the first row');
    assert.deepEqual(tileRect(sheet(), 5), { x: 0, y: 16, width: 16, height: 16 }, 'and down to the next');
    assert.deepEqual(tileRect(sheet(), 12), { x: 48, y: 32, width: 16, height: 16 }, 'the twelfth');
});

test('a tile past the end of the sheet has no rectangle at all', () => {
    // ADR-0070 §7: nothing is substituted. A map repainted with a smaller sheet keeps its
    // cells — they still block — and the ones beyond it draw nothing.
    assert.equal(tileRect(sheet(), 13), null);
    assert.equal(tileRect(sheet({ count: 3 }), 4), null);
});

test('a count that is not a multiple of the columns stops where it says', () => {
    const ragged = sheet({ columns: 4, count: 6 });

    assert.equal(tileCount(ragged), 6);
    assert.deepEqual(tileRect(ragged, 6), { x: 16, y: 16, width: 16, height: 16 }, 'second row, second cell');
    assert.equal(tileRect(ragged, 7), null, 'and the rest of that row is not there');
});

test('a sheet one cell wide is a column', () => {
    const strip = sheet({ columns: 1, count: 3, tileWidth: 8, tileHeight: 8 });

    assert.deepEqual(tileRect(strip, 1), { x: 0, y: 0, width: 8, height: 8 });
    assert.deepEqual(tileRect(strip, 3), { x: 0, y: 16, width: 8, height: 8 });
});

// --- the shared primitive ---------------------------------------------------------------------

test('a tileset and an animation cut the same grid into the same rectangles', () => {
    // THE COUNTER-PROOF THE SHARED PRIMITIVE EXISTS FOR (ADR-0070 §2). They differ by one —
    // a clip counts frames from 0 and a map counts tiles from 1, because 0 is empty — and by
    // nothing else. Two arithmetics would have drifted by a pixel and nobody would have known
    // which was right.
    const grid = { frameWidth: 24, frameHeight: 24, columns: 5 };
    const clip = createAnimation({ source: 'res_sheet', ...grid, count: 15 });
    const tiles = createTileset({ source: 'res_sheet', tileWidth: 24, tileHeight: 24, columns: 5, count: 15 });

    for (let frame = 0; frame < 15; frame++) {
        assert.deepEqual(tileRect(tiles, frame + 1), frameAt(clip, frame), `cell ${frame}`);
    }
});

test('the primitive itself: across, then down, and nothing without a cell size', () => {
    assert.deepEqual(frameRect({ index: 0, frameWidth: 4, frameHeight: 4, columns: 2 }),
        { x: 0, y: 0, width: 4, height: 4 });
    assert.deepEqual(frameRect({ index: 3, frameWidth: 4, frameHeight: 4, columns: 2 }),
        { x: 4, y: 4, width: 4, height: 4 });
    // No columns is one long strip, which is what a creator who typed nothing meant.
    assert.deepEqual(frameRect({ index: 3, frameWidth: 4, frameHeight: 4 }),
        { x: 12, y: 0, width: 4, height: 4 });
    // `first` offsets the count, which is how a clip reads the middle of a sheet.
    assert.deepEqual(frameRect({ index: 1, frameWidth: 4, frameHeight: 4, columns: 2, first: 2 }),
        { x: 4, y: 4, width: 4, height: 4 });

    assert.equal(frameRect({ index: 0, frameWidth: 0, frameHeight: 4 }), null);
    assert.equal(frameRect({ index: 0, frameWidth: 4, frameHeight: 0 }), null);
});
