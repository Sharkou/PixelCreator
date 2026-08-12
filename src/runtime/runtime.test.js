import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform, observe } from '../core/mod.js';
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
