// The whole loop, once: a key, a graph, a property, a pixel.
//
// WHY THIS FILE EXISTS BESIDE THE OTHERS. `input.test.js` proves a key is remembered,
// `interpreter.test.js` proves a graph runs, `rendering.test.js` proves a rectangle is
// drawn — and every one of them passed while the thing a creator actually does, "press a
// key and watch the object move", did not work. What was missing was never a unit: it was
// the JOIN, and a join is only observable end to end.
//
//   InputState.press -> Runtime.step -> On Key fires -> the graph writes -> the Scene holds
//   the new value -> render() draws at the new place -> and NOT at the old one.
//
// The last clause is the one that was broken in the Preview and could not be caught here
// before, because nothing asserted where the previous frame went.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Matrix,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent,
    registerStandardNodes
} from '../core/mod.js';
import { Behaviors } from './scripting/behaviors.js';
import { createGraphInterpreter } from './scripting/interpreter.js';
import { registerBuiltIns } from './builtins.js';
import { RectangleRenderer } from './rendering/components/rectangle-renderer.js';
import { Runtime } from './runtime.js';

const registry = registerStandardNodes(new NodeRegistry());

/** A backend that records the calls it is given, so a frame can be read back. */
function recordingRenderer() {
    const calls = [];
    const record = name => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        /** Where things were drawn since the last `clear`, in world units. */
        frame() {
            const last = calls.map(call => call.name).lastIndexOf('clear');
            const since = calls.slice(last + 1);
            const drawn = [];
            let at = null;
            for (const call of since) {
                if (call.name === 'setTransform') at = call.args[0];
                if (call.name === 'fillRect' && at) drawn.push(Math.round(at.e));
            }
            return drawn;
        },
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

/**
 * A scene running one `.px`, with a renderer watching.
 *
 * @param {object} graph - The graph payload the Component carries
 * @param {object} [options] - `{ properties }` the `.px` declares
 */
function game(graph, { properties = {} } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry }));
    behaviors.bind(Component, payload.graph);

    const types = new ComponentRegistry();
    registerBuiltIns(types);
    types.register(Component);

    const scene = new Scene('Level', { registry: types });
    const hero = scene.add(new SceneObject('Hero'));
    hero.addComponent(new Transform());
    hero.addComponent(new RectangleRenderer({ width: 10, height: 10 }));
    hero.addComponent(new Component());

    const renderer = recordingRenderer();
    const failures = [];
    const runtime = new Runtime(scene, { behaviors, renderer, onError: report => failures.push(report) });

    return { scene, hero, runtime, renderer, failures, type: payload.type };
}

/** `On Key [Space] ▸ Pressed → Translate [X]`, the shortest sentence a creator can write. */
function nudgeOnSpace(by = 10) {
    return {
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: by, y: 0 } }
        ],
        connections: [
            { id: 'c', from: { node: 'key', port: 'pressed' }, to: { node: 'move', port: 'in' } }
        ]
    };
}

test('a key press moves the object, and the frame draws it where it now is', () => {
    const it = game(nudgeOnSpace(10));

    it.runtime.render({ view: Matrix.identity() });
    assert.deepEqual(it.renderer.frame(), [0], 'it starts where the scene put it');

    it.runtime.input.local.press('Space');
    it.runtime.step();
    it.runtime.render({ view: Matrix.identity() });

    assert.equal(it.hero.getComponent('Transform').x, 10, 'the graph wrote through to the Scene');
    assert.deepEqual(it.renderer.frame(), [10], 'and the frame draws it once, at the new place');
    assert.deepEqual(it.failures, []);
});

test('every frame is cleared before it is drawn, so nothing of the last one survives', () => {
    // THE PREVIEW BUG, AT THE LEVEL IT BELONGS TO. A renderer that is asked to draw a moved
    // object and never asked to clear leaves the old one on screen — which is what a
    // creator sees as "the object smears". The Preview broke this by never resizing its
    // backend, so `clear()` erased a 300x150 corner of a 2940x1558 surface; the contract
    // this asserts is the one that made that a bug rather than a preference.
    const it = game(nudgeOnSpace(10));

    for (let press = 0; press < 3; press++) {
        it.runtime.input.local.press('Space');
        it.runtime.step();
        it.runtime.input.local.release('Space');
        it.runtime.step();
        it.runtime.render({ view: Matrix.identity() });
    }

    assert.equal(it.hero.getComponent('Transform').x, 30);
    assert.deepEqual(it.renderer.frame(), [30], 'one object, one position, no trail');
    assert.equal(it.renderer.of('clear').length, 3, 'and one clear per frame');
});

test('a key held down moves once, and a key held for a hundred steps still moves once', () => {
    const it = game(nudgeOnSpace(10));

    it.runtime.input.local.press('Space');
    for (let step = 0; step < 100; step++) it.runtime.step();

    assert.equal(it.hero.getComponent('Transform').x, 10, 'Pressed is a moment, not a state');
});

test('On Update with Key Is Down moves every step, which is what "while held" means', () => {
    // THE OTHER HALF OF ADR-0041 §3, AS A BEHAVIOUR. `Is Down` is the node a creator reaches
    // for when the answer is "keep going", and the difference from `Pressed` is only visible
    // over several steps.
    const it = game({
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'down', type: 'input.key', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'if', type: 'flow.branch', x: 0, y: 0, params: {} },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 5, y: 0 } }
        ],
        connections: [
            { id: 'c1', from: { node: 'tick', port: 'out' }, to: { node: 'if', port: 'in' } },
            { id: 'c2', from: { node: 'down', port: 'held' }, to: { node: 'if', port: 'condition' } },
            { id: 'c3', from: { node: 'if', port: 'true' }, to: { node: 'move', port: 'in' } }
        ]
    });

    it.runtime.input.local.press('Space');
    for (let step = 0; step < 4; step++) it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 20, 'four steps held, four moves');

    it.runtime.input.local.release('Space');
    for (let step = 0; step < 4; step++) it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 20, 'and it stops when the key does');
});

test('a graph moves ANOTHER Object, and only that one', () => {
    // THE SENTENCE ADR-0034 EXISTS FOR, run end to end: the `.px` declares a socket, the
    // SCENE says which Object it points at, and the write lands there and nowhere else.
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: { target: 'p_target' }, inputs: { x: 7, y: 0 } }
        ],
        connections: [
            { id: 'c', from: { node: 'key', port: 'pressed' }, to: { node: 'move', port: 'in' } }
        ]
    }, { properties: { target: { id: 'p_target', type: 'objectref', default: null } } });

    const crate = it.scene.add(new SceneObject('Crate'));
    crate.addComponent(new Transform());
    it.hero.getComponent(it.type).target = crate.id;

    it.runtime.input.local.press('Space');
    it.runtime.step();

    assert.equal(crate.getComponent('Transform').x, 7, 'the Object the socket names moved');
    assert.equal(it.hero.getComponent('Transform').x, 0, 'and the one running the graph did not');
});

test('a reference that resolves to nothing writes nothing, and reports nothing', () => {
    // WHAT ONLY THE RUNNING SCENE CAN ANSWER IS NOT A FAULT (ADR-0034 §3.4). An empty socket
    // and a deleted target are the same case, and a beginner meets the first one every time
    // they wire a node before filling it in.
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: { target: 'p_target' }, inputs: { x: 7, y: 0 } }
        ],
        connections: [
            { id: 'c', from: { node: 'key', port: 'pressed' }, to: { node: 'move', port: 'in' } }
        ]
    }, { properties: { target: { id: 'p_target', type: 'objectref', default: null } } });

    it.runtime.input.local.press('Space');
    it.runtime.step();
    it.hero.getComponent(it.type).target = 'obj_gone';
    it.runtime.input.local.release('Space');
    it.runtime.step();
    it.runtime.input.local.press('Space');
    it.runtime.step();

    assert.equal(it.hero.getComponent('Transform').x, 0, 'nothing was written to Self by mistake');
    assert.deepEqual(it.failures, [], 'and nothing was reported: this is a state, not an error');
});

test('several events in one graph run in the order the payload lists them', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'k1', type: 'input.onKey', x: 0, y: 0, params: { key: 'KeyA' } },
            { id: 'm1', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 1, y: 0 } },
            { id: 'k2', type: 'input.onKey', x: 0, y: 0, params: { key: 'KeyB' } },
            { id: 'm2', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 0, y: 100 } }
        ],
        connections: [
            { id: 'c1', from: { node: 'k1', port: 'pressed' }, to: { node: 'm1', port: 'in' } },
            { id: 'c2', from: { node: 'k2', port: 'pressed' }, to: { node: 'm2', port: 'in' } }
        ]
    });

    it.runtime.input.local.press('KeyA');
    it.runtime.input.local.press('KeyB');
    it.runtime.step();

    const transform = it.hero.getComponent('Transform');
    assert.equal(transform.x, 1, 'both events fired on the same step');
    assert.equal(transform.y, 100);
});

test('Released fires on the way up, and moves the object then', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 3, y: 0 } }
        ],
        connections: [
            { id: 'c', from: { node: 'key', port: 'released' }, to: { node: 'move', port: 'in' } }
        ]
    });

    it.runtime.input.local.press('Space');
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 0, 'the way down is not the way up');

    it.runtime.input.local.release('Space');
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 3);
});

test('the Object own properties a graph writes reach the scene, and the renderer obeys them', () => {
    // `Object ▸ Active` IS THE ONE A CREATOR NOTICES IMMEDIATELY (ADR-0043): an inactive
    // object is not simulated and not drawn, so writing it from a graph has to be visible in
    // the very next frame or the property is a lie.
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'off', type: 'property.set', x: 0, y: 0, params: { component: 'Object', property: 'active' } },
            { id: 'no', type: 'value.boolean', x: 0, y: 0, params: { value: false } }
        ],
        connections: [
            { id: 'c1', from: { node: 'key', port: 'pressed' }, to: { node: 'off', port: 'in' } },
            { id: 'c2', from: { node: 'no', port: 'value' }, to: { node: 'off', port: 'value' } }
        ]
    });

    it.runtime.render({ view: Matrix.identity() });
    assert.equal(it.renderer.frame().length, 1, 'drawn while it is active');

    it.runtime.input.local.press('Space');
    it.runtime.step();
    it.runtime.render({ view: Matrix.identity() });

    assert.equal(it.hero.active, false);
    assert.deepEqual(it.renderer.frame(), [], 'and gone from the frame the moment it is not');
    assert.deepEqual(it.failures, []);
});

// --- the three moments of a key, as behaviour (ADR-0045 §4) -------------------------------

test('the Down port runs on every step the key is held, and Pressed runs once', () => {
    // ONE NODE, TWO PORTS, TWO SEMANTICS — the whole point of the recomposition (ADR-0046
    // §6). Both wires come off the SAME card, so the difference is read side by side rather
    // than remembered between two entries of a menu.
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'held', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 1, y: 0 } },
            { id: 'once', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 0, y: 100 } }
        ],
        connections: [
            { id: 'c1', from: { node: 'key', port: 'down' }, to: { node: 'held', port: 'in' } },
            { id: 'c2', from: { node: 'key', port: 'pressed' }, to: { node: 'once', port: 'in' } }
        ]
    });

    it.runtime.input.local.press('Space');
    for (let step = 0; step < 5; step++) it.runtime.step();

    const transform = it.hero.getComponent('Transform');
    assert.equal(transform.x, 5, 'Down ran on all five steps');
    assert.equal(transform.y, 100, 'Pressed ran on exactly one of them');
});

test('Down stops on the step the key comes up, and starts on the step it goes down', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 1, y: 0 } }
        ],
        connections: [{ id: 'c', from: { node: 'key', port: 'down' }, to: { node: 'move', port: 'in' } }]
    });

    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 0, 'nothing before the key goes down');

    it.runtime.input.local.press('Space');
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 1, 'the step it goes down counts');

    it.runtime.input.local.release('Space');
    it.runtime.step();
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 1, 'and it stops when the key does');
});

test('Released runs once, on the way up, and never while the key is held', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 7, y: 0 } }
        ],
        connections: [{ id: 'c', from: { node: 'key', port: 'released' }, to: { node: 'move', port: 'in' } }]
    });

    it.runtime.input.local.press('Space');
    for (let step = 0; step < 4; step++) it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 0, 'holding is not releasing');

    it.runtime.input.local.release('Space');
    it.runtime.step();
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 7, 'once, on the step it came up');
});

test('a pointer button has the same three moments on the same card', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'button', type: 'input.onPointerButton', x: 0, y: 0, params: { button: 'left' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 2, y: 0 } }
        ],
        connections: [{ id: 'c', from: { node: 'button', port: 'down' }, to: { node: 'move', port: 'in' } }]
    });

    it.runtime.input.local.pressButton(0);
    it.runtime.step();
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 4);

    it.runtime.input.local.releaseButton(0);
    it.runtime.step();
    assert.equal(it.hero.getComponent('Transform').x, 4);
});

test('a key nobody is holding starts nothing, and reports nothing', () => {
    const it = game({
        version: 1,
        nodes: [
            { id: 'key', type: 'input.onKey', x: 0, y: 0, params: { key: 'Space' } },
            { id: 'move', type: 'transform.translate', x: 0, y: 0, params: {}, inputs: { x: 1, y: 0 } }
        ],
        connections: [{ id: 'c', from: { node: 'key', port: 'down' }, to: { node: 'move', port: 'in' } }]
    });

    for (let step = 0; step < 5; step++) it.runtime.step();

    assert.equal(it.hero.getComponent('Transform').x, 0);
    assert.deepEqual(it.failures, []);
});

// --- the Transform family, as behaviour ---------------------------------------------
//
// THREE NODES THAT WRITE THE SAME COMPONENT, AND THE DIFFERENCE BETWEEN THEM IS THE POINT.
// `Translate` and `Scale` are relative, `Set Position` is absolute, and a creator who picks
// the wrong one sees it in the second frame rather than the first — so each test below runs
// more than one step.

/** One node on `On Update`, which is how a Transform node is actually reached. */
function everyStep(type, inputs, params = {}) {
    return {
        version: 1,
        nodes: [
            { id: 'tick', type: 'event.update', x: 0, y: 0, params: {} },
            { id: 'act', type, x: 0, y: 0, params, inputs }
        ],
        connections: [{ id: 'c', from: { node: 'tick', port: 'out' }, to: { node: 'act', port: 'in' } }]
    };
}

test('Rotate turns by degrees, and the Transform keeps radians', () => {
    // THE SEAM THE NODE EXISTS TO HIDE. A creator says 90; `Transform.rotation` is in
    // radians and stays that way, because the conversion is the node's and not the model's.
    const it = game(everyStep('transform.rotate', { degrees: 90 }));

    it.runtime.step();
    assert.ok(Math.abs(it.hero.getComponent('Transform').rotation - Math.PI / 2) < 1e-9);

    it.runtime.step();
    assert.ok(Math.abs(it.hero.getComponent('Transform').rotation - Math.PI) < 1e-9,
        'and it turns AGAIN, because it is relative');
    assert.deepEqual(it.failures, []);
});

test('Scale multiplies, so one is the step that changes nothing', () => {
    const it = game(everyStep('transform.scale', { x: 2, y: 1 }));

    it.runtime.step();
    it.runtime.step();

    const transform = it.hero.getComponent('Transform');
    assert.equal(transform.scaleX, 4, 'twice, twice');
    assert.equal(transform.scaleY, 1, 'and one leaves the other axis alone');
});

test('Set Position puts the object there, whatever it was doing', () => {
    const it = game(everyStep('transform.setPosition', { x: 40, y: -5 }));

    it.hero.getComponent('Transform').x = 999;
    it.runtime.step();
    it.runtime.step();

    const transform = it.hero.getComponent('Transform');
    assert.equal(transform.x, 40, 'absolute, so the second step does not add a second 40');
    assert.equal(transform.y, -5);
});

test('a Transform node on an Object that has no Transform does nothing, and says nothing', () => {
    // ADR-0034 §3.4: a state of the scene, not an authoring error. The next node still runs.
    const it = game(everyStep('transform.rotate', { degrees: 45 }));
    it.hero.removeComponent('Transform');

    it.runtime.step();

    assert.deepEqual(it.failures, []);
});
