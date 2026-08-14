Static class for mouse input handling

```js
import { Mouse } from '/src/input/mouse.js';
```

---

## Static Properties

### [`x`](###x)

The current mouse x-coordinate on the canvas

**Parameters**

| Name | Type |
|------|------|
| x | `number` |

**Example**

```js
const mouseX = Mouse.x;
```

### [`y`](###y)

The current mouse y-coordinate on the canvas

**Parameters**

| Name | Type |
|------|------|
| y | `number` |

**Example**

```js
const mouseY = Mouse.y;
```

### [`target`](###target)

The current target element under the mouse

**Parameters**

| Name | Type |
|------|------|
| target | `HTMLElement` |

**Example**

```js
if (Mouse.target === canvas) {
    handleCanvasClick();
}
```

### [`down`](###down)

Indicates if the mouse button is currently down

**Parameters**

| Name | Type |
|------|------|
| down | `boolean` |

### [`up`](###up)

Indicates if the mouse button was just released

**Parameters**

| Name | Type |
|------|------|
| up | `boolean` |

### [`move`](###move)

Indicates if the mouse is currently moving

**Parameters**

| Name | Type |
|------|------|
| move | `boolean` |

**Example**

```js
if (Mouse.move) {
    updateCursor();
}
```

### [`button`](###button)

The last pressed mouse button name

**Parameters**

| Name | Type |
|------|------|
| button | `string` |

**Values**

| Value | Description |
|-------|-------------|
| `'left'` | Left mouse button |
| `'middle'` | Middle mouse button (scroll wheel) |
| `'right'` | Right mouse button |

**Example**

```js
if (Mouse.button === 'right') {
    openContextMenu();
}
```

### [`editor`](###editor)

The mouse position in editor coordinates

**Parameters**

| Name | Type |
|------|------|
| editor | `Object` |

**Properties**

| Name | Type |
|------|------|
| x | `number` |
| y | `number` |

### [`lastPosition`](###lastPosition)

The last recorded mouse position

**Parameters**

| Name | Type |
|------|------|
| lastPosition | `Object` |

**Properties**

| Name | Type |
|------|------|
| x | `number` |
| y | `number` |

### [`offset`](###offset)

The mouse offset values

**Parameters**

| Name | Type |
|------|------|
| offset | `Object` |

**Properties**

| Name | Type |
|------|------|
| x | `number` |
| y | `number` |

### [`world`](###world)

The mouse position in world coordinates

**Parameters**

| Name | Type |
|------|------|
| world | `Object` |

**Properties**

| Name | Type |
|------|------|
| x | `number` |
| y | `number` |

---

## Static Methods

### [`getMousePos()`](###getMousePos())

Get the mouse position relative to the canvas

**Return**

| Name | Type | Description |
|------|------|-------------|
| position | `Object` | Object containing x and y coordinates |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `MouseEvent` | The mouse event |

**Example**

```js
canvas.addEventListener('click', e => {
    const pos = Mouse.getMousePos(e);
    console.log('Clicked at:', pos.x, pos.y);
});
```

### [`setButton()`](###setButton())

Set the button name from button number

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `number` | The button number (0, 1, or 2) |

### [`buttonPressed()`](###buttonPressed())

Check if any mouse button is pressed for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| pressed | `boolean` | True if any button is pressed |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

**Example**

```js
if (Mouse.buttonPressed(player.uid)) {
    player.shoot();
}
```

### [`buttonReleased()`](###buttonReleased())

Check if all mouse buttons are released for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| released | `boolean` | True if no button is pressed |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

### [`buttons()`](###buttons())

Get the buttons state object for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| buttons | `Object` | The buttons state object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

### [`getUserMouse()`](###getUserMouse())

Get the complete mouse state for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| mouse | `Object` | The user's mouse state |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

---

## Events

The Mouse class dispatches events through the System:

### `mousedown`

Dispatched when a mouse button is pressed

**Data**

| Name | Type | Description |
|------|------|-------------|
| button | `number` | The button number |

### `mouseup`

Dispatched when a mouse button is released

**Data**

| Name | Type | Description |
|------|------|-------------|
| button | `number` | The button number |

### `mousemove`

Dispatched when the mouse moves

**Example**

```js
System.addEventListener('mousedown', button => {
    if (button === 0) {
        handleLeftClick();
    }
});

System.addEventListener('mousemove', () => {
    updateHoverState();
});
```

---

## See Also

- [Keyboard](https://github.com/Sharkou/PixelCreator/wiki/Keyboard) – Keyboard input
- [Gamepad](https://github.com/Sharkou/PixelCreator/wiki/Gamepad) – Gamepad input
