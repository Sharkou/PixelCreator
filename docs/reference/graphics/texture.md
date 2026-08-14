Initialize a new `Texture` component for displaying images

```js
import { Texture } from '/src/graphics/texture.js';

const texture = new Texture('player.png');
player.addComponent(texture);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| src | `string` | The texture source path |
| flip | `boolean` | Flip horizontally (default: false) |
| scaleX | `number` | Horizontal scale (default: 1) |
| scaleY | `number` | Vertical scale (default: 1) |
| scaleFromBox | `boolean` | Scale from object box (default: true) |

---

## Properties

### [`source`](###source)

The source path of the texture

**Parameters**

| Name | Type |
|------|------|
| source | `string` |

**Example**

```js
texture.source = 'newSprite.png';
```

### [`image`](###image)

The loaded HTMLImageElement

**Parameters**

| Name | Type |
|------|------|
| image | `HTMLImageElement` |

### [`flip`](###flip)

Whether to flip the texture horizontally

**Parameters**

| Name | Type |
|------|------|
| flip | `boolean` |

**Example**

```js
// Flip when facing left
texture.flip = player.direction === 'left';
```

---

## Methods

### [`update()`](###update())

Update the texture (reloads from Loader if needed)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

### [`draw()`](###draw())

Draw the texture to the canvas

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

---

## Static Methods

### [`Texture.load()`](###Texture.load())

Load a texture asynchronously

**Return**

| Name | Type | Description |
|------|------|-------------|
| image | `Promise<HTMLImageElement>` | Promise resolving to the loaded image |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| src | `string` | The image source URL |

**Example**

```js
const image = await Texture.load('/images/player.png');
```

---

## Usage

### Basic Texture Setup

```js
import { Texture } from '/src/graphics/texture.js';

const player = new Object('Player', 100, 100, 32, 32);
player.addComponent(new Texture('player.png'));
```

### Texture with Animation

```js
import { Texture } from '/src/graphics/texture.js';
import { Animator } from '/src/anim/animator.js';

const player = new Object('Player', 100, 100, 32, 32);
player.addComponent(new Texture('idle1.png'));
player.addComponent(new Animator({
    idle: idleAnimation,
    walk: walkAnimation
}));
```

### Flipping Based on Direction

```js
class Movement {
    update(self) {
        const texture = self.components.Texture;
        
        if (this.velocityX < 0) {
            texture.flip = true;
        } else if (this.velocityX > 0) {
            texture.flip = false;
        }
    }
}
```

---

## See Also

- [Sprite](https://github.com/Sharkou/PixelCreator/wiki/Sprite) – Animated sprite component
- [Graphics](https://github.com/Sharkou/PixelCreator/wiki/Graphics) – Static drawing methods
