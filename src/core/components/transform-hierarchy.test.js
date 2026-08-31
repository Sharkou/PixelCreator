// World transform composition.
//
// The invariant under test throughout: local values are never touched by a parent.
// The world transform is derived on read and stored nowhere.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object } from '../object.js';
import { Transform, worldMatrix, worldPosition, localMatrix } from './transform.js';

const QUARTER_TURN = Math.PI / 2;

function object(name, transform) {
    const created = new Object(name);
    if (transform) created.addComponent(transform);
    return created;
}

function assertPosition(actual, expected, message) {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9,
        `${message ?? 'position'}: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`);
}

test('an object without a parent has its local transform as world transform', () => {
    const solo = object('Solo', new Transform(10, 20, 0.5, 2, 3));

    assert.ok(worldMatrix(solo).equals(localMatrix(solo)));
    assertPosition(worldPosition(solo), { x: 10, y: 20 });
});

test('an object without a Transform is at the origin', () => {
    const bare = object('Bare');

    assert.ok(worldMatrix(bare).equals(localMatrix(bare)));
    assertPosition(worldPosition(bare), { x: 0, y: 0 });
});

test('a parent translation offsets the child', () => {
    const parent = object('Parent', new Transform(100, 50));
    const child = object('Child', new Transform(10, 5));
    parent.addChild(child);

    assertPosition(worldPosition(child), { x: 110, y: 55 });
    assert.equal(child.x, 10, 'the local value is untouched');
    assert.equal(child.y, 5);
});

test('a parent rotation orbits the child', () => {
    const parent = object('Parent', new Transform(0, 0, QUARTER_TURN));
    const child = object('Child', new Transform(10, 0));
    parent.addChild(child);

    // A quarter turn moves a child that sits to the right onto the axis below.
    assertPosition(worldPosition(child), { x: 0, y: 10 });
    assert.equal(child.x, 10, 'the local value is untouched');
    assert.equal(child.rotation, 0, 'and so is the local rotation');
});

test('a parent rotation also rotates the child frame', () => {
    const parent = object('Parent', new Transform(0, 0, QUARTER_TURN));
    const child = object('Child', new Transform(0, 0));
    parent.addChild(child);

    // A point to the right of the child ends up below it.
    assertPosition(worldMatrix(child).apply(1, 0), { x: 0, y: 1 });
});

test('a parent scale multiplies the child offset', () => {
    const parent = object('Parent', new Transform(0, 0, 0, 3, 2));
    const child = object('Child', new Transform(10, 10));
    parent.addChild(child);

    assertPosition(worldPosition(child), { x: 30, y: 20 });
    assert.equal(child.scaleX, 1, 'the local scale is untouched');
});

test('a parent scale also scales the child geometry', () => {
    const parent = object('Parent', new Transform(0, 0, 0, 3, 2));
    const child = object('Child', new Transform(0, 0));
    parent.addChild(child);

    assertPosition(worldMatrix(child).apply(1, 1), { x: 3, y: 2 });
});

test('translation, rotation and scale combine', () => {
    const parent = object('Parent', new Transform(100, 100, QUARTER_TURN, 2, 2));
    const child = object('Child', new Transform(10, 0));
    parent.addChild(child);

    // Scaled to 20 along the parent's x, then a quarter turn puts it on +y, then the
    // parent's own translation moves the result.
    assertPosition(worldPosition(child), { x: 100, y: 120 });
});

test('several levels of parenting compose', () => {
    const grandparent = object('Grandparent', new Transform(100, 0));
    const parent = object('Parent', new Transform(10, 0));
    const child = object('Child', new Transform(1, 0));
    grandparent.addChild(parent);
    parent.addChild(child);

    assertPosition(worldPosition(child), { x: 111, y: 0 });
    assertPosition(worldPosition(parent), { x: 110, y: 0 });
    assertPosition(worldPosition(grandparent), { x: 100, y: 0 });
});

test('several levels combine rotation and scale', () => {
    const grandparent = object('Grandparent', new Transform(0, 0, 0, 2, 2));
    const parent = object('Parent', new Transform(0, 0, QUARTER_TURN));
    const child = object('Child', new Transform(5, 0));
    grandparent.addChild(parent);
    parent.addChild(child);

    // The quarter turn puts the child on +y at 5, then the grandparent doubles it.
    assertPosition(worldPosition(child), { x: 0, y: 10 });
});

test('moving a parent after the child was attached moves the child', () => {
    const parent = object('Parent', new Transform(0, 0));
    const child = object('Child', new Transform(10, 0));
    parent.addChild(child);

    assertPosition(worldPosition(child), { x: 10, y: 0 });

    parent.x = 100;
    parent.y = 50;

    assertPosition(worldPosition(child), { x: 110, y: 50 }, 'derived on read, so it follows');
    assert.equal(child.x, 10, 'without rewriting the child');
    assert.equal(child.y, 0);
});

test('rotating a parent after the fact orbits the child', () => {
    const parent = object('Parent', new Transform(0, 0));
    const child = object('Child', new Transform(10, 0));
    parent.addChild(child);

    parent.rotation = QUARTER_TURN;

    assertPosition(worldPosition(child), { x: 0, y: 10 });
    assert.equal(child.x, 10);
    assert.equal(child.rotation, 0);
});

test('detaching a child returns it to its local placement', () => {
    const parent = object('Parent', new Transform(100, 100));
    const child = object('Child', new Transform(10, 5));
    parent.addChild(child);
    assertPosition(worldPosition(child), { x: 110, y: 105 });

    parent.removeChild(child);

    assertPosition(worldPosition(child), { x: 10, y: 5 });
    assert.equal(child.x, 10, 'which never changed');
});

test('re-parenting keeps the local values and changes only the derived result', () => {
    const first = object('First', new Transform(100, 0));
    const second = object('Second', new Transform(0, 100));
    const child = object('Child', new Transform(10, 10));

    first.addChild(child);
    assertPosition(worldPosition(child), { x: 110, y: 10 });

    second.addChild(child);
    assertPosition(worldPosition(child), { x: 10, y: 110 });
    assert.equal(child.x, 10);
    assert.equal(child.y, 10);
});

test('a parent without a Transform contributes nothing', () => {
    const parent = object('Parent');
    const child = object('Child', new Transform(10, 5));
    parent.addChild(child);

    assertPosition(worldPosition(child), { x: 10, y: 5 });
});

test('a deep chain of moves never rewrites a stored value', () => {
    // The Legacy failure this replaces: each parent move pushed a delta into every
    // child, so a child's stored position depended on its parent's history.
    const root = object('Root', new Transform(0, 0));
    const middle = object('Middle', new Transform(5, 5));
    const leaf = object('Leaf', new Transform(1, 1));
    root.addChild(middle);
    middle.addChild(leaf);

    for (let i = 0; i < 100; i++) {
        root.x += 1;
        root.y -= 1;
    }

    assert.deepEqual(
        [middle.x, middle.y, leaf.x, leaf.y],
        [5, 5, 1, 1],
        'a hundred parent moves left every descendant value exactly as authored'
    );
    assertPosition(worldPosition(leaf), { x: 106, y: -94 });
});

test('the world transform is not stored anywhere', () => {
    const parent = object('Parent', new Transform(100, 100));
    const child = object('Child', new Transform(10, 5));
    parent.addChild(child);

    worldMatrix(child);

    assert.equal(child.worldX, undefined);
    assert.equal(child.getComponent('Transform').worldX, undefined);
    assert.deepEqual(globalThis.Object.keys(child.getComponent('Transform')),
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'flipX', 'flipY']);
});
