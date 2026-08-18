// What a drop means, and what it refuses (ADR-0026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { Sprite, RectangleRenderer } from '../../runtime/mod.js';
import { Workspace } from '../project/workspace.js';
import { registerBuiltIns } from '../registry.js';
import { DropZone, filesPayload, objectPayload, resourcePayload } from './payload.js';
import { acceptsResource, canDrop, instantiator, performDrop, ruleFor } from './rules.js';

const PNG = 'data:image/png;base64,AAAA';

function context() {
    const workspace = new Workspace();
    const scene = new Scene('Main', { registry: registerBuiltIns(new ComponentRegistry()) });
    workspace.create(scene);

    return { workspace, project: workspace.project, scene };
}

function imageIn(project, { name = 'hero.png', parent = null } = {}) {
    return project.add({ kind: ResourceKind.ASSET, name, parent, mime: 'image/png' }, PNG);
}

function file(name = 'hero.png', mime = 'image/png') {
    return { name, mime, payload: PNG };
}

// --- files from outside the browser -----------------------------------------------------

test('files dropped on the Project panel become resources in that folder', () => {
    const ctx = context();
    const folder = ctx.project.addFolder({ name: 'Assets' });

    const result = performDrop(
        filesPayload([file('hero.png'), file('villain.png')]),
        { zone: DropZone.PROJECT, parent: folder.id, project: ctx.project },
        ctx
    );

    assert.equal(result.imported.length, 2);
    assert.deepEqual(
        ctx.project.children(folder.id).map(entry => entry.name),
        ['hero.png', 'villain.png']
    );
    assert.equal(ctx.project.read(result.imported[0].id), PNG);
    assert.equal(ctx.workspace.selectedId, result.imported[1].id, 'the last one is selected');
});

test('files dropped on the scene are imported AND instantiated where they landed', () => {
    const ctx = context();

    const result = performDrop(
        filesPayload([file('hero.png')]),
        { zone: DropZone.SCENE, x: 120.4, y: -40.7 },
        ctx
    );

    assert.equal(result.imported.length, 1);
    assert.equal(result.objects.length, 1);

    const object = result.objects[0];
    assert.equal(object.name, 'hero');
    assert.equal(object.getComponent('Transform').x, 120);
    assert.equal(object.getComponent('Transform').y, -41);
    assert.equal(object.getComponent('Sprite').source, result.imported[0].id,
        'the scene references the resource, never the bytes');
});

test('a file dropped on a Content section replaces the payload, revision and all', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const before = ctx.project.get(asset.id).revision;

    const result = performDrop(
        filesPayload([{ name: 'other.jpg', mime: 'image/jpeg', payload: 'data:image/jpeg;base64,BBBB' }]),
        { zone: DropZone.CONTENT, resource: asset },
        ctx
    );

    assert.equal(result.replaced, asset.id);
    assert.equal(ctx.project.read(asset.id), 'data:image/jpeg;base64,BBBB');
    assert.equal(ctx.project.get(asset.id).mime, 'image/jpeg');
    assert.equal(ctx.project.get(asset.id).revision, before + 1);
    assert.equal(ctx.project.get(asset.id).id, asset.id, 'and the identity did not move');
});

test('files dropped on the Hierarchy are imported and added at the origin', () => {
    const ctx = context();

    const result = performDrop(filesPayload([file('hero.png')]), { zone: DropZone.HIERARCHY }, ctx);

    assert.equal(result.imported.length, 1);
    assert.equal(result.objects[0].getComponent('Transform').x, 0);
    assert.equal(result.objects[0].getComponent('Sprite').source, result.imported[0].id);
});

// --- a resource dragged out of the Project panel -----------------------------------------

test('an image dropped in the scene becomes an object with a Sprite', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);

    const result = performDrop(
        resourcePayload(asset),
        { zone: DropZone.SCENE, x: 10, y: 20 },
        ctx
    );

    const object = result.objects[0];
    assert.ok(ctx.scene.has(object));
    assert.deepEqual(object.componentTypes(), ['Transform', 'Sprite']);
    assert.equal(object.getComponent('Sprite').source, asset.id);
    assert.equal(object.getComponent('Transform').x, 10);
});

test('an image dropped in the Hierarchy lands at the origin', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);

    const result = performDrop(resourcePayload(asset), { zone: DropZone.HIERARCHY }, ctx);
    const object = result.objects[0];

    assert.equal(object.getComponent('Transform').x, 0);
    assert.equal(object.getComponent('Transform').y, 0);
});

test('two images dropped from one project get names that tell them apart', () => {
    const ctx = context();
    const first = imageIn(ctx.project, { name: 'hero.png' });

    performDrop(resourcePayload(first), { zone: DropZone.SCENE, x: 0, y: 0 }, ctx);
    performDrop(resourcePayload(first), { zone: DropZone.SCENE, x: 0, y: 0 }, ctx);

    assert.deepEqual(ctx.scene.objects().map(object => object.name), ['hero', 'hero 2']);
});

test('a resource that nothing knows how to instantiate is refused', () => {
    const ctx = context();
    const scene = ctx.project.add({ kind: ResourceKind.SCENE, name: 'Level 1' });
    const folder = ctx.project.addFolder({ name: 'Assets' });

    assert.equal(instantiator(scene), null);
    assert.equal(instantiator(folder), null);
    assert.equal(canDrop(resourcePayload(scene), { zone: DropZone.SCENE, x: 0, y: 0 }).allowed, false);
    assert.equal(performDrop(resourcePayload(scene), { zone: DropZone.SCENE, x: 0, y: 0 }, ctx), null);
    assert.equal(ctx.scene.size, 0);
});

// --- a resource dropped on a property ----------------------------------------------------

test('an image dropped on a resource property assigns the reference', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    const sprite = object.addComponent(new Sprite());

    const target = { zone: DropZone.PROPERTY, component: sprite, prop: 'source' };
    assert.equal(canDrop(resourcePayload(asset), target).allowed, true);

    const result = performDrop(resourcePayload(asset), target, ctx);

    assert.equal(result.assigned, asset.id);
    assert.equal(sprite.source, asset.id);
});

test('assigning a resource to a property is an Operation, so it undoes', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    const sprite = object.addComponent(new Sprite());

    const seen = [];
    ctx.scene.operations.on('operation', operation => seen.push(operation));

    performDrop(
        resourcePayload(asset),
        { zone: DropZone.PROPERTY, component: sprite, prop: 'source' },
        ctx
    );

    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'SET_PROPERTY');
    assert.equal(seen[0].prop, 'source');
    assert.equal(seen[0].previous, null);
});

test('a property that does not take a resource refuses the drop', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    const rectangle = object.addComponent(new RectangleRenderer(10, 10, '#fff'));

    const target = { zone: DropZone.PROPERTY, component: rectangle, prop: 'width' };

    assert.equal(acceptsResource(target, asset), false);
    assert.equal(canDrop(resourcePayload(asset), target).allowed, false);
    assert.equal(performDrop(resourcePayload(asset), target, ctx), null);
    assert.equal(rectangle.width, 10, 'and the value was not touched');
});

test('a property may narrow what it accepts, and the refusal is declared', () => {
    const ctx = context();
    const sound = ctx.project.add({ kind: ResourceKind.ASSET, name: 'jump.wav', mime: 'audio/wav' }, 'x');
    const object = ctx.scene.add(new SceneObject('Hero'));
    const sprite = object.addComponent(new Sprite());

    // Sprite.source declares `kind: 'asset'` and `mime: 'image/'`, so a sound is refused
    // by the declaration rather than by a branch anybody wrote about sprites.
    assert.equal(acceptsResource({ component: sprite, prop: 'source' }, sound), false);

    // A reference that narrows nothing takes any resource, which is also a statement.
    assert.equal(
        acceptsResource({ component: { constructor: { schema: { source: { type: 'resource' } } } }, prop: 'source' }, sound),
        true
    );
});

// --- moving a resource inside the Project panel ------------------------------------------

test('a resource dropped on a folder row moves into it', () => {
    const ctx = context();
    const folder = ctx.project.addFolder({ name: 'Assets' });
    const asset = imageIn(ctx.project);

    const result = performDrop(
        resourcePayload(asset),
        { zone: DropZone.PROJECT, parent: folder.id, project: ctx.project },
        ctx
    );

    assert.equal(result.moved, true);
    assert.equal(ctx.project.get(asset.id).parent, folder.id);
});

test('a folder cannot be dropped into its own subtree', () => {
    const ctx = context();
    const assets = ctx.project.addFolder({ name: 'Assets' });
    const images = ctx.project.addFolder({ name: 'Images', parent: assets.id });

    const target = { zone: DropZone.PROJECT, parent: images.id, project: ctx.project };

    assert.equal(canDrop(resourcePayload(assets), target).allowed, false);
    assert.equal(performDrop(resourcePayload(assets), target, ctx), null);
    assert.equal(ctx.project.get(assets.id).parent, null);
});

test('a drop between two rows carries the rank it landed at', () => {
    const ctx = context();
    const first = imageIn(ctx.project, { name: 'a.png' });
    const second = imageIn(ctx.project, { name: 'b.png' });

    performDrop(
        resourcePayload(second),
        { zone: DropZone.PROJECT, parent: null, index: 0, project: ctx.project },
        ctx
    );

    // The workspace's own scene resource sits at the top level too, so the assertion is
    // about the rank the drop asked for, not about the whole list.
    assert.equal(ctx.project.indexOf(second.id), 0);
    assert.ok(ctx.project.indexOf(first.id) > 0);
    assert.deepEqual(
        ctx.project.children().map(entry => entry.name).filter(name => name.endsWith('.png')),
        ['b.png', 'a.png']
    );
});

// --- what is refused, and says so --------------------------------------------------------

test('dragging an object into the Project panel is refused, with the reason', () => {
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));
    object.addComponent(new Transform());

    const target = { zone: DropZone.PROJECT, parent: null, project: ctx.project };
    const verdict = canDrop(objectPayload(object), target);

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /Prefabs are not designed yet/);
    assert.equal(performDrop(objectPayload(object), target, ctx), null);
    assert.equal(ctx.project.resources().filter(entry => entry.name === 'Hero').length, 0);
});

test('a drop nothing knows about is simply not allowed, and says nothing', () => {
    const verdict = canDrop(resourcePayload({ id: 'r', kind: 'asset' }), { zone: 'nowhere' });

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.rule, null);
    assert.equal(verdict.reason, null);
    assert.equal(ruleFor(null, null), null);
});

test('every rule announces what it would do, so a panel can say it', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);

    assert.match(
        canDrop(filesPayload([file()]), { zone: DropZone.PROJECT, parent: null, project: ctx.project }).reason,
        /Import “hero.png”/
    );
    assert.match(
        canDrop(filesPayload([file('a.png'), file('b.png')]), { zone: DropZone.SCENE }).reason,
        /2 files/
    );
    assert.match(canDrop(resourcePayload(asset), { zone: DropZone.SCENE }).reason, /hero\.png/);
});
