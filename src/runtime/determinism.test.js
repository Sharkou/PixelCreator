// Two machines, one seed, one game (ADR-0057).
//
// WHAT THIS FILE ASSERTS IS THE HYPOTHESIS THE WHOLE PRODUCT RESTS ON. ADR-0011 makes a
// server the authority over a simulation every client also runs; that is only worth
// anything if running it twice reaches the same place. `Clock` made time reproducible and
// ADR-0014 made input reproducible — and both left an unstated exception, because a graph
// that rolled a die or created an Object reached a source the two machines did not share.
//
// So every test below runs the SAME scene twice, in two Runtimes, and asks whether the two
// agree. They are written as a pair rather than as a snapshot on purpose: a golden file
// would freeze the generator's output and fail the day its constants are improved, which is
// not the contract. The contract is that two runs agree.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    createId,
    defineComponent,
    deserializeScene,
    duplicateObject,
    hierarchyOrder,
    registerStandardNodes,
    serializeScene
} from '../core/mod.js';
import { Behaviors } from './scripting/behaviors.js';
import { createGraphInterpreter } from './scripting/interpreter.js';
import { registerBuiltIns } from './builtins.js';
import { Runtime } from './runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

/** What the `.px` declares: which Object to copy, and somewhere to write a roll. */
const PROPERTIES = {
    target: { id: 'p_target', type: 'objectref', default: null },
    roll: { id: 'p_roll', type: 'number', default: 0 }
};

/**
 * A scene that is the same scene every time it is built.
 *
 * THE IDENTITIES ARE WRITTEN DOWN, and that is what makes "the two runs agree" a question
 * about the simulation rather than about how the fixture was made: two worlds start from the
 * same ids, so a difference after N steps is a difference the steps produced.
 *
 * @param {object} graph - The graph payload the `.px` carries
 * @param {object} [options] - Options
 * @param {string} [options.seed] - What the Runtime derives its streams from
 * @returns {object} `{ scene, runtime, spawner, model, type, failures }`
 */
function world(graph, { seed = 'level-one' } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties: PROPERTIES, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, graph);

    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { id: 'scene_fixed', registry: types });

    const spawner = scene.add(new SceneObject('Spawner', { id: 'obj_spawner' }));
    spawner.addComponent(new Transform());
    spawner.addComponent(new Component());

    const model = scene.add(new SceneObject('Model', { id: 'obj_model' }));
    model.addComponent(new Transform(10, 20));

    // A CHILD, SO A SPAWN MINTS MORE THAN ONE IDENTITY. One mint per run would agree by
    // accident the day the stream advanced by a different amount per call.
    const barrel = scene.add(new SceneObject('Barrel', { id: 'obj_barrel' }));
    barrel.addComponent(new Transform(1, 2));
    model.addChild(barrel);

    spawner.getComponent(payload.type).target = model.id;

    const failures = [];
    const runtime = new Runtime(scene, { behaviors, seed, onError: report => failures.push(report) });

    return { scene, runtime, spawner, model, type: payload.type, failures };
}

/** `On Update → …`, the shape every graph below is. */
function everyStep(nodes, connections) {
    return {
        version: 1,
        nodes: [{ id: 'tick', type: 'event.update', x: 0, y: 0, params: {} }, ...nodes],
        connections
    };
}

const SPAWN = everyStep(
    [{ id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } }],
    [{ id: 'f1', from: { node: 'tick', port: 'out' }, to: { node: 'spawn', port: 'in' } }]
);

const ROLL = everyStep(
    [
        { id: 'dice', type: 'math.random', x: 0, y: 0, params: {}, inputs: { min: 0, max: 1000 } },
        { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_roll' } }
    ],
    [
        { id: 'f1', from: { node: 'tick', port: 'out' }, to: { node: 'write', port: 'in' } },
        { id: 'd1', from: { node: 'dice', port: 'value' }, to: { node: 'write', port: 'value' } }
    ]
);

/** Both, in one order or the other — which is how the two streams are proved separate. */
function both(first, second) {
    return everyStep(
        [
            { id: 'split', type: 'flow.sequence', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
            { id: 'dice', type: 'math.random', x: 0, y: 0, params: {}, inputs: { min: 0, max: 1000 } },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_roll' } }
        ],
        [
            { id: 'f1', from: { node: 'tick', port: 'out' }, to: { node: 'split', port: 'in' } },
            { id: 'f2', from: { node: 'split', port: 'first' }, to: { node: first, port: 'in' } },
            { id: 'f3', from: { node: 'split', port: 'second' }, to: { node: second, port: 'in' } },
            { id: 'd1', from: { node: 'dice', port: 'value' }, to: { node: 'write', port: 'value' } }
        ]
    );
}

const ROLL_THEN_SPAWN = both('write', 'spawn');
const SPAWN_THEN_ROLL = both('spawn', 'write');

/** Run a world for N steps and read back what it produced. */
function run(graph, { seed, steps = 3 } = {}) {
    const it = world(graph, { seed });
    const rolls = [];

    for (let step = 0; step < steps; step++) {
        it.runtime.step();
        rolls.push(it.spawner.getComponent(it.type).roll);
    }

    assert.deepEqual(it.failures, [], 'nothing was reported');

    return {
        rolls,
        // Every identity the run created, in canonical order — which is the order both
        // machines walk the scene in (ADR-0034 §3.1), so comparing the lists is comparing
        // the scenes.
        ids: hierarchyOrder(it.scene).map(object => object.id),
        payload: JSON.stringify(serializeScene(it.scene)),
        seed: it.runtime.seed
    };
}

// --- the same seed is the same game --------------------------------------------------------

test('two runtimes on one seed spawn Objects with the same identities', () => {
    // THE TEST THAT FAILS WITHOUT ADR-0057. The identities used to come from the platform
    // CSPRNG, so two machines running the very same step created objects they could never
    // agree about — and every reference either of them stored afterwards pointed somewhere
    // the other had never heard of.
    const first = run(SPAWN, { seed: 'alpha' });
    const second = run(SPAWN, { seed: 'alpha' });

    assert.equal(first.ids.length, 9, 'three steps, three copies of a two-object model');
    assert.deepEqual(first.ids, second.ids);
});

test('two runtimes on one seed roll the same numbers', () => {
    const first = run(ROLL, { seed: 'alpha' });
    const second = run(ROLL, { seed: 'alpha' });

    assert.equal(new Set(first.rolls).size, 3, 'three steps, three different rolls');
    assert.deepEqual(first.rolls, second.rolls);
});

test('two runtimes on one seed reach the same state, byte for byte', () => {
    // THE WHOLE CONTRACT IN ONE ASSERTION: same scene, same inputs, same seed, same payload.
    // It covers the two above and everything between them — values, order, references.
    const first = run(ROLL_THEN_SPAWN, { seed: 'alpha', steps: 5 });
    const second = run(ROLL_THEN_SPAWN, { seed: 'alpha', steps: 5 });

    assert.equal(first.payload, second.payload);
});

test('the references inside a spawned subtree are the same on both machines', () => {
    // The remapping of ADR-0056 §6 is a function of the identities, so it agrees exactly when
    // they do — and this is the assertion that says so rather than assuming it.
    const read = seed => {
        const it = world(SPAWN, { seed });
        it.runtime.step();
        const copy = hierarchyOrder(it.scene).filter(object => object.name === 'Model').at(-1);
        return { root: copy.id, child: copy.children[0].id, parent: copy.children[0].parent.id };
    };

    const first = read('alpha');
    assert.deepEqual(first, read('alpha'));
    assert.equal(first.parent, first.root, 'and the copy is wired to itself');
});

test('several spawns in a row stay in step, not just the first', () => {
    const first = run(SPAWN, { seed: 'alpha', steps: 8 });
    const second = run(SPAWN, { seed: 'alpha', steps: 8 });

    assert.equal(first.ids.length, 19, 'eight copies of a two-object model, plus the three originals');
    assert.deepEqual(first.ids, second.ids);
    assert.equal(new Set(first.ids).size, first.ids.length, 'and no identity is used twice');
});

test('saving the starting state and replaying it with the same seed reaches the same place', () => {
    // WHAT A REPLAY IS, AND WHY THE SEED HAS TO BE A VALUE RATHER THAN A HIDDEN STATE. The
    // payload plus the seed is the whole of what a run needs to be reproduced.
    const original = world(SPAWN, { seed: 'alpha' });
    const start = JSON.stringify(serializeScene(original.scene));
    for (let step = 0; step < 4; step++) original.runtime.step();
    const ended = JSON.stringify(serializeScene(original.scene));

    const replayed = deserializeScene(JSON.parse(start), { registry: original.scene.registry });
    const behaviors = original.runtime.behaviors;
    const runtime = new Runtime(replayed, { behaviors, seed: 'alpha' });
    for (let step = 0; step < 4; step++) runtime.step();

    assert.equal(JSON.stringify(serializeScene(replayed)), ended);
});

// --- a different seed is a different game --------------------------------------------------

test('a different seed rolls different numbers and creates different identities', () => {
    const alpha = run(ROLL_THEN_SPAWN, { seed: 'alpha' });
    const beta = run(ROLL_THEN_SPAWN, { seed: 'beta' });

    assert.notDeepEqual(alpha.rolls, beta.rolls);
    assert.notDeepEqual(alpha.ids, beta.ids);
});

test('a runtime given no seed draws one, and says which', () => {
    // CONTROLLED, NOT ABSENT. A constant default would make every playthrough identical; a
    // hidden draw would make a bug unreproducible. The draw is stated instead.
    const first = world(SPAWN);
    const second = world(SPAWN);

    assert.equal(typeof new Runtime(first.scene).seed, 'string');
    assert.equal(first.runtime.seed, 'level-one', 'what was asked for is what it holds');
    assert.notEqual(new Runtime(second.scene).seed, new Runtime(second.scene).seed);
});

// --- two streams, and they do not move each other ------------------------------------------

test('adding a Random before a Spawn does not change what the Spawn creates', () => {
    // WHY THE TWO STREAMS ARE SEPARATE (ADR-0057 §2). On one counter, "how many dice have
    // been rolled" would be an input to every identity minted after them — so adding a
    // `Random` anywhere in a graph would silently renumber the whole game.
    const alone = run(SPAWN, { seed: 'alpha' });
    const beside = run(ROLL_THEN_SPAWN, { seed: 'alpha' });

    assert.deepEqual(beside.ids, alone.ids);
});

test('adding a Spawn before a Random does not change what the Random rolls', () => {
    const alone = run(ROLL, { seed: 'alpha' });
    const beside = run(SPAWN_THEN_ROLL, { seed: 'alpha' });

    assert.deepEqual(beside.rolls, alone.rolls);
});

test('the order of the two in one graph does not move either stream', () => {
    const rollFirst = run(ROLL_THEN_SPAWN, { seed: 'alpha' });
    const spawnFirst = run(SPAWN_THEN_ROLL, { seed: 'alpha' });

    assert.deepEqual(rollFirst.rolls, spawnFirst.rolls);
    assert.deepEqual(rollFirst.ids, spawnFirst.ids);
});

// --- what is deliberately NOT deterministic ------------------------------------------------

test('an identity minted outside a simulation is still drawn from the machine', () => {
    // THE LINE ADR-0057 §3 DRAWS. An identity created while EDITING is content, minted once
    // and never again; an identity created by a step is a consequence two machines have to
    // agree on. Only the second one is derived from a seed, and the Editor keeps knowing
    // nothing about Runtimes.
    assert.notEqual(createId(), createId());

    const registryTypes = new ComponentRegistry();
    registerBuiltIns(registryTypes);
    const scene = new Scene('Edited', { registry: registryTypes });
    const model = scene.add(new SceneObject('Model'));
    model.addComponent(new Transform());

    const first = duplicateObject(scene, model);
    const second = duplicateObject(scene, model);

    assert.notEqual(first.id, second.id, 'two editor duplications are two Objects');
    assert.equal(typeof first.id, 'string');
});
