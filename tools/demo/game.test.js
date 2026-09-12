// The demo, played from its title screen to its ending (LOT T).
//
// THIS IS THE ONLY TEST IN THE REPOSITORY THAT ASKS THE PRODUCT QUESTION: can a person put
// these systems together into something with a menu, a level and an end? It builds the same
// project the browser loads — one description, two readers — and plays it: Space on the menu,
// three enemies shot in the level, a score carried across two transitions, and back to the
// menu from the ending.
//
// Everything below goes through the same door a game client goes through: bundle, open,
// resolve, run. Nothing reaches into a scene to make something happen.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, NodeRegistry, hierarchyOrder, registerStandardNodes } from '../../src/core/mod.js';
import {
    MemoryResourceStore,
    Project,
    ResourceKind,
    imageResources,
    loadComponentDefinitions,
    loadDefinitions,
    loadScene
} from '../../src/project/mod.js';
import { bundleProject, openBundle } from '../../src/preview/bundle.js';
import { Behaviors } from '../../src/runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../../src/runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../../src/runtime/builtins.js';
import { Clock } from '../../src/runtime/clock/clock.js';
import { Runtime } from '../../src/runtime/runtime.js';
import { Input } from '../../src/runtime/input/input.js';
import { SessionState } from '../../src/runtime/session-state.js';
import { ImageCache } from '../../src/runtime/rendering/images.js';
import { IDS, SCRIPTS, buildDemo } from './game.js';

/** A one-pixel PNG: the test does not need pixels, only a payload that decodes. */
const PIXEL = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';
const WAV = 'data:audio/wav;base64,UklGRiQAAABXQVZF';

const nodes = registerStandardNodes(new NodeRegistry());

/** An audio output that records, and a decoder that answers a 128 x 32 sheet. */
function outputs() {
    const played = [];
    return {
        played,
        audio: {
            play: (clip, options) => {
                played.push(clip);
                return { clip };
            },
            stop: () => {},
            set: () => {},
            unlock: () => {}
        },
        decode: async () => ({ width: 128, height: 32, close: () => {} })
    };
}

/** Build the project, then open it the way the game client opens one. */
async function play({ seed = 'demo' } = {}) {
    const authoring = registerBuiltIns(new ComponentRegistry());
    const store = new MemoryResourceStore();
    const project = new Project('Demo', { store });

    buildDemo(project, {
        registry: authoring,
        images: { player: PIXEL, enemy: PIXEL, bullet: PIXEL },
        sounds: { shoot: WAV, hit: WAV }
    });

    // THE CROSSING, exactly as `preview/client.js` makes it (ADR-0042 §2).
    const opened = openBundle(await bundleProject(project, store, { scene: IDS.menu }));

    const registry = registerBuiltIns(new ComponentRegistry());
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    const refused = [];
    await loadComponentDefinitions(opened.project, {
        registry,
        behaviors,
        nodes,
        onInvalid: entry => refused.push(entry)
    });

    const resources = await loadDefinitions(opened.project);
    const media = outputs();
    const images = new ImageCache({ resolve: id => opened.store.read(id), decode: media.decode });
    await images.preload(imageResources(opened.project));

    const session = new SessionState();
    const input = new Input();
    const failures = [];
    const visited = [];

    let scene = await loadScene(opened.project, IDS.menu, { registry });
    let runtime = null;

    const build = (world, at) => {
        const next = new Runtime(world, {
            behaviors,
            resources,
            audio: media.audio,
            session,
            input,
            seed: `${seed}:${at}`,
            clock: new Clock({ fixedStep: 1 / 60 }),
            onError: report => failures.push(report),
            onSceneRequest: id => swap(id)
        });
        next.running = true;
        return next;
    };

    const swap = async id => {
        const world = await loadScene(opened.project, id, { registry });
        if (!world) return;

        runtime.dispose();
        visited.push(id);
        scene = world;
        runtime = build(world, id);
    };

    runtime = build(scene, IDS.menu);
    visited.push(IDS.menu);

    const it = {
        opened,
        images,
        session,
        input,
        failures,
        refused,
        visited,
        played: media.played,
        get scene() {
            return scene;
        },
        get runtime() {
            return runtime;
        },
        /** One frame, and the transition it may ask for. */
        frame: async (count = 1) => {
            for (let at = 0; at < count; at++) {
                runtime.advance(1 / 60);
                // The swap is asynchronous; a frame is not over until it has landed.
                await globalThis.Promise.resolve();
                await globalThis.Promise.resolve();
            }
        },
        press: async code => {
            input.of(null).press(code);
            await it.frame();
            input.of(null).release(code);
            await it.frame();
        },
        text: name => hierarchyOrder(scene)
            .find(object => object.name === name)?.getComponent('TextRenderer')?.text ?? null,
        find: name => hierarchyOrder(scene).find(object => object.name === name) ?? null,
        tagged: tag => hierarchyOrder(scene).filter(object => object.tag === tag)
    };

    return it;
}

// --- what a project contains ---------------------------------------------------------------

test('the demo is three scenes, two prefabs, one animation and six `.px`', async () => {
    const store = new MemoryResourceStore();
    const project = new Project('Demo', { store });
    buildDemo(project, {
        registry: registerBuiltIns(new ComponentRegistry()),
        images: { player: PIXEL, enemy: PIXEL, bullet: PIXEL },
        sounds: { shoot: WAV, hit: WAV }
    });

    assert.equal(project.resources(ResourceKind.SCENE).length, 3);
    assert.equal(project.resources(ResourceKind.PREFAB).length, 2);
    assert.equal(project.resources(ResourceKind.ANIMATION).length, 1);
    assert.equal(project.resources(ResourceKind.COMPONENT).length, SCRIPTS.length);
    assert.equal(project.resources(ResourceKind.ASSET).length, 5);
});

test('every `.px` in the demo is runnable', async () => {
    const it = await play();
    assert.deepEqual(it.refused, [], 'a graph the validator refuses would not run at all');
});

// --- the game ------------------------------------------------------------------------------

test('the menu says what to press, and Space starts the level', async () => {
    const it = await play();
    await it.frame();

    assert.equal(it.text('Title'), 'PIXEL CREATOR DEMO');
    assert.equal(it.text('Prompt'), 'Press Space');

    await it.press('Space');

    assert.deepEqual(it.visited, [IDS.menu, IDS.level]);
    assert.ok(it.find('Player'), 'the level is what is running now');
});

test('the level fills with enemies made from the prefab, and none was in the scene', async () => {
    const it = await play();
    await it.press('Space');

    // ASKED OF THE PAYLOAD, NOT OF THE RUNNING WORLD. By the time a frame has run, a graph
    // has already spawned one — which is the point. What must be empty is what was SAVED.
    const payload = await it.opened.project.read(IDS.level);
    assert.equal(payload.objects.some(record => record.tag === 'enemy'), false,
        'the level ships with no enemy at all: that is what a prefab is for');

    await it.frame(4);
    assert.equal(it.tagged('enemy').length, 3, 'three, spawned by a graph');
});

test('a sprite is drawn from a resolved picture, on the player and on every spawn', async () => {
    const it = await play();
    await it.press('Space');
    await it.frame(4);

    const player = it.find('Player');
    assert.equal(player.getComponent('Sprite').source, IDS.playerSheet);
    assert.ok(it.images.get(IDS.playerSheet), 'the picture is decoded before the first frame');

    const enemy = it.tagged('enemy')[0];
    assert.equal(enemy.getComponent('Sprite').source, IDS.enemySheet);
    assert.ok(it.images.get(IDS.enemySheet));
});

test('walking plays the walk animation, from its first frame', async () => {
    const it = await play();
    await it.press('Space');
    await it.frame(4);

    const animator = it.find('Player').getComponent('SpriteAnimator');
    const before = it.find('Player').getComponent('Transform').x;

    it.input.of(null).press('ArrowLeft');
    await it.frame(8);
    it.input.of(null).release('ArrowLeft');

    assert.ok(it.find('Player').getComponent('Transform').x < before, 'the player moved');
    assert.equal(animator.clip, IDS.walk);
    assert.deepEqual(it.find('Player').getComponent('Sprite').frame,
        { x: animator.frame * 32, y: 0, width: 32, height: 32 },
        'and the Sprite is showing the frame the clip is on');
});

test('shooting a prefab bullet scores a point, makes a noise, and destroys both', async () => {
    const it = await play();
    await it.press('Space');
    await it.frame(4);

    const middle = it.tagged('enemy').find(enemy => enemy.getComponent('Transform').x === 0);
    assert.ok(middle, 'one enemy is straight ahead');

    await it.press('Space');
    assert.equal(it.tagged('bullet').length, 1, 'the bullet came out of a prefab');
    assert.ok(it.played.includes(IDS.shoot));

    await it.frame(40);

    assert.equal(it.session.get('score'), 1);
    assert.equal(it.text('Score'), 'Score: 1');
    assert.ok(it.played.includes(IDS.hit));
    assert.equal(it.tagged('enemy').length, 2);
    assert.equal(it.tagged('bullet').length, 0);
});

test('three hits end the level, and the score crosses into Game Over', async () => {
    const it = await play();
    await it.press('Space');
    await it.frame(4);

    // Line up on each enemy in turn and fire. Nothing here touches the scene: the player is
    // moved by its own graph, from the keyboard.
    for (const target of [0, -150, 150]) {
        const transform = it.find('Player').getComponent('Transform');
        for (let guard = 0; guard < 120 && Math.abs(transform.x - target) > 6; guard++) {
            it.input.of(null).press(transform.x > target ? 'ArrowLeft' : 'ArrowRight');
            await it.frame();
            it.input.of(null).release('ArrowLeft');
            it.input.of(null).release('ArrowRight');
        }

        await it.press('Space');
        await it.frame(45);
    }

    assert.equal(it.visited.at(-1), IDS.gameOver, 'the level asked for the ending');
    assert.equal(it.text('Verdict'), 'You win!');
    assert.equal(it.text('Final'), 'Final score: 3', 'the score survived the transition');
    assert.deepEqual(it.failures, []);
});

test('Space on the ending goes back to the menu, and a new game starts from zero', async () => {
    const it = await play();
    await it.press('Space');
    await it.frame(4);

    // Reach the ending the short way: the session is the score, so a graph writing it is the
    // same statement three bullets would have made.
    it.session.set('score', 3);
    await it.frame(3);
    assert.equal(it.visited.at(-1), IDS.gameOver);

    await it.press('Space');
    assert.equal(it.visited.at(-1), IDS.menu);

    await it.press('Space');
    assert.equal(it.visited.at(-1), IDS.level);
    assert.equal(it.session.get('score'), 0, 'the menu cleared what the last run left');
});

test('two runs of one seed reach the same identities', async () => {
    const transcript = async () => {
        const it = await play({ seed: 'same' });
        await it.press('Space');
        await it.frame(6);
        return it.tagged('enemy').map(enemy => enemy.id);
    };

    assert.deepEqual(await transcript(), await transcript());
});
