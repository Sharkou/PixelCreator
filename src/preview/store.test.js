// The one seam that knows a preview is local (ADR-0042 §3, §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    PREVIEW_LIMIT,
    createPreviewId,
    idFromHash,
    isPreviewId,
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

    assert.equal(putPreview('prv_a', bundle, where), true);

    assert.deepEqual(await resolvePreview('prv_a', where), bundle);
});

test('an id nobody has written answers nothing, rather than throwing', async () => {
    assert.equal(await resolvePreview('prv_missing', storage()), null);
    assert.equal(await resolvePreview(null, storage()), null);
});

test('resolving is async, so the day it is a fetch no caller is rewritten', () => {
    // ADR-0042 §3. The signature is the seam; a synchronous one would have to change.
    assert.ok(resolvePreview('prv_a', storage()) instanceof Promise);
});

test('the oldest preview is dropped once there are too many', async () => {
    const where = storage();

    for (let index = 0; index <= PREVIEW_LIMIT; index++) {
        putPreview(`prv_${index}`, { format: 1, n: index }, where);
    }

    assert.equal(await resolvePreview('prv_0', where), null, 'the first one made room');
    assert.deepEqual(await resolvePreview(`prv_${PREVIEW_LIMIT}`, where), { format: 1, n: PREVIEW_LIMIT });
});

test('rewriting one preview does not count as a second', async () => {
    const where = storage();

    for (let index = 0; index < PREVIEW_LIMIT * 2; index++) {
        putPreview('prv_same', { format: 1, n: index }, where);
    }

    assert.deepEqual(await resolvePreview('prv_same', where), { format: 1, n: PREVIEW_LIMIT * 2 - 1 });
});

test('a storage that refuses says so, instead of opening a window onto nothing', () => {
    assert.equal(putPreview('prv_a', { format: 1 }, storage({ failOn: 'set' })), false,
        'a full quota or a private window is answered, not thrown');
    assert.equal(putPreview('prv_a', { format: 1 }, null), false, 'and so is having no storage at all');
});

// --- identifiers ---------------------------------------------------------------------------

test('a preview id says what kind of thing it is', () => {
    const id = createPreviewId();

    assert.equal(isPreviewId(id), true);
    assert.equal(isPreviewId('game_published'), false, 'a published game is not a preview');
    assert.equal(isPreviewId(null), false);
    assert.notEqual(createPreviewId(), createPreviewId(), 'two previews are two ids');
});

test('a preview URL carries the id in the fragment, which never reaches a server', () => {
    // Not cosmetic: a preview id names something on THIS machine, and a query string would
    // put it in an access log (ADR-0042 §3).
    const url = previewUrl('prv_a');

    assert.ok(url.includes('#p/prv_a'));
    assert.equal(url.includes('?'), false);
});

test('the client reads the id back out of the fragment it was opened with', () => {
    assert.equal(idFromHash('#p/prv_a'), 'prv_a');
    assert.equal(idFromHash('#p/game_published'), 'game_published', 'and it cannot tell the two apart');
    assert.equal(idFromHash('#nonsense'), null);
    assert.equal(idFromHash(''), null);
    assert.equal(idFromHash(undefined), null);
});
