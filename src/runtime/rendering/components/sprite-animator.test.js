// Sprite animation: the clip, the playhead, and the rectangle it puts on a Sprite (ADR-0062 §4).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ANIMATION_FORMAT,
    ComponentRegistry,
    NodeRegistry,
    Object as SceneObject,
    ResourceRegistry,
    Scene,
    Transform,
    animationOf,
    createAnimation,
    defineComponent,
    deserializeScene,
    durationOf,
    frameAt,
    frameAtTime,
    frameCount,
    hierarchyOrder,
    registerStandardNodes,
    serializeComponent,
    serializeScene
} from '../../../core/mod.js';
import { Behaviors } from '../../scripting/behaviors.js';
import { createGraphInterpreter } from '../../scripting/interpreter.js';
import { registerBuiltIns } from '../../builtins.js';
import { Clock } from '../../clock/clock.js';
import { Runtime } from '../../runtime.js';
import { Sprite } from './sprite.js';
import { SpriteAnimator } from './sprite-animator.js';

const WALK = createAnimation({
    source: 'res_sheet',
    frameWidth: 32,
    frameHeight: 32,
    count: 4,
    columns: 2,
    fps: 10,
    loop: true
});

const DEATH = createAnimation({
    source: 'res_sheet',
    frameWidth: 32,
    frameHeight: 32,
    count: 3,
    columns: 4,
    first: 8,
    fps: 10,
    loop: false
});

function world({ clips = { res_walk: WALK, res_death: DEATH } } = {}) {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });

    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Transform());
    object.addComponent(new Sprite('res_placeholder', 0, 0));
    object.addComponent(new SpriteAnimator('res_walk'));

    const resources = new ResourceRegistry();
    for (const [id, clip] of globalThis.Object.entries(clips)) resources.set(id, clip);

    return {
        scene,
        object,
        resources,
        sprite: object.getComponent('Sprite'),
        animator: object.getComponent('SpriteAnimator'),
        runtime: new Runtime(scene, { resources, clock: new Clock({ fixedStep: 0.1 }) })
    };
}

// --- the clip, as data ------------------------------------------------------------------

test('a clip is a rectangle grid, read across then down', () => {
    assert.equal(frameCount(WALK), 4);
    assert.deepEqual(frameAt(WALK, 0), { x: 0, y: 0, width: 32, height: 32 });
    assert.deepEqual(frameAt(WALK, 1), { x: 32, y: 0, width: 32, height: 32 });
    assert.deepEqual(frameAt(WALK, 2), { x: 0, y: 32, width: 32, height: 32 });
    assert.deepEqual(frameAt(WALK, 3), { x: 32, y: 32, width: 32, height: 32 });
});

test('a first frame offsets into a shared sheet, which is how four clips share one picture', () => {
    // `first: 8` on a four-column sheet is the start of the third row.
    assert.deepEqual(frameAt(DEATH, 0), { x: 0, y: 64, width: 32, height: 32 });
    assert.deepEqual(frameAt(DEATH, 2), { x: 64, y: 64, width: 32, height: 32 });
});

test('no columns declared reads the sheet as one strip', () => {
    const strip = createAnimation({ source: 's', frameWidth: 16, frameHeight: 16, count: 5, fps: 8 });
    assert.deepEqual(frameAt(strip, 4), { x: 64, y: 0, width: 16, height: 16 });
});

test('a clip with no cell size has no rectangle, which reads as the whole picture', () => {
    const still = createAnimation({ source: 's', fps: 0 });
    assert.equal(frameAt(still, 0), null);
});

test('a payload from a version this build does not know is refused', () => {
    assert.equal(animationOf({ version: 99, source: 's' }), null);
    assert.equal(animationOf({ version: ANIMATION_FORMAT }), null, 'a clip with no sheet is not a clip');
    assert.equal(animationOf(null), null);
    assert.deepEqual(frameAtTime(null, 5), { index: 0, finished: true });
});

// --- the playhead -------------------------------------------------------------------------

test('the playhead is seconds, so the same time gives the same frame at any frame rate', () => {
    for (const clip of [WALK]) {
        assert.deepEqual(frameAtTime(clip, 0), { index: 0, finished: false });
        assert.deepEqual(frameAtTime(clip, 0.25), { index: 2, finished: false });
        assert.deepEqual(frameAtTime(clip, 0.45), { index: 0, finished: false }, 'and it loops');
    }
});

test('a clip that does not loop holds its last frame and reports that it is done', () => {
    assert.deepEqual(frameAtTime(DEATH, 0.05), { index: 0, finished: false });
    assert.deepEqual(frameAtTime(DEATH, 0.15), { index: 1, finished: false });
    assert.deepEqual(frameAtTime(DEATH, 0.9), { index: 2, finished: true });
    assert.equal(durationOf(DEATH).toFixed(2), '0.30');
    assert.equal(durationOf(WALK), 0, 'a looping clip has no duration');
});

test('a rate of zero holds one frame rather than dividing by zero', () => {
    const still = createAnimation({ source: 's', frameWidth: 8, frameHeight: 8, count: 4, fps: 0 });
    assert.deepEqual(frameAtTime(still, 99), { index: 0, finished: false });
});

// --- the component --------------------------------------------------------------------------

test('it walks the Sprite through the clip, and names the sheet the clip names', () => {
    const it = world();

    it.runtime.step();
    assert.equal(it.sprite.source, 'res_sheet', 'the clip names its own picture');
    assert.deepEqual(it.sprite.frame, { x: 0, y: 0, width: 32, height: 32 });

    for (let step = 0; step < 2; step++) it.runtime.step();
    assert.equal(it.animator.frame, 2);
    assert.deepEqual(it.sprite.frame, { x: 0, y: 32, width: 32, height: 32 });
    assert.equal(it.animator.elapsed.toFixed(1), '0.3');
});

test('the same elapsed time gives the same frame at two step sizes', () => {
    const slow = world();
    const fast = world();
    fast.runtime.clock.fixedStep;

    const quick = new Runtime(fast.scene, { resources: fast.resources, clock: new Clock({ fixedStep: 0.02 }) });

    for (let step = 0; step < 3; step++) slow.runtime.step();
    for (let step = 0; step < 15; step++) quick.step();

    assert.equal(slow.animator.elapsed.toFixed(2), fast.animator.elapsed.toFixed(2));
    assert.equal(slow.animator.frame, fast.animator.frame);
});

test('pausing holds the frame, and resuming carries on from it', () => {
    const it = world();
    for (let step = 0; step < 2; step++) it.runtime.step();

    // PAUSED, THEN SETTLED. The frame is read from the time already played, so the step on
    // which `playing` goes false still shows the frame that time had reached; from there
    // nothing moves, which is what holding means.
    it.animator.playing = false;
    it.runtime.step();
    const held = it.animator.frame;

    for (let step = 0; step < 5; step++) it.runtime.step();
    assert.equal(it.animator.frame, held);

    // TWO STEPS, BECAUSE THE FRAME IS READ BEFORE THE CLOCK MOVES. The step that resumes
    // shows the frame it was paused on — which is what "carry on from here" means — and the
    // one after it shows the next.
    it.animator.playing = true;
    for (let step = 0; step < 2; step++) it.runtime.step();
    assert.notEqual(it.animator.frame, held);
});

test('speed multiplies the clip own rate, and zero is a pause', () => {
    const fast = world();
    fast.animator.speed = 2;
    for (let step = 0; step < 2; step++) fast.runtime.step();

    assert.equal(fast.animator.frame, 2, 'twice the clip rate is twice the frames');
});

test('changing the clip rewinds, and a clip that is gone clears the frame', () => {
    const it = world();
    for (let step = 0; step < 3; step++) it.runtime.step();
    assert.notEqual(it.animator.frame, 0);

    it.animator.clip = 'res_death';
    it.runtime.step();
    assert.equal(it.animator.elapsed.toFixed(2), '0.10');
    assert.deepEqual(it.sprite.frame, { x: 0, y: 64, width: 32, height: 32 });

    it.animator.clip = 'res_nothing';
    it.runtime.step();
    assert.equal(it.sprite.frame, null, 'a deleted clip must not leave a corner of a sheet showing');
    assert.equal(it.animator.finished, true);
});

test('a non-looping clip stops advancing once it is finished', () => {
    const it = world();
    it.animator.clip = 'res_death';

    for (let step = 0; step < 20; step++) it.runtime.step();

    assert.equal(it.animator.frame, 2);
    assert.equal(it.animator.finished, true);
    assert.ok(it.animator.elapsed < 1, 'the playhead is not still counting up for ever');
});

test('an animator on an Object with no Sprite does nothing, and says nothing', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Ghost'));
    object.addComponent(new Transform());
    object.addComponent(new SpriteAnimator('res_walk'));

    const resources = new ResourceRegistry();
    resources.set('res_walk', WALK);

    const failures = [];
    const runtime = new Runtime(scene, { resources, onError: report => failures.push(report) });

    assert.doesNotThrow(() => runtime.step());
    assert.deepEqual(failures, []);
});

test('a Runtime with no resources at all animates nothing, and simulates the same', () => {
    const it = world();
    const bare = new Runtime(it.scene, { clock: new Clock({ fixedStep: 0.1 }) });

    assert.doesNotThrow(() => bare.step());
    assert.equal(it.sprite.frame, null);
});

test('the playhead is runtime state, and never reaches the format', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Transform());
    object.addComponent(new Sprite('res_sheet'));
    object.addComponent(new SpriteAnimator('res_walk', true, 1.5));

    assert.deepEqual(
        globalThis.Object.keys(serializeComponent(object.getComponent('SpriteAnimator'))).sort(),
        ['clip', 'playing', 'speed']
    );

    const reloaded = deserializeScene(serializeScene(scene), { registry });
    const animator = reloaded.objects()[0].getComponent('SpriteAnimator');
    assert.equal(animator.clip, 'res_walk');
    assert.equal(animator.speed, 1.5);
    assert.equal(animator.elapsed, 0, 'a reloaded animation starts at its beginning');
});

// --- the nodes -------------------------------------------------------------------------------

const nodes = registerStandardNodes(new NodeRegistry());

function scripted(graph) {
    const payload = { type: 'res_ctl', label: 'Hero', properties: {}, graph };
    const Component = defineComponent(payload);

    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    behaviors.bind(Component, graph);

    const registry = registerBuiltIns(new ComponentRegistry());
    registry.register(Component);

    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Hero'));
    object.addComponent(new Transform());
    object.addComponent(new Sprite('res_placeholder'));
    object.addComponent(new SpriteAnimator('res_walk'));
    object.addComponent(new Component());

    const resources = new ResourceRegistry();
    resources.set('res_walk', WALK);
    resources.set('res_death', DEATH);

    return {
        scene,
        object,
        animator: object.getComponent('SpriteAnimator'),
        runtime: new Runtime(scene, { behaviors, resources, clock: new Clock({ fixedStep: 0.1 }) })
    };
}

test('Play Animation chooses a clip and starts it from the beginning', () => {
    const it = scripted({
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'animation.play', params: { clip: 'res_death' }, x: 0, y: 0 }
        ],
        connections: [{ from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } }]
    });

    it.runtime.step();

    assert.equal(it.animator.clip, 'res_death');
    assert.equal(it.animator.frame, 0);
    assert.equal(it.animator.playing, true);
});

test('Play Animation restarts a clip that is already playing, which Set Property cannot', () => {
    // THE ONE THING THAT JUSTIFIES THE NODE (ADR-0062 §4). Writing the same value twice is a
    // no-op, so "play the attack again" would do nothing at all through `Set Property`.
    const it = scripted({
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.update', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'animation.play', params: { clip: 'res_walk' }, x: 0, y: 0 }
        ],
        connections: [{ from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } }]
    });

    for (let step = 0; step < 5; step++) it.runtime.step();

    assert.equal(it.animator.frame, 0, 'asked again every step, so it never gets past the first frame');
});

test('Animation Finished answers the question an event would have needed state for', () => {
    const it = scripted({
        version: 1,
        nodes: [
            { id: 'n1', type: 'event.start', params: {}, x: 0, y: 0 },
            { id: 'n2', type: 'animation.play', params: { clip: 'res_death' }, x: 0, y: 0 }
        ],
        connections: [{ from: { node: 'n1', port: 'out' }, to: { node: 'n2', port: 'in' } }]
    });

    const ask = () => nodes.get('animation.finished').evaluate({
        node: { params: {} },
        param: () => null,
        wired: () => false,
        input: () => null,
        self: it.object,
        ctx: { scene: it.scene }
    }).result;

    it.runtime.step();
    assert.equal(ask(), false);

    for (let step = 0; step < 6; step++) it.runtime.step();
    assert.equal(ask(), true);
});

test('an Object with no animator reads as finished rather than waiting for ever', () => {
    const empty = new SceneObject('Rock');
    const result = nodes.get('animation.finished').evaluate({
        node: { params: {} },
        param: () => null,
        wired: () => false,
        input: () => null,
        self: empty,
        ctx: {}
    }).result;

    assert.equal(result, true);
});
