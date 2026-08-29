// The one seam that knows a preview is local (ADR-0042 §3, §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PREVIEW_LIMIT,
    idFromHash,
    previewUrl,
    putPreview,
    resolvePreview
} from './store.js';

/** A storage that behaves like the browser's, including the ways it fails. */
function storage({ failOn = null } = {}) {
    const map = new Map();
    return {
        keys: () => [...map.keys()],
        getItem: key => (map.has(key) ? map.get(key) : null),
        setItem: (key, value) => {
            if (failOn === 'set') throw new Error('QuotaExceededError');
            map.set(key, value);
        },
        removeItem: key => map.delete(key)
    };
}

test('a bundle put under an id comes back as the same bundle', async () => {
    const where = storage();
    const bundle = { format: 1, name: 'Game', payloads: {} };

    assert.equal(putPreview('proj_a', bundle, where), true);

    assert.deepEqual(await resolvePreview('proj_a', where), bundle);
});

test('an id nobody has written answers nothing, rather than throwing', async () => {
    assert.equal(await resolvePreview('proj_missing', storage()), null);
    assert.equal(await resolvePreview(null, storage()), null);
});

test('resolving is async, so the day it is a fetch no caller is rewritten', () => {
    // ADR-0042 §3. The signature is the seam; a synchronous one would have to change.
    assert.ok(resolvePreview('proj_a', storage()) instanceof Promise);
});

test('the oldest preview is dropped once there are too many', async () => {
    const where = storage();

    for (let index = 0; index <= PREVIEW_LIMIT; index++) {
        putPreview(`proj_${index}`, { format: 1, n: index }, where);
    }

    assert.equal(await resolvePreview('proj_0', where), null, 'the first one made room');
    assert.deepEqual(await resolvePreview(`proj_${PREVIEW_LIMIT}`, where), { format: 1, n: PREVIEW_LIMIT });
});

test('rewriting one preview does not count as a second', async () => {
    const where = storage();

    for (let index = 0; index < PREVIEW_LIMIT * 2; index++) {
        putPreview('proj_same', { format: 1, n: index }, where);
    }

    assert.deepEqual(await resolvePreview('proj_same', where), { format: 1, n: PREVIEW_LIMIT * 2 - 1 });
});

test('a storage that refuses says so, instead of opening a window onto nothing', () => {
    assert.equal(putPreview('proj_a', { format: 1 }, storage({ failOn: 'set' })), false,
        'a full quota or a private window is answered, not thrown');
    assert.equal(putPreview('proj_a', { format: 1 }, null), false, 'and so is having no storage at all');
});

// --- identifiers ---------------------------------------------------------------------------

test('one project is one preview, so the same id reaches the same bundle', async () => {
    // THE PROPERTY THE PREFIXED, MINTED ID COULD NOT HAVE (ADR-0044 §2): pressing Preview
    // twice must reach one game, not two, or two windows cannot share a channel and a
    // published URL has nothing durable to name.
    const where = storage();

    putPreview('proj_a', { format: 1, n: 1 }, where);
    putPreview('proj_a', { format: 1, n: 2 }, where);

    assert.deepEqual(await resolvePreview('proj_a', where), { format: 1, n: 2 },
        'the second write replaced the first, under one identity');
});

test('a preview URL carries the id in the fragment, which never reaches a server', () => {
    // Not cosmetic: a preview id names something on THIS machine, and a query string would
    // put it in an access log (ADR-0042 §3).
    const url = previewUrl('proj_a');

    assert.ok(url.includes('#p/proj_a'));
    assert.equal(url.includes('?'), false);
});

test('the client reads the id back out of the fragment it was opened with', () => {
    assert.equal(idFromHash('#p/proj_a'), 'proj_a');
    assert.equal(idFromHash('#p/game_published'), 'game_published', 'and it cannot tell the two apart');
    assert.equal(idFromHash('#nonsense'), null);
    assert.equal(idFromHash(''), null);
    assert.equal(idFromHash(undefined), null);
});

test('an identifier with digits in it survives the whole round trip', () => {
    // THE PREMISE THIS TEST EXISTS TO PIN DOWN. `createId()` draws from Crockford base32 —
    // ten digits and twenty-two letters — so a project id starting with a digit is ordinary,
    // not exotic. Nothing in this engine narrows it to letters, and this asserts that the
    // four places an id passes through keep it intact (ADR-0046 §8).
    const where = storage();

    for (const id of ['0abc123def456', '9', 'k0hv89cv4dbr', '00000000000z']) {
        assert.equal(putPreview(id, { format: 1, id }, where), true, `stored ${id}`);
        assert.equal(idFromHash(previewUrl(id).slice(previewUrl(id).indexOf('#'))), id,
            `${id} came back out of its own URL`);
    }
});

test('a preview URL round-trips an id through its fragment, whatever it contains', () => {
    // A FRAGMENT IS PARSED BY US, not by a server, so the only rule is that what we write
    // is what we read. `idFromHash` takes everything after `#p/` and stops there.
    for (const id of ['abc', '0123456789ab', 'z0z0z0z0z0z0']) {
        const url = previewUrl(id);
        assert.equal(url, `../preview/index.html#p/${id}`);
        assert.equal(idFromHash(`#p/${id}`), id);
    }

    assert.equal(idFromHash('#p/'), null, 'and an empty one names nothing');
    assert.equal(idFromHash(''), null);
});
