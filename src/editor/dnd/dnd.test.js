// What a drop means, and what it refuses (ADR-0026).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    NodeRegistry,
    registerStandardNodes,
    Object as SceneObject,
    PropertyType,
    Scene,
    Transform,
    defineComponent
} from '../../core/mod.js';
import { Project, ResourceKind } from '../../project/mod.js';
import { Sprite, RectangleRenderer } from '../../runtime/mod.js';
import { Workspace } from '../project/workspace.js';
import { registerBuiltIns } from '../registry.js';
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
    acceptsComponent,
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

// --- a Component dropped on a node configures it (ADR-0034 §3.2) -------------------------
//
// A DROP CONFIGURES; IT NEVER CREATES. What ADR-0027 §11 refuses is a drop that would have
// to choose Get or Set for the creator; landing on a node they already placed carries no
// such choice. What ADR-0034 §3.2 allows is naming a Component by its TYPE in a param —
// project scope, in a `.px` of project scope — which is exactly what is written.

/** The params a `Get Property On` declares, as the canvas hands them to a rule. */
const GET_ON_PARAMS = registerStandardNodes(new NodeRegistry()).get('property.getOn').params;

const nodeTarget = (params, node = { id: 'n1', type: 'property.getOn', params: {} }) =>
    ({ zone: DropZone.GRAPH, node, params, label: 'Get Property On' });

test('a node that names a Component type is a target; one that does not is not', () => {
    // Declared by the node type, never derived from its name.
    assert.equal(acceptsComponent(nodeTarget(GET_ON_PARAMS)), true);
    assert.equal(acceptsComponent(nodeTarget(registerStandardNodes(new NodeRegistry())
        .get('value.number').params)), false, 'a literal names no Component');
    assert.equal(acceptsComponent(nodeTarget(null)), false, 'a node type nobody declares');
    assert.equal(acceptsComponent({ zone: DropZone.GRAPH, params: GET_ON_PARAMS }), false,
        'the canvas beside a node is not a node');
});

test('a Component dropped on a Get Property On node sets its Component param', () => {
    const it = linked();
    const written = [];
    const target = nodeTarget(GET_ON_PARAMS);

    const verdict = canDrop(componentPayload(it.hero, 'res_link', 'Link'), target);
    assert.equal(verdict.allowed, true);
    assert.match(verdict.reason, /Link/, 'the ghost says what it would do');

    const result = performDrop(componentPayload(it.hero, 'res_link', 'Link'), target, {
        setNodeParam: (node, name, value) => written.push([node.id, name, value])
    });

    assert.deepEqual(written, [['n1', 'component', 'res_link']]);
    assert.equal(result.component, 'res_link');
});

test('what is written is the project-scope TYPE, never the Object it was read off', () => {
    // ADR-0034 §3.2: a Component is named by its type. The Object the Inspector was showing
    // is of SCENE scope and must not reach a `.px` — the rule never looks at it.
    const it = linked();
    const written = [];

    performDrop(componentPayload(it.hero, 'res_link', 'Link'), nodeTarget(GET_ON_PARAMS), {
        setNodeParam: (node, name, value) => written.push(value)
    });

    assert.deepEqual(written, ['res_link']);
    assert.equal(written[0].includes(it.hero.id), false, 'no scene identity travelled');
});

test('a Component dropped on a node that names none is refused with its reason', () => {
    const it = linked();
    const payload = componentPayload(it.hero, 'res_link', 'Link');
    const target = nodeTarget(registerStandardNodes(new NodeRegistry()).get('value.number').params);

    const verdict = canDrop(payload, target);
    assert.equal(verdict.allowed, false);
    assert.match(verdict.reason, /does not name a Component/);
    assert.equal(performDrop(payload, target, {}), null);
});

test('on bare canvas a Component creates nothing until the creator has chosen', () => {
    // ADR-0027 §11 as amended by ADR-0037: the choice is explicit and local to the gesture.
    // Until the menu has answered, `create` is absent and the rule performs nothing.
    const it = linked();
    const payload = componentPayload(it.hero, 'res_link', 'Link');
    const at = { x: 12, y: 8 };
    const made = [];
    const context = { createNode: (type, params, where) => made.push([type, params, where]) };

    assert.equal(canDrop(payload, { zone: DropZone.GRAPH, at }).allowed, true);
    assert.equal(performDrop(payload, { zone: DropZone.GRAPH, at }, context), null);
    assert.deepEqual(made, [], 'nothing was guessed');

    performDrop(payload, { zone: DropZone.GRAPH, at, create: 'property.setOn' }, context);
    assert.deepEqual(made, [['property.setOn', { component: 'res_link' }, at]]);
});

test('a canvas with no writer takes nothing, whatever the rule would have done', () => {
    // The rule acts through the window; handed no seam, it performs nothing rather than
    // reaching for a model of its own.
    const it = linked();

    assert.equal(
        performDrop(componentPayload(it.hero, 'res_link', 'Link'), nodeTarget(GET_ON_PARAMS), {}),
        null
    );
});

test('an Object dropped on the canvas declares a socket, and carries no identity into it', () => {
    // ADR-0037: the drop declares an `objectref` property and a node that reads it. What
    // reaches the rule is a NAME; the identity stays a value each instance carries.
    const it = linked();
    const declared = [];
    const target = { zone: DropZone.GRAPH, at: { x: 40, y: 10 } };

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

test('an Object dropped where nothing declares sockets does nothing', () => {
    const it = linked();

    assert.equal(performDrop(objectPayload(it.player), { zone: DropZone.GRAPH }, {}), null);
});

// --- the graph canvas answers, and its answer is no (ADR-0034 §3.7) ----------------------

test('the graph canvas is a drop zone of the vocabulary, like every other surface', () => {
    assert.equal(typeof DropZone.GRAPH, 'string');
    assert.equal(new globalThis.Set(globalThis.Object.values(DropZone)).size,
        globalThis.Object.values(DropZone).length, 'no two zones share a name');
});

test('the drags a canvas has a meaning for are taken; the others are refused with a reason', () => {
    // ADR-0037 lifted three of the five refusals. The two that remain are the ones nothing
    // has decided a meaning for, and each still answers with its own sentence.
    const it = linked();
    const asset = imageIn(it.project);
    const target = { zone: DropZone.GRAPH, at: { x: 0, y: 0 } };

    assert.equal(canDrop(objectPayload(it.player), target).allowed, true, 'an Object declares a socket');
    assert.equal(canDrop(componentPayload(it.hero, 'res_link', 'Link'), target).allowed, true);
    assert.equal(canDrop(propertyPayload('res_link', 'p_target', 'target'), target).allowed, true);

    for (const payload of [resourcePayload(asset), filesPayload([file('hero.png')])]) {
        const verdict = canDrop(payload, target);
        assert.equal(verdict.allowed, false);
        assert.equal(ruleFor(payload, target).id, 'drop-on-graph');
        assert.ok(verdict.reason.length > 0);
    }
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
