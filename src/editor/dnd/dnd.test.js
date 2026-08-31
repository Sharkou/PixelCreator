// What a drop means, and what it refuses (ADR-0026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentDefinition,
    ComponentRegistry,
    NodeRegistry,
    createId,
    declaredProperties,
    portsOf,
    referencedComponentProperty,
    registerStandardNodes,
    Object as SceneObject,
    PropertyType,
    Scene,
    Transform,
    defineComponent,
    portTypeOf,
    typesCompatible
} from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { Sprite, RectangleRenderer } from '../../runtime/mod.js';
import { Workspace } from '../project/workspace.js';
import { componentCatalogue, registerBuiltIns } from '../registry.js';
import { addComponent } from '../commands.js';
import { History } from '../history.js';
import {
    DragKind,
    DropZone,
    componentPayload,
    filesPayload,
    propertyPayload,
    objectPayload,
    resourcePayload
} from './payload.js';
import {
    RULES,
    acceptsProperty,
    acceptsObject,
    acceptsResource,
    canDrop,
    instantiator,
    performDrop,
    ruleFor
} from './rules.js';

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

// --- a resource dropped on an object's components (ADR-0026 §6) --------------------------
//
// THE SAME SENTENCE THE SCENE DROP READS, MINUS THE OBJECT. "An image is a Sprite" is one
// row of the INSTANTIABLE table; dropping the image in the scene reads it as "an object
// showing this picture", dropping it on an object reads it as "show this picture on THAT
// object". These tests are about the two readings staying one sentence.

/** The context a panel hands a rule, with the Editor's own ADD_COMPONENT command in it. */
function attaching(ctx) {
    return {
        ...ctx,
        addComponent: (object, type, options) => addComponent(object, type, ctx.scene.registry, options)
    };
}

test('an image dropped on an object attaches the Component that shows it', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));

    const target = { zone: DropZone.COMPONENTS, object };
    const verdict = canDrop(resourcePayload(asset), target);
    assert.equal(verdict.allowed, true);
    assert.match(verdict.reason, /Sprite/, 'the ghost names what it would attach');

    const result = performDrop(resourcePayload(asset), target, attaching(ctx));

    assert.equal(result.type, 'Sprite');
    assert.equal(object.hasComponent('Sprite'), true);
    assert.equal(object.getComponent('Sprite').source, asset.id, 'and it is pointed at the resource');
});

test('what is stored is the ResourceId, never the payload', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));

    performDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object }, attaching(ctx));

    const stored = object.getComponent('Sprite').source;
    assert.equal(stored, asset.id);
    assert.equal(stored.includes('data:'), false, 'a scene references its images (ADR-0020)');
});

test('the attached Component is visible, not a Component of size zero', () => {
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));

    performDrop(resourcePayload(imageIn(ctx.project)), { zone: DropZone.COMPONENTS, object }, attaching(ctx));

    const sprite = object.getComponent('Sprite');
    assert.ok(sprite.width > 0 && sprite.height > 0,
        'a drop that attaches something invisible is a drop that looks like nothing happened');
});

test('the two readings of one row agree about what an image is', () => {
    // THE INVARIANT, and the reason `consumes` replaced a `build` per row: an image placed
    // in the scene and an image dropped on an object must produce the SAME Sprite. Two
    // spellings of the sentence would drift, and neither place would look wrong on its own.
    const ctx = context();
    const asset = imageIn(ctx.project);

    const placed = performDrop(resourcePayload(asset), { zone: DropZone.SCENE, x: 0, y: 0 }, ctx)
        .objects[0]
        .getComponent('Sprite');

    const attached = ctx.scene.add(new SceneObject('Hero'));
    performDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object: attached }, attaching(ctx));
    const grown = attached.getComponent('Sprite');

    assert.deepEqual(
        { source: grown.source, width: grown.width, height: grown.height },
        { source: placed.source, width: placed.width, height: placed.height }
    );
});

test('attaching and pointing are one gesture, so they are one undo entry', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    const history = new History(ctx.scene.operations);

    performDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object }, attaching(ctx));
    assert.equal(object.hasComponent('Sprite'), true);

    assert.equal(history.depth, 1, 'one drop, one entry (ADR-0024 §4)');
    history.undo();
    assert.equal(object.hasComponent('Sprite'), false, 'and the whole drop goes back at once');
});

test('an object that already carries the Component refuses, and says where to aim', () => {
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    object.addComponent(new Sprite());

    const verdict = canDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object });

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /already has a Sprite/);
    assert.match(verdict.reason, /Source/, 'a refusal a creator cannot act on is half a refusal');
    assert.equal(performDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object }, attaching(ctx)), null);
    assert.equal(object.componentTypes().filter(type => type === 'Sprite').length, 1);
});

test('a resource nothing consumes is not attachable, and no rule pretends otherwise', () => {
    const ctx = context();
    const sound = ctx.project.add({ kind: ResourceKind.ASSET, name: 'jump.wav', mime: 'audio/wav' }, 'x');
    const object = ctx.scene.add(new SceneObject('Hero'));

    // No row of INSTANTIABLE claims it, so the same absence refuses it in the scene and here.
    assert.equal(instantiator(sound), null);
    assert.equal(canDrop(resourcePayload(sound), { zone: DropZone.COMPONENTS, object }).allowed, false);
    assert.equal(object.componentTypes().length, 0);
});

test('a folder is not a Component, whatever it is dropped on', () => {
    const ctx = context();
    const folder = ctx.project.addFolder({ name: 'Assets' });
    const object = ctx.scene.add(new SceneObject('Hero'));

    assert.equal(canDrop(resourcePayload(folder), { zone: DropZone.COMPONENTS, object }).allowed, false);
});

test('a row of the Inspector still wins over the panel behind it', () => {
    // The panel-wide zone must not shadow the more specific target: an image let go on
    // `source` assigns a picture rather than attaching a second Sprite. The two targets are
    // resolved by the Inspector (`zoneAt`), and both rules stay reachable from here.
    const ctx = context();
    const asset = imageIn(ctx.project);
    const object = ctx.scene.add(new SceneObject('Hero'));
    const sprite = object.addComponent(new Sprite());

    assert.equal(canDrop(resourcePayload(asset), { zone: DropZone.PROPERTY, component: sprite, prop: 'source' }).allowed, true);
    assert.equal(canDrop(resourcePayload(asset), { zone: DropZone.COMPONENTS, object }).allowed, false);
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

// --- an Object dropped on a property (ADR-0034 §3.5) --------------------------------------

/**
 * A Component holding one reference and one of every other shape, so what a property
 * DECLARES is the only thing that can decide whether it takes an Object.
 */
const Link = defineComponent({
    type: 'res_link',
    label: 'Link',
    properties: {
        target: { id: 'p_target', type: PropertyType.OBJECTREF, default: null },
        count: { id: 'p_count', type: PropertyType.NUMBER, default: 0 },
        label: { id: 'p_label', type: PropertyType.STRING, default: '' },
        armed: { id: 'p_armed', type: PropertyType.BOOLEAN, default: false }
    }
});

/** A scene holding a Hero carrying a Link, and a Player to point it at. */
function linked() {
    const ctx = context();
    ctx.scene.registry.register(Link);
    const hero = ctx.scene.add(new SceneObject('Hero'));
    const player = ctx.scene.add(new SceneObject('Player'));
    return { ...ctx, hero, player, link: hero.addComponent(new Link()) };
}

const propertyTarget = (link, prop) => ({
    zone: DropZone.PROPERTY,
    component: link,
    prop,
    label: prop
});

test('an Object carried out of the Hierarchy travels as an identity, never as a handle', () => {
    const it = linked();
    const payload = objectPayload(it.player);

    assert.equal(payload.kind, 'object');
    assert.equal(payload.id, it.player.id, 'the identity the drop will store');
    assert.equal(payload.name, 'Player', 'and a label, for the ghost to show');

    // THE POINT OF THE SHAPE: there is no Object in here, so no rule can write one into a
    // scene value however it is written (ADR-0034 §3.5, ADR-0036).
    for (const value of globalThis.Object.values(payload)) {
        assert.equal(typeof value === 'object' && value !== null, false,
            'the payload holds only plain values');
    }
});

test('a payload carrying no identity matches no rule at all', () => {
    const it = linked();
    const target = propertyTarget(it.link, 'target');

    // Not "allowed, then nothing happened": a drag with nothing in it is a drag no rule
    // knows, which is how the table already answers anything it has no row for.
    assert.equal(canDrop(objectPayload(null), target).allowed, false);
    assert.equal(ruleFor(objectPayload(null), target), null);
    assert.equal(performDrop(objectPayload(null), target, it), null);
    assert.equal(it.link.target, null, 'and nothing was written');
});

test('an Object deleted before the drop still assigns, and the reference reads as dead', () => {
    // A REFERENCE TO SOMETHING GONE IS A STATE OF THE SCENE, NOT A MALFORMED VALUE
    // (ADR-0034 §3.4). The value is kept and resolves to nothing; the Inspector shows that
    // in red. Refusing the drop here would be the D&D inventing a second opinion about it.
    const it = linked();
    const payload = objectPayload(it.player);
    it.scene.remove(it.player);

    const result = performDrop(payload, propertyTarget(it.link, 'target'), it);

    assert.equal(result.assigned, payload.id);
    assert.equal(it.link.target, payload.id, 'the identity was stored as it stands');
    assert.equal(it.scene.get(it.link.target), undefined, 'and it resolves to nothing');
});

test('an Object dropped on an objectref property assigns its identity', () => {
    const it = linked();
    const target = propertyTarget(it.link, 'target');

    assert.equal(acceptsObject(target), true);
    assert.equal(canDrop(objectPayload(it.player), target).allowed, true);

    const result = performDrop(objectPayload(it.player), target, it);

    assert.equal(result.assigned, it.player.id);
    assert.equal(it.link.target, it.player.id);
});

test('what is stored is the identity, and never the Object', () => {
    // The same contract ADR-0036 closed at the graph boundary, met at the other end: a
    // scene value holds an ObjectId, so a Proxy must not be able to arrive here either.
    const it = linked();
    performDrop(objectPayload(it.player), propertyTarget(it.link, 'target'), it);

    assert.equal(typeof it.link.target, 'string');
    assert.notEqual(it.link.target, it.player, 'the Object itself is not a value');
    assert.equal(it.scene.get(it.link.target), it.player, 'and the identity resolves back to it');
});

test('assigning an Object to a property is an Operation, so it undoes', () => {
    // THE POINT OF THE RULE WRITING THROUGH `setProperty()`. A drop is an authored intent,
    // so it takes the controlled path and produces an Operation like every other change the
    // Inspector makes (ADR-0024, CONVENTIONS.md).
    const it = linked();
    const seen = [];
    it.scene.operations.on('operation', operation => seen.push(operation));

    performDrop(objectPayload(it.player), propertyTarget(it.link, 'target'), it);

    assert.equal(seen.length, 1);
    assert.equal(seen[0].type, 'SET_PROPERTY');
    assert.equal(seen[0].prop, 'target');
    assert.equal(seen[0].value, it.player.id);
    assert.equal(seen[0].previous, null);
});

test('a property that does not declare a reference refuses the Object, and says so', () => {
    // THE DECLARED TYPE IS THE AUTHORITY. None of these holds an Object, whatever a string
    // could technically store — accepting one would be the Editor deciding what a schema
    // meant (ADR-0030 §1, one scope down).
    const it = linked();

    for (const prop of ['count', 'label', 'armed']) {
        const target = propertyTarget(it.link, prop);
        const before = it.link[prop];

        assert.equal(acceptsObject(target), false, `${prop} claims to hold a reference`);

        const verdict = canDrop(objectPayload(it.player), target);
        assert.equal(verdict.allowed, false, `${prop} accepted an Object`);
        assert.match(verdict.reason, /does not hold an Object reference/, `${prop} refused silently`);

        assert.equal(performDrop(objectPayload(it.player), target, it), null);
        assert.equal(it.link[prop], before, `${prop} was written anyway`);
    }
});

test('a property with nothing declared about it takes no Object', () => {
    const it = linked();

    assert.equal(acceptsObject({ zone: DropZone.PROPERTY, component: it.link, prop: 'nope' }), false);
    assert.equal(acceptsObject({ zone: DropZone.PROPERTY }), false);
});

test('a file dropped on a resource property still imports and assigns it', () => {
    // FILES → PROPERTY shares `assignReference()` with the two rules above, so it is worth
    // asserting here that renaming that writer changed nothing about it.
    const it = linked();
    const sprite = it.hero.addComponent(new Sprite());
    const target = { zone: DropZone.PROPERTY, component: sprite, prop: 'source', label: 'Source' };

    assert.equal(canDrop(filesPayload([file('hero.png')]), target).allowed, true);
    const result = performDrop(filesPayload([file('hero.png')]), target, it);

    assert.equal(sprite.source, result.assigned);
    assert.equal(it.project.get(sprite.source).name, 'hero.png');
});

test('the two kinds of reference do not accept each other', () => {
    // A resource property and an Object property are both references and neither is the
    // other: `acceptsResource` reads `resource`, `acceptsObject` reads `objectref`.
    const it = linked();
    const asset = imageIn(it.project);
    const sprite = it.hero.addComponent(new Sprite());

    assert.equal(canDrop(resourcePayload(asset), propertyTarget(it.link, 'target')).allowed, false,
        'a resource is not an Object');
    assert.equal(canDrop(objectPayload(it.player), propertyTarget(sprite, 'source')).allowed, false,
        'an Object is not a resource');
    assert.equal(it.link.target, null);
    assert.equal(sprite.source, null);
});

test('an Object dropped where no rule looks for one is refused without a sentence', () => {
    // The Hierarchy and the scene surface have no rule for an Object, so the gesture ends
    // as nothing rather than as a refusal about a property.
    const it = linked();

    assert.equal(canDrop(objectPayload(it.player), { zone: DropZone.HIERARCHY }).allowed, false);
    assert.equal(canDrop(objectPayload(it.player), { zone: DropZone.SCENE, x: 0, y: 0 }).allowed, false);
});

// --- a Component is not something a graph holds (ADR-0040 §2) ----------------------------
//
// IT USED TO BE. A Component dropped on a canvas made a half-node and a Component dropped on
// a node wrote a param — the param that named which type the property came from, back when
// reaching another Object's property was a different node. It is one node now, and that param
// is hidden: the picker writes it, and writes over anything a drop had put there. So the
// gesture wrote a value nothing could read before it was replaced.
//
// WHAT IS LEFT IS ONE MEANING PER DRAG, which is the whole of the vocabulary's promise: an
// Object is somewhere to act, a property is something to read or write, a resource is a
// value — and a Component is a thing you give to an Object. That last gesture is unchanged
// (`component-to-object`); what it never was is a thing to put in a graph.

/** The params a `Get Property` declares, as the canvas hands them to a rule. */
const GET_ON_PARAMS = registerStandardNodes(new NodeRegistry()).get('property.get').params;

/**
 * A GRAPH target over a node, exactly as `zoneAt()` builds one — `bound` included: a node
 * can only be under the pointer when a `.px` is open on the canvas.
 */
const nodeTarget = (params, node = { id: 'n1', type: 'property.get', params: {} }) =>
    ({ zone: DropZone.GRAPH, node, params, label: 'Get Property', bound: true, at: { x: 0, y: 0 } });

test('a node that names a property is a target; one that does not is not', () => {
    // Declared by the node type, never derived from its name.
    assert.equal(acceptsProperty(nodeTarget(GET_ON_PARAMS)), true);
    assert.equal(acceptsProperty(nodeTarget(registerStandardNodes(new NodeRegistry())
        .get('value.number').params)), false, 'a literal names no property');
    assert.equal(acceptsProperty(nodeTarget(null)), false, 'a node type nobody declares');
    assert.equal(acceptsProperty({ zone: DropZone.GRAPH, params: GET_ON_PARAMS }), false,
        'the canvas beside a node is not a node');
});

test('a Component is refused on a node too, and the refusal says where to go instead', () => {
    // THE THIRD REMOVAL, AND THE LAST (ADR-0047 §2). The gesture was refused, restored when
    // `Component` briefly had a field of its own, and refused again now that one picker asks
    // the whole question: writing `component` alone sets a value the creator cannot see and
    // the next click overwrites. A drop that produces a dead value is worse than no drop.
    const it = linked();
    const payload = componentPayload(it.hero, 'res_link', 'Link');

    const verdict = canDrop(payload, nodeTarget(GET_ON_PARAMS));
    assert.equal(verdict.allowed, false);
    // AND IT NAMES THE TWO WAYS THAT DO WORK, because a refusal with no route is a dead end
    // (ADR-0026 §6).
    assert.match(verdict.reason, /propert/i);
    assert.match(verdict.reason, /group/i, 'it says the Component is a heading in that list');
});

test('a Component on BARE canvas is still refused, because it would make an unfinished node', () => {
    // A drop makes a finished node or it does not happen (ADR-0039 §0.2). Which property is
    // precisely what a Component does not say, and guessing is the magic this editor refuses.
    const it = linked();
    const payload = componentPayload(it.hero, 'res_link', 'Link');
    const bare = { zone: DropZone.GRAPH, at: AT.at, bound: true };

    const verdict = canDrop(payload, bare);

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /Get or Set Property/, 'and it names the gesture that works');
    assert.equal(performDrop(payload, bare, { setNodeParam: () => assert.fail('wrote') }), null);
});

test('a Component on a node that names no Component is refused, with somewhere to go', () => {
    const it = linked();
    const payload = componentPayload(it.hero, 'res_link', 'Link');

    const verdict = canDrop(payload, nodeTarget({ value: { type: PropertyType.NUMBER } }));

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reason);
});

test('no scene identity can reach a .px through a graph drop', () => {
    // ADR-0034 invariant 1, checked on the gesture that carries an Object in its hand: what
    // a property drop writes is two project-scope identities and a socket NAME.
    const it = linked();
    const written = [];

    performDrop(propertyPayload('res_health', 'p_hp', 'hp', it.hero), nodeTarget(GET_ON_PARAMS), {
        setNodeParams: (node, params) => written.push(params)
    });

    assert.deepEqual(written, [{ component: 'res_health', property: 'p_hp' }]);
    assert.equal(JSON.stringify(written).includes(it.hero.id), false, 'no scene identity travelled');
});

test('a canvas with no writer takes nothing, whatever the rule would have done', () => {
    // The rule acts through the window; handed no seam, it performs nothing rather than
    // reaching for a model of its own.
    assert.equal(
        performDrop(propertyPayload('res_health', 'p_hp', 'hp'), nodeTarget(GET_ON_PARAMS), {}),
        null
    );
});

test('an Object dropped on the canvas declares a socket, and carries no identity into it', () => {
    // ADR-0037: the drop declares an `objectref` property and a node that reads it. What
    // reaches the rule is a NAME; the identity stays a value each instance carries.
    const it = linked();
    const declared = [];
    const target = { zone: DropZone.GRAPH, at: { x: 40, y: 10 }, bound: true };

    const verdict = canDrop(objectPayload(it.player), target);
    assert.equal(verdict.allowed, true);
    assert.match(verdict.reason, /Player/);

    performDrop(objectPayload(it.player), target, {
        declareReference: payload => declared.push(payload) && payload
    });

    assert.equal(declared.length, 1);
    assert.equal(declared[0].name, 'Player', 'the socket is named after the Object');
    assert.equal(declared[0].id, it.player.id, 'the identity travels the drag');
    // …and the rule hands it on rather than writing it: what the `.px` gains is decided by
    // the canvas, and asserted where that is testable (windows/graph.js).
});

test('the socket a drop declares is one gesture, and carries no scene identity', () => {
    // WHAT THE CANVAS DOES WITH WHAT THE RULE HANDS IT (windows/graph.js `#declareReference`),
    // asserted where the guarantee actually lives: the `.px` model. The property, the node
    // and the wire travel one pipeline under one batch (ADR-0027 §5), so the whole drop is
    // one `Ctrl Z` — and nothing of the Object but its NAME may end up in the file.
    const it = linked();
    const definition = new ComponentDefinition({ type: 'res_door', label: 'Door' });
    const history = new History(definition.operations);

    const batch = createId();
    const property = definition.addProperty(
        { name: it.player.name, type: PropertyType.OBJECTREF }, { batch }
    );
    definition.graph.addNode(
        { type: 'property.get', params: { property: property.id }, x: 40, y: 10 }, { batch }
    );

    assert.equal(definition.properties().length, 1);
    assert.equal(definition.graph.nodes().length, 1);

    const payload = JSON.stringify(definition.serialize());
    assert.equal(payload.includes(it.player.id), false, 'no ObjectId reaches the .px (ADR-0034 §1)');
    assert.match(payload, /"Player"/, 'only the name, and only as the name of a property');

    assert.equal(history.depth, 1, 'one drop, one entry');
    history.undo();
    assert.equal(definition.properties().length, 0, 'and the whole gesture goes back at once');
    assert.equal(definition.graph.nodes().length, 0);
});

test('a property carried off a component resolves back to what the node will name', () => {
    // THE ROUND TRIP A DROPPED PROPERTY MAKES. The Inspector's handle carries the id
    // `declaredProperties()` answers; the node stores it; `referencedComponentProperty()`
    // resolves it against the catalogue. Reading the NAME at the handle would work for a
    // shipped class — where id and name are the same word — and break for every Component a
    // creator writes, where the id is a mint a rename cannot invalidate (ADR-0027 §4).
    const it = linked();
    const catalogue = componentCatalogue(it.scene.registry);

    for (const type of ['Transform', 'Sprite']) {
        const declared = declaredProperties(it.scene.registry.get(type));
        assert.ok(declared.length > 0, type);

        for (const property of declared) {
            const payload = propertyPayload(type, property.id, property.name);
            const node = { type: 'property.get', params: { component: payload.component, property: payload.property } };

            assert.equal(referencedComponentProperty(node, { components: catalogue })?.name, property.name,
                `${type}.${property.name} did not resolve`);
        }
    }
});

test('an Object dropped where nothing declares sockets does nothing', () => {
    const it = linked();

    assert.equal(performDrop(objectPayload(it.player), { zone: DropZone.GRAPH, bound: true }, {}), null);
});

test('a canvas with no Component open takes nothing, and says which', () => {
    // NOT "allowed, then nothing happened". Every rule that would write into a `.px` asks
    // for one to be open; without it the canvas is still a zone — a drop is never met with
    // silence — but a zone that refuses, with the reason being about the canvas.
    const it = linked();
    const empty = { zone: DropZone.GRAPH, bound: false };

    for (const payload of [
        objectPayload(it.player),
        componentPayload(it.hero, 'res_link', 'Link'),
        propertyPayload('res_link', 'p_target', 'target')
    ]) {
        const verdict = canDrop(payload, empty);

        assert.equal(verdict.allowed, false);
        assert.match(verdict.reason, /no Component open/);
        assert.equal(ruleFor(payload, empty).id, 'drop-on-graph');
    }
});

// --- a Property carried out of the Inspector (ADR-0037) ----------------------------------

/** The params of a node that names a Component AND one of its properties. */
const GET_ON = registerStandardNodes(new NodeRegistry()).get('property.get').params;

test('a Property travels as two identities of project scope, and nothing of a scene', () => {
    const payload = propertyPayload('res_health', 'p_hp', 'hp');

    assert.equal(payload.kind, 'property');
    assert.equal(payload.component, 'res_health');
    assert.equal(payload.property, 'p_hp');
    assert.equal(payload.label, 'hp');

    // Nothing of the Object the Inspector happened to be showing travels with it.
    for (const value of globalThis.Object.values(payload)) {
        assert.equal(typeof value === 'object' && value !== null, false);
    }
});

test('a Property carried off a .px card names that .px, and the port takes its type', () => {
    // WHERE THE HANDLE LIVES, AND WHY IT LIVES THERE. A `.px` property is two identities of
    // PROJECT scope — the file's own type and the property's id — which is exactly what a
    // graph may name (ADR-0037 §2.3). Dropped on a node, the port takes the declared type
    // through the one resolution path, with no Object involved.
    const catalogue = [{
        type: 'res_health',
        label: 'Health',
        properties: [{ id: 'p_hp', name: 'hp', type: PropertyType.INT, default: 3 }]
    }];

    const payload = propertyPayload('res_health', 'p_hp', 'hp');
    const configured = {
        id: 'n', type: 'property.get',
        params: { component: payload.component, property: payload.property }
    };

    const port = portsOf(registerStandardNodes(new NodeRegistry()).get('property.get'),
        configured, { components: catalogue }).outputs.find(entry => entry.id === 'value');

    assert.equal(port.type, PropertyType.INT, 'the port takes the declared type at once');
});

test('a property of the .px being edited is stored as its own, not as a type', () => {
    // FOUND IN CHROME, NOT IN A TEST. Dragging a property off the `.px` you are editing
    // produced a node whose picker held a raw ResourceId and whose row was marked in error:
    // the payload names the type the property was DECLARED on, and for your own file that
    // is "this Component", which the Core stores as no type at all (ADR-0041 §2).
    const written = [];
    const target = nodeTarget(GET_ON_PARAMS);

    performDrop(propertyPayload('res_self', 'p_speed', 'speed'), target, {
        ownType: 'res_self',
        setNodeParams: (node, params) => written.push(params)
    });

    assert.deepEqual(written, [{ component: null, property: 'p_speed' }]);
});

test('a property of ANOTHER Component keeps naming that Component', () => {
    const written = [];

    performDrop(propertyPayload('res_health', 'p_hp', 'hp'), nodeTarget(GET_ON_PARAMS), {
        ownType: 'res_self',
        setNodeParams: (node, params) => written.push(params)
    });

    assert.deepEqual(written, [{ component: 'res_health', property: 'p_hp' }]);
});

test('the same normalisation happens on bare canvas, where the node is created', () => {
    const made = [];

    performDrop(propertyPayload('res_self', 'p_speed', 'speed'),
        { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true, create: 'property.get' },
        { ownType: 'res_self', createNode: (type, params) => made.push(params) });

    assert.deepEqual(made, [{ component: null, property: 'p_speed' }]);
});

test('a Property dropped on a compatible node configures both halves at once', () => {
    const target = nodeTarget(GET_ON);
    const written = [];

    assert.equal(canDrop(propertyPayload('res_health', 'p_hp', 'hp'), target).allowed, true);

    const result = performDrop(propertyPayload('res_health', 'p_hp', 'hp'), target, {
        setNodeParams: (node, params) => written.push([node.id, params])
    });

    assert.deepEqual(written, [['n1', { component: 'res_health', property: 'p_hp' }]]);
    assert.ok(result);
});

test('a Property dropped on a node that names no property is refused, with its reason', () => {
    const literal = registerStandardNodes(new NodeRegistry()).get('value.number').params;
    const target = nodeTarget(literal);
    const payload = propertyPayload('res_health', 'p_hp', 'hp');

    const verdict = canDrop(payload, target);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /does not name a property/);
    assert.equal(performDrop(payload, target, {}), null);
});

test('the node a Property lands on is the same node whether the property is its own', () => {
    // THE MERGE, SEEN FROM THE DRAG. `Get Property` used to name a property of its OWN
    // Component and refuse anything else; reaching another Object's took a second node, so
    // half the creator's drags were refused by the node that looked right (ADR-0040 §2).
    const own = registerStandardNodes(new NodeRegistry()).get('property.get').params;
    const written = [];

    assert.equal(canDrop(propertyPayload('res_health', 'p_hp', 'hp'), nodeTarget(own)).allowed, true);

    performDrop(propertyPayload(null, 'p_speed', 'speed'), nodeTarget(own), {
        setNodeParams: (node, params) => written.push(params)
    });

    // A property of this Component names no type, and the absence IS the answer: `component`
    // is written null rather than left over from whatever the node named before.
    assert.deepEqual(written, [{ component: null, property: 'p_speed' }]);
});

test('a Property on bare canvas creates nothing until the creator has chosen', () => {
    const at = { x: 30, y: 12 };
    const made = [];
    const context = { createNode: (type, params, where) => made.push([type, params, where]) };
    const payload = propertyPayload('res_health', 'p_hp', 'hp');

    assert.equal(canDrop(payload, { zone: DropZone.GRAPH, at, bound: true }).allowed, true);
    assert.equal(performDrop(payload, { zone: DropZone.GRAPH, at, bound: true }, context), null);
    assert.deepEqual(made, [], 'nothing was guessed');

    performDrop(payload, { zone: DropZone.GRAPH, at, bound: true, create: 'property.get' }, context);
    assert.deepEqual(made, [['property.get',
        { component: 'res_health', property: 'p_hp' }, at]]);
});

test('a Property dropped on a canvas with no Component open is refused', () => {
    const payload = propertyPayload('res_health', 'p_hp', 'hp');
    const verdict = canDrop(payload, { zone: DropZone.GRAPH, bound: false });

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /no Component open/);
});

test('the drags a canvas takes never answer for one another', () => {
    // One payload, one rule: no drag can be mistaken for another now that three of them
    // are accepted on the same zone.
    const it = linked();
    const bare = { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true };
    const onNode = nodeTarget(GET_ON);

    assert.equal(ruleFor(objectPayload(it.player), bare).id, 'object-to-graph');
    assert.equal(ruleFor(propertyPayload('res_link', 'p_target', 't'), bare).id, 'property-to-canvas');
    assert.equal(ruleFor(propertyPayload('res_link', 'p_target', 't'), onNode).id, 'property-to-node');
    // A COMPONENT MEANS NOTHING ON A GRAPH AT ALL, and the two places refuse it the same
    // way: what it names is a GROUP of properties, and a node needs one of them (ADR-0047 §2).
    assert.equal(ruleFor(componentPayload(it.hero, 'res_link', 'Link'), bare).id, 'drop-on-graph');
    assert.equal(ruleFor(componentPayload(it.hero, 'res_link', 'Link'), onNode).id, 'drop-on-graph');
    // AN OBJECT NOW MEANS TWO THINGS, AND THE PLACE DECIDES WHICH — the same rule the other
    // two drags already followed. On bare canvas it declares an input; on a node that acts on
    // an Object it points that node, which is configuration by direct manipulation and not a
    // second socket the creator did not ask for.
    assert.equal(ruleFor(objectPayload(it.player), onNode).id, 'object-to-node');
});

// --- one gesture builds a finished node (ADR-0040 §3, D+) ----------------------------------
//
// THE INSPECTOR KNEW THE OBJECT, THE COMPONENT AND THE PROPERTY. The drop used to write two
// of the three and leave a creator to drag the Object separately and pull a wire. It now
// declares (or reuses) the socket and aims the node at it.

/** The canvas seam, with a `.px` behind it, so a drop can be watched end to end. */
function canvas() {
    // WITH THE CATALOGUE BEHIND IT, so `portsOf()` answers what the canvas would draw rather
    // than the empty shape a definition with no registry falls back to.
    const definition = new ComponentDefinition({ type: 'res_door', label: 'Door' }, {
        registry: registerStandardNodes(new NodeRegistry()),
        components: () => [{
            type: 'Transform',
            label: 'Transform',
            properties: [{ id: 'rotation', name: 'rotation', type: 'number' }]
        }]
    });
    const made = [];

    return {
        definition,
        made,
        context: {
            socketFor: (object, { batch } = {}) => {
                const name = object?.name || 'Object';
                const existing = definition.properties()
                    .find(property => property.type === PropertyType.OBJECTREF && property.name === name);
                return existing ?? definition.addProperty({ name, type: PropertyType.OBJECTREF }, { batch });
            },
            createNode: (type, params, at, options) => {
                const node = definition.graph.addNode({ type, params, x: at.x, y: at.y }, options);
                made.push(node);
                return node;
            }
        }
    };
}

const AT = { zone: DropZone.GRAPH, at: { x: 20, y: 30 }, bound: true };

test('dropping a property declares the socket AND aims the node at it', () => {
    const it = linked();
    const board = canvas();
    const payload = propertyPayload('Transform', 'rotation', 'Rotation', it.player);

    performDrop(payload, { ...AT, create: 'property.set' }, board.context);

    const [socket] = board.definition.properties();
    assert.equal(socket.name, 'Player', 'named after the Object the Inspector was showing');
    assert.equal(socket.type, PropertyType.OBJECTREF);

    const [node] = board.made;
    assert.deepEqual(node.params, { target: socket.id, component: 'Transform', property: 'rotation' });
});

test('the aimed node still offers its Object socket, so a wire can override it later', () => {
    // POINTING IS NOT A MODE. The drop fills the picker; the socket stays exactly where it
    // was, so a creator who later wants `Find By Tag` connects it and the connection wins —
    // without ever having been asked to choose between two ways of targeting.
    const it = linked();
    const board = canvas();

    performDrop(propertyPayload('Transform', 'rotation', 'Rotation', it.player),
        { ...AT, create: 'property.set' }, board.context);

    const ports = board.definition.graph.portsOf(board.made[0]);
    assert.equal(ports.inputs.some(port => port.id === 'object'), true);
    assert.ok(board.made[0].params.target, 'and the picker names the Object that was dragged');
});

test('the ObjectId travels the drag and lands nowhere', () => {
    // ADR-0034 invariant 1, at the one place the gesture could break it: the payload carries
    // the identity so the drop can name the socket, and only the NAME is written.
    const it = linked();
    const board = canvas();
    const payload = propertyPayload('Transform', 'rotation', 'Rotation', it.player);

    assert.equal(payload.object.id, it.player.id, 'the drag knows which Object');
    performDrop(payload, { ...AT, create: 'property.get' }, board.context);

    const written = JSON.stringify(board.definition.serialize());
    assert.equal(written.includes(it.player.id), false, 'and the file holds no ObjectId');
    assert.match(written, /"Player"/, 'only a socket named after it');
});

test('two properties of one Object share its socket rather than declaring two', () => {
    // A PROPERTY DROP ASKS FOR A PROPERTY, NOT FOR AN INPUT. Dropping the Object itself IS
    // the gesture "declare an input", and two of those still declare two (ADR-0037); here the
    // socket is a means, and three properties of Player must not leave three sockets for a
    // creator to fill in three times.
    const it = linked();
    const board = canvas();

    performDrop(propertyPayload('Transform', 'rotation', 'Rotation', it.player),
        { ...AT, create: 'property.get' }, board.context);
    performDrop(propertyPayload('Transform', 'x', 'X', it.player),
        { ...AT, create: 'property.set' }, board.context);

    assert.deepEqual(board.definition.properties().map(property => property.name), ['Player']);
    assert.equal(board.made[0].params.target, board.made[1].params.target);
});

test('the socket and the node are one undo entry', () => {
    const it = linked();
    const board = canvas();
    const history = new History(board.definition.operations);

    performDrop(propertyPayload('Transform', 'rotation', 'Rotation', it.player),
        { ...AT, create: 'property.set' }, board.context);

    assert.equal(board.definition.properties().length, 1);
    assert.equal(board.definition.graph.nodes().length, 1);
    assert.equal(history.depth, 1, 'one drop, one entry');

    history.undo();
    assert.equal(board.definition.properties().length, 0, 'and the whole gesture goes back');
    assert.equal(board.definition.graph.nodes().length, 0);
});

test('a Component dropped the same way builds nothing, and declares no socket either', () => {
    // A refused drop is inert all the way down: no node, and no property left behind in the
    // `.px` by a gesture that did not complete.
    const it = linked();
    const board = canvas();

    performDrop(componentPayload(it.player, 'Transform', 'Transform'),
        { ...AT, create: 'property.get' }, board.context);

    assert.deepEqual(board.made, []);
    assert.deepEqual(board.definition.properties(), []);
});

test('a property carried with no Object still works, and leaves the target on the wire', () => {
    // The `.px` Inspector drags a property of a Component TYPE, with no instance in sight.
    const board = canvas();

    performDrop(propertyPayload('Transform', 'rotation', 'Rotation'),
        { ...AT, create: 'property.set' }, board.context);

    assert.deepEqual(board.definition.properties(), []);
    assert.deepEqual(board.made[0].params, { component: 'Transform', property: 'rotation' });
    assert.equal(
        board.definition.graph.portsOf(board.made[0]).inputs.some(port => port.id === 'object'),
        true,
        'no Object to aim at, so the wire is what says where the target comes from'
    );
});

test('an Object let go on a node points that node at it', () => {
    // §11: configuration by direct manipulation. The same sentence as every other drop onto
    // a node — a drop configures, it never creates.
    const it = linked();
    const board = canvas();
    const params = registerStandardNodes(new NodeRegistry()).get('property.set').params;
    const node = board.definition.graph.addNode({
        type: 'property.set', x: 0, y: 0, params: { component: 'Transform', property: 'rotation' }
    });
    const written = [];

    const target = { ...AT, node, params, label: 'Set Property' };
    assert.equal(canDrop(objectPayload(it.player), target).allowed, true);

    performDrop(objectPayload(it.player), target, {
        ...board.context,
        setNodeParam: (record, name, value) => written.push([name, value])
    });

    const [socket] = board.definition.properties();
    assert.equal(socket.name, 'Player');
    assert.deepEqual(written, [['target', socket.id]]);
    assert.equal(board.made.length, 0, 'and nothing was created');
});

test('an Object let go on a node that acts on none is refused with its reason', () => {
    const it = linked();
    const params = registerStandardNodes(new NodeRegistry()).get('value.number').params;
    const verdict = canDrop(objectPayload(it.player),
        { ...AT, node: { id: 'n', type: 'value.number', params: {} }, params, label: 'Number' });

    assert.equal(verdict.allowed, false);
    assert.ok(verdict.reason.length > 0);
});

test('the ghost names what the drop will build', () => {
    const it = linked();
    const payload = propertyPayload('Transform', 'rotation', 'Rotation', it.player);

    assert.match(canDrop(payload, AT).reason, /Player\.Rotation/);
    assert.match(canDrop(propertyPayload('Transform', 'rotation', 'Rotation'), AT).reason, /Rotation/);
});

// --- a file from outside, straight into a graph (ADR-0041 §6) ----------------------------

test('a file dropped on bare canvas becomes a project resource AND a node holding it', () => {
    const it = linked();
    const made = [];
    const context = {
        project: it.project,
        createNode: (type, params, at, options) => (made.push({ type, params, at, options }), { id: 'n1' })
    };

    const result = performDrop(filesPayload([file('hero.png')]),
        { zone: DropZone.GRAPH, at: { x: 4, y: 6 }, bound: true }, context);

    assert.equal(result.imported.length, 1, 'the file became a resource of the project');
    assert.equal(made[0].type, 'value.resource');
    assert.equal(made[0].params.value, result.imported[0].id, 'and the node points at THAT resource');
    assert.ok(made[0].options.batch, 'import and node are one undo entry');
});

test('a file dropped on a Resource node imports it and points the node at it', () => {
    const it = linked();
    const written = [];
    const target = {
        zone: DropZone.GRAPH,
        node: { id: 'n1' },
        params: registerStandardNodes(new NodeRegistry()).get('value.resource').params,
        label: 'Resource',
        bound: true
    };

    const result = performDrop(filesPayload([file('hero.png')]), target, {
        project: it.project,
        setNodeParam: (node, name, value, options) => written.push({ name, value, options })
    });

    assert.equal(result.imported.length, 1);
    assert.deepEqual(written.map(entry => entry.name), ['value']);
    assert.equal(written[0].value, result.imported[0].id);
    assert.ok(written[0].options.batch, 'one gesture, one undo entry');
});

test('a resource already in the project is referenced, never imported again', () => {
    // THE THREE CASES ARE TOLD APART BY THE DRAG, not by comparing content. A resource that
    // exists arrives as a RESOURCE drag and no import can happen on that path at all.
    const it = linked();
    const asset = imageIn(it.project);
    const before = it.project.resources().length;
    const made = [];

    performDrop(resourcePayload(asset), { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true },
        { project: it.project, createNode: (type, params) => made.push({ type, params }) });

    assert.equal(it.project.resources().length, before, 'nothing was duplicated');
    assert.equal(made[0].params.value, asset.id, 'the node points at the resource that existed');
});

// --- the graph canvas answers, and its answer is no (ADR-0034 §3.7) ----------------------

test('the graph canvas is a drop zone of the vocabulary, like every other surface', () => {
    assert.equal(typeof DropZone.GRAPH, 'string');
    assert.equal(new globalThis.Set(globalThis.Object.values(DropZone)).size,
        globalThis.Object.values(DropZone).length, 'no two zones share a name');
});

test('the drags a canvas has a meaning for are taken; the others are refused with a reason', () => {
    // ADR-0037 lifted three of the five refusals; a resource is the fourth, because the rule
    // that refused it was never about resources — see `resource-to-canvas`. What is left is
    // files, which belong to the Project panel, and it still answers with its own sentence.
    const it = linked();
    const asset = imageIn(it.project);
    const target = { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true };

    assert.equal(canDrop(objectPayload(it.player), target).allowed, true, 'an Object declares a socket');
    assert.equal(canDrop(propertyPayload('res_link', 'p_target', 'target'), target).allowed, true);
    assert.equal(canDrop(resourcePayload(asset), target).allowed, true, 'a resource is a value');

    assert.equal(canDrop(componentPayload(it.hero, 'res_link', 'Link'), target).allowed, false);
    // A FILE IS TAKEN NOW TOO, and it is the fifth: it becomes a resource of the project
    // and a node holding it, in one gesture (ADR-0041 §6).
    assert.equal(canDrop(filesPayload([file('hero.png')]), target).allowed, true);
    assert.equal(ruleFor(filesPayload([file('hero.png')]), target).id, 'files-to-canvas');
});

// --- a resource is a value a graph may hold ------------------------------------------------

test('a resource dropped on bare canvas becomes a value node holding its identity', () => {
    const it = linked();
    const asset = imageIn(it.project);
    const made = [];
    const target = { zone: DropZone.GRAPH, at: { x: 20, y: 30 }, bound: true };

    const verdict = canDrop(resourcePayload(asset), target);
    assert.equal(verdict.allowed, true);
    assert.match(verdict.reason, /hero\.png/, 'the ghost names what it would add');

    performDrop(resourcePayload(asset), target, {
        createNode: (type, params, at) => made.push([type, params, at])
    });

    assert.deepEqual(made, [['value.resource', { value: asset.id }, { x: 20, y: 30 }]]);
});

test('what the node holds is the ResourceId, which is of project scope like the .px', () => {
    // THE DISTINCTION THAT MAKES THIS LEGAL. ADR-0034 keeps an ObjectId out of a `.px`
    // because it names something in ONE scene while a `.px` serves many. A ResourceId names
    // something in the PROJECT — the `.px`'s own scope (ADR-0020) — so it may be written.
    const it = linked();
    const asset = imageIn(it.project);
    let written = null;

    performDrop(resourcePayload(asset), { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true }, {
        createNode: (type, params) => { written = params; }
    });

    assert.equal(written.value, asset.id);
    assert.equal(it.project.get(written.value).name, 'hero.png', 'and it resolves in the project');
});

test('a folder is not a value, and the canvas says so', () => {
    const it = linked();
    const folder = it.project.addFolder({ name: 'Sprites' });
    const target = { zone: DropZone.GRAPH, at: { x: 0, y: 0 }, bound: true };

    const verdict = canDrop(resourcePayload(folder), target);
    assert.equal(verdict.allowed, false);
    assert.equal(ruleFor(resourcePayload(folder), target).id, 'drop-on-graph');
});

test('a resource let go on a node that holds one configures it rather than creating', () => {
    const it = linked();
    const asset = imageIn(it.project);
    const params = registerStandardNodes(new NodeRegistry()).get('value.resource').params;
    const node = { id: 'n1', type: 'value.resource', params: {} };
    const written = [];

    const target = { zone: DropZone.GRAPH, node, params, label: 'Resource', bound: true, at: { x: 0, y: 0 } };
    assert.equal(canDrop(resourcePayload(asset), target).allowed, true);

    performDrop(resourcePayload(asset), target, {
        setNodeParam: (target_, name, value) => written.push([target_.id, name, value]),
        createNode: () => assert.fail('a drop on a node configures; it never creates')
    });

    assert.deepEqual(written, [['n1', 'value', asset.id]]);
});

test('a resource on a node that holds no resource is refused with its reason', () => {
    const it = linked();
    const asset = imageIn(it.project);
    const params = registerStandardNodes(new NodeRegistry()).get('value.number').params;
    const node = { id: 'n1', type: 'value.number', params: {} };

    const verdict = canDrop(resourcePayload(asset),
        { zone: DropZone.GRAPH, node, params, label: 'Number', bound: true, at: { x: 0, y: 0 } });

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /does not hold a resource/);
});

test('the value a Resource node produces is one a resource property can take', () => {
    // WHAT THE NODE IS FOR: `Sprite.source` declares `type: 'resource'`, so `Set Property`
    // types its value port from that declaration — and the two ends now meet.
    const registry = registerStandardNodes(new NodeRegistry());
    const produced = portsOf(registry.get('value.resource'), { type: 'value.resource', params: {} }, {})
        .outputs[0];

    assert.equal(produced.type, PropertyType.RESOURCE);
    assert.equal(typesCompatible(produced.type, portTypeOf(Sprite.schema.source)), true);
});

test('each family a canvas refuses says something different', () => {
    // THE POINT OF THE TRANCHE: not that these are refused — they already were, by no rule
    // matching — but that each refusal is now a sentence a creator can read. A target no
    // rule mentions answers `null`, and a silent refusal is the worst answer to a gesture
    // (ADR-0026 §6).
    const it = linked();
    const asset = imageIn(it.project);
    const target = { zone: DropZone.GRAPH };

    const carried = {
        [DragKind.RESOURCE]: resourcePayload(asset),
        [DragKind.FILES]: filesPayload([file('hero.png')])
    };

    const seen = new globalThis.Set();
    for (const [kind, payload] of globalThis.Object.entries(carried)) {
        const verdict = canDrop(payload, target);

        assert.equal(verdict.allowed, false, `${kind} was accepted on the canvas`);
        assert.equal(typeof verdict.reason, 'string', `${kind} was refused in silence`);
        assert.ok(verdict.reason.length > 0, `${kind} was refused with an empty sentence`);
        assert.equal(ruleFor(payload, target).id, 'drop-on-graph', `${kind} met another rule`);

        assert.equal(seen.has(verdict.reason), false, `${kind} reuses another kind's reason`);
        seen.add(verdict.reason);
    }
});

test('a drag the vocabulary does not know is still answered on the canvas', () => {
    const verdict = canDrop({ kind: 'something-new' }, { zone: DropZone.GRAPH });

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /cannot be dropped on a graph/);
});

test('a refused canvas drop mutates nothing', () => {
    const it = linked();
    const asset = imageIn(it.project);
    const before = {
        objects: it.scene.objects().length,
        resources: it.project.resources().length,
        target: it.link.target
    };

    for (const payload of [
        objectPayload(it.player),
        componentPayload(it.hero, 'res_link'),
        resourcePayload(asset),
        filesPayload([file('hero.png')])
    ]) {
        assert.equal(performDrop(payload, { zone: DropZone.GRAPH }, it), null);
    }

    assert.equal(it.scene.objects().length, before.objects, 'the scene gained an object');
    assert.equal(it.project.resources().length, before.resources, 'the project gained a resource');
    assert.equal(it.link.target, before.target, 'a property was written');
});

test('one rule answers for the canvas, and it is the last word on it', () => {
    // A gesture accepted on the canvas later is declared ABOVE this one; what must be true
    // today is that exactly one rule speaks for the zone, so the answer cannot depend on
    // which of two happened to be written first.
    const forGraph = RULES.filter(rule => rule.accepts({ kind: 'anything' }, { zone: DropZone.GRAPH }));

    assert.deepEqual(forGraph.map(rule => rule.id), ['drop-on-graph']);
});

test('declaring the canvas zone left every other zone answering as it did', () => {
    // The zones a payload could reach on its way to the canvas, each still answered by its
    // own rule rather than by the new floor.
    const it = linked();
    const asset = imageIn(it.project);
    const sprite = it.hero.addComponent(new Sprite());

    assert.equal(ruleFor(resourcePayload(asset), { zone: DropZone.PROPERTY, component: sprite, prop: 'source' }).id,
        'resource-to-property');
    assert.equal(ruleFor(objectPayload(it.player), { zone: DropZone.PROPERTY, component: it.link, prop: 'target' }).id,
        'object-to-property');
    assert.equal(ruleFor(filesPayload([file()]), { zone: DropZone.PROPERTY, component: sprite, prop: 'source' }).id,
        'files-to-property');
    assert.equal(ruleFor(resourcePayload(asset), { zone: DropZone.SCENE }).id, 'resource-to-scene');
    assert.equal(ruleFor(objectPayload(it.player), { zone: DropZone.PROJECT, parent: null, project: it.project }).id,
        'object-to-project');
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

// --- a file straight onto an object's component list (ADR-0043 §5) -----------------------

test('a file dropped on an object imports it and attaches what shows it', () => {
    // THE SQUARE OF THE MATRIX THAT WAS EMPTY FOR NO REASON. A resource already in the
    // project attached a Sprite; the same picture dragged in from the desktop did nothing,
    // so a creator had to import it, find it, and drag it again.
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));

    const result = performDrop(
        filesPayload([file('hero.png')]),
        { zone: DropZone.COMPONENTS, object },
        attaching(ctx)
    );

    const sprite = object.getComponent('Sprite');
    assert.ok(sprite, 'the Component that shows an image is attached');
    assert.equal(sprite.source, result.imported[0].id, 'and pointed at what was imported');
    assert.ok(sprite.width > 0 && sprite.height > 0, 'and it is visible');
    assert.equal(ctx.project.resources(ResourceKind.ASSET).length, 1, 'exactly one import');
});

test('a file the object already has a Component for is refused before anything is imported', () => {
    // A REFUSAL THAT LEAVES A STRAY RESOURCE BEHIND IS NOT A REFUSAL. The verdict is reached
    // from the FILE, so nothing has been created by the time it is given.
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));
    addComponent(object, 'Sprite', ctx.scene.registry);

    const verdict = canDrop(filesPayload([file('hero.png')]), { zone: DropZone.COMPONENTS, object });

    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /already has a Sprite/);
    assert.equal(ctx.project.resources(ResourceKind.ASSET).length, 0, 'and nothing was imported');
});

test('a file nothing consumes is not attachable, and nothing is imported trying', () => {
    // The same absence that refuses a SOUND already in the project refuses one from the
    // desktop, and it is reached from the file rather than from a resource — so the refusal
    // costs the project nothing. (The components list states no sentence for a refusal yet;
    // that is the panel's gap, not this row's, and it is the same for a resource.)
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));

    const verdict = canDrop(
        filesPayload([{ name: 'song.mp3', mime: 'audio/mpeg', payload: 'data:audio/mpeg;base64,AA' }]),
        { zone: DropZone.COMPONENTS, object }
    );

    assert.equal(verdict.allowed, false);
    assert.equal(ctx.project.resources(ResourceKind.ASSET).length, 0);
    assert.equal(object.componentTypes().length, 0);
});

test('only the first file is taken, because one Component shows one resource', () => {
    const ctx = context();
    const object = ctx.scene.add(new SceneObject('Hero'));

    performDrop(
        filesPayload([file('hero.png'), file('villain.png')]),
        { zone: DropZone.COMPONENTS, object },
        attaching(ctx)
    );

    assert.equal(ctx.project.resources(ResourceKind.ASSET).length, 1,
        'the rest are not imported and then silently lost');
});
