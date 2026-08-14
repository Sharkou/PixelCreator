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
    worldPosition
} from '../core/mod.js';
import { registerBuiltIns } from './registry.js';
import { createObject, reparentObject } from './commands.js';

function scene() {
    return new Scene('Main', { registry: registerBuiltIns(new ComponentRegistry()) });
}

function place(target, object, x, y, { rotation = 0, scaleX = 1, scaleY = 1 } = {}) {
    const transform = object.getComponent('Transform');
    transform.x = x;
    transform.y = y;
    transform.rotation = rotation;
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
    assert.deepEqual(operations.slice(1).map(operation => operation.prop),
        ['x', 'y', 'rotation', 'scaleX', 'scaleY']);
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
        ['x', 'y', 'rotation', 'scaleX', 'scaleY']);
    assert.equal(child.x, -70);
    assert.equal(worldPosition(child).x, 30);
});
