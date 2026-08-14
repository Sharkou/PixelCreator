Core `System` static class synchronizing the engine

```javascript
import { System } from '/src/core/system.js';
```

## Static Properties

### events

Get events array

| Type | Description |
| --- | --- |
| Object | The events dictionary |

> ⚠️ Do not use this static property directly.

**Example**

```javascript
System.events[e].push(fn); // add event listener function
```

---

## Static Methods

### createID()

Create unique ID

**Return**

| Type | Description |
| --- | --- |
| string | The unique ID |

**Example**

```javascript
let obj = new Object();
obj.id = System.createID(); // reset ID
```

---

### random()

Generate random number between a and b

**Return**

| Type | Description |
| --- | --- |
| number | The generated random number |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| a | number | The first number |
| b | number | The second number |

**Example**

```javascript
const rng = System.random(0, 10);
```

---

### sync()

Synchronize a component's properties for reactive updates

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| object | Object | The object to sync |
| component | Object | The component to sync (optional) |

**Example**

```javascript
System.sync(obj);
System.sync(obj, component);
```

---

### createFile()

Create a file

**Return**

| Type | Description |
| --- | --- |
| File | The created file |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| name | string | The name of the file |
| type | string | The MIME type |
| path | string | The path (default: '/') |
| data | Blob | The data (default: null) |

**Example**

```javascript
const file = System.createFile('script.js', 'text/javascript', '/', 'console.log("Hello")');
```

---

### validate()

Validate input text (blur on Enter key)

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| e | HTMLElement | The element to blur |
| event | KeyboardEvent | The keyboard event |

**Example**

```javascript
input.addEventListener('keydown', (event) => System.validate(input, event));
```

---

### dispatchEvent()

Dispatch event to all listeners

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| e | string | The event name |
| data | Object | The data to pass (default: null) |

**Example**

```javascript
System.dispatchEvent('add', obj);
System.dispatchEvent('setProperty', { object, component, prop, value });
```

---

### addEventListener()

Listen to an event

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| e | string | The event name |
| fn | Function | The callback function |

**Example**

```javascript
System.addEventListener('add', (obj) => {
    console.log('Object added:', obj.name);
});

System.addEventListener('setProperty', ({ object, component, prop, value }) => {
    console.log(`Property ${prop} changed to ${value}`);
});
```

---

### setIntervalX()

Set interval with number of repetitions

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| callback | Function | The callback function |
| delay | number | The delay in milliseconds |
| repetitions | number | The number of repetitions |

**Example**

```javascript
System.setIntervalX(() => {
    console.log('Tick!');
}, 1000, 5); // Execute 5 times every second
```

---

### include()

Include a JavaScript module

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| url | string | The script URL |

**Example**

```javascript
System.include('/plugins/custom-plugin.js');
```

---

### stringify()

Stringify an object (including functions)

**Return**

| Type | Description |
| --- | --- |
| string | The JSON string |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| o | Object | The object to stringify |

**Example**

```javascript
const json = System.stringify(obj);
```

---

### parse()

Parse a JSON string (including functions)

**Return**

| Type | Description |
| --- | --- |
| Object | The parsed object |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| o | string | The JSON string |

**Example**

```javascript
const obj = System.parse(json);
```

---

### getDate()

Get current date formatted

**Return**

| Type | Description |
| --- | --- |
| string | The formatted date [YYYY-MM-DD HH:MM:SS.mmm] |

**Example**

```javascript
console.log(System.getDate()); // [2026-01-29 14:30:45.123]
```

---

### log()

Log a message with blue color

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| string | string | The message to log |

**Example**

```javascript
System.log('Engine initialized');
```

---

### debug()

Log a debug message with green color (server prefix)

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| string | string | The message to log |

**Example**

```javascript
System.debug('Connection established');
```

---

### warn()

Log a warning message with yellow color

| Type | Description |
| --- | --- |
| void | |

**Parameters**

| Name | Type | Description |
| --- | --- | --- |
| string | string | The warning message |

**Example**

```javascript
System.warn('Deprecated method used');
```

---

## Events

The following events are available in the engine:

| Event | Description | Data |
| --- | --- | --- |
| `add` | Object added to scene | Object |
| `remove` | Object removed from scene | Object |
| `instantiate` | Object instantiated | Object |
| `destroy` | Object destroyed | Object |
| `setCurrentObject` | Selection changed | Object |
| `addComponent` | Component added | { object, component } |
| `removeComponent` | Component removed | { object, component } |
| `import` | Component imported | Component |
| `setProperty` | Property changed (local) | { object, component, prop, value } |
| `syncProperty` | Property synchronized (network) | { object, component, prop, value } |