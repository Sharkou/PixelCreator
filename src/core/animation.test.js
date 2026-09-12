// A sprite animation: a strip of a picture, and how fast to walk it (ADR-0062 §4).
//
// EVERY SIBLING DEFINITION HAD A TEST FILE AND THIS ONE DID NOT. `createAnimation()`,
// `animationOf()`, `frameAt()`, `frameAtTime()` and `durationOf()` were reached only through
// `SpriteAnimator`, so the three decisions this module actually makes — a version it cannot
// read is refused, `fps: 0` is a still rather than a division by zero, and a clip that does
// not loop HOLDS its last frame — were asserted nowhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ANIMATION_FORMAT,
    animationOf,
    createAnimation,
    durationOf,
    frameAt,
    frameAtTime,
    frameCount
} from './animation.js';

const walk = (spec = {}) => createAnimation({
    source: 'res_sheet',
    frameWidth: 32,
    frameHeight: 32,
    count: 4,
    columns: 4,
    fps: 10,
    ...spec
});

// --- what a definition is ------------------------------------------------------------------

test('a clip states its grid, and nothing is measured from a decoded picture', () => {
    const clip = walk();

    assert.equal(clip.version, ANIMATION_FORMAT);
    assert.equal(clip.source, 'res_sheet');
    assert.deepEqual(
        [clip.frameWidth, clip.frameHeight, clip.count, clip.columns, clip.first, clip.fps, clip.loop],
        [32, 32, 4, 4, 0, 10, true]
    );
});

test('nonsense is clamped at construction, once, so nothing downstream has to guess', () => {
    const clip = createAnimation({
        source: 'res_sheet',
        frameWidth: -8,
        frameHeight: 'tall',
        count: -3,
        columns: 'four',
        first: -1,
        fps: -24
    });

    assert.equal(clip.frameWidth, 0, 'a width that is not one reads as "the whole sheet"');
    assert.equal(clip.frameHeight, 0);
    assert.equal(clip.count, 1, 'a clip has at least one frame');
    assert.equal(clip.columns, 0, 'and no declared width is a single strip');
    assert.equal(clip.first, 0);
    assert.equal(clip.fps, 0, 'which is a still, not a rate to divide by');
});

test('a version this build does not read is refused, and refusing is not throwing', () => {
    // The same rule a graph, a bundle and a prefab live by: nothing below can be trusted to
    // mean what it says in a shape that has never been read.
    assert.equal(animationOf({ ...walk(), version: 99 }), null);
    assert.equal(animationOf(null), null);
    assert.equal(animationOf({ version: ANIMATION_FORMAT }), null, 'a clip with no sheet is not one');
    assert.equal(frameCount({ ...walk(), version: 99 }), 0);
});

// --- where a frame is ----------------------------------------------------------------------

test('frames are read across the sheet and then down', () => {
    const clip = walk({ count: 8, columns: 4 });

    assert.deepEqual(frameAt(clip, 0), { x: 0, y: 0, width: 32, height: 32 });
    assert.deepEqual(frameAt(clip, 3), { x: 96, y: 0, width: 32, height: 32 });
    assert.deepEqual(frameAt(clip, 4), { x: 0, y: 32, width: 32, height: 32 });
});

test('`first` moves the whole run, so two clips share one sheet', () => {
    const idle = walk({ count: 2, columns: 4, first: 0 });
    const jump = walk({ count: 2, columns: 4, first: 6 });

    assert.deepEqual(frameAt(idle, 0), { x: 0, y: 0, width: 32, height: 32 });
    assert.deepEqual(frameAt(jump, 0), { x: 64, y: 32, width: 32, height: 32 });
});

test('a clip with no cell size has no rectangle, which reads as "the whole picture"', () => {
    assert.equal(frameAt(createAnimation({ source: 'res_sheet' }), 0), null);
    assert.equal(frameAt({ version: 99 }, 0), null, 'and so does one that cannot be read');
});

// --- where the playhead is -----------------------------------------------------------------

test('the same elapsed time gives the same frame, whatever the step size was', () => {
    // THE PLAYHEAD IS SECONDS, NEVER AN ACCUMULATED INDEX. That is the whole reason a machine
    // at 30 and one at 144 agree about what is on screen.
    const clip = walk({ fps: 10, count: 4 });

    for (const [seconds, index] of [[0, 0], [0.05, 0], [0.1, 1], [0.25, 2], [0.39, 3]]) {
        assert.equal(frameAtTime(clip, seconds).index, index, `${seconds}s`);
    }
});

test('a looping clip wraps and never reports that it is finished', () => {
    const clip = walk({ fps: 10, count: 4, loop: true });

    assert.deepEqual(frameAtTime(clip, 0.4), { index: 0, finished: false }, 'round again');
    assert.deepEqual(frameAtTime(clip, 10), { index: 0, finished: false });
});

test('a clip that does not loop HOLDS its last frame and says it is done', () => {
    // A death animation that snapped back to standing would be the one failure nobody
    // could miss.
    const clip = walk({ fps: 10, count: 4, loop: false });

    assert.deepEqual(frameAtTime(clip, 0.2), { index: 2, finished: false });
    assert.deepEqual(frameAtTime(clip, 0.3), { index: 3, finished: true });
    assert.deepEqual(frameAtTime(clip, 100), { index: 3, finished: true }, 'and stays there');
});

test('no rate is a still, not a division by zero', () => {
    const still = walk({ fps: 0, count: 4, loop: false });

    assert.deepEqual(frameAtTime(still, 5), { index: 0, finished: true });
    assert.deepEqual(frameAtTime(walk({ fps: 0, loop: true }), 5), { index: 0, finished: false },
        'a looping still is never done, because it never ends');
});

test('an elapsed time that is not one is read as the beginning', () => {
    const clip = walk({ fps: 10, count: 4 });

    for (const bad of [-1, Number.NaN, Number.POSITIVE_INFINITY, undefined, 'soon']) {
        assert.equal(frameAtTime(clip, bad).index, 0, String(bad));
    }
});

test('a clip that cannot be read is finished at frame zero, rather than throwing', () => {
    assert.deepEqual(frameAtTime({ version: 99 }, 3), { index: 0, finished: true });
    assert.deepEqual(frameAtTime(null, 3), { index: 0, finished: true });
});

// --- how long it lasts ---------------------------------------------------------------------

test('a clip that ends has a duration, and one that never ends has none', () => {
    assert.equal(durationOf(walk({ fps: 10, count: 4, loop: false })), 0.4);
    assert.equal(durationOf(walk({ fps: 10, count: 4, loop: true })), 0, 'a loop never ends');
    assert.equal(durationOf(walk({ fps: 0, count: 4, loop: false })), 0, 'and a still never advances');
    assert.equal(durationOf({ version: 99 }), 0);
});
