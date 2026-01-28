The **Vector** class provides comprehensive 2D and 3D vector mathematics for game physics, movement, and transformations.

---

## Overview

Vectors are essential for representing positions, directions, velocities, and forces in game development. The Vector class supports both instance methods (for chaining) and static methods (for pure functions).

---

## Import

```javascript
import { Vector } from '/src/math/vector.js';
```

---

## Constructor

```javascript
const v = new Vector(x, y, z);
```

| Parameter | Type | Default | Description |
|-----------|------|---------|-------------|
| `x` | number | 0 | X component |
| `y` | number | 0 | Y component |
| `z` | number | 0 | Z component (optional for 3D) |

---

## Instance Methods

### Basic Operations

#### `clone()`
Returns a copy of the vector.
```javascript
const copy = v.clone();
```

#### `copy(v)`
Copies values from another vector.
```javascript
v.copy(other);
```

#### `set(x, y, z)`
Sets the vector components.
```javascript
v.set(10, 20);
```

### Arithmetic

#### `add(v)` / `sub(v)`
Add or subtract another vector.
```javascript
velocity.add(acceleration);
position.sub(origin);
```

#### `mult(n)` / `div(n)`
Multiply or divide by a scalar.
```javascript
v.mult(2);    // Double the vector
v.div(2);     // Halve the vector
```

### Magnitude & Normalization

#### `mag()` / `magSq()`
Get magnitude or squared magnitude.
```javascript
const length = v.mag();
const lengthSq = v.magSq(); // Faster, no sqrt
```

#### `normalize()`
Make the vector unit length.
```javascript
direction.normalize();
```

#### `setMag(len)` / `limit(max)`
Set magnitude or limit maximum length.
```javascript
v.setMag(5);    // Set length to 5
v.limit(10);    // Cap at 10
```

### Vector Products

#### `dot(v)`
Calculate dot product.
```javascript
const d = v1.dot(v2);
```

#### `cross(v)`
Calculate cross product (3D).
```javascript
const c = v1.cross(v2);
```

### Distance

#### `dist(v)` / `distSq(v)`
Distance to another vector.
```javascript
const d = player.pos.dist(enemy.pos);
```

### Angles & Rotation

#### `heading()`
Get angle in radians (2D).
```javascript
const angle = velocity.heading();
```

#### `rotate(angle)`
Rotate by angle in radians.
```javascript
v.rotate(Math.PI / 4);
```

#### `angleBetween(v)`
Angle between two vectors.
```javascript
const angle = v1.angleBetween(v2);
```

### Interpolation & Reflection

#### `lerp(v, t)`
Linear interpolation.
```javascript
pos.lerp(target, 0.1);
```

#### `reflect(normal)`
Reflect off a surface.
```javascript
velocity.reflect(wallNormal);
```

### Utility

#### `toArray()` / `toString()`
Convert to array or string.
```javascript
const arr = v.toArray();  // [x, y, z]
const str = v.toString(); // "Vector(x, y, z)"
```

#### `equals(v)`
Check equality.
```javascript
if (v1.equals(v2)) { ... }
```

---

## Static Methods

### Creation

```javascript
const v = Vector.fromAngle(angle);      // From angle
const r = Vector.random2D();            // Random unit 2D
const r3 = Vector.random3D();           // Random unit 3D
```

### Operations

```javascript
const sum = Vector.add(v1, v2);
const diff = Vector.sub(v1, v2);
const scaled = Vector.mult(v, 2);
const half = Vector.div(v, 2);
const dot = Vector.dot(v1, v2);
const cross = Vector.cross(v1, v2);
const dist = Vector.dist(v1, v2);
const mid = Vector.lerp(v1, v2, 0.5);
```

### Constants

```javascript
Vector.zero()   // (0, 0, 0)
Vector.up()     // (0, -1, 0)
Vector.down()   // (0, 1, 0)
Vector.left()   // (-1, 0, 0)
Vector.right()  // (1, 0, 0)
```

---

## Common Patterns

### Movement
```javascript
const velocity = new Vector(5, 0);
const acceleration = new Vector(0, 0.1);

function update() {
    velocity.add(acceleration);
    velocity.limit(10);
    position.add(velocity);
}
```

### Seeking
```javascript
function seek(target) {
    const desired = Vector.sub(target, position);
    desired.setMag(maxSpeed);
    const steer = Vector.sub(desired, velocity);
    steer.limit(maxForce);
    return steer;
}
```

### Distance Check
```javascript
if (player.pos.distSq(enemy.pos) < radiusSq) {
    // Collision!
}
```

### Smooth Following
```javascript
function follow(target) {
    position.lerp(target, 0.05);
}
```

---

## Performance Tips

- Use `magSq()` and `distSq()` when comparing distances (avoids `sqrt`)
- Use static methods for pure calculations without mutation
- Chain instance methods for complex operations
- Pre-allocate vectors to avoid garbage collection

---

## See Also

- [Math](math.md) – Mathematical utilities
- [Random](random.md) – Random number generation
- [Controller](controller.md) – Movement physics
