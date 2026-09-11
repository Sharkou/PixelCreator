// Sound, tested without a speaker (ADR-0060 §5).
//
// WHAT MAKES THIS TESTABLE IS A SEAM, NOT A MOCK. `HtmlAudioOutput` is handed the one line
// that needs a browser — `new Audio(src)` — so the autoplay policy, the deferral, the
// volume clamp and the per-sound element are all verified against an element that counts
// calls. Nothing here stubs a global, and nothing here pretends a browser is present.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent,
    deserializeScene,
    registerStandardNodes,
    serializeComponent,
    serializeScene
} from '../../core/mod.js';
import { Behaviors } from '../scripting/behaviors.js';
import { createGraphInterpreter } from '../scripting/interpreter.js';
import { registerBuiltIns } from '../builtins.js';
import { Runtime } from '../runtime.js';
import { Clock } from '../clock/clock.js';
import { AUDIO_OPERATIONS, SilentAudio, assertAudioOutput, missingAudioOperations, volumeOf } from './audio.js';
import { HtmlAudioOutput } from './html-audio.js';
import { AudioSource } from './audio-source.js';

/** An output that remembers what it was asked for, and plays nothing. */
function recordingAudio() {
    const calls = [];
    let next = 0;

    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        play: (clip, options) => {
            const handle = { id: ++next, clip };
            calls.push({ name: 'play', clip, options });
            return handle;
        },
        stop: handle => calls.push({ name: 'stop', handle }),
        set: (handle, options) => calls.push({ name: 'set', handle, options }),
        unlock: () => calls.push({ name: 'unlock' })
    };
}

/** An element that records what a backend did to it, and refuses to play on demand. */
function fakeElement({ refuse = false } = {}) {
    const element = {
        src: null,
        volume: 1,
        loop: false,
        playbackRate: 1,
        plays: 0,
        pauses: 0,
        currentTime: 0,
        play() {
            element.plays++;
            return refuse ? globalThis.Promise.reject(new Error('NotAllowedError')) : globalThis.Promise.resolve();
        },
        pause() {
            element.pauses++;
        }
    };
    return element;
}

function objectWith(component, { name = 'Speaker' } = {}) {
    const object = new SceneObject(name);
    object.addComponent(new Transform());
    object.addComponent(component);
    return object;
}

// --- the contract -----------------------------------------------------------------------

test('a complete output satisfies the contract, and an incomplete one is named', () => {
    assert.deepEqual(missingAudioOperations(recordingAudio()), []);
    assert.deepEqual(missingAudioOperations(new SilentAudio()), []);
    assert.deepEqual(missingAudioOperations({ play() {} }).sort(), ['set', 'stop', 'unlock']);
    assert.deepEqual(missingAudioOperations(null), [...AUDIO_OPERATIONS]);
    assert.throws(() => assertAudioOutput({}), /missing required operations/);
});

test('a volume is clamped in one place, so three callers cannot disagree', () => {
    assert.equal(volumeOf(0.5), 0.5);
    assert.equal(volumeOf(-3), 0);
    assert.equal(volumeOf(9), 1);
    assert.equal(volumeOf(NaN), 1);
    assert.equal(volumeOf(undefined), 1);
    assert.equal(volumeOf('nonsense', 0.25), 0.25);
});

// --- the browser backend -----------------------------------------------------------------

test('a clip is resolved by identity, and an unknown one plays nothing', () => {
    const output = new HtmlAudioOutput({ resolve: id => (id === 'res_1' ? 'data:audio/wav;base64,AA' : null), create: fakeElement });

    assert.ok(output.play('res_1'));
    assert.equal(output.play('res_missing'), null);
    assert.equal(output.play(null), null);
});

test('it needs a resolver, because nothing else can turn an identity into a sound', () => {
    assert.throws(() => new HtmlAudioOutput({}), /resolve/);
});

test('volume, loop and rate reach the element, and a volume outside the range is brought back', () => {
    const elements = [];
    const output = new HtmlAudioOutput({
        resolve: () => 'data:audio/wav;base64,AA',
        create: () => {
            const element = fakeElement();
            elements.push(element);
            return element;
        }
    });

    output.play('res_1', { volume: 4, loop: true, rate: 2 });

    assert.equal(elements[0].volume, 1);
    assert.equal(elements[0].loop, true);
    assert.equal(elements[0].playbackRate, 2);
    assert.equal(elements[0].plays, 1);
});

test('two sounds of one clip are two elements, so the second does not cut the first off', () => {
    const elements = [];
    const output = new HtmlAudioOutput({
        resolve: () => 'data:audio/wav;base64,AA',
        create: () => {
            const element = fakeElement();
            elements.push(element);
            return element;
        }
    });

    const first = output.play('shot');
    const second = output.play('shot');

    assert.equal(elements.length, 2);
    assert.notEqual(first.element, second.element);
});

test('stopping pauses and rewinds, and stopping nothing is not an error', () => {
    const output = new HtmlAudioOutput({ resolve: () => 'data:audio/wav;base64,AA', create: fakeElement });
    const handle = output.play('res_1');

    handle.element.currentTime = 3;
    output.stop(handle);

    assert.equal(handle.element.pauses, 1);
    assert.equal(handle.element.currentTime, 0);
    assert.doesNotThrow(() => output.stop(null));
    assert.doesNotThrow(() => output.stop({}));
});

test('a sounding sound can be turned down, which is what makes a fade a Tween', () => {
    const output = new HtmlAudioOutput({ resolve: () => 'data:audio/wav;base64,AA', create: fakeElement });
    const handle = output.play('res_1', { volume: 1 });

    output.set(handle, { volume: 0.25 });
    assert.equal(handle.element.volume, 0.25);

    output.set(handle, { volume: -1 });
    assert.equal(handle.element.volume, 0);
});

test('a browser that refuses is counted and reported, never hidden', async () => {
    const output = new HtmlAudioOutput({
        resolve: () => 'data:audio/wav;base64,AA',
        create: () => fakeElement({ refuse: true })
    });

    output.play('shot');
    // The refusal arrives as a rejected promise, so it is observable on the next turn.
    await globalThis.Promise.resolve();
    await globalThis.Promise.resolve();

    assert.equal(output.blocked, 1);
    assert.equal(output.unlocked, false);
});

test('a refused loop is started by the first gesture; a refused one-shot is dropped', async () => {
    const elements = [];
    const output = new HtmlAudioOutput({
        resolve: () => 'data:audio/wav;base64,AA',
        create: () => {
            const element = fakeElement({ refuse: true });
            elements.push(element);
            return element;
        }
    });

    const music = output.play('theme', { loop: true });
    output.play('shot', { loop: false });
    await globalThis.Promise.resolve();
    await globalThis.Promise.resolve();

    assert.equal(output.blocked, 2);

    output.unlock();
    assert.equal(output.unlocked, true);
    // A GUNSHOT FROM EIGHT SECONDS AGO IS NOT A GUNSHOT: only the loop is retried.
    assert.equal(music.element.plays, 2, 'the music is asked for again');
    assert.equal(elements[1].plays, 1, 'the one-shot is not');
});

test('once unlocked, a refusal is not remembered — there is nothing left to wait for', async () => {
    const output = new HtmlAudioOutput({
        resolve: () => 'data:audio/wav;base64,AA',
        create: () => fakeElement({ refuse: true })
    });

    output.unlock();
    const music = output.play('theme', { loop: true });
    await globalThis.Promise.resolve();
    await globalThis.Promise.resolve();

    output.unlock();
    assert.equal(music.element.plays, 1, 'a second gesture does not restart it');
});

// --- the Component ------------------------------------------------------------------------

test('an Audio Source is silent until it is asked, and then it plays its clip', () => {
    const audio = recordingAudio();
    const source = new AudioSource('res_theme');
    const object = objectWith(source);

    source.update(object, { audio });
    assert.equal(audio.of('play').length, 0, 'a fresh Component makes no noise');

    source.playing = true;
    source.update(object, { audio });

    assert.deepEqual(audio.of('play')[0].options, { volume: 1, loop: true });
    assert.equal(audio.of('play')[0].clip, 'res_theme');
});

test('it is reconciled, not commanded: asking twice plays once', () => {
    const audio = recordingAudio();
    const source = new AudioSource('res_theme', 1, true, true);
    const object = objectWith(source);

    for (let step = 0; step < 5; step++) source.update(object, { audio });

    assert.equal(audio.of('play').length, 1);
});

test('Set Property playing = false is the whole of Stop', () => {
    const audio = recordingAudio();
    const source = new AudioSource('res_theme', 1, true, true);
    const object = objectWith(source);

    source.update(object, { audio });
    source.playing = false;
    source.update(object, { audio });

    assert.equal(audio.of('stop').length, 1);
    // And nothing restarts on the steps that follow.
    source.update(object, { audio });
    assert.equal(audio.of('play').length, 1);
});

test('a volume change adjusts the sound; a clip change replaces it', () => {
    const audio = recordingAudio();
    const source = new AudioSource('res_a', 1, true, true);
    const object = objectWith(source);

    source.update(object, { audio });
    source.volume = 0.3;
    source.update(object, { audio });

    assert.deepEqual(audio.of('set')[0].options, { volume: 0.3 });
    assert.equal(audio.of('play').length, 1, 'the same track, quieter');

    source.clip = 'res_b';
    source.update(object, { audio });
    assert.equal(audio.of('stop').length, 1);
    assert.equal(audio.of('play').length, 2, 'a different track is a different sound');
});

test('no clip plays nothing, and no output does nothing at all', () => {
    const audio = recordingAudio();
    const source = new AudioSource(null, 1, true, true);
    const object = objectWith(source);

    source.update(object, { audio });
    assert.equal(audio.calls.length, 0);

    assert.doesNotThrow(() => source.update(object, {}));
    assert.doesNotThrow(() => source.update(object, undefined));
});

test('a destroyed Object stops humming', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const audio = recordingAudio();
    const object = scene.add(objectWith(new AudioSource('res_theme', 1, true, true)));

    const runtime = new Runtime(scene, { audio, clock: new Clock() });
    runtime.step();
    assert.equal(audio.of('play').length, 1);

    scene.remove(object);
    assert.equal(audio.of('stop').length, 1, 'the sound goes with the Object');
});

test('a destroyed PARENT silences its children too', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const audio = recordingAudio();

    const parent = scene.add(objectWith(new AudioSource('res_a', 1, true, true), { name: 'Ship' }));
    const child = scene.add(objectWith(new AudioSource('res_b', 1, true, true), { name: 'Engine' }));
    parent.addChild(child);

    const runtime = new Runtime(scene, { audio, clock: new Clock() });
    runtime.step();
    assert.equal(audio.of('play').length, 2);

    scene.remove(parent);
    assert.equal(audio.of('stop').length, 2);
});

test('taking the Component off an Object stops it as well', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const audio = recordingAudio();
    const object = scene.add(objectWith(new AudioSource('res_theme', 1, true, true)));

    new Runtime(scene, { audio, clock: new Clock() }).step();
    object.removeComponent('AudioSource');

    assert.equal(audio.of('stop').length, 1);
});

test('a handle is never serialized, and the values are', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    scene.add(objectWith(new AudioSource('res_theme', 0.4, false, true)));

    const written = serializeComponent(scene.objects()[0].getComponent('AudioSource'));
    assert.deepEqual(globalThis.Object.keys(written).sort(), ['clip', 'loop', 'playing', 'volume']);

    const reloaded = deserializeScene(serializeScene(scene), { registry });
    const source = reloaded.objects()[0].getComponent('AudioSource');
    assert.equal(source.clip, 'res_theme');
    assert.equal(source.volume, 0.4);
    assert.equal(source.loop, false);
    assert.equal(source.playing, true, 'music that was playing when the scene was saved plays again');
});

// --- the node ------------------------------------------------------------------------------

const nodeRegistry = registerStandardNodes(new NodeRegistry());

/** A scene running one `.px`, with an audio output that records. */
function world(graph, { audio = recordingAudio() } = {}) {
    const payload = { type: 'res_ctl', label: 'Controller', properties: {}, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodeRegistry }));
    behaviors.bind(Component, graph);

    const types = registerBuiltIns(new ComponentRegistry());
    types.register(Component);

    const scene = new Scene('Level', { id: 'scene_a', registry: types });
    const object = scene.add(new SceneObject('Gun', { id: 'obj_gun' }));
    object.addComponent(new Transform());
    object.addComponent(new Component());

    return { scene, audio, runtime: new Runtime(scene, { audio, behaviors, clock: new Clock() }) };
}

const START_PLAY = clip => ({
    version: 1,
    nodes: [
        { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
        { id: 'n2', type: 'audio.play', params: { clip }, x: 0, y: 0 }
    ],
    connections: [{ from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } }]
});

test('Play Sound fires the clip its picker names', () => {
    const it = world(START_PLAY('res_shot'));
    it.runtime.step();

    assert.equal(it.audio.of('play').length, 1);
    assert.equal(it.audio.of('play')[0].clip, 'res_shot');
    assert.equal(it.audio.of('play')[0].options.volume, 1);
});

test('an empty picker plays nothing, and the flow continues', () => {
    const it = world(START_PLAY(null));
    assert.doesNotThrow(() => it.runtime.step());
    assert.equal(it.audio.calls.length, 0);
});

test('a wire beats the picker, which is how a graph chooses a sound', () => {
    const graph = {
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'audio.play', params: { clip: 'res_picked' }, x: 0, y: 0 },
            { id: 'n3', type: 'value.resource', params: { value: 'res_wired' }, x: 0, y: 0 },
            { id: 'n4', type: 'value.number', params: { value: 0.5 }, x: 0, y: 0 }
        ],
        connections: [
            { from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } },
            { from: { node: 'n3', port: 'value' }, to: { node: 'n2', port: 'clip' } },
            { from: { node: 'n4', port: 'value' }, to: { node: 'n2', port: 'volume' } }
        ]
    };

    const it = world(graph);
    it.runtime.step();

    assert.equal(it.audio.of('play')[0].clip, 'res_wired');
    assert.equal(it.audio.of('play')[0].options.volume, 0.5);
});

test('a Runtime with no output runs the same step and simply makes no noise', () => {
    const payload = { type: 'res_ctl', label: 'Controller', properties: {}, graph: START_PLAY('res_shot') };
    const Component = defineComponent(payload);
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodeRegistry }));
    behaviors.bind(Component, payload.graph);

    const types = registerBuiltIns(new ComponentRegistry());
    types.register(Component);
    const scene = new Scene('Level', { registry: types });
    const object = scene.add(new SceneObject('Gun'));
    object.addComponent(new Transform());
    object.addComponent(new Component());

    const failures = [];
    const runtime = new Runtime(scene, { behaviors, clock: new Clock(), onError: report => failures.push(report) });

    assert.doesNotThrow(() => runtime.step());
    assert.deepEqual(failures, [], 'a server is silent, never broken');
});

test('the silent output answers the contract, so a caller need not check for null', () => {
    const silent = new SilentAudio();
    const handle = silent.play('res_1', { volume: 0.5 });

    assert.ok(handle);
    assert.equal(silent.play(null), null);
    assert.doesNotThrow(() => silent.stop(handle));
    assert.doesNotThrow(() => silent.set(handle, { volume: 1 }));
    assert.doesNotThrow(() => silent.unlock());
});
