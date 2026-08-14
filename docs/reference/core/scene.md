Initialize a new `Scene`

```js
import { Scene } from '/src/core/scene.js';

const scene = new Scene('Main Scene');
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| name | `string` | The `Scene` name |

---

## Properties

### [`name`](###name)

Get the `Scene` name

**Parameters**

| Name | Type |
|------|------|
| name | `number` |

**Example**

```js
const scene = new Scene('Main Scene');
const sceneName = scene.name; // 'Main Scene'
```

### [`objects`](###objects)

Contains all `Scene` objects

**Parameters**

| Name | Type |
|------|------|
| objects | `Array` |

**Example**

```js
for (let id in scene.objects) {
    const obj = scene.objects[id];
    obj.getActive(true);
}
```

### [`events`](###events)

Contains all `Scene` events
> *Do not use this property directly.*

**Parameters**

| Name | Type |
|------|------|
| events | `Array` |

### [`current`](###current)

Get current object

**Parameters**

| Name | Type |
|------|------|
| currentObject | `Object` |

**Example**

```js
let current_object = scene.current;
```

### [`camera`](###camera)

Get active `Scene` camera

**Parameters**

| Name | Type |
|------|------|
| camera | `Camera` |

**Example**

```js
let camera = scene.camera;
```

### [`main`](###main)

Get current `Scene`

**Parameters**

| Name | Type |
|------|------|
| main | `Scene` |

**Example**

```js
const scene = Scene.main;
```

### [`ctx`](###ctx)

The `CanvasRenderingContext2D` of the `Renderer`

**Parameters**

| Name | Type |
|------|------|
| ctx | `HTMLCanvasElement` |

**Example**

```js
const ctx = renderer.ctx;
```

### [`main`](###main)

Get current `Renderer`

**Parameters**

| Name | Type |
|------|------|
| main | `Renderer` |

**Example**

```js
const currentRenderer = renderer.main;
```

---

## Methods

### [`add()`](###add())

Add a new `Object` to `Scene`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| obj | `Object` | The object to add |
| dispatch | `boolean` | Dispatch the evenement |

**Example**

```js
let obj = new Object();
scene.add(obj);
```

### [`remove()`](###remove())

Remove an `Object` from `Scene`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| obj | `Object` | The object to remove |
| dispatch | `boolean` | Dispatch the evenement |

**Example**

```js
let obj = new Object();
scene.add(obj);
scene.remove(obj);
```

### [`instanciate()`](###instanciate())

Instanciate an `Object` to `Scene`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| obj| `Object` | The object to instantiate |
| dispatch | `boolean` | Dispatch the evenement |

**Example**

```js
let obj = new Object();
scene.instanciate(obj);
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