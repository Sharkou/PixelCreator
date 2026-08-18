// Folders: a kind of Resource, and a parent link (ADR-0025).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { invert } from '../core/mod.js';
import {
    MemoryResourceStore,
    Project,
    ResourceKind,
    ancestorsOf,
    canMove,
    childrenOf,
    createResource,
    descendantsOf,
    folderPath,
    isDescendantOf,
    isFolder,
    hasPayload,
    uniqueResourceName
} from './mod.js';

/**
 * Assets/
 *   Images/  hero.png
 * Level 1
 * @returns {object} The project and its entries
 */
function tree() {
    const project = new Project('Game');
    const assets = project.addFolder({ name: 'Assets' });
    const images = project.addFolder({ name: 'Images', parent: assets.id });
    const hero = project.add(
        { kind: ResourceKind.ASSET, name: 'hero.png', parent: images.id, mime: 'image/png' },
        'binary'
    );
    const level = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' }, { objects: [] });

    return { project, assets, images, hero, level };
}

// --- what a folder is -------------------------------------------------------------------

test('a folder is a Resource, with an identity and no payload', () => {
    const { project, assets } = tree();

    assert.equal(assets.kind, ResourceKind.FOLDER);
    assert.equal(isFolder(assets), true);
    assert.equal(hasPayload(assets), false);
    assert.equal(project.read(assets.id), null);
    assert.equal(isFolder(ResourceKind.SCENE), false);
    assert.equal(hasPayload(createResource({ kind: ResourceKind.SCENE })), true);
});

test('creating a folder is one ADD_RESOURCE, so it undoes like anything else', () => {
    const project = new Project('Game');
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    const folder = project.addFolder({ name: 'Assets' });

    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'ADD_RESOURCE');

    project.operations.submit(invert(seen[0]));
    assert.equal(project.has(folder.id), false);
});

test('a new resource gets a name no sibling is using, deterministically', () => {
    const project = new Project('Game');

    const first = project.addFolder();
    const second = project.addFolder();
    const third = project.addFolder();

    assert.deepEqual([first.name, second.name, third.name], ['New Folder', 'New Folder 2', 'New Folder 3']);
    // Uniqueness is per folder: two folders may each hold an "Images".
    assert.equal(uniqueResourceName(project, 'New Folder', first.id), 'New Folder');
    assert.equal(uniqueResourceName(project, 'New Folder'), 'New Folder 4');
});

// --- the hierarchy ----------------------------------------------------------------------

test('a folder holds what names it, in manifest order', () => {
    const { project, assets, images, hero, level } = tree();

    assert.deepEqual(childrenOf(project).map(entry => entry.id), [assets.id, level.id]);
    assert.deepEqual(childrenOf(project, assets.id).map(entry => entry.id), [images.id]);
    assert.deepEqual(childrenOf(project, images.id).map(entry => entry.id), [hero.id]);
    assert.deepEqual(project.children(images.id).map(entry => entry.id), [hero.id]);
});

test('the path is derived from the links, never stored', () => {
    const { project, assets, images, hero } = tree();

    assert.equal(folderPath(project, hero), 'Assets/Images');
    assert.equal(folderPath(project, hero, { self: true }), 'Assets/Images/hero.png');
    assert.equal(folderPath(project, assets), '');
    assert.deepEqual(ancestorsOf(project, hero).map(entry => entry.name), ['Assets', 'Images']);

    // Renaming a folder changes every path under it, and rewrites nothing.
    project.setProperty(assets.id, 'name', 'Art');
    assert.equal(folderPath(project, hero), 'Art/Images');
    assert.equal(project.get(hero.id).parent, images.id, 'the link is untouched');
});

test('a subtree is listed parents first', () => {
    const { project, assets, images, hero } = tree();

    assert.deepEqual(descendantsOf(project, assets).map(entry => entry.id), [images.id, hero.id]);
    assert.equal(isDescendantOf(project, assets, hero), true);
    assert.equal(isDescendantOf(project, images, assets), false);
    assert.deepEqual(descendantsOf(project, hero), []);
});

// --- moving -----------------------------------------------------------------------------

test('moving a resource is one MOVE_RESOURCE, and it inverts', () => {
    const { project, assets, hero, images } = tree();
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    assert.equal(project.move(hero.id, assets.id), true);
    assert.equal(project.get(hero.id).parent, assets.id);
    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'MOVE_RESOURCE');

    project.operations.submit(invert(seen[0]));
    assert.equal(project.get(hero.id).parent, images.id);
    assert.equal(project.indexOf(hero.id), 0, 'and back at the rank it held');
});

// --- ranking among siblings (ADR-0026) --------------------------------------------------

test('a resource is reordered inside its folder by the same operation', () => {
    const project = new Project('Game');
    const first = project.add({ kind: ResourceKind.SCENE, name: 'A' });
    const second = project.add({ kind: ResourceKind.SCENE, name: 'B' });
    const third = project.add({ kind: ResourceKind.SCENE, name: 'C' });

    assert.equal(project.move(third.id, null, { index: 0 }), true);
    assert.deepEqual(project.children().map(entry => entry.name), ['C', 'A', 'B']);
    assert.equal(project.indexOf(third.id), 0);
    assert.equal(project.indexOf(first.id), 1);
    assert.equal(project.indexOf(second.id), 2);
});

test('reordering undoes to the rank it came from', () => {
    const project = new Project('Game');
    project.add({ kind: ResourceKind.SCENE, name: 'A' });
    project.add({ kind: ResourceKind.SCENE, name: 'B' });
    const third = project.add({ kind: ResourceKind.SCENE, name: 'C' });

    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));
    project.move(third.id, null, { index: 0 });

    project.operations.submit(invert(seen[0]));
    assert.deepEqual(project.children().map(entry => entry.name), ['A', 'B', 'C']);
});

test('a move into another folder can name a rank there', () => {
    const { project, assets, images, hero, level } = tree();
    project.add({ kind: ResourceKind.ASSET, name: 'villain.png', parent: images.id });

    assert.equal(project.move(level.id, images.id, { index: 0 }), true);
    assert.deepEqual(
        project.children(images.id).map(entry => entry.name),
        ['Level 1', 'hero.png', 'villain.png']
    );
    // And the folder's own contents did not scatter through the manifest.
    assert.equal(project.get(level.id).parent, images.id);
    assert.equal(project.indexOf(hero.id), 1);
    assert.equal(project.children(assets.id).length, 1);
});

test('a resource dropped into an empty folder lands beside it, not at the far end', () => {
    const project = new Project('Game');
    const folder = project.addFolder({ name: 'Empty' });
    const scene = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });
    project.add({ kind: ResourceKind.SCENE, name: 'Level 2' });

    project.move(scene.id, folder.id);

    assert.deepEqual(project.resources().map(entry => entry.name), ['Empty', 'Level 1', 'Level 2']);
    assert.deepEqual(project.children(folder.id).map(entry => entry.name), ['Level 1']);
});

test('a move that changes neither folder nor rank announces nothing', () => {
    const project = new Project('Game');
    const first = project.add({ kind: ResourceKind.SCENE, name: 'A' });
    project.add({ kind: ResourceKind.SCENE, name: 'B' });

    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    assert.equal(project.move(first.id, null, { index: 0 }), false);
    assert.equal(project.move(first.id, null), false, 'no rank means "append", and it is already there');
    assert.deepEqual(seen, []);
});

test('a replicated move is refused by the same guard, rank included', () => {
    const { project, assets, images } = tree();

    const applied = project.operations.apply({
        type: 'MOVE_RESOURCE',
        target: { object: assets.id, component: null },
        parent: images.id,
        index: 0,
        previousParent: null,
        previousIndex: 0,
        origin: 'network',
        actor: 'someone-else',
        batch: null,
        seq: 7
    });

    assert.equal(applied, false);
    assert.equal(project.get(assets.id).parent, null);
});

test('moving to the top level is a move like any other', () => {
    const { project, hero } = tree();

    assert.equal(project.move(hero.id, null), true);
    assert.equal(project.get(hero.id).parent, null);
    assert.equal(project.children(null).some(entry => entry.id === hero.id), true);
});

test('a folder cannot be moved into itself or into its own subtree', () => {
    const { project, assets, images } = tree();

    assert.equal(canMove(project, assets, assets.id), false);
    assert.equal(canMove(project, assets, images.id), false, 'that would detach the branch');
    assert.equal(project.move(assets.id, images.id), false);
    assert.equal(project.get(assets.id).parent, null, 'and nothing moved');
});

test('a resource cannot be filed under something that is not a folder', () => {
    const { project, hero, level } = tree();

    assert.equal(canMove(project, hero, level.id), false);
    assert.equal(canMove(project, hero, 'nothing'), false);
    assert.equal(project.move(hero.id, level.id), false);
});

test('a replicated move is refused by the same guard', () => {
    // A move that arrives through apply() never goes through move(), so the rule lives in
    // the handler as well (ADR-0019 §5).
    const { project, assets, images } = tree();

    const applied = project.operations.apply({
        type: 'SET_PROPERTY',
        target: { object: assets.id, component: null },
        prop: 'parent',
        value: images.id,
        previous: null,
        origin: 'network',
        actor: 'someone-else',
        batch: null,
        seq: 4
    });

    assert.equal(applied, false);
    assert.equal(project.get(assets.id).parent, null);
});

test('moving into the folder it is already in, with no rank, changes nothing', () => {
    const { project, hero, images } = tree();
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    assert.equal(project.move(hero.id, images.id), false);
    assert.deepEqual(seen, []);
});

// --- deleting ---------------------------------------------------------------------------

test('deleting a folder deletes what it holds, as one batch', () => {
    const { project, assets, images, hero, level } = tree();
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    assert.equal(project.removeTree(assets.id), 3);

    assert.equal(project.has(assets.id), false);
    assert.equal(project.has(images.id), false);
    assert.equal(project.has(hero.id), false);
    assert.equal(project.has(level.id), true, 'and nothing else');

    assert.equal(seen.length, 3);
    assert.equal(new globalThis.Set(seen.map(operation => operation.batch)).size, 1);
});

test('undoing a folder deletion restores the whole branch, payloads included', () => {
    const { project, assets, images, hero } = tree();
    const seen = [];
    project.operations.on('operation', operation => seen.push(operation));

    project.removeTree(assets.id);

    // What History does: invert in reverse order, so parents come back before children.
    for (const operation of [...seen].reverse()) project.operations.submit(invert(operation));

    assert.equal(project.has(assets.id), true);
    assert.equal(project.get(images.id).parent, assets.id);
    assert.equal(project.get(hero.id).parent, images.id);
    assert.equal(project.read(hero.id), 'binary');
});

test('removing a leaf does not need the tree walk', () => {
    const { project, hero, images } = tree();

    assert.equal(project.removeTree(hero.id), 1);
    assert.equal(project.has(images.id), true);
    assert.equal(project.removeTree('nothing'), 0);
});

// --- persistence ------------------------------------------------------------------------

test('the hierarchy survives a manifest round trip', () => {
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    const assets = project.addFolder({ name: 'Assets' });
    const images = project.addFolder({ name: 'Images', parent: assets.id });
    const hero = project.add(
        { kind: ResourceKind.ASSET, name: 'hero.png', parent: images.id },
        'binary'
    );

    const data = globalThis.JSON.parse(globalThis.JSON.stringify(project.serialize()));
    const reopened = Project.deserialize(data, { store });

    assert.equal(folderPath(reopened, hero.id, { self: true }), 'Assets/Images/hero.png');
    assert.deepEqual(reopened.serialize(), project.serialize());
    assert.equal(reopened.read(hero.id), 'binary');
});

test('a manifest entry carries when it was made and when it last changed', () => {
    const project = new Project('Game');
    const before = Date.now();
    const resource = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: [] });

    assert.ok(resource.created >= before);
    assert.equal(resource.modified, resource.created, 'nothing has been written since');

    project.save(resource.id, { nodes: ['a'] });
    assert.ok(project.get(resource.id).modified >= resource.created);
    assert.equal(project.get(resource.id).revision, 2);
});

test('the store can say how big a payload is, and admits when it cannot', () => {
    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    const graph = project.add({ kind: ResourceKind.GRAPH, name: 'Controller' }, { nodes: ['a'] });
    const folder = project.addFolder({ name: 'Assets' });

    assert.equal(store.size(graph.id), globalThis.JSON.stringify({ nodes: ['a'] }).length);
    assert.equal(store.size(folder.id), null, 'a folder has no payload to measure');
    assert.equal(store.size('nothing'), null);
});

// --- one `.px`, nothing owned (ADR-0026) ------------------------------------------------

test('a Component is one resource, so deleting it takes nothing else with it', () => {
    const project = new Project('Game');
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller' });
    project.save(component.id, {
        type: component.id,
        properties: {},
        graph: { version: 1, nodes: [], connections: [] }
    });
    const other = project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });

    assert.equal(project.removeTree(component.id), 1);
    assert.equal(project.has(other.id), true);

    // The graph went with it because it was never a separate thing.
    assert.equal(project.read(component.id), null);
});
