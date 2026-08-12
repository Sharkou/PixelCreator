import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../core/mod.js';
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

test('a failing component is isolated', () => {
    const scene = new Scene('Main');
    const failures = [];
    class Broken {
        static type = 'Broken';
        update() { throw new Error('bad update'); }
    }
    const broken = scene.add(new Object('Broken'));
    broken.addComponent(new Broken());
    const healthy = scene.add(new Object('Healthy'));
    const mover = healthy.addComponent(new Mover());
    healthy.addComponent(new Transform());

    const runtime = new Runtime(scene, { onError: error => failures.push(error.message) });
    runtime.step();

    assert.deepEqual(failures, ['bad update']);
    assert.equal(mover.updates, 1, 'the rest of the scene still ran');
});

test('a repeatedly failing component is switched off', () => {
    // Legacy logged the same failure sixty times a second forever, which is how a
    // systematically broken component stayed invisible.
    const scene = new Scene('Main');
    const failures = [];
    class Broken {
        static type = 'Broken';
        update() { throw new Error('bad update'); }
    }
    const object = scene.add(new Object('Broken'));
    const broken = object.addComponent(new Broken());

    const runtime = new Runtime(scene, {
        maxFailures: 3,
        onError: error => failures.push(error.message)
    });
    for (let i = 0; i < 10; i++) runtime.step();

    assert.equal(failures.length, 3, 'reported, then silenced');
    assert.equal(broken.active, false);
});

test('an occasional failure does not switch a component off', () => {
    const scene = new Scene('Main');
    let calls = 0;
    class Flaky {
        static type = 'Flaky';
        update() { calls++; if (calls === 1) throw new Error('one-off'); }
    }
    const object = scene.add(new Object('Flaky'));
    const flaky = object.addComponent(new Flaky());

    const runtime = new Runtime(scene, { maxFailures: 3, onError: () => {} });
    for (let i = 0; i < 10; i++) runtime.step();

    assert.equal(flaky.active, undefined, 'never disabled');
    assert.equal(calls, 10);
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
