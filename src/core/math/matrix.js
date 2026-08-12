// 2D affine transform matrix.
//
//   | a  c  e |     x' = a*x + c*y + e
//   | b  d  f |     y' = b*x + d*y + f
//   | 0  0  1 |
//
// The six-component layout is the one every 2D graphics API speaks, Canvas 2D included,
// so a backend passes it straight through instead of translating conventions. It is
// also what a future WebGL or WebGPU backend would upload, which is the point: the
// model composes transforms without knowing who draws them.
//
// Instances are immutable. Composition allocates, which is measured in objects per
// frame rather than per pixel, and buys the guarantee that no cached matrix is mutated
// behind a caller's back.

export class Matrix {

    /**
     * Create a matrix from its six affine components.
     * @param {number} [a] - Horizontal scaling
     * @param {number} [b] - Vertical skewing
     * @param {number} [c] - Horizontal skewing
     * @param {number} [d] - Vertical scaling
     * @param {number} [e] - Horizontal translation
     * @param {number} [f] - Vertical translation
     */
    constructor(a = 1, b = 0, c = 0, d = 1, e = 0, f = 0) {
        this.a = a;
        this.b = b;
        this.c = c;
        this.d = d;
        this.e = e;
        this.f = f;
        globalThis.Object.freeze(this);
    }

    /**
     * The identity matrix.
     * @returns {Matrix} A matrix that changes nothing
     */
    static identity() {
        return IDENTITY;
    }

    /**
     * Build a matrix from placement values, composed as translate, then rotate, then scale.
     *
     * That order is what makes the values mean what a creator expects: scaling stretches
     * the object about its own origin, rotation turns it in place, and translation then
     * moves the result. Any other order would make rotation displace the object or
     * scaling stretch its position.
     *
     * @param {number} x - Horizontal translation
     * @param {number} y - Vertical translation
     * @param {number} rotation - Rotation in radians
     * @param {number} scaleX - Horizontal scale
     * @param {number} scaleY - Vertical scale
     * @returns {Matrix} The composed matrix
     */
    static compose(x = 0, y = 0, rotation = 0, scaleX = 1, scaleY = 1) {
        if (rotation === 0) {
            return new Matrix(scaleX, 0, 0, scaleY, x, y);
        }
        const cos = Math.cos(rotation);
        const sin = Math.sin(rotation);
        return new Matrix(cos * scaleX, sin * scaleX, -sin * scaleY, cos * scaleY, x, y);
    }

    /**
     * Multiply this matrix by another, applying the other one first.
     *
     * `parent.multiply(local)` therefore reads as "place the child inside its parent",
     * which is the composition the hierarchy needs.
     *
     * @param {Matrix} other - The matrix applied first
     * @returns {Matrix} The composed matrix
     */
    multiply(other) {
        return new Matrix(
            this.a * other.a + this.c * other.b,
            this.b * other.a + this.d * other.b,
            this.a * other.c + this.c * other.d,
            this.b * other.c + this.d * other.d,
            this.a * other.e + this.c * other.f + this.e,
            this.b * other.e + this.d * other.f + this.f
        );
    }

    /**
     * Transform a point.
     * @param {number} x - Horizontal coordinate
     * @param {number} y - Vertical coordinate
     * @returns {{x: number, y: number}} The transformed point
     */
    apply(x, y) {
        return {
            x: this.a * x + this.c * y + this.e,
            y: this.b * x + this.d * y + this.f
        };
    }

    /**
     * Invert the matrix, for going from world space back into local space.
     * @returns {Matrix} The inverse
     */
    invert() {
        const determinant = this.a * this.d - this.b * this.c;
        if (determinant === 0) {
            throw new Error('Matrix.invert: matrix is not invertible (zero scale)');
        }
        return new Matrix(
            this.d / determinant,
            -this.b / determinant,
            -this.c / determinant,
            this.a / determinant,
            (this.c * this.f - this.d * this.e) / determinant,
            (this.b * this.e - this.a * this.f) / determinant
        );
    }

    /**
     * Tell whether two matrices are equal within a tolerance.
     * @param {Matrix} other - The matrix to compare with
     * @param {number} [epsilon] - Accepted difference per component
     * @returns {boolean} True when equal
     */
    equals(other, epsilon = 1e-10) {
        return Math.abs(this.a - other.a) < epsilon
            && Math.abs(this.b - other.b) < epsilon
            && Math.abs(this.c - other.c) < epsilon
            && Math.abs(this.d - other.d) < epsilon
            && Math.abs(this.e - other.e) < epsilon
            && Math.abs(this.f - other.f) < epsilon;
    }
}

const IDENTITY = new Matrix();
