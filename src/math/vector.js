/**
 * 2D Vector mathematics class
 * Provides vector operations for game physics, movement, and transformations
 * 
 * Note: The z component is used ONLY for z-index (depth sorting), not 3D calculations.
 * Pixel Creator is a 2D engine - z is for layer ordering only.
 */
export class Vector {
    
    /**
     * Create a new 2D vector
     * @param {number} x - The x component
     * @param {number} y - The y component
     * @param {number} z - The z-index for depth sorting (NOT 3D)
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z; // z-index only (depth sorting)
    }

    /**
     * Create a copy of this vector
     * @returns {Vector} A new vector with the same components
     */
    clone() {
        return new Vector(this.x, this.y, this.z);
    }

    /**
     * Copy values from another vector
     * @param {Vector} v - The vector to copy from
     * @returns {Vector} This vector for chaining
     */
    copy(v) {
        this.x = v.x;
        this.y = v.y;
        this.z = v.z ?? 0;
        return this;
    }

    /**
     * Set vector components
     * @param {number} x - The x component
     * @param {number} y - The y component
     * @param {number} z - The z component (optional)
     * @returns {Vector} This vector for chaining
     */
    set(x, y, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
        return this;
    }

    /**
     * Add another vector to this vector
     * @param {Vector} v - The vector to add
     * @returns {Vector} This vector for chaining
     */
    add(v) {
        this.x += v.x;
        this.y += v.y;
        this.z += v.z ?? 0;
        return this;
    }

    /**
     * Subtract another vector from this vector
     * @param {Vector} v - The vector to subtract
     * @returns {Vector} This vector for chaining
     */
    sub(v) {
        this.x -= v.x;
        this.y -= v.y;
        this.z -= v.z ?? 0;
        return this;
    }

    /**
     * Multiply this vector by a scalar
     * @param {number} scalar - The scalar value
     * @returns {Vector} This vector for chaining
     */
    mult(scalar) {
        this.x *= scalar;
        this.y *= scalar;
        this.z *= scalar;
        return this;
    }

    /**
     * Divide this vector by a scalar
     * @param {number} scalar - The scalar value
     * @returns {Vector} This vector for chaining
     */
    div(scalar) {
        if (scalar !== 0) {
            this.x /= scalar;
            this.y /= scalar;
            this.z /= scalar;
        }
        return this;
    }

    /**
     * Calculate the magnitude (length) of this vector
     * @returns {number} The magnitude
     */
    mag() {
        return Math.sqrt(this.x * this.x + this.y * this.y + this.z * this.z);
    }

    /**
     * Calculate the squared magnitude (faster, no sqrt)
     * @returns {number} The squared magnitude
     */
    magSq() {
        return this.x * this.x + this.y * this.y + this.z * this.z;
    }

    /**
     * Normalize this vector (make it unit length)
     * @returns {Vector} This vector for chaining
     */
    normalize() {
        const m = this.mag();
        if (m > 0) {
            this.div(m);
        }
        return this;
    }

    /**
     * Set the magnitude of this vector
     * @param {number} len - The new magnitude
     * @returns {Vector} This vector for chaining
     */
    setMag(len) {
        return this.normalize().mult(len);
    }

    /**
     * Limit the magnitude of this vector
     * @param {number} max - The maximum magnitude
     * @returns {Vector} This vector for chaining
     */
    limit(max) {
        if (this.magSq() > max * max) {
            this.setMag(max);
        }
        return this;
    }

    /**
     * Calculate the dot product with another vector
     * @param {Vector} v - The other vector
     * @returns {number} The dot product
     */
    dot(v) {
        return this.x * v.x + this.y * v.y + this.z * (v.z ?? 0);
    }

    /**
     * Calculate the cross product with another vector (3D)
     * @param {Vector} v - The other vector
     * @returns {Vector} A new vector representing the cross product
     */
    cross(v) {
        return new Vector(
            this.y * (v.z ?? 0) - this.z * v.y,
            this.z * v.x - this.x * (v.z ?? 0),
            this.x * v.y - this.y * v.x
        );
    }

    /**
     * Calculate the distance to another vector
     * @param {Vector} v - The other vector
     * @returns {number} The distance
     */
    dist(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - (v.z ?? 0);
        return Math.sqrt(dx * dx + dy * dy + dz * dz);
    }

    /**
     * Calculate the squared distance to another vector (faster)
     * @param {Vector} v - The other vector
     * @returns {number} The squared distance
     */
    distSq(v) {
        const dx = this.x - v.x;
        const dy = this.y - v.y;
        const dz = this.z - (v.z ?? 0);
        return dx * dx + dy * dy + dz * dz;
    }

    /**
     * Calculate the angle of this vector (2D)
     * @returns {number} The angle in radians
     */
    heading() {
        return Math.atan2(this.y, this.x);
    }

    /**
     * Rotate this vector by an angle (2D)
     * @param {number} angle - The angle in radians
     * @returns {Vector} This vector for chaining
     */
    rotate(angle) {
        const cos = Math.cos(angle);
        const sin = Math.sin(angle);
        const x = this.x * cos - this.y * sin;
        const y = this.x * sin + this.y * cos;
        this.x = x;
        this.y = y;
        return this;
    }

    /**
     * Calculate the angle between this vector and another
     * @param {Vector} v - The other vector
     * @returns {number} The angle in radians
     */
    angleBetween(v) {
        const dot = this.dot(v);
        const m1 = this.mag();
        const m2 = v.mag();
        if (m1 === 0 || m2 === 0) return 0;
        return Math.acos(Math.max(-1, Math.min(1, dot / (m1 * m2))));
    }

    /**
     * Linear interpolation to another vector
     * @param {Vector} v - The target vector
     * @param {number} t - The interpolation factor (0-1)
     * @returns {Vector} This vector for chaining
     */
    lerp(v, t) {
        this.x += (v.x - this.x) * t;
        this.y += (v.y - this.y) * t;
        this.z += ((v.z ?? 0) - this.z) * t;
        return this;
    }

    /**
     * Reflect this vector off a surface with the given normal
     * @param {Vector} normal - The surface normal
     * @returns {Vector} This vector for chaining
     */
    reflect(normal) {
        const d = 2 * this.dot(normal);
        this.x -= d * normal.x;
        this.y -= d * normal.y;
        this.z -= d * (normal.z ?? 0);
        return this;
    }

    /**
     * Convert to array
     * @returns {number[]} Array [x, y, z]
     */
    toArray() {
        return [this.x, this.y, this.z];
    }

    /**
     * Convert to string
     * @returns {string} String representation
     */
    toString() {
        return `Vector(${this.x}, ${this.y}, ${this.z})`;
    }

    /**
     * Check equality with another vector
     * @param {Vector} v - The other vector
     * @returns {boolean} True if equal
     */
    equals(v) {
        return this.x === v.x && this.y === v.y && this.z === (v.z ?? 0);
    }

    // ==================== STATIC METHODS ====================

    /**
     * Create a vector from an angle (2D)
     * @static
     * @param {number} angle - The angle in radians
     * @param {number} length - The magnitude (default: 1)
     * @returns {Vector} A new vector
     */
    static fromAngle(angle, length = 1) {
        return new Vector(
            Math.cos(angle) * length,
            Math.sin(angle) * length,
            0
        );
    }

    /**
     * Create a random 2D unit vector
     * @static
     * @returns {Vector} A new random unit vector
     */
    static random2D() {
        const angle = Math.random() * Math.PI * 2;
        return Vector.fromAngle(angle);
    }

    /**
     * Create a random 3D unit vector
     * @static
     * @returns {Vector} A new random unit vector
     */
    static random3D() {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        return new Vector(
            Math.sin(phi) * Math.cos(theta),
            Math.sin(phi) * Math.sin(theta),
            Math.cos(phi)
        );
    }

    /**
     * Add two vectors (static version)
     * @static
     * @param {Vector} v1 - First vector
     * @param {Vector} v2 - Second vector
     * @returns {Vector} A new vector
     */
    static add(v1, v2) {
        return new Vector(v1.x + v2.x, v1.y + v2.y, v1.z + (v2.z ?? 0));
    }

    /**
     * Subtract two vectors (static version)
     * @static
     * @param {Vector} v1 - First vector
     * @param {Vector} v2 - Second vector
     * @returns {Vector} A new vector
     */
    static sub(v1, v2) {
        return new Vector(v1.x - v2.x, v1.y - v2.y, v1.z - (v2.z ?? 0));
    }

    /**
     * Multiply a vector by a scalar (static version)
     * @static
     * @param {Vector} v - The vector
     * @param {number} scalar - The scalar
     * @returns {Vector} A new vector
     */
    static mult(v, scalar) {
        return new Vector(v.x * scalar, v.y * scalar, v.z * scalar);
    }

    /**
     * Divide a vector by a scalar (static version)
     * @static
     * @param {Vector} v - The vector
     * @param {number} scalar - The scalar
     * @returns {Vector} A new vector
     */
    static div(v, scalar) {
        if (scalar === 0) return new Vector(0, 0, 0);
        return new Vector(v.x / scalar, v.y / scalar, v.z / scalar);
    }

    /**
     * Calculate dot product (static version)
     * @static
     * @param {Vector} v1 - First vector
     * @param {Vector} v2 - Second vector
     * @returns {number} The dot product
     */
    static dot(v1, v2) {
        return v1.x * v2.x + v1.y * v2.y + v1.z * (v2.z ?? 0);
    }

    /**
     * Calculate cross product (static version)
     * @static
     * @param {Vector} v1 - First vector
     * @param {Vector} v2 - Second vector
     * @returns {Vector} A new vector
     */
    static cross(v1, v2) {
        return new Vector(
            v1.y * (v2.z ?? 0) - v1.z * v2.y,
            v1.z * v2.x - v1.x * (v2.z ?? 0),
            v1.x * v2.y - v1.y * v2.x
        );
    }

    /**
     * Calculate distance between two vectors (static version)
     * @static
     * @param {Vector} v1 - First vector
     * @param {Vector} v2 - Second vector
     * @returns {number} The distance
     */
    static dist(v1, v2) {
        return v1.dist(v2);
    }

    /**
     * Linear interpolation between two vectors (static version)
     * @static
     * @param {Vector} v1 - Start vector
     * @param {Vector} v2 - End vector
     * @param {number} t - Interpolation factor (0-1)
     * @returns {Vector} A new interpolated vector
     */
    static lerp(v1, v2, t) {
        return new Vector(
            v1.x + (v2.x - v1.x) * t,
            v1.y + (v2.y - v1.y) * t,
            v1.z + ((v2.z ?? 0) - v1.z) * t
        );
    }

    /**
     * Create a zero vector
     * @static
     * @returns {Vector} A new zero vector
     */
    static zero() {
        return new Vector(0, 0, 0);
    }

    /**
     * Create a unit vector pointing up
     * @static
     * @returns {Vector} A new up vector
     */
    static up() {
        return new Vector(0, -1, 0);
    }

    /**
     * Create a unit vector pointing down
     * @static
     * @returns {Vector} A new down vector
     */
    static down() {
        return new Vector(0, 1, 0);
    }

    /**
     * Create a unit vector pointing left
     * @static
     * @returns {Vector} A new left vector
     */
    static left() {
        return new Vector(-1, 0, 0);
    }

    /**
     * Create a unit vector pointing right
     * @static
     * @returns {Vector} A new right vector
     */
    static right() {
        return new Vector(1, 0, 0);
    }
}
