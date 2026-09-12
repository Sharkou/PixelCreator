// The platformer, played through the door a game client uses (ADR-0067 §9).
//
// THE PRODUCT QUESTION, NOT THE UNIT ONE. `src/runtime/physics/move.test.js` proves the
// contract with hand-built scenes; this proves that the contract is REACHABLE — that a
// project made of nothing but Components and nodes walks, falls, stops at a wall and jumps,
// with no collision logic anywhere in it. The same module the browser loads.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, NodeRegistry, hierarchyOrder, registerStandardNodes } from '../../src/core/mod.js';
import {
    MemoryResourceStore,
    Project,
    ResourceKind,
    loadComponentDefinitions,
    loadScene
} from '../../src/project/mod.js';
import { bundleProject, openBundle } from '../../src/preview/bundle.js';
import { Behaviors } from '../../src/runtime/scripting/behaviors.js';
import { createGraphInterpreter } from '../../src/runtime/scripting/interpreter.js';
import { registerBuiltIns } from '../../src/runtime/builtins.js';
import { Clock } from '../../src/runtime/clock/clock.js';
import { Runtime } from '../../src/runtime/runtime.js';
import { Input } from '../../src/runtime/input/input.js';
import { GRAVITY, IDS, SCRIPTS, WALK, buildPlatformer } from './platform.js';

const nodes = registerStandardNodes(new NodeRegistry());

/** Where the world is, in the numbers the scene was built with. */
const GROUND = 176;
const RIGHT_WALL = 304;
const LEFT_WALL = -304;

function near(actual, expected, what) {
    assert.ok(globalThis.Math.abs(actual - expected) < 1e-6,
        `${what}: expected ${expected}, got ${actual}`);
}

/** Build it, open it the way a game client does, and play it. */
async function play() {
    const store = new MemoryResourceStore();
    const project = new Project('Platformer', { store });
    buildPlatformer(project, { registry: registerBuiltIns(new ComponentRegistry()) });

    const opened = openBundle(await bundleProject(project, store, { scene: IDS.scene }));

    const registry = registerBuiltIns(new ComponentRegistry());
    const behaviors = new Behaviors(createGraphInterpreter({ registry: nodes }));
    const refused = [];
    await loadComponentDefinitions(opened.project, {
        registry,
        behaviors,
        nodes,
        onInvalid: entry => refused.push(entry)
    });

    const scene = await loadScene(opened.project, IDS.scene, { registry });
    const input = new Input();
    const failures = [];
    const runtime = new Runtime(scene, {
        behaviors,
        input,
        clock: new Clock({ fixedStep: 1 / 60 }),
        onError: report => failures.push(report)
    });
    runtime.running = true;

    const find = name => hierarchyOrder(scene).find(object => object.name === name) ?? null;
    const player = find('Player');

    return {
        opened,
        project,
        scene,
        runtime,
        input,
        failures,
        refused,
        find,
        player,
        at: () => ({
            x: player.getComponent('Transform').x,
            y: player.getComponent('Transform').y,
            vx: player.getComponent('Velocity').x,
            vy: player.getComponent('Velocity').y,
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
        },
        tap: code => {
            input.of(null).press(code);
            runtime.step();
            input.of(null).release(code);
            runtime.step();
        }
    };
}

// --- what it is ---------------------------------------------------------------------------

test('the platformer is one scene, two `.px`, and every graph runs', async () => {
    const it = await play();

    assert.equal(it.opened.project.resources(ResourceKind.SCENE).length, 1);
    assert.equal(it.opened.project.resources(ResourceKind.COMPONENT).length, SCRIPTS.length);
    assert.deepEqual(it.refused, [], 'a graph the validator refuses would not run at all');
    assert.equal(it.player.getComponent('Body').gravity, GRAVITY);
});

// --- the floor ----------------------------------------------------------------------------

test('the player falls and lands on the ground, and knows it', async () => {
    const it = await play();
    assert.equal(it.at().grounded, false, 'it starts in the air');

    it.step(60);

    near(it.at().y, GROUND, 'standing on the ground');
    assert.equal(it.at().vy, 0);
    assert.equal(it.at().grounded, true);
});

test('standing still for six hundred steps does not sink through the floor', async () => {
    const it = await play();
    it.step(60);
    const landed = it.at().y;

    it.step(600);

    assert.equal(it.at().y, landed, 'not a thousandth of a unit of creep');
    assert.equal(it.at().grounded, true);
});

// --- walking ------------------------------------------------------------------------------

test('holding an arrow walks, and letting go stops — no collision logic in the graph', async () => {
    const it = await play();
    it.step(60);
    const start = it.at().x;

    it.hold('ArrowRight', 30);

    assert.ok(it.at().x > start, 'it walked right');
    near(it.at().x, start + WALK * 30 / 60, 'thirty steps of walking speed');
    assert.equal(it.at().vx, 0, 'Released wrote zero');
    near(it.at().y, GROUND, 'and it never left the ground it was walking on');
});

test('walking into a wall stops there, and the wall is not pushed', async () => {
    const it = await play();
    const wall = it.find('Wall Right');
    it.step(60);

    it.hold('ArrowRight', 400);

    near(it.at().x, RIGHT_WALL, 'flush against the wall');
    assert.equal(wall.getComponent('Transform').x, 340, 'a wall is not moved by what it stops');
    near(it.at().y, GROUND, 'still on the ground');
});

test('the other wall stops it too, and nothing ever gets past either', async () => {
    const it = await play();
    it.step(60);

    const seen = [];
    it.input.of(null).press('ArrowLeft');
    for (let n = 0; n < 400; n++) {
        it.runtime.step();
        seen.push(it.at().x);
    }
    it.input.of(null).release('ArrowLeft');

    near(it.at().x, LEFT_WALL, 'flush against the left wall');
    assert.ok(seen.every(x => x >= LEFT_WALL - 1e-6 && x <= RIGHT_WALL + 1e-6),
        'not one step of one frame was spent inside a wall');
});

// --- jumping ------------------------------------------------------------------------------

test('Space jumps, and only from the ground', async () => {
    const it = await play();
    it.step(60);
    assert.equal(it.at().grounded, true);

    it.tap('Space');
    const airborne = it.at();
    assert.ok(airborne.y < GROUND, 'it left the floor on the step the key was read');
    assert.equal(airborne.grounded, false);

    // THE GATE. A second press in the air reaches a `Branch` whose condition is false, so
    // nothing is written and the fall continues — no double jump, and nobody wrote a rule.
    it.step(10);
    const rising = it.at().vy;
    it.tap('Space');
    assert.ok(it.at().vy > rising, 'the second press changed nothing; gravity kept working');

    it.step(120);
    near(it.at().y, GROUND, 'and it came back down');
    assert.equal(it.at().grounded, true);
});

test('a jump can land on the ledge, which is what a platformer is', async () => {
    const it = await play();
    it.step(60);

    // Walk to the left of the ledge and jump WHILE still walking — which is what a
    // platformer jump is, and what makes the sweep resolve two axes on the same steps.
    it.input.of(null).press('ArrowRight');
    it.step(38);
    it.input.of(null).press('Space');
    it.step(1);
    it.input.of(null).release('Space');
    it.step(90);
    it.input.of(null).release('ArrowRight');
    it.step(1);

    // The ledge's top edge is y = 108, and the player is 48 tall.
    near(it.at().y, 84, 'standing on the ledge');
    assert.equal(it.at().grounded, true);
});

// --- what does not block --------------------------------------------------------------------

test('the coin is walked straight through, and still says it was touched', async () => {
    const it = await play();
    it.step(60);

    const before = it.find('Coin');
    assert.ok(before, 'the coin is there to begin with');

    it.hold('ArrowRight', 60);

    assert.equal(it.find('Coin'), null, 'its own graph destroyed it on Enter');
    assert.equal(it.find('Status').getComponent('TextRenderer').text,
        'Coin taken — you walked straight through it');
    // NOT SLOWED, NOT STOPPED, NOT DEFLECTED. A collider that is not solid resolves nothing
    // (ADR-0067 §2) — the player carried on at walking speed through the whole crossing.
    near(it.at().x, -180 + WALK, 'a full second of walking, uninterrupted');
    assert.deepEqual(it.failures, []);
});

// --- the same answer twice ----------------------------------------------------------------

test('two runs of the same inputs reach the same position, speed and grounded', async () => {
    const transcript = async () => {
        const it = await play();
        it.step(40);
        it.hold('ArrowRight', 50);
        it.tap('Space');
        it.step(30);
        it.hold('ArrowLeft', 80);
        it.step(60);
        return it.at();
    };

    assert.deepEqual(await transcript(), await transcript());
});
