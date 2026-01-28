Initialize a new `CircleRenderer` component

```js
import { CircleRenderer } from '/src/graphics/circle.js';

const circle = new CircleRenderer('#ff0000', 1, true);
obj.addComponent(circle);
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

The color of the circle

**Parameters**

| Name | Type |
|------|------|
| color | `string` |

**Exemple**

```js
circleRenderer.color = '#3498db';
```

### [`opacity`](###opacity)

The opacity of the circle

**Parameters**

| Name | Type |
|------|------|
| opacity | `number` |

**Exemple**

```js
circleRenderer.opacity = 0.5;
```

### [`fill`](###fill)

Whether to fill or stroke the circle

**Parameters**

| Name | Type |
|------|------|
| fill | `boolean` |

**Exemple**

```js
circleRenderer.fill = false; // Draw outline only
```

---

## Methods

### [`update()`](###update())

Update the component (currently empty)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

### [`draw()`](###draw())

Draw the circle/ellipse

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| self | `Object` | The parent object |

---

## Usage

### Filled Circle

```js
const obj = new Object('Ball', 100, 100, 50, 50);
obj.addComponent(new CircleRenderer('#e74c3c', 1, true));
```

### Circle Outline

```js
const obj = new Object('Ring', 100, 100, 60, 60);
obj.addComponent(new CircleRenderer('#2ecc71', 1, false));
```

### Semi-Transparent Circle

```js
const obj = new Object('Ghost', 100, 100, 40, 40);
obj.addComponent(new CircleRenderer('#9b59b6', 0.5, true));
```

### Ellipse

The CircleRenderer draws an ellipse when width and height are different:

```js
const obj = new Object('Oval', 100, 100, 80, 40);
obj.addComponent(new CircleRenderer('#f1c40f'));
```
