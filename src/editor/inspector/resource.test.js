// What the Inspector shows for a Resource (ADR-0025).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createTileset } from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { History } from '../history.js';
import { describeResource, editedPayload, formatBytes, formatDate, hasContentPanel } from './resource.js';
import { FieldKind } from './schema.js';

function labelled(description, label) {
    return description.metadata.find(entry => entry.label === label);
}

// --- what every resource shows ----------------------------------------------------------

test('a resource describes one editable field, and it is the name', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' }, { objects: [] });

    const description = describeResource(scene, { project });

    assert.deepEqual(description.fields.map(field => field.name), ['name']);
    assert.equal(description.fields[0].kind, FieldKind.STRING);
    assert.equal(description.fields[0].readonly, false);
    assert.equal(description.title, 'Level 1');
});

test('the facts are read-only, and named rather than raw', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Scenes' });
    const scene = project.add(
        { kind: ResourceKind.SCENE, name: 'Level 1', parent: folder.id },
        { objects: [{}, {}] }
    );

    const description = describeResource(scene, { project, payload: { objects: [{}, {}] }, size: 2048 });

    assert.ok(description.metadata.every(entry => entry.kind === FieldKind.READONLY));
    assert.equal(labelled(description, 'Type').value, 'Scene');
    assert.equal(labelled(description, 'Location').value, 'Scenes');
    assert.equal(labelled(description, 'Size').value, '2.0 KB');
    assert.equal(labelled(description, 'Identifier').value, scene.id);
    assert.equal(labelled(description, 'Objects').value, 2);
});

test('a resource at the top level says where it is rather than nothing', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    assert.equal(labelled(describeResource(scene, { project }), 'Location').value, 'Project');
});

test('a missing measurement is shown as missing, never as zero', () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    const description = describeResource(scene, { project, size: null });

    assert.equal(labelled(description, 'Size').value, '—');
    assert.equal(formatBytes(null), null);
    assert.equal(formatBytes(900), '900 B');
    assert.equal(formatBytes(2 * 1024 * 1024), '2.0 MB');
    assert.equal(formatDate(undefined), null);
    assert.equal(typeof formatDate(Date.now()), 'string');
});

// --- per kind, without a branch in the panel --------------------------------------------

test('a folder reports what it holds, and no payload facts', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Assets' });
    project.add({ kind: ResourceKind.ASSET, name: 'a.png', parent: folder.id });
    project.add({ kind: ResourceKind.ASSET, name: 'b.png', parent: folder.id });

    const description = describeResource(project.get(folder.id), { project });

    assert.equal(labelled(description, 'Contents').value, '2 items');
    assert.equal(labelled(description, 'Size'), undefined, 'a folder has no bytes');
    assert.equal(labelled(description, 'Revision'), undefined);
    assert.equal(hasContentPanel(folder), false);
});

test('a component reports its properties and the graph it carries', () => {
    const project = new Project('Game');
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller' });
    const payload = {
        type: component.id,
        properties: { speed: {}, jump: {} },
        graph: { version: 1, nodes: ['On Update'], connections: [] }
    };

    const description = describeResource(component, { project, payload });

    assert.equal(labelled(description, 'Properties').value, 2);
    assert.equal(labelled(description, 'Nodes').value, 1);
    assert.equal(labelled(describeResource(component, { project, payload: {} }), 'Nodes').value, 0);
});

test('an asset is the kind with content, and says what could not be drawn', () => {
    const project = new Project('Game');
    const asset = project.add({ kind: ResourceKind.ASSET, name: 'hero.png', mime: 'image/png' });

    assert.equal(hasContentPanel(asset), true);

    const drawable = describeResource(asset, { project, payload: 'data:image/png;base64,AAAA' });
    assert.equal(drawable.content.preview.type, 'image');
    assert.equal(drawable.content.replaceable, true);

    const empty = describeResource(asset, { project, payload: null });
    assert.equal(empty.content.preview.type, 'none');
    assert.ok(empty.content.preview.note.length > 0);
});

test('a kind the table says nothing about still inspects', () => {
    // The table adds fields; it does not decide whether a resource can be shown at all.
    const description = describeResource({
        id: 'res_x',
        kind: 'something-new',
        name: 'Mystery',
        parent: null,
        revision: 1,
        created: Date.now(),
        modified: Date.now()
    });

    assert.equal(description.fields[0].name, 'name');
    assert.equal(labelled(description, 'Type').value, 'something-new');
    assert.equal(description.content, null);
});

test('describing nothing is nothing, not an empty panel', () => {
    assert.equal(describeResource(null), null);
});

// --- the two kinds a creator makes without typing anything -------------------------------

test('a clip reports its sheet by name, its grid and its speed', () => {
    const project = new Project('Game');
    const sheet = project.add({ kind: ResourceKind.ASSET, name: 'walk.png', mime: 'image/png' }, 'data:,');
    const clip = project.add({ kind: ResourceKind.ANIMATION, name: 'Walk.animation' }, null);

    const description = describeResource(clip, {
        project,
        payload: { source: sheet.id, frameWidth: 32, frameHeight: 32, count: 4, columns: 4, fps: 12, loop: true }
    });
    const facts = new Map(description.metadata.map(field => [field.label, field.value]));

    assert.equal(description.kindName, 'Animation');
    // THE SHEET IS NAMED, NOT IDENTIFIED. A ResourceId in a panel tells nobody anything —
    // and the name is the one this panel's own header shows, extension derived away.
    assert.equal(facts.get('Sheet'), 'walk');

    // AND THE CUTTING IS TYPED INTO (ADR-0070 §5). It was reported and read-only until a
    // second structured resource wanted the same rows; what a creator can correct is now
    // what a creator can correct.
    const edits = new Map(description.edits.map(field => [field.name, field.value]));
    assert.deepEqual([...edits.keys()],
        ['frameWidth', 'frameHeight', 'columns', 'count', 'first', 'fps', 'loop']);
    assert.equal(edits.get('count'), 4);
    assert.equal(edits.get('frameWidth'), 32);
    assert.equal(edits.get('fps'), 12);
    assert.equal(edits.get('loop'), true);
    assert.ok(description.edits.every(field => field.readonly === false));
});

test('a clip whose sheet was deleted says so instead of showing an identifier', () => {
    const project = new Project('Game');
    const clip = project.add({ kind: ResourceKind.ANIMATION, name: 'Walk.animation' }, null);

    const description = describeResource(clip, { project, payload: { source: 'res_gone', count: 2 } });
    const facts = new Map(description.metadata.map(field => [field.label, field.value]));

    assert.equal(facts.get('Sheet'), 'Missing');
});

test('a prefab reports how many Objects it would make', () => {
    const project = new Project('Game');
    const prefab = project.add({ kind: ResourceKind.PREFAB, name: 'Enemy.prefab' }, null);

    const description = describeResource(prefab, {
        project,
        payload: { root: { name: 'Enemy', children: [{ name: 'Gun', children: [] }, { name: 'Shadow' }] } }
    });
    const facts = new Map(description.metadata.map(field => [field.label, field.value]));

    assert.equal(description.kindName, 'Prefab');
    assert.equal(facts.get('Objects'), 3, 'the root counts: it is an Object too');
});

// --- typing into what a resource holds (ADR-0070 §5) --------------------------------------

test('a tileset shows its sheet, and its cutting is typed into', () => {
    const project = new Project('Game');
    const sheet = project.add({ kind: ResourceKind.ASSET, name: 'dungeon.png', mime: 'image/png' }, 'data:,');
    const tileset = project.add({ kind: ResourceKind.TILESET, name: 'Dungeon.tileset' },
        createTileset({ source: sheet.id, tileWidth: 16, tileHeight: 16, columns: 8, count: 40 }));

    const description = describeResource(tileset, { project, payload: project.read(tileset.id) });
    const facts = new Map(description.metadata.map(field => [field.label, field.value]));
    const edits = new Map(description.edits.map(field => [field.name, field.value]));

    assert.equal(description.kindName, 'Tileset');
    assert.equal(facts.get('Sheet'), 'dungeon');
    assert.deepEqual([...edits.keys()], ['tileWidth', 'tileHeight', 'columns', 'count']);
    assert.deepEqual([edits.get('tileWidth'), edits.get('columns'), edits.get('count')], [16, 8, 40]);
});

test('an edit goes through the kind that built the payload, so nonsense is clamped', () => {
    const project = new Project('Game');
    const tileset = project.add({ kind: ResourceKind.TILESET, name: 'Dungeon.tileset' },
        createTileset({ source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 8, count: 40 }));
    const payload = project.read(tileset.id);

    assert.equal(editedPayload(tileset, payload, 'tileWidth', 32).tileWidth, 32);
    assert.equal(editedPayload(tileset, payload, 'columns', -4).columns, 1, 'clamped, never carried');
    assert.equal(editedPayload(tileset, payload, 'count', 'many').count, 0);
    assert.equal(editedPayload(tileset, payload, 'tileWidth', 32).source, 'res_sheet', 'the sheet stays');

    // A kind with a window of its own has no content rows and no writer.
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level.scene' }, { objects: [] });
    assert.deepEqual(describeResource(scene, { project }).edits, []);
    assert.equal(editedPayload(scene, {}, 'anything', 1), null);
});

test('typing into a tileset is one undoable intent, and the revision moves with it', () => {
    const project = new Project('Game');
    const tileset = project.add({ kind: ResourceKind.TILESET, name: 'Dungeon.tileset' },
        createTileset({ source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 8, count: 40 }));
    const history = new History(project.operations);
    const before = project.get(tileset.id).revision;

    const next = editedPayload(tileset, project.read(tileset.id), 'tileWidth', 32);
    project.setPayload(tileset.id, next);

    assert.equal(project.read(tileset.id).tileWidth, 32);
    assert.ok(project.get(tileset.id).revision > before, 'so anything watching it rebuilds');

    history.undo();
    assert.equal(project.read(tileset.id).tileWidth, 16, 'exactly what it held');

    history.redo();
    assert.equal(project.read(tileset.id).tileWidth, 32);
});

test('a payload that has not arrived yet shows no rows, rather than rows of zero', () => {
    // A store is asynchronous (ADR-0020 §4): the panel renders before the read lands, and
    // `0` in every row is a number a creator would type over.
    const project = new Project('Game');
    const tileset = project.add({ kind: ResourceKind.TILESET, name: 'Dungeon.tileset' },
        createTileset({ source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 8, count: 40 }));

    assert.deepEqual(describeResource(tileset, { project, payload: null }).edits, []);
    assert.equal(describeResource(tileset, { project, payload: project.read(tileset.id) }).edits.length, 4);
});
