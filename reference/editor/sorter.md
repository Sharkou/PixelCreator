Static class for drag-and-drop list sorting

```js
import { Sorter } from '/editor/misc/sorter.js';
```

---

## Static Properties

### [`draggedElement`](###draggedElement)

Currently dragged element

**Type**

| Name | Type |
|------|------|
| draggedElement | `Element|null` |

### [`list`](###list)

The world list container

**Type**

| Name | Type |
|------|------|
| list | `HTMLElement` |

**Default:** `document.getElementById('world-list')`

### [`x_t0`](###x_t0)

Initial X position for drag tracking

**Type**

| Name | Type |
|------|------|
| x_t0 | `number` |

---

## Static Methods

### [`sort(el)`](###sort())

Attach drag event listeners to an element

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `HTMLElement` | The element to make sortable |

**Example**

```js
Sorter.sort(listItem);
```

### [`allowDrop(e)`](###allowDrop())

Allow drop by preventing default behavior

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `DragEvent` | The drag event |

### [`isBefore(el1, el2)`](###isBefore())

Check if el1 is before el2 in the DOM

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el1 | `HTMLElement` | First element |
| el2 | `HTMLElement` | Second element |

**Returns:** `boolean` - True if el1 is before el2

### [`wrap(el, parent)`](###wrap())

Make an element a child of another (parent-child relationship)

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `HTMLElement` | The element to wrap |
| parent | `HTMLElement` | The new parent element |

**Example**

```js
Sorter.wrap(childElement, parentElement);
```

**Behavior:**
- Updates scene hierarchy (calls `parent.addChild()`)
- Sets element position based on parent position
- Adds `.parent` class to parent element
- Creates unwrap icon if not present

### [`unwrap(el, parent)`](###unwrap())

Remove parent-child relationship

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `HTMLElement` | The child element |
| parent | `HTMLElement` | The current parent element |

**Example**

```js
Sorter.unwrap(childElement, parentElement);
```

**Behavior:**
- Updates scene hierarchy (calls `parent.removeChild()`)
- Resets element position
- Removes `.parent` class from parent
- Removes unwrap icon

### Event Handlers

The `sort()` method attaches these drag event listeners:

- `dragstart`: `Sorter.dragStart()`
- `drag`: `Sorter.drag()`
- `dragenter`: `Sorter.dragEnter()`
- `dragover`: `Sorter.dragOver()`
- `dragleave`: `Sorter.dragLeave()`
- `dragend`: `Sorter.dragEnd()`

---

## Parent-Child Relationships

### Wrapping (Creating Parent)

When an element is dragged onto another:
1. The dropped element becomes a child
2. The target element becomes a parent
3. An unwrap icon (▼) is added to the parent
4. The child's position is indented

### Unwrapping (Removing Parent)

To unwrap:
1. Drag the child element out of the parent
2. Or click the unwrap icon on the parent

---

## Visual Feedback

### Parent Element

- Gets `.parent` CSS class
- Shows unwrap icon (fas fa-sort-down)
- Icon positioned at the beginning of the element

### Child Element

- `data-position` attribute increases
- Visual indentation based on position

---

## Notes

- Works with the scene hierarchy system
- Updates both DOM and scene object relationships
- Elements must have corresponding objects in `Scene.main.objects`
- Position tracking uses `data-position` attribute
- Automatically manages parent/child classes
- Integrates with the hierarchy window
