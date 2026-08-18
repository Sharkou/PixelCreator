// Creating resources from the Project panel (ADR-0025).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FORMAT_VERSION, invert } from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { History } from '../history.js';
import {
    RESOURCE_KINDS,
    createResourceOfKind,
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
    assert.deepEqual(headings, ['General', 'Scenes', 'Graphics', 'Components']);
    assert.ok(entries.every(item => typeof item.label === 'string' && item.label !== ''));
    assert.ok(entries.every(item => typeof item.icon === 'string'));
});

test('a kind that needs a file says so, generically', () => {
    // The panel reads this flag; it never learns which kind carries it.
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
    assert.equal(definition.label, component.name);
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
