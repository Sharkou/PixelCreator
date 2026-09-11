// What is touching what, and when a graph is told about it (ADR-0059).
//
// THE TWO THINGS THESE PROTECT. First, that the answer is a function of the scene's STATE:
// the same scene built two different ways reports the same pairs, in the same order, so a
// server and a client agree. Second, that a step DECIDES its events before any behaviour
// runs — because the moment two bullets hit one enemy, whether the second one fires at all
// must not depend on what the first one did to the scene.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object as SceneObject,
    Scene,
    Transform,
    deserializeScene,
    serializeScene
} from '../../core/mod.js';
import { BoxCollider, boxesOverlap, worldBox } from './collider.js';
import { CollisionPhase, Collisions } from './collisions.js';

/** A scene that can hold boxes, and a way to put one in it. */
function staged() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(BoxCollider);

    const scene = new Scene('Level', { registry });
    const box = (name, x, y, options = {}) => {
        const object = scene.add(new SceneObject(name, { id: `obj_${name}` }));
        object.addComponent(new Transform(x, y, options.rotation ?? 0,
            options.scale ?? 1, options.scale ?? 1));
        object.addComponent(new BoxCollider(
            options.width ?? 20, options.height ?? 20,
            options.offsetX ?? 0, options.offsetY ?? 0
        ));
        return object;
    };

    return { scene, box, collisions: new Collisions() };
}

/** The phases one Object sees this step, as `name:phase`. */
function seen(collisions, object) {
    return collisions.transitions(object).map(entry => `${entry.other.name}:${entry.phase}`);
}

// --- the geometry ---------------------------------------------------------------------------

test('a world box follows position, scale and the parent chain', () => {
    const it = staged();
    const parent = it.box('Parent', 100, 0, { scale: 2 });
    const child = it.box('Child', 10, 0);
    parent.addChild(child);

    const box = worldBox(child, child.getComponent('BoxCollider'));

    // The parent doubles everything under it: the child sits at 100 + 10*2 and is 40 wide.
    assert.equal(box.minX, 100);
    assert.equal(box.maxX, 140);
    assert.equal(box.minY, -20);
    assert.equal(box.maxY, 20);
});

test('an offset moves the box without moving the Object', () => {
    const it = staged();
    const object = it.box('Feet', 0, 0, { offsetY: -30, height: 10 });

    const box = worldBox(object, object.getComponent('BoxCollider'));

    assert.deepEqual([box.minY, box.maxY], [-35, -25]);
    assert.equal(object.getComponent('Transform').y, 0, 'the Object did not move');
});

test('a rotated box reports the axis-aligned box around it, and says so', () => {
    // ADR-0059 §3: an AABB of the transformed corners, never an OBB. A square turned 45° is
    // reported about 1.41 times as wide — conservative, never missing a real overlap.
    const it = staged();
    const object = it.box('Turned', 0, 0, { rotation: Math.PI / 4 });

    const box = worldBox(object, object.getComponent('BoxCollider'));

    assert.ok(Math.abs((box.maxX - box.minX) - 20 * Math.SQRT2) < 1e-9);
});

test('two boxes sharing exactly one edge are not overlapping', () => {
    assert.equal(boxesOverlap(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 10, minY: 0, maxX: 20, maxY: 10 }
    ), false, 'touching is not overlapping: no area is shared');

    assert.equal(boxesOverlap(
        { minX: 0, minY: 0, maxX: 10, maxY: 10 },
        { minX: 9, minY: 0, maxX: 20, maxY: 10 }
    ), true);
});

// --- enter, stay, exit ------------------------------------------------------------------------

test('objects apart report nothing at all', () => {
    const it = staged();
    it.box('A', 0, 0);
    it.box('B', 500, 0);

    it.collisions.update(it.scene);

    assert.equal(it.collisions.size, 0);
    assert.deepEqual(seen(it.collisions, it.scene.get('obj_A')), []);
});

test('Enter once, then Stay, then Exit once — and they never overlap', () => {
    // THE CONTRACT, IN ONE TEST. `Enter` and `Stay` are disjoint (ADR-0059 §5): the first
    // step is Enter and nothing else, so "damage once" and "damage while touching" are two
    // wires rather than one minus the other.
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 500, 0);

    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), []);

    b.getComponent('Transform').x = 10;
    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:enter']);
    assert.deepEqual(seen(it.collisions, b), ['A:enter']);

    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:stay']);

    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:stay'], 'and it keeps saying so');

    b.getComponent('Transform').x = 500;
    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:exit']);
    assert.deepEqual(seen(it.collisions, b), ['A:exit']);

    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), [], 'and then nothing');
});

test('both sides are told, each about the other', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);

    it.collisions.update(it.scene);

    assert.deepEqual(seen(it.collisions, a), ['B:enter']);
    assert.deepEqual(seen(it.collisions, b), ['A:enter']);
    assert.equal(it.collisions.size, 1, 'one pair, stored once');
});

test('an Object cannot carry two Box Colliders, so a pair can only fire once', () => {
    // ADR-0059 §5, AND THE MODEL SETTLES IT RATHER THAN THIS FILE. One Component per type per
    // Object (ARCHITECTURE.md) — a second `BoxCollider` is REFUSED outright — so "a player with
    // two hitboxes hitting one enemy twice" is not a case that can be constructed today. The
    // event is Object to Object because the model already is; the detector still gathers every
    // shape an Object carries, which is what a `CircleCollider` beside a box would need.
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);

    assert.throws(() => a.addComponent(new BoxCollider(40, 40)), /already attached/,
        'the model refuses a second one outright');
    assert.equal(a.componentTypes().filter(type => type === 'BoxCollider').length, 1);

    it.collisions.update(it.scene);

    assert.deepEqual(seen(it.collisions, a), ['B:enter']);
    assert.equal(it.collisions.size, 1);
});

// --- what does not collide ----------------------------------------------------------------------

test('an inactive Object collides with nothing', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);

    b.active = false;
    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), []);

    b.active = true;
    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:enter'], 'and it starts touching when it comes back');
});

test('a switched-off collider collides with nothing', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);

    b.getComponent('BoxCollider').active = false;
    it.collisions.update(it.scene);

    assert.deepEqual(seen(it.collisions, a), []);
});

test('an Object with no collider takes part in nothing', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    const bare = it.scene.add(new SceneObject('Bare'));
    bare.addComponent(new Transform());

    it.collisions.update(it.scene);

    assert.deepEqual(seen(it.collisions, a), []);
    assert.equal(it.collisions.overlapping(a, bare), false);
});

// --- the same scene, two histories ----------------------------------------------------------------

test('the same scene built two ways reports the same pairs', () => {
    // THE DEFECT CANONICAL ORDER EXISTS TO PREVENT (ADR-0034 §3.1), asked of collisions:
    // insertion order is a fact about how a scene was BUILT, and two clients holding the same
    // state must agree about what is touching what.
    // READ UNSORTED, ON PURPOSE. The SET of pairs is order-independent whatever the walk is —
    // every pair is tested against every other — so sorting the answer would make this test
    // pass with insertion order too. What canonical order actually decides is the ORDER a
    // graph is told about its collisions in, which is the order its behaviours then run in.
    const read = build => {
        const it = staged();
        build(it);
        it.collisions.update(it.scene);
        return seen(it.collisions, it.scene.get('obj_Middle'));
    };

    const forwards = read(it => {
        it.box('Left', -8, 0);
        it.box('Middle', 0, 0);
        it.box('Right', 8, 0);
    });

    const backwards = read(it => {
        const right = it.box('Right', 8, 0);
        const middle = it.box('Middle', 0, 0);
        const left = it.box('Left', -8, 0);
        it.scene.reparent(left, null, 0);
        it.scene.reparent(middle, null, 1);
        it.scene.reparent(right, null, 2);
    });

    assert.deepEqual(forwards, ['Left:enter', 'Right:enter'], 'canonical order, not insertion order');
    assert.deepEqual(backwards, forwards, 'and the other scene, built backwards, agrees');
});

test('a scene saved and reloaded reports the same pairs', () => {
    const it = staged();
    it.box('A', 0, 0);
    it.box('B', 5, 0);
    it.collisions.update(it.scene);
    const before = seen(it.collisions, it.scene.get('obj_A'));

    const reloaded = deserializeScene(JSON.parse(JSON.stringify(serializeScene(it.scene))), {
        registry: it.scene.registry
    });
    const after = new Collisions().update(reloaded);

    assert.deepEqual(seen(after, reloaded.get('obj_A')), before);
});

// --- destruction ---------------------------------------------------------------------------------

test('a pair whose Object has gone produces nothing at all', () => {
    // ADR-0059 §4.1. "The thing you were touching stopped touching you, because it ceased to
    // exist" is not a sentence a creator can act on, and it would hand out a dead handle.
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);

    it.collisions.update(it.scene);
    assert.deepEqual(seen(it.collisions, a), ['B:enter']);

    it.scene.remove(b);
    it.collisions.update(it.scene);

    assert.deepEqual(seen(it.collisions, a), [], 'no exit on something that is gone');
    assert.equal(it.collisions.overlapping(a, b), false);
});

// --- asking rather than waiting --------------------------------------------------------------------

test('overlapping answers the snapshot, and answers false for anything absent', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    const b = it.box('B', 5, 0);
    const far = it.box('Far', 900, 0);

    it.collisions.update(it.scene);

    assert.equal(it.collisions.overlapping(a, b), true);
    assert.equal(it.collisions.overlapping(b, a), true, 'the pair is stored once, asked either way');
    assert.equal(it.collisions.overlapping(a, far), false);
    assert.equal(it.collisions.overlapping(a, a), false, 'nothing overlaps itself');
    assert.equal(it.collisions.overlapping(a, null), false);
    assert.equal(it.collisions.overlapping(null, null), false);
});

// --- the shape of the answer ------------------------------------------------------------------------

test('every phase is one of the three, and a pair is only ever in one', () => {
    const it = staged();
    const a = it.box('A', 0, 0);
    it.box('B', 5, 0);

    it.collisions.update(it.scene);
    const phases = it.collisions.transitions(a).map(entry => entry.phase);

    assert.equal(phases.length, 1);
    assert.ok(globalThis.Object.values(CollisionPhase).includes(phases[0]));
});
