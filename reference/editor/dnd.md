Static class for drag-and-drop management

```js
import { Dnd } from '/editor/system/dnd.js';
```

---

## Static Properties

### [`draggedElement`](###draggedElement)

Currently dragged DOM element

**Type**

| Name | Type |
|------|------|
| draggedElement | `Element|null` |

### [`drag`](###drag)

Indicates if a drag operation is active

**Type**

| Name | Type |
|------|------|
| drag | `boolean` |

### [`move`](###move)

Indicates if the mouse is moving

**Type**

| Name | Type |
|------|------|
| move | `boolean` |

### [`hovering`](###hovering)

Indicates if hovering over a draggable element

**Type**

| Name | Type |
|------|------|
| hovering | `boolean` |

### [`resize`](###resize)

Resize direction when resizing objects

**Type**

| Name | Type |
|------|------|
| resize | `string|boolean` |

**Values:** `'right'`, `'left'`, `'top'`, `'bottom'`, `'right-top'`, `'left-bottom'`, `'right-bottom'`, `'left-top'`, or `false`

---

## Static Methods

### [`setCursor(cursor)`](###setCursor())

Set the document cursor style

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| cursor | `string` | Cursor type |

**Example**

```js
Dnd.setCursor('grab');
```

### [`applyDragEvents(el)`](###applyDragEvents())

Apply drag start events to an element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `Element` | The HTML element |

**Example**

```js
const element = document.getElementById('myElement');
Dnd.applyDragEvents(element);
```

### [`applyDropEvents(el)`](###applyDropEvents())

Apply drop zone events to an element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `Element` | The HTML element |

**Example**

```js
const dropZone = document.getElementById('dropZone');
Dnd.applyDropEvents(dropZone);
```

### [`update()`](###update())

Update cursor based on current drag/resize state

**Example**

```js
Dnd.update();
```

---

## Cursor Management

The `update()` method automatically sets the cursor based on state:

- **Resizing:**
  - `ew-resize`: horizontal resize (left/right)
  - `ns-resize`: vertical resize (top/bottom)
  - `nesw-resize`: diagonal resize (right-top/left-bottom)
  - `nwse-resize`: diagonal resize (left-top/right-bottom)

- **Dragging:** `grabbing` when hovering

- **Hovering:** `grab` when hovering over draggable

- **Default:** `default` cursor

---

## Global Event Listeners

The module automatically sets up document-level listeners:

- `mousedown`: Sets `Dnd.drag = true`
- `mouseup`: Sets `Dnd.drag = false`
- `mousemove`: Tracks mouse movement and sets `Dnd.move` (debounced at 100ms)

---

## Notes

- `Dnd` is a static class used throughout the editor
- Automatically adds/removes `.drop_hover` class on drag over/leave events
- Clones dragged elements when dropped into drop zones
- Removes original element after successful drop
- Requires calling `update()` regularly (e.g., in render loop) for cursor updates
