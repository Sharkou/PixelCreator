// What a tilemap costs a moving body, and whether the size of the level is part of it.
//
// THE CLAIM UNDER TEST (ADR-0068 §3): the cells a body is asked about are the cells it can
// reach this step, so the same character in the same corner costs the same whether the level
// is a hundred cells or a million. The table below is that sentence as numbers — the map
// grows by ten thousand times and the millisecond column does not move.
//
//   node tools/bench-tilemap.mjs

import { ComponentRegistry, Matrix, Object as SceneObject, Scene, Transform } from '../src/core/mod.js';
import { BoxCollider } from '../src/runtime/collision/collider.js';
import { Velocity } from '../src/runtime/components/velocity.js';
import { Body } from '../src/runtime/physics/body.js';
import { moveBodies } from '../src/runtime/physics/move.js';
import { Tilemap } from '../src/runtime/tilemap/tilemap.js';
import { TilemapCollider } from '../src/runtime/tilemap/collider.js';

const STEP = 1 / 60;
const STEPS = 600;
const SIZE = 32;

/**
 * A level of one tilemap, with a floor along the bottom and walls down both sides.
 * @param {number} side - The map's width and height, in cells
 * @param {number} bodies - How many characters are walking on it
 * @returns {{scene: object}} The scene
 */
function level(side, bodies) {
    const registry = new ComponentRegistry();
    for (const Type of [Transform, Velocity, Body, BoxCollider, Tilemap, TilemapCollider]) {
        registry.register(Type);
    }

    const scene = new Scene('Bench', { registry });
    const object = scene.add(new SceneObject('Map'));
    object.addComponent(new Transform(0, 0));

    const tilemap = new Tilemap(SIZE, side, side);
    for (let column = 0; column < side; column++) tilemap.set(column, side - 1, 1);
    for (let row = 0; row < side; row++) {
        tilemap.set(0, row, 1);
        tilemap.set(side - 1, row, 1);
    }
    object.addComponent(tilemap);
    object.addComponent(new TilemapCollider());

    // The characters all live in one corner: the rest of the level is somebody else's problem,
    // which is exactly what the corridor is supposed to make true.
    for (let at = 0; at < bodies; at++) {
        const body = scene.add(new SceneObject(`B${at}`));
        body.addComponent(new Transform(64 + at * 40, (side - 4) * SIZE));
        body.addComponent(new BoxCollider(24, 32));
        body.addComponent(new Velocity(at % 2 === 0 ? 180 : -180, 0));
        body.addComponent(new Body(900));
    }

    return scene;
}

function time(side, bodies) {
    const scene = level(side, bodies);
    const started = performance.now();
    for (let step = 0; step < STEPS; step++) moveBodies(scene, { deltaTime: STEP });
    return (performance.now() - started) / STEPS;
}

const rows = [];
for (const side of [32, 100, 400, 1000]) {
    for (const bodies of [1, 20]) rows.push({ side, bodies, ms: time(side, bodies) });
}

const pad = (text, width) => String(text).padStart(width);
console.log('map        cells  bodies   ms/step   µs/body');
console.log('-------  -------  ------  --------  --------');
for (const row of rows) {
    console.log([
        pad(`${row.side}x${row.side}`, 7),
        pad(row.side * row.side, 9),
        pad(row.bodies, 8),
        pad(row.ms.toFixed(4), 10),
        pad((row.ms * 1000 / row.bodies).toFixed(2), 10)
    ].join(''));
}

// --- what a stroke costs the undo stack ------------------------------------------------
//
// THE SECOND CLAIM (ADR-0069 §4): the history remembers the STROKE, never the map. Counted
// in values rather than in milliseconds, because that is the number that does not move
// between machines — and the number that was a hundred million before.

const { History } = await import('../src/editor/history.js');
const { TileTool } = await import('../src/editor/viewport/tools/tile-tool.js');

/** How many values an operation asks the history to remember. */
function carried(operation) {
    const size = value => (Array.isArray(value) ? value.length : 1);
    if (operation.type === 'SET_CELLS') return operation.cells.length * 2;
    if (operation.type === 'SET_PROPERTY') return size(operation.value) + size(operation.previous);
    return 1;
}

/** Paint `cells` cells in one stroke, and count what the history was handed. */
function strokeCost(side, cells) {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Tilemap);

    const scene = new Scene('Paint', { registry });
    const object = scene.add(new SceneObject('Map'));
    object.addComponent(new Transform(0, 0));
    object.addComponent(new Tilemap(32, side, side, [], ['#000000', '#6aa84f']));

    const history = new History(scene.operations);
    let values = 0;
    scene.operations.on('operation', operation => { values += carried(operation); });

    const tool = new TileTool({ scene, selection: { object } });
    const at = (column, row) => ({
        device: [column * 32 + 16, row * 32 + 16],
        view: Matrix.identity(),
        world: { x: column * 32 + 16, y: row * 32 + 16 }
    });

    tool.press(at(0, 3));
    tool.move(at(cells - 1, 3));
    tool.release();

    return { values, entries: history.depth };
}

console.log('');
console.log('map        cells  stroke  history entries  values remembered');
console.log('-------  -------  ------  ---------------  -----------------');
for (const side of [100, 1000]) {
    const cost = strokeCost(side, 100);
    console.log([
        pad(`${side}x${side}`, 7),
        pad(side * side, 9),
        pad(100, 8),
        pad(cost.entries, 17),
        pad(cost.values, 19)
    ].join(''));
}
