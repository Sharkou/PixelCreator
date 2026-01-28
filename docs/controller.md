Initialize a new `Controller` component for player movement

```js
import { Controller } from '/src/physics/controller.js';

const controller = new Controller(1);
player.addComponent(controller);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| speed | `number` | Movement speed multiplier (default: 1) |

---

## Properties

### [`right`](###right)

Key for moving right

**Parameters**

| Name | Type |
|------|------|
| right | `string` |

**Default**: `'d'`

### [`left`](###left)

Key for moving left

**Parameters**

| Name | Type |
|------|------|
| left | `string` |

**Default**: `'q'`

### [`top`](###top)

Key for moving up

**Parameters**

| Name | Type |
|------|------|
| top | `string` |

**Default**: `'z'`

### [`bottom`](###bottom)

Key for moving down

**Parameters**

| Name | Type |
|------|------|
| bottom | `string` |

**Default**: `'s'`

### [`direction`](###direction)

The current movement direction

**Parameters**

| Name | Type |
|------|------|
| direction | `string` |

**Values**: `'left'`, `'right'`, `'top'`, `'bottom'`, `''`

### [`speed`](###speed)

Movement speed multiplier

**Parameters**

| Name | Type |
|------|------|
| speed | `number` |

---

## Methods

### [`update()`](###update())

Update the controller (handle input and movement)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

---

## Usage

### Basic Player Setup

```js
import { Controller } from '/src/physics/controller.js';

const player = new Object('Player', 100, 100, 32, 32);
player.addComponent(new Controller(2)); // Speed of 2
```

### Custom Keybindings

```js
const controller = new Controller(1);

// Arrow keys
controller.right = 'ArrowRight';
controller.left = 'ArrowLeft';
controller.top = 'ArrowUp';
controller.bottom = 'ArrowDown';

player.addComponent(controller);
```

### WASD Controls

```js
const controller = new Controller(1);

controller.right = 'd';
controller.left = 'a';
controller.top = 'w';
controller.bottom = 's';

player.addComponent(controller);
```

### With Animation

```js
class AnimatedController extends Controller {
    update(self) {
        super.update(self);
        
        const animator = self.components.Animator;
        
        if (this.direction) {
            animator.play('walk', this.direction === 'left');
        } else {
            animator.play('idle');
        }
    }
}
```

### Checking Direction

```js
update(self) {
    const controller = self.components.Controller;
    
    if (controller.direction === 'right') {
        // Player is moving right
    } else if (controller.direction === 'left') {
        // Player is moving left
    }
}
```

---

## Note

The Controller requires the player object to have a `uid` property set for multiplayer support. The controller checks keyboard input for the specific user identified by `self.uid`.
