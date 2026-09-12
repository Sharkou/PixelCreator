// What the movement pass costs, and whether the broad phase is doing its job for it.
//
// THE ONE QUESTION WORTH MEASURING (ADR-0067 §7). Resolution adds a loop — every body
// against every solid it might reach — and that loop is quadratic unless the grid keeps it
// from being. So this reports the same pass twice: once with the candidates the grid
// proposes, once with every collider in the scene, which is what the pass would cost if a
// rejected pair became work anyway.
//
//   node tools/bench-physics.mjs

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../src/core/mod.js';
import { BoxCollider } from '../src/runtime/collision/collider.js';
import { Velocity } from '../src/runtime/components/velocity.js';
import { Body } from '../src/runtime/physics/body.js';
import { moveBodies } from '../src/runtime/physics/move.js';

const STEP = 1 / 60;
const STEPS = 120;

/** A deterministic stream, so two runs measure the same world. */
function stream(seed) {
    let state = seed;
    return () => {
        state = (state * 1103515245 + 12345) % 2147483648;
        return state / 2147483648;
    };
}

/**
 * A world of solid platforms with bodies falling through it.
 * @param {number} bodies - How many Bodies
 * @param {number} solids - How many walls and floors
 * @returns {{scene: object, bodies: object[]}} The scene and what moves in it
 */
function world(bodies, solids) {
    const registry = new ComponentRegistry();
    for (const Type of [Transform, Velocity, Body, BoxCollider]) registry.register(Type);

    const scene = new Scene('Bench', { registry });
    const next = stream(1234 + bodies + solids);
    const span = Math.sqrt(solids) * 120;

    for (let at = 0; at < solids; at++) {
        const object = scene.add(new SceneObject(`S${at}`));
        object.addComponent(new Transform(next() * span - span / 2, next() * span - span / 2));
        object.addComponent(new BoxCollider(40 + next() * 80, 24));
    }

    const moving = [];
    for (let at = 0; at < bodies; at++) {
        const object = scene.add(new SceneObject(`B${at}`));
        object.addComponent(new Transform(next() * span - span / 2, next() * span - span / 2));
        object.addComponent(new BoxCollider(24, 32));
        object.addComponent(new Velocity(next() * 200 - 100, 0));
        object.addComponent(new Body(900));
        moving.push(object);
    }

    return { scene, bodies: moving };
}

/** Milliseconds per step, averaged over STEPS. */
function time(bodies, solids, exhaustive) {
    const built = world(bodies, solids);
    const started = performance.now();
    for (let step = 0; step < STEPS; step++) {
        moveBodies(built.scene, { deltaTime: STEP, exhaustive });
    }
    return (performance.now() - started) / STEPS;
}

const rows = [];
for (const [bodies, solids] of [[1, 200], [20, 200], [100, 500], [400, 2000]]) {
    const grid = time(bodies, solids, false);
    const every = time(bodies, solids, true);
    rows.push({ bodies, solids, grid, every, gain: every / grid });
}

const pad = (text, width) => String(text).padStart(width);
console.log('bodies  solids   grid ms   every collider ms   saved');
console.log('------  ------  --------  ------------------  ------');
for (const row of rows) {
    console.log([
        pad(row.bodies, 6),
        pad(row.solids, 7),
        pad(row.grid.toFixed(3), 9),
        pad(row.every.toFixed(3), 19),
        pad(`${row.gain.toFixed(1)}x`, 7)
    ].join(''));
}
