// Which project the Editor opens when it starts (ADR-0065 §4, ADR-0069 §6).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MemoryArea } from '../../project/mod.js';
import { LAST_OPENED, NEW_PROJECT, openLibrary } from './library.js';

/**
 * The one browser API this file needs, and nothing else.
 *
 * `localStorage` is where the Editor remembers which project was open — workspace state, not
 * project data (ADR-0065 §4). Under Node it is absent and the library degrades silently, so
 * a test of what it REMEMBERS has to give it somewhere to remember.
 */
function remembering() {
    const values = new Map();
    globalThis.localStorage = {
        getItem: key => (values.has(key) ? values.get(key) : null),
        setItem: (key, value) => values.set(key, String(value)),
        removeItem: key => values.delete(key)
    };
    return () => delete globalThis.localStorage;
}

test('the last project opened is the one that comes back', async () => {
    const forget = remembering();
    try {
        const library = await openLibrary({ area: new MemoryArea() });
        // A project with nothing in it is not worth reopening — `openLibrary` says so by
        // refusing an empty manifest — so each of these is given something to hold.
        const first = await library.create('One');
        first.project.addFolder({ name: 'Scenes' });
        await first.store.saveManifest(first.project.serialize());
        const second = await library.create('Two');
        second.project.addFolder({ name: 'Scenes' });
        await second.store.saveManifest(second.project.serialize());

        globalThis.localStorage.setItem(LAST_OPENED, first.project.id);
        const resumed = await library.resume();

        assert.equal(resumed.project.id, first.project.id);
        assert.equal(resumed.fresh, false, 'it was read back, not invented');
    } finally {
        forget();
    }
});

test('New Project makes one, even when the browser already holds projects', async () => {
    const forget = remembering();
    try {
        const library = await openLibrary({ area: new MemoryArea() });
        const first = await library.create('Reload Proof');
        first.project.addFolder({ name: 'Scenes' });
        await first.store.saveManifest(first.project.serialize());

        // What the Projects menu writes when `New Project` is chosen.
        globalThis.localStorage.setItem(LAST_OPENED, NEW_PROJECT);
        const second = await library.resume();

        assert.notEqual(second.project.id, first.project.id, 'a different project, not the one already there');
        assert.equal(second.fresh, true, 'and the shell knows to give it a starter scene');

        // FORGETTING IS NOT ASKING (ADR-0069 §6): with nothing remembered, the most recently
        // modified project is still the right answer — that is a browser that lost a
        // convenience, not a creator who asked for a blank page.
        second.project.addFolder({ name: 'Scenes' });
        await second.store.saveManifest(second.project.serialize());

        globalThis.localStorage.removeItem(LAST_OPENED);
        const held = (await library.projects()).length;
        const resumed = await library.resume();

        assert.equal(resumed.fresh, false, 'one of the two that are here, not a third');
        assert.equal((await library.projects()).length, held, 'and nothing new was declared');
    } finally {
        forget();
    }
});

test('an empty browser gets a project of its own', async () => {
    const forget = remembering();
    try {
        const library = await openLibrary({ area: new MemoryArea() });
        const opened = await library.resume({ name: 'First Project' });

        assert.equal(opened.fresh, true);
        assert.equal(opened.project.name, 'First Project');
        assert.deepEqual((await library.projects()).map(entry => entry.id), [opened.project.id]);
    } finally {
        forget();
    }
});
