Static class for time management

```js
import { Time } from '/src/time/time.js';
```

---

## Static Properties

### [`deltaTime`](###deltaTime)

The time elapsed since the last frame in milliseconds

**Parameters**

| Name | Type |
|------|------|
| deltaTime | `number` |

**Exemple**

```js
// Move object at consistent speed regardless of frame rate
player.x += speed * Time.deltaTime;
```

### [`current`](###current)

The current timestamp in milliseconds

**Parameters**

| Name | Type |
|------|------|
| current | `number` |

**Exemple**

```js
const currentTime = Time.current;
```

### [`last`](###last)

The timestamp of the last frame

**Parameters**

| Name | Type |
|------|------|
| last | `number` |

---

## Static Methods

### [`now()`](###now())

Get the current high-resolution timestamp

**Return**

| Name | Type | Description |
|------|------|-------------|
| current | `DOMHighResTimeStamp` | The current time in milliseconds |

**Exemple**

```js
const startTime = Time.now();
// ... some operation
const endTime = Time.now();
const elapsed = endTime - startTime;
console.log('Operation took', elapsed, 'ms');
```

---

## Usage

### Frame-Independent Movement

Use `deltaTime` to ensure consistent movement speed across different frame rates:

```js
class Player {
    update(self) {
        // Move at 100 units per second, regardless of FPS
        const speed = 100;
        self.x += speed * Time.deltaTime;
    }
}
```

### Time-Based Events

```js
class Cooldown {
    constructor(duration) {
        this.duration = duration;
        this.lastTrigger = 0;
    }

    canTrigger() {
        return Time.now() - this.lastTrigger >= this.duration;
    }

    trigger() {
        this.lastTrigger = Time.now();
    }
}
```

### Animation Timing

```js
class Animation {
    constructor(speed = 100) {
        this.speed = speed;
        this.lastFrame = Time.now();
    }

    update() {
        if (Time.now() - this.lastFrame >= this.speed) {
            this.nextFrame();
            this.lastFrame = Time.now();
        }
    }
}
```
