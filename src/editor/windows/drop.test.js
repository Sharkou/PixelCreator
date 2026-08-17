// Where a dragged Hierarchy row lands (ADR-0018, ADR-0019).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene } from '../../core/mod.js';
import { DropPosition, canDrop, dropPositionAt, dropTarget, insertionIndex } from './drop.js';

/**
 * a, b, c at the top level; b holds b1 and b2.
 * @returns {object} The scene and its objects, by name
 */
function tree() {
    const scene = new Scene('Test');
    const a = scene.add(new Object('a'));
    const b = scene.add(new Object('b'));
    const c = scene.add(new Object('c'));
    const b1 = scene.add(new Object('b1'));
    const b2 = scene.add(new Object('b2'));
    b.addChild(b1);
    b.addChild(b2);
    return { scene, a, b, c, b1, b2 };
}

const rect = { top: 100, height: 30 };

// --- reading the pointer ---------------------------------------------------------------

test('the edges of a row mean between, the middle means into', () => {
    assert.equal(dropPositionAt(102, rect), DropPosition.BEFORE);
    assert.equal(dropPositionAt(115, rect), DropPosition.INTO);
    assert.equal(dropPositionAt(128, rect), DropPosition.AFTER);
});

test('a row that cannot nest is a before/after target over its whole height', () => {
    assert.equal(dropPositionAt(112, rect, { canNest: false }), DropPosition.BEFORE);
    assert.equal(dropPositionAt(120, rect, { canNest: false }), DropPosition.AFTER);
});

// --- the rank an ordered primitive wants -----------------------------------------------

test('a move down inside one collection loses the position the item vacated', () => {
    // The same rule for components as for children: the Core removes, then inserts.
    assert.equal(insertionIndex(0, 3), 2);
    assert.equal(insertionIndex(2, 0), 0, 'a move up shifts nothing');
    assert.equal(insertionIndex(-1, 2), 2, 'an item arriving from elsewhere vacates nothing');
});

// --- what is refused ---------------------------------------------------------------

test('an object cannot be dropped on itself or into its own subtree', () => {
    const { b, b1, c } = tree();

    assert.equal(canDrop(b, b), false);
    assert.equal(canDrop(b, b1), false, 'that would close a cycle');
    assert.equal(canDrop(b, c), true);
    assert.equal(canDrop(b, null), true, 'the empty area is the top level');
});

test('a refused drop resolves to null rather than to a nonsense rank', () => {
    const { scene, b, b1 } = tree();

    assert.equal(dropTarget(scene, b, b1, DropPosition.INTO), null);
    assert.equal(dropTarget(scene, b, b, DropPosition.BEFORE), null);
});

// --- nesting ---------------------------------------------------------------------------

test('dropping onto a row appends to that row\'s children', () => {
    const { scene, a, b } = tree();

    assert.deepEqual(dropTarget(scene, a, b, DropPosition.INTO), { parent: b, index: 2 });
});

test('dropping onto the empty area appends to the top level', () => {
    const { scene, b1 } = tree();

    assert.deepEqual(dropTarget(scene, b1, null, DropPosition.INTO), { parent: null, index: 3 });
});

// --- reordering ------------------------------------------------------------------------

test('dropping between two roots reorders the top level', () => {
    const { scene, c, a } = tree();

    // c before a: c leaves rank 2, so the rank it is going to does not shift.
    assert.deepEqual(dropTarget(scene, c, a, DropPosition.BEFORE), { parent: null, index: 0 });
});

test('moving down within one parent accounts for the row leaving the list first', () => {
    const { scene, a, c } = tree();

    // As displayed, "after c" is rank 3 — but a leaves rank 0 before it is inserted, so
    // the rank that lands a after c is 2. This is the adjustment the Core does not make.
    const drop = dropTarget(scene, a, c, DropPosition.AFTER);
    assert.deepEqual(drop, { parent: null, index: 2 });

    scene.reparent(a, drop.parent, drop.index);
    assert.deepEqual(scene.roots().map(object => object.name), ['b', 'c', 'a']);
});

test('moving up within one parent needs no adjustment', () => {
    const { scene, c, b } = tree();

    const drop = dropTarget(scene, c, b, DropPosition.BEFORE);
    assert.deepEqual(drop, { parent: null, index: 1 });

    scene.reparent(c, drop.parent, drop.index);
    assert.deepEqual(scene.roots().map(object => object.name), ['a', 'c', 'b']);
});

test('moving down among siblings inside a parent lands where it was dropped', () => {
    const { scene, b, b1, b2 } = tree();

    const drop = dropTarget(scene, b1, b2, DropPosition.AFTER);
    scene.reparent(b1, drop.parent, drop.index);

    assert.equal(drop.parent, b);
    assert.deepEqual(b.children.map(object => object.name), ['b2', 'b1']);
});

test('a drop out of a parent onto the top level keeps the rank it was dropped at', () => {
    const { scene, b1, a } = tree();

    const drop = dropTarget(scene, b1, a, DropPosition.AFTER);
    assert.deepEqual(drop, { parent: null, index: 1 });

    scene.reparent(b1, drop.parent, drop.index);
    assert.deepEqual(scene.roots().map(object => object.name), ['a', 'b1', 'b', 'c']);
});

test('a drop into another branch names that branch as the parent', () => {
    const { scene, a, b } = tree();

    const drop = dropTarget(scene, a, b, DropPosition.INTO);
    scene.reparent(a, drop.parent, drop.index);

    assert.equal(a.parent, b);
    assert.deepEqual(b.children.map(object => object.name), ['b1', 'b2', 'a']);
    assert.deepEqual(scene.roots().map(object => object.name), ['b', 'c']);
});
