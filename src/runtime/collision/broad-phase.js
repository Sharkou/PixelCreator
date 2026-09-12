// Which pairs are worth testing at all (ADR-0059 §7, amended by ADR-0064).
//
// THE MEASUREMENT THAT ASKED FOR THIS. ADR-0059 §7 said the brute-force pass would be
// replaced "on the day a measurement asks for one, with no contract to renegotiate". The
// measurement arrived:
//
//   1000 colliders, spread out       7.56 ms per step     — 500 000 box tests for 0 hits
//   1000 colliders, all overlapping  760 ms  per step
//
// The second number is not a broad phase's problem — a thousand things really touching each
// other IS half a million pairs, and no partitioning can make that fewer. The first one is
// entirely a broad phase's problem: nothing there was near anything, and the step paid for
// every pair anyway.
//
// A UNIFORM SPATIAL HASH, NOT A QUADTREE. The world is 2D, the shapes are axis-aligned
// boxes, and the objects a game has are mostly the same size and mostly clustered — which is
// the exact case a grid is best at and a tree is worst at. It is also forty lines with no
// structure to rebalance, no node to split, no depth to tune and nothing to keep between
// steps, which matters more than the asymptotics: a tree that has to stay correct across a
// thousand spawns and destructions per second is a second source of bugs, and this has no
// state at all.
//
// THE OBSERVABLE CONTRACT DOES NOT MOVE, AND THAT IS THE WHOLE POINT (ADR-0064 §3). What
// this changes is which pairs are TESTED; which pairs OVERLAP, in what order they are
// reported, what `Enter`, `Stay` and `Exit` mean and what `Is Overlapping` answers are all
// decided downstream and are untouched. The candidate list is sorted back into canonical
// order before it leaves, so nothing observable depends on how a hash happens to be walked.

/**
 * Below this many objects, the grid costs more than it saves.
 *
 * MEASURED, NOT GUESSED. At a couple of dozen boxes the whole brute-force pass is a few
 * hundred comparisons — less than the allocation of one Map — and a scene that size is the
 * overwhelmingly common one. The grid is for the scene that grew.
 */
export const SMALL_SCENE = 24;

/**
 * How many cells one object may occupy before it is treated as covering everything.
 *
 * A GROUND PLANE IS A COLLIDER TOO. One object four thousand units wide in a grid of
 * thirty-two-unit cells would be inserted into a hundred and twenty cells per row; a handful
 * of those and the insertion pass costs more than the test it replaced. Anything that big is
 * moved to a short list that is paired with everything, which is what it would have been
 * paired with anyway.
 */
export const MAX_CELLS_PER_OBJECT = 64;

/**
 * The pairs of entries whose bounds are close enough to be worth testing.
 *
 * ENTRIES ARE INDEXED, AND THE INDEX IS THE ORDER. The caller passes them in canonical order
 * (`hierarchyOrder`), so a pair `[i, j]` with `i < j` is a pair in canonical order, and
 * sorting the candidates by `(i, j)` at the end restores exactly the sequence the brute-force
 * double loop produced. That is what makes this substitutable rather than merely equivalent.
 *
 * @param {Array<{bounds: {minX: number, minY: number, maxX: number, maxY: number}}>} entries
 *   The colliding objects, in canonical order, each with its union bounds
 * @returns {Array<[number, number]>} Index pairs, `i < j`, in canonical order
 */
export function candidatePairs(entries) {
    const count = entries.length;
    if (count < 2) return [];
    if (count <= SMALL_SCENE) return allPairs(count);

    const cell = cellSize(entries);
    const buckets = new globalThis.Map();
    const oversized = [];

    for (let index = 0; index < count; index++) {
        const bounds = entries[index].bounds;
        const minColumn = Math.floor(bounds.minX / cell);
        const maxColumn = Math.floor(bounds.maxX / cell);
        const minRow = Math.floor(bounds.minY / cell);
        const maxRow = Math.floor(bounds.maxY / cell);

        const spans = (maxColumn - minColumn + 1) * (maxRow - minRow + 1);
        if (!globalThis.Number.isFinite(spans) || spans > MAX_CELLS_PER_OBJECT) {
            oversized.push(index);
            continue;
        }

        for (let column = minColumn; column <= maxColumn; column++) {
            for (let row = minRow; row <= maxRow; row++) {
                const key = `${column}:${row}`;
                const bucket = buckets.get(key);
                if (bucket) bucket.push(index);
                else buckets.set(key, [index]);
            }
        }
    }

    // DEDUPLICATED BY KEY, because two boxes that share three cells are one pair. The key is
    // arithmetic rather than a string: `i * count + j` is unique for `i < j < count` and
    // costs no allocation, which matters when a dense scene proposes a hundred thousand
    // candidates in a step.
    const seen = new globalThis.Set();
    const pairs = [];

    const propose = (i, j) => {
        const key = i * count + j;
        if (seen.has(key)) return;
        seen.add(key);
        pairs.push([i, j]);
    };

    for (const bucket of buckets.values()) {
        for (let a = 0; a < bucket.length; a++) {
            for (let b = a + 1; b < bucket.length; b++) {
                const i = bucket[a];
                const j = bucket[b];
                if (i < j) propose(i, j);
                else propose(j, i);
            }
        }
    }

    // WHAT COVERS EVERYTHING IS PAIRED WITH EVERYTHING, including the other oversized ones.
    for (const big of oversized) {
        for (let other = 0; other < count; other++) {
            if (other === big) continue;
            propose(Math.min(big, other), Math.max(big, other));
        }
    }

    // BACK INTO CANONICAL ORDER BEFORE IT LEAVES. A Map iterates in insertion order, which is
    // an order this file invented; the caller's contract is the scene's (ADR-0034 §3.1), and
    // two machines must agree on it. Sorting is what makes the hash an implementation detail
    // rather than an observable one.
    pairs.sort((first, second) => (first[0] - second[0]) || (first[1] - second[1]));
    return pairs;
}

/**
 * Every pair, in canonical order — what the grid must agree with.
 *
 * KEPT AND EXPORTED ON PURPOSE. It is what a small scene uses, and it is the other half of
 * the differential test: `bruteForcePairs()` and `candidatePairs()` must produce the same
 * OVERLAPS on any scene, which is the only assurance that a partitioning change cannot
 * silently drop a collision (ADR-0064 §4).
 *
 * @param {number} count - How many entries there are
 * @returns {Array<[number, number]>} Every `i < j`, in canonical order
 */
export function allPairs(count) {
    const pairs = [];
    for (let i = 0; i < count; i++) {
        for (let j = i + 1; j < count; j++) pairs.push([i, j]);
    }
    return pairs;
}

/**
 * How wide a cell is, derived from the objects themselves.
 *
 * THE MEAN EXTENT, WHICH IS THE ONE NUMBER THAT ADAPTS WITHOUT A SETTING. A grid whose cells
 * are the size of the things in it puts a typical object in one to four cells — few enough
 * to insert cheaply, small enough that a cell holds few strangers. A fixed cell size would be
 * a tuning knob with no right value: a game of 8-pixel bullets and a game of 256-pixel
 * platforms want different ones, and neither creator should have to know that.
 *
 * DERIVED FROM THE STATE, SO IT IS DETERMINISTIC. Two machines holding the same scene compute
 * the same cell size, therefore the same buckets, therefore the same candidates — before the
 * sort that would have made the result identical anyway.
 *
 * @param {object[]} entries - The colliding objects
 * @returns {number} A cell edge, never zero and never infinite
 */
function cellSize(entries) {
    let total = 0;
    for (const entry of entries) {
        total += (entry.bounds.maxX - entry.bounds.minX) + (entry.bounds.maxY - entry.bounds.minY);
    }

    // Half the mean of the two extents, doubled: the mean extent itself. Clamped because a
    // scene of zero-sized colliders would divide by zero, and one enormous box must not make
    // the cells so large that the grid degenerates into a single bucket.
    const mean = total / (entries.length * 2);
    if (!globalThis.Number.isFinite(mean) || mean <= 0) return 32;
    return Math.min(4096, Math.max(1, mean));
}
