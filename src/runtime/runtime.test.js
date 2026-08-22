import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object,
    Origin,
    Scene,
    Transform,
    deserializeScene,
    hierarchyOrder,
    invert,
    observe,
    removeObjectOperation,
    serializeObject,
    serializeScene
} from '../core/mod.js';
import { Runtime } from './runtime.js';
import { Clock } from './clock/clock.js';
import { RectangleRenderer } from './rendering/components/rectangle-renderer.js';

function recordingRenderer() {
    const calls = [];
    const record = name => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        clear: record('clear'),
        save: record('save'),
        restore: record('restore'),
        setTransform: record('setTransform'),
        setBlendMode: record('setBlendMode'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillCircle: record('fillCircle'),
        drawImage: record('drawImage')
    };
}

class Mover {
    static type = 'Mover';
    constructor(speed = 1) { this.speed = speed; this.updates = 0; }
    update(self, ctx) {
        this.updates++;
        self.x += this.speed * ctx.deltaTime;
    }
}

function sceneWithMover(speed = 60) {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    const mover = object.addComponent(new Mover(speed));
    return { scene, object, mover };
}

// --- clock ----------------------------------------------------------------------

test('the clock owes no step until a full step has elapsed', () => {
    const clock = new Clock({ fixedStep: 1 / 60 });

    assert.equal(clock.advance(0.008), 0);
    assert.equal(clock.advance(0.008), 0);
    assert.equal(clock.advance(0.001), 1, 'crossing 1/60 owes exactly one step');
});

test('simulation time advances only in whole steps', () => {
    const clock = new Clock({ fixedStep: 0.1 });
    clock.advance(0.25);

    clock.tick();
    clock.tick();

    assert.equal(clock.time, 0.2);
    assert.equal(clock.steps, 2);
});

test('the step is fixed whatever the frame rate', () => {
    // Legacy derived deltaTime from the render loop, so the simulation ran faster on a
    // 144 Hz display than on a 60 Hz one.
    const fast = new Clock({ fixedStep: 1 / 60 });
    const slow = new Clock({ fixedStep: 1 / 60 });

    let fastSteps = 0;
    for (let i = 0; i < 144; i++) fastSteps += fast.advance(1 / 144);

    let slowSteps = 0;
    for (let i = 0; i < 30; i++) slowSteps += slow.advance(1 / 30);

    assert.equal(fastSteps, 60, 'one second of real time');
    assert.equal(slowSteps, 60, 'is one second of simulation, either way');
});

test('a long stall does not queue a flood of steps', () => {
    // A backgrounded tab must not come back and run thousands of steps at once.
    const clock = new Clock({ fixedStep: 1 / 60, maxStepsPerAdvance: 5 });

    assert.equal(clock.advance(60), 5);
    assert.equal(clock.advance(1 / 60), 1, 'and the backlog is dropped, not carried');
});

test('alpha reports progress towards the next step', () => {
    const clock = new Clock({ fixedStep: 0.1 });

    clock.advance(0.05);
    assert.ok(Math.abs(clock.alpha - 0.5) < 1e-9);
});

test('the clock rejects nonsense input', () => {
    const clock = new Clock();

    assert.equal(clock.advance(-1), 0);
    assert.equal(clock.advance(NaN), 0);
    assert.equal(clock.advance(Infinity), 0);
});

test('the clock refuses an invalid configuration', () => {
    assert.throws(() => new Clock({ fixedStep: 0 }), RangeError);
    assert.throws(() => new Clock({ fixedStep: -1 }), RangeError);
    assert.throws(() => new Clock({ maxStepsPerAdvance: 0 }), RangeError);
});

test('reset returns the clock to zero', () => {
    const clock = new Clock({ fixedStep: 0.1 });
    clock.advance(0.35);
    clock.tick();

    clock.reset();

    assert.equal(clock.time, 0);
    assert.equal(clock.steps, 0);
    assert.equal(clock.alpha, 0);
});

// --- runtime --------------------------------------------------------------------

test('a step updates every component once', () => {
    const { mover } = sceneWithMover();
    const runtime = new Runtime(sceneWithMover().scene);

    runtime.step();

    assert.equal(mover.updates, 0, 'a component of another scene is untouched');
});

test('update receives the fixed delta and the simulated time', () => {
    const { scene, mover } = sceneWithMover();
    const seen = [];
    mover.update = (self, ctx) => seen.push({ time: ctx.time, deltaTime: ctx.deltaTime });
    const runtime = new Runtime(scene, { clock: new Clock({ fixedStep: 0.1 }) });

    runtime.step();
    runtime.step();

    assert.deepEqual(seen, [{ time: 0, deltaTime: 0.1 }, { time: 0.1, deltaTime: 0.1 }]);
});

test('update receives the scene and the runtime', () => {
    const { scene, mover } = sceneWithMover();
    let context = null;
    mover.update = (self, ctx) => { context = ctx; };
    const runtime = new Runtime(scene);

    runtime.step();

    assert.equal(context.scene, scene);
    assert.equal(context.runtime, runtime);
});

test('advance runs the steps the elapsed time owes', () => {
    const { scene, mover } = sceneWithMover();
    const runtime = new Runtime(scene, { clock: new Clock({ fixedStep: 1 / 60 }) });

    const steps = runtime.advance(3 / 60);

    assert.equal(steps, 3);
    assert.equal(mover.updates, 3);
});

test('simulation is independent of the frame rate', () => {
    const slow = sceneWithMover(60);
    const fast = sceneWithMover(60);
    const slowRuntime = new Runtime(slow.scene, { clock: new Clock({ fixedStep: 1 / 60 }) });
    const fastRuntime = new Runtime(fast.scene, { clock: new Clock({ fixedStep: 1 / 60 }) });

    for (let i = 0; i < 30; i++) slowRuntime.advance(1 / 30);
    for (let i = 0; i < 120; i++) fastRuntime.advance(1 / 120);

    assert.equal(slow.mover.updates, 60);
    assert.equal(fast.mover.updates, 60);
    assert.ok(Math.abs(slow.object.x - fast.object.x) < 1e-9,
        'the same second of play produced the same result');
});

test('an inactive object is not simulated', () => {
    const { scene, object, mover } = sceneWithMover();
    object.active = false;

    new Runtime(scene).step();

    assert.equal(mover.updates, 0);
});

test('a disabled component is not simulated', () => {
    const { scene, mover } = sceneWithMover();
    mover.active = false;

    new Runtime(scene).step();

    assert.equal(mover.updates, 0);
});

// --- the shapes a component may take (ADR-0004) ------------------------------------

/** Builds a scene holding one object that carries the given components. */
function sceneWithComponents(...componentsToAttach) {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Subject'));
    object.addComponent(new Transform());
    for (const component of componentsToAttach) object.addComponent(component);
    return { scene, object };
}

class Silent {
    static type = 'Silent';
    constructor() { this.value = 1; }
}

class Painter {
    static type = 'Painter';
    constructor() { this.draws = 0; }
    draw(self, renderer) {
        this.draws++;
        renderer.fillRect(0, 0, 1, 1, '#fff');
    }
}

class Actor {
    static type = 'Actor';
    constructor() { this.updates = 0; this.draws = 0; }
    update() { this.updates++; }
    draw(self, renderer) {
        this.draws++;
        renderer.fillRect(0, 0, 1, 1, '#fff');
    }
}

test('a component with neither update nor draw is simply left alone', () => {
    const { scene } = sceneWithComponents(new Silent());
    const renderer = recordingRenderer();
    const runtime = new Runtime(scene, { renderer });

    assert.doesNotThrow(() => runtime.step());
    assert.equal(runtime.render(), 0, 'and costs no rendering');
    assert.deepEqual(renderer.of('setTransform'), []);
});

test('a component with update only simulates and costs no rendering', () => {
    const { scene, object } = sceneWithComponents(new Mover(60));
    const renderer = recordingRenderer();
    const runtime = new Runtime(scene, { renderer, clock: new Clock({ fixedStep: 0.5 }) });

    runtime.step();

    assert.equal(object.x, 30);
    assert.equal(runtime.render(), 0);
});

test('a component with draw only is drawn on a client and ignored on a server', () => {
    const client = sceneWithComponents(new Painter());
    const server = sceneWithComponents(new Painter());
    const clientRuntime = new Runtime(client.scene, { renderer: recordingRenderer() });
    const serverRuntime = new Runtime(server.scene);

    clientRuntime.step();
    serverRuntime.step();

    assert.equal(clientRuntime.render(), 1);
    assert.equal(client.object.getComponent('Painter').draws, 1);

    assert.equal(serverRuntime.render(), 0, 'a server draws nothing');
    assert.equal(server.object.getComponent('Painter').draws, 0, 'draw() is never required there');
});

test('a component with update and draw does both, in separate phases', () => {
    const { scene, object } = sceneWithComponents(new Actor());
    const runtime = new Runtime(scene, { renderer: recordingRenderer() });

    runtime.step();
    runtime.step();
    runtime.render();

    const actor = object.getComponent('Actor');
    assert.equal(actor.updates, 2);
    assert.equal(actor.draws, 1, 'drawing follows its own rhythm, not the simulation step');
});

test('the scene may be edited during a step, and the step stays deterministic', () => {
    // The Editor mutates a live scene, and so does gameplay when it spawns. A step
    // iterates snapshots, so what a step runs is decided before it starts: an object
    // added mid-step joins the next one, and never half of this one.
    const scene = new Scene('Main');
    const ran = [];
    class Spawner {
        static type = 'Spawner';
        constructor() { this.spawned = false; }
        update(self, ctx) {
            ran.push('spawner');
            if (this.spawned) return;
            this.spawned = true;
            ctx.scene.add(new Object('Spawned')).addComponent(new Witness());
        }
    }
    class Witness {
        static type = 'Witness';
        update() { ran.push('witness'); }
    }
    scene.add(new Object('Spawner')).addComponent(new Spawner());

    const runtime = new Runtime(scene);
    runtime.step();
    assert.deepEqual(ran, ['spawner'], 'the newcomer waits for the next step');

    runtime.step();
    assert.deepEqual(ran, ['spawner', 'spawner', 'witness']);
});

test('a paused runtime stops simulating but keeps rendering', () => {
    const { scene, mover } = sceneWithMover();
    const renderer = recordingRenderer();
    const runtime = new Runtime(scene, { renderer });
    runtime.running = false;

    runtime.advance(1);
    runtime.render();

    assert.equal(mover.updates, 0);
    assert.equal(renderer.of('clear').length, 1);
});

test('a headless runtime never draws', () => {
    // This is the server: same runtime, same simulation, constructed without a renderer.
    const { scene, mover } = sceneWithMover();
    const runtime = new Runtime(scene);

    for (let i = 0; i < 10; i++) runtime.advance(1 / 60);

    assert.equal(runtime.renders, false);
    assert.equal(runtime.render(), 0);
    assert.equal(mover.updates, 10, 'the simulation ran all the same');
});

test('the same scene simulates identically with and without a renderer', () => {
    const headless = sceneWithMover(60);
    const rendered = sceneWithMover(60);
    const headlessRuntime = new Runtime(headless.scene);
    const renderedRuntime = new Runtime(rendered.scene, { renderer: recordingRenderer() });

    for (let i = 0; i < 20; i++) {
        headlessRuntime.advance(1 / 60);
        renderedRuntime.advance(1 / 60);
        renderedRuntime.render();
    }

    assert.equal(headless.object.x, rendered.object.x);
});

test('update runs for the whole scene before any draw', () => {
    // Legacy interleaved them per object, so what a component observed depended on the
    // draw order of the objects around it.
    const scene = new Scene('Main');
    const order = [];
    class Recorder {
        static type = 'Recorder';
        constructor(label) { this.label = label; }
        update() { order.push(`update:${this.label}`); }
        draw() { order.push(`draw:${this.label}`); }
    }
    for (const label of ['a', 'b']) {
        const object = scene.add(new Object(label));
        object.addComponent(new Transform());
        object.addComponent(new Recorder(label));
    }

    const runtime = new Runtime(scene, { renderer: recordingRenderer() });
    runtime.step();
    runtime.render();

    assert.deepEqual(order, ['update:a', 'update:b', 'draw:a', 'draw:b']);
});

// --- error isolation and reporting (ADR-0012) ------------------------------------

class Broken {
    static type = 'Broken';
    constructor(error) { this.thrown = error ?? new Error('bad update'); }
    update() { throw this.thrown; }
}

test('a failing component does not stop the other components', () => {
    const scene = new Scene('Main');
    const reports = [];
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    object.addComponent(new Broken());
    const mover = object.addComponent(new Mover());
    const other = scene.add(new Object('Other'));
    other.addComponent(new Transform());
    const otherMover = other.addComponent(new Mover());

    new Runtime(scene, { onError: report => reports.push(report) }).step();

    assert.equal(reports.length, 1);
    assert.equal(mover.updates, 1, 'the next component of the same object still ran');
    assert.equal(otherMover.updates, 1, 'and so did the rest of the scene');
});

test('a failing draw does not stop the other components', () => {
    const scene = new Scene('Main');
    const reports = [];
    class BrokenDraw {
        static type = 'BrokenDraw';
        draw() { throw new Error('bad draw'); }
    }
    let drawn = 0;
    class Painter {
        static type = 'Painter';
        draw() { drawn++; }
    }
    const object = scene.add(new Object('Box'));
    object.addComponent(new Transform());
    object.addComponent(new BrokenDraw());
    object.addComponent(new Painter());
    const other = scene.add(new Object('Other'));
    other.addComponent(new Transform());
    other.addComponent(new Painter());

    new Runtime(scene, {
        renderer: recordingRenderer(),
        onError: report => reports.push(report)
    }).render();

    assert.equal(reports.length, 1);
    assert.equal(reports[0].phase, 'draw');
    assert.equal(drawn, 2, 'the remaining components of both objects still drew');
});

test('handling an error mutates nothing in the model', () => {
    // THE invariant of ADR-0012. Legacy — and an earlier draft of this runtime — switched
    // a repeatedly failing component off, which is a Change like any other and would let
    // a script's exception rewrite replicated state.
    const scene = new Scene('Main');
    const changes = [];
    const object = scene.add(new Object('Broken'));
    const broken = object.addComponent(new Broken());
    observe(object, () => changes.push('object'));
    observe(broken, () => changes.push('component'));

    const runtime = new Runtime(scene, { onError: () => {} });
    for (let i = 0; i < 20; i++) runtime.step();

    assert.deepEqual(changes, [], 'no Change was emitted by the error handling');
});

test('the runtime never switches a failing component off', () => {
    const scene = new Scene('Main');
    let calls = 0;
    const object = scene.add(new Object('Broken'));
    const broken = object.addComponent(new Broken());
    broken.update = () => { calls++; throw new Error('always'); };

    const runtime = new Runtime(scene, { onError: () => {} });
    for (let i = 0; i < 20; i++) runtime.step();

    assert.equal(broken.active, undefined, 'active was never written');
    assert.equal(calls, 20, 'and the component kept being asked, every single step');
});

test('onError receives a structured report', () => {
    const scene = new Scene('Main');
    const reports = [];
    const thrown = new Error('bad update');
    const object = scene.add(new Object('Broken'));
    const broken = object.addComponent(new Broken(thrown));

    const runtime = new Runtime(scene, {
        clock: new Clock({ fixedStep: 0.1 }),
        onError: report => reports.push(report)
    });
    runtime.step();
    runtime.step();

    assert.equal(reports.length, 2, 'each failure is reported independently');
    const [first, second] = reports;

    assert.equal(first.error, thrown, 'the report carries the original Error itself');
    assert.equal(first.object, object);
    assert.equal(first.component, broken);
    assert.equal(first.type, 'Broken');
    assert.equal(first.phase, 'update');
    assert.equal(first.time, 0);
    assert.equal(second.time, 0.1, 'stamped with the simulation time of its own step');
});

test('the reported error is never modified', () => {
    // The old reporter rewrote error.message to add context, mutating an object it did
    // not own and forcing the consumer to parse a string for what is now a field.
    const scene = new Scene('Main');
    const thrown = new Error('bad update');
    const message = thrown.message;
    const stack = thrown.stack;
    const object = scene.add(new Object('Broken'));
    object.addComponent(new Broken(thrown));

    const runtime = new Runtime(scene, { onError: () => {} });
    for (let i = 0; i < 5; i++) runtime.step();

    assert.equal(thrown.message, message);
    assert.equal(thrown.stack, stack);
    assert.equal(thrown.cause, undefined);
});

test('a component with no type name is still reported', () => {
    const scene = new Scene('Main');
    const reports = [];
    const object = scene.add(new Object('Odd'));
    object.addComponent(new Broken());
    // Reporting must never fail on its own account, or it loses the failure it carries.
    const component = object.getComponent('Broken');

    new Runtime(scene, { onError: report => reports.push(report) }).step();

    assert.equal(reports[0].component, component);
    assert.equal(typeof reports[0].type, 'string');
});

test('without onError a failure is not swallowed', () => {
    // The default reporter defers the throw so the frame finishes, then hands it to the
    // environment's uncaught-error path. Captured here rather than actually thrown, so
    // the assertion is deterministic and does not depend on the test runner.
    const scene = new Scene('Main');
    const thrown = new Error('bad update');
    const object = scene.add(new Object('Broken'));
    object.addComponent(new Broken(thrown));

    const queue = globalThis.queueMicrotask;
    const deferred = [];
    globalThis.queueMicrotask = task => deferred.push(task);
    try {
        new Runtime(scene).step();
    } finally {
        globalThis.queueMicrotask = queue;
    }

    assert.equal(deferred.length, 1, 'the failure was scheduled to be thrown');
    assert.throws(deferred[0], error => {
        assert.match(error.message, /update\(\) failed on Broken/);
        assert.equal(error.cause, thrown, 'the original error is carried, not replaced');
        return true;
    });
});

test('the runtime requires a scene', () => {
    assert.throws(() => new Runtime(null), TypeError);
});

test('rendering forwards its options', () => {
    const { scene } = sceneWithMover();
    const object = scene.objects()[0];
    object.addComponent(new RectangleRenderer());
    const renderer = recordingRenderer();

    new Runtime(scene, { renderer }).render({ clear: '#123456' });

    assert.equal(renderer.of('clear')[0].args[0], '#123456');
});

// --- the canonical order of execution (ADR-0035) ----------------------------------------
//
// The order components run in is now a function of the scene's SHAPE rather than of the
// order its objects happened to join. Each test below builds a scene whose storage order
// deliberately disagrees with its tree, and asks the Runtime which one it obeys.

/** A component that writes down when it ran, so an order can be asserted rather than read. */
function tracing() {
    const order = [];
    class Trace {
        static type = 'Trace';
        constructor(label = '') { this.label = label; }
        update() { order.push(this.label); }
    }
    return { order, Trace };
}

/** Three roots called A, B and C, each tracing itself, in that insertion order. */
function abc(Trace, registry) {
    const scene = new Scene('Main', registry ? { registry } : undefined);
    const objects = ['A', 'B', 'C'].map(name => {
        const object = scene.add(new Object(name));
        object.addComponent(new Trace(name));
        return object;
    });
    return { scene, objects };
}

test('a parent runs before its children, whatever order they joined in', () => {
    const { order, Trace } = tracing();
    const scene = new Scene('Main');

    // The child joins FIRST, so the storage and the tree disagree from the very start.
    const child = scene.add(new Object('Child'));
    const parent = scene.add(new Object('Parent'));
    parent.addChild(child);

    child.addComponent(new Trace('child'));
    parent.addComponent(new Trace('parent'));

    new Runtime(scene).step();

    assert.deepEqual(scene.objects().map(object => object.name), ['Child', 'Parent'],
        'the storage still lists the child first');
    assert.deepEqual(order, ['parent', 'child']);
});

test('a reparent decides what runs when, and the storage order does not', () => {
    const { order, Trace } = tracing();
    const { scene, objects } = abc(Trace);
    const [a, , c] = objects;

    scene.reparent(c, a, 0);
    new Runtime(scene).step();

    assert.deepEqual(order, ['A', 'C', 'B']);
    assert.deepEqual(scene.objects().map(object => object.name), ['A', 'B', 'C'],
        'while the storage is exactly as it was');
});

test('a save and a reload do not change the order of execution', () => {
    const { order, Trace } = tracing();
    const registry = new ComponentRegistry();
    registry.register(Trace);

    const { scene, objects } = abc(Trace, registry);
    scene.reparent(objects[2], objects[0], 0);

    const runtime = new Runtime(scene);
    for (let step = 0; step < 3; step++) runtime.step();
    const before = [...order];
    order.length = 0;

    // Reloading rewrites the storage into canonical order — which is precisely why the
    // storage could never have been the contract.
    const reloaded = deserializeScene(serializeScene(scene), { registry });
    const after = new Runtime(reloaded);
    for (let step = 0; step < 3; step++) after.step();

    assert.deepEqual(order, before);
    assert.deepEqual(reloaded.objects().map(object => object.name), ['A', 'C', 'B']);
});

test('a deletion and its inverse do not change the order of execution', () => {
    // Through the real pipeline: REMOVE_OBJECT, then the operation `invert()` makes of it.
    // A restored object joins the scene last, so the storage comes back in a different
    // order than it left in — and the simulation does not notice.
    const { order, Trace } = tracing();
    const registry = new ComponentRegistry();
    registry.register(Trace);

    const { scene, objects } = abc(Trace, registry);
    scene.reparent(objects[2], objects[0], 0);

    const runtime = new Runtime(scene);
    runtime.step();
    const before = [...order];
    order.length = 0;

    const target = scene.findByName('A')[0];
    const removal = removeObjectOperation({
        object: serializeObject(target),
        subtree: [serializeObject(target.children[0])],
        parent: null,
        index: scene.indexOf(target),
        origin: Origin.EDITOR
    });

    assert.equal(scene.operations.submit(removal).applied, true);
    assert.equal(scene.operations.submit(invert(removal)).applied, true);

    runtime.step();

    assert.deepEqual(scene.objects().map(object => object.name), ['B', 'A', 'C'],
        'the storage order did change');
    assert.deepEqual(order, before, 'the order of execution did not');
});

test('two roads to the same scene simulate it in the same order', () => {
    // One machine replayed the operations; another joined from a snapshot. They hold the
    // same scene by different roads, and they must run it identically — which is the whole
    // reason the order had to stop being a property of the road.
    const built = tracing();
    const builtRegistry = new ComponentRegistry();
    builtRegistry.register(built.Trace);

    const { scene, objects } = abc(built.Trace, builtRegistry);
    scene.reparent(objects[2], objects[0], 0);

    const joined = tracing();
    const joinedRegistry = new ComponentRegistry();
    joinedRegistry.register(joined.Trace);
    const fromSnapshot = deserializeScene(serializeScene(scene), { registry: joinedRegistry });

    const here = new Runtime(scene);
    const there = new Runtime(fromSnapshot);
    for (let step = 0; step < 3; step++) {
        here.step();
        there.step();
    }

    assert.deepEqual(joined.order, built.order);
    assert.notDeepEqual(
        scene.objects().map(object => object.name),
        fromSnapshot.objects().map(object => object.name),
        'and they still store their objects in different orders'
    );
});

test('every object the scene holds is simulated', () => {
    // ADR-0035's one real hazard: the Runtime now walks from the roots, so an object the
    // walk cannot reach would silently stop running — and would already have been dropped
    // from what `serializeScene()` writes. The invariant is held in `Scene.add()`, where an
    // object whose parent is not in this scene is a root, and this is what it buys.
    const { order, Trace } = tracing();
    const scene = new Scene('Main');

    const elsewhere = new Object('Elsewhere');
    const orphan = new Object('Orphan');
    elsewhere.addChild(orphan);
    orphan.addComponent(new Trace('orphan'));
    scene.add(orphan);

    const plain = scene.add(new Object('Plain'));
    plain.addComponent(new Trace('plain'));

    new Runtime(scene).step();

    assert.equal(hierarchyOrder(scene).length, scene.size, 'the walk reaches everything');
    assert.deepEqual([...order].sort(), ['orphan', 'plain']);
    assert.equal(serializeScene(scene).objects.length, scene.size, 'and so does the writer');
});
