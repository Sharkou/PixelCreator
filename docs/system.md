Core `System` static class synchronizing the engine

```js
import { System } from '/src/core/system.js';
```

---

## Static Properties

### [`events`](###events)

Contains all registered events

> Do not use this static property directly.

**Parameters**

| Name | Type |
|------|------|
| events | `Object` |

---

## Static Methods

### [`createID()`](###createID())

Create a unique identifier

**Return**

| Name | Type | Description |
|------|------|-------------|
| ID | `string` | The unique identifier |

**Exemple**

```js
let obj = new Object();
obj.id = System.createID(); // reset ID
```

### [`random()`](###random())

Generate a random number between a and b

**Return**

| Name | Type | Description |
|------|------|-------------|
| random | `number` | The generated random number |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| a | `number` | The minimum value |
| b | `number` | The maximum value |

**Exemple**

```js
const rng = System.random(0, 10);
```

### [`sync()`](###sync())

Synchronize an object or component properties for event dispatching

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| object | `Object` | The object to sync |
| component | `Component` | The component to sync (optional) |

**Exemple**

```js
System.sync(myObject);
System.sync(myObject, myComponent);
```

### [`createFile()`](###createFile())

Create a file object

**Return**

| Name | Type | Description |
|------|------|-------------|
| file | `File` | The created file |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| name | `string` | The name of the file |
| type | `string` | The MIME type |
| path | `string` | The path (default: '/') |
| data | `Blob` | The data (optional) |

**Exemple**

```js
const file = System.createFile('script.js', 'text/javascript', '/scripts/');
```

### [`validate()`](###validate())

Validate input text on Enter key press

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `HTMLElement` | The input element |
| event | `KeyboardEvent` | The keyboard event |

**Exemple**

```js
input.addEventListener('keydown', e => System.validate(input, e));
```

### [`dispatchEvent()`](###dispatchEvent())

Dispatch an event to all registered listeners

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `string` | The event name |
| data | `object` | The data to pass (optional) |

**Exemple**

```js
System.dispatchEvent('playerDied', { player: player });
```

### [`addEventListener()`](###addEventListener())

Register an event listener

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `string` | The event name |
| fn | `function` | The callback function |
| args | `...any` | Additional arguments (optional) |

**Exemple**

```js
System.addEventListener('playerDied', data => {
    console.log('Player died:', data.player.name);
});
```

### [`setIntervalX()`](###setIntervalX())

Set an interval with a limited number of repetitions

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| callback | `function` | The callback function |
| delay | `number` | The delay in milliseconds |
| repetitions | `number` | The number of repetitions |

**Exemple**

```js
System.setIntervalX(() => {
    console.log('Tick!');
}, 1000, 5); // Runs 5 times
```

### [`include()`](###include())

Include an external JavaScript module

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| url | `string` | The script URL |

**Exemple**

```js
System.include('/plugins/myPlugin.js');
```

### [`stringify()`](###stringify())

Stringify an object including functions

**Return**

| Name | Type | Description |
|------|------|-------------|
| json | `string` | The JSON string |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| o | `object` | The object to stringify |

**Exemple**

```js
const json = System.stringify(myObject);
```

### [`parse()`](###parse())

Parse a JSON string including functions

**Return**

| Name | Type | Description |
|------|------|-------------|
| object | `object` | The parsed object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| o | `string` | The JSON string to parse |

**Exemple**

```js
const obj = System.parse(jsonString);
```

### [`getDate()`](###getDate())

Get the current date formatted as `[YYYY-MM-DD HH:mm:ss.SSS]`

**Return**

| Name | Type | Description |
|------|------|-------------|
| date | `string` | The formatted date string |

**Exemple**

```js
console.log(System.getDate()); // [2026-01-28 14:30:45.123]
```

### [`log()`](###log())

Log a message with blue color styling

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| string | `string` | The message to log |

**Exemple**

```js
System.log('Game started');
```

### [`debug()`](###debug())

Log a debug message with green color styling and [SERVER] prefix

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| string | `string` | The message to log |

**Exemple**

```js
System.debug('Player connected');
```

### [`warn()`](###warn())

Log a warning message with yellow color styling

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| string | `string` | The warning message |

**Exemple**

```js
System.warn('Low memory');
```
