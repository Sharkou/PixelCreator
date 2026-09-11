// The tranche that makes a game: moving, touching, animating, and dying (ADR-0058, ADR-0059).
//
// WHY ONE FILE. `Tween`, `Velocity` and `On Collision` were built separately and are used
// together in the first sentence anyone writes — a bullet moves, touches an enemy, and both
// are destroyed inside one step. The interesting failures are all at that junction, so the
// tests live where the junction is rather than three files apart.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent,
    hierarchyOrder,
    registerStandardNodes,
    serializeScene
} from '../core/mod.js';
import { Behaviors } from './scripting/behaviors.js';
import { createGraphInterpreter } from './scripting/interpreter.js';
import { registerBuiltIns } from './builtins.js';
import { BoxCollider } from './collision/collider.js';
import { Velocity } from './components/velocity.js';
import { Clock } from './clock/clock.js';
import { Runtime } from './runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

const PROPERTIES = {
    mark: { id: 'p_mark', type: 'number', default: 0 },
    runs: { id: 'p_runs', type: 'number', default: 0 },
    other: { id: 'p_other', type: 'objectref', default: null }
};

/**
 * A world running one `.px`, with whatever objects the test asks for.
 *
 * @param {object} graph - The graph payload the `.px` carries
 * @param {object} [options] - `{ step, seed }`
 * @returns {object} The scene, a Runtime, a builder and the failures reported
 */
function world(graph, { step = 0.5, seed = 'alpha' } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties: PROPERTIES, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, graph);

    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { id: 'scene_fixed', registry: types });

    /** Put an Object in, with the pieces the test names. */
    const put = (name, { x = 0, y = 0, collider = false, script = false, velocity = null } = {}) => {
        const object = scene.add(new SceneObject(name, { id: `obj_${name}` }));
        object.addComponent(new Transform(x, y));
        if (collider) object.addComponent(new BoxCollider(20, 20));
        if (velocity) object.addComponent(new Velocity(velocity.x ?? 0, velocity.y ?? 0));
        if (script) object.addComponent(new Component());
        return object;
    };

    const failures = [];
    const runtime = new Runtime(scene, {
        behaviors, seed,
        clock: new Clock({ fixedStep: step, maxStepsPerAdvance: 1000 }),
        onError: report => failures.push(report)
    });

    return { scene, runtime, put, failures, type: payload.type, behaviors };
}

const wire = (id, from, to) => ({ id, from: { node: from[0], port: from[1] }, to: { node: to[0], port: to[1] } });
const graphOf = (nodes, connections) => ({ version: 1, nodes, connections });

// --- Velocity ------------------------------------------------------------------------------

test('Velocity moves in units per second, not per frame', () => {
    const coarse = world(graphOf([], []), { step: 0.5 });
    const fine = world(graphOf([], []), { step: 0.05 });

    const slowMover = coarse.put('Mover', { velocity: { x: 100, y: -50 } });
    const fastMover = fine.put('Mover', { velocity: { x: 100, y: -50 } });

    for (let step = 0; step < 2; step++) coarse.runtime.step();
    for (let step = 0; step < 20; step++) fine.runtime.step();

    assert.equal(slowMover.getComponent('Transform').x, 100, 'a second is a second');
    assert.equal(slowMover.getComponent('Transform').y, -50);
    assert.ok(Math.abs(fastMover.getComponent('Transform').x - 100) < 1e-9,
        'twenty small steps, the same second, the same distance');
});

test('Velocity is local, so a parent carries its children', () => {
    const it = world(graphOf([], []));
    const boat = it.put('Boat', { velocity: { x: 10, y: 0 } });
    const crate = it.put('Crate', { x: 5, velocity: { x: 10, y: 0 } });
    boat.addChild(crate);

    it.runtime.step();
    it.runtime.step();

    assert.equal(boat.getComponent('Transform').x, 10, 'the boat moved ten');
    assert.equal(crate.getComponent('Transform').x, 15, 'and the crate moved ten ON the boat');
});

test('a switched-off Velocity moves nothing, and neither does a switched-off Object', () => {
    const it = world(graphOf([], []));
    const off = it.put('Off', { velocity: { x: 100 } });
    const hidden = it.put('Hidden', { velocity: { x: 100 } });

    off.getComponent('Velocity').active = false;
    hidden.active = false;
    it.runtime.step();
    it.runtime.step();

    assert.equal(off.getComponent('Transform').x, 0);
    assert.equal(hidden.getComponent('Transform').x, 0);
});

test('two runtimes fed the same steps move to the same place', () => {
    const run = () => {
        const it = world(graphOf([], []), { step: 0.3 });
        it.put('Mover', { velocity: { x: 37.5, y: -12.25 } });
        for (let step = 0; step < 11; step++) it.runtime.step();
        return JSON.stringify(serializeScene(it.scene));
    };

    assert.equal(run(), run());
});

test('a Velocity on an Object with no Transform does nothing, and says nothing', () => {
    const it = world(graphOf([], []));
    const bare = it.scene.add(new SceneObject('Bare'));
    bare.addComponent(new Velocity(100, 0));

    it.runtime.step();

    assert.deepEqual(it.failures, []);
});

// --- Tween ---------------------------------------------------------------------------------

/** `On Start → Tween(from, to, duration) → Update → mark = Value`. */
function tweening(from, to, duration, { event = 'event.start' } = {}) {
    return graphOf(
        [
            { id: 'go', type: event, x: 0, y: 0, params: {} },
            { id: 'tween', type: 'flow.tween', x: 0, y: 0, params: {}, inputs: { from, to, duration } },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_mark' } },
            { id: 'done', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' }, inputs: { value: 1 } }
        ],
        [
            wire('f1', ['go', 'out'], ['tween', 'in']),
            wire('f2', ['tween', 'update'], ['write', 'in']),
            wire('f3', ['tween', 'done'], ['done', 'in']),
            wire('d1', ['tween', 'value'], ['write', 'value'])
        ]
    );
}

test('a Tween starts at From, moves, and lands exactly on To', () => {
    const it = world(tweening(0, 100, 1), { step: 0.25 });
    const holder = it.put('Holder', { script: true });
    const values = () => holder.getComponent(it.type);

    it.runtime.step();
    assert.equal(values().mark, 0, 'it starts where it starts');
    assert.equal(values().runs, 0);

    it.runtime.step();
    assert.equal(values().mark, 25);
    it.runtime.step();
    assert.equal(values().mark, 50);
    it.runtime.step();
    assert.equal(values().mark, 75);

    it.runtime.step();
    assert.equal(values().mark, 100, 'exactly To, never To minus a rounding error');
    assert.equal(values().runs, 1, 'and Done fired');

    for (let step = 0; step < 5; step++) it.runtime.step();
    assert.equal(values().runs, 1, 'once, and only once');
    assert.deepEqual(it.failures, []);
});

test('a Tween of no duration is over where it started, in the same step', () => {
    for (const duration of [0, -1, NaN, 'soon']) {
        const it = world(tweening(10, 90, duration), { step: 0.5 });
        const holder = it.put('Holder', { script: true });

        it.runtime.step();

        assert.equal(holder.getComponent(it.type).mark, 90, `${duration}`);
        assert.equal(holder.getComponent(it.type).runs, 1);
        assert.deepEqual(it.failures, []);
    }
});

test('a Tween is a duration, not a number of frames', () => {
    const coarse = world(tweening(0, 100, 1), { step: 0.5 });
    const fine = world(tweening(0, 100, 1), { step: 0.1 });
    const slow = coarse.put('Holder', { script: true });
    const quick = fine.put('Holder', { script: true });

    for (let step = 0; step < 3; step++) coarse.runtime.step();
    for (let step = 0; step < 11; step++) fine.runtime.step();

    assert.equal(slow.getComponent(coarse.type).mark, 100);
    assert.equal(quick.getComponent(fine.type).mark, 100);
});

test('two executions of one Tween node never share their progress', () => {
    // THE WHOLE REASON A CONTINUATION CARRIES PRIVATE STATE (ADR-0058 §6.3). A number stored
    // on the node would make the second pass overwrite the first, and a creator would see one
    // animation restart every time a second one began.
    const it = world(tweening(0, 100, 1, { event: 'event.update' }), { step: 0.25 });
    const holder = it.put('Holder', { script: true });
    const behavior = it.behaviors.behaviorFor(holder.getComponent(it.type));

    it.runtime.step();
    it.runtime.step();
    it.runtime.step();

    assert.equal(behavior.waiting, 3, 'three steps started three journeys, all still running');
    // The oldest is furthest along, and it is the last to write — so the value seen is the
    // youngest one's, which is the deterministic consequence of the parking order (§4.1).
    assert.equal(holder.getComponent(it.type).mark, 0);
    assert.deepEqual(it.failures, []);
});

test('two instances of one .px tween independently', () => {
    const it = world(tweening(0, 100, 1), { step: 0.5 });
    const first = it.put('First', { script: true });
    const second = it.put('Second', { script: true });

    it.runtime.step();
    second.active = false;
    it.runtime.step();
    it.runtime.step();

    assert.equal(first.getComponent(it.type).mark, 100, 'the one that kept running finished');
    assert.equal(second.getComponent(it.type).mark, 0, 'and the other is frozen where it was');

    second.active = true;
    it.runtime.step();
    it.runtime.step();
    assert.equal(second.getComponent(it.type).mark, 100, 'it picked up where it had been held');
});

test('destroying the Object drops the Tween that was running on it', () => {
    const it = world(tweening(0, 100, 1), { step: 0.5 });
    const holder = it.put('Holder', { script: true });

    it.runtime.step();
    it.scene.remove(holder);
    for (let step = 0; step < 5; step++) it.runtime.step();

    assert.equal(holder.getComponent(it.type).mark, 0);
    assert.deepEqual(it.failures, []);
});

test('two runtimes tween identically, and nothing of it is serialized', () => {
    const run = () => {
        const it = world(tweening(0, 100, 1), { step: 0.3 });
        it.put('Holder', { script: true });
        const seen = [];
        for (let step = 0; step < 6; step++) {
            it.runtime.step();
            seen.push(it.scene.get('obj_Holder').getComponent(it.type).mark);
        }
        return { seen, payload: JSON.stringify(serializeScene(it.scene)) };
    };

    const first = run();
    const second = run();

    assert.deepEqual(first.seen, second.seen);
    assert.equal(first.payload, second.payload);
    assert.equal(first.payload.includes('elapsed'), false, 'a journey is not scene state');
});

// --- On Collision --------------------------------------------------------------------------

/** `On Collision ▸ <phase> → runs + 1`, remembering who it was. */
function onCollision(phase) {
    return graphOf(
        [
            { id: 'hit', type: 'scene.onCollision', x: 0, y: 0, params: {} },
            { id: 'read', type: 'property.get', x: 0, y: 0, params: { property: 'p_runs' } },
            { id: 'one', type: 'value.number', x: 0, y: 0, params: { value: 1 } },
            { id: 'add', type: 'math.add', x: 0, y: 0, params: {} },
            { id: 'count', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' } },
            { id: 'who', type: 'property.set', x: 0, y: 0, params: { property: 'p_other' } }
        ],
        [
            wire('f1', ['hit', phase], ['count', 'in']),
            wire('f2', ['count', 'out'], ['who', 'in']),
            wire('d1', ['read', 'value'], ['add', 'a']),
            wire('d2', ['one', 'value'], ['add', 'b']),
            wire('d3', ['add', 'result'], ['count', 'value']),
            wire('d4', ['hit', 'other'], ['who', 'value'])
        ]
    );
}

test('Enter fires once, on the step the two start touching', () => {
    const it = world(onCollision('enter'));
    const player = it.put('Player', { collider: true, script: true });
    const enemy = it.put('Enemy', { x: 500, collider: true });
    const values = () => player.getComponent(it.type);

    it.runtime.step();
    assert.equal(values().runs, 0);

    enemy.getComponent('Transform').x = 10;
    it.runtime.step();
    assert.equal(values().runs, 1);
    assert.equal(values().other, enemy.id, 'and it was told who');

    it.runtime.step();
    it.runtime.step();
    assert.equal(values().runs, 1, 'still touching is not starting to touch');
    assert.deepEqual(it.failures, []);
});

test('Stay fires every step after the first, and never on it', () => {
    const it = world(onCollision('stay'));
    const player = it.put('Player', { collider: true, script: true });
    it.put('Enemy', { x: 10, collider: true });

    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 0, 'the first step is Enter and nothing else');

    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 1);
    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 2);
});

test('Exit fires once, on the step they stop touching', () => {
    const it = world(onCollision('exit'));
    const player = it.put('Player', { collider: true, script: true });
    const enemy = it.put('Enemy', { x: 10, collider: true });

    it.runtime.step();
    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 0);

    enemy.getComponent('Transform').x = 500;
    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 1);

    it.runtime.step();
    it.runtime.step();
    assert.equal(player.getComponent(it.type).runs, 1, 'apart is not becoming apart');
});

test('touching two things at once is two events, each with its own Other', () => {
    // ADR-0059 §5.1: one firing could only carry one `Other`, so the node answers a list and
    // the interpreter runs each with its own pushed value.
    const it = world(onCollision('enter'));
    const player = it.put('Player', { collider: true, script: true });
    it.put('Left', { x: -8, collider: true });
    it.put('Right', { x: 8, collider: true });

    it.runtime.step();

    assert.equal(player.getComponent(it.type).runs, 2, 'two collisions, counted twice');
    assert.deepEqual(it.failures, []);
});

test('both Objects get the event, each pointed at the other', () => {
    const it = world(onCollision('enter'));
    const a = it.put('A', { collider: true, script: true });
    const b = it.put('B', { x: 10, collider: true, script: true });

    it.runtime.step();

    assert.equal(a.getComponent(it.type).other, b.id);
    assert.equal(b.getComponent(it.type).other, a.id);
});

test('two runtimes see the same transitions on the same steps', () => {
    const run = () => {
        const it = world(onCollision('enter'), { step: 0.25 });
        const player = it.put('Player', { collider: true, script: true, velocity: { x: 40 } });
        it.put('Enemy', { x: 30, collider: true });

        const seen = [];
        for (let step = 0; step < 8; step++) {
            it.runtime.step();
            seen.push(player.getComponent(it.type).runs);
        }
        return { seen, payload: JSON.stringify(serializeScene(it.scene)) };
    };

    const first = run();
    const second = run();

    assert.deepEqual(first.seen, second.seen);
    assert.equal(first.payload, second.payload);
    assert.ok(first.seen.at(-1) > 0, 'they actually met');
});

// --- collision, Destroy and Spawn together -----------------------------------------------------

test('two Objects destroying each other on contact is one event each, and no crash', () => {
    // THE DANGEROUS ONE. Both graphs fire in the same step; the first `Destroy` must not
    // delete the second's event, and the second must not run on an Object that has gone
    // (ADR-0059 §4, ADR-0056 §5).
    const it = world(graphOf(
        [
            { id: 'hit', type: 'scene.onCollision', x: 0, y: 0, params: {} },
            { id: 'kill', type: 'scene.destroy', x: 0, y: 0, params: {} }
        ],
        [wire('f1', ['hit', 'enter'], ['kill', 'in'])]
    ));

    const bullet = it.put('Bullet', { collider: true, script: true });
    const enemy = it.put('Enemy', { x: 10, collider: true, script: true });

    it.runtime.step();

    assert.equal(it.scene.has(bullet), false, 'the bullet destroyed itself');
    assert.equal(it.scene.has(enemy), false, 'and so did the enemy, on its own event');
    assert.deepEqual(it.failures, []);

    for (let step = 0; step < 5; step++) it.runtime.step();
    assert.equal(it.scene.size, 0);
    assert.deepEqual(it.failures, [], 'and nothing kept firing at a ghost');
});

test('an Object destroyed during the step raises no Stay and no Exit afterwards', () => {
    const it = world(graphOf(
        [
            { id: 'hit', type: 'scene.onCollision', x: 0, y: 0, params: {} },
            { id: 'read', type: 'property.get', x: 0, y: 0, params: { property: 'p_runs' } },
            { id: 'one', type: 'value.number', x: 0, y: 0, params: { value: 1 } },
            { id: 'add', type: 'math.add', x: 0, y: 0, params: {} },
            { id: 'count', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' } }
        ],
        [
            wire('f1', ['hit', 'enter'], ['count', 'in']),
            wire('f2', ['hit', 'stay'], ['count', 'in']),
            wire('f3', ['hit', 'exit'], ['count', 'in']),
            wire('d1', ['read', 'value'], ['add', 'a']),
            wire('d2', ['one', 'value'], ['add', 'b']),
            wire('d3', ['add', 'result'], ['count', 'value'])
        ]
    ));

    const watcher = it.put('Watcher', { collider: true, script: true });
    const doomed = it.put('Doomed', { x: 10, collider: true });

    it.runtime.step();
    assert.equal(watcher.getComponent(it.type).runs, 1, 'Enter');

    it.scene.remove(doomed);
    for (let step = 0; step < 5; step++) it.runtime.step();

    assert.equal(watcher.getComponent(it.type).runs, 1, 'no Exit for something that ceased to be');
    assert.deepEqual(it.failures, []);
});

test('a bullet spawned into an enemy collides on the step after it appears', () => {
    // AN OBJECT CREATED DURING A STEP IS NOT SIMULATED IN IT (ADR-0056 §5), and the overlaps
    // were decided before it existed — so its first contact is reported on the next step,
    // which is the same answer both halves of the runtime already give.
    const it = world(graphOf(
        [
            { id: 'start', type: 'event.start', x: 0, y: 0, params: {} },
            { id: 'spawn', type: 'scene.spawn', x: 0, y: 0, params: { target: 'p_other' } }
        ],
        [wire('f1', ['start', 'out'], ['spawn', 'in'])]
    ));

    const spawner = it.put('Spawner', { x: 300, script: true });
    const model = it.put('Model', { x: 0, collider: true });
    it.put('Enemy', { x: 5, collider: true });
    spawner.getComponent(it.type).other = model.id;

    it.runtime.step();
    const copy = hierarchyOrder(it.scene).filter(object => object.name === 'Model').at(-1);
    assert.notEqual(copy.id, model.id, 'a copy was made');
    assert.equal(it.runtime.collisions.overlapping(copy, it.scene.get('obj_Enemy')), false,
        'the step that made it had already decided its overlaps');

    it.runtime.step();
    assert.equal(it.runtime.collisions.overlapping(copy, it.scene.get('obj_Enemy')), true);
    assert.deepEqual(it.failures, []);
});

// --- Is Overlapping ---------------------------------------------------------------------------

test('Is Overlapping answers the same snapshot the events do', () => {
    const it = world(graphOf(
        [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'me', type: 'scene.self', x: 0, y: 0, params: {} },
            { id: 'them', type: 'reference.object', x: 0, y: 0, params: { object: 'p_other' } },
            { id: 'ask', type: 'object.isOverlapping', x: 0, y: 0, params: {} },
            { id: 'write', type: 'property.set', x: 0, y: 0, params: { property: 'p_mark' } }
        ],
        [
            wire('f1', ['tick', 'out'], ['write', 'in']),
            wire('d1', ['me', 'object'], ['ask', 'a']),
            wire('d2', ['them', 'object'], ['ask', 'b']),
            wire('d3', ['ask', 'result'], ['write', 'value'])
        ]
    ));

    const player = it.put('Player', { collider: true, script: true });
    const door = it.put('Door', { x: 500, collider: true });
    player.getComponent(it.type).other = door.id;

    it.runtime.step();
    assert.equal(player.getComponent(it.type).mark, false);

    door.getComponent('Transform').x = 10;
    it.runtime.step();
    assert.equal(player.getComponent(it.type).mark, true);

    it.scene.remove(door);
    it.runtime.step();
    assert.equal(player.getComponent(it.type).mark, false, 'a destroyed target overlaps nothing');
    assert.deepEqual(it.failures, []);
});

test('Is Overlapping is false when there is no collider to speak of', () => {
    const it = world(graphOf([], []));
    const a = it.put('A', { collider: true });
    const bare = it.put('Bare');

    it.runtime.step();

    assert.equal(it.runtime.collisions.overlapping(a, bare), false);
});

// --- Delta Time -------------------------------------------------------------------------------

test('Delta Time and Time read the simulation clock, and nothing else', () => {
    const it = world(graphOf(
        [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'dt', type: 'time.delta', x: 0, y: 0, params: {} },
            { id: 'now', type: 'time.now', x: 0, y: 0, params: {} },
            { id: 'a', type: 'property.set', x: 0, y: 0, params: { property: 'p_mark' } },
            { id: 'b', type: 'property.set', x: 0, y: 0, params: { property: 'p_runs' } }
        ],
        [
            wire('f1', ['tick', 'out'], ['a', 'in']),
            wire('f2', ['a', 'out'], ['b', 'in']),
            wire('d1', ['dt', 'seconds'], ['a', 'value']),
            wire('d2', ['now', 'seconds'], ['b', 'value'])
        ]
    ), { step: 0.25 });

    const holder = it.put('Holder', { script: true });

    it.runtime.step();
    assert.equal(holder.getComponent(it.type).mark, 0.25);
    assert.equal(holder.getComponent(it.type).runs, 0, 'the first step begins at zero');

    it.runtime.step();
    assert.equal(holder.getComponent(it.type).runs, 0.25);
});
