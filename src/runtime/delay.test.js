// An execution may outlive the step that started it (ADR-0058).
//
// WHAT IS ACTUALLY BEING TESTED HERE is not a node. `Delay` is three lines; what it needed
// was somewhere for the rest of a flow to WAIT — and the answer decides how every timing node
// after it will behave. So these tests are about the mechanism: whose state it is, whether two
// passes through one node interfere, what a destroyed Object does to a wait that was still
// counting, and whether two machines fed the same steps resume at the same one.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent,
    registerStandardNodes,
    serializeScene
} from '../core/mod.js';
import { Behaviors } from './scripting/behaviors.js';
import { createGraphInterpreter } from './scripting/interpreter.js';
import { registerBuiltIns } from './builtins.js';
import { Clock } from './clock/clock.js';
import { Runtime } from './runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

/** Somewhere for a graph to write, and a counter it can add to. */
const PROPERTIES = {
    mark: { id: 'p_mark', type: 'number', default: 0 },
    runs: { id: 'p_runs', type: 'number', default: 0 }
};

/**
 * A scene running one `.px` on as many Objects as asked for.
 *
 * @param {object} graph - The graph payload the `.px` carries
 * @param {object} [options] - Options
 * @param {number} [options.step] - Seconds one simulation step lasts
 * @param {number} [options.objects] - How many Objects carry the Component
 * @param {string} [options.seed] - What the Runtime derives its streams from
 * @returns {object} `{ scene, runtime, holders, type, failures, behaviors }`
 */
function game(graph, { step = 0.5, objects = 1, seed = 'alpha' } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties: PROPERTIES, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, graph);

    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { id: 'scene_fixed', registry: types });
    const holders = [];
    for (let index = 0; index < objects; index++) {
        const object = scene.add(new SceneObject(`Holder ${index}`, { id: `obj_${index}` }));
        object.addComponent(new Transform());
        object.addComponent(new Component());
        holders.push(object);
    }

    const failures = [];
    const runtime = new Runtime(scene, {
        behaviors,
        seed,
        clock: new Clock({ fixedStep: step, maxStepsPerAdvance: 1000 }),
        onError: report => failures.push(report)
    });

    return { scene, runtime, holders, type: payload.type, failures, behaviors };
}

/** What the first holder's Component holds. */
function values(it, at = 0) {
    return it.holders[at].getComponent(it.type);
}

/** A `Set Property` writing a constant into `mark`. */
function mark(id, value) {
    return { id, type: 'property.set', x: 0, y: 0, params: { property: 'p_mark' }, inputs: { value } };
}

/** `Delay`, with a duration typed into the node. */
function delay(id, duration) {
    return { id, type: 'flow.delay', x: 0, y: 0, params: {}, inputs: { duration } };
}

function wire(id, from, to) {
    return { id, from: { node: from[0], port: from[1] }, to: { node: to[0], port: to[1] } };
}

function graphOf(nodes, connections) {
    return { version: 1, nodes, connections };
}

/** `On Start → Delay(duration) → mark = 1`, the shortest sentence a Delay appears in. */
function afterStart(duration) {
    return graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            delay('wait', duration),
            mark('write', 1)
        ],
        [
            wire('f1', ['start', 'out'], ['wait', 'in']),
            wire('f2', ['wait', 'then'], ['write', 'in'])
        ]
    );
}

// --- one Delay, one execution --------------------------------------------------------------

test('nothing happens before the wait is over, and then it happens once', () => {
    const it = game(afterStart(1), { step: 0.4 });

    it.runtime.step();
    assert.equal(values(it).mark, 0, 'the step that reached the Delay does not go through it');

    it.runtime.step();
    assert.equal(values(it).mark, 0, '0.4 s in');

    it.runtime.step();
    assert.equal(values(it).mark, 0, '0.8 s in, still short of one second');

    it.runtime.step();
    assert.equal(values(it).mark, 1, '1.2 s in: the third step after the wait began');

    values(it).mark = 0;
    for (let step = 0; step < 20; step++) it.runtime.step();
    assert.equal(values(it).mark, 0, 'and never again — a wait is taken once');
    assert.deepEqual(it.failures, []);
});

test('a wait is a duration, not a number of frames', () => {
    // THE LEGACY DEFECT `Clock` EXISTS TO PREVENT, asked of the new mechanism: a game that
    // waited N frames ran faster on a 144 Hz display than on a 60 Hz one.
    const coarse = game(afterStart(1), { step: 0.5 });
    const fine = game(afterStart(1), { step: 0.1 });

    for (let step = 0; step < 3; step++) coarse.runtime.step();
    for (let step = 0; step < 11; step++) fine.runtime.step();

    assert.equal(coarse.runtime.clock.time, 1.5);
    assert.ok(Math.abs(fine.runtime.clock.time - 1.1) < 1e-9);
    assert.equal(values(coarse).mark, 1, 'three coarse steps');
    assert.equal(values(fine).mark, 1, 'eleven fine ones — the same second');
});

test('the same elapsed time resumes at the same place however it was fed in', () => {
    // `advance()` ACCUMULATES REAL TIME INTO FIXED STEPS, so two callers that hand over the
    // same total in different lumps run the same simulation.
    const lumpy = game(afterStart(1), { step: 0.05 });
    const even = game(afterStart(1), { step: 0.05 });

    lumpy.runtime.step();
    even.runtime.step();

    for (const elapsed of [0.2, 0.35, 0.45]) lumpy.runtime.advance(elapsed);
    for (const elapsed of [0.5, 0.5]) even.runtime.advance(elapsed);

    assert.equal(values(lumpy).mark, 1);
    assert.equal(values(even).mark, 1);
    assert.equal(serializeScene(lumpy.scene).objects[0].components[1].values.mark,
        serializeScene(even.scene).objects[0].components[1].values.mark);
});

test('the duration is read when the Delay is reached, and does not move afterwards', () => {
    // A WAIT WHOSE END MOVES IS NOT A WAIT. The duration comes off a property the graph
    // itself rewrites while the wait is running; the wait still ends where it was set.
    const it = game(graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            { id: 'read', type: 'property.get', x: 0, y: 0, params: { property: 'p_runs' } },
            { id: 'wait', type: 'flow.delay', x: 0, y: 0, params: {} },
            mark('write', 1),
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'bump', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' }, inputs: { value: 99 } }
        ],
        [
            wire('f1', ['start', 'out'], ['wait', 'in']),
            wire('d1', ['read', 'value'], ['wait', 'duration']),
            wire('f2', ['wait', 'then'], ['write', 'in']),
            wire('f3', ['tick', 'out'], ['bump', 'in'])
        ]
    ), { step: 0.5 });

    values(it).runs = 1;
    it.runtime.step();
    assert.equal(values(it).runs, 99, 'the duration property was rewritten during the wait');

    it.runtime.step();
    assert.equal(values(it).mark, 0, '0.5 s of the original one second');
    it.runtime.step();
    assert.equal(values(it).mark, 1, 'and it ended at one second, not at ninety-nine');
});

// --- what a duration that is not a duration means -------------------------------------------

test('a duration of zero or less is no wait at all', () => {
    for (const duration of [0, -5]) {
        const it = game(afterStart(duration), { step: 0.5 });
        it.runtime.step();
        assert.equal(values(it).mark, 1, `${duration} carries straight on`);
    }
});

test('a duration that is not a number is no wait either', () => {
    // THE CATALOGUE'S OWN NUMERIC CONVENTION (`number()`), not a rule invented for this node:
    // `NaN` and `Infinity` read as `0` in `Clamp`, `Lerp` and `Translate` too.
    for (const duration of [NaN, Infinity, -Infinity, 'soon', null]) {
        const it = game(afterStart(duration), { step: 0.5 });
        it.runtime.step();
        assert.equal(values(it).mark, 1, `${duration} carries straight on`);
        assert.deepEqual(it.failures, []);
    }
});

test('an unconnected Duration waits the second the card reads', () => {
    const it = game(graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            { id: 'wait', type: 'flow.delay', x: 0, y: 0, params: {} },
            mark('write', 1)
        ],
        [wire('f1', ['start', 'out'], ['wait', 'in']), wire('f2', ['wait', 'then'], ['write', 'in'])]
    ), { step: 0.5 });

    it.runtime.step();
    it.runtime.step();
    assert.equal(values(it).mark, 0, 'half a second in');
    it.runtime.step();
    assert.equal(values(it).mark, 1, 'the default is one second');
});

test('a Delay of zero inside a loop is bounded by the budget, like any other loop', () => {
    // THE ONE WAY A WAITING NODE COULD HAVE BECOME A SECOND KIND OF INFINITE LOOP. Because a
    // duration of zero does not suspend, the loop is an ordinary loop and the ordinary budget
    // catches it — loudly, with the node it was on (ADR-0027).
    const it = game(graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            delay('wait', 0),
            { id: 'again', type: 'flow.sequence', x: 0, y: 0, params: {} }
        ],
        [
            wire('f1', ['start', 'out'], ['wait', 'in']),
            wire('f2', ['wait', 'then'], ['again', 'in']),
            wire('f3', ['again', 'first'], ['wait', 'in'])
        ]
    ), { step: 0.5 });

    it.runtime.step();

    assert.equal(it.failures.length, 1, 'reported rather than hung');
    assert.equal(it.failures[0].error.code, 'BUDGET_EXCEEDED');
});

// --- re-entrancy: two passes through one node do not share a wait ----------------------------

test('two executions of one Delay node wait independently', () => {
    // THE CONTRACT THIS MECHANISM EXISTS TO GET RIGHT (ADR-0058 §4). `On Update → Delay(1) →
    // runs + 1` starts a new execution every step; with a timer per NODE the second would
    // overwrite the first and the count would never catch up.
    const it = game(graphOf(
        [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            delay('wait', 1),
            { id: 'read', type: 'property.get', x: 0, y: 0, params: { property: 'p_runs' } },
            { id: 'one', type: 'value.number', x: 0, y: 0, params: { value: 1 } },
            { id: 'add', type: 'math.add', x: 0, y: 0, params: {} },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' } }
        ],
        [
            wire('f1', ['tick', 'out'], ['wait', 'in']),
            wire('f2', ['wait', 'then'], ['write', 'in']),
            wire('d1', ['read', 'value'], ['add', 'a']),
            wire('d2', ['one', 'value'], ['add', 'b']),
            wire('d3', ['add', 'result'], ['write', 'value'])
        ]
    ), { step: 0.5 });

    const behavior = it.behaviors.behaviorFor(values(it));

    for (let step = 0; step < 4; step++) it.runtime.step();

    // Four steps started four waits; the first two have come due (at 1 s and 1.5 s).
    assert.equal(values(it).runs, 2, 'each execution finished on its own account');
    assert.equal(behavior.waiting, 2, 'and the other two are still counting');

    for (let step = 0; step < 2; step++) it.runtime.step();
    assert.equal(values(it).runs, 4, 'six starts, four finished — none overwrote another');
});

test('two instances of one .px keep their own waits', () => {
    const it = game(afterStart(1), { step: 0.5, objects: 2 });

    it.runtime.step();
    // One of them is switched off right after reaching the Delay.
    it.holders[1].active = false;

    it.runtime.step();
    it.runtime.step();

    assert.equal(values(it, 0).mark, 1, 'the one that kept running finished');
    assert.equal(values(it, 1).mark, 0, 'and the other is still where it was');

    it.holders[1].active = true;
    it.runtime.step();
    it.runtime.step();
    assert.equal(values(it, 1).mark, 1, 'it resumed counting where it left off');
});

test('several waits coming due in one step resume in the order they were suspended', () => {
    // ORDER IS NOT ADDED LATER, IT IS THE ORDER THEY WERE PARKED IN — which is itself a
    // function of the canonical walk, so two machines agree on it (ADR-0058 §4).
    const it = game(graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            { id: 'split', type: 'flow.sequence', x: 0, y: 0, params: {} },
            delay('first', 1),
            delay('second', 1),
            { id: 'logFirst', type: 'debug.log', x: 0, y: 0, params: {}, inputs: { value: 'first' } },
            { id: 'logSecond', type: 'debug.log', x: 0, y: 0, params: {}, inputs: { value: 'second' } }
        ],
        [
            wire('f1', ['start', 'out'], ['split', 'in']),
            wire('f2', ['split', 'first'], ['first', 'in']),
            wire('f3', ['split', 'second'], ['second', 'in']),
            wire('f4', ['first', 'then'], ['logFirst', 'in']),
            wire('f5', ['second', 'then'], ['logSecond', 'in'])
        ]
    ), { step: 0.5 });

    const said = [];
    const payload = { type: 'res_log', label: 'Logger', properties: PROPERTIES, graph: it.behaviors.graphOf('res_ctl') };
    // Re-host the same graph with a log sink, so what the two branches say is observable.
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry, log: value => said.push(value) }));
    behaviors.bind(Component, payload.graph);
    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const holder = scene.add(new SceneObject('Holder'));
    holder.addComponent(new Component());
    const runtime = new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 0.5 }) });

    for (let step = 0; step < 3; step++) runtime.step();

    assert.deepEqual(said, ['first', 'second'], 'both came due in one step, in parking order');
});

// --- lifecycle: nothing survives what it belonged to ------------------------------------------

test('destroying the Object drops the wait it was running', () => {
    const it = game(afterStart(1), { step: 0.5 });

    it.runtime.step();
    it.scene.remove(it.holders[0]);

    for (let step = 0; step < 10; step++) it.runtime.step();

    assert.equal(values(it).mark, 0, 'nothing resumed on an Object the scene no longer holds');
    assert.deepEqual(it.failures, [], 'and nothing was reported: there is nothing to cancel');
});

test('removing the Component drops the wait with it', () => {
    const it = game(afterStart(1), { step: 0.5 });

    it.runtime.step();
    const component = values(it);
    it.holders[0].removeComponent(it.type);

    for (let step = 0; step < 10; step++) it.runtime.step();

    assert.equal(component.mark, 0, 'the graph that was waiting is not run any more');
});

test('a switched-off Component holds its wait rather than running it down in the dark', () => {
    // ALIGNED WITH THE STEP, NOT CHOSEN. `Runtime.step()` skips an inactive Component
    // entirely, so its graph is not advanced — which is what every other thing a component
    // does already means by being switched off (ADR-0004).
    const it = game(afterStart(1), { step: 0.5 });

    it.runtime.step();
    values(it).active = false;

    for (let step = 0; step < 10; step++) it.runtime.step();
    assert.equal(values(it).mark, 0, 'five seconds of being off is not five seconds of waiting');

    values(it).active = true;
    it.runtime.step();
    it.runtime.step();
    assert.equal(values(it).mark, 1, 'and the second it still owed is the second it waits');
});

test('a suspended execution is nowhere in what a scene serializes', () => {
    // RUNTIME STATE, NOT SCENE STATE (ADR-0058 §7). A continuation lives in the behavior's
    // closure, which lives in a WeakMap keyed by the component — so a payload carries the
    // component's declared values and nothing else.
    const it = game(afterStart(1), { step: 0.5 });
    it.runtime.step();

    const written = JSON.stringify(serializeScene(it.scene));

    assert.equal(written.includes('remaining'), false);
    assert.equal(written.includes('pending'), false);
    assert.deepEqual(
        globalThis.Object.keys(serializeScene(it.scene).objects[0].components[1].values).sort(),
        ['mark', 'runs']
    );
});

// --- determinism -------------------------------------------------------------------------------

test('two runtimes fed the same steps resume the same waits at the same step', () => {
    const run = () => {
        const it = game(graphOf(
            [
                { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
                delay('wait', 1),
                { id: 'read', type: 'property.get', x: 0, y: 0, params: { property: 'p_runs' } },
                { id: 'one', type: 'value.number', x: 0, y: 0, params: { value: 1 } },
                { id: 'add', type: 'math.add', x: 0, y: 0, params: {} },
                { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' } }
            ],
            [
                wire('f1', ['tick', 'out'], ['wait', 'in']),
                wire('f2', ['wait', 'then'], ['write', 'in']),
                wire('d1', ['read', 'value'], ['add', 'a']),
                wire('d2', ['one', 'value'], ['add', 'b']),
                wire('d3', ['add', 'result'], ['write', 'value'])
            ]
        ), { step: 0.3, objects: 2 });

        const seen = [];
        for (let step = 0; step < 12; step++) {
            it.runtime.step();
            seen.push(values(it, 0).runs);
        }
        return { seen, payload: JSON.stringify(serializeScene(it.scene)) };
    };

    const first = run();
    const second = run();

    assert.deepEqual(first.seen, second.seen, 'the same steps resumed on both');
    assert.equal(first.payload, second.payload, 'and the scenes are byte-identical');
    assert.ok(first.seen.at(-1) > 0, 'something actually resumed');
});

test('a wait carries the values its execution had already produced', () => {
    // WHAT A CONTINUATION KEEPS, AND WHY. `Spawn` before the wait, `Set Position` after it:
    // the handle has to survive the suspension or the copy cannot be placed. It is still
    // re-asked of the Scene on every read, so a destroyed target reads as nothing rather than
    // as a stale Object (ADR-0034 invariant 3, ADR-0056 §4.1).
    const payload = {
        type: 'res_spawner',
        label: 'Spawner',
        properties: { ...PROPERTIES, target: { id: 'p_target', type: 'objectref', default: null } },
        graph: graphOf(
            [
                { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
                { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_target' } },
                delay('wait', 1),
                { id: 'place', type: 'transform.setPosition', x: 0, y: 0, params: {}, inputs: { x: 42, y: 0 } }
            ],
            [
                wire('f1', ['start', 'out'], ['spawn', 'in']),
                wire('f2', ['spawn', 'out'], ['wait', 'in']),
                wire('f3', ['wait', 'then'], ['place', 'in']),
                wire('d1', ['spawn', 'spawned'], ['place', 'object'])
            ]
        )
    };

    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);
    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { registry: types });
    const spawner = scene.add(new SceneObject('Spawner'));
    spawner.addComponent(new Component());
    const model = scene.add(new SceneObject('Model'));
    model.addComponent(new Transform(7, 7));
    spawner.getComponent(payload.type).target = model.id;

    const failures = [];
    const runtime = new Runtime(scene, {
        behaviors, seed: 'alpha',
        clock: new Clock({ fixedStep: 0.5 }),
        onError: report => failures.push(report)
    });

    runtime.step();
    const copy = scene.objects().find(object => object.name === 'Model' && object.id !== model.id);
    assert.ok(copy, 'the copy was made before the wait');
    assert.equal(copy.getComponent('Transform').x, 7, 'and is where its model was');

    runtime.step();
    runtime.step();

    assert.equal(copy.getComponent('Transform').x, 42, 'the wait handed the same Object on');
    assert.equal(model.getComponent('Transform').x, 7, 'and only that one moved');
    assert.deepEqual(failures, []);
});
