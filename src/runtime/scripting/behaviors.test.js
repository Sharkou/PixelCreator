import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Object,
    Scene,
    Transform,
    observe,
    serializeComponent,
    serializeScene,
    deserializeScene,
    ComponentRegistry,
    defineComponent
} from '../../core/mod.js';
import { Behaviors } from './behaviors.js';
import { Runtime } from '../runtime.js';
import { Clock } from '../clock/clock.js';
import { Input } from '../input/input.js';

/**
 * A component type, as the registry holds it. Its behavior comes from a graph, so it
 * carries data and no code — which is exactly the case this seam exists for.
 */
class Controller {
    static type = 'Controller';
    static schema = { speed: { type: 'number', default: 0 } };
    constructor(speed = 0) { this.speed = speed; }
}

/** A stand-in for a `.px` resource. The graph model itself is a separate step (ADR-0009). */
const graph = () => ({ version: 1, nodes: [], connections: [] });

/**
 * A stand-in interpreter: it moves the object at the component's own speed.
 *
 * The real one walks a graph. What is under test here is the seam — one interpretation
 * per graph, one behavior per component instance.
 */
function movement(onInterpret = () => {}) {
    return resource => {
        onInterpret(resource);
        return component => ({
            update(self, ctx) { self.x += component.speed * ctx.deltaTime; }
        });
    };
}

function scriptedScene({ speed = 0, resource = graph() } = {}) {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    const controller = object.addComponent(new Controller(speed));
    const behaviors = new Behaviors(movement()).bind(Controller, resource);
    return { scene, object, controller, behaviors };
}

/** A backend that records calls instead of producing pixels. */
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

// --- binding a graph to a component type ------------------------------------------

test('a graph is bound to a component type, by class or by name', () => {
    const resource = graph();
    const behaviors = new Behaviors(movement());

    behaviors.bind(Controller, resource);

    assert.equal(behaviors.has('Controller'), true);
    assert.equal(behaviors.has(Controller), true);
    assert.equal(behaviors.graphOf('Controller'), resource);
    assert.deepEqual(behaviors.types(), ['Controller']);
});

test('a component type with no graph has no behavior', () => {
    // The normal case: Transform, Sprite and Collider are code, not graphs.
    const behaviors = new Behaviors(movement());

    assert.equal(behaviors.has('Transform'), false);
    assert.equal(behaviors.graphOf('Transform'), null);
    assert.equal(behaviors.behaviorFor(new Transform()), null);
});

test('a host needs an interpreter, and a binding needs a graph', () => {
    assert.throws(() => new Behaviors(), TypeError);
    assert.throws(() => new Behaviors('not a function'), TypeError);
    assert.throws(() => new Behaviors(movement()).bind(Controller, null), TypeError);
});

// --- execution ---------------------------------------------------------------------

test('a graph is the behavior of the component it is bound to', () => {
    const { scene, object, behaviors } = scriptedScene({ speed: 60 });

    const runtime = new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 0.1 }) });
    runtime.step();
    runtime.step();

    assert.ok(Math.abs(object.x - 12) < 1e-9, 'it read the component data and moved the object');
});

test("a component's own code runs before its graph, as one unit", () => {
    const order = [];
    class Health {
        static type = 'Health';
        update() { order.push('code'); }
    }
    const behaviors = new Behaviors(() => () => ({ update() { order.push('graph'); } }))
        .bind(Health, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Health());

    new Runtime(scene, { behaviors }).step();

    assert.deepEqual(order, ['code', 'graph']);
});

test('graphs run in scene order, with the components around them', () => {
    const order = [];
    class Marker {
        static type = 'Marker';
        constructor(label) { this.label = label; }
        update() { order.push(`marker:${this.label}`); }
    }
    const behaviors = new Behaviors(() => component => ({
        update() { order.push(`graph:${component.label}`); }
    })).bind(Controller, graph());

    const scene = new Scene('Main');
    for (const label of ['a', 'b']) {
        const object = scene.add(new Object(label));
        const controller = object.addComponent(new Controller());
        controller.label = label;
        object.addComponent(new Marker(label));
    }

    new Runtime(scene, { behaviors }).step();

    assert.deepEqual(order, ['graph:a', 'marker:a', 'graph:b', 'marker:b']);
});

test('a graph reaches the object, the scene and the input through the context', () => {
    const seen = [];
    const behaviors = new Behaviors(() => () => ({
        update(self, ctx) {
            seen.push({
                keys: ctx.input.of(self.owner).keys(),
                scene: ctx.scene,
                delta: ctx.deltaTime
            });
        }
    })).bind(Controller, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());
    const input = new Input();
    input.local.press('KeyW');

    new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 0.25 }) }).step(input);

    assert.deepEqual(seen[0].keys, ['KeyW']);
    assert.equal(seen[0].scene, scene);
    assert.equal(seen[0].delta, 0.25);
});

test('an inactive component does not run its graph', () => {
    let ran = 0;
    const behaviors = new Behaviors(() => () => ({ update() { ran++; } })).bind(Controller, graph());
    const scene = new Scene('Main');
    const controller = scene.add(new Object('Player')).addComponent(new Controller());
    controller.active = false;

    new Runtime(scene, { behaviors }).step();

    assert.equal(ran, 0);
});

// --- one interpretation, independent execution states ------------------------------

test('a graph is interpreted once, however many components carry it', () => {
    const interpreted = [];
    const resource = graph();
    const behaviors = new Behaviors(movement(g => interpreted.push(g))).bind(Controller, resource);
    const scene = new Scene('Main');
    for (const name of ['a', 'b', 'c']) {
        const object = scene.add(new Object(name));
        object.addComponent(new Transform());
        object.addComponent(new Controller(10));
    }

    const runtime = new Runtime(scene, { behaviors });
    for (let i = 0; i < 5; i++) runtime.step();

    assert.deepEqual(interpreted, [resource], 'read once, shared by every Controller');
});

test('two components of the same type keep independent execution states', () => {
    // The graph is shared; what it is doing right now is not. A behavior is created per
    // component instance, so a second Controller starts its own execution.
    const behaviors = new Behaviors(() => component => {
        let ticks = 0;                       // per instance, never the component's data
        return { update() { component.speed = ++ticks; } };
    }).bind(Controller, graph());

    const scene = new Scene('Main');
    const first = scene.add(new Object('First')).addComponent(new Controller());
    const runtime = new Runtime(scene, { behaviors });
    for (let i = 0; i < 3; i++) runtime.step();

    const second = scene.add(new Object('Second')).addComponent(new Controller());
    runtime.step();

    assert.equal(first.speed, 4);
    assert.equal(second.speed, 1, 'the newcomer runs its own state, not the first one\'s');
});

test('a component keeps its behavior across steps', () => {
    let created = 0;
    const behaviors = new Behaviors(() => component => {
        created++;
        return { update() {} };
    }).bind(Controller, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());

    const runtime = new Runtime(scene, { behaviors });
    for (let i = 0; i < 5; i++) runtime.step();

    assert.equal(created, 1);
});

test('rebinding the graph replaces the running behavior on the next step', () => {
    // Editing Controller.px in the Editor takes effect without reloading anything.
    const ran = [];
    const behaviors = new Behaviors(resource => () => ({
        update() { ran.push(resource.label); }
    }));
    behaviors.bind(Controller, { label: 'v1' });
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    behaviors.bind(Controller, { label: 'v2' });
    runtime.step();
    runtime.step();

    assert.deepEqual(ran, ['v1', 'v2', 'v2']);
});

// --- the behavior is not the component's data --------------------------------------

test('a behavior never becomes component data', () => {
    // It is derived from the graph, not state, so it must reach neither a snapshot nor a
    // replicated payload.
    const { scene, controller, behaviors } = scriptedScene({ speed: 3 });

    new Runtime(scene, { behaviors }).step();

    assert.deepEqual(globalThis.Object.keys(controller), ['speed']);
    assert.deepEqual(serializeComponent(controller), { speed: 3 });
});

test('a graph writes component properties through the normal reactive path', () => {
    // A write from a graph is a write like any other: same Change, same replication,
    // same Inspector update as hand-written code.
    const behaviors = new Behaviors(() => component => ({
        update() { component.speed += 1; }
    })).bind(Controller, graph());
    const scene = new Scene('Main');
    const controller = scene.add(new Object('Player')).addComponent(new Controller(0));
    const changes = [];
    observe(controller, change => changes.push(change.prop));

    new Runtime(scene, { behaviors }).step();

    assert.deepEqual(changes, ['speed']);
    assert.equal(controller.speed, 1);
});

// --- errors, per ADR-0012 ----------------------------------------------------------

test('a graph that throws is reported and changes nothing', () => {
    const thrown = new Error('graph blew up');
    const behaviors = new Behaviors(() => () => ({
        update() { throw thrown; }
    })).bind(Controller, graph());
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const controller = object.addComponent(new Controller());
    const reports = [];
    const changes = [];
    observe(object, () => changes.push('object'));
    observe(controller, () => changes.push('component'));

    const runtime = new Runtime(scene, { behaviors, onError: report => reports.push(report) });
    for (let i = 0; i < 10; i++) runtime.step();

    assert.equal(reports.length, 10, 'reported every step, never silenced');
    assert.equal(reports[0].error, thrown);
    assert.equal(reports[0].type, 'Controller', 'attributed to the component, not to a script');
    assert.equal(reports[0].phase, 'update');
    assert.equal(controller.active, undefined, 'never disabled by the runtime');
    assert.deepEqual(changes, [], 'and no Change came out of the error handling');
});

test('an interpreter that fails is reported like any other failure', () => {
    const behaviors = new Behaviors(() => { throw new SyntaxError('bad graph'); })
        .bind(Controller, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());
    const reports = [];

    new Runtime(scene, { behaviors, onError: report => reports.push(report) }).step();

    assert.equal(reports.length, 1);
    assert.ok(reports[0].error instanceof SyntaxError);
    assert.equal(reports[0].phase, 'update');
});

test('an interpreter that produces no factory says so', () => {
    const behaviors = new Behaviors(() => 'not a factory').bind(Controller, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());
    const reports = [];

    new Runtime(scene, { behaviors, onError: report => reports.push(report) }).step();

    assert.match(reports[0].error.message, /did not produce a factory/);
});

test('a factory that produces no behavior says so', () => {
    const behaviors = new Behaviors(() => () => undefined).bind(Controller, graph());
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());
    const reports = [];

    new Runtime(scene, { behaviors, onError: report => reports.push(report) }).step();

    assert.match(reports[0].error.message, /produced no behavior/);
});

test('a failing graph does not stop the rest of the scene', () => {
    const behaviors = new Behaviors(() => () => ({
        update() { throw new Error('nope'); }
    })).bind(Controller, graph());
    let ran = 0;
    class Marker {
        static type = 'Marker';
        update() { ran++; }
    }
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Controller());
    object.addComponent(new Marker());
    scene.add(new Object('Other')).addComponent(new Marker());

    new Runtime(scene, { behaviors, onError: () => {} }).step();

    assert.equal(ran, 2);
});

test('a runtime without behaviors runs its components normally', () => {
    // No graph anywhere is the ordinary case, not a degraded one.
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    object.addComponent(new Controller(60));

    const runtime = new Runtime(scene);

    assert.equal(runtime.behaviors, null);
    assert.doesNotThrow(() => runtime.step());
    assert.equal(object.x, 0);
});

// --- determinism, portability, and what the seam does not add ----------------------

test('the same graph and the same inputs reach the same state', () => {
    const run = () => {
        const { scene, object, behaviors } = scriptedScene({ speed: 60 });
        const input = new Input();
        const runtime = new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 1 / 60 }) });
        for (let i = 0; i < 30; i++) runtime.advance(1 / 60, input);
        return object.x;
    };

    assert.equal(run(), run());
});

test('a graph runs headless, with no renderer and no DOM', () => {
    // The server case: the same graph, the same interpreter, no browser anywhere.
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const { scene, object, behaviors } = scriptedScene({ speed: 60 });
    const runtime = new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 0.1 }) });

    runtime.step();

    assert.equal(runtime.renders, false);
    assert.ok(Math.abs(object.x - 6) < 1e-9);
});

test('carrying a graph does not make an object drawn', () => {
    // The seam covers update only. Whether a component draws is the component type's
    // business, so a logic-only Controller costs no save/setTransform/restore per frame.
    const { scene, behaviors } = scriptedScene({ speed: 1 });
    const renderer = recordingRenderer();

    const runtime = new Runtime(scene, { behaviors, renderer });
    runtime.step();

    assert.equal(runtime.render(), 0);
    assert.deepEqual(renderer.of('setTransform'), []);
});

// --- a Component a creator makes: properties + graph (ADR-0016) --------------------

test('a defined Component runs its graph, keeps its data, and survives a round trip', () => {
    // The whole Editor path in one test: a definition becomes a type, its graph becomes
    // its behavior, its properties are what serializes.
    const definition = {
        type: 'res_c3',
        label: 'Controller',
        properties: { speed: { type: 'number', default: 120 }, travelled: { type: 'number' } },
        graph: { version: 1, nodes: ['On Update', 'move'], connections: [] }
    };
    // The `.px` carries its graph; the Project layer reads the payload and binds what it
    // finds there (ADR-0020, ADR-0026). Standing in for that here.
    const resolved = definition.graph;
    const registry = new ComponentRegistry();
    registry.register(Transform);
    const Controller = registry.register(defineComponent(definition));
    const behaviors = new Behaviors(() => component => ({
        update(self, ctx) {
            const step = component.speed * ctx.deltaTime;
            self.x += step;
            component.travelled += step;
        }
    })).bind(Controller, resolved);

    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    object.addComponent(new Controller());

    const runtime = new Runtime(scene, { behaviors, clock: new Clock({ fixedStep: 0.5 }) });
    runtime.step();

    assert.equal(object.x, 60, 'the graph moved the object');
    assert.equal(object.getComponent('res_c3').travelled, 60, 'and wrote its own property');

    const data = JSON.parse(JSON.stringify(serializeScene(scene)));
    assert.deepEqual(data.objects[0].components[1], {
        type: 'res_c3',
        values: { speed: 120, travelled: 60 }
    }, 'the instance serializes its properties, in its rank, and no behavior');

    const restored = deserializeScene(data, { registry });
    const resumed = new Runtime(restored, { behaviors, clock: new Clock({ fixedStep: 0.5 }) });
    resumed.step();

    assert.equal(restored.objects()[0].getComponent('res_c3').travelled, 120,
        'and picks its behavior back up on the other side of a save');
});

test('every instance of a type shares one graph and no execution state', () => {
    const definition = {
        type: 'res_counter',
        label: 'Counter',
        properties: { count: { type: 'number' } },
        graph: { version: 1, nodes: [] }
    };
    const resolved = definition.graph;
    const Counter = defineComponent(definition);
    const graphs = [];
    const behaviors = new Behaviors(resource => {
        graphs.push(resource);
        return component => {
            let ticks = 0;
            return { update() { component.count = ++ticks; } };
        };
    }).bind(Counter, resolved);

    const scene = new Scene('Main');
    const instances = ['a', 'b', 'c'].map(name =>
        scene.add(new Object(name)).addComponent(new Counter()));

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    runtime.step();
    instances[2].active = false;
    runtime.step();

    assert.deepEqual(graphs, [resolved], 'one graph, read once, for the whole type');
    assert.deepEqual(instances.map(instance => instance.count), [3, 3, 2],
        'each instance counted on its own');
});

test('a graph is immutable to the runtime: editing means binding a new one', () => {
    // Mutating a bound graph in place is not observed — the Editor produces a new graph
    // and binds it, which is what makes a hot edit predictable.
    const first = { label: 'v1' };
    const Controller = defineComponent({ type: 'res_c3', label: 'Controller', graph: first });
    const seen = [];
    let interpretations = 0;
    const behaviors = new Behaviors(resource => {
        interpretations++;
        const label = resource.label;        // read when the graph is interpreted
        return () => ({ update() { seen.push(label); } });
    }).bind(Controller, first);
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Controller());

    const runtime = new Runtime(scene, { behaviors });
    runtime.step();
    first.label = 'edited in place';
    runtime.step();
    behaviors.bind(Controller, { label: 'v2' });
    runtime.step();

    assert.deepEqual(seen, ['v1', 'v1', 'v2']);
    assert.equal(interpretations, 2, 'the in-place edit caused no re-reading of the graph');
});

test('the runtime exposes no generic script component', async () => {
    // There is no "Script Component" in Pixel Creator: a graph is the behavior of a
    // concrete component type, never a component of its own.
    const runtime = await import('../mod.js');

    assert.equal(runtime.Script, undefined);
    assert.equal(runtime.Scripting, undefined);
    assert.equal(typeof runtime.Behaviors, 'function');
});
