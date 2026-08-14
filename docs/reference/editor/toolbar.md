Initialize a new `Toolbar`

```js
import { Toolbar } from '/editor/windows/toolbar.js';

const toolbar = new Toolbar();
```

---

## Methods

### [`changeCurrent(el)`](###changeCurrent())

Select a different tool

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `Element` | The element to select |

---

## Tool Types

The toolbar initializes drag images for the following tools:

| Tool ID | Component | Dimensions |
|---------|-----------|------------|
| circle | `CircleRenderer` | 40x40 |
| rectangle | `RectangleRenderer` | 40x40 |
| light | `Light` | 40x40 |
| particle | — | 40x40 |

---

## Behavior

### Initialization

On construction, the toolbar:
1. Finds all elements with class `.tool`
2. Creates a visual representation for each tool
3. Sets up drag events with custom drag images

### Drag Events

Each tool element:
- Is draggable
- Has a `dragstart` event that transfers the tool ID
- Uses a custom drag image (pre-rendered object with component)

---

## Notes

- Tools are draggable to the canvas to create objects
- Each tool creates an `Object` with its corresponding component
- Drag image is centered on cursor (offset by half width/height)
- The `current` property tracks the active tool
- Active tool receives `.active` CSS class
