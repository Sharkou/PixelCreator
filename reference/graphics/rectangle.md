Initialize a new `RectangleRenderer` component

```js
import { RectangleRenderer } from '/src/graphics/rectangle.js';

const rect = new RectangleRenderer('#ff0000', 1, true);
obj.addComponent(rect);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| color | `string` | The fill/stroke color (default: '#000000') |
| opacity | `number` | The opacity (0-1, default: 1) |
| fill | `boolean` | Fill the shape (default: true) |

---

## Properties

### [`color`](###color)

The color of the rectangle

**Parameters**

| Name | Type |
|------|------|
| color | `string` |

**Example**

```js
rectRenderer.color = '#3498db';
```

### [`opacity`](###opacity)

The opacity of the rectangle

**Parameters**

| Name | Type |
|------|------|
| opacity | `number` |

**Example**

```js
rectRenderer.opacity = 0.7;
```

### [`fill`](###fill)

Whether to fill or stroke the rectangle

**Parameters**

| Name | Type |
|------|------|
| fill | `boolean` |

**Example**

```js
rectRenderer.fill = false; // Draw outline only
```

---

## Methods

### [`draw()`](###draw())

Draw the rectangle

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

---

## Usage

### Filled Rectangle

```js
const obj = new Object('Box', 100, 100, 60, 40);
obj.addComponent(new RectangleRenderer('#e74c3c', 1, true));
```

### Rectangle Outline

```js
const obj = new Object('Frame', 100, 100, 80, 60);
obj.addComponent(new RectangleRenderer('#2ecc71', 1, false));
```

### Semi-Transparent Rectangle

```js
const obj = new Object('Overlay', 100, 100, 200, 100);
obj.addComponent(new RectangleRenderer('#000000', 0.5, true));
```

### UI Element

```js
const button = new Object('Button', 400, 300, 120, 40);
button.addComponent(new RectangleRenderer('#3498db'));

// Add text later for complete button
```

### Platform

```js
const platform = new Object('Platform', 300, 500, 200, 20);
platform.addComponent(new RectangleRenderer('#8e44ad'));
platform.addComponent(new RectCollider(0, 0, true, '#ff0000', 200, 20));
```

---

## See Also

- [Circle](https://github.com/Sharkou/PixelCreator/wiki/Circle) – Circle renderer component
- [Graphics](https://github.com/Sharkou/PixelCreator/wiki/Graphics) – Static drawing methods
- [Color](https://github.com/Sharkou/PixelCreator/wiki/Color) – Color utilities
