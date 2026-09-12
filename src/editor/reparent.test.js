// The Editor's reparent policy (ADR-0022).
//
// The world is preserved when it is mathematically representable, and the geometry is
// composed here as Operations rather than hidden inside a Core handler.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object,
    Scene,
    Transform,
    worldMatrix,
    worldPosition
} from '../core/mod.js';
import { History } from './history.js';
import { registerBuiltIns } from './registry.js';
import { createObject, reparentObject } from './commands.js';

function scene() {
    return new Scene('Main', { registry: registerBuiltIns(new ComponentRegistry()) });
}

function place(target, object, x, y, { rotation = 0, scaleX = 1, scaleY = 1 } = {}) {
    const transform = object.getComponent('Transform');
    transform.x = x;
    transform.y = y;
    transform.rotationX = rotation;
    transform.scaleX = scaleX;
    transform.scaleY = scaleY;
    return object;
}

test('a reparent holds the object where it looks', () => {
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50);
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const before = worldPosition(child);
    const result = reparentObject(target, child, parent);

    assert.equal(result.applied, true);
    assert.equal(result.sheared, false);
    assert.equal(child.parent, parent);

    const after = worldPosition(child);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
    assert.ok(Math.abs(child.x + 90) < 1e-9, 'the LOCAL values were rewritten, not a world pair');
});

test('the whole gesture is one history entry', () => {
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50,
        { rotation: 0.4, scaleX: 2, scaleY: 2 });
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));

    const result = reparentObject(target, child, parent);

    assert.equal(operations[0].type, 'REPARENT');
    // FIVE, NOT SIX: `rotationY` is not decomposed from the matrix because it is not IN it
    // as an angle — it left as a horizontal scale, and `scaleX` carries it back (ADR-0051
    // §1). Writing it here would be inventing a value the geometry never reported.
    assert.deepEqual(operations.slice(1).map(operation => operation.prop),
        ['x', 'y', 'rotationX', 'scaleX', 'scaleY']);
    assert.ok(operations.every(operation => operation.batch === result.batch),
        'one batch, so one undo takes the whole drop back');
});

test('the recomputed values travel as numbers, so no node recomposes its own', () => {
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 0, 0,
        { rotation: Math.PI / 3, scaleX: 2, scaleY: 2 });
    const child = place(target, createObject(target, { kind: 'empty' }), 40, 0);

    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));
    reparentObject(target, child, parent);

    const written = operations.filter(operation => operation.type === 'SET_PROPERTY');
    assert.ok(written.every(operation => typeof operation.value === 'number'));
    assert.ok(written.every(operation => typeof operation.previous === 'number'),
        'and each carries what it takes to reverse it');
});

test('opting out keeps the local placement, and produces one operation', () => {
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50);
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));
    reparentObject(target, child, parent, undefined, { preserveWorld: false });

    assert.equal(child.x, 10, 'the local values are what a script would expect');
    assert.deepEqual(operations.map(operation => operation.type), ['REPARENT']);
});

test('a shear is reported rather than silently deformed', () => {
    // A non-uniform scale on a grandparent plus a rotation in between — the exact
    // condition ADR-0022 names. The new parent's own world transform is sheared, and the
    // local transform that would hold a rotated child's world is then not expressible as
    // position, rotation and scale.
    const target = scene();
    const stretched = place(target, createObject(target, { kind: 'empty' }), 0, 0,
        { scaleX: 3, scaleY: 1 });
    const rotated = place(target, createObject(target, { kind: 'empty' }), 0, 0,
        { rotation: Math.PI / 4 });
    reparentObject(target, rotated, stretched, undefined, { preserveWorld: false });

    const loose = place(target, createObject(target, { kind: 'empty' }), 20, 5,
        { rotation: Math.PI / 4 });
    const reports = [];
    const result = reparentObject(target, loose, rotated, undefined, {
        onReport: report => reports.push(report)
    });

    assert.equal(result.applied, true, 'the reparent itself happened');
    assert.equal(result.sheared, true);
    assert.equal(reports.length, 1);
    assert.equal(reports[0].kind, 'reparent:sheared');
    assert.equal(loose.x, 20, 'and the object kept a defensible placement rather than a wrong one');
});

test('unparenting to the scene root holds the world too', () => {
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50,
        { rotation: 0.5, scaleX: 2, scaleY: 2 });
    const child = createObject(target, { kind: 'empty', parent });
    place(target, child, 10, 10);

    const before = worldPosition(child);
    reparentObject(target, child, null);

    const after = worldPosition(child);
    assert.equal(child.parent, null);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test('reordering among the roots does not move anything', () => {
    const target = scene();
    const first = place(target, createObject(target, { kind: 'empty' }), 10, 10);
    const second = place(target, createObject(target, { kind: 'empty' }), 20, 20);

    reparentObject(target, second, null, 0);

    assert.deepEqual(target.roots().map(object => object.id), [second.id, first.id]);
    assert.equal(second.x, 20);
});

test('an object with no Transform is reparented without a geometry pass', () => {
    const target = scene();
    const parent = createObject(target, { kind: 'empty' });
    const bare = target.add(new Object('Bare'));

    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));
    const result = reparentObject(target, bare, parent);

    assert.equal(result.applied, true);
    assert.deepEqual(operations.map(operation => operation.type), ['REPARENT']);
});

test('reparenting under a collapsed parent is reported, not thrown', () => {
    const target = scene();
    const collapsed = place(target, createObject(target, { kind: 'empty' }), 0, 0,
        { scaleX: 0, scaleY: 0 });
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const reports = [];
    const result = reparentObject(target, child, collapsed, undefined, {
        onReport: report => reports.push(report)
    });

    assert.equal(result.applied, true);
    assert.equal(result.sheared, true);
    assert.equal(reports.length, 1);
});

test('reparenting something the scene does not hold does nothing', () => {
    const target = scene();
    const parent = createObject(target, { kind: 'empty' });

    assert.deepEqual(reparentObject(target, new Object('Outside'), parent),
        { applied: false, batch: null, sheared: false });
    assert.deepEqual(reparentObject(target, null, parent),
        { applied: false, batch: null, sheared: false });
});

test('the Transform of a reparented object still holds LOCAL values only', () => {
    // ADR-0002 is untouched by this policy: nothing world-space is stored, and the world
    // stays derived.
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 0);
    const child = place(target, createObject(target, { kind: 'empty' }), 30, 0);
    reparentObject(target, child, parent);

    assert.deepEqual(globalThis.Object.keys(child.getComponent('Transform')),
        ['x', 'y', 'rotationX', 'rotationY', 'scaleX', 'scaleY']);
    assert.equal(child.x, -70);
    assert.equal(worldPosition(child).x, 30);
});

test('undoing a drop puts the object back where it was, at its rank', () => {
    // The gesture the Hierarchy performs, undone the way Ctrl Z performs it: one entry,
    // inverted in reverse order, submitted rather than applied (ADR-0024).
    const target = scene();
    const first = place(target, createObject(target, { kind: 'empty' }), 0, 0);
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50);
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const history = new History(target.operations);
    const before = worldPosition(child);

    reparentObject(target, child, parent);
    assert.equal(child.parent, parent);
    assert.equal(history.depth, 1, 'a batch is one entry');

    assert.equal(history.undo(), true);

    assert.equal(child.parent, null);
    assert.deepEqual(target.roots(), [first, parent, child]);
    const after = worldPosition(child);
    assert.ok(Math.abs(after.x - before.x) < 1e-9);
    assert.ok(Math.abs(after.y - before.y) < 1e-9);
});

test('a listener rebuilding on a structural event sees the object after an undo', () => {
    // What the Hierarchy does: rebuild from `scene.roots()` on every structural event. The
    // tree it draws must hold the object, whichever half of the move woke it.
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 100, 50);
    const child = place(target, createObject(target, { kind: 'empty' }), 10, 10);

    const history = new History(target.operations);
    reparentObject(target, child, parent);

    const trees = [];
    const rebuild = () => {
        const walk = object => [object, ...object.children.flatMap(walk)];
        trees.push(target.roots().flatMap(walk).length);
    };
    for (const event of ['child:added', 'child:removed', 'roots:reordered']) target.on(event, rebuild);

    history.undo();

    assert.ok(trees.length > 0);
    for (const count of trees) assert.equal(count, 2, 'no rebuild ever lost the object');
});

// --- the second half of the rotation pair (ADR-0051) --------------------------------------

test('a reparent holds an object turned about Y, instead of halving it every time', () => {
    // `localMatrix()` composes the horizontal scale as `scaleX · cos(rotationY)`, so what
    // `decompose()` reports is that PRODUCT. Writing it back into `scaleX` while leaving
    // `rotationY` alone applied the cosine a second time: an object turned 60° about Y lost
    // half its width on every reparent — a plain reorder among siblings included — and said
    // nothing, because `sheared` was false and no report was made.
    const world = scene();
    const parent = createObject(world, { kind: 'empty', x: 0, y: 0 });
    const object = createObject(world, { kind: 'rectangle', x: 10, y: 20 });

    const transform = object.getComponent('Transform');
    transform.rotationY = Math.PI / 3;

    const before = worldMatrix(object);
    const first = reparentObject(world, object, parent, 0);

    assert.equal(first.sheared, false);
    assert.equal(transform.rotationY, Math.PI / 3, 'the authored turn is kept, not folded away');
    assert.equal(round(worldMatrix(object).a), round(before.a), 'and the world is what it was');

    reparentObject(world, object, null, 0);
    assert.equal(round(worldMatrix(object).a), round(before.a), 'twice over, so nothing compounds');
});

test('an object turned a quarter turn about Y keeps a placement a model can hold', () => {
    // The nearest thing to edge on a double can express: `Math.cos(Math.PI / 2)` is 6.1e-17,
    // not zero, so the division is well conditioned — the local scale carries the same tiny
    // factor and the two cancel. What must never happen is a non-finite value reaching the
    // model, which is what the guard above answers for.
    const world = scene();
    const parent = createObject(world, { kind: 'empty', x: 5, y: 5 });
    const object = createObject(world, { kind: 'rectangle', x: 10, y: 20 });
    const transform = object.getComponent('Transform');
    transform.rotationY = Math.PI / 2;

    const result = reparentObject(world, object, parent, 0);

    assert.equal(result.applied, true);
    assert.equal(globalThis.Number.isFinite(transform.scaleX), true, 'never an Infinity');
    assert.equal(round(transform.scaleX), 1, 'and the authored scale is what comes back');
    assert.equal(transform.rotationY, Math.PI / 2, 'with the turn left alone');
});

test('a reparent leaves the numbers a turned object was given', () => {
    // `decompose()` reports an UNSIGNED horizontal scale, so an object whose horizontal
    // factor is negative — turned past 90° about Y — decomposes into the OTHER of the two
    // readings of its matrix. Writing that one back mirrored `scaleX` and moved `rotationX`
    // by half a turn. Under a parent placed at the origin the local values ARE the world
    // ones, so what comes back has to be exactly what went in.
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 5, 5);
    const turned = place(target, createObject(target, { kind: 'empty' }), 10, 20,
        { rotation: 0.3, scaleX: 2, scaleY: 1.5 });
    turned.getComponent('Transform').rotationY = Math.PI;

    const before = worldMatrix(turned);
    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));
    const result = reparentObject(target, turned, parent);

    assert.equal(result.applied, true);
    assert.equal(result.sheared, false);
    assert.equal(turned.parent, parent, 'it did move');
    assert.ok(operations.some(operation => operation.type === 'SET_PROPERTY' && operation.prop === 'x'),
        'and the geometry pass ran, which is what this test is about');

    const transform = turned.getComponent('Transform');
    assert.equal(round(transform.x), 5, 'placed under the parent');
    assert.equal(round(transform.y), 15);
    assert.equal(round(transform.scaleX), 2, 'the authored scale, sign and all');
    assert.equal(round(transform.scaleY), 1.5);
    assert.equal(round(transform.rotationX), 0.3, 'and no half turn added to the rotation');
    assert.ok(worldMatrix(turned).equals(before, 1e-9), 'with the world held, as ever');
});

test('a mirrored object keeps its mirror', () => {
    // The same defect without any `rotationY`: a negative `scaleX` is a flip, it is folded
    // into the rotation `decompose()` reports, and writing that back turned every flipped
    // sprite the right way round and spun it half a turn instead.
    const target = scene();
    const parent = place(target, createObject(target, { kind: 'empty' }), 0, 0);
    const flipped = place(target, createObject(target, { kind: 'empty' }), 10, 20,
        { rotation: 0.3, scaleX: -1.5, scaleY: 1 });

    const before = worldMatrix(flipped);
    reparentObject(target, flipped, parent);

    const transform = flipped.getComponent('Transform');
    assert.equal(round(transform.scaleX), -1.5, 'still facing the way it was drawn');
    assert.equal(round(transform.scaleY), 1);
    assert.equal(round(transform.rotationX), 0.3);
    assert.ok(worldMatrix(flipped).equals(before, 1e-9));
    assert.equal(flipped.parent, parent);
});

test('a reorder among siblings writes the rank and nothing else', () => {
    // NO GEOMETRY PASS FOR A REORDER. Under the same parent the local matrix is the world it
    // always was, and re-deriving it is where an object with a collapsed axis came back half a
    // turn round with its `scaleY` flipped: a zero column carries no rotation, so `decompose()`
    // has two readings of that matrix and picked the one nobody authored.
    const target = scene();
    const first = place(target, createObject(target, { kind: 'empty' }), 0, 0);
    const flat = place(target, createObject(target, { kind: 'empty' }), 10, 20,
        { rotation: 0.3, scaleX: 0, scaleY: -1 });

    const operations = [];
    target.operations.on('operation', operation => operations.push(operation));
    const result = reparentObject(target, flat, null, 0);

    assert.equal(result.applied, true);
    assert.deepEqual(target.roots(), [flat, first]);
    assert.deepEqual(operations.map(operation => operation.type), ['REPARENT'], 'one operation, the rank');

    const transform = flat.getComponent('Transform');
    assert.deepEqual(
        [transform.rotationX, transform.scaleX, transform.scaleY],
        [0.3, 0, -1],
        'exactly the numbers it was given'
    );
});

function round(value) {
    return globalThis.Math.round(value * 1e6) / 1e6;
}
