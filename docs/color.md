Static utility class for color manipulation

```js
import { Color } from '/src/graphics/color.js';
```

---

## Static Methods

### [`componentToHex()`](###componentToHex())

Convert a single color component (0-255) to hexadecimal

**Return**

| Name | Type | Description |
|------|------|-------------|
| hex | `string` | The hexadecimal string (2 characters) |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| c | `number` | The color component (0-255) |

**Exemple**

```js
const hex = Color.componentToHex(255); // 'ff'
const hex2 = Color.componentToHex(15); // '0f'
```

### [`RGBToHex()`](###RGBToHex())

Convert RGB color values to hexadecimal format

**Return**

| Name | Type | Description |
|------|------|-------------|
| hex | `string` | The hexadecimal color string |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| r | `number` | The red component (0-255) |
| g | `number` | The green component (0-255) |
| b | `number` | The blue component (0-255) |

**Exemple**

```js
const hexColor = Color.RGBToHex(255, 128, 64); // '#ff8040'
const white = Color.RGBToHex(255, 255, 255); // '#ffffff'
```

### [`toColor()`](###toColor())

Convert a hexadecimal number to RGB color string

**Return**

| Name | Type | Description |
|------|------|-------------|
| rgb | `string` | The RGB color string |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| hex | `number` | The hexadecimal color number |

**Exemple**

```js
const rgbColor = Color.toColor(0xFF8040); // 'rgb(255,128,64)'
const red = Color.toColor(0xFF0000); // 'rgb(255,0,0)'
```

### [`createAlphaColor()`](###createAlphaColor())

Create a transparent color by adding alpha to an RGB color

**Return**

| Name | Type | Description |
|------|------|-------------|
| rgba | `string` | The RGBA color string |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| color | `string` | The RGB color string |
| opacity | `number` | The opacity value (0-1) |

**Exemple**

```js
const transparent = Color.createAlphaColor('rgb(255,0,0)', 0.5);
// 'rgb(255,0,0, 0.5)'
```
