// A grid of cells, and the ones that are walls (ADR-0068).
//
// TWO SUBJECTS, ONE FILE, because they are one array. The first half is the grid itself —
// what a cell is, what resizing means; the second half is what a `Body` does when it meets
// an occupied cell. Nothing here paints: painting is the Editor's, and it is tested there.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    createTileset
} from '../../core/mod.js';
import { Clock } from '../clock/clock.js';
import { Runtime } from '../runtime.js';
import { Velocity } from '../components/velocity.js';
import { BoxCollider } from '../collision/collider.js';
import { Body } from '../physics/body.js';
import { moveBodies } from '../physics/move.js';
import { Tilemap } from './tilemap.js';
import { TilemapCollider, tileBoxes } from './collider.js';

const STEP = 1 / 60;
const SIZE = 32;

function near(actual, expected, what) {
    assert.ok(globalThis.Math.abs(actual - expected) < 1e-6,
        `${what}: expected ${expected}, got ${actual}`);
}

// --- the grid ------------------------------------------------------------------------------

test('a cell is read and written by column and row, and empty is zero', () => {
    const map = new Tilemap(16, 4, 3);

    assert.equal(map.get(0, 0), 0, 'a fresh grid is empty, and empty is 0');
    map.set(2, 1, 5);

    assert.equal(map.get(2, 1), 5);
    assert.equal(map.tiles[1 * 4 + 2], 5, 'stored at row * columns + column, and nowhere else');
    assert.equal(map.get(3, 2), 0);
});

test('outside the grid is neither readable nor writable', () => {
    const map = new Tilemap(16, 4, 3);

    map.set(-1, 0, 7);
    map.set(0, -1, 7);
    map.set(4, 0, 7);
    map.set(0, 3, 7);

    assert.equal(map.tiles.filter(Boolean).length, 0, 'not one cell was invented');
    assert.equal(map.get(4, 0), 0, 'and reading outside answers empty, never undefined');
    assert.equal(map.contains(4, 0), false);
    assert.equal(map.contains(3, 2), true);
});

test('a point in local space names the cell it falls in', () => {
    const map = new Tilemap(32, 4, 3);

    assert.deepEqual(map.cellAt(0, 0), { column: 0, row: 0 });
    assert.deepEqual(map.cellAt(31.9, 0), { column: 0, row: 0 });
    assert.deepEqual(map.cellAt(32, 0), { column: 1, row: 0 });
    assert.deepEqual(map.cellAt(70, 40), { column: 2, row: 1 });
    // NEGATIVE IS OUTSIDE, NOT ZERO. A grid starts at the Object's origin; -3 is not row 0,
    // and rounding it there would paint a cell a creator was not pointing at.
    assert.deepEqual(map.cellAt(-1, -1), { column: -1, row: -1 });
});

test('growing keeps every cell where it was, and the new ones are empty', () => {
    const map = new Tilemap(16, 3, 2, [1, 2, 3, 4, 5, 6]);

    const next = map.remap(5, 4);
    map.tiles = next;
    map.columns = 5;
    map.rows = 4;

    assert.equal(next.length, 20);
    assert.equal(map.get(0, 0), 1);
    assert.equal(map.get(2, 0), 3);
    // THE ONE A NAIVE RESIZE GETS WRONG. Without a remap, `columns` alone shears the grid:
    // row 1 starts three cells in and every row after it slides further.
    assert.equal(map.get(0, 1), 4, 'the second row is still the second row');
    assert.equal(map.get(2, 1), 6);
    assert.equal(map.get(3, 0), 0, 'and what is new is empty');
    assert.equal(map.get(4, 3), 0);
});

test('shrinking crops what no longer fits, and keeps the rest in place', () => {
    const map = new Tilemap(16, 3, 3, [1, 2, 3, 4, 5, 6, 7, 8, 9]);

    const next = map.remap(2, 2);

    assert.deepEqual(next, [1, 2, 4, 5], 'the top-left corner, unmoved');
});

test('remap is pure: the grid it was asked of is untouched', () => {
    const map = new Tilemap(16, 2, 2, [1, 2, 3, 4]);

    map.remap(4, 4);

    assert.deepEqual(map.tiles, [1, 2, 3, 4], 'which is what lets one batch undo a resize');
    assert.deepEqual(map.remap(0, 0), [], 'and a grid can be emptied');
});

// --- what a body meets ----------------------------------------------------------------------

/**
 * A level made of one tilemap, with the cells a callback says are full.
 *
 * THE MAP IS PLACED SO ITS CELLS LAND ON ROUND WORLD NUMBERS: ten columns of 32 at
 * (-160, -96) spans x -160..160 and y -96..96, so the bottom row's top edge is y = 64.
 */
function level({ fill = () => 0, collider = true, columns = 10, rows = 6, at = [-160, -96], scale = 1 } = {}) {
    const registry = new ComponentRegistry();
    for (const Type of [Transform, Velocity, Body, BoxCollider, Tilemap, TilemapCollider]) {
        registry.register(Type);
    }

    const scene = new Scene('Level', { registry });
    let made = 0;

    const map = (options = {}) => {
        const object = scene.add(new SceneObject(`Map${made++}`));
        const transform = new Transform(options.at?.[0] ?? at[0], options.at?.[1] ?? at[1]);
        transform.scaleX = options.scale ?? scale;
        transform.scaleY = options.scale ?? scale;
        object.addComponent(transform);

        const tilemap = new Tilemap(SIZE, options.columns ?? columns, options.rows ?? rows);
        const shape = options.fill ?? fill;
        for (let row = 0; row < tilemap.rows; row++) {
            for (let column = 0; column < tilemap.columns; column++) {
                tilemap.set(column, row, shape(column, row));
            }
        }
        object.addComponent(tilemap);
        if (options.collider ?? collider) object.addComponent(new TilemapCollider());
        return { object, tilemap };
    };

    const body = (x, y, { gravity = 0, vx = 0, vy = 0, width = 20, height = 20 } = {}) => {
        const object = scene.add(new SceneObject(`Body${made++}`));
        object.addComponent(new Transform(x, y));
        object.addComponent(new BoxCollider(width, height));
        object.addComponent(new Velocity(vx, vy));
        object.addComponent(new Body(gravity));
        return object;
    };

    return {
        scene,
        map,
        body,
        runtime: () => new Runtime(scene, { clock: new Clock({ fixedStep: STEP }) }),
        state: object => ({
            x: object.getComponent('Transform').x,
            y: object.getComponent('Transform').y,
            vx: object.getComponent('Velocity').x,
            vy: object.getComponent('Velocity').y,
            grounded: object.getComponent('Body').grounded
        })
    };
}

/** The bottom row of a ten-by-six map. */
const floor = (column, row) => (row === 5 ? 1 : 0);

function run(runtime, steps) {
    for (let at = 0; at < steps; at++) runtime.step();
}

test('without a Tilemap Collider, a body falls straight through the tiles', () => {
    const it = level({ fill: floor, collider: false });
    it.map();
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    // A DECORATIVE TILEMAP IS A REAL THING (ADR-0068 §3): clouds, a parallax background, a
    // painted floor pattern. Drawing and blocking are two statements, and this is one of them.
    assert.ok(it.state(player).y > 200, 'nothing stopped it');
    assert.equal(it.state(player).grounded, false);
});

test('with one, a body falls onto the row of tiles and stands on it', () => {
    const it = level({ fill: floor });
    it.map();
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    near(it.state(player).y, 54, 'the bottom row starts at y = 64, and the body is 20 tall');
    assert.equal(it.state(player).vy, 0);
    assert.equal(it.state(player).grounded, true);
});

test('it stands there for three hundred steps without sinking', () => {
    const it = level({ fill: floor });
    it.map();
    const player = it.body(0, 0, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 60);
    const landed = it.state(player).y;
    run(runtime, 300);

    assert.equal(it.state(player).y, landed);
});

test('a column of tiles is a wall, and a body slides down it', () => {
    const it = level({ fill: (column, row) => (column === 8 ? 1 : 0) });
    it.map();
    // The ninth column spans x = 96..128.
    const player = it.body(0, 0, { vx: 300, vy: 120 });

    run(it.runtime(), 60);

    near(it.state(player).x, 86, 'stopped at the near face of the column');
    assert.equal(it.state(player).vx, 0);
    near(it.state(player).y, 120, 'and it kept sliding down it for the whole second');
    assert.equal(it.state(player).vy, 120, 'the tangential speed is untouched');
});

test('a row of tiles above is a ceiling, and it is not grounded', () => {
    const it = level({ fill: (column, row) => (row === 0 ? 1 : 0) });
    it.map();
    // The first row spans y = -96..-64.
    const player = it.body(0, 0, { vy: -300 });

    run(it.runtime(), 60);

    near(it.state(player).y, -54, 'stopped under the first row');
    assert.equal(it.state(player).vy, 0);
    assert.equal(it.state(player).grounded, false);
});

test('a corner of tiles stops both axes', () => {
    const it = level({ fill: (column, row) => (row === 5 || column === 8 ? 1 : 0) });
    it.map();
    const player = it.body(0, 0, { gravity: 1000, vx: 400 });

    run(it.runtime(), 90);

    near(it.state(player).x, 86, 'against the column');
    near(it.state(player).y, 54, 'and on the bottom row');
    assert.equal(it.state(player).grounded, true);
});

test('a body crossing the whole map in one step still stops at the first solid cell', () => {
    const it = level({ fill: (column, row) => (column === 5 ? 1 : 0) });
    it.map();
    // Thirty thousand units a second: two hundred cells' worth of travel in one step.
    const player = it.body(-150, 0, { vx: 30000 });

    it.runtime().step();

    // The sixth column starts at x = 0.
    near(it.state(player).x, -10, 'stopped at the face of the first occupied cell');
    assert.equal(it.state(player).vx, 0);
});

test('an empty cell in the middle of a wall is a doorway', () => {
    const it = level({ fill: (column, row) => (column === 5 && row !== 2 ? 1 : 0) });
    it.map();
    // Row 2 spans y = -32..0, so a body at y = -16 is level with the gap.
    const through = it.body(-100, -16, { vx: 300 });
    const into = it.body(-100, 40, { vx: 300 });

    run(it.runtime(), 120);

    assert.ok(it.state(through).x > 100, 'the doorway is a hole, not a thinner wall');
    near(it.state(into).x, -10, 'and the cell beside it is still a wall');
});

test('past the edge of the map there is nothing at all', () => {
    const it = level({ fill: floor });
    it.map();
    // Beyond the last column: x > 160.
    const player = it.body(200, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    assert.ok(it.state(player).y > 200, 'a map ends where its cells end');
    assert.equal(it.state(player).grounded, false);
});

// --- the Transform ---------------------------------------------------------------------------

test('moving the tilemap moves what it blocks', () => {
    const it = level({ fill: floor, at: [-160, 0] });
    it.map();
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    // The map now starts at y = 0, so its bottom row's top edge is 0 + 5 * 32 = 160.
    near(it.state(player).y, 150, 'the cells are where the Object is');
    assert.equal(it.state(player).grounded, true);
});

test('scaling the tilemap scales its cells', () => {
    const it = level({ fill: floor, at: [-160, -96], scale: 2 });
    it.map();
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 90);

    // Twice the size: the bottom row's top edge is -96 + 5 * 64 = 224.
    near(it.state(player).y, 214, 'a scaled grid is a bigger grid, not a wrong one');
});

test('a rotated tilemap draws rotated and blocks nothing, on purpose', () => {
    const it = level({ fill: floor });
    const built = it.map();
    built.object.getComponent('Transform').rotationX = 0.5;
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    // ADR-0068 §4. The alternative is a bounding box per cell, up to 41% too big, which
    // would stop a player short of a wall they can see — a whole level subtly wrong.
    assert.ok(it.state(player).y > 200, 'it fell through');
    assert.deepEqual(
        tileBoxes(built.object, built.tilemap, { minX: -200, minY: -200, maxX: 200, maxY: 200 }),
        [],
        'and the collider says so by answering nothing');
});

// --- the scene around it ----------------------------------------------------------------------

test('two tilemaps both block, and a third without a collider does not', () => {
    const it = level({ fill: floor, collider: false });
    it.map({ fill: floor, collider: true });
    it.map({ fill: (column, row) => (column === 8 ? 1 : 0), collider: true });
    it.map({ fill: () => 1, collider: false, at: [-160, -300] });
    const player = it.body(0, 0, { gravity: 1000, vx: 400 });

    run(it.runtime(), 90);

    near(it.state(player).x, 86, 'the second map stopped it sideways');
    near(it.state(player).y, 54, 'the first one holds it up');
});

test('destroying the tilemap stops stopping anything', () => {
    const it = level({ fill: floor });
    const built = it.map();
    const player = it.body(0, 0, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 60);
    assert.equal(it.state(player).grounded, true);

    it.scene.remove(built.object);
    run(runtime, 40);

    assert.ok(it.state(player).y > 100, 'the floor went with it');
});

test('a body added later lands on the tiles like any other', () => {
    const it = level({ fill: floor });
    it.map();
    const runtime = it.runtime();
    run(runtime, 10);

    const late = it.body(0, -50, { gravity: 1000 });
    run(runtime, 60);

    near(it.state(late).y, 54, 'the map was already there');
});

test('painting a cell blocks on the very next step: there is one array, not two', () => {
    const it = level({ fill: () => 0 });
    const built = it.map();
    const player = it.body(0, 0, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 10);
    assert.equal(it.state(player).grounded, false, 'nothing painted yet');

    // Straight into the model, the way the paint tool writes it.
    const column = 5;
    for (let at = 0; at < 10; at++) built.tilemap.set(at, 5, 1);

    run(runtime, 60);
    assert.equal(it.state(player).grounded, true, `cell ${column} became a wall with no rebuild`);
    near(it.state(player).y, 54);
});

// --- the same answer twice ---------------------------------------------------------------------

test('headless, and twice: two runtimes over two identical levels agree', () => {
    const played = () => {
        const it = level({ fill: (column, row) => (row === 5 || column === 9 ? 1 : 0) });
        it.map();
        const a = it.body(-100, -60, { gravity: 900, vx: 220 });
        const b = it.body(-40, 0, { gravity: 900, vx: -140 });
        run(it.runtime(), 200);
        return [it.state(a), it.state(b)];
    };

    assert.deepEqual(played(), played());
});

test('the order the tilemap and the body were added in changes nothing', () => {
    const landing = mapFirst => {
        const it = level({ fill: floor });
        let player = null;
        if (mapFirst) {
            it.map();
            player = it.body(0, 0, { gravity: 1000 });
        } else {
            player = it.body(0, 0, { gravity: 1000 });
            it.map();
        }
        run(it.runtime(), 60);
        return it.state(player);
    };

    assert.deepEqual(landing(true), landing(false));
});

test('a large sparse map costs what the corridor costs, not what the map costs', () => {
    const it = level({ fill: () => 0, columns: 400, rows: 400, at: [-200, -200] });
    const built = it.map();
    for (let column = 0; column < 400; column++) built.tilemap.set(column, 399, 1);

    const player = it.body(0, 0, { gravity: 1000 });
    const runtime = it.runtime();

    // A HUNDRED AND SIXTY THOUSAND CELLS, and the body reaches four of them. What this
    // asserts is behaviour; `tools/bench-tilemap.mjs` asserts the cost.
    run(runtime, 400);

    const boxes = tileBoxes(built.object, built.tilemap,
        { minX: -20, minY: -20, maxX: 20, maxY: 20 });
    assert.equal(boxes.length, 0, 'nothing occupied is near the middle of the map');
    assert.ok(it.state(player).grounded, 'and the far bottom row still caught it');
});

test('a scene with no tilemap at all still moves', () => {
    const it = level({ fill: floor, collider: false });
    const player = it.body(0, 0, { vx: 60 });

    assert.equal(moveBodies(it.scene, { deltaTime: STEP }), 1);
    near(it.state(player).x, 1);
});

// --- what a cell draws ------------------------------------------------------------------

/** A renderer that records, and can be told what part of the space it shows. */
function surface(bounds = null) {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });

    return {
        calls,
        drawn: () => calls.filter(call => call.name === 'drawImage'),
        clear: record('clear'),
        save: record('save'),
        restore: record('restore'),
        setTransform: record('setTransform'),
        setBlendMode: record('setBlendMode'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillCircle: record('fillCircle'),
        drawImage: record('drawImage'),
        imageSize: () => null,
        visibleBounds: () => bounds,
        fillText: record('fillText')
    };
}

/** The registry a Runtime resolves before a frame (ADR-0070 §5). */
function sheets(spec = {}) {
    const tileset = createTileset({
        source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 4, count: 8, ...spec
    });
    return { get: id => (id === 'res_tiles' ? tileset : null) };
}

test('an empty cell draws nothing, and a tile draws its own rectangle of the sheet', () => {
    const map = new Tilemap(32, 2, 2, [0, 1, 5, 0], 'res_tiles');
    const renderer = surface();

    map.draw(null, renderer, { resources: sheets() });

    const drawn = renderer.drawn();
    assert.equal(drawn.length, 2, 'two cells hold something');
    assert.deepEqual(drawn[0].args.slice(0, 5), ['res_sheet', 32, 0, 32, 32], 'placed by its cell');
    assert.deepEqual(drawn[0].args[5].clip, { x: 0, y: 0, width: 16, height: 16 }, 'tile 1 is the first');
    assert.deepEqual(drawn[1].args[5].clip, { x: 0, y: 16, width: 16, height: 16 }, 'tile 5 is the second row');
});

test('a tile the sheet does not have draws nothing at all', () => {
    // ADR-0070 §7. The cell keeps its number — it is still occupied, so it still blocks —
    // and nothing is substituted for it.
    const map = new Tilemap(32, 2, 1, [1, 99], 'res_tiles');
    const renderer = surface();

    map.draw(null, renderer, { resources: sheets() });

    assert.equal(renderer.drawn().length, 1, 'only the tile that exists');
});

test('the same map with a smaller sheet keeps its cells and draws fewer of them', () => {
    const map = new Tilemap(32, 4, 1, [1, 2, 3, 4], 'res_tiles');
    const renderer = surface();

    map.draw(null, renderer, { resources: sheets({ count: 2 }) });

    assert.equal(renderer.drawn().length, 2, 'the two the new sheet holds');
    assert.deepEqual(map.tiles, [1, 2, 3, 4], 'and the level is not corrupted, only unpainted');
});

test('no tileset, an unknown one, and a registry that answers nothing', () => {
    const renderer = surface();

    new Tilemap(32, 2, 1, [1, 2], null).draw(null, renderer, { resources: sheets() });
    new Tilemap(32, 2, 1, [1, 2], 'res_missing').draw(null, renderer, { resources: sheets() });
    new Tilemap(32, 2, 1, [1, 2], 'res_tiles').draw(null, renderer, {});
    new Tilemap(32, 2, 1, [1, 2], 'res_tiles').draw(null, renderer);

    assert.equal(renderer.drawn().length, 0, 'nothing is drawn, and nothing throws');
});

test('a sheet still decoding is asked for once and drawn when it arrives', () => {
    // THE CACHE'S CONTRACT, UNCHANGED (ADR-0062 §2). A map hands the backend a ResourceId;
    // whether the pixels are here yet is the backend's business, and a cell never fetches.
    const map = new Tilemap(32, 3, 1, [1, 2, 3], 'res_tiles');
    const renderer = surface();

    map.draw(null, renderer, { resources: sheets() });

    const asked = new globalThis.Set(renderer.drawn().map(call => call.args[0]));
    assert.deepEqual([...asked], ['res_sheet'], 'one identity, three cells');
});

test('only the cells the surface can show are drawn', () => {
    // ADR-0070 §6. A thousand-square map costs what a window shows.
    const map = new Tilemap(32, 1000, 1000, [], 'res_tiles');
    for (let row = 0; row < 1000; row++) {
        for (let column = 0; column < 1000; column++) map.set(column, row, 1);
    }

    const whole = surface(null);
    const window = surface({ minX: 0, minY: 0, maxX: 320, maxY: 160 });

    map.draw(null, window, { resources: sheets() });
    assert.ok(window.drawn().length <= 12 * 7, `a window of ten by five cells (${window.drawn().length})`);

    // COUNTER-PROOF: a backend that cannot say what it shows still draws the whole map,
    // which is what this did before and is never wrong, only slow.
    map.draw(null, whole, { resources: sheets() });
    assert.equal(whole.drawn().length, 1000 * 1000);
});

test('the visible range follows the camera, not the map', () => {
    const map = new Tilemap(32, 100, 100, [], 'res_tiles');
    for (let row = 0; row < 100; row++) {
        for (let column = 0; column < 100; column++) map.set(column, row, 1);
    }

    const near = surface({ minX: 0, minY: 0, maxX: 64, maxY: 64 });
    const far = surface({ minX: 3040, minY: 3040, maxX: 3104, maxY: 3104 });

    map.draw(null, near, { resources: sheets() });
    map.draw(null, far, { resources: sheets() });

    assert.equal(near.drawn().length, far.drawn().length, 'the same work wherever it looks');
    assert.deepEqual(near.drawn()[0].args.slice(1, 3), [0, 0]);
    assert.deepEqual(far.drawn()[0].args.slice(1, 3), [3040, 3040], 'and it is the far corner');
});

test('the collider never learns that a tileset exists', () => {
    // ADR-0068 §3 and ADR-0070 §1: a cell is empty or not, and that is the whole of what
    // stops a Body. A map with no tileset at all still has a floor.
    const it = level({ fill: floor });
    const built = it.map();
    built.tilemap.tileset = null;
    const player = it.body(0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    near(it.state(player).y, 54, 'it landed on cells that draw nothing');
    assert.equal(it.state(player).grounded, true);
});
