Create a new vector for physics, movement, and transformations

```javascript
import { Vector } from '/src/math/vector.js';

const velocity = new Vector(1, 0);
const position = new Vector(100, 200);
```

## Parameters

| Name | Type | Description |
| --- | --- | --- |
| x | number | The x component (default: 0) |
| y | number | The y component (default: 0) |
| z | number | The z-index for depth sorting (default: 0) |

> The `z` component is used only for **z-index ordering** (depth sorting).

---

## Properties

### [`x`](###x)

The x component of the vector

| Type | Description |
| --- | --- |
| number | x value |

---

### [`y`](###y)

The y component of the vector

| Type | Description |
| --- | --- |
| number | y value |

---

### [`z`](###z)

The z component (depth sorting only)

| Type | Description |
| --- | --- |
| number | z-index value |

---

## Methods

### [`clone()`](###clone())

Create a copy of this vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector with the same components |

**Example**

```javascript
const copy = velocity.clone();
```

---

### [`copy()`](###copy())

Copy values from another vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The vector to copy from |

**Example**

```javascript
position.copy(targetPosition);
```

---

### [`set()`](###set())

Set vector components

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| x | number | The x component |
| y | number | The y component |
| z | number | The z component (optional, default: 0) |

**Example**

```javascript
velocity.set(5, 3);
```

---

### [`add()`](###add())

Add another vector to this vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The vector to add |

**Example**

```javascript
position.add(velocity);
```

---

### [`sub()`](###sub())

Subtract another vector from this vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The vector to subtract |

**Example**

```javascript
const direction = target.clone().sub(position);
```

---

### [`mult()`](###mult())

Multiply this vector by a scalar

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scalar | number | The scalar value |

**Example**

```javascript
velocity.mult(2); // Double speed
```

---

### [`div()`](###div())

Divide this vector by a scalar

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| scalar | number | The scalar value |

**Example**

```javascript
velocity.div(2); // Half speed
```

---

### [`mag()`](###mag())

Calculate the magnitude (length) of this vector

**Return**

| Type | Description |
| --- | --- |
| number | The magnitude |

**Example**

```javascript
const speed = velocity.mag();
```

---

### [`magSq()`](###magSq())

Calculate the squared magnitude (faster, no sqrt)

**Return**

| Type | Description |
| --- | --- |
| number | The squared magnitude |

**Example**

```javascript
if (velocity.magSq() > maxSpeed * maxSpeed) {
    // Too fast
}
```

---

### [`normalize()`](###normalize())

Normalize this vector (make it unit length)

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Example**

```javascript
const direction = velocity.clone().normalize();
```

---

### [`setMag()`](###setMag())

Set the magnitude of this vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| len | number | The new magnitude |

**Example**

```javascript
velocity.setMag(5); // Set speed to 5
```

---

### [`limit()`](###limit())

Limit the magnitude of this vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| max | number | The maximum magnitude |

**Example**

```javascript
velocity.limit(10); // Cap speed at 10
```

---

### [`dot()`](###dot())

Calculate the dot product with another vector

**Return**

| Type | Description |
| --- | --- |
| number | The dot product |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

**Example**

```javascript
const alignment = velocity.dot(targetDirection);
```

---

### [`cross()`](###cross())

Calculate the cross product with another vector (3D)

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector representing the cross product |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

---

### [`dist()`](###dist())

Calculate the distance to another vector

**Return**

| Type | Description |
| --- | --- |
| number | The distance |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

**Example**

```javascript
const distance = player.position.dist(enemy.position);
```

---

### [`distSq()`](###distSq())

Calculate the squared distance to another vector (faster)

**Return**

| Type | Description |
| --- | --- |
| number | The squared distance |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

**Example**

```javascript
if (position.distSq(target) < range * range) {
    // In range
}
```

---

### [`heading()`](###heading())

Calculate the angle of this vector (2D)

**Return**

| Type | Description |
| --- | --- |
| number | The angle in radians |

**Example**

```javascript
const angle = velocity.heading();
```

---

### [`rotate()`](###rotate())

Rotate this vector by an angle (2D)

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| angle | number | The angle in radians |

**Example**

```javascript
velocity.rotate(Math.PI / 4); // Rotate 45 degrees
```

---

### [`angleBetween()`](###angleBetween())

Calculate the angle between this vector and another

**Return**

| Type | Description |
| --- | --- |
| number | The angle in radians |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

---

### [`lerp()`](###lerp())

Linear interpolation to another vector

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The target vector |
| t | number | The interpolation factor (0-1) |

**Example**

```javascript
position.lerp(target, 0.1); // Smooth movement
```

---

### [`reflect()`](###reflect())

Reflect this vector off a surface with the given normal

**Return**

| Type | Description |
| --- | --- |
| Vector | This vector for chaining |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| normal | Vector | The surface normal |

**Example**

```javascript
velocity.reflect(wallNormal); // Bounce off wall
```

---

### [`toArray()`](###toArray())

Convert to array

**Return**

| Type | Description |
| --- | --- |
| Array | Array [x, y, z] |

---

### [`toString()`](###toString())

Convert to string

**Return**

| Type | Description |
| --- | --- |
| string | String representation |

**Example**

```javascript
console.log(position.toString()); // "Vector(100, 200, 0)"
```

---

### [`equals()`](###equals())

Check equality with another vector

**Return**

| Type | Description |
| --- | --- |
| boolean | True if equal |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v | Vector | The other vector |

---

## Static Methods

### [`Vector.fromAngle()`](###Vector.fromAngle())

Create a vector from an angle (2D)

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| angle | number | The angle in radians |
| length | number | The magnitude (default: 1) |

**Example**

```javascript
const direction = Vector.fromAngle(Math.PI / 2); // Pointing up
const velocity = Vector.fromAngle(angle, speed);
```

---

### [`Vector.random2D()`](###Vector.random2D())

Create a random 2D unit vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new random unit vector |

---

### [`Vector.add()`](###Vector.add())

Add two vectors (static)

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v1 | Vector | First vector |
| v2 | Vector | Second vector |

---

### [`Vector.sub()`](###Vector.sub())

Subtract two vectors (static)

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v1 | Vector | First vector |
| v2 | Vector | Second vector |

---

### [`Vector.dist()`](###Vector.dist())

Calculate distance between two vectors (static)

**Return**

| Type | Description |
| --- | --- |
| number | The distance |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v1 | Vector | First vector |
| v2 | Vector | Second vector |

---

### [`Vector.lerp()`](###Vector.lerp())

Interpolate between two vectors (static)

**Return**

| Type | Description |
| --- | --- |
| Vector | A new interpolated vector |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| v1 | Vector | Start vector |
| v2 | Vector | End vector |
| t | number | Interpolation factor (0-1) |

---

### [`Vector.zero()`](###Vector.zero())

Create a zero vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new zero vector (0, 0, 0) |

---

### [`Vector.one()`](###Vector.one())

Create a one vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new one vector (1, 1, 1) |

---

### [`Vector.up()`](###Vector.up())

Get the up direction vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector (0, -1, 0) |

---

### [`Vector.down()`](###Vector.down())

Get the down direction vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector (0, 1, 0) |

---

### [`Vector.left()`](###Vector.left())

Get the left direction vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector (-1, 0, 0) |

---

### [`Vector.right()`](###Vector.right())

Get the right direction vector

**Return**

| Type | Description |
| --- | --- |
| Vector | A new vector (1, 0, 0) |

---

## See Also

- [Math](https://github.com/Sharkou/PixelCreator/wiki/Math) – Math utilities
- [Object](https://github.com/Sharkou/PixelCreator/wiki/Object) – Game object (uses vectors for position)
