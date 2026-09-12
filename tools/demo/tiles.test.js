// The tile level, played through the door a game client uses (ADR-0068 §9).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, NodeRegistry, hierarchyOrder, registerStandardNodes } from '../../src/core/mod.js';
import { MemoryResourceStore, Project, loadComponentDefinitions, loadScene } from '../../src/project/mod.js';
import { bundleProject, openBundle } from '../../src/preview/bundle.js';
import { Behaviors } from '../../src/runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../../src/runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../../src/runtime/builtins.js';
import { Clock } from '../../src/runtime/clock/clock.js';
import { Runtime } from '../../src/runtime/runtime.js';
import { Input } from '../../src/runtime/input/input.js';
import { BOTTOM, FLOOR, IDS, LEFT_WALL, PLATFORM_TOP, TILE, TILES, buildTileLevel } from './tiles.js';

const nodes = registerStandardNodes(new NodeRegistry());

function near(actual, expected, what) {
    assert.ok(globalThis.Math.abs(actual - expected) < 1e-6,
        `${what}: expected ${expected}, got ${actual}`);
}

async function play() {
    const store = new MemoryResourceStore();
    const project = new Project('Tiles', { store });
    buildTileLevel(project, { registry: registerBuiltIns(new ComponentRegistry()) });

    const opened = openBundle(bundleProject(project, store, { scene: IDS.scene }));
    const registry = registerBuiltIns(new ComponentRegistry());
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    const refused = [];
    await loadComponentDefinitions(opened.project, { registry, behaviors, nodes, onInvalid: e => refused.push(e) });

    const scene = await loadScene(opened.project, IDS.scene, { registry });
    const input = new Input();
    const runtime = new Runtime(scene, { behaviors, input, clock: new Clock({ fixedStep: 1 / 60 }) });
    runtime.running = true;

    const find = name => hierarchyOrder(scene).find(object => object.name === name) ?? null;
    const player = find('Player');

    return {
        opened,
        scene,
        runtime,
        input,
        refused,
        find,
        player,
        at: () => ({
            x: player.getComponent('Transform').x,
            y: player.getComponent('Transform').y,
            grounded: player.getComponent('Body').grounded
        }),
        step: (count = 1) => {
            for (let n = 0; n < count; n++) runtime.step();
        },
        hold: (code, count) => {
            input.of(null).press(code);
            for (let n = 0; n < count; n++) runtime.step();
            input.of(null).release(code);
            runtime.step();
        }
    };
}

test('the whole level is five Objects, and none of them is a wall', async () => {
    const it = await play();
    const objects = hierarchyOrder(it.scene).map(object => object.name);

    // A camera, a background, the level, the player, and two HUD nodes. The floor, the two
    // walls and the platform are cells — there is no `Wall Left` in this scene to find.
    assert.deepEqual(objects, ['Main Camera', 'Sky', 'Level', 'Player', 'HUD', 'Title']);
    assert.equal(objects.filter(name => /wall|floor|ground|platform/i.test(name)).length, 0);
    assert.deepEqual(it.refused, []);
});

test('the player falls onto the painted floor and stands on it', async () => {
    const it = await play();
    assert.equal(it.at().grounded, false, 'it starts in the air');

    it.step(60);

    near(it.at().y, FLOOR - 24, 'standing on the cells of row 11');
    assert.equal(it.at().grounded, true);
});

test('the painted wall stops it, and the wall is not an Object', async () => {
    const it = await play();
    it.step(60);

    it.hold('ArrowLeft', 200);

    near(it.at().x, LEFT_WALL + 16, 'flush against the first column of cells');
    assert.equal(it.find('Wall Left'), null, 'because there is no such Object');
});

test('a jump lands on the painted platform', async () => {
    const it = await play();
    it.step(60);

    // Walk right, jump the pit, walk on, jump onto the platform — all of it from the
    // keyboard, through the same graph a creator drew.
    const jump = () => {
        it.input.of(null).press('Space');
        it.step(1);
        it.input.of(null).release('Space');
    };

    it.input.of(null).press('ArrowRight');
    it.step(85);
    jump();
    it.step(55);
    assert.equal(it.at().grounded, true, 'cleared the hole and landed on the far side');

    // Straight away: the platform is low enough to walk UNDER, so a jump taken beneath it
    // is a head on its underside. What lands on it is a jump taken beside it.
    jump();
    it.step(70);
    it.input.of(null).release('ArrowRight');
    it.step(1);

    near(it.at().y, PLATFORM_TOP - 24, 'standing on row 8');
    assert.equal(it.at().grounded, true);
});

test('the hole in the floor is a hole, and the cells below catch the fall', async () => {
    const it = await play();
    it.step(60);

    // The gap is columns 12 and 13: world x from -96 to -32.
    it.hold('ArrowRight', 120);
    const above = it.at();
    assert.ok(above.x > -110, 'walked as far as the hole');

    it.step(120);

    near(it.at().y, BOTTOM - 24, 'it fell through the gap and landed on the bottom row');
    assert.equal(it.at().grounded, true);
});

test('the decorative map stops nothing: drawing and blocking are two statements', async () => {
    const it = await play();
    const sky = it.find('Sky');

    assert.ok(sky.getComponent('Tilemap'), 'it is a real tilemap with real cells');
    assert.ok(!sky.getComponent('TilemapCollider'), 'and no collider at all');

    it.step(60);
    // The stars live in the top rows, which is exactly where the player falls through.
    near(it.at().y, FLOOR - 24, 'it fell past every one of them');
});

test('two runs of the same inputs reach the same place', async () => {
    const transcript = async () => {
        const it = await play();
        it.step(40);
        it.hold('ArrowRight', 60);
        it.hold('Space', 2);
        it.step(80);
        return it.at();
    };

    assert.deepEqual(await transcript(), await transcript());
});

test('one cell painted at runtime becomes a wall with nothing rebuilt', async () => {
    const it = await play();
    it.step(60);
    const level = it.find('Level').getComponent('Tilemap');

    // Column 14 is the first solid cell right of the hole; make column 11 a wall instead and
    // the player is stopped before it. ONE array, and the solver reads it live.
    level.set(11, 10, 1);
    it.hold('ArrowRight', 120);

    const wallFace = -480 + 11 * TILE;
    near(it.at().x, wallFace - 16, 'stopped by a cell painted after the level was loaded');
});

test('the camera goes with the player, through a bundle and back', async () => {
    const it = await play();
    const camera = it.find('Main Camera');

    assert.ok(camera.getComponent('Follow'), 'the Component survived the crossing');
    it.step(60);
    it.hold('ArrowRight', 60);

    const player = it.at();
    const seat = camera.getComponent('Transform');
    near(seat.x, player.x, 'the camera is where the player is');
    near(seat.y, player.y - 40, 'held a little above it, as the offset says');
});

test('the level is a sheet, a cutting and two maps that name it', async () => {
    const it = await play();
    const project = it.opened?.project ?? null;
    assert.ok(project, 'the bundle opened');

    const tileset = project.read(IDS.tileset);
    assert.equal(tileset.source, IDS.sheet, 'the cutting names the picture');
    assert.equal(tileset.count, 4);

    // BOTH MAPS NAME ONE CUTTING (ADR-0070 §1). Neither carries a source, a rectangle or a
    // copy of anything: a cell is a number.
    for (const name of ['Level', 'Sky']) {
        assert.equal(it.find(name).getComponent('Tilemap').tileset, IDS.tileset, name);
    }
    assert.ok(it.find('Level').getComponent('Tilemap').tiles.every(Number.isInteger),
        'and every cell is a small integer');
});

test('the bundle a creator exports carries the sheet its tiles come from', async () => {
    const store = new MemoryResourceStore();
    const project = new Project('Tiles', { store });
    buildTileLevel(project, { registry: registerBuiltIns(new ComponentRegistry()) });

    const bundle = bundleProject(project, store, { scene: IDS.scene });
    const carried = new Set(Object.keys(bundle.payloads));

    // NO SPECIAL PATH FOR A TILEMAP (ADR-0070 §10): the sheet travels because it is a
    // resource the project declares, exactly like a Sprite's picture.
    assert.ok(carried.has(IDS.sheet), 'the picture');
    assert.ok(carried.has(IDS.tileset), 'the cutting');
    assert.ok(carried.has(IDS.scene), 'and the level');
    assert.equal(bundle.payloads[IDS.sheet].startsWith('data:image/png;base64,'), true);

    // And it opens: the same three, read back through the door a game client uses.
    const opened = openBundle(bundle);
    assert.equal(opened.project.read(IDS.tileset).source, IDS.sheet);
    assert.equal(opened.store.read(IDS.sheet), bundle.payloads[IDS.sheet]);
});
