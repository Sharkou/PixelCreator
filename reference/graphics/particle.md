Particle system component for creating visual effects like fire, smoke, sparks, and more.

```javascript
import { Particle } from '/src/core/mod.js';
```

---

## Status

> ⚠️ **Work in Progress** – The particle system is currently being reworked to provide a more flexible, component-based API.

---

## Overview

The Particle system allows you to create dynamic visual effects by simulating many small elements (particles) that follow physics-based rules.

Common use cases:
- Fire and flames
- Smoke and fog
- Sparks and explosions
- Rain and snow
- Magic effects
- Trails and traces

---

## Planned Features

| Feature | Description |
|---------|-------------|
| Emitter shapes | Point, circle, rectangle, line |
| Particle lifetime | Duration before particle disappears |
| Velocity | Initial speed and direction |
| Acceleration | Gravity and forces |
| Color over lifetime | Gradient color transitions |
| Size over lifetime | Growing or shrinking particles |
| Rotation | Spin and angular velocity |
| Blend modes | Additive, multiply, normal |
| Texture support | Custom particle sprites |
| Burst mode | Emit particles in bursts |
| Loop control | One-shot or continuous emission |

---

## Basic Concept

```javascript
// Future API (planned)
import { Object, Particle } from '/src/core/mod.js';

const fire = new Object('Fire', 100, 200, 50, 100);
fire.addComponent(new Particle({
    maxParticles: 200,
    lifetime: 2,
    speed: 50,
    color: '#FF6600',
    size: 10,
    gravity: -20
}));
scene.add(fire);
```

---

## See Also

- [Light](https://github.com/Sharkou/PixelCreator/wiki/Light) – Dynamic lighting effects
- [Graphics](https://github.com/Sharkou/PixelCreator/wiki/Graphics) – Static drawing methods
- [Color](https://github.com/Sharkou/PixelCreator/wiki/Color) – Color utilities