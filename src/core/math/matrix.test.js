import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix } from './matrix.js';

const HALF_TURN = Math.PI;
const QUARTER_TURN = Math.PI / 2;

function assertPoint(actual, expected, message) {
    assert.ok(Math.abs(actual.x - expected.x) < 1e-9 && Math.abs(actual.y - expected.y) < 1e-9,
        `${message ?? 'point'}: expected (${expected.x}, ${expected.y}), got (${actual.x}, ${actual.y})`);
}

test('identity leaves a point alone', () => {
    assertPoint(Matrix.identity().apply(3, 4), { x: 3, y: 4 });
});

test('a matrix is immutable', () => {
    const matrix = Matrix.identity();
    assert.throws(() => { matrix.a = 5; }, TypeError);
});

test('compose translates', () => {
    assertPoint(Matrix.compose(10, 20).apply(0, 0), { x: 10, y: 20 });
    assertPoint(Matrix.compose(10, 20).apply(1, 2), { x: 11, y: 22 });
});

test('compose scales about the origin', () => {
    assertPoint(Matrix.compose(0, 0, 0, 2, 3).apply(1, 1), { x: 2, y: 3 });
    assertPoint(Matrix.compose(0, 0, 0, 2, 3).apply(0, 0), { x: 0, y: 0 }, 'origin is fixed');
});

test('compose rotates about the origin', () => {
    assertPoint(Matrix.compose(0, 0, QUARTER_TURN).apply(1, 0), { x: 0, y: 1 });
    assertPoint(Matrix.compose(0, 0, HALF_TURN).apply(1, 0), { x: -1, y: 0 });
});

test('scale applies before rotation, and both before translation', () => {
    // Any other order would make rotation displace the object or scaling stretch its
    // position instead of its shape.
    const matrix = Matrix.compose(100, 0, QUARTER_TURN, 2, 2);
    assertPoint(matrix.apply(1, 0), { x: 100, y: 2 });
});

test('multiply applies the right-hand matrix first', () => {
    const parent = Matrix.compose(10, 0);
    const local = Matrix.compose(5, 0);

    assertPoint(parent.multiply(local).apply(0, 0), { x: 15, y: 0 });
});

test('a parent rotation orbits the child', () => {
    const parent = Matrix.compose(0, 0, QUARTER_TURN);
    const local = Matrix.compose(10, 0);

    // Rotating the parent must move the child around it, not merely spin it in place.
    assertPoint(parent.multiply(local).apply(0, 0), { x: 0, y: 10 });
});

test('a parent scale multiplies the child offset', () => {
    const parent = Matrix.compose(0, 0, 0, 3, 3);
    const local = Matrix.compose(10, 5);

    assertPoint(parent.multiply(local).apply(0, 0), { x: 30, y: 15 });
});

test('composition is associative', () => {
    const a = Matrix.compose(5, 3, 0.4, 2, 1.5);
    const b = Matrix.compose(-2, 7, -1.1, 0.5, 3);
    const c = Matrix.compose(11, -4, 2.2, 1.25, 0.75);

    assert.ok(a.multiply(b).multiply(c).equals(a.multiply(b.multiply(c))));
});

test('identity is neutral on both sides', () => {
    const matrix = Matrix.compose(5, 3, 0.4, 2, 1.5);

    assert.ok(matrix.multiply(Matrix.identity()).equals(matrix));
    assert.ok(Matrix.identity().multiply(matrix).equals(matrix));
});

test('invert undoes a transform', () => {
    const matrix = Matrix.compose(12, -5, 0.9, 2, 3);
    const point = matrix.apply(7, -2);

    assertPoint(matrix.invert().apply(point.x, point.y), { x: 7, y: -2 });
});

test('a matrix times its inverse is identity', () => {
    const matrix = Matrix.compose(12, -5, 0.9, 2, 3);
    assert.ok(matrix.multiply(matrix.invert()).equals(Matrix.identity()));
});

test('a degenerate matrix cannot be inverted', () => {
    assert.throws(() => Matrix.compose(0, 0, 0, 0, 1).invert(), /not invertible/);
});

test('the rotation-free path matches the general one', () => {
    // compose() takes a shortcut when rotation is zero; it must agree with the maths.
    const fast = Matrix.compose(3, 4, 0, 2, 5);
    const general = Matrix.compose(3, 4, 1e-300, 2, 5);

    assert.ok(fast.equals(general, 1e-9));
});

// --- decompose (ADR-0022) -----------------------------------------------------------

test('decompose is the exact inverse of compose', () => {
    const cases = [
        [0, 0, 0, 1, 1],
        [10, -20, 0, 1, 1],
        [3, 4, Math.PI / 4, 2, 2],
        [0, 0, -1.2, 0.5, 3],
        [7, 8, 2.5, 1.5, 0.25]
    ];

    for (const [x, y, rotation, scaleX, scaleY] of cases) {
        const placement = Matrix.compose(x, y, rotation, scaleX, scaleY).decompose();

        assert.equal(placement.sheared, false);
        assert.ok(Math.abs(placement.x - x) < 1e-10, `x of ${rotation}`);
        assert.ok(Math.abs(placement.y - y) < 1e-10, `y of ${rotation}`);
        assert.ok(Math.abs(placement.rotation - rotation) < 1e-10, `rotation of ${rotation}`);
        assert.ok(Math.abs(placement.scaleX - scaleX) < 1e-10, `scaleX of ${rotation}`);
        assert.ok(Math.abs(placement.scaleY - scaleY) < 1e-10, `scaleY of ${rotation}`);
    }
});

test('recomposing what decompose returned gives the same matrix back', () => {
    const matrix = Matrix.compose(12, -3, 0.7, 2, 0.5);
    const placement = matrix.decompose();

    assert.ok(Matrix.compose(
        placement.x, placement.y, placement.rotation, placement.scaleX, placement.scaleY
    ).equals(matrix));
});

test('a mirrored transform stays mirrored', () => {
    // hypot() would report a positive scaleY and silently drop the flip; the determinant
    // is what knows.
    const placement = Matrix.compose(0, 0, 0, 1, -1).decompose();

    assert.equal(placement.scaleY, -1);
    assert.equal(placement.sheared, false);
});

test('decompose is pure and its result is frozen', () => {
    const matrix = Matrix.compose(1, 2, 0.3, 1, 1);
    const placement = matrix.decompose();

    assert.throws(() => { placement.x = 99; }, TypeError);
    assert.deepEqual(matrix.decompose(), placement, 'twice, the same answer');
});

test('a sheared matrix says so instead of pretending', () => {
    // The shear appears exactly where ADR-0022 says it does: a non-uniform scale above a
    // rotation. `(x, y, rotation, scaleX, scaleY)` cannot represent the result, and the
    // honest answer is to report it rather than deform the object in silence.
    const stretched = Matrix.compose(0, 0, 0, 3, 1);
    const rotated = Matrix.compose(0, 0, Math.PI / 4, 1, 1);
    const composed = stretched.multiply(rotated);

    const placement = composed.decompose();

    assert.equal(placement.sheared, true);
    assert.ok(Math.abs(placement.skew) > 0.1, 'and it says how much');
    assert.equal(
        Matrix.compose(
            placement.x, placement.y, placement.rotation, placement.scaleX, placement.scaleY
        ).equals(composed),
        false,
        'the five-value form genuinely cannot hold it — which is the point of saying so'
    );
});

test('a uniform scale above a rotation is not sheared', () => {
    const composed = Matrix.compose(0, 0, 0, 2, 2).multiply(Matrix.compose(0, 0, Math.PI / 3, 1, 1));

    assert.equal(composed.decompose().sheared, false);
});

test('a collapsed matrix decomposes without throwing', () => {
    const flat = Matrix.compose(5, 6, Math.PI / 2, 0, 2).decompose();

    assert.equal(flat.scaleX, 0);
    assert.equal(flat.x, 5);
    assert.equal(flat.y, 6);
    assert.ok(Math.abs(flat.rotation - Math.PI / 2) < 1e-10);
    assert.ok(Math.abs(flat.scaleY - 2) < 1e-10);

    const empty = new Matrix(0, 0, 0, 0, 1, 2).decompose();
    assert.equal(empty.rotation, 0);
    assert.equal(empty.scaleX, 0);
    assert.equal(empty.scaleY, 0);
});
