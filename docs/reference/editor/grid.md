Static class for grid rendering

```js
import { Grid } from '/editor/misc/grid.js';
```

---

## Static Properties

### [`dt`](###dt)

Grid cell size (spacing between major lines)

**Type**

| Name | Type |
|------|------|
| dt | `number` |

**Default:** `50`

### [`length`](###length)

Grid length (width)

**Type**

| Name | Type |
|------|------|
| length | `number` |

**Default:** `400`

### [`height`](###height)

Grid height

**Type**

| Name | Type |
|------|------|
| height | `number` |

**Default:** `400`

### [`dashLimit`](###dashLimit)

Limit for showing dashed lines

**Type**

| Name | Type |
|------|------|
| dashLimit | `number` |

**Default:** `3500`

### [`dashfull`](###dashfull)

Length of dash stroke

**Type**

| Name | Type |
|------|------|
| dashfull | `number` |

**Default:** `4`

### [`dashvoid`](###dashvoid)

Length of dash gap

**Type**

| Name | Type |
|------|------|
| dashvoid | `number` |

**Default:** `2`

### [`dashtotal`](###dashtotal)

Total dash length (stroke + gap)

**Type**

| Name | Type |
|------|------|
| dashtotal | `number` |

**Calculated:** `dashfull + dashvoid`

### [`lineWidth`](###lineWidth)

Grid line width

**Type**

| Name | Type |
|------|------|
| lineWidth | `number` |

**Default:** `1`

### [`gap`](###gap)

Gap adjustment for crisp lines

**Type**

| Name | Type |
|------|------|
| gap | `number` |

**Calculated:** `(lineWidth % 2 == 0) ? 0 : 0.5`

### [`active`](###active)

Grid visibility toggle

**Type**

| Name | Type |
|------|------|
| active | `boolean` |

**Default:** `true`

---

## Static Methods

### [`draw(ctx)`](###draw())

Draw the grid on the canvas

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |

**Example**

```js
Grid.draw(ctx);
```

**Behavior:**
- Saves canvas state
- Scales with camera zoom
- Draws vertical and horizontal lines
- Creates subdivisions every 10 pixels
- Adjusts for camera position
- Restores canvas state

---

## Grid Structure

### Major Lines

Spaced at `dt` pixels (default: 50px)
- Semi-transparent white
- Accounts for camera position and zoom

### Subdivisions

Every 10 pixels between major lines
- Creates a finer grid pattern

---

## Camera Integration

The grid:
- Scales with `camera.scale`
- Offsets by `camera.x` and `camera.y`
- Uses modulo to maintain consistent grid alignment when panning

---

## Toggle Button

The module sets up a grid toggle button:

```js
document.getElementById('gridBtn')
```

- Click to toggle `Grid.active`
- Adds/removes `.active` CSS class

---

## Notes

- Grid is infinite (extends beyond visible area)
- Performance optimization: may disable dashing when grid is very large
- Lines use sub-pixel positioning for crisp rendering
- Grid respects camera transformations
