Initialize a seeded pseudo-random number generator

```js
import { Random } from '/src/math/random.js';

const rng = new Random('my-seed');
```

---

## Parameters

| Name | Type | Description |
|------|------|-------------|
| seedString | `string` \| `number` | The seed string or number |

---

## Properties

### [`seed`](###seed)

The initial seed value (converted to uint32)

**Parameters**

| Name | Type |
|------|------|
| seed | `number` |

**Example**

```js
const seed = rng.seed;
```

### [`state`](###state)

The current state of the generator

**Parameters**

| Name | Type |
|------|------|
| state | `number` |

**Example**

```js
const state = rng.state;
```

### [`permutation`](###permutation)

The permutation table used for Perlin noise (512 values)

**Parameters**

| Name | Type |
|------|------|
| permutation | `Uint8Array` |

**Example**

```js
const perm = rng.permutation;
```

---

## Methods

### [`next()`](###next())

Generate the next pseudo-random number using Mulberry32 algorithm

**Return**

| Name | Type | Description |
|------|------|-------------|
| random | `number` | A random float between 0 (inclusive) and 1 (exclusive) |

**Example**

```js
const value = rng.next(); // 0.0 to 0.999...
```

### [`int()`](###int())

Get a random integer between min and max (inclusive)

**Return**

| Name | Type | Description |
|------|------|-------------|
| randomInt | `number` | The generated random integer |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| min | `number` | The minimum value (default: 0) |
| max | `number` | The maximum value (default: 100) |

**Example**

```js
const dice = rng.int(1, 6); // 1 to 6
const percent = rng.int(0, 100); // 0 to 100
```

### [`float()`](###float())

Get a random float between min and max

**Return**

| Name | Type | Description |
|------|------|-------------|
| randomFloat | `number` | The generated random float |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| min | `number` | The minimum value (default: 0) |
| max | `number` | The maximum value (default: 1) |

**Example**

```js
const value = rng.float(0, 10); // 0.0 to 10.0
const normalized = rng.float(); // 0.0 to 1.0
```

### [`chance()`](###chance())

Determine if an event occurs based on probability

**Return**

| Name | Type | Description |
|------|------|-------------|
| result | `boolean` | True if the event occurs, false otherwise |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| probability | `number` | The probability from 0 to 1 (default: 0.5) |

**Example**

```js
if (rng.chance(0.25)) {
    console.log('25% chance event occurred!');
}
```

### [`pick()`](###pick())

Pick a random element from an array

**Return**

| Name | Type | Description |
|------|------|-------------|
| element | `*` | A random element from the array |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| array | `Array` | The array to pick from |

**Example**

```js
const colors = ['red', 'green', 'blue'];
const color = rng.pick(colors); // 'red', 'green', or 'blue'
```

### [`shuffle()`](###shuffle())

Shuffle an array in place using Fisher-Yates algorithm

**Return**

| Name | Type | Description |
|------|------|-------------|
| array | `Array` | The shuffled array |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| array | `Array` | The array to shuffle |

**Example**

```js
const cards = [1, 2, 3, 4, 5];
rng.shuffle(cards); // [3, 1, 5, 2, 4] (example)
```

### [`gaussian()`](###gaussian())

Generate a random number with Gaussian (normal) distribution using Box-Muller transform

**Return**

| Name | Type | Description |
|------|------|-------------|
| random | `number` | A random number from the normal distribution |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| mean | `number` | The mean of the distribution (default: 0) |
| stdDev | `number` | The standard deviation (default: 1) |

**Example**

```js
const iq = rng.gaussian(100, 15); // IQ distribution
const height = rng.gaussian(170, 10); // Height in cm
```

### [`reset()`](###reset())

Reset the generator to its initial state

**Return**

| Name | Type | Description |
|------|------|-------------|
| this | `Random` | The random instance for chaining |

**Example**

```js
rng.reset(); // Restart the sequence from the beginning
```

### [`noise()`](###noise())

Generate 1D/2D/3D Perlin noise

**Return**

| Name | Type | Description |
|------|------|-------------|
| noise | `number` | Noise value between -1 and 1 |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | X coordinate |
| y | `number` | Y coordinate (default: 0) |
| z | `number` | Z coordinate (default: 0) |

**Example**

```js
// 1D noise
const value1D = rng.noise(x * 0.1);

// 2D noise (terrain, textures)
const value2D = rng.noise(x * 0.05, y * 0.05);

// 3D noise (volumetric, animated)
const value3D = rng.noise(x * 0.1, y * 0.1, time * 0.5);
```

### [`fbm()`](###fbm())

Generate fractal Brownian motion (fBm) noise with multiple octaves

**Return**

| Name | Type | Description |
|------|------|-------------|
| noise | `number` | Noise value approximately between -1 and 1 |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | X coordinate |
| y | `number` | Y coordinate (default: 0) |
| z | `number` | Z coordinate (default: 0) |
| octaves | `number` | Number of octaves (default: 4) |
| lacunarity | `number` | Frequency multiplier per octave (default: 2) |
| persistence | `number` | Amplitude multiplier per octave (default: 0.5) |

**Example**

```js
// Terrain generation
const elevation = rng.fbm(x * 0.02, y * 0.02, 0, 6, 2, 0.5);

// Cloud texture
const cloud = rng.fbm(x * 0.01, y * 0.01, time, 4, 2.5, 0.4);
```

---

## See Also

- [Math](https://github.com/Sharkou/PixelCreator/wiki/Math) – Math utilities
- [System](https://github.com/Sharkou/PixelCreator/wiki/System) – System utilities (includes random)
