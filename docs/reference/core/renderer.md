Initialize a new `Renderer`

```js
import { Renderer } from '/src/core/renderer.js';

const renderer = new Renderer();
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| width | `number` | `Renderer` width |
| height | `number` | `Renderer` height  |
| parent | `Element` | The DOM `Element` parent of `Renderer` |
| pause | `boolean` | Is the game paused? |
| inspector | `boolean` | Are we in the editor's inspector? |

---

## Properties

### [`width`](###width)

Get `Renderer` width

**Parameters**

| Name | Type |
|------|------|
| width | `number` |

**Example**

```js
const width = renderer.width;
```

### [`height`](###height)

Get `Renderer` height

**Parameters**

| Name | Type |
|------|------|
| height | `number` |

**Example**

```js
const height = renderer.height;
```

### [`ratio`](###ratio)

The ratio of the `Renderer` relative to the `Camera`

**Parameters**

| Name | Type |
|------|------|
| ratio | `number` |

**Example**

```js
const ratio = renderer.ratio;
```

### [`parent`](###parent)

The `Renderer` DOM `Element` parent

**Parameters**

| Name | Type |
|------|------|
| parent | `Element` |

**Example**

```js
const canvas = document.getElementById('canvas');
const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas);
console.log(renderer.parent); // return canvas
```

### [`pause`](###pause)

Return `true` if the game `Renderer` is paused

**Parameters**

| Name | Type |
|------|------|
| pause | `boolean` |

### [`canvas`](###canvas)

The `HTMLCanvasElement` of the `Renderer`

**Parameters**

| Name | Type |
|------|------|
| canvas | `HTMLCanvasElement` |

```js
const canvas = renderer.canvas;
```

### [`ctx`](###ctx)

The `CanvasRenderingContext2D` of the `Renderer`

**Parameters**

| Name | Type |
|------|------|
| ctx | `HTMLCanvasElement` |

```js
const ctx = renderer.ctx;
```

### [`main`](###main)

Get current `Renderer`

**Parameters**

| Name | Type |
|------|------|
| main | `Renderer` |

```js
const currentRenderer = renderer.main;
```

---

## Methods

### [`createCanvas()`](###createCanvas())

Create `Canvas` from layer

**Return**

| Name | Type | Description |
|------|------|--------|
| canvas | `HTMLCanvasElement` | The created canvas |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| id | `string` | The `HTMLCanvasElementID` |
| zIndex | `number` | The z-index of the `HTMLCanvasElement` |

### [`init()`](###init())

Initialize the `Renderer`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| scene | `Scene` | The renderer scene |
| camera | `Camera` | The renderer camera |

**Example**

```js
const renderer = new Renderer(canvas.clientWidth, canvas.clientHeight, canvas);
const scene = new Scene('Main Scene');
const camera = new Object('Viewport', 0, 0, canvas.clientWidth, canvas.clientHeight)
    .addComponent(new Camera('#272727'));

renderer.init(scene, camera);
```

### [`render()`](###render())

Render the `Scene`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| scene | `Scene` | The renderer scene |
| camera | `Camera` | The renderer camera |

**Example**

```js
function loop() {
    window.requestAnimationFrame(loop);    
    renderer.render(scene, camera);
}
```

### [`clear()`](###clear())

Clear the `canvas`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| color | `string` | The clear color |

**Example**

```js
renderer.clear('#000000');
```

### [`resize()`](###resize())

Resize the `canvas`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| width | `number` | The resize width |
| height | `number` | The resize height |

**Example**

```js
window.onresize = function() {
    renderer.resize(canvas.clientWidth, canvas.clientHeight);
};
```