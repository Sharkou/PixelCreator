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

test('a transform holds where an object is, how big it is, and how it is turned', () => {
    const transform = new Transform();

    assert.deepEqual(globalThis.Object.keys(transform),
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'rotationX', 'rotationY']);
    assert.equal(transform.x, 0);
    assert.equal(transform.y, 0);
    assert.equal(transform.rotation, 0);
    assert.equal(transform.scaleX, 1);
    assert.equal(transform.scaleY, 1);
    // TURNING OUT OF THE PLANE IS ITS OWN QUESTION (ADR-0050): `rotation` turns an object IN
    // the plane, these two turn it OUT of it.
    assert.equal(transform.rotationX, 0);
    assert.equal(transform.rotationY, 0);
});

test('there is no such thing as a flip', () => {
    // FLIP WAS A BOOLEAN WHERE THE MODEL NEEDED A NUMBER (ADR-0050). It could only say
    // "front" or "back"; what a card caught mid-turn needs is 45.
    const transform = new Transform();

    assert.equal(transform.flipX, undefined);
    assert.equal(transform.flipY, undefined);
    assert.equal('flipX' in Transform.schema, false);
    assert.equal('flipY' in Transform.schema, false);
    assert.equal(Transform.exposes.includes('flipX'), false);
    assert.equal(Transform.exposes.includes('flipY'), false);
});

test('size is not a transform concern', () => {
    // Width and height describe what is drawn or collided with, not where the object is.
    const transform = new Transform();

    assert.equal(transform.width, undefined);
    assert.equal(transform.height, undefined);
});

test('the facade exposes every placement property, both turns included', () => {
    assert.deepEqual(Transform.exposes,
        ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'rotationX', 'rotationY']);
});

test('a turn out of the plane is a number, in degrees', () => {
    const fields = Transform.schema;

    assert.equal(fields.rotationX.type, 'number');
    assert.equal(fields.rotationY.type, 'number');
    assert.equal(fields.rotationX.default, 0);
    assert.equal(fields.rotationY.default, 0);
    // DEGREES, STORED AS TYPED. The unit is declared for the suffix alone — nothing converts,
    // unlike `rotation`, which is kept in radians because it always was.
    assert.equal(fields.rotationX.unit, '\u00b0');
    assert.equal(fields.rotationY.unit, '\u00b0');
    assert.equal(fields.rotation.unit, 'rad', 'and the in-plane rotation is untouched');
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
        { x: 10, y: 5, rotation: 0, scaleX: 1, scaleY: 1, rotationX: 0, rotationY: 0 });
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

test('a turn foreshortens the perpendicular axis, by the cosine of the angle', () => {
    // THE WHOLE MODEL, IN FOUR ANGLES (ADR-0050). Under the orthographic projection this
    // renderer already uses, a turn of θ about an axis leaves the perpendicular one
    // measuring cos θ of what it did. 45° is a card caught mid-turn; 90° is its edge; 180°
    // is its back — and THAT is why the back looks mirrored, not because anybody wrote a
    // mirror.
    const turned = (rotationX, rotationY) => {
        const object = new Object('Card');
        object.addComponent(new Transform(0, 0, 0, 1, 1, rotationX, rotationY));
        return localMatrix(object);
    };
    const near = (value, expected, what) =>
        assert.ok(Math.abs(value - expected) < 1e-9, `${what}: ${value} is not ${expected}`);

    near(turned(0, 0).d, 1, 'at rest');
    near(turned(45, 0).d, Math.SQRT1_2, 'mid-turn');
    near(turned(90, 0).d, 0, 'edge on');
    near(turned(180, 0).d, -1, 'showing its back');

    // Y turns the other way round, and touches the horizontal axis instead.
    near(turned(0, 45).a, Math.SQRT1_2, 'mid-turn');
    near(turned(0, 90).a, 0, 'edge on');
    near(turned(0, 180).a, -1, 'showing its back');

    // AN AXIS YOU TURN ABOUT KEEPS ITS LENGTH, which is what makes the pairing look like a
    // transposition and stops it being one.
    near(turned(90, 0).a, 1, 'turning about X leaves the horizontal axis alone');
    near(turned(0, 90).d, 1, 'turning about Y leaves the vertical axis alone');
});

test('a turn scales what the creator scaled, rather than replacing it', () => {
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, 0, 2, 3));
    const transform = object.getComponent('Transform');

    transform.rotationX = 180;
    assert.ok(Math.abs(localMatrix(object).d + 3) < 1e-9, 'the turn multiplies the scale');
    assert.equal(transform.scaleY, 3, 'and the scale a creator typed is still the one they typed');

    transform.rotationY = 60;
    assert.ok(Math.abs(localMatrix(object).a - 1) < 1e-9, '2 x cos 60 is 1');
    assert.equal(transform.scaleX, 2);
});

test('the in-plane rotation is untouched by either turn', () => {
    // NO REGRESSION ON `rotation`: it still composes as it always did, and the two turns
    // multiply the scale terms the composition already carries.
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, Math.PI / 2));

    const spun = localMatrix(object);
    assert.ok(Math.abs(spun.a) < 1e-9, 'cos 90deg');
    assert.ok(Math.abs(spun.b - 1) < 1e-9, 'sin 90deg');

    object.getComponent('Transform').rotationX = 180;
    const both = localMatrix(object);
    assert.ok(Math.abs(both.b - 1) < 1e-9, 'the in-plane rotation still reads the same');
    assert.ok(Math.abs(both.c - 1) < 1e-9, 'and the turn has flipped the other column');
});

test('a turn composes down the hierarchy like every other placement value', () => {
    // Nothing downstream learns a new word: it is composed in `localMatrix()`, so rendering,
    // picking and the camera all read it through `worldMatrix()` as they always did.
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(0, 0, 0, 1, 1, 0, 180));
    child.addComponent(new Transform(10, 0));
    parent.addChild(child);

    assert.ok(Math.abs(worldPosition(child).x + 10) < 1e-9, 'the child turns with its parent');
});

test('a turn is a number, so it round-trips through serialization', () => {
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, 0, 1, 1, 45, 30));

    const data = serializeComponent(object.getComponent('Transform'));
    assert.equal(data.rotationX, 45);
    assert.equal(data.rotationY, 30);
    assert.equal(data.flipX, undefined);
    assert.equal(data.flipY, undefined);
});
