Static class for ruler rendering

```js
import { Ruler } from '/editor/misc/ruler.js';
```

---

## Static Properties

### [`rulerOffset`](###rulerOffset)

Ruler width/height offset

**Type**

| Name | Type |
|------|------|
| rulerOffset | `number` |

**Default:** `45`

### [`spacing`](###spacing)

Spacing between ruler graduations

**Type**

| Name | Type |
|------|------|
| spacing | `number` |

**Default:** `40`

### [`active`](###active)

Ruler visibility toggle

**Type**

| Name | Type |
|------|------|
| active | `boolean` |

**Default:** `true`

---

## Static Methods

### [`update(ctx, x, y)`](###update())

Draw ruler with cursor position

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |
| x | `number` | Cursor X position |
| y | `number` | Cursor Y position |

**Example**

```js
Ruler.update(ctx, mouseX, mouseY);
```

**Behavior:**
- Draws cursor indicators on top and left rulers
- Shows pixel coordinates at cursor position
- Accounts for camera position and scale
- Uses blue color for cursor (`#339af0`)

### [`resize()`](###resize())

Resize rulers to match scene dimensions

**Example**

```js
Ruler.resize();
```

---

## Visual Elements

### Top Ruler

- Vertical line at cursor X position
- Text showing X coordinate in pixels
- Font: `bold 11px monospace`
- Color: `#339af0`

### Left Ruler

- Horizontal line at cursor Y position
- Text showing Y coordinate in pixels
- Font: `bold 11px monospace`
- Color: `#339af0`

### Coordinate Calculation

Coordinates account for camera:

```js
xPos = Math.floor(x / camera.scale + camera.x)
yPos = Math.floor(y / camera.scale + camera.y)
```

---

## Toggle Button

The module sets up a ruler toggle button:

```js
document.getElementById('rulerBtn')
```

- Click to toggle `Ruler.active`
- Adds/removes `.active` CSS class

---

## Notes

- Rulers show world coordinates (not screen coordinates)
- Coordinates are rounded to integers
- Cursor lines are 2px wide
- Text is centered and positioned near cursor
- Currently, graduation marks are commented out in the code
