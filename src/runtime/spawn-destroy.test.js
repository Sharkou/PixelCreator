// Making and unmaking Objects from a graph — the loop a game is (ADR-0056).
//
// WHY THIS FILE IS AT THE RUNTIME LEVEL AND NOT IN `interpreter.test.js`. Everything that
// is interesting about `Spawn` and `Destroy` is a question about a step: an Object created
// while the walk is running, an Object destroyed under the very component destroying it,
// a handle that was live three nodes ago. None of those is observable with a graph run in
// isolation — they are observable when `Runtime.step()` is the thing running the graph, so
// that is what these tests drive.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Graph,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent,
    hierarchyOrder,
    registerStandardNodes
} from '../core/mod.js';
import { Behaviors } from './scripting/behaviors.js';
import { createGraphInterpreter } from './scripting/interpreter.js';
import { registerBuiltIns } from './builtins.js';
import { Runtime } from './runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

/** The socket a `.px` declares so a node can be pointed at an Object without a wire. */
const SOCKET = { target: { id: 'p_target', type: 'objectref', default: null } };

/**
 * A scene running one `.px` on a `Spawner`, with a `Model` beside it.
 *
 * @param {object} graph - The graph payload the Component carries
 * @param {object} [options] - `{ properties }` the `.px` declares
 * @returns {object} The scene, its objects, a Runtime and the failures it reported
 */
function game(graph, { properties = SOCKET } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { registry: types });

    const spawner = scene.add(new SceneObject('Spawner'));
    spawner.addComponent(new Transform());
    spawner.addComponent(new Component());

    const model = scene.add(new SceneObject('Model', { tag: 'model' }));
    model.addComponent(new Transform(100, 200));

    const failures = [];
    const runtime = new Runtime(scene, { behaviors, onError: report => failures.push(report) });

    return { scene, spawner, model, runtime, failures, type: payload.type };
}

/** How many Objects of a given name the scene holds. */
function count(scene, name) {
    return hierarchyOrder(scene).filter(object => object.name === name).length;
}

/** `On Start → …`, so the sentence runs exactly once however many steps are taken. */
function once(nodes, connections) {
    return {
        version: 1,
        nodes: [{ id: 'start', type: 'event.start', x: 0, y: 0, params: {} }, ...nodes],
        connections
    };
}

// --- Spawn -------------------------------------------------------------------------------

test('Spawn puts a copy of its model into the scene', () => {
    const it = game(once(
        [{ id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    assert.equal(count(it.scene, 'Model'), 1);
    it.runtime.step();

    assert.equal(count(it.scene, 'Model'), 2, 'one more Model than there was');
    assert.deepEqual(it.failures, []);
});

test('the Object Spawn made comes out of it, and the next node acts on THAT one', () => {
    // THE WHOLE REASON THE OUTPUT EXISTS (ADR-0056 §4). A spawn nobody can point at is a
    // spawn nobody can place — the copy would sit exactly on its model for ever.
    const it = game(once(
        [
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'place', type: 'transform.setPosition', x: 0, y: 0, params: {}, inputs: { x: 42, y: -9 } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'place', port: 'in' } },
            { id: 'c3', from: { node: 'spawn', port: 'spawned' }, to: { node: 'place', port: 'object' } }
        ]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    const copies = hierarchyOrder(it.scene).filter(object => object.name === 'Model');
    assert.equal(copies.length, 2);
    const [model, copy] = copies;
    assert.equal(model.id, it.model.id, 'the model kept its place');
    assert.equal(model.getComponent('Transform').x, 100, 'and its position');
    assert.equal(copy.getComponent('Transform').x, 42, 'the copy is where the graph put it');
    assert.equal(copy.getComponent('Transform').y, -9);
});

test('a copy starts life with the values its model holds', () => {
    const it = game(once(
        [{ id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    ));
    it.model.getComponent('Transform').x = 33;
    it.model.tag = 'enemy';
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    const copy = it.scene.findByTag('enemy')[1];
    assert.ok(copy, 'the tag came across, which is how a graph will find it later');
    assert.equal(copy.getComponent('Transform').x, 33, 'and so did the Transform');
});

test('two spawns are two Objects, not one Object twice', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }
        ],
        connections: [{ id: 'c', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    });
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();
    it.runtime.step();

    const copies = hierarchyOrder(it.scene).filter(object => object.name === 'Model');
    assert.equal(copies.length, 3, 'the model and its two copies');
    assert.equal(new Set(copies.map(object => object.id)).size, 3, 'three identities');
});

test('a Spawn pointed at nothing makes nothing, and reports nothing', () => {
    // THE FAMILY OF FAILURE ADR-0034 §3.4 NAMES: only the running scene can answer this, so
    // an empty socket and a model that has been destroyed are states of the game.
    const it = game(once(
        [{ id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    ));

    it.runtime.step();
    assert.equal(it.scene.size, 2, 'nothing was created');

    it.spawner.getComponent(it.type).target = 'obj_gone';
    it.runtime.step();
    assert.equal(it.scene.size, 2, 'and a dead reference creates nothing either');
    assert.deepEqual(it.failures, [], 'neither is an error');
});

test('a Spawn with no model named does NOT copy the Object it is attached to', () => {
    // THE TRAP THE `Model` PARAM EXISTS TO AVOID (ADR-0056 §3). Every other Object param in
    // the catalogue falls back to `Self`; this one must not, or an untouched Spawn would
    // double its own Object on every step.
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: {} }
        ],
        connections: [{ id: 'c', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    });

    it.runtime.step();
    it.runtime.step();
    it.runtime.step();

    assert.equal(it.scene.size, 2, 'the scene is exactly as it started');
    assert.deepEqual(it.failures, []);
});

test('a spawned Object is not simulated on the step that created it', () => {
    // AND THAT IS WHAT STOPS A SPAWN LOOP FROM EATING A FRAME (ADR-0056 §5). The order is
    // materialised before the walk, so the copy — which carries the very graph that made it
    // — joins the simulation on the NEXT step and not inside this one.
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }
        ],
        connections: [{ id: 'c', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    });
    // The spawner copies ITSELF, so every copy spawns in its turn: one, two, four.
    it.spawner.getComponent(it.type).target = it.spawner.id;

    it.runtime.step();
    assert.equal(count(it.scene, 'Spawner'), 2, 'one step, one copy');

    it.runtime.step();
    assert.equal(count(it.scene, 'Spawner'), 4, 'and then both of them copy');
    assert.deepEqual(it.failures, []);
});

test('a Graph carrying Spawn serializes with no handle and no scene identity in it', () => {
    // ADR-0034 invariants 1 and 3, asked of the node that creates scene objects. What the
    // `.px` stores is the id of a PROPERTY it declares itself; the ObjectId lives in the
    // scene, on the instance, and the handle lives nowhere at all.
    const graph = new Graph();
    graph.addNode({ type: 'scene.spawn', params: { target: 'p_target' } });
    graph.addNode({ type: 'scene.destroy', params: {} });

    const written = JSON.stringify(graph.serialize());

    assert.ok(written.includes('p_target'), 'the socket it points at is project scope');
    assert.ok(written.includes('scene.spawn') && written.includes('scene.destroy'));
    assert.equal(/obj_[a-z]+/.test(written), false, 'no scene identity is written');
});

test('running Spawn and Destroy writes nothing back into the graph payload', () => {
    // A HANDLE IS NEVER PERSISTED (ADR-0034 invariant 3). The payload a `.px` carries is
    // read once and never mutated (ADR-0016 §7), and the node that CREATES scene objects is
    // the one where a write-back would be easiest to miss: the copy exists, its identity is
    // in hand, and the graph is right there.
    const payload = {
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }
        ],
        connections: [
            { id: 'c1', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c3', from: { node: 'spawn', port: 'spawned' }, to: { node: 'kill', port: 'object' } }
        ]
    };
    const before = JSON.stringify(payload);

    const it = game(payload);
    it.spawner.getComponent(it.type).target = it.model.id;
    it.runtime.step();
    it.runtime.step();

    assert.equal(JSON.stringify(payload), before, 'byte for byte what it was written as');
});

test('a forged Object written into a Spawn input is ignored, and nothing is created', () => {
    // ADR-0034 §3.6, at the one node where the consequence would be a mutation of the scene
    // rather than a value nobody reads.
    const it = game(once(
        [{
            id: 'spawn',
            type: 'scene.spawn',
            x: 0,
            y: 0,
            params: {},
            inputs: { object: { id: 'obj_forged', name: 'Forged' } }
        }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
    ));

    it.runtime.step();

    assert.equal(it.scene.size, 2);
    assert.deepEqual(it.failures, []);
});

// --- Destroy -----------------------------------------------------------------------------

test('Destroy removes the Object it is pointed at', () => {
    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(it.scene.has(it.model), false, 'gone from the scene');
    assert.equal(it.scene.size, 1);
    assert.deepEqual(it.failures, []);
});

test('Destroy with nothing named removes the Object the graph is running as', () => {
    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));

    it.runtime.step();

    assert.equal(it.scene.has(it.spawner), false, 'Self, which is what the picker reads');
    assert.equal(it.scene.has(it.model), true, 'and only that one');
    assert.deepEqual(it.failures, []);
});

test('destroying an Object takes everything under it', () => {
    // THE CONTRACT IS THE ONE `Scene.remove()` ALREADY HAS, NOT A SECOND ONE (ADR-0056 §2).
    // A child left in the scene pointing at a parent that has gone is the state the
    // primitive exists to prevent.
    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));
    const barrel = it.scene.add(new SceneObject('Barrel'));
    it.model.addChild(barrel);
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(it.scene.has(it.model), false);
    assert.equal(it.scene.has(barrel), false, 'the child went with its parent');
    assert.equal(it.scene.size, 1);
});

test('destroying a child leaves its parent, and the parent stops listing it', () => {
    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));
    const barrel = it.scene.add(new SceneObject('Barrel'));
    it.model.addChild(barrel);
    it.spawner.getComponent(it.type).target = barrel.id;

    it.runtime.step();

    assert.equal(it.scene.has(it.model), true, 'a parent is not destroyed by its child');
    assert.deepEqual(it.model.children, [], 'and the link is gone with the object');
});

test('destroying an Object that is already gone does nothing, and reports nothing', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } }
        ],
        connections: [{ id: 'c', from: { node: 'tick', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    });
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();
    it.runtime.step();
    it.runtime.step();

    assert.equal(it.scene.size, 1, 'the second and third pass removed nothing more');
    assert.deepEqual(it.failures, [], 'a target that has already died is a state of the game');
});

test('Is Valid answers false for an Object destroyed earlier in the same flow', () => {
    // A HANDLE IS NOT A PERMIT (ADR-0056 §5). Before `Destroy` existed, "there is a handle
    // here" and "that Object is still in the scene" were the same question; they are not any
    // more, and this is the node a creator defends themselves with.
    const it = game(once(
        [
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'ask', type: 'object.isValid', x: 0, y: 0, params: {} },
            { id: 'who', type: 'reference.object', x: 0, y: 0, params: { object: 'p_target' } },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_alive' } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c2', from: { node: 'kill', port: 'out' }, to: { node: 'write', port: 'in' } },
            { id: 'c3', from: { node: 'who', port: 'object' }, to: { node: 'ask', port: 'object' } },
            { id: 'c4', from: { node: 'ask', port: 'result' }, to: { node: 'write', port: 'value' } }
        ]
    ), { properties: { ...SOCKET, alive: { id: 'p_alive', type: 'boolean', default: true } } });
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(it.spawner.getComponent(it.type).alive, false,
        'the destroyed target does not read as valid');
    assert.deepEqual(it.failures, []);
});

test('a component that destroys its own Object is the last thing that runs on it', () => {
    // MUTATION DURING THE WALK, DECIDED RATHER THAN LEFT TO LUCK (ADR-0056 §5). The order is
    // materialised before the loop, so the destroyed Object is still in the list — and its
    // remaining components must not run on an Object the scene no longer holds.
    const ran = [];
    class Witness {
        static type = 'Witness';
        update() { ran.push('witness'); }
    }

    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));
    it.scene.registry.register(Witness);
    it.spawner.addComponent(new Witness());

    it.runtime.step();

    assert.equal(it.scene.has(it.spawner), false);
    assert.deepEqual(ran, [], 'the component after the graph did not run on a dead Object');
    assert.deepEqual(it.failures, []);
});

test('an Object destroyed by a neighbour does not run in the step that destroyed it', () => {
    const ran = [];
    class Witness {
        static type = 'Witness';
        update() { ran.push('witness'); }
    }

    const it = game(once(
        [{ id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: { target: 'p_target' } }],
        [{ id: 'c', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } }]
    ));
    it.scene.registry.register(Witness);
    // The Spawner is first in canonical order, so the Model is reached after it is destroyed.
    it.model.addComponent(new Witness());
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(it.scene.has(it.model), false);
    assert.deepEqual(ran, [], 'a destroyed Object is skipped, not simulated once more');
});

test('the flow continues after a Destroy, and what follows it does nothing', () => {
    // NO SECOND KIND OF CONTROL FLOW. A node that swallowed the rest of the graph would be
    // invisible on the canvas; what happens instead is what happens to any dead reference.
    const it = game(once(
        [
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} },
            { id: 'move', type: 'transform.setPosition', x: 0, y: 0, params: {}, inputs: { x: 5, y: 5 } },
            { id: 'log', type: 'debug.log', x: 0, y: 0, params: {}, inputs: { value: 'after' } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c2', from: { node: 'kill', port: 'out' }, to: { node: 'move', port: 'in' } },
            { id: 'c3', from: { node: 'move', port: 'out' }, to: { node: 'log', port: 'in' } }
        ]
    ));

    it.runtime.step();

    assert.equal(it.scene.has(it.spawner), false);
    assert.deepEqual(it.failures, [], 'the rest of the flow ran and raised nothing');
});

// --- the two of them, which is what a gameplay loop is ------------------------------------

test('a graph spawns an Object and destroys it again, and the scene ends where it started', () => {
    const it = game(once(
        [
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c3', from: { node: 'spawn', port: 'spawned' }, to: { node: 'kill', port: 'object' } }
        ]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(it.scene.size, 2, 'the copy was made and then unmade');
    assert.equal(count(it.scene, 'Model'), 1);
    assert.deepEqual(it.failures, []);
});

test('spawning and destroying produces no Operation', () => {
    // ADR-0034 invariant 5, end to end: a graph changes the SHAPE of the scene and still
    // produces nothing to arbitrate, replicate or undo (ADR-0019).
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }
        ],
        connections: [
            { id: 'c1', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c3', from: { node: 'spawn', port: 'spawned' }, to: { node: 'kill', port: 'object' } }
        ]
    });
    it.spawner.getComponent(it.type).target = it.model.id;

    const operations = [];
    it.scene.operations.on('operation', operation => operations.push(operation));

    it.runtime.step();
    it.runtime.step();
    it.runtime.step();

    assert.deepEqual(operations, [], 'three steps, no Operation');
});

// --- what a flow node that also produces a value promises (ADR-0056 §4) -------------------

test('the Object Spawn made is read once however many nodes read it', () => {
    // A DATA OUTPUT IS PULLED, AND PULLING A NODE WITH AN EFFECT IS THE TRAP. Asked twice,
    // a `Spawn` that was re-run to be read would create two Objects and hand the second one
    // out to the second reader — so the value is pushed once, when the node runs.
    const it = game(once(
        [
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'place', type: 'transform.setPosition', x: 0, y: 0, params: {}, inputs: { x: 11, y: 0 } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 4, y: 0 } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'place', port: 'in' } },
            { id: 'c3', from: { node: 'place', port: 'out' }, to: { node: 'move', port: 'in' } },
            { id: 'c4', from: { node: 'spawn', port: 'spawned' }, to: { node: 'place', port: 'object' } },
            { id: 'c5', from: { node: 'spawn', port: 'spawned' }, to: { node: 'move', port: 'object' } }
        ]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(count(it.scene, 'Model'), 2, 'two readers, one copy');
    const copy = hierarchyOrder(it.scene).filter(object => object.name === 'Model')[1];
    assert.equal(copy.getComponent('Transform').x, 15, 'both readers got the same Object');
});

test('reading a Spawn that has not run yet answers nothing, and raises nothing', () => {
    // A BRANCH THAT REACHES THE READER FIRST IS A REAL GRAPH, and "it has not happened yet"
    // is the same `null` a disconnected port yields — so the consumer needs no second rule.
    const it = game(once(
        [
            { id: 'split', type: 'flow.sequence', x: 0, y: 0, params: {} },
            { id: 'place', type: 'transform.setPosition', x: 0, y: 0, params: {}, inputs: { x: 11, y: 0 } },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'split', port: 'in' } },
            { id: 'c2', from: { node: 'split', port: 'first' }, to: { node: 'place', port: 'in' } },
            { id: 'c3', from: { node: 'split', port: 'second' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c4', from: { node: 'spawn', port: 'spawned' }, to: { node: 'place', port: 'object' } }
        ]
    ));
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(count(it.scene, 'Model'), 2, 'the spawn still happened, on the second branch');
    assert.equal(it.spawner.getComponent('Transform').x, 0, 'and the wire did not fall back to Self');
    assert.deepEqual(it.failures, []);
});

test('a spawned Object read after it has been destroyed reads as nothing', () => {
    // THE HALF OF INVARIANT 3 A STORE COULD HAVE BROKEN. The handle is still in hand three
    // nodes later; what it points at is not in the scene, so it is not handed on.
    const it = game(once(
        [
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} },
            { id: 'ask', type: 'object.isValid', x: 0, y: 0, params: {} },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_alive' } }
        ],
        [
            { id: 'c1', from: { node: 'start', port: 'out' }, to: { node: 'spawn', port: 'in' } },
            { id: 'c2', from: { node: 'spawn', port: 'out' }, to: { node: 'kill', port: 'in' } },
            { id: 'c3', from: { node: 'kill', port: 'out' }, to: { node: 'write', port: 'in' } },
            { id: 'c4', from: { node: 'spawn', port: 'spawned' }, to: { node: 'kill', port: 'object' } },
            { id: 'c5', from: { node: 'spawn', port: 'spawned' }, to: { node: 'ask', port: 'object' } },
            { id: 'c6', from: { node: 'ask', port: 'result' }, to: { node: 'write', port: 'value' } }
        ]
    ), { properties: { ...SOCKET, alive: { id: 'p_alive', type: 'boolean', default: true } } });
    it.spawner.getComponent(it.type).target = it.model.id;

    it.runtime.step();

    assert.equal(count(it.scene, 'Model'), 1, 'the copy was made and then unmade');
    assert.equal(it.spawner.getComponent(it.type).alive, false, 'and the handle no longer reads live');
    assert.deepEqual(it.failures, []);
});
