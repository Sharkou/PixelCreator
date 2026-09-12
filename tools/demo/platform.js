// A platformer, built from the public API and nothing else (ADR-0067 §9).
//
// WHAT IT IS FOR. `src/runtime/physics/move.test.js` proves the contract in numbers; this
// proves the PRODUCT claim, which is a different sentence: that a creator can build walking,
// gravity, walls, a floor and a jump WITHOUT writing any collision logic. Everything below
// is a Component a menu offers and a node a palette offers — there is not one line of
// geometry in the graph, and there is no `.px` doing arithmetic on a position.
//
// THE WHOLE OF THE PHYSICS IS FOUR THINGS A BEGINNER CAN POINT AT:
//
//   Player  ▸ Body (gravity 1400)        it falls
//   Player  ▸ Box Collider (solid)       the world can stop it
//   Ground, Walls, Ledge ▸ solid         they stop it
//   Coin    ▸ Box Collider (not solid)   it only detects — walk straight through
//
// And the graph says nothing about any of it: it writes a speed on the two arrow keys, and
// on Space IF `grounded` — one property read, by the same `Get Property` a creator already
// uses for everything else (ADR-0067 §5).

import {
    Object as SceneObject,
    Scene,
    Transform,
    defineComponent
} from '../../src/core/mod.js';
import { ResourceKind, addScene } from '../../src/project/mod.js';
import {
    Body,
    BoxCollider,
    Camera,
    RectangleRenderer,
    ScreenSpace,
    TextRenderer,
    Velocity
} from '../../src/runtime/mod.js';

const node = (id, type, params = {}) => ({ id, type, params, x: 0, y: 0 });
const wire = (a, ap, b, bp) => ({ from: { node: a, port: ap }, to: { node: b, port: bp } });
const graph = (nodes, connections) => ({ version: 1, nodes, connections });

/** Fixed identities, so a test and a browser can name the same things. */
export const IDS = {
    scene: 'res_scene_platform',
    player: 'res_px_platform_player',
    coin: 'res_px_platform_coin'
};

/** How fast the player walks, and how hard it jumps. Two numbers, both on the cards. */
export const WALK = 190;
export const JUMP = -560;
export const GRAVITY = 1400;

/**
 * `Player.px` — two arrow keys and a gated jump.
 *
 * NOT ONE NODE OF IT IS ABOUT COLLISION. `Down` writes a speed while a key is held,
 * `Released` writes zero, and Space writes an upward speed only when `Get Property ▸ Body ▸
 * grounded` says the body is standing on something. What happens next — the wall, the floor,
 * the ledge — is the engine's sentence to finish.
 */
const PLAYER = {
    type: IDS.player,
    label: 'Platform Player',
    properties: {},
    graph: graph([
        node('l1', 'input.onKey', { key: 'ArrowLeft' }),
        node('l2', 'property.set', { component: 'Velocity', property: 'x' }),
        node('l3', 'value.number', { value: -WALK }),
        node('l4', 'property.set', { component: 'Velocity', property: 'x' }),
        node('l5', 'value.number', { value: 0 }),

        node('r1', 'input.onKey', { key: 'ArrowRight' }),
        node('r2', 'property.set', { component: 'Velocity', property: 'x' }),
        node('r3', 'value.number', { value: WALK }),
        node('r4', 'property.set', { component: 'Velocity', property: 'x' }),
        node('r5', 'value.number', { value: 0 }),

        node('j1', 'input.onKey', { key: 'Space' }),
        node('j2', 'property.get', { component: 'Body', property: 'grounded' }),
        node('j3', 'flow.branch'),
        node('j4', 'property.set', { component: 'Velocity', property: 'y' }),
        node('j5', 'value.number', { value: JUMP })
    ], [
        wire('l1', 'down', 'l2', 'in'),
        wire('l3', 'value', 'l2', 'value'),
        wire('l1', 'released', 'l4', 'in'),
        wire('l5', 'value', 'l4', 'value'),

        wire('r1', 'down', 'r2', 'in'),
        wire('r3', 'value', 'r2', 'value'),
        wire('r1', 'released', 'r4', 'in'),
        wire('r5', 'value', 'r4', 'value'),

        wire('j1', 'pressed', 'j3', 'in'),
        wire('j2', 'value', 'j3', 'condition'),
        wire('j3', 'true', 'j4', 'in'),
        wire('j5', 'value', 'j4', 'value')
    ])
};

/** `Coin.px` — a collider that blocks nothing still says when it was touched. */
const COIN = {
    type: IDS.coin,
    label: 'Coin',
    properties: {
        label: { id: 'p_label', type: 'objectref', default: null }
    },
    graph: graph([
        node('c1', 'scene.onCollision'),
        node('c2', 'property.set', { target: 'p_label', component: 'TextRenderer', property: 'text' }),
        node('c3', 'value.string', { value: 'Coin taken — you walked straight through it' }),
        node('c4', 'scene.destroy')
    ], [
        wire('c1', 'enter', 'c2', 'in'),
        wire('c3', 'value', 'c2', 'value'),
        wire('c2', 'out', 'c4', 'in')
    ])
};

/** The `.px` resources this demo ships. */
export const SCRIPTS = [PLAYER, COIN];

/** A solid piece of world: something to stand on, or to stop against. */
function block(scene, name, x, y, width, height, colour) {
    const object = scene.add(new SceneObject(name, { tag: 'ground' }));
    object.addComponent(new Transform(x, y));
    object.addComponent(new RectangleRenderer(width, height, colour));
    object.addComponent(new BoxCollider(width, height));
    return object;
}

/**
 * Build the platformer into a project.
 *
 * @param {object} project - An empty Project, with a store behind it
 * @param {object} options - Options
 * @param {object} options.registry - A ComponentRegistry with the built-ins already in it
 * @returns {object} `{ scene, types }`
 */
export function buildPlatformer(project, { registry }) {
    const types = {};
    for (const payload of SCRIPTS) {
        types[payload.type] = defineComponent(payload);
        registry.register(types[payload.type], { replace: true });
        project.add({ kind: ResourceKind.COMPONENT, name: `${payload.label}.px`, id: payload.type }, payload);
    }

    const scene = new Scene('Platform', { registry });

    const camera = scene.add(new SceneObject('Main Camera'));
    camera.addComponent(new Transform());
    camera.addComponent(new Camera());

    // The world. Down is positive Y, so the ground is the thing with the biggest number.
    block(scene, 'Ground', 0, 220, 720, 40, '#2f3440');
    block(scene, 'Wall Left', -340, 60, 40, 360, '#3a4150');
    block(scene, 'Wall Right', 340, 60, 40, 360, '#3a4150');
    block(scene, 'Ledge', 90, 120, 220, 24, '#3a4150');

    const player = scene.add(new SceneObject('Player', { tag: 'player', layer: 5 }));
    player.addComponent(new Transform(-180, -40));
    player.addComponent(new RectangleRenderer(32, 48, '#7dd3fc'));
    player.addComponent(new BoxCollider(32, 48));
    player.addComponent(new Velocity(0, 0));
    // THE ONE COMPONENT THAT MAKES IT A PLATFORMER.
    player.addComponent(new Body(GRAVITY));
    player.addComponent(new types[IDS.player]());

    const hud = scene.add(new SceneObject('HUD', { layer: 100 }));
    hud.addComponent(new Transform(28, 40));
    hud.addComponent(new ScreenSpace());

    const title = scene.add(new SceneObject('Title', { layer: 100 }));
    title.addComponent(new Transform(0, 0));
    title.addComponent(new TextRenderer('Arrows to walk, Space to jump', 20,
        'system-ui, sans-serif', '#e8e8ee', 'left'));
    hud.addChild(title);

    const status = scene.add(new SceneObject('Status', { layer: 100 }));
    status.addComponent(new Transform(0, 30));
    status.addComponent(new TextRenderer('Walk into the coin: it does not block', 16,
        'system-ui, sans-serif', '#8a8a99', 'left'));
    hud.addChild(status);

    // A COLLIDER THAT BLOCKS NOTHING, sitting on the ledge where the player has to cross it.
    const coin = scene.add(new SceneObject('Coin', { tag: 'coin', layer: 4 }));
    coin.addComponent(new Transform(-40, 176));
    coin.addComponent(new RectangleRenderer(24, 24, '#fde047'));
    coin.addComponent(new BoxCollider(24, 24, 0, 0, false));
    const script = new types[IDS.coin]();
    script.label = status.id;
    coin.addComponent(script);

    const resource = addScene(project, scene, { name: 'Platform.scene', id: IDS.scene });
    return { scene, resource, types, objects: { player, coin, status } };
}
