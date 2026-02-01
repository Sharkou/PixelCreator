Initialize a new `Handler`

```js
import { Handler } from '/editor/system/handler.js';

const handler = new Handler(scene, camera, renderer, project);
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| scene | `Scene` | The current scene |
| camera | `Camera` | The renderer camera |
| renderer | `Renderer` | The current renderer |
| project | `Project` | The project reference |

---

## Properties

### [`canvas`](###canvas)

Reference to the renderer canvas element

**Type**

| Name | Type |
|------|------|
| canvas | `HTMLCanvasElement` |

### [`ctx`](###ctx)

Canvas 2D rendering context

**Type**

| Name | Type |
|------|------|
| ctx | `CanvasRenderingContext2D` |

### [`drag`](###drag)

Indicates if an object is being dragged

**Type**

| Name | Type |
|------|------|
| drag | `boolean` |

### [`resizeObject`](###resizeObject)

Indicates if an object is being resized

**Type**

| Name | Type |
|------|------|
| resizeObject | `boolean` |

### [`moveCamera`](###moveCamera)

Indicates if the camera is being moved

**Type**

| Name | Type |
|------|------|
| moveCamera | `boolean` |

### [`lastX`](###lastX)

Last X coordinate for resize operations

**Type**

| Name | Type |
|------|------|
| lastX | `number` |

### [`lastY`](###lastY)

Last Y coordinate for resize operations

**Type**

| Name | Type |
|------|------|
| lastY | `number` |

### [`lastWidth`](###lastWidth)

Last width of object being resized

**Type**

| Name | Type |
|------|------|
| lastWidth | `number` |

### [`lastHeight`](###lastHeight)

Last height of object being resized

**Type**

| Name | Type |
|------|------|
| lastHeight | `number` |

---

## Events

The `Handler` sets up the following canvas event listeners:

### `dragover`

Handles drag-over events on the canvas

### `drop`

Handles dropping objects onto the canvas. Supports:
- Primitive shapes (circle, rectangle)
- Objects
- Lights
- Cameras
- Particles
- Resources (images, prefabs)

When a resource is dropped:
- Creates a new `Object` at the mouse position
- Sets appropriate dimensions (40x40 for primitives, natural size for images)
- Adds the corresponding component
- For images: loads the texture and sets object dimensions to image size
- For prefabs: duplicates the prefab's components and structure

---

## Notes

- `Handler` manages all canvas interactions for the editor
- Coordinates are transformed based on camera position and scale
- Object creation via drop uses `Mouse.x` and `Mouse.y` divided by camera scale and offset by camera position
- Images are loaded with their natural dimensions
- The handler integrates with the drag-and-drop system (`Dnd`)
