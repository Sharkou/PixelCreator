// A game is a file before it is a URL (ADR-0066).
//
// UNDER `editor/` BECAUSE THE EDITOR IS WHAT EXPORTS, and because only one direction is
// allowed: `preview/` may never import `editor/` (ADR-0042 section 2). A test that reaches
// both ends belongs on the side that is allowed to see both -- the same move
// `editor/live.test.js` made.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind, addScene } from '../project/mod.js';
import { Workspace } from './project/workspace.js';
import { exportGame, playableUrl } from './preview.js';
import { bundleProject, openBundle } from '../preview/bundle.js';
import { publishedUrl, requestFromHash, resolveRequest } from '../preview/store.js';

function world() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const store = new MemoryResourceStore();
    const project = new Project('My Game', { store });
    const workspace = new Workspace({ components: registry, project });

    const scene = new Scene('Level', { registry });
    const player = scene.add(new SceneObject('Player'));
    player.addComponent(new Transform(5, 6));
    workspace.create(scene);

    project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' }, 'data:image/png;base64,AA');

    return { project, store, workspace, registry };
}

// --- the address ---------------------------------------------------------------------------

test('a hash names a stored preview or a bundle to fetch, and nothing else', () => {
    assert.deepEqual(requestFromHash('#p/proj_1'), { kind: 'preview', value: 'proj_1' });
    assert.deepEqual(
        requestFromHash('#u/https%3A%2F%2Fexample.test%2Fgame.json'),
        { kind: 'url', value: 'https://example.test/game.json' }
    );

    assert.equal(requestFromHash(''), null);
    assert.equal(requestFromHash('#something'), null);
    assert.equal(requestFromHash(null), null);
});

test('a malformed escape is not an address', () => {
    assert.equal(requestFromHash('#u/%E0%A4%A'), null);
});

test('the link is built the way it is read', () => {
    const url = 'https://example.test/my game.json';
    assert.equal(publishedUrl(url, '/preview/index.html'), playableUrl(url, '/preview/index.html'));
    assert.deepEqual(requestFromHash(publishedUrl(url).replace('../preview/index.html', '')),
        { kind: 'url', value: url });
});

test('a published bundle is fetched and handed over', async () => {
    const it = world();
    const bundle = await bundleProject(it.project, it.store);

    const fetched = await resolveRequest({ kind: 'url', value: 'https://example.test/game.json' }, {
        fetch: async () => ({ ok: true, json: async () => bundle })
    });

    assert.equal(fetched.name, 'My Game');
    assert.equal(openBundle(fetched).project.resources().length, it.project.resources().length);
});

test('a link that points at nothing answers nothing, and never throws', async () => {
    const missing = await resolveRequest({ kind: 'url', value: 'https://example.test/gone.json' }, {
        fetch: async () => ({ ok: false })
    });
    const refused = await resolveRequest({ kind: 'url', value: 'https://example.test/gone.json' }, {
        fetch: async () => {
            throw new Error('blocked by policy');
        }
    });

    assert.equal(missing, null);
    assert.equal(refused, null);
    assert.equal(await resolveRequest(null), null);
});

// --- the file -------------------------------------------------------------------------------

test('what is exported is the bundle a Preview plays', async () => {
    const it = world();
    const written = [];

    const result = await exportGame(it.workspace, { save: (name, text) => written.push({ name, text }) });

    assert.equal(result.name, 'My-Game.pxgame.json');
    assert.equal(written.length, 1);

    const bundle = globalThis.JSON.parse(written[0].text);
    const opened = openBundle(bundle);

    assert.equal(opened.name, 'My Game');
    assert.ok(opened.scene, 'and it says which scene the game opens on');
    assert.deepEqual(
        opened.project.resources().map(entry => entry.name),
        it.project.resources().map(entry => entry.name)
    );
    assert.equal(opened.store.read(it.project.resources(ResourceKind.ASSET)[0].id), 'data:image/png;base64,AA');
});

test('the file is named after the project, and carries nothing a file system would refuse', async () => {
    const it = world();
    it.project.name = 'My  /Weird\\ Game?';
    const written = [];

    await exportGame(it.workspace, { save: (name, text) => written.push(name) });

    assert.match(written[0], /^[\w.-]+\.pxgame\.json$/);
});

test('no project is a refusal with a reason, not a crash', async () => {
    const said = [];
    assert.equal(await exportGame(null, { report: message => said.push(message) }), null);
    assert.equal(said.length, 1);
});

test('an empty project exports what it is, rather than refusing', async () => {
    const project = new Project('Empty', { store: new MemoryResourceStore() });
    const workspace = new Workspace({ components: new ComponentRegistry(), project });
    const written = [];

    const result = await exportGame(workspace, { save: (name, text) => written.push(text) });

    assert.ok(result.bytes > 0);
    assert.equal(openBundle(globalThis.JSON.parse(written[0])).scene, null);
});
