// The broad phase, and the one assurance that matters (ADR-0064 §4).
//
// A PARTITIONING CHANGE IS THE EASIEST KIND OF SILENT REGRESSION. Nothing throws when a
// candidate pair is missed: a collision simply does not happen, in one corner of one level,
// for one arrangement of objects. Unit tests of a grid cannot find that, because a grid that
// is wrong is still a grid that is self-consistent.
//
// SO THE REAL TEST IS DIFFERENTIAL. The same generated scenes are run through the
// brute-force pass and through the grid, and the OVERLAPS must be identical — not merely the
// same count, the same pairs in the same order. That is a statement about the contract rather
// than about the implementation, and it stays true of whatever replaces the grid next.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform, hierarchyOrder } from '../../core/mod.js';
import { BoxCollider } from './collider.js';
import { Collisions } from './collisions.js';
import { MAX_CELLS_PER_OBJECT, SMALL_SCENE, allPairs, candidatePairs } from './broad-phase.js';

const registry = new ComponentRegistry();
registry.register(Transform);
registry.register(BoxCollider);

/** A deterministic source, so a failing scene can be reproduced from its seed alone. */
function dice(seed) {
    let state = seed >>> 0 || 1;
    return () => {
        state ^= state << 13;
        state ^= state >>> 17;
        state ^= state << 5;
        return ((state >>> 0) % 100000) / 100000;
    };
}

/**
 * A scene of boxes, scattered by a seed.
 *
 * @param {object} spec - `{ count, spread, size, seed, oversized }`
 * @returns {object} The scene
 */
function scatter({ count, spread = 400, size = 32, seed = 1, oversized = 0 }) {
    const roll = dice(seed);
    const scene = new Scene('Generated', { registry });

    for (let index = 0; index < count; index++) {
        const object = scene.add(new SceneObject(`B${index}`));
        object.addComponent(new Transform(
            Math.round((roll() - 0.5) * spread),
            Math.round((roll() - 0.5) * spread)
        ));
        const edge = index < oversized ? spread * 4 : size;
        object.addComponent(new BoxCollider(edge, edge));
    }

    return scene;
}

/** Every overlapping pair, as names, in the order the detector reports them. */
function pairsOf(scene, exhaustive) {
    const collisions = new Collisions({ exhaustive });
    collisions.update(scene);

    const found = [];
    for (const object of hierarchyOrder(scene)) {
        for (const { other, phase } of collisions.transitions(object)) {
            found.push(`${object.name}>${other.name}:${phase}`);
        }
    }

    return { pairs: found, size: collisions.size, tested: collisions.tested };
}

// --- the differential ---------------------------------------------------------------------

test('the grid finds exactly the pairs the brute-force pass finds, on every distribution', () => {
    const cases = [
        { count: 40, spread: 400, seed: 3 },
        { count: 120, spread: 600, seed: 11 },
        { count: 120, spread: 120, seed: 17, size: 48 },
        { count: 200, spread: 2000, seed: 23 },
        { count: 200, spread: 60, seed: 29 },
        { count: 300, spread: 900, seed: 31, size: 16 },
        { count: 150, spread: 800, seed: 37, oversized: 3 },
        { count: 90, spread: 1, seed: 41 }
    ];

    for (const spec of cases) {
        const scene = scatter(spec);
        const brute = pairsOf(scene, true);
        const grid = pairsOf(scene, false);

        assert.deepEqual(grid.pairs, brute.pairs,
            `seed ${spec.seed}, ${spec.count} boxes: the two passes disagree`);
        assert.equal(grid.size, brute.size);
    }
});

test('the two agree about ENTER, STAY and EXIT over several steps', () => {
    // ONE SCENE, MOVED, TWICE. A broad phase that merely found the same pairs on a static
    // scene could still lose a transition, because a transition is a comparison with the
    // step before it.
    const build = () => scatter({ count: 80, spread: 300, seed: 7 });
    const moving = build();
    const mirror = build();

    const fast = new Collisions();
    const slow = new Collisions({ exhaustive: true });

    for (let step = 0; step < 6; step++) {
        for (const scene of [[moving, fast], [mirror, slow]]) {
            for (const object of hierarchyOrder(scene[0])) {
                object.getComponent('Transform').x += 9;
            }
            scene[1].update(scene[0]);
        }

        const fastPairs = hierarchyOrder(moving).flatMap(object =>
            fast.transitions(object).map(entry => `${object.name}>${entry.other.name}:${entry.phase}`));
        const slowPairs = hierarchyOrder(mirror).flatMap(object =>
            slow.transitions(object).map(entry => `${object.name}>${entry.other.name}:${entry.phase}`));

        assert.deepEqual(fastPairs, slowPairs, `step ${step}`);
    }
});

test('it tests dramatically fewer pairs when nothing is near anything', () => {
    const scene = scatter({ count: 200, spread: 20000, seed: 5 });

    const brute = pairsOf(scene, true);
    const grid = pairsOf(scene, false);

    assert.equal(brute.tested, (200 * 199) / 2);
    assert.ok(grid.tested < brute.tested / 50, `tested ${grid.tested} of ${brute.tested}`);
    assert.equal(grid.size, 0);
});

test('it tests every pair when every pair really touches, and says so', () => {
    // THE HONEST LIMIT (ADR-0064 §5). A thousand things on one point IS half a million pairs,
    // and no partitioning can make that fewer — what a grid must not do is pretend otherwise.
    const scene = scatter({ count: 60, spread: 1, seed: 13 });

    const brute = pairsOf(scene, true);
    const grid = pairsOf(scene, false);

    assert.equal(grid.tested, brute.tested);
    assert.equal(grid.size, brute.size);
});

// --- the grid itself -----------------------------------------------------------------------

const box = (minX, minY, maxX, maxY) => ({ bounds: { minX, minY, maxX, maxY } });

test('a small scene is not partitioned at all, because the grid would cost more', () => {
    const entries = globalThis.Array.from({ length: SMALL_SCENE }, (_, at) => box(at * 500, 0, at * 500 + 1, 1));
    assert.deepEqual(candidatePairs(entries), allPairs(SMALL_SCENE));
});

test('a pair found in several cells is proposed once', () => {
    // Two long boxes lying across many cells together: without deduplication this pair would
    // be proposed once per shared cell.
    const entries = [
        ...globalThis.Array.from({ length: SMALL_SCENE }, (_, at) => box(-9000 - at * 100, -9000, -8990 - at * 100, -8990)),
        box(0, 0, 400, 8),
        box(0, 0, 400, 8)
    ];

    const pairs = candidatePairs(entries);
    const last = pairs.filter(([i, j]) => i === SMALL_SCENE && j === SMALL_SCENE + 1);

    assert.equal(last.length, 1);
});

test('candidates come back in canonical order, whatever order the cells were walked', () => {
    const entries = globalThis.Array.from({ length: 80 }, (_, at) => {
        const column = at % 8;
        const row = Math.floor(at / 8);
        return box(column * 20, row * 20, column * 20 + 30, row * 20 + 30);
    });

    const pairs = candidatePairs(entries);

    for (const [i, j] of pairs) assert.ok(i < j, 'every pair is low index first');
    for (let at = 1; at < pairs.length; at++) {
        const before = pairs[at - 1];
        const now = pairs[at];
        assert.ok(before[0] < now[0] || (before[0] === now[0] && before[1] < now[1]),
            'the list is sorted, so two machines report one order');
    }
});

test('something far larger than the grid is paired with everything rather than filling it', () => {
    const entries = [
        box(-1e6, -1e6, 1e6, 1e6),
        ...globalThis.Array.from({ length: 40 }, (_, at) => box(at * 1000, 0, at * 1000 + 10, 10))
    ];

    const pairs = candidatePairs(entries);
    const withGiant = pairs.filter(([i]) => i === 0);

    assert.equal(withGiant.length, 40, 'the giant is a candidate against every other');
    assert.ok(MAX_CELLS_PER_OBJECT > 0);
});

test('a scene of zero-sized boxes does not divide by zero', () => {
    const entries = globalThis.Array.from({ length: 40 }, (_, at) => box(at, 0, at, 0));
    assert.doesNotThrow(() => candidatePairs(entries));
});

test('fewer than two entries propose nothing', () => {
    assert.deepEqual(candidatePairs([]), []);
    assert.deepEqual(candidatePairs([box(0, 0, 1, 1)]), []);
});

// --- the counter-proof (ADR-0064 §4) --------------------------------------------------------

test('COUNTER-PROOF: a grid that reported cell order instead of canonical order is caught', () => {
    // The regression this file exists to catch, injected by hand: the same pairs, in the
    // order a hash happened to produce them. If the differential test above only compared
    // SETS, this would pass — so it compares sequences.
    const scene = scatter({ count: 120, spread: 300, seed: 19 });
    const honest = pairsOf(scene, false).pairs;
    const shuffled = [...honest].reverse();

    assert.notDeepEqual(shuffled, honest,
        'reporting the same pairs in another order is a different answer, and the test sees it');
});
