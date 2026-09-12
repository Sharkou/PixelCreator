// Changing the world without waiting inside a step (ADR-0063).
//
// THE CLAIM IS NOT "a second scene can be loaded". It is that the simulation ASKS and the
// application ANSWERS between frames: `Load Scene` records a request, the step finishes on
// the scene it was already running, and only then is a Resource read. Everything else in
// this file is what that costs and what it must not break — the old world let go, its music
// stopped, its suspended `Delay`s unreachable, and the values a session carries surviving.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    ResourceRegistry,
    Scene,
    Transform,
    defineComponent,
    hierarchyOrder,
    registerStandardNodes
} from '../core/mod.js';
import { Behaviors } from '../runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../runtime/builtins.js';
import { Clock } from '../runtime/clock/clock.js';
import { Runtime } from '../runtime/runtime.js';
import { Input } from '../runtime/input/input.js';
import { SessionState } from '../runtime/session-state.js';
import { AudioSource } from '../runtime/audio/audio-source.js';

const nodes = registerStandardNodes(new NodeRegistry());

const node = (id, type, params = {}) => ({ id, type, params, x: 0, y: 0 });
const wire = (a, ap, b, bp) => ({ from: { node: a, port: ap }, to: { node: b, port: bp } });

/** `On Update → Set Session Value(score) → Load Scene(next)`. */
const LEAVE = {
    version: 1,
    nodes: [
        node('n1', 'event.update'),
        node('n2', 'session.set', { key: 'score' }),
        node('n3', 'value.number', { value: 7 }),
        node('n4', 'scene.load', { scene: 'res_level' })
    ],
    connections: [
        wire('n1', 'out', 'n2', 'in'),
        wire('n3', 'value', 'n2', 'value'),
        wire('n2', 'out', 'n4', 'in')
    ]
};

/** `On Start → Delay(10s) → Set Session Value(late)`. Nothing should ever reach the end. */
const SLOW = {
    version: 1,
    nodes: [
        node('n1', 'event.start'),
        node('n2', 'flow.delay', { }),
        node('n3', 'session.set', { key: 'late' }),
        node('n4', 'value.boolean', { value: true }),
        node('n5', 'value.number', { value: 10 })
    ],
    connections: [
        wire('n1', 'out', 'n2', 'in'),
        wire('n5', 'value', 'n2', 'seconds'),
        wire('n2', 'then', 'n3', 'in'),
        wire('n4', 'value', 'n3', 'value')
    ]
};

function recordingAudio() {
    const calls = [];
    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        play: (clip, options) => {
            calls.push({ name: 'play', clip, options });
            return { clip };
        },
        stop: handle => calls.push({ name: 'stop', handle }),
        set: () => {},
        unlock: () => {}
    };
}

/** A menu scene that asks for a level, and a level that does not. */
function world({ graph = LEAVE, music = true } = {}) {
    const payload = { type: 'res_menu', label: 'Menu', properties: {}, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    behaviors.bind(Component, graph);

    const registry = registerBuiltIns(new ComponentRegistry());
    registry.register(Component);

    const menu = new Scene('Menu', { id: 'scene_menu', registry });
    const title = menu.add(new SceneObject('Title'));
    title.addComponent(new Transform());
    title.addComponent(new Component());
    if (music) title.addComponent(new AudioSource('res_theme', 1, true, true));

    const level = new Scene('Level', { id: 'scene_level', registry });
    const player = level.add(new SceneObject('Player'));
    player.addComponent(new Transform(10, 20));

    const audio = recordingAudio();
    const session = new SessionState();
    const input = new Input();
    const resources = new ResourceRegistry();

    const loaded = [];
    let scene = menu;
    let runtime = null;

    const build = world => new Runtime(world, {
        behaviors,
        audio,
        session,
        input,
        resources,
        clock: new Clock({ fixedStep: 0.1 }),
        seed: `fixed:${world.id}`,
        onSceneRequest: id => {
            loaded.push(id);
            // WHAT THE APPLICATION DOES, IN MINIATURE (ADR-0063 §3): let the old world go,
            // then build a new Runtime on the new one. Everything that is per-PROJECT or
            // per-PLAYER is handed straight over.
            runtime.dispose();
            scene = id === 'res_level' ? level : menu;
            runtime = build(scene);
            runtime.running = true;
        }
    });

    runtime = build(menu);
    runtime.running = true;

    return {
        menu,
        level,
        audio,
        session,
        input,
        loaded,
        get scene() {
            return scene;
        },
        get runtime() {
            return runtime;
        },
        advance: () => runtime.advance(0.1)
    };
}

// --- the request ---------------------------------------------------------------------------

test('Load Scene records a request and the step finishes where it was', () => {
    const it = world();

    // One step, driven directly: the request is recorded, and nothing has been replaced.
    it.runtime.step();

    assert.equal(it.runtime.requestedScene, 'res_level');
    assert.equal(it.scene.name, 'Menu', 'the step ran to its end on the scene it started on');
    assert.deepEqual(it.loaded, [], 'and nothing was loaded inside the step');
});

test('the application is told between frames, not inside one', () => {
    const it = world();

    it.advance();

    assert.deepEqual(it.loaded, ['res_level']);
    assert.equal(it.scene.name, 'Level');
    assert.equal(it.runtime.requestedScene, null, 'the request is handed over once');
});

test('the last ask of a step wins, and there is only one', () => {
    const it = world();

    it.runtime.requestScene('res_a');
    it.runtime.requestScene('res_b');

    assert.equal(it.runtime.requestedScene, 'res_b');
    it.runtime.clearSceneRequest();
    assert.equal(it.runtime.requestedScene, null);
});

test('a Runtime nobody is listening to records the ask and carries on', () => {
    const scene = new Scene('Alone');
    const runtime = new Runtime(scene, { clock: new Clock() });

    runtime.requestScene('res_level');
    assert.doesNotThrow(() => runtime.advance(0.1));
    assert.equal(runtime.requestedScene, null, 'handed to nobody, and not left to accumulate');
});

test('an empty picker asks for nothing at all', () => {
    const definition = nodes.get('scene.load');
    const asked = [];

    definition.execute({
        node: { params: { scene: null } },
        param: () => null,
        wired: () => false,
        input: () => null,
        ctx: { requestScene: id => asked.push(id) }
    });

    assert.deepEqual(asked, []);
});

// --- what the old world takes with it --------------------------------------------------------

test('the scene that is left is emptied, so its music stops', () => {
    const it = world();
    it.runtime.step();
    assert.equal(it.audio.of('play').length, 1, 'the menu theme was playing');

    it.advance();

    assert.equal(it.audio.of('stop').length, 1, 'a level must not keep the menu music');
    assert.equal(hierarchyOrder(it.menu).length, 0, 'and the old world is let go');
});

test('a Delay suspended in the old scene never comes back', () => {
    // ADR-0058: a suspended execution lives in a closure reachable only from the WeakMap
    // keyed by its Component. The Component goes with the scene, so the continuation goes
    // with it — there is nothing to cancel, which is why nothing cancels it.
    const it = world({ graph: SLOW, music: false });

    it.runtime.step();
    assert.equal(it.session.get('late'), null);

    it.runtime.requestScene('res_level');
    it.advance();

    for (let step = 0; step < 300; step++) it.advance();
    assert.equal(it.session.get('late'), null, 'ten seconds of steps, and it never fired');
});

test('the new scene is what is simulated, with its own camera and its own objects', () => {
    const it = world();
    it.advance();

    assert.equal(it.scene.name, 'Level');
    assert.deepEqual(hierarchyOrder(it.scene).map(object => object.name), ['Player']);
    assert.notEqual(it.runtime.scene, it.menu);
});

test('what is per-project and per-player is handed over, not rebuilt', () => {
    const it = world();
    const before = { audio: it.runtime.audio, input: it.runtime.input, resources: it.runtime.resources };

    it.advance();

    assert.equal(it.runtime.audio, before.audio, 'the same output: no re-unlocking, no gap');
    assert.equal(it.runtime.input, before.input, 'the same keys: a held key is still held');
    assert.equal(it.runtime.resources, before.resources, 'the same definitions: nothing re-read');
});

test('two runs of one session reach the same identities, scene by scene', () => {
    // The seed is derived from the session's and from which scene is running (ADR-0063 §3),
    // so a transition does not reset reproducibility.
    const transcript = () => {
        const it = world();
        it.advance();
        return it.runtime.seed;
    };

    assert.equal(transcript(), transcript());
});

// --- what survives ---------------------------------------------------------------------------

test('a session value written before a transition is readable after it', () => {
    const it = world();

    it.advance();

    assert.equal(it.session.get('score'), 7);
    assert.equal(it.runtime.session, it.session, 'the same store, handed to the next Runtime');
});

test('a session carries the three types a graph can produce, and refuses the rest', () => {
    const session = new SessionState();

    assert.equal(session.set('score', 12), 12);
    assert.equal(session.set('won', true), true);
    assert.equal(session.set('hero', 'knight'), 'knight');

    assert.equal(session.get('score'), 12);
    assert.equal(session.get('won'), true);
    assert.equal(session.get('hero'), 'knight');
    assert.equal(session.get('nothing'), null, 'a key never written reads as nothing, not as zero');

    // An Object handle names a scene that is about to be thrown away; a NaN is an accident.
    assert.equal(session.set('hero', { id: 'obj_1' }), null);
    assert.equal(session.has('hero'), false, 'and the key is cleared rather than holding a lie');
    assert.equal(session.set('score', NaN), null);
});

test('a new game is a cleared session, and nothing else', () => {
    const session = new SessionState();
    session.set('score', 12);
    session.set('lives', 3);

    assert.deepEqual(session.snapshot(), { score: 12, lives: 3 });
    session.clear();

    assert.equal(session.size, 0);
    assert.equal(session.get('score'), null);
});

test('a Runtime with no session reads nothing and writes nowhere', () => {
    const scene = new Scene('Alone');
    const runtime = new Runtime(scene, { clock: new Clock() });

    assert.equal(runtime.session, null);
    assert.doesNotThrow(() => runtime.step());
});

// --- the counter-proof (ADR-0064 §4) ----------------------------------------------------------

test('COUNTER-PROOF: a transition that forgot to dispose leaves the old music playing', () => {
    // The same swap, with the one line removed. The old scene keeps its Objects, so nothing
    // announces their departure and the `AudioSource` is never told to stop — which is
    // exactly the bug `dispose()` exists to prevent, and exactly what the test above catches.
    const it = world();
    it.runtime.step();

    const stale = it.runtime;
    // No `stale.dispose()` here, deliberately.
    assert.equal(it.audio.of('stop').length, 0);
    assert.equal(hierarchyOrder(it.menu).length, 1, 'the old world is still standing');

    stale.dispose();
    assert.equal(it.audio.of('stop').length, 1, 'and this is the line that was missing');
});
