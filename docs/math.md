Static utility class for mathematical functions

```js
// Math extensions are added to the global Math object
```

---

## Static Methods

### [`Math.lerp()`](###Math.lerp())

Linear interpolation between two values

**Return**

| Name | Type | Description |
|------|------|-------------|
| result | `number` | The interpolated value |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| value1 | `number` | Start value |
| value2 | `number` | End value |
| amount | `number` | Interpolation factor (0-1) |

**Exemple**

```js
// Smoothly move from 0 to 100
const position = Math.lerp(0, 100, 0.5); // 50

// Smooth camera follow
camera.x = Math.lerp(camera.x, target.x, 0.1);
camera.y = Math.lerp(camera.y, target.y, 0.1);
```

---

## Usage

### Smooth Movement

```js
class SmoothFollow {
    update(self) {
        const target = Scene.main.getObjectByName('Player');
        
        // Smoothly interpolate position
        self.x = Math.lerp(self.x, target.x, 0.05);
        self.y = Math.lerp(self.y, target.y, 0.05);
    }
}
```

### Fade Effects

```js
class FadeIn {
    constructor() {
        this.opacity = 0;
        this.targetOpacity = 1;
    }
    
    update(self) {
        this.opacity = Math.lerp(this.opacity, this.targetOpacity, 0.02);
    }
    
    draw(self) {
        Graphics.rect(self.x, self.y, self.width, self.height);
        Graphics.fill(this.color, this.opacity);
    }
}
```

### Color Transitions

```js
function lerpColor(color1, color2, t) {
    const r = Math.lerp(color1.r, color2.r, t);
    const g = Math.lerp(color1.g, color2.g, t);
    const b = Math.lerp(color1.b, color2.b, t);
    return { r, g, b };
}
```

### Value Clamping

The `lerp` function automatically clamps the `amount` parameter between 0 and 1:

```js
Math.lerp(0, 100, -0.5); // Returns 0 (clamped)
Math.lerp(0, 100, 1.5);  // Returns 100 (clamped)
Math.lerp(0, 100, 0.5);  // Returns 50
```
