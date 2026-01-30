Dynamic light component for creating illumination effects.

```javascript
import { Light } from '/src/core/mod.js';

new Light(color, opacity, radius)
```

---

## Parameters

| Name | Type | Default | Description |
|-----------|------|---------|-------------|
| `color` | string | `'#FFFFFF'` | The light color |
| `opacity` | number | `1` | The light opacity (0-1) |
| `radius` | number | `20` | The light radius in pixels |

---

## Properties

| Property | Type | Description |
|----------|------|-------------|
| `color` | string | The light color (hex format) |
| `opacity` | number | The light opacity (0 to 1) |
| `radius` | number | The light radius in pixels |

---

## Methods

### update(self)

Updates the object's dimensions based on the light radius.

```javascript
update(self) {
    self.width = this.radius * 2;
    self.height = this.radius * 2;
}
```

### draw(self)

Renders the light using `Graphics.light()`.

```javascript
draw(self) {
    Graphics.light(self.x, self.y, this.radius);
}
```

---

## Example

```javascript
import { Object, Light } from '/src/core/mod.js';

// Create a torch with warm light
const torch = new Object('Torch', 100, 100, 40, 40);
torch.addComponent(new Light('#FFAA00', 0.8, 50));
scene.add(torch);

// Create a cool ambient light
const ambient = new Object('AmbientLight', 200, 200, 80, 80);
ambient.addComponent(new Light('#88CCFF', 0.5, 100));
scene.add(ambient);
```

---

## Rendering Details

The light effect uses:
- `globalCompositeOperation: 'lighter'` for additive blending
- Radial gradient with multiple color stops for smooth falloff
- Subtle flickering animation based on `Date.now()`

---

## See Also

- [Graphics](https://github.com/Sharkou/PixelCreator/wiki/Graphics) – Static drawing methods
- [Color](https://github.com/Sharkou/PixelCreator/wiki/Color) – Color utilities