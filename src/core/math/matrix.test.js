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
