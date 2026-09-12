// A whole little game, built from the public API and nothing else.
//
// WHAT IT IS FOR. Every system of the last two tranches is unit-tested on its own; what no
// unit test shows is that a person can put them together into something with a title screen,
// a level and an ending. This builds that — three Scenes, two prefabs, an animation, four
// `.px`, sprites and sound — using only the calls an Editor makes, so anything it cannot
// express is a gap in the product rather than in the demo.
//
// IT IS A TOOL, NOT A FIXTURE. `tools/demo/game.test.js` plays it through headlessly, and the
// browser loads the very same module to put it on screen. One description, two readers: a
// demo that drifts from what is tested is a demo nobody trusts.
//
// PICTURES ARE PASSED IN. Drawing a PNG needs a canvas, and this module must load under Node.
// The caller supplies three data URLs; the test passes tiny literal ones and the browser draws
// real sheets. Nothing about the game changes.

import {
    Object as SceneObject,
    Scene,
    Transform,
    createAnimation,
    defineComponent
} from '../../src/core/mod.js';
import { ResourceKind, addAnimation, addPrefab, addScene } from '../../src/project/mod.js';
import {
    AudioSource,
    BoxCollider,
    Camera,
    RectangleRenderer,
    ScreenSpace,
    Sprite,
    SpriteAnimator,
    TextRenderer,
    Velocity
} from '../../src/runtime/mod.js';

const node = (id, type, params = {}) => ({ id, type, params, x: 0, y: 0 });
const wire = (a, ap, b, bp) => ({ from: { node: a, port: ap }, to: { node: b, port: bp } });
const graph = (nodes, connections) => ({ version: 1, nodes, connections });

/** Fixed identities, so a test can name what it is looking for. */
export const IDS = {
    playerSheet: 'res_img_player',
    enemySheet: 'res_img_enemy',
    bulletSheet: 'res_img_bullet',
    shoot: 'res_snd_shoot',
    hit: 'res_snd_hit',
    walk: 'res_anim_walk',
    bullet: 'res_prefab_bullet',
    enemy: 'res_prefab_enemy',
    menu: 'res_scene_menu',
    level: 'res_scene_level',
    gameOver: 'res_scene_over',
    menuScript: 'res_px_menu',
    player: 'res_px_player',
    enemyScript: 'res_px_enemy',
    game: 'res_px_game',
    spawner: 'res_px_spawner',
    overScript: 'res_px_over'
};

/** `Menu.px` — Space starts the game, after clearing whatever the last run left. */
const MENU = {
    type: IDS.menuScript,
    label: 'Menu',
    properties: {},
    graph: graph([
        node('m1', 'input.onKey', { key: 'Space' }),
        node('m2', 'session.set', { key: 'score' }),
        node('m3', 'value.number', { value: 0 }),
        node('m4', 'scene.load', { scene: IDS.level })
    ], [
        wire('m1', 'pressed', 'm2', 'in'),
        wire('m3', 'value', 'm2', 'value'),
        wire('m2', 'out', 'm4', 'in')
    ])
};

/** `Player.px` — arrows move and animate, Space fires a bullet from a prefab. */
const PLAYER = {
    type: IDS.player,
    label: 'Player',
    properties: {
        speed: { id: 'p_speed', type: 'number', default: 320 }
    },
    graph: graph([
        node('p1', 'input.onKey', { key: 'Space' }),
        node('p2', 'scene.spawnPrefab', { prefab: IDS.bullet }),
        node('p3', 'transform.setPosition'),
        node('p4', 'property.get', { component: 'Transform', property: 'x' }),
        node('p5', 'property.get', { component: 'Transform', property: 'y' }),
        node('p6', 'math.subtract'),
        node('p7', 'value.number', { value: 28 }),
        node('p8', 'audio.play', { clip: IDS.shoot }),

        node('p10', 'property.get', { property: 'p_speed' }),
        node('p11', 'time.delta'),
        node('p12', 'math.multiply'),
        node('p13', 'value.number', { value: -1 }),
        node('p14', 'math.multiply'),

        node('p20', 'input.onKey', { key: 'ArrowLeft' }),
        node('p21', 'transform.translate'),
        node('p22', 'animation.play', { clip: IDS.walk }),

        node('p30', 'input.onKey', { key: 'ArrowRight' }),
        node('p31', 'transform.translate')
    ], [
        wire('p1', 'pressed', 'p8', 'in'),
        wire('p8', 'out', 'p2', 'in'),
        wire('p2', 'out', 'p3', 'in'),
        wire('p2', 'spawned', 'p3', 'object'),
        wire('p4', 'value', 'p3', 'x'),
        wire('p5', 'value', 'p6', 'a'),
        wire('p7', 'value', 'p6', 'b'),
        wire('p6', 'result', 'p3', 'y'),

        wire('p10', 'value', 'p12', 'a'),
        wire('p11', 'seconds', 'p12', 'b'),
        wire('p12', 'result', 'p14', 'a'),
        wire('p13', 'value', 'p14', 'b'),

        wire('p20', 'down', 'p21', 'in'),
        wire('p14', 'result', 'p21', 'x'),
        wire('p20', 'pressed', 'p22', 'in'),

        wire('p30', 'down', 'p31', 'in'),
        wire('p12', 'result', 'p31', 'x')
    ])
};

/** `Enemy.px` — being hit is a point, a noise, and two things destroyed. */
const ENEMY = {
    type: IDS.enemyScript,
    label: 'Enemy',
    properties: {},
    graph: graph([
        node('e1', 'scene.onCollision'),
        node('e2', 'session.get', { key: 'score' }),
        node('e3', 'math.add'),
        node('e4', 'value.number', { value: 1 }),
        node('e5', 'session.set', { key: 'score' }),
        node('e6', 'audio.play', { clip: IDS.hit }),
        node('e7', 'scene.destroy'),
        node('e8', 'scene.destroy')
    ], [
        wire('e2', 'value', 'e3', 'a'),
        wire('e4', 'value', 'e3', 'b'),
        wire('e3', 'result', 'e5', 'value'),
        wire('e1', 'enter', 'e5', 'in'),
        wire('e5', 'out', 'e6', 'in'),
        wire('e6', 'out', 'e7', 'in'),
        wire('e7', 'out', 'e8', 'in'),
        wire('e1', 'other', 'e8', 'object')
    ])
};

/** `Spawner.px` — a wave of enemies, made from the prefab, one per step. */
const SPAWNER = {
    type: IDS.spawner,
    label: 'Spawner',
    properties: {
        made: { id: 'p_made', type: 'number', default: 0 },
        count: { id: 'p_count', type: 'number', default: 3 },
        spacing: { id: 'p_spacing', type: 'number', default: 150 }
    },
    graph: graph([
        node('s1', 'event.update'),
        node('s2', 'flow.branch'),
        node('s3', 'compare.less'),
        node('s4', 'property.get', { property: 'p_made' }),
        node('s5', 'property.get', { property: 'p_count' }),
        node('s6', 'scene.spawnPrefab', { prefab: IDS.enemy }),
        node('s7', 'transform.setPosition'),
        node('s8', 'math.multiply'),
        node('s9', 'property.get', { property: 'p_spacing' }),
        node('s10', 'math.subtract'),
        node('s11', 'value.number', { value: 150 }),
        node('s12', 'value.number', { value: -140 }),
        node('s13', 'property.set', { property: 'p_made' }),
        node('s14', 'math.add'),
        node('s15', 'value.number', { value: 1 })
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
        wire('s8', 'result', 's10', 'a'),
        wire('s11', 'value', 's10', 'b'),
        wire('s10', 'result', 's7', 'x'),
        wire('s12', 'value', 's7', 'y'),
        wire('s7', 'out', 's13', 'in'),
        wire('s4', 'value', 's14', 'a'),
        wire('s15', 'value', 's14', 'b'),
        wire('s14', 'result', 's13', 'value')
    ])
};

/** `Game.px` — writes the HUD every step, and ends the level when the goal is reached. */
const GAME = {
    type: IDS.game,
    label: 'Game',
    properties: {
        goal: { id: 'p_goal', type: 'number', default: 3 },
        label: { id: 'p_label', type: 'objectref', default: null }
    },
    graph: graph([
        node('g1', 'event.update'),
        node('g2', 'property.set', { target: 'p_label', component: 'TextRenderer', property: 'text' }),
        node('g3', 'text.join'),
        node('g4', 'value.string', { value: 'Score: ' }),
        node('g5', 'text.toText'),
        node('g6', 'session.get', { key: 'score' }),
        node('g7', 'flow.branch'),
        node('g8', 'compare.greaterOrEqual'),
        node('g9', 'property.get', { property: 'p_goal' }),
        node('g10', 'scene.load', { scene: IDS.gameOver })
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
        wire('g7', 'true', 'g10', 'in')
    ])
};

/** `GameOver.px` — shows the score it inherited, and Space plays again. */
const OVER = {
    type: IDS.overScript,
    label: 'Game Over',
    properties: {
        label: { id: 'p_label', type: 'objectref', default: null }
    },
    graph: graph([
        node('o1', 'event.update'),
        node('o2', 'property.set', { target: 'p_label', component: 'TextRenderer', property: 'text' }),
        node('o3', 'text.join'),
        node('o4', 'value.string', { value: 'Final score: ' }),
        node('o5', 'text.toText'),
        node('o6', 'session.get', { key: 'score' }),
        node('o7', 'input.onKey', { key: 'Space' }),
        node('o8', 'scene.load', { scene: IDS.menu })
    ], [
        wire('o1', 'out', 'o2', 'in'),
        wire('o4', 'value', 'o3', 'a'),
        wire('o6', 'value', 'o5', 'value'),
        wire('o5', 'text', 'o3', 'b'),
        wire('o3', 'text', 'o2', 'value'),
        wire('o7', 'pressed', 'o8', 'in')
    ])
};

/** Every `.px` the demo ships, in the order they are declared. */
export const SCRIPTS = [MENU, PLAYER, ENEMY, SPAWNER, GAME, OVER];

/** A label parented under a screen-space HUD. */
function label(scene, hud, { text, size, colour, y, name }) {
    const object = scene.add(new SceneObject(name, { layer: 100 }));
    object.addComponent(new Transform(0, y));
    object.addComponent(new TextRenderer(text, size, 'system-ui, sans-serif', colour, 'left'));
    hud.addChild(object);
    return object;
}

/** A screen-space root, at a comfortable corner. */
function hudIn(scene) {
    const hud = scene.add(new SceneObject('HUD', { layer: 100 }));
    hud.addComponent(new Transform(28, 40));
    hud.addComponent(new ScreenSpace());
    return hud;
}

function cameraIn(scene) {
    const camera = scene.add(new SceneObject('Main Camera'));
    camera.addComponent(new Transform());
    camera.addComponent(new Camera());
    return camera;
}

/**
 * Build the demo into a project.
 *
 * @param {object} project - An empty Project, with a store behind it
 * @param {object} options - Options
 * @param {object} options.registry - A ComponentRegistry with the built-ins already in it
 * @param {object} options.images - `{ player, enemy, bullet }` as data URLs
 * @param {object} [options.sounds] - `{ shoot, hit }` as data URLs
 * @returns {object} What was made: the scenes, the prefabs, and the component types
 */
export function buildDemo(project, { registry, images, sounds = {} }) {
    // --- the types -------------------------------------------------------------------
    const types = {};
    for (const payload of SCRIPTS) {
        types[payload.type] = defineComponent(payload);
        registry.register(types[payload.type], { replace: true });
        project.add({ kind: ResourceKind.COMPONENT, name: `${payload.label}.px`, id: payload.type }, payload);
    }

    // --- the assets ------------------------------------------------------------------
    project.add({ kind: ResourceKind.ASSET, name: 'player.png', mime: 'image/png', id: IDS.playerSheet }, images.player);
    project.add({ kind: ResourceKind.ASSET, name: 'enemy.png', mime: 'image/png', id: IDS.enemySheet }, images.enemy);
    project.add({ kind: ResourceKind.ASSET, name: 'bullet.png', mime: 'image/png', id: IDS.bulletSheet }, images.bullet);
    if (sounds.shoot) project.add({ kind: ResourceKind.ASSET, name: 'shoot.wav', mime: 'audio/wav', id: IDS.shoot }, sounds.shoot);
    if (sounds.hit) project.add({ kind: ResourceKind.ASSET, name: 'hit.wav', mime: 'audio/wav', id: IDS.hit }, sounds.hit);

    addAnimation(project, {
        source: IDS.playerSheet,
        frameWidth: 32,
        frameHeight: 32,
        count: 4,
        columns: 4,
        fps: 10,
        loop: true
    }, { name: 'Walk.animation', id: IDS.walk });

    // --- the models, authored in a scene that is thrown away --------------------------
    const authoring = new Scene('Authoring', { registry });

    const bullet = authoring.add(new SceneObject('Bullet', { tag: 'bullet', layer: 3 }));
    bullet.addComponent(new Transform());
    bullet.addComponent(new Sprite(IDS.bulletSheet, 10, 10));
    bullet.addComponent(new BoxCollider(10, 10));
    bullet.addComponent(new Velocity(0, -460));
    addPrefab(project, bullet, { name: 'Bullet.prefab', id: IDS.bullet, registry });

    const enemy = authoring.add(new SceneObject('Enemy', { tag: 'enemy', layer: 2 }));
    enemy.addComponent(new Transform());
    enemy.addComponent(new Sprite(IDS.enemySheet, 56, 56));
    enemy.addComponent(new BoxCollider(56, 56));
    enemy.addComponent(new types[IDS.enemyScript]());
    addPrefab(project, enemy, { name: 'Enemy.prefab', id: IDS.enemy, registry });

    // --- Menu ---------------------------------------------------------------------------
    const menu = new Scene('Menu', { registry });
    cameraIn(menu);
    const menuHud = hudIn(menu);
    label(menu, menuHud, { name: 'Title', text: 'PIXEL CREATOR DEMO', size: 34, colour: '#e8e8ee', y: 0 });
    label(menu, menuHud, { name: 'Prompt', text: 'Press Space', size: 18, colour: '#8a8a99', y: 48 });

    const menuLogic = menu.add(new SceneObject('Menu'));
    menuLogic.addComponent(new Transform());
    menuLogic.addComponent(new types[IDS.menuScript]());

    const menuResource = addScene(project, menu, { name: 'Menu.scene', id: IDS.menu });

    // --- Level --------------------------------------------------------------------------
    const level = new Scene('Level', { registry });
    cameraIn(level);
    const levelHud = hudIn(level);
    const score = label(level, levelHud, { name: 'Score', text: 'Score: 0', size: 22, colour: '#e8e8ee', y: 0 });
    label(level, levelHud, {
        name: 'Hint',
        text: 'Arrows to move, Space to shoot',
        size: 14,
        colour: '#8a8a99',
        y: 34
    });

    const player = level.add(new SceneObject('Player', { tag: 'player', layer: 3 }));
    player.addComponent(new Transform(0, 190));
    player.addComponent(new Sprite(IDS.playerSheet, 64, 64));
    player.addComponent(new SpriteAnimator(IDS.walk));
    player.addComponent(new types[IDS.player]());

    const ground = level.add(new SceneObject('Ground', { layer: -1 }));
    ground.addComponent(new Transform(0, 250));
    ground.addComponent(new RectangleRenderer(900, 24, '#22222a'));

    const game = level.add(new SceneObject('Game', { tag: 'game' }));
    game.addComponent(new Transform());
    const logic = new types[IDS.game]();
    logic.label = score.id;
    logic.goal = 3;
    game.addComponent(logic);
    if (sounds.hit) game.addComponent(new AudioSource(IDS.hit, 0.2, true, false));

    const spawner = level.add(new SceneObject('Spawner'));
    spawner.addComponent(new Transform());
    spawner.addComponent(new types[IDS.spawner]());

    const levelResource = addScene(project, level, { name: 'Level.scene', id: IDS.level });

    // --- Game Over -----------------------------------------------------------------------
    const over = new Scene('Game Over', { registry });
    cameraIn(over);
    const overHud = hudIn(over);
    label(over, overHud, { name: 'Verdict', text: 'You win!', size: 40, colour: '#06d6a0', y: 0 });
    const final = label(over, overHud, { name: 'Final', text: '', size: 22, colour: '#e8e8ee', y: 54 });
    label(over, overHud, { name: 'Again', text: 'Press Space to play again', size: 16, colour: '#8a8a99', y: 92 });

    const overLogic = over.add(new SceneObject('Game Over'));
    overLogic.addComponent(new Transform());
    const ending = new types[IDS.overScript]();
    ending.label = final.id;
    overLogic.addComponent(ending);

    const overResource = addScene(project, over, { name: 'GameOver.scene', id: IDS.gameOver });

    return {
        types,
        scenes: { menu, level, over },
        resources: { menu: menuResource, level: levelResource, over: overResource }
    };
}
