import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TRAIL_LIMIT, foldTrail } from './trail.js';

/** A chain of folders, outermost first, named by depth. */
const chain = depth => Array.from({ length: depth }, (_, i) => ({ id: `f${i}`, name: `Folder ${i}` }));

const names = steps => steps.map(step => (step.folded ? '…' : step.folder.name));

test('a short trail is drawn whole', () => {
    assert.deepEqual(names(foldTrail(chain(3))), ['Folder 0', 'Folder 1', 'Folder 2']);
    assert.deepEqual(foldTrail([]), []);
});

test('the last step is marked as the one being looked at', () => {
    const steps = foldTrail(chain(3));
    assert.deepEqual(steps.map(step => step.here), [false, false, true]);
});

test('a trail at the limit still fits', () => {
    assert.equal(foldTrail(chain(TRAIL_LIMIT)).length, TRAIL_LIMIT);
    assert.equal(foldTrail(chain(TRAIL_LIMIT)).some(step => step.folded), false);
});

test('a deep trail folds its middle and keeps both ends', () => {
    const steps = foldTrail(chain(7));

    // The way up and the folder being looked at survive; everything before them folds.
    assert.deepEqual(names(steps), ['…', 'Folder 5', 'Folder 6']);
    assert.equal(steps.at(-1).here, true);
    assert.equal(steps[1].here, false, 'the parent is a step, not the destination');
});

test('the fold carries every folder it hid, in order', () => {
    const steps = foldTrail(chain(7));
    const hidden = steps[0].hidden.map(folder => folder.name);

    assert.deepEqual(hidden, ['Folder 0', 'Folder 1', 'Folder 2', 'Folder 3', 'Folder 4']);
    // Nothing is lost: what is drawn plus what is folded is the whole chain.
    assert.equal(hidden.length + steps.length - 1, 7);
});

test('every folder stays reachable however deep the trail goes', () => {
    for (let depth = 1; depth <= 40; depth++) {
        const steps = foldTrail(chain(depth));
        const reachable = new Set();

        for (const step of steps) {
            if (step.folded) for (const folder of step.hidden) reachable.add(folder.id);
            else reachable.add(step.folder.id);
        }

        assert.equal(reachable.size, depth, `depth ${depth} lost a folder`);
    }
});

test('a tighter limit folds sooner, and still keeps two steps', () => {
    const steps = foldTrail(chain(4), 2);
    assert.deepEqual(names(steps), ['…', 'Folder 2', 'Folder 3']);
});

test('a limit of one never folds away the folder being looked at', () => {
    const steps = foldTrail(chain(3), 1);
    assert.equal(steps.at(-1).folder.name, 'Folder 2');
    assert.equal(steps.at(-1).here, true);
});
