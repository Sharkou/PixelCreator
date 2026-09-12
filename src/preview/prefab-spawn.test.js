// Spawning from a prefab inside a running simulation (ADR-0061).
//
// THE CLAIM UNDER TEST IS NOT "a prefab can be instantiated" — `core/prefab.test.js` proves
// that. It is that a SIMULATION STEP can do it: synchronously, deterministically, with no
// storage reached and with no model hiding in the scene. The counter-proofs are the point —
// a scene that still contains its models, an interpreter that had to wait, two runs of one
// seed that disagree.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    ResourceRegistry,
    Scene,
    Transform,
    createPrefab,
    defineComponent,
    deserializeScene,
    hierarchyOrder,
    registerStandardNodes,
    serializeScene
} from '../core/mod.js';
import { Project, MemoryResourceStore, ResourceKind, addPrefab, addScene, loadDefinitions, loadScene } from '../project/mod.js';
import { bundleProject, openBundle } from './bundle.js';
import { Behaviors } from '../runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../runtime/builtins.js';
import { Clock } from '../runtime/clock/clock.js';
import { Runtime } from '../runtime/runtime.js';
import { RectangleRenderer } from '../runtime/rendering/components/rectangle-renderer.js';

const nodes = registerStandardNodes(new NodeRegistry());

const PROPERTIES = {
    model: { id: 'p_model', name: 'model', type: 'resource', default: null },
    spawnedX: { id: 'p_x', name: 'spawnedX', type: 'number', default: 0 }
};

/** `On Start → Spawn Prefab → Set Position(spawned)`. */
const SPAWN_THEN_PLACE = {
    version: 1,
    nodes: [
        { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
        { id: 'n2', type: 'scene.spawnPrefab', params: { prefab: 'res_bullet' }, x: 0, y: 0 },
        { id: 'n3', type: 'transform.setPosition', params: {}, x: 0, y: 0 },
        { id: 'n4', type: 'value.number', params: { value: 120 }, x: 0, y: 0 },
        { id: 'n5', type: 'value.number', params: { value: 60 }, x: 0, y: 0 }
    ],
    connections: [
        { from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
        { from: { node: 'n2', port: 'out' }, to: { node: 'n3', port: 'in' } },
        { from: { node: 'n2', port: 'spawned' }, to: { node: 'n3', port: 'object' } },
        { from: { node: 'n4', port: 'value' }, to: { node: 'n3', port: 'x' } },
        { from: { node: 'n5', port: 'value' }, to: { node: 'n3', port: 'y' } }
    ]
};

/** A bullet with a trail under it, authored once and then taken out of the scene. */
function bulletDefinition() {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Authoring', { registry });

    const bullet = scene.add(new SceneObject('Bullet', { id: 'obj_model', tag: 'bullet' }));
    bullet.addComponent(new Transform(0, 0));
    bullet.addComponent(new RectangleRenderer(8, 8, '#ffd166'));

    const trail = scene.add(new SceneObject('Trail', { id: 'obj_model_trail' }));
    trail.addComponent(new Transform(0, 6));
    bullet.addChild(trail);

    return createPrefab(bullet, { scene }).definition;
}

/**
 * A world running one `.px`, with a prefab registry and no model in the scene.
 *
 * @param {object} graph - The graph payload
 * @param {object} [options] - `{ seed, prefabs }`
 * @returns {object} `{ scene, runtime, prefabs }`
 */
function world(graph, { seed = 'alpha', prefabs = null } = {}) {
    const payload = { type: 'res_ctl', label: 'Spawner', properties: PROPERTIES, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    behaviors.bind(Component, graph);

    const types = registerBuiltIns(new ComponentRegistry());
    types.register(Component);

    const scene = new Scene('Level', { id: 'scene_fixed', registry: types });
    const spawner = scene.add(new SceneObject('Spawner', { id: 'obj_spawner' }));
    spawner.addComponent(new Transform());
    spawner.addComponent(new Component());

    const table = prefabs ?? new ResourceRegistry();
    if (!prefabs) table.set('res_bullet', bulletDefinition());

    return {
        scene,
        prefabs: table,
        runtime: new Runtime(scene, { behaviors, resources: table, clock: new Clock(), seed })
    };
}

// --- the scene holds no model ----------------------------------------------------------

test('a prefab is spawned from a scene that has never contained it', () => {
    const it = world(SPAWN_THEN_PLACE);
    assert.deepEqual(hierarchyOrder(it.scene).map(object => object.name), ['Spawner']);

    it.runtime.step();

    const names = hierarchyOrder(it.scene).map(object => object.name);
    assert.deepEqual(names, ['Spawner', 'Bullet', 'Trail']);
});

test('no identity of the model reaches the scene', () => {
    const it = world(SPAWN_THEN_PLACE);
    it.runtime.step();

    const ids = hierarchyOrder(it.scene).map(object => object.id);
    assert.equal(ids.includes('obj_model'), false);
    assert.equal(ids.includes('obj_model_trail'), false);
    assert.equal(new globalThis.Set(ids).size, ids.length);
});

test('the instance comes out of the node, so the very next node can place it', () => {
    // LOT M, AS A TEST: composition is the answer, and `Spawn Prefab` needs no X and no Y.
    const it = world(SPAWN_THEN_PLACE);
    it.runtime.step();

    const bullet = hierarchyOrder(it.scene).find(object => object.name === 'Bullet');
    assert.equal(bullet.getComponent('Transform').x, 120);
    assert.equal(bullet.getComponent('Transform').y, 60);
    // And the child kept its LOCAL transform, which is what a subtree means.
    assert.equal(bullet.children[0].getComponent('Transform').y, 6);
});

test('several spawns are several independent instances', () => {
    const graph = {
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.update', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'scene.spawnPrefab', params: { prefab: 'res_bullet' }, x: 0, y: 0 }
        ],
        connections: [{ from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } }]
    };

    const it = world(graph);
    for (let step = 0; step < 3; step++) it.runtime.step();

    const bullets = hierarchyOrder(it.scene).filter(object => object.name === 'Bullet');
    assert.equal(bullets.length, 3);
    assert.equal(new globalThis.Set(bullets.map(object => object.id)).size, 3);

    // Moving one moves nothing else: the instances share no state at all.
    bullets[0].getComponent('Transform').x = 500;
    assert.equal(bullets[1].getComponent('Transform').x, 0);
});

test('a prefab nobody resolved spawns nothing, and the flow continues', () => {
    const it = world(SPAWN_THEN_PLACE, { prefabs: new ResourceRegistry() });
    const failures = [];
    const runtime = new Runtime(it.scene, {
        behaviors: it.runtime.behaviors,
        resources: new ResourceRegistry(),
        clock: new Clock(),
        onError: report => failures.push(report)
    });

    assert.doesNotThrow(() => runtime.step());
    assert.deepEqual(failures, []);
    assert.deepEqual(hierarchyOrder(it.scene).map(object => object.name), ['Spawner']);
});

test('a Runtime given no registry at all is not a fault either', () => {
    const it = world(SPAWN_THEN_PLACE);
    const runtime = new Runtime(it.scene, { behaviors: it.runtime.behaviors, clock: new Clock() });

    assert.doesNotThrow(() => runtime.step());
    assert.equal(hierarchyOrder(it.scene).length, 1);
});

// --- determinism ------------------------------------------------------------------------

test('the same seed spawns the same identities, which is what a server and a client need', () => {
    const identities = seed => {
        const it = world(SPAWN_THEN_PLACE, { seed });
        it.runtime.step();
        return hierarchyOrder(it.scene).map(object => object.id);
    };

    assert.deepEqual(identities('run-a'), identities('run-a'));
    assert.notDeepEqual(identities('run-a'), identities('run-b'));
});

test('the identities come from the simulation, never from the machine', () => {
    // The same property `Spawn` already has (ADR-0057 §3), asked of the prefab path.
    const it = world(SPAWN_THEN_PLACE, { seed: 'fixed' });
    it.runtime.step();

    const spawned = hierarchyOrder(it.scene).filter(object => object.name !== 'Spawner');
    for (const object of spawned) {
        assert.match(object.id, /^[a-z0-9]+$/, 'an ordinary opaque identity');
    }
    assert.equal(spawned.length, 2);
});

// --- the whole path: project, bundle, game --------------------------------------------------

test('a prefab travels in a bundle and is resolved before the first step', async () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const authoring = new Scene('Authoring', { registry });
    const bullet = authoring.add(new SceneObject('Bullet'));
    bullet.addComponent(new Transform(0, 0));
    bullet.addComponent(new RectangleRenderer(8, 8, '#ffd166'));

    const store = new MemoryResourceStore();
    const project = new Project('Game', { store });
    const prefab = addPrefab(project, bullet, { name: 'Bullet.prefab' }).resource;

    const level = new Scene('Level', { registry });
    level.add(new SceneObject('Camera'));
    const sceneResource = addScene(project, level, { name: 'Level.scene' });

    // THE CROSSING. Everything the game needs is JSON from here on (ADR-0042 §2).
    const bundle = await bundleProject(project, store, { scene: sceneResource.id });
    assert.ok(bundle.payloads[prefab.id], 'the definition travels with the manifest');

    const opened = openBundle(bundle);
    assert.equal(opened.project.get(prefab.id).kind, ResourceKind.PREFAB);

    const prefabs = await loadDefinitions(opened.project);
    const scene = await loadScene(opened.project, opened.scene, { registry });

    // AND FROM HERE NOTHING WAITS. This is what a `Runtime.step()` is handed.
    assert.equal(prefabs.get(prefab.id).root, bullet.id);
    assert.equal(scene.objects().length, 1, 'the scene carries no hidden model');
});

test('a scene full of instances saves and reloads without the prefab', () => {
    const it = world(SPAWN_THEN_PLACE);
    it.runtime.step();

    const registry = it.scene.registry;
    const reloaded = deserializeScene(serializeScene(it.scene), { registry });

    const names = hierarchyOrder(reloaded).map(object => object.name);
    assert.deepEqual(names, ['Spawner', 'Bullet', 'Trail']);

    // AN INSTANCE NAMES NOTHING (ADR-0061 §9). A saved scene that pointed at a Resource
    // would break the day the prefab was deleted; nothing in the payload mentions it.
    const written = globalThis.JSON.stringify(serializeScene(it.scene));
    assert.equal(written.includes('res_bullet'), false);
    assert.equal(written.includes('obj_model'), false);
});

// --- the node beside the one it did not replace ---------------------------------------------

test('Spawn still copies a live Object, so every graph written before this is untouched', () => {
    const graph = {
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'scene.spawn', params: {}, x: 0, y: 0 },
            { id: 'n3', type: 'scene.self', params: {}, x: 0, y: 0 }
        ],
        connections: [
            { from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
            { from: { node: 'n3', port: 'object' }, to: { node: 'n2', port: 'object' } }
        ]
    };

    const it = world(graph);
    it.runtime.step();

    assert.equal(hierarchyOrder(it.scene).filter(object => object.name === 'Spawner').length, 2);
});

test('the two nodes are two types, so the Runtime never guesses what a string names', () => {
    assert.ok(nodes.get('scene.spawn'));
    assert.ok(nodes.get('scene.spawnPrefab'));
    assert.equal(nodes.get('scene.spawn').label, 'Spawn');
    assert.equal(nodes.get('scene.spawnPrefab').label, 'Spawn Prefab');

    // One takes a live Object on its port, the other a ResourceId. Nothing is `any`.
    const portOf = (type, id) => {
        const definition = nodes.get(type);
        const ports = typeof definition.inputs === 'function' ? definition.inputs({}, {}) : definition.inputs;
        return ports.find(port => port.id === id);
    };
    assert.equal(portOf('scene.spawn', 'object').type, 'object');
    assert.equal(portOf('scene.spawnPrefab', 'prefab').type, 'resource');
});
