Initialize a new `Hierarchy`

```js
import { Hierarchy } from '/editor/windows/hierarchy.js';

const hierarchy = new Hierarchy('world-list', scene);
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| node | `HTMLElement` | The HTML element ID |
| scene | `Scene` | The current scene |

---

## Properties

### [`node`](###node)

The hierarchy DOM container element

**Type**

| Name | Type |
|------|------|
| node | `HTMLElement` |

### [`scene`](###scene)

Reference to the current scene

**Type**

| Name | Type |
|------|------|
| scene | `Scene` |

---

## Methods

### [`add(obj)`](###add())

Add object to hierarchy

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to add |

**Example**

```js
hierarchy.add(player);
```

### [`remove(obj)`](###remove())

Remove object from hierarchy

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to remove |

**Example**

```js
hierarchy.remove(enemy);
```

### [`changeCurrent(e)`](###changeCurrent())

Change current selected object

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `HTMLElement` | The object HTML element |

### [`setActive(id)`](###setActive())

Set active object in hierarchy (highlights it)

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| id | `string` | The object ID |

**Example**

```js
hierarchy.setActive(player.id);
```

### [`createView(obj)`](###createView())

Create hierarchy view for an object

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to display |

**Returns:** `HTMLElement` - The list item element

---

## System Events

The `Hierarchy` listens to the following system events:

### `add`

Triggered when an object is added to the scene

### `instantiate`

Triggered when an object is instantiated

### `remove`

Triggered when an object is removed from the scene

### `setCurrentObject`

Triggered when the current object changes

---

## Object View Elements

Each object in the hierarchy has:

- **Icon**: Type-specific icon (camera, cube, image, etc.)
- **Name**: Editable object name
- **Delete button**: Remove the object
- **Visibility toggle**: Show/hide object
- **Lock button**: Lock/unlock object

---

## Interaction

### Mouse Events

- **Click**: Selects the object
- **Double-click**: Centers camera on the object
- **Drag**: Allows reordering in hierarchy
- **Name editing**: Click name to edit (contenteditable)

### Icon Types

| Object Type | Icon Class |
|-------------|-----------|
| object | `far fa-cube` |
| camera | `far fa-camera-movie` |
| prefab | `fad fa-cubes` |
| image | `far fa-image` |
| circle | `far fa-circle` |
| rectangle | `far fa-square` |
| light | `far fa-lightbulb` |
| particle | `fad fa-sun-dust` |

---

## Notes

- Automatically updates when objects are added/removed from the scene
- Integrates with `Sorter` for drag-and-drop reordering
- Creates thumbnail image for each object if not already present
- Active object gets `.active` CSS class
- Name editing validates on Enter key press
