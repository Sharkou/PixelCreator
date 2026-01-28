Initialize a new `Camera` component

```js
import { Camera } from '/src/core/camera.js';

const viewport = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight);
viewport.addComponent(new Camera('#272727'));
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| background | `string` | The background color (default: '#272727') |
| max_x | `number` | The x-limit for the camera's position (default: 0) |
| max_y | `number` | The y-limit for the camera's position (default: 0) |

---

## Properties

### [`background`](###background)

The background color of the camera viewport

**Parameters**

| Name | Type |
|------|------|
| background | `string` |

**Exemple**

```js
const camera = viewport.components.Camera;
camera.background = '#1a1a2e';
```

### [`fill`](###fill)

Fill the black stripes (letterboxing)

**Parameters**

| Name | Type |
|------|------|
| fill | `boolean` |

**Exemple**

```js
camera.fill = true;
```

### [`max_x`](###max_x)

The x-axis movement limit for the camera

**Parameters**

| Name | Type |
|------|------|
| max_x | `number` |

**Exemple**

```js
camera.max_x = map.cols * map.tileSize - camera.width;
```

### [`max_y`](###max_y)

The y-axis movement limit for the camera

**Parameters**

| Name | Type |
|------|------|
| max_y | `number` |

**Exemple**

```js
camera.max_y = map.rows * map.tileSize - camera.height;
```

### [`offset`](###offset)

The camera offset settings for smooth movement

**Parameters**

| Name | Type |
|------|------|
| offset | `Object` |

**Properties**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | X offset |
| y | `number` | Y offset |
| speed | `number` | Offset speed (default: 0.1) |
| friction | `number` | Movement friction (default: 0.95) |

**Exemple**

```js
camera.offset.speed = 0.2;
camera.offset.friction = 0.9;
```

---

## Static Properties

### [`main`](###main)

Get or set the main camera

**Parameters**

| Name | Type |
|------|------|
| main | `Camera` |

**Exemple**

```js
const mainCamera = Camera.main;

// Set main camera
Camera.main = viewport.components.Camera;
```

---

## Methods

### [`preview()`](###preview())

Preview the camera bounds in the editor

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

**Exemple**

```js
// Called automatically by the editor
camera.preview(viewport);
```
