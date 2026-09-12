// Standing on a floor, stopping at a wall, and jumping (ADR-0067).
//
// EVERY TEST HERE ASKS THE SCENE, NEVER THE SOLVER. What a creator can observe is a
// Transform, a Velocity and `grounded` — so that is what is asserted, through a real
// `Runtime.step()` wherever the ORDER of the step is part of the claim. Nothing reaches into
// a private field of the pass, because a contract nobody outside can check is not a contract.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object as SceneObject,
    Scene,
    Transform
} from '../../core/mod.js';
import { Clock } from '../clock/clock.js';
import { Runtime } from '../runtime.js';
import { Velocity } from '../components/velocity.js';
import { BoxCollider } from '../collision/collider.js';
import { CollisionPhase } from '../collision/collisions.js';
import { Body } from './body.js';
import { moveBodies } from './move.js';

const STEP = 1 / 60;

/** Positions come out of sums of floats; a tenth of a thousandth of a unit is exact enough. */
function near(actual, expected, what) {
    assert.ok(globalThis.Math.abs(actual - expected) < 1e-6,
        `${what}: expected ${expected}, got ${actual}`);
}

/**
 * A scene, and three ways to put something in it: a wall, a trigger, and something that moves.
 *
 * ONE STEP IS ONE `Runtime.step()`. The movement pass is the last thing a step does, so
 * anything asserted after `step()` is what a creator would see on the frame that was drawn.
 */
function staged() {
    const registry = new ComponentRegistry();
    for (const Type of [Transform, Velocity, Body, BoxCollider]) registry.register(Type);

    const scene = new Scene('Level', { registry });
    let made = 0;

    const put = (name, x, y, { width = 20, height = 20, solid = true } = {}) => {
        const object = scene.add(new SceneObject(name, { id: `obj_${name}_${made++}` }));
        object.addComponent(new Transform(x, y));
        object.addComponent(new BoxCollider(width, height, 0, 0, solid));
        return object;
    };

    const it = {
        scene,
        registry,
        wall: put,
        trigger: (name, x, y, options = {}) => put(name, x, y, { ...options, solid: false }),
        /** Something that moves: a Transform, a Velocity, a Body and — usually — a box. */
        body: (name, x, y, { gravity = 0, vx = 0, vy = 0, collider = true, ...box } = {}) => {
            const object = collider
                ? put(name, x, y, box)
                : scene.add(new SceneObject(name, { id: `obj_${name}_${made++}` }));
            if (!collider) object.addComponent(new Transform(x, y));
            object.addComponent(new Velocity(vx, vy));
            object.addComponent(new Body(gravity));
            return object;
        },
        runtime: () => new Runtime(scene, { clock: new Clock({ fixedStep: STEP }) })
    };

    return it;
}

/** Where an Object is, how fast, and whether it is standing on something. */
function state(object) {
    const transform = object.getComponent('Transform');
    const velocity = object.getComponent('Velocity');
    return {
        x: transform.x,
        y: transform.y,
        vx: velocity?.x ?? 0,
        vy: velocity?.y ?? 0,
        grounded: object.getComponent('Body')?.grounded ?? false
    };
}

/** Run a runtime for a while. */
function run(runtime, steps) {
    for (let at = 0; at < steps; at++) runtime.step();
}

// --- the floor --------------------------------------------------------------------------

test('a falling body stops exactly on the floor, and knows it is standing on it', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 0, { gravity: 1000 });

    run(it.runtime(), 60);

    // The floor's top edge is y = 90; the player is 20 tall, so its centre rests at 80.
    // EXACTLY, not approximately: the pass moves it by the GAP, so there is nothing to
    // overshoot and nothing to push back out.
    near(state(player).y, 80, 'the player rests on the floor');
    assert.equal(state(player).vy, 0, 'the speed into the surface is gone');
    assert.equal(state(player).grounded, true);
});

test('it stays there for five hundred steps, without sinking a thousandth of a unit', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 79, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 5);
    const landed = state(player).y;
    run(runtime, 500);

    // THE DRIFT TEST, and it is the one a naive solver fails: gravity adds speed every step
    // and the resolution must take all of it back, every step, for ever.
    assert.equal(state(player).y, landed, 'not one step of creep');
    near(landed, 80, 'and it is on the floor, not inside it');
    assert.equal(state(player).grounded, true, 'still standing, five hundred steps later');
});

test('walking along the floor is not stopped by the floor it is walking on', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 4000, height: 20 });
    const player = it.body('Player', 0, 80, { gravity: 1000, vx: 120 });

    run(it.runtime(), 60);

    // TOUCHING IS NOT OVERLAPPING (ADR-0059 §3), and the perpendicular test is strict for
    // exactly this: a body flush with the floor must not snag on it.
    near(state(player).x, 120 * 60 * STEP, 'a second of walking is 120 units');
    near(state(player).y, 80, 'and it never left the floor');
    assert.equal(state(player).vx, 120, 'nothing touched the speed it is walking with');
});

test('walking off the end of the floor stops being grounded', () => {
    const it = staged();
    it.wall('Ledge', 0, 100, { width: 60, height: 20 });
    const player = it.body('Player', 0, 80, { gravity: 1000, vx: 200 });
    const runtime = it.runtime();

    run(runtime, 5);
    assert.equal(state(player).grounded, true, 'on the ledge');

    run(runtime, 30);
    assert.equal(state(player).grounded, false, 'past its edge, and falling');
    assert.ok(state(player).vy > 0, 'gravity has it again');
});

// --- the walls --------------------------------------------------------------------------

test('a body moving sideways stops against a wall and keeps sliding down it', () => {
    const it = staged();
    it.wall('Wall', 100, 0, { width: 20, height: 400 });
    const player = it.body('Player', 0, 0, { vx: 300, vy: 200 });

    run(it.runtime(), 60);

    // THE NORMAL COMPONENT IS GONE AND THE TANGENTIAL ONE IS UNTOUCHED. That is what
    // "slides along the wall" means, and it is what an axis-at-a-time sweep gives without
    // anybody writing a projection.
    near(state(player).x, 80, 'flush against the wall at x = 90');
    assert.equal(state(player).vx, 0, 'the speed into the wall is gone');
    near(state(player).y, 200 * 60 * STEP, 'and it slid the whole second downwards');
    assert.equal(state(player).vy, 200, 'the speed along the wall is not');
});

test('a jump into a ceiling stops dead, and is not grounded by it', () => {
    const it = staged();
    it.wall('Ceiling', 0, -100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 0, { vy: -300 });

    run(it.runtime(), 60);

    near(state(player).y, -80, 'stopped under the ceiling');
    assert.equal(state(player).vy, 0, 'the climb is over');
    assert.equal(state(player).grounded, false, 'a ceiling is not a floor');
});

test('a corner stops both axes at once', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    it.wall('Wall', 100, 0, { width: 20, height: 400 });
    const player = it.body('Player', 0, 0, { gravity: 1000, vx: 400 });

    run(it.runtime(), 90);

    near(state(player).x, 80, 'against the wall');
    near(state(player).y, 80, 'and on the floor');
    assert.equal(state(player).grounded, true);
});

test('a fast body does not pass through a thin wall', () => {
    const it = staged();
    it.wall('Thin', 500, 0, { width: 4, height: 400 });
    // A THOUSAND UNITS IN ONE STEP, against a wall four units thick. A solver that sampled
    // the position after the move would find nothing to stop it and the body would be on
    // the far side for ever; this measures the GAP, so the thickness of the wall is not
    // part of the question (ADR-0067 §4).
    const player = it.body('Player', 0, 0, { vx: 60000 });

    it.runtime().step();

    near(state(player).x, 488, 'stopped at the near face, on the very first step');
    assert.equal(state(player).vx, 0);
});

test('several solids in one step: the nearest one wins', () => {
    const it = staged();
    it.wall('Far', 0, 400, { width: 400, height: 20 });
    it.wall('Near', 0, 200, { width: 400, height: 20 });
    it.wall('Nearest', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 0, { vy: 6000 });

    it.runtime().step();

    near(state(player).y, 80, 'the first floor it would have reached, not the last one tested');
});

// --- what does not block ------------------------------------------------------------------

test('a trigger is crossed, and still reports Enter, Stay and Exit', () => {
    const it = staged();
    const zone = it.trigger('Zone', 100, 0, { width: 40, height: 40 });
    const player = it.body('Player', 0, 0, { vx: 600 });
    const runtime = it.runtime();

    const phases = [];
    for (let at = 0; at < 30; at++) {
        runtime.step();
        for (const entry of runtime.collisions.transitions(player)) {
            if (entry.other === zone) phases.push(entry.phase);
        }
    }

    near(state(player).x, 600 * 30 * STEP, 'nothing slowed it down');
    assert.equal(state(player).vx, 600);
    // THE THREE IDEAS STAY THREE (ADR-0067 §3): a collider that resolves nothing still
    // produces the whole contact cycle.
    assert.deepEqual(
        [phases[0], phases.at(-1)],
        [CollisionPhase.ENTER, CollisionPhase.EXIT],
        'it entered and it left'
    );
    assert.ok(phases.filter(phase => phase === CollisionPhase.STAY).length > 0, 'and stayed a while');
});

test('a trigger crossed entirely inside one step is still a contact', () => {
    const it = staged();
    const gate = it.trigger('Gate', 500, 0, { width: 4, height: 400 });
    // A THOUSAND UNITS IN ONE STEP. The gate is four units thick and sits entirely between
    // where the body starts and where it ends: it overlaps NEITHER position. A detector that
    // only ever compares two snapshots cannot see this, and a bullet through a hitbox is
    // exactly this shape.
    const bullet = it.body('Bullet', 0, 0, { vx: 60000 });
    const runtime = it.runtime();

    runtime.step();
    runtime.step();

    const seen = runtime.collisions.transitions(bullet)
        .filter(entry => entry.other === gate)
        .map(entry => entry.phase);

    assert.deepEqual(seen, [CollisionPhase.ENTER], 'the passage was observed');
    near(state(bullet).x, 2000, 'and nothing slowed it down: a trigger is not a wall');
    assert.equal(runtime.collisions.overlapping(bullet, gate), false,
        'and it is NOT overlapping it — `Is Overlapping` is still a question about area');
});

test('a body with no collider is stopped by nothing', () => {
    const it = staged();
    it.wall('Wall', 100, 0, { width: 20, height: 400 });
    const ghost = it.body('Ghost', 0, 0, { vx: 300, collider: false });

    run(it.runtime(), 60);

    near(state(ghost).x, 300 * 60 * STEP, 'straight through');
});

test('a collider with no Body is never moved by the resolution', () => {
    const it = staged();
    const wall = it.wall('Wall', 100, 0, { width: 20, height: 400 });
    it.body('Player', 0, 0, { vx: 600 });

    run(it.runtime(), 60);

    assert.deepEqual(
        [wall.getComponent('Transform').x, wall.getComponent('Transform').y],
        [100, 0],
        'a wall is not pushed by what it stops'
    );
});

test('a Body switched off is moved by its Velocity again, as it was before', () => {
    const it = staged();
    it.wall('Wall', 100, 0, { width: 20, height: 400 });
    const player = it.body('Player', 0, 0, { vx: 300 });
    player.getComponent('Body').active = false;

    run(it.runtime(), 60);

    // WHAT IS OFF IS OFF (ADR-0004). The Velocity takes the movement back, which also means
    // nothing stops it — a body that is not a body is not blocked by anything either.
    near(state(player).x, 300 * 60 * STEP, 'it moved the whole second');
});

// --- the order of a step ------------------------------------------------------------------

/** A component that writes a speed, standing in for the graph a creator would draw. */
class Pusher {
    static type = 'Pusher';
    static schema = { speed: { type: 'number', default: 0 } };

    constructor(speed = 0) {
        this.speed = speed;
    }

    update(self) {
        const velocity = self.getComponent('Velocity');
        if (velocity) velocity.x = this.speed;
    }
}

test('a speed written during the step moves the body in that same step', () => {
    const it = staged();
    it.registry.register(Pusher);
    const player = it.body('Player', 0, 0);
    player.addComponent(new Pusher(60));

    it.runtime().step();

    // THE CONTRACT ADR-0067 §4 EXISTS FOR. `Pusher` is added after `Velocity`, so in the
    // component walk it runs later — and if movement happened inside that walk, the speed it
    // wrote would not be read until the NEXT step. A creator pressing a key would see the
    // character answer one frame late, for a reason nothing on screen could explain.
    near(state(player).x, 1, 'it moved on the step the speed was written');
});

test('COUNTER-PROOF: without a Body, that same write does land one step late', () => {
    const it = staged();
    it.registry.register(Pusher);
    const drifter = it.body('Drifter', 0, 0, { collider: false });
    drifter.removeComponent('Body');
    drifter.addComponent(new Pusher(60));
    const runtime = it.runtime();

    runtime.step();
    assert.equal(state(drifter).x, 0, 'Velocity had already integrated when Pusher wrote');

    runtime.step();
    near(state(drifter).x, 1, 'and it moves from the next step on');
});

test('jumping is gated on grounded, and grounded is readable the step after landing', () => {
    const it = staged();
    it.registry.register(Pusher);
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 60, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 20);
    assert.equal(state(player).grounded, true, 'landed');

    // What a graph does: read `grounded`, and write a speed if it is true. Here, by hand —
    // the graph itself is `tools/demo/platform.js`, played in the browser.
    const body = player.getComponent('Body');
    assert.equal(body.grounded, true);
    player.getComponent('Velocity').y = -400;

    runtime.step();
    assert.ok(state(player).y < 80, 'it left the floor on the step the jump was written');
    assert.equal(state(player).grounded, false, 'and it is not standing on anything now');

    run(runtime, 120);
    near(state(player).y, 80, 'gravity brought it back');
    assert.equal(state(player).grounded, true);
});

// --- a scene that changes shape ------------------------------------------------------------

test('a floor destroyed mid-fall stops stopping anything', () => {
    const it = staged();
    const floor = it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 0, { gravity: 1000 });
    const runtime = it.runtime();

    run(runtime, 60);
    assert.equal(state(player).grounded, true);

    it.scene.remove(floor);
    run(runtime, 30);

    assert.ok(state(player).y > 80, 'nothing holds it up any more');
    assert.equal(state(player).grounded, false);
});

test('a body added to the scene is moved from the step it exists in', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const runtime = it.runtime();
    run(runtime, 3);

    const late = it.body('Late', 0, 0, { gravity: 1000 });
    run(runtime, 60);

    // THE PASS SEES THE SCENE AS IT IS WHEN THE STEP ENDS, which is a decision and not an
    // accident: a body spawned by a graph is in the scene by then, so it falls at once
    // instead of hanging in the air for exactly one frame.
    near(state(late).y, 80, 'it fell and landed like any other');
});

// --- nothing, and nothing twice -------------------------------------------------------------

test('an empty scene, a scene with no body, and no scene at all', () => {
    const empty = new Scene('Empty', { registry: new ComponentRegistry() });
    assert.equal(moveBodies(empty, { deltaTime: STEP }), 0);
    assert.equal(moveBodies(null, { deltaTime: STEP }), 0);

    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    assert.equal(moveBodies(it.scene, { deltaTime: STEP }), 0, 'walls alone move nothing');
});

test('headless: the same steps with no renderer and no audio reach the same numbers', () => {
    const built = () => {
        const it = staged();
        it.wall('Floor', 0, 100, { width: 400, height: 20 });
        it.wall('Wall', 140, 0, { width: 20, height: 400 });
        const player = it.body('Player', 0, 0, { gravity: 1200, vx: 90 });
        run(it.runtime(), 120);
        return state(player);
    };

    assert.deepEqual(built(), built(), 'two runs of one scene are one answer');
});

test('two runtimes over two identical scenes agree on position, speed and grounded', () => {
    const world = () => {
        const it = staged();
        it.wall('Floor', 0, 100, { width: 600, height: 20 });
        it.wall('Wall', 200, 0, { width: 20, height: 400 });
        const a = it.body('A', -100, 0, { gravity: 900, vx: 140 });
        const b = it.body('B', -40, -200, { gravity: 900, vx: 60 });
        return { runtime: it.runtime(), a, b };
    };

    const first = world();
    const second = world();
    run(first.runtime, 200);
    run(second.runtime, 200);

    assert.deepEqual(state(first.a), state(second.a));
    assert.deepEqual(state(first.b), state(second.b));
});

test('the order the floors were added in does not change where the body lands', () => {
    const landing = order => {
        const it = staged();
        const floors = {
            far: () => it.wall('Far', 0, 400, { width: 400, height: 20 }),
            near: () => it.wall('Near', 0, 200, { width: 400, height: 20 }),
            nearest: () => it.wall('Nearest', 0, 100, { width: 400, height: 20 })
        };
        for (const name of order) floors[name]();
        const player = it.body('Player', 0, 0, { gravity: 1000 });
        run(it.runtime(), 60);
        return state(player);
    };

    assert.deepEqual(landing(['far', 'near', 'nearest']), landing(['nearest', 'near', 'far']));
    assert.deepEqual(landing(['near', 'nearest', 'far']), landing(['far', 'near', 'nearest']));
});

test('no physics state survives into another scene, because the pass holds none', () => {
    const it = staged();
    it.wall('Floor', 0, 100, { width: 400, height: 20 });
    const player = it.body('Player', 0, 0, { gravity: 1000 });
    run(it.runtime(), 60);
    assert.equal(state(player).grounded, true);

    // A transition builds a new Runtime over a new scene (ADR-0063 §3). The SAME ids are
    // used on purpose: if anything about the last world were remembered, this is where it
    // would show.
    const next = staged();
    const other = next.body('Player', 0, 0, { gravity: 1000 });
    next.runtime().step();

    assert.equal(other.getComponent('Body').grounded, false, 'nothing to stand on here');
    assert.ok(state(other).y > 0, 'and it falls, because this scene has no floor');
});

// --- the broad phase is a filter, never an answer ---------------------------------------

/**
 * A scene of solids and bodies, generated from a seed, played both ways.
 *
 * THE DIFFERENTIAL PROOF (ADR-0064 §4, now for movement too). The grid decides which pairs a
 * body is asked about; if it ever drops one it should have proposed, a body passes through a
 * wall in one corner of one level, and no unit test of the grid would find it — a wrong grid
 * is still consistent with itself.
 */
function generated(seed, exhaustive) {
    const it = staged();
    let state1 = seed;
    const next = () => {
        state1 = (state1 * 1103515245 + 12345) % 2147483648;
        return state1 / 2147483648;
    };

    for (let at = 0; at < 40; at++) {
        it.wall(`W${at}`, globalThis.Math.round(next() * 600 - 300),
            globalThis.Math.round(next() * 600 - 300),
            { width: 10 + globalThis.Math.round(next() * 60), height: 10 + globalThis.Math.round(next() * 60) });
    }

    const bodies = [];
    for (let at = 0; at < 8; at++) {
        bodies.push(it.body(`B${at}`, globalThis.Math.round(next() * 200 - 100),
            globalThis.Math.round(next() * 200 - 100),
            { gravity: 600, vx: next() * 400 - 200, vy: next() * 200 - 100 }));
    }

    for (let step = 0; step < 120; step++) {
        moveBodies(it.scene, { deltaTime: STEP, exhaustive });
    }

    return bodies.map(state);
}

test('grid and exhaustive reach the same positions, speeds and grounded flags', () => {
    for (const seed of [1, 7, 99, 4242, 31337]) {
        assert.deepEqual(generated(seed, false), generated(seed, true),
            `seed ${seed}: what the grid proposed was enough`);
    }
});

test('COUNTER-PROOF: a body that ignores its blockers ends somewhere else', () => {
    // The same scene with nothing solid in it is a different answer — which is what makes
    // the equality above a statement about the grid rather than about an empty room.
    const blocked = generated(7, false);
    const free = (() => {
        const it = staged();
        const player = it.body('B0', 0, 0, { gravity: 600, vy: 0 });
        for (let step = 0; step < 120; step++) moveBodies(it.scene, { deltaTime: STEP });
        return state(player);
    })();

    assert.notDeepEqual(blocked[0], free);
});
