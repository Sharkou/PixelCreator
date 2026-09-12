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
import { ResourceKind, addScene, addTileset } from '../../src/project/mod.js';
import {
    Body,
    BoxCollider,
    Camera,
    Follow,
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
    player: PLATFORM.player,
    sheet: 'res_img_tiles',
    tileset: 'res_tileset_world',
    sky: 'res_tileset_sky'
};

/**
 * Which tile is which, in the sheet the demo ships.
 *
 * A NUMBER PER TILE, AND THE SHEET SAYS WHAT IT LOOKS LIKE (ADR-0070 §1). The level below
 * names these rather than colours, which is the whole difference this tranche makes.
 */
export const TILES = { STONE: 1, GRASS: 2, EARTH: 3, BRICK: 4 };

/** The `.px` this demo ships: the platformer's player, unchanged. */
export const SCRIPTS = PLATFORM_SCRIPTS.filter(script => script.type === PLATFORM.player);

/** The grid. Thirty by sixteen, thirty-two units a cell, placed so the middle is the origin. */
export const TILE = 32;
export const COLUMNS = 60;
export const ROWS = 16;
export const ORIGIN = [-480, -256];

/** Where the level's surfaces are, in world units — the numbers a test asserts against. */
export const FLOOR = ORIGIN[1] + 11 * TILE;
export const BOTTOM = ORIGIN[1] + 15 * TILE;
export const PLATFORM_TOP = ORIGIN[1] + 8 * TILE;
export const LEFT_WALL = ORIGIN[0] + TILE;

/** Which cells of the solid map are full. One function, and it IS the level. */
export function cellAt(column, row) {
    if (column === 0 || column === COLUMNS - 1) return TILES.BRICK;          // the two walls
    if (row === ROWS - 1) return TILES.STONE;                                // the floor of the pit
    if (row === 11) return column === 12 || column === 13 ? 0 : TILES.GRASS; // the floor, and its hole
    if (row === 12 && column !== 12 && column !== 13) return TILES.EARTH;    // what is under it
    if (row === 8 && column >= 18 && column <= 23) return TILES.GRASS;       // a platform to jump onto
    return 0;
}

/** The decorative map: a few stars, and nothing that stops anybody. */
function starAt(column, row) {
    return row < 7 && (column * 7 + row * 3) % 11 === 0 ? TILES.STONE : 0;
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
export function buildTileLevel(project, { registry, sheet = TILE_SHEET }) {
    // THE SHEET, THE CUTTING, AND THE MAPS THAT NAME IT (ADR-0070 §1). Three resources, and
    // the two maps below hold a ResourceId each rather than a copy of either.
    project.add({ kind: ResourceKind.ASSET, name: 'tiles.png', mime: 'image/png', id: IDS.sheet }, sheet);
    addTileset(project, {
        source: IDS.sheet, tileWidth: 16, tileHeight: 16, columns: 4, count: 4
    }, { name: 'World.tileset', id: IDS.tileset });
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
    sky.addComponent(paint(new Tilemap(TILE, COLUMNS, ROWS, [], IDS.tileset), starAt));

    // THE LEVEL: one Object, one grid, one collider — and every wall in it.
    const level = scene.add(new SceneObject('Level', { tag: 'ground' }));
    level.addComponent(new Transform(ORIGIN[0], ORIGIN[1]));
    level.addComponent(paint(new Tilemap(TILE, COLUMNS, ROWS, [], IDS.tileset), cellAt));
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
    title.addComponent(new TextRenderer('Arrows to walk, Space to jump — every wall here is a painted tile',
        18, 'system-ui, sans-serif', '#e8e8ee', 'left'));
    hud.addChild(title);

    // A LEVEL WIDER THAN THE WINDOW NEEDS A CAMERA THAT GOES WITH IT (ADR-0069 §10). One
    // Component and one picker, sitting where five nodes used to be needed.
    // THE IDENTITY, NEVER THE HANDLE (ADR-0034 §3.5): what is stored in a scene file is an
    // id, and what a running graph is handed is the Object.
    camera.addComponent(new Follow(player.id, 0, -40));

    const resource = addScene(project, scene, { name: 'Tiles.scene', id: IDS.scene });
    return { scene, resource, objects: { level, sky, player, camera } };
}

/**
 * The sheet the demo ships: four sixteen-pixel tiles in a row, drawn as a PNG.
 *
 * WRITTEN OUT AS BYTES, because a test must load under Node and a browser must draw the same
 * picture — the same rule `game.js` follows for its sprites, one description and two readers.
 * It is an uncompressed PNG built by hand: four flat colours, which is all a demo needs to
 * prove that a cell indexes a sheet rather than a palette.
 */
export const TILE_SHEET = tileSheet();

/** A 64 x 16 PNG: stone, grass, earth, brick. */
function tileSheet() {
    const width = 64;
    const height = 16;
    const colours = [[110, 118, 132], [92, 156, 76], [122, 88, 60], [150, 74, 70]];

    // One scanline per row: a filter byte, then RGB per pixel.
    const raw = [];
    for (let y = 0; y < height; y++) {
        raw.push(0);
        for (let x = 0; x < width; x++) {
            const [r, g, b] = colours[globalThis.Math.min(colours.length - 1, globalThis.Math.floor(x / 16))];
            raw.push(r, g, b);
        }
    }

    const png = [
        ...[0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a],
        ...chunk('IHDR', [
            ...be32(width), ...be32(height),
            8, 2, 0, 0, 0
        ]),
        ...chunk('IDAT', deflate(raw)),
        ...chunk('IEND', [])
    ];

    return `data:image/png;base64,${base64(png)}`;
}

/** A PNG chunk: length, type, data, CRC. */
function chunk(type, data) {
    const name = [...type].map(letter => letter.charCodeAt(0));
    const body = [...name, ...data];
    return [...be32(data.length), ...body, ...be32(crc32(body))];
}

/** Stored (uncompressed) zlib: no table, no tree, and nothing to get wrong. */
function deflate(bytes) {
    const out = [0x78, 0x01];
    for (let at = 0; at < bytes.length; at += 65535) {
        const block = bytes.slice(at, at + 65535);
        const last = at + 65535 >= bytes.length ? 1 : 0;
        out.push(last, block.length & 0xff, (block.length >> 8) & 0xff,
            ~block.length & 0xff, (~block.length >> 8) & 0xff, ...block);
    }
    return [...out, ...be32(adler32(bytes))];
}

function be32(value) {
    return [(value >>> 24) & 0xff, (value >>> 16) & 0xff, (value >>> 8) & 0xff, value & 0xff];
}

function adler32(bytes) {
    let a = 1;
    let b = 0;
    for (const byte of bytes) {
        a = (a + byte) % 65521;
        b = (b + a) % 65521;
    }
    return ((b << 16) | a) >>> 0;
}

function crc32(bytes) {
    let crc = 0xffffffff;
    for (const byte of bytes) {
        crc ^= byte;
        for (let bit = 0; bit < 8; bit++) crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
    return (crc ^ 0xffffffff) >>> 0;
}

function base64(bytes) {
    const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
    let out = '';

    for (let at = 0; at < bytes.length; at += 3) {
        const triple = (bytes[at] << 16) | ((bytes[at + 1] ?? 0) << 8) | (bytes[at + 2] ?? 0);
        out += alphabet[(triple >> 18) & 63] + alphabet[(triple >> 12) & 63]
            + (at + 1 < bytes.length ? alphabet[(triple >> 6) & 63] : '=')
            + (at + 2 < bytes.length ? alphabet[triple & 63] : '=');
    }

    return out;
}
