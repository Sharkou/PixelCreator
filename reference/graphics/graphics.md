Static class for 2D graphics rendering

```js
import { Graphics } from '/src/graphics/graphics.js';
```

---

## Static Properties

### [`ctx`](###ctx)

The current canvas rendering context

**Parameters**

| Name | Type |
|------|------|
| ctx | `CanvasRenderingContext2D` |

---

## Static Methods

### [`initContext()`](###initContext())

Initialize or update the canvas context

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |

**Example**

```js
const canvas = document.getElementById('canvas');
Graphics.initContext(canvas.getContext('2d'));
```

### [`fill()`](###fill())

Fill the current path with a color

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| color | `string` | The fill color |
| opacity | `number` | The opacity (0-1, default: 1) |

**Example**

```js
Graphics.rect(100, 100, 50, 50);
Graphics.fill('#ff0000', 0.8);
```

### [`stroke()`](###stroke())

Stroke the current path with a color

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| color | `string` | The stroke color |
| opacity | `number` | The opacity (0-1, default: 1) |
| width | `number` | The line width (default: 1) |

**Example**

```js
Graphics.circle(100, 100, 25);
Graphics.stroke('#00ff00', 1, 2);
```

### [`point()`](###point())

Draw a point (pixel)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | The x-coordinate |
| y | `number` | The y-coordinate |

### [`line()`](###line())

Draw a line between two points

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x1 | `number` | Start x-coordinate |
| y1 | `number` | Start y-coordinate |
| x2 | `number` | End x-coordinate |
| y2 | `number` | End y-coordinate |

**Example**

```js
Graphics.line(0, 0, 100, 100);
Graphics.stroke('#ffffff');
```

### [`circle()`](###circle())

Draw a circle

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| r | `number` | Radius |

**Example**

```js
Graphics.circle(100, 100, 50);
Graphics.fill('#0000ff');
```

### [`ellipse()`](###ellipse())

Draw an ellipse

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| rx | `number` | Horizontal radius |
| ry | `number` | Vertical radius |

**Example**

```js
Graphics.ellipse(100, 100, 60, 30);
Graphics.fill('#ff00ff');
```

### [`rect()`](###rect())

Draw a rectangle (centered)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| width | `number` | Width |
| height | `number` | Height |

**Example**

```js
Graphics.rect(100, 100, 80, 60);
Graphics.fill('#ffff00');
```

### [`image()`](###image())

Draw an image (centered, natural size)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| image | `HTMLImageElement` | The image to draw |
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| scaleX | `number` | Horizontal scale (default: 1) |
| scaleY | `number` | Vertical scale (default: 1) |

**Example**

```js
Graphics.image(playerSprite, player.x, player.y);
Graphics.image(bigBoss, boss.x, boss.y, 2, 2); // Double size
```

### [`imageBox()`](###imageBox())

Draw an image scaled to fit a box

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| image | `HTMLImageElement` | The image to draw |
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| scaleX | `number` | Additional horizontal scale (default: 1) |
| scaleY | `number` | Additional vertical scale (default: 1) |
| boxX | `number` | Box width (default: 40) |
| boxY | `number` | Box height (default: 40) |

**Example**

```js
// Draw image fitted to 64x64 box
Graphics.imageBox(sprite, 100, 100, 1, 1, 64, 64);
```

### [`light()`](###light())

Draw a dynamic light effect

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Center x-coordinate |
| y | `number` | Center y-coordinate |
| radius | `number` | Light radius |

**Example**

```js
Graphics.light(torch.x, torch.y, 100);
```

---

## Usage

### Custom Renderer Component

```js
export class CustomShape {
    constructor(color = '#ff0000') {
        this.color = color;
    }
    
    draw(self) {
        // Draw a custom shape
        Graphics.rect(self.x, self.y, self.width, self.height);
        Graphics.fill(this.color);
        
        // Add border
        Graphics.rect(self.x, self.y, self.width, self.height);
        Graphics.stroke('#000000', 1, 2);
    }
}
```

### Drawing Multiple Shapes

```js
draw(self) {
    // Body
    Graphics.rect(self.x, self.y, 40, 60);
    Graphics.fill('#3498db');
    
    // Head
    Graphics.circle(self.x, self.y - 40, 20);
    Graphics.fill('#f1c40f');
    
    // Eyes
    Graphics.circle(self.x - 8, self.y - 45, 4);
    Graphics.fill('#2c3e50');
    Graphics.circle(self.x + 8, self.y - 45, 4);
    Graphics.fill('#2c3e50');
}
```
