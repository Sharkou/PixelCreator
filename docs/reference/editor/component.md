Initialize a new visual scripting `Component`

```js
import { Component } from '/editor/graph/component.js';

const component = new Component('MyComponent', 'logic');
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| name | `string` | The component name (default: '') |
| type | `string` | The component type (default: '') |

---

## Properties

### [`id`](###id)

Unique component identifier

**Type**

| Name | Type |
|------|------|
| id | `string` |

### [`name`](###name)

Component name

**Type**

| Name | Type |
|------|------|
| name | `string` |

### [`type`](###type)

Component type/category

**Type**

| Name | Type |
|------|------|
| type | `string` |

---

## Notes

- This is a lightweight component class for the visual scripting graph
- Automatically generates a unique ID on construction
- Synchronized with the global event system via `System.sync()`
- Used internally by the graph editor
- Not to be confused with game object components from `/src/core/`
