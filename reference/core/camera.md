Initialize a new `Camera` component

```javascript
import { Camera } from '/src/core/camera.js';

const viewport = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight);
viewport.addComponent(new Camera('#272727'));
```

## Parameters

| Name | Type | Description |
| --- | --- | --- |
| background | string | The background color (default: '#272727') |
| max_x | number | The x-limit for the camera's position (default: 0) |
| max_y | number | The y-limit for the camera's position (default: 0) |

---

## Properties

### [`background`](###background)

The background color of the camera

| Type | Description |
| --- | --- |
| string | The background color |

**Example**

```javascript
camera.getComponent('Camera').background = '#1a1a2e';
```

---

### [`fill`](###fill)

Fill the black stripes (letterboxing)

| Type | Description |
| --- | --- |
| boolean | Whether to fill the stripes (default: false) |

**Example**

```javascript
camera.getComponent('Camera').fill = true;
```

---

### [`max_x`](###max_x)

The x-limit for the camera's position

| Type | Description |
| --- | --- |
| number | The x boundary |

**Example**

```javascript
// Limit camera to map bounds
camera.getComponent('Camera').max_x = map.cols * map.tsize - camera.width;
```

---

### [`max_y`](###max_y)

The y-limit for the camera's position

| Type | Description |
| --- | --- |
| number | The y boundary |

**Example**

```javascript
// Limit camera to map bounds
camera.getComponent('Camera').max_y = map.rows * map.tsize - camera.height;
```

---

### [`offset`](###offset)

Camera offset for smooth following

| Type | Description |
| --- | --- |
| Object | The offset configuration |

**Properties**

| Name | Type | Description |
| --- | --- | --- |
| x | number | X offset (default: 0) |
| y | number | Y offset (default: 0) |
| speed | number | Follow speed (default: 0.1) |
| friction | number | Friction coefficient (default: 0.95) |

**Example**

```javascript
const cam = camera.getComponent('Camera');
cam.offset.x = 100;
cam.offset.speed = 0.05;
```

---

## Static Properties

### [`main`](###main)

Get or set the main `Camera`

| Type | Description |
| --- | --- |
| Camera | The main camera |

**Example**

```javascript
// Get main camera
const mainCamera = Camera.main;

// Set main camera
Camera.main = viewport;
```

---

## Methods

### [`preview()`](###preview())

Preview the component in the editor

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| self | Object | The container object |

**Example**

```javascript
// Called automatically by the renderer in inspector mode
camera.getComponent('Camera').preview(camera);
```