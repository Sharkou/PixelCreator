Initialize a new `Animation` component

```js
import { Animation } from '/src/anim/animation.js';

const walkAnimation = new Animation([frame1, frame2, frame3], 100);
player.addComponent(walkAnimation);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| frames | `Array` | Array of frames (images) to display |
| speed | `number` | Time per frame in milliseconds (default: 100) |
| end | `boolean` | Has the animation ended (default: false) |
| current | `number` | Current frame index (default: 0) |

---

## Properties

### [`frames`](###frames)

The array of animation frames

**Parameters**

| Name | Type |
|------|------|
| frames | `Array` |

**Example**

```js
animation.frames = [idle1, idle2, idle3];
```

### [`speed`](###speed)

The time per frame in milliseconds

**Parameters**

| Name | Type |
|------|------|
| speed | `number` |

**Example**

```js
animation.speed = 150; // Slower animation
```

### [`end`](###end)

Indicates if the animation has completed its cycle

**Parameters**

| Name | Type |
|------|------|
| end | `boolean` |

**Example**

```js
if (animation.end) {
    playNextAnimation();
}
```

### [`i`](###i)

The current frame index

**Parameters**

| Name | Type |
|------|------|
| i | `number` |

**Example**

```js
console.log('Current frame:', animation.i);
```

---

## Methods

### [`update()`](###update())

Update the animation (advances frames based on time)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |
| flip | `boolean` | Flip the texture horizontally (default: false) |

**Example**

```js
// Called automatically by the engine
animation.update(player, false);
```

---

## Usage

### Creating a Simple Animation

```js
import { Animation } from '/src/anim/animation.js';
import { Texture } from '/src/graphics/texture.js';

// Load frames
const walkFrames = ['walk1.png', 'walk2.png', 'walk3.png', 'walk4.png'];

// Create animation at 100ms per frame
const walkAnim = new Animation(walkFrames, 100);

// Add to object (requires Texture component)
player.addComponent(new Texture('walk1.png'));
player.addComponent(walkAnim);
```

### Checking Animation State

```js
update(self) {
    const anim = self.components.Animation;
    
    if (anim.end) {
        // Animation completed one cycle
        this.onAnimationComplete();
    }
}
```

---

## See Also

- [Animator](https://github.com/Sharkou/PixelCreator/wiki/Animator) – Animation controller
- [Sprite](https://github.com/Sharkou/PixelCreator/wiki/Sprite) – Animated sprite component
- [Time](https://github.com/Sharkou/PixelCreator/wiki/Time) – Time utilities
