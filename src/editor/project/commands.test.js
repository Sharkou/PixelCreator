// Creating resources from the Project panel (ADR-0025).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_VERSION, invert } from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { History } from '../history.js';
import {
    RESOURCE_KINDS,
    createResourceOfKind,
    cutIntoTileset,
    resourceKind,
    resourceMenuItems
} from './commands.js';

// --- the table --------------------------------------------------------------------------

test('the menu is built from the kinds table, grouped like every other dropdown', () => {
    const items = resourceMenuItems();
    const entries = items.filter(item => !item.heading);
    const headings = items.filter(item => item.heading).map(item => item.heading);

    assert.deepEqual(
        entries.map(item => item.id).sort(),
        RESOURCE_KINDS.map(kind => kind.id).sort(),
        'every kind is offered, exactly once'
    );
    assert.ok(items[0].heading, 'a group opens the menu');
    assert.deepEqual(headings, ['General', 'Scenes', 'Graphics', 'Audio', 'Components']);
    assert.ok(entries.every(item => typeof item.label === 'string' && item.label !== ''));
    assert.ok(entries.every(item => typeof item.icon === 'string'));
});

test('a kind that needs a file says so, generically', () => {
    // The panel reads this flag; it never learns which kind carries it.
    assert.equal(resourceKind('image').pick.accept, 'image/*');
    assert.equal(resourceKind('sound').pick.accept, 'audio/*');
    // A row is found by its own id, or failing that by the kind it makes — and two rows
    // make an `asset`, so the kind answers with the first of them (ADR-0060 §5).
    assert.equal(resourceKind(ResourceKind.ASSET).pick.accept, 'image/*');
    assert.equal(resourceKind(ResourceKind.FOLDER).pick, undefined);
    assert.equal(resourceKind('nothing'), null);
    assert.equal(createResourceOfKind(new Project('Game'), 'nothing'), null);
});

// --- what each kind creates -------------------------------------------------------------

test('a folder is created in the folder that is open', () => {
    const project = new Project('Game');
    const assets = createResourceOfKind(project, ResourceKind.FOLDER);
    const images = createResourceOfKind(project, ResourceKind.FOLDER, { parent: assets.id });

    assert.equal(assets.kind, ResourceKind.FOLDER);
    assert.equal(images.parent, assets.id);
    assert.deepEqual(project.children(assets.id).map(entry => entry.id), [images.id]);
});

test('a scene is created with a real, empty payload', () => {
    const project = new Project('Game');
    const scene = createResourceOfKind(project, ResourceKind.SCENE);

    const payload = project.read(scene.id);
    assert.equal(scene.kind, ResourceKind.SCENE);
    assert.equal(payload.version, FORMAT_VERSION, 'the same writer that saves the open scene');
    assert.deepEqual(payload.objects, []);
    assert.deepEqual(payload.roots, []);
});

test('names are unique among siblings, and deterministic', () => {
    const project = new Project('Game');

    const first = createResourceOfKind(project, ResourceKind.SCENE);
    const second = createResourceOfKind(project, ResourceKind.SCENE);
    const folder = createResourceOfKind(project, ResourceKind.FOLDER);
    const nested = createResourceOfKind(project, ResourceKind.SCENE, { parent: folder.id });

    // The extension belongs to the kind, so it is part of the name from the first moment
    // — a creator renames the base, never the type (ADR-0026).
    assert.equal(first.name, 'New Scene.scene');
    assert.equal(second.name, 'New Scene 2.scene', 'the counter goes before the extension');
    assert.equal(nested.name, 'New Scene.scene', 'another folder, another set of names');
});

test('a component is ONE `.px` resource, carrying its own graph', () => {
    const project = new Project('Game');
    const history = new History(project.operations);

    const component = createResourceOfKind(project, ResourceKind.COMPONENT);
    const definition = project.read(component.id);

    assert.equal(component.kind, ResourceKind.COMPONENT);
    assert.equal(definition.type, component.id, 'a definition is identified by its own resource');
    // AND IT CARRIES NO LABEL. `label` is what a creator CHOSE to call the type; a fresh
    // `.px` has been called nothing, and writing the file name in would mint a copy that
    // stops being true at the first rename — `Counter.px` in the panel, `New Component.px`
    // in Add Component. What it is called is resolved from the resource, where it is shown
    // (editor/registry.js, ADR-0016 §label, ADR-0021).
    assert.equal('label' in definition, false, 'a name is not a label');
    assert.deepEqual(definition.properties, {});
    assert.deepEqual(definition.graph, { version: 1, nodes: [], connections: [] });

    // NO SECOND RESOURCE. A creator made one thing, and the project declares one thing
    // (ADR-0026).
    assert.equal(project.resources().length, 1);
    assert.equal(project.resources(ResourceKind.GRAPH).length, 0);

    // And it is one gesture: `Ctrl Z` takes the whole `.px` back (ADR-0024).
    assert.equal(history.depth, 1);
    history.undo();
    assert.equal(project.has(component.id), false);
});

test('an asset is created from a file the creator handed over', () => {
    const project = new Project('Game');

    const asset = createResourceOfKind(project, ResourceKind.ASSET, {
        file: { name: 'hero.png', type: 'image/png' },
        payload: 'data:image/png;base64,AAAA'
    });

    assert.equal(asset.kind, ResourceKind.ASSET);
    assert.equal(asset.name, 'hero.png');
    assert.equal(asset.mime, 'image/png');
    assert.equal(project.read(asset.id), 'data:image/png;base64,AAAA');
});

test('an asset with no file is not created at all', () => {
    const project = new Project('Game');

    assert.equal(createResourceOfKind(project, ResourceKind.ASSET), null);
    assert.deepEqual(project.resources(), []);
});

// --- undo ------------------------------------------------------------------------------

test('every creation is one Operation, so every creation undoes', () => {
    const project = new Project('Game');
    const history = new History(project.operations);
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    const folder = createResourceOfKind(project, ResourceKind.FOLDER);
    const scene = createResourceOfKind(project, ResourceKind.SCENE, { parent: folder.id });

    assert.equal(history.depth, 2);
    history.undo();
    assert.equal(project.has(scene.id), false);
    history.undo();
    assert.equal(project.has(folder.id), false);

    // And redo puts them back, in the order they were made.
    history.redo();
    history.redo();
    assert.deepEqual(project.resources().map(entry => entry.kind), ['folder', 'scene']);
    assert.equal(project.resources()[1].parent, project.resources()[0].id);

    // The inverse of an inverse is the original, for the operations this produced.
    for (const operation of seen) {
        assert.equal(invert(invert(operation)).type, operation.type);
    }
});


// --- an animation, from the sheet it animates -------------------------------------------

/** A 128 x 32 PNG header: four square frames, which is what the row must read. */
const SHEET = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAIAAAAAgCAYAAAAVQmJ5AAAAE0lEQVR42u3BAQ0AAADCoPdPbQ8HFAAAAABJRU5ErkJggg==';

test('an animation is created from a sheet, and the grid is read off the file', async () => {
    const project = new Project('Game');
    const clip = createResourceOfKind(project, 'animation', {
        file: { name: 'walk.png', type: 'image/png' },
        payload: SHEET
    });

    assert.equal(clip.kind, ResourceKind.ANIMATION);
    assert.equal(clip.name, 'walk.animation', 'named after the picture, not after the kind');

    const payload = await project.read(clip.id);
    assert.equal(payload.count, 4, '128 wide over 32 tall is four square frames');
    assert.deepEqual([payload.frameWidth, payload.frameHeight], [32, 32]);
    assert.equal(payload.columns, 4, 'a strip, so every frame is on one row');
    assert.equal(payload.loop, true);

    // THE SHEET CAME WITH IT. A clip whose source is not in the project would name nothing.
    const sheet = project.get(payload.source);
    assert.equal(sheet.kind, ResourceKind.ASSET);
    assert.equal(sheet.name, 'walk.png');
    assert.equal(await project.read(sheet.id), SHEET, 'byte for byte, as it was chosen');
});

test('the row asks for a picture, and refuses to invent one', () => {
    assert.equal(resourceKind('animation').pick.accept, 'image/*');
    // No file, no clip: the panel never reaches `create` without one, and if it did there
    // is nothing honest to make.
    assert.equal(createResourceOfKind(new Project('Game'), 'animation'), null);
});

test('a picture whose header says nothing still makes a clip that plays', async () => {
    const project = new Project('Game');
    const clip = createResourceOfKind(project, 'animation', {
        // A format the header reader does not know. It is still imported — the browser
        // will draw it — but nothing can be said about its grid.
        file: { name: 'mystery.webp', type: 'image/webp' },
        payload: 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAA=='
    });

    const payload = await project.read(clip.id);
    // One frame of 32, which is visibly wrong the moment it is played rather than
    // invisibly wrong for ever.
    assert.deepEqual([payload.count, payload.frameWidth, payload.frameHeight], [1, 32, 32]);
});

test('creating a clip is TWO resources and still one undo', () => {
    const project = new Project('Game');
    const history = new History(project.operations);
    const clip = createResourceOfKind(project, 'animation', {
        file: { name: 'walk.png', type: 'image/png' },
        payload: SHEET
    });

    assert.equal(project.resources().length, 2);
    // COUNTER-PROOF, and it is the honest one: two `add` intents are two Operations, so a
    // creator who changes their mind presses undo twice. Making it one would mean a batch,
    // and a batch is a decision about what a gesture IS — not a detail of this row.
    assert.equal(history.depth, 2);
    history.undo();
    assert.equal(project.has(clip.id), false);
    assert.equal(project.resources().length, 1, 'the sheet is a resource of its own');
});

// --- a tileset, from the sheet it cuts ----------------------------------------------------

test('a tileset is created from a sheet, and the grid is read off the file', async () => {
    const project = new Project('Game');
    const tileset = createResourceOfKind(project, 'tileset', {
        file: { name: 'dungeon.png', type: 'image/png' },
        payload: SHEET
    });

    assert.equal(tileset.kind, ResourceKind.TILESET);
    assert.equal(tileset.name, 'dungeon.tileset', 'named after the picture');

    const payload = await project.read(tileset.id);
    // The sheet is 128 x 32 and the guess is sixteen-pixel cells: eight across, two down.
    assert.equal(payload.tileWidth, 16);
    assert.equal(payload.tileHeight, 16);
    assert.equal(payload.columns, 8);
    assert.equal(payload.count, 16);

    const sheet = project.get(payload.source);
    assert.equal(sheet.kind, ResourceKind.ASSET);
    assert.equal(await project.read(sheet.id), SHEET, 'byte for byte, as it was chosen');
});

test('a sheet whose header says nothing still makes a tileset with one tile', async () => {
    const project = new Project('Game');
    const tileset = createResourceOfKind(project, 'tileset', {
        file: { name: 'mystery.webp', type: 'image/webp' },
        payload: 'data:image/webp;base64,UklGRhIAAABXRUJQVlA4TAYAAAAvAAAAAA=='
    });

    const payload = await project.read(tileset.id);
    assert.deepEqual([payload.columns, payload.count], [1, 1], 'visibly wrong, and one row to fix');
});

test('the row asks for a picture, and refuses to invent one', () => {
    assert.equal(resourceKind('tileset').pick.accept, 'image/*');
    assert.equal(createResourceOfKind(new Project('Game'), 'tileset'), null);
});

test('a picture already in the project can be cut without importing it twice', async () => {
    const project = new Project('Game');
    const sheet = project.add(
        { kind: ResourceKind.ASSET, name: 'dungeon.png', mime: 'image/png' },
        SHEET
    );
    const before = project.resources().length;

    const tileset = await cutIntoTileset(project, sheet.id);

    assert.equal(tileset.kind, ResourceKind.TILESET);
    assert.equal(tileset.name, 'dungeon.tileset');
    assert.equal((await project.read(tileset.id)).source, sheet.id, 'the picture that is already here');
    assert.equal(project.resources().length, before + 1, 'one new resource, not two');
});

test('only a picture can be cut', async () => {
    const project = new Project('Game');
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level.scene' }, { objects: [] });
    const sound = project.add({ kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav' }, 'data:audio/wav,');

    assert.equal(await cutIntoTileset(project, scene.id), null);
    assert.equal(await cutIntoTileset(project, sound.id), null);
    assert.equal(await cutIntoTileset(project, 'res_nothing'), null);
});
