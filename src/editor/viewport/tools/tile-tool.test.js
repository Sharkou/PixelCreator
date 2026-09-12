// Painting a Tilemap in the Scene, and undoing a stroke (ADR-0068 §5, §6).
//
// NO CANVAS AND NO DOM. The tool is handed the same pointer the viewport builds and writes
// through the same Property System every other gesture uses, so what it does is a model
// change and a model change is testable without drawing anything.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Matrix,
    Object as SceneObject,
    Scene,
    Transform
} from '../../../core/mod.js';
import { createTileset } from '../../../core/mod.js';
import { Tilemap } from '../../../runtime/mod.js';
import { History } from '../../history.js';
import { resizeGrid } from '../../tilemap.js';
import { TileTool } from './tile-tool.js';

const SIZE = 32;

/** A scene with one Tilemap in it, a selection, and the tool that paints it. */
function staged({ columns = 6, rows = 4, at = [0, 0], tiles = 8 } = {}) {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Tilemap);

    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Map', { id: 'obj_map' }));
    object.addComponent(new Transform(at[0], at[1]));
    const tilemap = new Tilemap(SIZE, columns, rows, [], 'res_tiles');
    object.addComponent(tilemap);

    // The registry a viewport hands the tool: one tileset, resolved before the frame.
    const tileset = createTileset({
        source: 'res_sheet', tileWidth: 16, tileHeight: 16, columns: 4, count: tiles
    });
    const resources = { get: id => (id === 'res_tiles' ? tileset : null) };

    const selection = { object };
    const tool = new TileTool({ scene, selection, resources: () => resources });
    const history = new History(scene.operations);

    // The identity view: one world unit is one device pixel, which keeps the arithmetic in
    // the test the arithmetic a reader can check.
    const view = Matrix.identity();
    const at2 = (worldX, worldY) => ({
        device: [worldX, worldY],
        view,
        screen: view,
        world: { x: worldX, y: worldY },
        surface: { x: worldX, y: worldY },
        coarse: false
    });

    /** The pointer over the middle of a cell. */
    const over = (column, row) => at2(at[0] + column * SIZE + SIZE / 2, at[1] + row * SIZE + SIZE / 2);

    return { scene, object, tilemap, tileset, selection, tool, history, over, at: at2, view };
}

/** The grid as a string, so a whole map fits in an assertion. */
function grid(tilemap) {
    const lines = [];
    for (let row = 0; row < tilemap.rows; row++) {
        let line = '';
        for (let column = 0; column < tilemap.columns; column++) line += tilemap.get(column, row);
        lines.push(line);
    }
    return lines.join('/');
}

// --- what the tool is for -------------------------------------------------------------------

test('it is live only while a Tilemap is selected', () => {
    const it = staged();

    assert.ok(it.tool.target(), 'the map is selected');

    it.selection.object = null;
    assert.equal(it.tool.target(), null);
    assert.equal(it.tool.wouldGrab(it.over(0, 0)), false, 'and it grabs nothing');
});

test('a press inside the grid is the painter, a press outside it is not', () => {
    const it = staged();

    assert.equal(it.tool.wouldGrab(it.over(0, 0)), true);
    assert.equal(it.tool.wouldGrab(it.over(5, 3)), true, 'the last cell is inside');
    // THE ONE SENTENCE THAT DECIDES (ADR-0068 §5). Outside the grid the Select tool has the
    // press, which is what stops a creator from being locked into a mode.
    assert.equal(it.tool.wouldGrab(it.over(6, 0)), false, 'one column past the end');
    assert.equal(it.tool.wouldGrab(it.at(-10, -10)), false, 'and above and to the left of it');
});

// --- painting -------------------------------------------------------------------------------

test('a press paints the cell under it, and nothing else', () => {
    const it = staged();

    it.tool.press(it.over(2, 1));
    it.tool.release();

    assert.equal(it.tilemap.get(2, 1), 1, 'the active entry, which starts at 1');
    assert.equal(grid(it.tilemap), '000000/001000/000000/000000');
});

test('a drag paints every cell it crosses, including the ones between two samples', () => {
    const it = staged();

    it.tool.press(it.over(0, 0));
    // A pointer is sampled once a frame: this jump is what a fast drag looks like.
    it.tool.move(it.over(4, 0));
    it.tool.release();

    assert.equal(grid(it.tilemap), '111110/000000/000000/000000', 'no holes in the line');
});

test('crossing the same cell twice writes it once', () => {
    const it = staged();
    let writes = 0;
    it.scene.operations.on('operation', () => writes++);

    it.tool.press(it.over(1, 1));
    it.tool.move(it.over(2, 1));
    it.tool.move(it.over(1, 1));
    it.tool.move(it.over(2, 1));
    it.tool.release();

    assert.equal(writes, 2, 'two cells, two operations, however many times they were visited');
    assert.equal(grid(it.tilemap), '000000/011000/000000/000000');
});

test('painting the value a cell already holds is not an edit', () => {
    const it = staged();
    it.tool.press(it.over(0, 0));
    it.tool.release();

    let writes = 0;
    it.scene.operations.on('operation', () => writes++);
    it.tool.press(it.over(0, 0));
    it.tool.release();

    assert.equal(writes, 0);
});

test('entry 0 is Erase, and it is not a colour', () => {
    const it = staged();
    it.tool.press(it.over(1, 1));
    it.tool.move(it.over(3, 1));
    it.tool.release();
    assert.equal(grid(it.tilemap), '000000/011100/000000/000000');

    // The first swatch of the strip. Its position comes from the same numbers `draw()` uses.
    it.tool.draw(recorder(), it.view, { scale: 1 });
    it.tool.press(it.at(12 + 13, 12 + 13));
    assert.equal(it.tool.active, 0, 'picked Empty');

    it.tool.press(it.over(2, 1));
    it.tool.release();
    assert.equal(grid(it.tilemap), '000000/010100/000000/000000', 'and painting it clears a cell');
});

test('a thumbnail picks what is painted, and picking is not an edit', () => {
    // Placed clear of the picker: the thumbnails are drawn ON the surface, so where they are
    // drawn they take the press — the same rule any on-screen control follows.
    const it = staged({ at: [400, 400] });
    let writes = 0;
    it.scene.operations.on('operation', () => writes++);

    it.tool.draw(recorder(), it.view, { scale: 1 });
    // Third thumbnail: Empty, tile 1, tile 2 - at 12 + 2 * (26 + 4) + 13.
    it.tool.press(it.at(12 + 2 * 30 + 13, 25));
    assert.equal(it.tool.active, 2);
    assert.equal(writes, 0, 'looking at another wall is not a change to the level');

    it.tool.press(it.over(0, 0));
    it.tool.release();
    assert.equal(it.tilemap.get(0, 0), 2);
});

test('a thumbnail is the tile itself, cut from the sheet the map draws from', () => {
    const it = staged({ at: [400, 400] });
    const renderer = recorder();

    it.tool.draw(renderer, it.view, { scale: 1 });

    const drawn = renderer.calls.filter(call => call.name === 'drawImage');
    assert.equal(drawn.length, 8, 'one per tile of the sheet, and none for Empty');
    assert.equal(drawn[0].args[0], 'res_sheet', 'the ResourceId, resolved by the cache as ever');
    assert.deepEqual(drawn[0].args[5].clip, { x: 0, y: 0, width: 16, height: 16 });
    assert.deepEqual(drawn[4].args[5].clip, { x: 0, y: 16, width: 16, height: 16 }, 'the second row');
});

test('a sheet too big for one page is paged, not spilled across the scene', () => {
    const it = staged({ at: [400, 400], tiles: 120 });
    const renderer = recorder();

    it.tool.draw(renderer, it.view, { scale: 1 });
    const first = renderer.calls.filter(call => call.name === 'drawImage').length;
    assert.ok(first <= 27, `a page holds what it can show, not 120 (${first})`);

    // The last hit of the page is Next. Stepping forward shows the tiles after these.
    it.tool.press(it.at(12 + 9 * 30 + 13, 12 + 2 * 30 + 13));
    const second = recorder();
    it.tool.draw(second, it.view, { scale: 1 });

    const clips = second.calls.filter(call => call.name === 'drawImage').map(call => call.args[5].clip);
    assert.ok(clips.length > 0, 'the second page draws tiles');
    assert.notDeepEqual(clips[0], { x: 0, y: 0, width: 16, height: 16 }, 'and they are not the first ones');
});

test('with no tileset there is Empty and nothing else', () => {
    const it = staged({ at: [400, 400] });
    it.tilemap.tileset = null;
    const renderer = recorder();

    it.tool.draw(renderer, it.view, { scale: 1 });

    assert.equal(renderer.calls.filter(call => call.name === 'drawImage').length, 0);
    // And painting still works: a cell is a number, and a number needs no picture to be 1.
    it.tool.press(it.over(1, 1));
    it.tool.release();
    assert.equal(it.tilemap.get(1, 1), 1);
});

test('nothing outside the grid is ever written', () => {
    const it = staged();
    let writes = 0;
    it.scene.operations.on('operation', () => writes++);

    it.tool.press(it.over(-1, 0));
    it.tool.move(it.over(9, 9));
    it.tool.release();
    it.tool.press(it.at(-500, -500));
    it.tool.release();

    assert.equal(writes, 0);
    assert.equal(it.tilemap.tiles.filter(Boolean).length, 0);
});

test('the map is painted where it IS, not where the origin is', () => {
    const it = staged({ at: [500, -300] });

    it.tool.press(it.over(2, 2));
    it.tool.release();

    assert.equal(it.tilemap.get(2, 2), 1, 'the pointer went through the Transform');
});

// --- one stroke, one undo ----------------------------------------------------------------

test('a drag across five cells is ONE undo, and redo puts the whole stroke back', () => {
    const it = staged();

    it.tool.press(it.over(0, 2));
    it.tool.move(it.over(2, 2));
    it.tool.move(it.over(4, 2));
    it.tool.release();

    const painted = grid(it.tilemap);
    assert.equal(painted, '000000/000000/111110/000000');
    assert.equal(it.history.depth, 1, 'five cells, one entry');

    it.history.undo();
    assert.equal(grid(it.tilemap), '000000/000000/000000/000000', 'exactly the grid from before');

    it.history.redo();
    assert.equal(grid(it.tilemap), painted, 'and exactly the stroke, back again');
});

test('two strokes are two undos', () => {
    const it = staged();

    it.tool.press(it.over(0, 0));
    it.tool.move(it.over(2, 0));
    it.tool.release();

    it.tool.press(it.over(0, 3));
    it.tool.move(it.over(2, 3));
    it.tool.release();

    assert.equal(it.history.depth, 2);
    it.history.undo();
    assert.equal(grid(it.tilemap), '111000/000000/000000/000000', 'the second stroke, and only it');
    it.history.undo();
    assert.equal(grid(it.tilemap), '000000/000000/000000/000000');
});

// --- resizing ------------------------------------------------------------------------------

test('growing keeps the level where it was, and undo brings the size back', () => {
    const it = staged({ columns: 3, rows: 2 });
    it.tool.press(it.over(0, 0));
    it.tool.move(it.over(2, 0));
    it.tool.release();
    it.tool.press(it.over(0, 1));
    it.tool.release();

    resizeGrid(it.tilemap, 'columns', 5);

    assert.equal(it.tilemap.columns, 5);
    assert.equal(grid(it.tilemap), '11100/10000', 'the second row is still the second row');

    it.history.undo();
    assert.equal(it.tilemap.columns, 3);
    assert.equal(grid(it.tilemap), '111/100', 'size and content, both');
});

test('shrinking crops, and undo gives the cropped cells back', () => {
    const it = staged({ columns: 4, rows: 3 });
    it.tool.press(it.over(3, 0));
    it.tool.move(it.over(3, 2));
    it.tool.release();

    const before = grid(it.tilemap);
    resizeGrid(it.tilemap, 'columns', 2);
    assert.equal(grid(it.tilemap), '00/00/00', 'the painted column is outside now');

    // THE WHOLE REASON THE TWO WRITES SHARE A BATCH (ADR-0068 §6). A dimension written on
    // its own could only undo to "the same size, and nothing in it".
    it.history.undo();
    assert.equal(grid(it.tilemap), before, 'every cropped cell is back');

    it.history.redo();
    assert.equal(grid(it.tilemap), '00/00/00');
});

test('a resize is one history entry, not two', () => {
    const it = staged({ columns: 3, rows: 3 });
    const depth = it.history.depth;

    resizeGrid(it.tilemap, 'rows', 6);

    assert.equal(it.history.depth, depth + 1);
    assert.equal(it.tilemap.tiles.length, 18, 'and the array is the size it says it is');
});

/** A renderer that records what it was asked to draw. */
function recorder() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });

    return {
        calls,
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
        visibleBounds: () => null,
        fillText: record('fillText')
    };
}

// --- what a stroke costs the history ---------------------------------------------------

/**
 * How many VALUES an operation asks the history to remember.
 *
 * THE MEASUREMENT THE OLD SHAPE FAILED (ADR-0069 §4). A `SET_PROPERTY` on `tiles` carries
 * the whole grid twice; a `SET_CELLS` carries two numbers per cell it touched. Counting
 * values rather than milliseconds is what makes this a stable proof rather than a
 * stopwatch: it is the same number on every machine.
 */
function carried(operation) {
    const size = value => (globalThis.Array.isArray(value) ? value.length : 1);
    if (operation.type === 'SET_CELLS') return operation.cells.length * 2;
    if (operation.type === 'SET_PROPERTY') return size(operation.value) + size(operation.previous);
    return 1;
}

/** Paint a horizontal run of cells, as one stroke. */
function stroke(it, row, from, to) {
    const values = [];
    it.scene.operations.on('operation', operation => values.push(carried(operation)));

    it.tool.press(it.over(from, row));
    it.tool.move(it.over(to, row));
    it.tool.release();

    return values.reduce((total, count) => total + count, 0);
}

test('a stroke costs the history the cells it painted, not the cells of the map', () => {
    const small = staged({ columns: 100, rows: 100 });
    const huge = staged({ columns: 1000, rows: 1000 });

    const onSmall = stroke(small, 3, 0, 99);
    const onHuge = stroke(huge, 3, 0, 99);

    assert.equal(onSmall, onHuge, 'the same stroke, the same cost, on a map a hundred times bigger');
    // A hundred cells, each remembering what it was and what it became.
    assert.equal(onHuge, 200);
    assert.equal(huge.history.depth, 1, 'and it is still one undo');
});

test('COUNTER-PROOF: a whole-array write would have cost the map, a hundred times over', () => {
    // What the old shape did, measured with the same ruler: one `SET_PROPERTY` per cell,
    // each carrying the grid before and the grid after.
    const it = staged({ columns: 1000, rows: 1000 });
    const cells = 100;
    const grid = new globalThis.Array(1000 * 1000).fill(0);

    const before = carried({ type: 'SET_PROPERTY', value: grid, previous: grid }) * cells;
    const now = stroke(it, 3, 0, 99);

    assert.equal(before, 200_000_000, 'two hundred million values for a hundred cells');
    assert.equal(now, 200);
    assert.ok(before / now === 1_000_000, 'a million times less, and the drawing is identical');
});

test('a patch names every cell once, whatever the pointer did', () => {
    const it = staged();
    const patches = [];
    it.scene.operations.on('operation', operation => patches.push(operation));

    it.tool.press(it.over(1, 1));
    it.tool.move(it.over(3, 1));
    it.tool.move(it.over(1, 1));
    it.tool.release();

    const indices = patches.flatMap(operation => operation.cells.map(cell => cell.index));
    assert.equal(new globalThis.Set(indices).size, indices.length, 'no index twice');
    assert.equal(indices.length, 3, 'three cells were painted, and only three');
});

test('the grid a patch leaves behind is a plain array, exactly as it is saved', () => {
    const it = staged({ columns: 4, rows: 3 });

    it.tool.press(it.over(1, 1));
    it.tool.move(it.over(2, 1));
    it.tool.release();

    // NOTHING OF THE HISTORY REACHES THE MODEL (ADR-0069 §4). What a project file holds is
    // this array and nothing else: no indices, no `previous`, no patch.
    assert.deepEqual(it.tilemap.tiles, [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
    assert.ok(globalThis.Array.isArray(it.tilemap.tiles));

    it.history.undo();
    assert.deepEqual(it.tilemap.tiles, [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0]);
    it.history.redo();
    assert.deepEqual(it.tilemap.tiles, [0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0]);
});
