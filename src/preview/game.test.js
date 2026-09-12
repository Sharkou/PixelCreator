// A whole little game, built the way a creator would build it (ADR-0060, ADR-0061).
//
// WHY ONE FILE, AND WHY THIS ONE. Every piece below is tested on its own somewhere else —
// text, screen space, audio, prefabs, collisions, spawning. What no unit test can show is
// that they compose into something a person would call a game, and that is precisely the
// claim this tranche makes. So this builds the thing: a project with two prefabs and three
// `.px`, a scene that contains NO model of a bullet and NO model of an enemy, a HUD that
// does not walk off the screen, a score that counts, a sound that fires and a win condition
// that ends it.
//
// IT IS ALSO THE COUNTER-PROOF FOR THE ONE CLAIM THAT IS EASY TO FAKE. The scene is asserted
// to hold neither prefab, before and after; the identities of the models are asserted never
// to appear; and the whole run is asserted to be the same twice from one seed.

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
    hierarchyOrder,
    registerStandardNodes,
    serializeScene
} from '../core/mod.js';
import { MemoryResourceStore, Project, ResourceKind, addPrefab, addScene, loadDefinitions, loadScene } from '../project/mod.js';
import { bundleProject, openBundle } from './bundle.js';
import { Behaviors } from '../runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../runtime/builtins.js';
import { Clock } from '../runtime/clock/clock.js';
import { Runtime } from '../runtime/runtime.js';
import { Input } from '../runtime/input/input.js';
import { BoxCollider } from '../runtime/collision/collider.js';
import { Velocity } from '../runtime/components/velocity.js';
import { RectangleRenderer } from '../runtime/rendering/components/rectangle-renderer.js';
import { TextRenderer } from '../runtime/rendering/components/text-renderer.js';
import { ScreenSpace } from '../runtime/rendering/space.js';

// --- writing a graph without writing JSON by hand ------------------------------------------

const node = (id, type, params = {}) => ({ id, type, params, x: 0, y: 0 });
const wire = (from, fromPort, to, toPort) => ({ from: { node: from, port: fromPort }, to: { node: to, port: toPort } });
const graph = (nodes, connections) => ({ version: 1, nodes, connections });

const HIT_SOUND = 'res_hit';
// DISTINCT FROM EVERY `.px` TYPE BELOW, AND NOT MERELY DIFFERENT. `res_enemy` is a PREFIX of
// `res_enemy_script`, so a test asserting "this identity is absent from the payload" by
// substring would have found the script's type and reported a leak that was not one.
const BULLET = 'res_prefab_bullet';
const ENEMY = 'res_prefab_enemy';

// --- the three `.px` a creator would write ---------------------------------------------------

/**
 * `Game.px` — the score, the label it writes, and the sentence that ends the game.
 *
 * On every step: `HUD.Text = Join("Score: ", ToText(score))`, then `score >= goal` decides
 * whether the banner says anything. That is LOT O written as a graph: number to text, concat,
 * `Set Property` on a `TextRenderer`, all through nodes that existed before this file.
 */
const GAME = {
    type: 'res_game',
    label: 'Game',
    properties: {
        score: { id: 'p_score', type: 'number', default: 0 },
        goal: { id: 'p_goal', type: 'number', default: 3 },
        scoreLabel: { id: 'p_label', type: 'objectref', default: null },
        banner: { id: 'p_banner', type: 'objectref', default: null }
    },
    graph: graph([
        node('g1', 'event.update'),
        node('g2', 'property.set', { target: 'p_label', component: 'TextRenderer', property: 'text' }),
        node('g3', 'text.join'),
        node('g4', 'value.string', { value: 'Score: ' }),
        node('g5', 'text.toText'),
        node('g6', 'property.get', { property: 'p_score' }),
        node('g7', 'flow.branch'),
        node('g8', 'compare.greaterOrEqual'),
        node('g9', 'property.get', { property: 'p_goal' }),
        node('g10', 'property.set', { target: 'p_banner', component: 'TextRenderer', property: 'text' }),
        node('g11', 'value.string', { value: 'You win!' })
    ], [
        wire('g1', 'out', 'g2', 'in'),
        wire('g4', 'value', 'g3', 'a'),
        wire('g6', 'value', 'g5', 'value'),
        wire('g5', 'text', 'g3', 'b'),
        wire('g3', 'text', 'g2', 'value'),
        wire('g2', 'out', 'g7', 'in'),
        wire('g6', 'value', 'g8', 'a'),
        wire('g9', 'value', 'g8', 'b'),
        wire('g8', 'result', 'g7', 'condition'),
        wire('g7', 'true', 'g10', 'in'),
        wire('g11', 'value', 'g10', 'value')
    ])
};

/**
 * `Player.px` — Space fires a bullet, from a PREFAB, at the player's own position.
 *
 * LOT P and LOT M in one graph: `Spawn Prefab` then `Set Position` on what came out. There is
 * no `Spawn X`, and there is no bullet parked off-screen for it to copy.
 */
const PLAYER = {
    type: 'res_player',
    label: 'Player',
    properties: {},
    graph: graph([
        node('p1', 'input.onKey', { key: 'Space' }),
        node('p2', 'scene.spawnPrefab', { prefab: BULLET }),
        node('p3', 'transform.setPosition'),
        node('p4', 'property.get', { component: 'Transform', property: 'x' }),
        node('p5', 'property.get', { component: 'Transform', property: 'y' }),
        node('p6', 'math.subtract'),
        node('p7', 'value.number', { value: 20 })
    ], [
        wire('p1', 'pressed', 'p2', 'in'),
        wire('p2', 'out', 'p3', 'in'),
        wire('p2', 'spawned', 'p3', 'object'),
        wire('p4', 'value', 'p3', 'x'),
        wire('p5', 'value', 'p6', 'a'),
        wire('p7', 'value', 'p6', 'b'),
        wire('p6', 'result', 'p3', 'y')
    ])
};

/**
 * `Enemy.px` — dying is worth a point and a noise.
 *
 * THE GAME IS FOUND BY TAG, NOT BY A SOCKET, and that is the lesson ADR-0061 §6 predicts: a
 * prefab may not carry a reference to an Object of one scene, so a prefab that needs to talk
 * to the level asks the scene for it. `Find By Tag` already answered that question.
 */
const ENEMY_SCRIPT = {
    type: 'res_enemy_script',
    label: 'Enemy',
    properties: {},
    graph: graph([
        node('e1', 'scene.onCollision'),
        node('e2', 'scene.findByTag'),
        node('e3', 'value.string', { value: 'game' }),
        node('e4', 'property.get', { component: 'res_game', property: 'p_score' }),
        node('e5', 'math.add'),
        node('e6', 'value.number', { value: 1 }),
        node('e7', 'property.set', { component: 'res_game', property: 'p_score' }),
        node('e8', 'audio.play', { clip: HIT_SOUND }),
        node('e9', 'scene.destroy'),
        node('e10', 'scene.destroy')
    ], [
        wire('e3', 'value', 'e2', 'tag'),
        wire('e2', 'object', 'e4', 'object'),
        wire('e2', 'object', 'e7', 'object'),
        wire('e4', 'value', 'e5', 'a'),
        wire('e6', 'value', 'e5', 'b'),
        wire('e5', 'result', 'e7', 'value'),
        wire('e1', 'enter', 'e7', 'in'),
        wire('e7', 'out', 'e8', 'in'),
        wire('e8', 'out', 'e9', 'in'),
        wire('e9', 'out', 'e10', 'in'),
        wire('e1', 'other', 'e10', 'object')
    ])
};

/**
 * `Spawner.px` — a wave of enemies, made from the prefab, one per step until there are three.
 *
 * LOT P's second half: nothing in the scene is copied, and the identities come from the
 * SIMULATION rather than from the machine — which is what makes the whole run reproducible
 * from one seed (ADR-0057 §3).
 */
const SPAWNER = {
    type: 'res_spawner',
    label: 'Spawner',
    properties: {
        made: { id: 'p_made', type: 'number', default: 0 },
        count: { id: 'p_count', type: 'number', default: 3 },
        spacing: { id: 'p_spacing', type: 'number', default: -40 }
    },
    graph: graph([
        node('s1', 'event.update'),
        node('s2', 'flow.branch'),
        node('s3', 'compare.less'),
        node('s4', 'property.get', { property: 'p_made' }),
        node('s5', 'property.get', { property: 'p_count' }),
        node('s6', 'scene.spawnPrefab', { prefab: ENEMY }),
        node('s7', 'transform.setPosition'),
        node('s8', 'math.multiply'),
        node('s9', 'property.get', { property: 'p_spacing' }),
        node('s10', 'property.set', { property: 'p_made' }),
        node('s11', 'math.add'),
        node('s12', 'value.number', { value: 1 })
    ], [
        wire('s1', 'out', 's2', 'in'),
        wire('s4', 'value', 's3', 'a'),
        wire('s5', 'value', 's3', 'b'),
        wire('s3', 'result', 's2', 'condition'),
        wire('s2', 'true', 's6', 'in'),
        wire('s6', 'out', 's7', 'in'),
        wire('s6', 'spawned', 's7', 'object'),
        wire('s4', 'value', 's8', 'a'),
        wire('s9', 'value', 's8', 'b'),
        wire('s8', 'result', 's7', 'y'),
        wire('s7', 'out', 's10', 'in'),
        wire('s4', 'value', 's11', 'a'),
        wire('s12', 'value', 's11', 'b'),
        wire('s11', 'result', 's10', 'value')
    ])
};

// --- the project a creator would end up with -------------------------------------------------

/**
 * Build the project: two prefabs, three `.px`, one sound, one scene with no models in it.
 *
 * @returns {object} `{ project, store, registry, scene, resources }`
 */
function buildProject() {
    const registry = registerBuiltIns(new ComponentRegistry());
    const Game = defineComponent(GAME);
    const Player = defineComponent(PLAYER);
    const Enemy = defineComponent(ENEMY_SCRIPT);
    const Spawner = defineComponent(SPAWNER);
    for (const type of [Game, Player, Enemy, Spawner]) registry.register(type);

    const store = new MemoryResourceStore();
    const project = new Project('Shooter', { store });

    // A sound, imported the way the Editor imports one: a data URL with an audio mime.
    project.add(
        { kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav', id: HIT_SOUND },
        'data:audio/wav;base64,UklGRiQAAABXQVZF'
    );

    // THE MODELS ARE AUTHORED IN A SCRATCH SCENE AND THE SCENE IS THROWN AWAY. This is what
    // "drag an Object into the Project panel" does, and the scene that held it is not the
    // scene that will be played.
    const authoring = new Scene('Authoring', { registry });

    const bullet = authoring.add(new SceneObject('Bullet', { tag: 'bullet', layer: 2 }));
    bullet.addComponent(new Transform());
    bullet.addComponent(new RectangleRenderer(4, 10, '#ffd166'));
    bullet.addComponent(new BoxCollider(4, 10));
    bullet.addComponent(new Velocity(0, -600));
    addPrefab(project, bullet, { name: 'Bullet.prefab', id: BULLET, registry });

    const enemy = authoring.add(new SceneObject('Enemy', { tag: 'enemy', layer: 1 }));
    enemy.addComponent(new Transform());
    enemy.addComponent(new RectangleRenderer(20, 20, '#ef476f'));
    enemy.addComponent(new BoxCollider(20, 20));
    enemy.addComponent(new Enemy());
    addPrefab(project, enemy, { name: 'Enemy.prefab', id: ENEMY, registry });

    // --- the scene that is actually played ---------------------------------------------
    const scene = new Scene('Arena', { registry });

    const camera = scene.add(new SceneObject('Main Camera'));
    camera.addComponent(new Transform());

    // THE HUD: one screen-space root, two labels parented under it. The children inherit the
    // space because a transform is inherited (ADR-0060 §2), so neither of them declares it.
    const hud = scene.add(new SceneObject('HUD', { layer: 100 }));
    hud.addComponent(new Transform(16, 16));
    hud.addComponent(new ScreenSpace());

    const scoreLabel = scene.add(new SceneObject('Score', { layer: 100 }));
    scoreLabel.addComponent(new Transform(0, 0));
    scoreLabel.addComponent(new TextRenderer('Score: 0', 16, 'sans-serif', '#ffffff', 'left'));
    hud.addChild(scoreLabel);

    const banner = scene.add(new SceneObject('Banner', { layer: 100 }));
    banner.addComponent(new Transform(0, 28));
    banner.addComponent(new TextRenderer('', 28, 'sans-serif', '#06d6a0', 'left'));
    hud.addChild(banner);

    const game = scene.add(new SceneObject('Game', { tag: 'game' }));
    game.addComponent(new Transform());
    const gameScript = new Game();
    gameScript.scoreLabel = scoreLabel.id;
    gameScript.banner = banner.id;
    gameScript.goal = 3;
    game.addComponent(gameScript);

    const player = scene.add(new SceneObject('Player', { tag: 'player', layer: 2 }));
    player.addComponent(new Transform(0, 120));
    player.addComponent(new RectangleRenderer(24, 16, '#118ab2'));
    player.addComponent(new Player());

    const spawner = scene.add(new SceneObject('Spawner'));
    spawner.addComponent(new Transform());
    spawner.addComponent(new Spawner());

    const sceneResource = addScene(project, scene, { name: 'Arena.scene' });

    return { project, store, registry, scene, sceneResource, ids: { scoreLabel: scoreLabel.id, banner: banner.id } };
}

/** An audio output that records instead of sounding. */
function recordingAudio() {
    const played = [];
    return {
        played,
        play: (clip, options) => {
            played.push({ clip, options });
            return { clip };
        },
        stop: () => {},
        set: () => {},
        unlock: () => {}
    };
}

/**
 * Open the project the way the game client does, and build the Runtime it builds.
 *
 * @param {object} built - What `buildProject()` answered
 * @param {object} [options] - `{ seed }`
 * @returns {Promise<object>} `{ scene, runtime, audio, input }`
 */
async function play(built, { seed = 'demo' } = {}) {
    // THE WHOLE CROSSING, AND IT IS THE ONE THE PREVIEW BUTTON MAKES (ADR-0042 §2).
    const bundle = bundleProject(built.project, built.store, { scene: built.sceneResource.id });
    const opened = openBundle(bundle);

    const registry = registerBuiltIns(new ComponentRegistry());
    for (const payload of [GAME, PLAYER, ENEMY_SCRIPT, SPAWNER]) registry.register(defineComponent(payload));

    const nodes = registerStandardNodes(new NodeRegistry());
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    for (const payload of [GAME, PLAYER, ENEMY_SCRIPT, SPAWNER]) {
        behaviors.bind(registry.get(payload.type), payload.graph);
    }

    // RESOLVED BEFORE THE FIRST STEP. This is the only `await` in the whole game path.
    const resources = await loadDefinitions(opened.project);
    const scene = await loadScene(opened.project, opened.scene, { registry });

    const audio = recordingAudio();
    const input = new Input();
    const failures = [];
    const runtime = new Runtime(scene, {
        behaviors,
        resources,
        audio,
        input,
        seed,
        clock: new Clock({ fixedStep: 1 / 60 }),
        onError: report => failures.push(report)
    });

    return { scene, runtime, audio, input, failures, resources };
}

/** Hold Space for one step, then run `steps` more. */
function shoot(it, steps = 40) {
    it.input.of(null).press('Space');
    it.runtime.step();
    it.input.of(null).release('Space');
    for (let i = 0; i < steps; i++) it.runtime.step();
}

function labelOf(scene, name) {
    return hierarchyOrder(scene).find(object => object.name === name)?.getComponent('TextRenderer') ?? null;
}

function scoreOf(scene) {
    return hierarchyOrder(scene).find(object => object.tag === 'game')?.getComponent('res_game') ?? null;
}

/**
 * Let the wave arrive: the Spawner makes one enemy per step until it has made its three.
 *
 * Nothing here touches the scene. The enemies come out of `Spawn Prefab`, placed by
 * `Set Position`, with identities drawn from the runtime's own seeded stream.
 */
function placeEnemies(it, steps = 3) {
    for (let i = 0; i < steps; i++) it.runtime.step();

    const enemies = hierarchyOrder(it.scene).filter(object => object.tag === 'enemy');
    assert.equal(enemies.length, 3, 'the wave arrived, from the prefab');
    assert.deepEqual(enemies.map(enemy => enemy.getComponent('Transform').y).sort((a, b) => b - a),
        [0, -40, -80], 'spread out by the graph, not by the test');
}

// --- the game ------------------------------------------------------------------------------

test('the scene contains no model of a bullet and no model of an enemy', async () => {
    const built = buildProject();
    const it = await play(built);

    const names = hierarchyOrder(it.scene).map(object => object.name);
    assert.deepEqual(names, ['Main Camera', 'HUD', 'Score', 'Banner', 'Game', 'Player', 'Spawner']);
    assert.equal(names.includes('Bullet'), false, 'this is what a prefab is for');
    assert.equal(names.includes('Enemy'), false);
});

test('pressing Space makes a bullet out of a prefab, at the player', async () => {
    const built = buildProject();
    const it = await play(built);

    it.input.of(null).press('Space');
    it.runtime.step();

    const bullet = hierarchyOrder(it.scene).find(object => object.tag === 'bullet');
    assert.ok(bullet, 'a bullet exists that was never in the scene');
    assert.equal(bullet.getComponent('Transform').x, 0);
    assert.equal(bullet.getComponent('Transform').y, 100, 'twenty above the player');
    assert.deepEqual(it.failures, []);
});

test('a hit scores a point, writes the HUD, makes a noise and destroys both', async () => {
    const built = buildProject();
    const it = await play(built);

    placeEnemies(it);
    assert.equal(scoreOf(it.scene).score, 0);

    shoot(it);

    assert.equal(scoreOf(it.scene).score, 1, 'one enemy, one point');
    assert.equal(labelOf(it.scene, 'Score').text, 'Score: 1', 'number to text, joined, written');
    assert.equal(it.audio.played.length, 1, 'and it made a noise');
    assert.equal(it.audio.played[0].clip, HIT_SOUND);

    const alive = hierarchyOrder(it.scene);
    assert.equal(alive.filter(object => object.tag === 'enemy').length, 2, 'the enemy died');
    assert.equal(alive.filter(object => object.tag === 'bullet').length, 0, 'so did the bullet');
    assert.deepEqual(it.failures, []);
});

test('three hits reach the goal, and the banner says so', async () => {
    const built = buildProject();
    const it = await play(built);
    placeEnemies(it);

    assert.equal(labelOf(it.scene, 'Banner').text, '');

    shoot(it);
    shoot(it);
    assert.equal(labelOf(it.scene, 'Banner').text, '', 'two is not three');

    shoot(it);

    assert.equal(scoreOf(it.scene).score, 3);
    assert.equal(labelOf(it.scene, 'Score').text, 'Score: 3');
    assert.equal(labelOf(it.scene, 'Banner').text, 'You win!');
    assert.equal(it.audio.played.length, 3);
    assert.deepEqual(it.failures, []);
});

test('the HUD stays on the screen, whatever the camera does', async () => {
    const built = buildProject();
    const it = await play(built);

    const hud = hierarchyOrder(it.scene).find(object => object.name === 'HUD');
    const score = hierarchyOrder(it.scene).find(object => object.name === 'Score');

    assert.ok(hud.hasComponent('ScreenSpace'));
    // The child declares nothing and is in screen space anyway, because a transform is
    // inherited (ADR-0060 §2).
    assert.equal(score.hasComponent('ScreenSpace'), false);
});

test('two runs of one seed are the same run, identities included', async () => {
    // ONE PROJECT, PLAYED THREE TIMES. The identities a project AUTHORED are drawn from the
    // platform like every authored identity (ADR-0057 §3); what a SEED decides is what the
    // simulation creates. Rebuilding the project per run would compare the first kind and
    // prove nothing about the second.
    const built = buildProject();

    const transcript = async seed => {
        const it = await play(built, { seed });
        placeEnemies(it);
        shoot(it);
        shoot(it);

        return {
            score: scoreOf(it.scene).score,
            label: labelOf(it.scene, 'Score').text,
            objects: hierarchyOrder(it.scene).map(object => `${object.name}#${object.id}`)
        };
    };

    const first = await transcript('same-seed');
    const second = await transcript('same-seed');
    const other = await transcript('other-seed');

    assert.deepEqual(first, second, 'same seed, same run');
    assert.equal(other.score, first.score, 'the gameplay does not depend on the seed');
    assert.notDeepEqual(other.objects, first.objects, 'but the spawned identities do (ADR-0057)');
});

test('the played scene saves and reloads with its instances and without the prefabs', async () => {
    const built = buildProject();
    const it = await play(built);
    placeEnemies(it);
    shoot(it);

    const written = serializeScene(it.scene);
    const reloaded = deserializeScene(written, { registry: it.scene.registry });

    assert.equal(labelOf(reloaded, 'Score').text, 'Score: 1', 'the HUD reloads as it was');
    assert.equal(hierarchyOrder(reloaded).filter(object => object.tag === 'enemy').length, 2);

    const payload = globalThis.JSON.stringify(written);
    assert.equal(payload.includes(BULLET), false, 'a scene names no prefab (ADR-0061 §9)');
    assert.equal(payload.includes(ENEMY), false);
});

test('a Runtime with no audio and no resources plays the same simulation, silently', async () => {
    const built = buildProject();
    const it = await play(built);
    placeEnemies(it);

    const silent = new Runtime(it.scene, {
        behaviors: it.runtime.behaviors,
        input: it.input,
        clock: new Clock({ fixedStep: 1 / 60 }),
        seed: 'demo'
    });

    // No `Spawn Prefab` can answer, so no bullet is made — and nothing fails.
    assert.doesNotThrow(() => {
        it.input.of(null).press('Space');
        silent.step();
        for (let i = 0; i < 10; i++) silent.step();
    });
    assert.equal(hierarchyOrder(it.scene).filter(object => object.tag === 'bullet').length, 0);
});
