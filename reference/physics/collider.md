Collision detection components for physics interactions

```js
import { Collider, RectCollider, CircleCollider } from '/src/physics/collider.js';
```

---

# Collider (Base Class)

Point-based collision detection

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| offsetX | `number` | X offset from object center (default: 0) |
| offsetY | `number` | Y offset from object center (default: 0) |
| preview | `boolean` | Show collider in editor (default: true) |
| color | `string` | Preview color (default: '#e02c2c') |

---

## Properties

### [`offsetX`](###offsetX)

The X offset of the collider

**Parameters**

| Name | Type |
|------|------|
| offsetX | `number` |

### [`offsetY`](###offsetY)

The Y offset of the collider

**Parameters**

| Name | Type |
|------|------|
| offsetY | `number` |

### [`preview`](###preview)

Whether to show the collider in the editor

**Parameters**

| Name | Type |
|------|------|
| preview | `boolean` |

### [`color`](###color)

The color of the collider preview

**Parameters**

| Name | Type |
|------|------|
| color | `string` |

### [`opacity`](###opacity)

The opacity of the collider preview

**Parameters**

| Name | Type |
|------|------|
| opacity | `number` |

### [`is_trigger`](###is_trigger)

If true, collisions are detected but no physical response

**Parameters**

| Name | Type |
|------|------|
| is_trigger | `boolean` |

---

## Methods

### [`testCollisions()`](###testCollisions())

Test collision with all scene objects

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

### [`testCollision()`](###testCollision())

Test collision with a specific object

**Return**

| Name | Type | Description |
|------|------|-------------|
| colliding | `boolean` | True if colliding |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | This object |
| other | `Object` | The other object |

---

# RectCollider

Rectangle-based collision detection

```js
const collider = new RectCollider(0, 0, true, '#e02c2c', 40, 40);
player.addComponent(collider);
```

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| offsetX | `number` | X offset from object center (default: 0) |
| offsetY | `number` | Y offset from object center (default: 0) |
| preview | `boolean` | Show collider in editor (default: true) |
| color | `string` | Preview color (default: '#e02c2c') |
| width | `number` | Collider width (default: 40) |
| height | `number` | Collider height (default: 40) |

---

## Additional Properties

### [`width`](###width)

The width of the rectangle collider

**Parameters**

| Name | Type |
|------|------|
| width | `number` |

### [`height`](###height)

The height of the rectangle collider

**Parameters**

| Name | Type |
|------|------|
| height | `number` |

---

## Methods

### [`detectMouse()`](###detectMouse())

Detect if mouse is hovering over the collider

**Return**

| Name | Type | Description |
|------|------|-------------|
| hovering | `boolean` | True if mouse is over collider |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |
| x | `number` | Mouse X coordinate |
| y | `number` | Mouse Y coordinate |

### [`detectSide()`](###detectSide())

Detect which side of the collider the mouse is near

**Return**

| Name | Type | Description |
|------|------|-------------|
| side | `string` | The detected side or false |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |
| x | `number` | Mouse X coordinate |
| y | `number` | Mouse Y coordinate |

**Return Values**

| Value | Description |
|-------|-------------|
| `'left'` | Left side |
| `'right'` | Right side |
| `'top'` | Top side |
| `'bottom'` | Bottom side |
| `'left-top'` | Top-left corner |
| `'left-bottom'` | Bottom-left corner |
| `'right-top'` | Top-right corner |
| `'right-bottom'` | Bottom-right corner |
| `false` | Not on any edge |

---

# CircleCollider

Circle-based collision detection

```js
const collider = new CircleCollider(0, 0, true, '#e02c2c', 20);
ball.addComponent(collider);
```

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| offsetX | `number` | X offset from object center (default: 0) |
| offsetY | `number` | Y offset from object center (default: 0) |
| preview | `boolean` | Show collider in editor (default: true) |
| color | `string` | Preview color (default: '#e02c2c') |
| width | `number` | Circle radius (default: 20) |

---

## Additional Properties

### [`width`](###width)

The radius of the circle collider

**Parameters**

| Name | Type |
|------|------|
| width | `number` |

---

## Collision Events

Objects with colliders can implement these methods:

### `onCollisionStart(other)`

Called when collision first begins

```js
class Player {
    onCollisionStart(self, other) {
        console.log('Started colliding with', other.name);
    }
}
```

### `onCollision(other)`

Called every frame while colliding

```js
class Player {
    onCollision(self, other) {
        if (other.tag === 'damage') {
            this.takeDamage(1);
        }
    }
}
```

### `onCollisionExit(other)`

Called when collision ends

```js
class Player {
    onCollisionExit(self, other) {
        console.log('Stopped colliding with', other.name);
    }
}
```

---

## Usage

### Basic Collision Setup

```js
import { RectCollider } from '/src/physics/collider.js';

const player = new Object('Player', 100, 100, 32, 32);
player.addComponent(new RectCollider(0, 0, true, '#00ff00', 32, 32));
```

### Circle Collider for Projectiles

```js
import { CircleCollider } from '/src/physics/collider.js';

const bullet = new Object('Bullet', x, y, 8, 8);
bullet.addComponent(new CircleCollider(0, 0, true, '#ff0000', 4));
```

### Custom Collision Handling

```js
class Enemy {
    onCollisionStart(self, other) {
        if (other.tag === 'player') {
            other.takeDamage(this.damage);
        }
    }
    
    onCollisionExit(self, other) {
        if (other.tag === 'player') {
            this.stopAttacking();
        }
    }
}
```

---

## See Also

- [Controller](https://github.com/Sharkou/PixelCreator/wiki/Controller) – Player movement component
- [Object](https://github.com/Sharkou/PixelCreator/wiki/Object) – Game object
