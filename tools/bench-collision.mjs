// Before and after, on the numbers that asked for a broad phase (ADR-0064 §5).
//
// Usage: node tools/bench-collision.mjs
//
// IT REPORTS TWO COSTS AND NOT ONE. `tested` is how many pairs the step had to ASK about,
// which is what a broad phase moves; `touching` is how many really overlap, which nothing can
// move — a thousand things genuinely on top of each other IS half a million pairs. Reporting
// only the milliseconds would let the second be mistaken for the first.

import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../src/core/mod.js';
import { BoxCollider } from '../src/runtime/collision/collider.js';
import { Collisions } from '../src/runtime/collision/collisions.js';

const registry = new ComponentRegistry();
registry.register(Transform);
registry.register(BoxCollider);

/** Three distributions, because a broad phase helps two of them and cannot help the third. */
const LAYOUTS = {
    /** Nothing near anything: the case the first version paid the most for and gained least. */
    spread: (index, count) => {
        const columns = Math.ceil(Math.sqrt(count));
        return { x: (index % columns) * 64, y: Math.floor(index / columns) * 64 };
    },
    /** Clumps of ten, which is what a game of enemies and bullets actually looks like. */
    clustered: (index, count) => {
        const group = Math.floor(index / 10);
        const columns = Math.ceil(Math.sqrt(count / 10));
        return {
            x: (group % columns) * 400 + (index % 10) * 12,
            y: Math.floor(group / columns) * 400 + ((index % 10) % 3) * 12
        };
    },
    /** Everything on one point: the case where every pair really does touch. */
    stacked: () => ({ x: 0, y: 0 })
};

function build(count, layout) {
    const scene = new Scene('Bench', { registry });

    for (let index = 0; index < count; index++) {
        const at = LAYOUTS[layout](index, count);
        const object = scene.add(new SceneObject(`C${index}`));
        object.addComponent(new Transform(at.x, at.y));
        object.addComponent(new BoxCollider(32, 32));
    }

    return scene;
}

function measure(scene, exhaustive, frames) {
    const collisions = new Collisions({ exhaustive });
    collisions.update(scene);

    const started = process.hrtime.bigint();
    for (let frame = 0; frame < frames; frame++) collisions.update(scene);
    const ms = Number(process.hrtime.bigint() - started) / 1e6 / frames;

    return { ms, tested: collisions.tested, touching: collisions.size };
}

const header = ['layout', 'n', 'brute ms', 'grid ms', 'speed-up', 'brute pairs', 'grid pairs', 'touching'];
const rows = [];

for (const layout of ['spread', 'clustered', 'stacked']) {
    for (const count of [100, 500, 1000, 5000]) {
        // A THOUSAND STACKED COLLIDERS IS HALF A MILLION REAL PAIRS AND TAKES A SECOND A STEP.
        // Five thousand of them is twelve million, which is not a benchmark, it is a hang.
        if (layout === 'stacked' && count > 1000) continue;

        const scene = build(count, layout);
        const frames = count >= 1000 && layout === 'stacked' ? 2 : count >= 5000 ? 3 : 10;

        const brute = measure(scene, true, frames);
        const grid = measure(scene, false, frames);

        rows.push([
            layout,
            String(count),
            brute.ms.toFixed(2),
            grid.ms.toFixed(2),
            `${(brute.ms / grid.ms).toFixed(1)}x`,
            String(brute.tested),
            String(grid.tested),
            String(grid.touching)
        ]);

        if (brute.touching !== grid.touching) {
            throw new Error(`DIFFERENTIAL FAILURE: ${layout}/${count} — brute ${brute.touching}, grid ${grid.touching}`);
        }
    }
}

const widths = header.map((name, column) => Math.max(name.length, ...rows.map(row => row[column].length)));
const line = cells => cells.map((cell, column) => cell.padStart(widths[column])).join('  ');

console.log(line(header));
console.log(widths.map(width => '-'.repeat(width)).join('  '));
for (const row of rows) console.log(line(row));
