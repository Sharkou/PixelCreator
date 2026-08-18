import { test } from 'node:test';
import assert from 'node:assert/strict';
import { previewOffsets, previewOrder, previewSlots, rankAt, rankAtPoint } from './reflow.js';

/** Where each item ends up on screen, once its offset is applied. */
function positions(sizes, offsets) {
    let start = 0;
    return sizes.map((size, i) => {
        const at = start + offsets[i];
        start += size;
        return at;
    });
}

test('nothing slides when nothing moves', () => {
    assert.deepEqual(previewOffsets([30, 30, 30], 1, 1), [0, 0, 0]);
    assert.deepEqual(previewOrder(3, 1, 1), [0, 1, 2]);
});

test('carrying an item down slides what it passes back by its own size', () => {
    // Three equal rows; the first is carried to the last rank.
    assert.deepEqual(previewOffsets([30, 30, 30], 0, 2), [60, -30, -30]);
});

test('carrying an item up slides what it passes forward by its own size', () => {
    assert.deepEqual(previewOffsets([30, 30, 30], 2, 0), [30, 30, -60]);
});

test('rows of different heights each slide by the carried row, not by their own', () => {
    // The carried row is 20 tall, so every row it passes moves exactly 20.
    const offsets = previewOffsets([20, 50, 80], 0, 2);
    assert.deepEqual(offsets, [130, -20, -20], 'it advances by 50 + 80, they come back by 20');
});

test('the previewed layout has no gap and no overlap', () => {
    const sizes = [20, 50, 80, 35];
    for (let from = 0; from < sizes.length; from++) {
        for (let to = 0; to < sizes.length; to++) {
            const offsets = previewOffsets(sizes, from, to);
            const order = previewOrder(sizes.length, from, to);

            // Read the previewed screen positions back in the order they now appear.
            const shown = positions(sizes, offsets);
            let expected = 0;
            for (const rank of order) {
                assert.equal(shown[rank], expected,
                    `from ${from} to ${to}: item ${rank} is not where the new order puts it`);
                expected += sizes[rank];
            }
        }
    }
});

test('the preview matches what the model would do', () => {
    const sizes = [10, 20, 30, 40, 50];
    for (let from = 0; from < sizes.length; from++) {
        for (let to = 0; to < sizes.length; to++) {
            // splice-out-then-splice-in is exactly what an ordered primitive does.
            const model = [0, 1, 2, 3, 4];
            const [carried] = model.splice(from, 1);
            model.splice(to, 0, carried);
            assert.deepEqual(previewOrder(sizes.length, from, to), model, `${from} -> ${to}`);
        }
    }
});

test('a move out of range leaves the list exactly as it was', () => {
    assert.deepEqual(previewOffsets([30, 30], -1, 1), [0, 0]);
    assert.deepEqual(previewOffsets([30, 30], 0, 9), [0, 0]);
    assert.deepEqual(previewOffsets([30, 30], 0, 1.5), [0, 0]);
    assert.deepEqual(previewOffsets([], 0, 0), []);
});

test('the rank under the pointer flips at a neighbour midpoint', () => {
    const boxes = [{ start: 0, size: 40 }, { start: 40, size: 40 }, { start: 80, size: 40 }];

    assert.equal(rankAt(0, boxes), 0);
    assert.equal(rankAt(19, boxes), 0);
    assert.equal(rankAt(20, boxes), 1, 'half of the first row is where the answer changes');
    assert.equal(rankAt(59, boxes), 1);
    assert.equal(rankAt(60, boxes), 2);
});

test('the pointer past either end lands on the nearest rank', () => {
    const boxes = [{ start: 100, size: 40 }, { start: 140, size: 40 }];

    assert.equal(rankAt(-500, boxes), 0);
    assert.equal(rankAt(5000, boxes), 1);
    assert.equal(rankAt(0, []), 0, 'an empty list has one place to be');
});

test('rows of unequal height flip at their own midpoints', () => {
    const boxes = [{ start: 0, size: 100 }, { start: 100, size: 20 }];

    assert.equal(rankAt(49, boxes), 0);
    assert.equal(rankAt(51, boxes), 1, 'the tall row hands over halfway down itself');
    assert.equal(rankAt(109, boxes), 1);
});

// --- a grid, where a rank is a slot rather than a distance ------------------------

/** Three tiles across, 60 wide and 70 tall, at the density the Project panel uses. */
function tiles(count, columns = 3) {
    return Array.from({ length: count }, (_, i) => ({
        x: (i % columns) * 60,
        y: Math.floor(i / columns) * 70,
        width: 60,
        height: 70
    }));
}

test('a tile carried across a row takes its neighbours back one slot', () => {
    const boxes = tiles(3);
    assert.deepEqual(previewSlots(boxes, 0, 2), [
        { dx: 120, dy: 0 },
        { dx: -60, dy: 0 },
        { dx: -60, dy: 0 }
    ]);
});

test('a tile carried onto the next row wraps, and the wrap is visible', () => {
    const boxes = tiles(4);
    // Carrying the last tile to the front pushes every other tile one slot along, which
    // for the third of a three-wide row means down to the start of the next one.
    assert.deepEqual(previewSlots(boxes, 3, 0), [
        { dx: 60, dy: 0 },
        { dx: 60, dy: 0 },
        { dx: -120, dy: 70 },
        { dx: 0, dy: -70 }
    ]);
});

test('every previewed tile lands on exactly one slot', () => {
    const boxes = tiles(7);
    for (let from = 0; from < boxes.length; from++) {
        for (let to = 0; to < boxes.length; to++) {
            const offsets = previewSlots(boxes, from, to);
            const order = previewOrder(boxes.length, from, to);

            order.forEach((rank, slot) => {
                assert.equal(boxes[rank].x + offsets[rank].dx, boxes[slot].x, `${from}->${to} x`);
                assert.equal(boxes[rank].y + offsets[rank].dy, boxes[slot].y, `${from}->${to} y`);
            });
        }
    }
});

test('a grid move out of range leaves every tile alone', () => {
    assert.deepEqual(previewSlots(tiles(2), -1, 0), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
    assert.deepEqual(previewSlots(tiles(2), 0, 5), [{ dx: 0, dy: 0 }, { dx: 0, dy: 0 }]);
    assert.deepEqual(previewSlots([], 0, 0), []);
});

test('a rank in a grid is read across the row, then down', () => {
    const boxes = tiles(5);

    assert.equal(rankAtPoint({ x: 5, y: 5 }, boxes), 0);
    assert.equal(rankAtPoint({ x: 35, y: 5 }, boxes), 1, 'half of a tile hands over to the next');
    assert.equal(rankAtPoint({ x: 200, y: 5 }, boxes), 2, 'past the row is its last tile');
    assert.equal(rankAtPoint({ x: 5, y: 80 }, boxes), 3, 'the second row starts at rank 3');
    assert.equal(rankAtPoint({ x: 200, y: 400 }, boxes), 4, 'below everything is the last tile');
});

test('an empty grid has one place to be', () => {
    assert.equal(rankAtPoint({ x: 0, y: 0 }, []), 0);
});
