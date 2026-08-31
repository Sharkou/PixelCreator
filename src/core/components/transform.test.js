// Transform holds local values and nothing else.
//
// These tests lock the decision that the world transform is derived, never stored:
// parenting must leave an object's own values untouched, and no world value may appear
// on the object, in the facade, or in the serialized form.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object } from '../object.js';
import { Transform, localMatrix, worldPosition } from './transform.js';
import { serializeObject, serializeComponent } from '../serialize.js';

test('a transform holds where an object is, how big it is, and which way it faces', () => {
    const transform = new Transform();

    assert.deepEqual(globalThis.Object.keys(transform),
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'flipX', 'flipY']);
    assert.equal(transform.x, 0);
    assert.equal(transform.y, 0);
    assert.equal(transform.rotation, 0);
    assert.equal(transform.scaleX, 1);
    assert.equal(transform.scaleY, 1);
    // FACING IS ITS OWN QUESTION (ADR-0047 §3). A 2D character that turns around is
    // mirrored, not rotated, and the engine stays strictly 2D.
    assert.equal(transform.flipX, false);
    assert.equal(transform.flipY, false);
});

test('size is not a transform concern', () => {
    // Width and height describe what is drawn or collided with, not where the object is.
    const transform = new Transform();

    assert.equal(transform.width, undefined);
    assert.equal(transform.height, undefined);
});

test('the facade exposes every placement property, facing included', () => {
    assert.deepEqual(Transform.exposes,
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'flipX', 'flipY']);
});

test('the whole placement is reachable from the object', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20, 1.5, 2, 3));

    assert.equal(object.x, 10);
    assert.equal(object.y, 20);
    assert.equal(object.rotation, 1.5);
    assert.equal(object.scaleX, 2);
    assert.equal(object.scaleY, 3);
});

test('every facade property writes through to the component', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());

    object.x = 1;
    object.y = 2;
    object.rotation = 3;
    object.scaleX = 4;
    object.scaleY = 5;

    assert.deepEqual(
        [transform.x, transform.y, transform.rotation, transform.scaleX, transform.scaleY],
        [1, 2, 3, 4, 5]
    );
    assert.deepEqual(globalThis.Object.keys(object), [
        'id', 'name', 'tag', 'layer', 'active', 'lock', 'owner'
    ], 'the facade stored nothing of its own');
});

test('parenting does not touch the stored values', () => {
    // Legacy pushed a delta into every child on each parent move, so a child's stored
    // position silently depended on its parent's history. v2 keeps values local: the
    // world position is composed when the engine needs it, and never written back.
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(100, 100));
    child.addComponent(new Transform(10, 5));

    parent.addChild(child);

    assert.equal(child.x, 10, 'the child keeps its own local position');
    assert.equal(child.y, 5);
});

test('moving a parent does not rewrite its children', () => {
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(0, 0));
    child.addComponent(new Transform(10, 5));
    parent.addChild(child);

    parent.x = 100;
    parent.rotation = 1.5;
    parent.scaleX = 2;

    assert.equal(child.x, 10, 'still local, still untouched');
    assert.equal(child.y, 5);
    assert.equal(child.rotation, 0);
    assert.equal(child.scaleX, 1);
});

test('no world value is stored or exposed', () => {
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(100, 100));
    child.addComponent(new Transform(10, 5));
    parent.addChild(child);

    assert.equal(child.worldX, undefined, 'no second position to keep in sync');
    assert.equal(child.worldY, undefined);
    assert.equal(child.localX, undefined, 'and no local/world pair to disambiguate');
    assert.equal(child.getComponent('Transform').worldX, undefined);
});

test('a serialized transform carries only local values', () => {
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(100, 100));
    child.addComponent(new Transform(10, 5));
    parent.addChild(child);

    const data = serializeComponent(child.getComponent('Transform'));

    assert.deepEqual(data,
        { x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1, flipX: false, flipY: false });
    assert.equal(JSON.stringify(serializeObject(child)).includes('world'), false);
});

test('one source of truth, whichever path writes it', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());

    object.x = 1;
    assert.equal(transform.x, 1);

    transform.x = 2;
    assert.equal(object.x, 2);

    object.setProperty('x', 3);
    assert.equal(transform.x, 3);

    transform.setProperty('x', 4);
    assert.equal(object.x, 4);

    assert.equal(serializeComponent(transform).x, 4);
});

test('a flip mirrors the object without touching its scale', () => {
    // TWO QUESTIONS, TWO VALUES (ADR-0047 §3). Reusing the sign of `scaleX` would make one
    // number answer "how big" and "which way round" at once, so a creator who scaled to 2
    // and then flipped would have to type -2 and remember why.
    const object = new Object('Player');
    object.addComponent(new Transform(0, 0, 0, 2, 3));
    const transform = object.getComponent('Transform');

    assert.equal(localMatrix(object).a, 2, 'unflipped, the matrix carries the scale');

    transform.flipX = true;
    assert.equal(localMatrix(object).a, -2, 'flipped, it carries the mirror as well');
    assert.equal(transform.scaleX, 2, 'and the scale a creator typed is still the one they typed');

    transform.flipY = true;
    assert.equal(localMatrix(object).d, -3);
    assert.equal(transform.scaleY, 3);
});

test('a flip composes down the hierarchy like every other placement value', () => {
    // Nothing downstream learns a new word: the mirror is composed in `localMatrix()`, so
    // rendering, picking and physics all read it through `worldMatrix()` as they always did.
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(0, 0, 0, 1, 1, true, false));
    child.addComponent(new Transform(10, 0));
    parent.addChild(child);

    assert.equal(worldPosition(child).x, -10, 'the child is mirrored with its parent');
});

test('a flip is a boolean, so it round-trips through serialization', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(0, 0, 0, 1, 1, true, true));

    const data = serializeComponent(object.getComponent('Transform'));
    assert.equal(data.flipX, true);
    assert.equal(data.flipY, true);
});
