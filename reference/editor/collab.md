Collaboration system for real-time editing

```js
// Collab is a global object
```

---

## Properties

### [`friends`](###friends)

Array of connected collaborators

**Type**

| Name | Type |
|------|------|
| friends | `Array<{name: string, x: number, y: number}>` |

### [`me`](###me)

Local user cursor data

**Type**

| Name | Type |
|------|------|
| me | `{name: string, x: number, y: number}` |

**Default:**

```js
{
  name: 'Sharkou',
  x: 80,
  y: 60
}
```

### [`canvas`](###canvas)

Collaboration overlay canvas element

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

### [`color`](###color)

Cursor dot color

**Type**

| Name | Type |
|------|------|
| color | `string` |

**Default:** `'rgba(240, 220, 220, 0.5)'`

---

## Methods

### [`draw()`](###draw())

Draw all collaborator cursors

**Example**

```js
Collab.draw();
```

**Behavior:**
- Clears the canvas
- Draws a circle for each collaborator cursor
- Uses the `color` property for fill

### [`clear()`](###clear())

Clear the collaboration canvas

**Example**

```js
Collab.clear();
```

---

## Socket Events

The collaboration system listens to WebSocket events:

### `message`

Receives general messages

```js
socket.on('message', function(message) {
  console.log(message);
});
```

### `add`

Adds a new object to the scene

```js
socket.on('add', function(o) {
  // Parse and instantiate object
  // Add to scene
});
```

### `updateName`

Updates an object's name

```js
socket.on('updateName', function(s) {
  // Format: 'objectId-newName'
  // Updates object name in scene
});
```

---

## Canvas Setup

The collaboration canvas:
- Sized to window dimensions
- Positioned absolutely
- Z-index: 10 (above content)
- Pointer events disabled (transparent to clicks)

---

## Mouse Tracking

Tracks mouse movement to update local user position:

```js
Collab.canvas.addEventListener('mousemove', function(e) {
  // Updates Collab.me.x and Collab.me.y
});
```

---

## Notes

- Requires Socket.IO connection
- Currently uses global `socket` object
- Cursor positions are shared in real-time
- Each collaborator is represented by a circular cursor
- The local user is included in the `friends` array
- Objects created by collaborators are automatically instantiated
- Name updates are synchronized across all clients
