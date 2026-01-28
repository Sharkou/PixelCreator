Initialize a new `Animator` component for managing multiple animations

```js
import { Animator } from '/src/anim/animator.js';

const animator = new Animator({
    idle: idleAnimation,
    walk: walkAnimation,
    run: runAnimation
});

player.addComponent(animator);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| animations | `Object` | Object containing named animations (default: []) |
| current | `Animation` | The currently playing animation (default: null) |
| flip | `boolean` | Flip the animation horizontally (default: false) |
| stoppable | `boolean` | Can the animation be interrupted (default: true) |

---

## Properties

### [`animations`](###animations)

Object containing all registered animations

**Parameters**

| Name | Type |
|------|------|
| animations | `Object` |

**Exemple**

```js
animator.animations = {
    idle: new Animation(idleFrames, 200),
    walk: new Animation(walkFrames, 100),
    attack: new Animation(attackFrames, 80)
};
```

### [`current`](###current)

The currently playing animation

**Parameters**

| Name | Type |
|------|------|
| current | `Animation` |

**Exemple**

```js
if (animator.current === animator.animations.attack) {
    // Attack animation is playing
}
```

### [`flip`](###flip)

Whether to flip the animation horizontally

**Parameters**

| Name | Type |
|------|------|
| flip | `boolean` |

**Exemple**

```js
animator.flip = true; // Face left
```

### [`stoppable`](###stoppable)

Whether the current animation can be interrupted

**Parameters**

| Name | Type |
|------|------|
| stoppable | `boolean` |

---

## Methods

### [`play()`](###play())

Play a named animation

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| name | `string` | The animation name |
| flip | `boolean` | Flip horizontally (default: false) |
| stoppable | `boolean` | Can be interrupted (default: true) |

**Exemple**

```js
// Play walk animation facing right
animator.play('walk');

// Play walk animation facing left
animator.play('walk', true);

// Play attack animation that cannot be interrupted
animator.play('attack', false, false);
```

### [`stop()`](###stop())

Stop the current animation

| Return |
|--------|
| `void` |

**Exemple**

```js
animator.stop();
```

### [`update()`](###update())

Update the animator (called automatically)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

### [`add()`](###add())

Add an animation to the animator

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| animation | `Object` | Object with animation name as key |

**Exemple**

```js
animator.add({ jump: new Animation(jumpFrames, 100) });
animator.add({ crouch: new Animation(crouchFrames, 150) });
```

### [`remove()`](###remove())

Remove an animation from the animator

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| animation | `Object` | Object with animation name as key |

**Exemple**

```js
animator.remove({ jump: null });
```

---

## Usage

### Complete Character Animation Setup

```js
import { Animator } from '/src/anim/animator.js';
import { Animation } from '/src/anim/animation.js';
import { Texture } from '/src/graphics/texture.js';

// Create animations
const animations = {
    idle: new Animation(['idle1.png', 'idle2.png'], 200),
    walk: new Animation(['walk1.png', 'walk2.png', 'walk3.png', 'walk4.png'], 100),
    attack: new Animation(['attack1.png', 'attack2.png', 'attack3.png'], 80)
};

// Setup player
player.addComponent(new Texture('idle1.png'));
player.addComponent(new Animator(animations));

const animator = player.components.Animator;
animator.play('idle');
```

### Direction-Based Animation

```js
update(self) {
    const animator = self.components.Animator;
    
    if (this.direction === 'left') {
        animator.play('walk', true); // Flip for left
    } else if (this.direction === 'right') {
        animator.play('walk', false); // Normal for right
    } else {
        animator.play('idle');
    }
}
```

### Non-Interruptible Animations

```js
attack() {
    const animator = this.components.Animator;
    
    // Play attack animation that must complete
    animator.play('attack', false, false);
}
```
