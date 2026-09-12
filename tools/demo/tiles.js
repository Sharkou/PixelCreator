// A level painted into ONE Tilemap, and a second one that only decorates (ADR-0068 §9).
//
// WHAT IT PROVES. The platformer in `platform.js` builds its world out of four Objects with
// four Box Colliders — which is fine for four and hopeless for a level. This builds the same
// kind of world out of cells: a floor, two walls, a platform, a pit with a floor under it —
// **five Objects in the whole scene**, and not one of them is a wall.
//
// AND THAT DRAWING IS NOT BLOCKING. The second map is the same Component with the same cells
// and no `Tilemap Collider`, so it draws and stops nothing. If the two were one idea, a
// creator could not have a background.
//
// THE PLAYER IS THE ONE FROM `platform.js`, imported rather than rewritten: a demo that
// drifts from the one beside it is two demos nobody trusts.

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
    Tilemap,
    TilemapCollider,
    Velocity
} from '../../src/runtime/mod.js';
import { GRAVITY, IDS as PLATFORM, SCRIPTS as PLATFORM_SCRIPTS } from './platform.js';

/** Fixed identities, so a test and a browser can name the same things. */
export const IDS = {
    scene: 'res_scene_tiles',
    player: PLATFORM.player
};

/** The `.px` this demo ships: the platformer's player, unchanged. */
export const SCRIPTS = PLATFORM_SCRIPTS.filter(script => script.type === PLATFORM.player);

/** The grid. Thirty by sixteen, thirty-two units a cell, placed so the middle is the origin. */
export const TILE = 32;
export const COLUMNS = 30;
export const ROWS = 16;
export const ORIGIN = [-480, -256];

/** Where the level's surfaces are, in world units — the numbers a test asserts against. */
export const FLOOR = ORIGIN[1] + 11 * TILE;
export const BOTTOM = ORIGIN[1] + 15 * TILE;
export const PLATFORM_TOP = ORIGIN[1] + 8 * TILE;
export const LEFT_WALL = ORIGIN[0] + TILE;

/** Which cells of the solid map are full. One function, and it IS the level. */
export function cellAt(column, row) {
    if (column === 0 || column === COLUMNS - 1) return 1;      // the two walls
    if (row === ROWS - 1) return 1;                            // the floor of the pit
    if (row === 11) return column === 12 || column === 13 ? 0 : 1;  // the main floor, and its hole
    if (row === 8 && column >= 18 && column <= 23) return 2;   // a platform to jump onto
    return 0;
}

/** The decorative map: a few stars, and nothing that stops anybody. */
function starAt(column, row) {
    return row < 7 && (column * 7 + row * 3) % 11 === 0 ? 1 : 0;
}

/** Fill a Tilemap from a function of its cells. */
function paint(tilemap, shape) {
    for (let row = 0; row < tilemap.rows; row++) {
        for (let column = 0; column < tilemap.columns; column++) tilemap.set(column, row, shape(column, row));
    }
    return tilemap;
}

/**
 * Build the tile level into a project.
 *
 * @param {object} project - An empty Project, with a store behind it
 * @param {object} options - Options
 * @param {object} options.registry - A ComponentRegistry with the built-ins already in it
 * @returns {object} `{ scene, resource, objects }`
 */
export function buildTileLevel(project, { registry }) {
    const types = {};
    for (const payload of SCRIPTS) {
        types[payload.type] = defineComponent(payload);
        registry.register(types[payload.type], { replace: true });
        project.add({ kind: ResourceKind.COMPONENT, name: `${payload.label}.px`, id: payload.type }, payload);
    }

    const scene = new Scene('Tiles', { registry });

    const camera = scene.add(new SceneObject('Main Camera'));
    camera.addComponent(new Transform());
    camera.addComponent(new Camera());

    // THE BACKGROUND: the same Component, the same cells, no collider (ADR-0068 §3).
    const sky = scene.add(new SceneObject('Sky', { layer: -10 }));
    sky.addComponent(new Transform(ORIGIN[0], ORIGIN[1]));
    sky.addComponent(paint(new Tilemap(TILE, COLUMNS, ROWS, [], ['#000000', '#232a3d']), starAt));

    // THE LEVEL: one Object, one grid, one collider — and every wall in it.
    const level = scene.add(new SceneObject('Level', { tag: 'ground' }));
    level.addComponent(new Transform(ORIGIN[0], ORIGIN[1]));
    level.addComponent(paint(new Tilemap(TILE, COLUMNS, ROWS, [], ['#000000', '#3a4150', '#4b6b3a']), cellAt));
    level.addComponent(new TilemapCollider());

    const player = scene.add(new SceneObject('Player', { tag: 'player', layer: 5 }));
    player.addComponent(new Transform(-400, 0));
    player.addComponent(new RectangleRenderer(32, 48, '#7dd3fc'));
    player.addComponent(new BoxCollider(32, 48));
    player.addComponent(new Velocity(0, 0));
    player.addComponent(new Body(GRAVITY));
    player.addComponent(new types[IDS.player]());

    const hud = scene.add(new SceneObject('HUD', { layer: 100 }));
    hud.addComponent(new Transform(28, 40));
    hud.addComponent(new ScreenSpace());

    const title = scene.add(new SceneObject('Title', { layer: 100 }));
    title.addComponent(new Transform(0, 0));
    title.addComponent(new TextRenderer('Arrows to walk, Space to jump — every wall here is a painted cell',
        18, 'system-ui, sans-serif', '#e8e8ee', 'left'));
    hud.addChild(title);

    const resource = addScene(project, scene, { name: 'Tiles.scene', id: IDS.scene });
    return { scene, resource, objects: { level, sky, player } };
}
