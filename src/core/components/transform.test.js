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
import { ComponentRegistry, instantiateComponent } from '../component.js';

test('a transform holds where an object is, how big it is, and how it is turned', () => {
    const transform = new Transform();

    assert.deepEqual(globalThis.Object.keys(transform),
        ['x', 'y', 'rotationX', 'rotationY', 'scaleX', 'scaleY']);
    assert.equal(transform.x, 0);
    assert.equal(transform.y, 0);
    assert.equal(transform.rotationX, 0);
    assert.equal(transform.scaleX, 1);
    assert.equal(transform.scaleY, 1);
    // TURNING OUT OF THE PLANE IS ITS OWN QUESTION (ADR-0050): `rotation` turns an object IN
    // the plane, these two turn it OUT of it.
    assert.equal(transform.rotationX, 0);
    assert.equal(transform.rotationY, 0);
});

test('there is no such thing as a flip, and no independent Rotation X or Y', () => {
    // FLIP WAS A BOOLEAN WHERE THE MODEL NEEDED A NUMBER (ADR-0050). It could only say
    // "front" or "back"; what a card caught mid-turn needs is 45.
    const transform = new Transform();

    assert.equal(transform.flipX, undefined);
    assert.equal(transform.flipY, undefined);
    assert.equal('flipX' in Transform.schema, false);
    assert.equal('flipY' in Transform.schema, false);
    assert.equal(Transform.exposes.includes('flipX'), false);
    assert.equal(Transform.exposes.includes('flipY'), false);

    // AND THE PAIR IS ONE PROPERTY, not two that happen to be named alike: the Inspector
    // draws them on one row because they are declared as a pair (ADR-0051 §2).
    assert.deepEqual(Transform.exposes, ['x', 'y', 'rotationX', 'rotationY', 'scaleX', 'scaleY']);
});

test('size is not a transform concern', () => {
    // Width and height describe what is drawn or collided with, not where the object is.
    const transform = new Transform();

    assert.equal(transform.width, undefined);
    assert.equal(transform.height, undefined);
});

test('the facade exposes every placement property, both turns included', () => {
    assert.deepEqual(Transform.exposes,
        ['x', 'y', 'rotationX', 'rotationY', 'scaleX', 'scaleY']);
});

test('rotation is a pair, and both halves are numbers in the same unit', () => {
    const fields = Transform.schema;

    assert.equal(fields.rotationX.type, 'number');
    assert.equal(fields.rotationY.type, 'number');
    assert.equal(fields.rotationX.default, 0);
    assert.equal(fields.rotationY.default, 0);
    // ONE UNIT FOR ONE PROPERTY (ADR-0051): the first half always was radians and migrating
    // it would rewrite every scene, so the second joins it. The Inspector converts both to
    // degrees through the same entry.
    assert.equal(fields.rotationX.unit, 'rad');
    assert.equal(fields.rotationY.unit, 'rad');

    // AND THE SCALAR IS GONE, not kept alongside as a third way to say the same thing.
    assert.equal('rotation' in fields, false);
    assert.equal(new Transform().rotation, undefined);
});

test('a Transform saved before rotation was a pair still reads', () => {
    // `reconcileValues()` DROPS WHAT THE SCHEMA DOES NOT DECLARE, which is what lets a
    // definition change without a migration — and what would silently discard a rename
    // (ADR-0051 §3). An old scene must open with its objects still rotated.
    const migrated = Transform.migrate({ x: 5, y: 6, rotation: 1.5, scaleX: 2 });

    assert.equal(migrated.rotationX, 1.5, 'the value meant the in-plane rotation, and still does');
    assert.equal(migrated.rotation, undefined, 'and the old name does not survive beside it');
    assert.equal(migrated.x, 5, 'everything else is untouched');
    assert.equal(migrated.scaleX, 2);

    // Applied through the ordinary path, not by a caller that knows about Transform.
    const registry = new ComponentRegistry();
    registry.register(Transform);
    const rebuilt = instantiateComponent(registry, 'Transform', { rotation: 1.5 });
    assert.equal(rebuilt.rotationX, 1.5);
    assert.equal(rebuilt.rotationY, 0, 'and the half that did not exist starts at rest');

    // Values already written against the new schema are left alone.
    assert.deepEqual(Transform.migrate({ rotationX: 2, rotation: 9 }), { rotationX: 2 });
    assert.deepEqual(Transform.migrate({ rotationX: 2 }), { rotationX: 2 });
});

test('the whole placement is reachable from the object', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20, 1.5, 2, 3));

    assert.equal(object.x, 10);
    assert.equal(object.y, 20);
    assert.equal(object.rotationX, 1.5);
    assert.equal(object.scaleX, 2);
    assert.equal(object.scaleY, 3);
});

test('every facade property writes through to the component', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());

    object.x = 1;
    object.y = 2;
    object.rotationX = 3;
    object.scaleX = 4;
    object.scaleY = 5;

    assert.deepEqual(
        [transform.x, transform.y, transform.rotationX, transform.scaleX, transform.scaleY],
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
    parent.rotationX = 1.5;
    parent.scaleX = 2;

    assert.equal(child.x, 10, 'still local, still untouched');
    assert.equal(child.y, 5);
    assert.equal(child.rotationX, 0);
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
        { x: 10, y: 5, rotationX: 0, rotationY: 0, scaleX: 1, scaleY: 1 });
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

const DEGREES = Math.PI / 180;

test('Rotation X is the rotation that always existed', () => {
    // NO REGRESSION: the in-plane rotation composes exactly as the old scalar did — the same
    // cos/sin in the same matrix terms. Only its name moved (ADR-0051 §1).
    const object = new Object('Hand');
    object.addComponent(new Transform(0, 0, 90 * DEGREES));
    const matrix = localMatrix(object);

    assert.ok(Math.abs(matrix.a) < 1e-9, 'cos 90deg');
    assert.ok(Math.abs(matrix.b - 1) < 1e-9, 'sin 90deg');
    assert.ok(Math.abs(matrix.c + 1) < 1e-9);
    assert.ok(Math.abs(matrix.d) < 1e-9);
});

test('Rotation Y foreshortens the sprite horizontally, by the cosine of the angle', () => {
    // THE WHOLE MODEL, IN FOUR ANGLES. Under the orthographic projection this renderer
    // already uses, turning by φ about the vertical axis leaves the horizontal axis
    // measuring cos φ. 45° is a sprite caught mid-turn; 90° is its edge; 180° is its back —
    // and THAT is why the back reads as a mirror, not because anybody wrote a mirror.
    const turned = degrees => {
        const object = new Object('Card');
        object.addComponent(new Transform(0, 0, 0, 1, 1, degrees * DEGREES));
        return localMatrix(object);
    };
    const near = (value, expected, what) =>
        assert.ok(Math.abs(value - expected) < 1e-9, `${what}: ${value} is not ${expected}`);

    near(turned(0).a, 1, 'at rest');
    near(turned(45).a, Math.SQRT1_2, 'mid-turn');
    near(turned(90).a, 0, 'edge on');
    near(turned(180).a, -1, 'showing its back');
    near(turned(360).a, 1, 'all the way round');

    // THE VERTICAL AXIS IS THE ONE IT TURNS ABOUT, so that axis keeps its length.
    for (const degrees of [0, 45, 90, 180]) near(turned(degrees).d, 1, `vertical at ${degrees}`);
});

test('a turn scales what the creator scaled, rather than replacing it', () => {
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, 0, 2, 3));
    const transform = object.getComponent('Transform');

    transform.rotationY = 180 * DEGREES;
    assert.ok(Math.abs(localMatrix(object).a + 2) < 1e-9, 'the turn multiplies the scale');
    assert.equal(transform.scaleX, 2, 'and the scale a creator typed is still the one they typed');
    assert.equal(localMatrix(object).d, 3, 'the other axis is untouched');
});

test('the two halves compose, and neither cancels the other', () => {
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, 90 * DEGREES, 1, 1, 180 * DEGREES));
    const matrix = localMatrix(object);

    // Turned a quarter in the plane AND showing its back: the in-plane rotation still reads
    // in `b`, and the horizontal foreshortening has flipped its sign.
    assert.ok(Math.abs(matrix.b + 1) < 1e-9);
    assert.ok(Math.abs(matrix.c + 1) < 1e-9);
});

test('a turn composes down the hierarchy like every other placement value', () => {
    // Nothing downstream learns a new word: it is composed in `localMatrix()`, so rendering,
    // picking and the camera all read it through `worldMatrix()` as they always did.
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(0, 0, 0, 1, 1, 180 * DEGREES));
    child.addComponent(new Transform(10, 0));
    parent.addChild(child);

    assert.ok(Math.abs(worldPosition(child).x + 10) < 1e-9, 'the child turns with its parent');
});

test('both halves round-trip through serialization', () => {
    const object = new Object('Card');
    object.addComponent(new Transform(0, 0, 0.5, 1, 1, 1.25));

    const data = serializeComponent(object.getComponent('Transform'));
    assert.equal(data.rotationX, 0.5);
    assert.equal(data.rotationY, 1.25);
    assert.equal(data.rotation, undefined);
    assert.equal(data.flipX, undefined);
    assert.equal(data.flipY, undefined);
});
