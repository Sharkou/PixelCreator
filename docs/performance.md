Static class for performance monitoring

```js
import { Performance } from '/src/time/performance.js';
```

---

## Static Properties

### [`lastCalledTime`](###lastCalledTime)

The timestamp of the last update call

**Parameters**

| Name | Type |
|------|------|
| lastCalledTime | `number` |

### [`fps`](###fps)

The current frames per second

**Parameters**

| Name | Type |
|------|------|
| fps | `number` |

**Exemple**

```js
console.log('Current FPS:', Performance.fps);
```

### [`timer`](###timer)

Internal timer for FPS calculation

**Parameters**

| Name | Type |
|------|------|
| timer | `number` |

### [`delta`](###delta)

The time delta since the last frame in seconds

**Parameters**

| Name | Type |
|------|------|
| delta | `number` |

**Exemple**

```js
const frameDelta = Performance.delta;
```

---

## Static Methods

### [`update()`](###update())

Update the performance metrics (call once per frame)

| Return |
|--------|
| `void` |

**Exemple**

```js
function gameLoop() {
    Performance.update();
    // ... game logic
    requestAnimationFrame(gameLoop);
}
```

### [`smooth()`](###smooth())

Smooth the FPS value (caps at 60 if near 50+)

| Return |
|--------|
| `void` |

> This method is called automatically by `update()`.

### [`display()`](###display())

Display the FPS counter on a canvas

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |

**Exemple**

```js
function render() {
    // ... render game
    Performance.display(ctx);
}
```

---

## Usage

### Basic Performance Monitoring

```js
function gameLoop() {
    Performance.update();
    
    // Check for performance issues
    if (Performance.fps < 30) {
        console.warn('Low FPS detected:', Performance.fps);
    }
    
    // ... render
    Performance.display(ctx);
    
    requestAnimationFrame(gameLoop);
}
```

### Frame-Based Logic

```js
function update() {
    Performance.update();
    
    // Use delta for smooth animations
    player.x += velocity * Performance.delta;
}
```
