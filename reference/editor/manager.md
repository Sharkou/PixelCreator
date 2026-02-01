Initialize a new `Manager`

```js
import { Manager } from '/editor/system/manager.js';

const manager = new Manager(properties);
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| properties | `Properties|null` | Reference to the properties panel |

---

## Properties

### [`properties`](###properties)

Reference to the properties panel

**Type**

| Name | Type |
|------|------|
| properties | `Properties|null` |

### [`components`](###components)

Dictionary of registered components

**Type**

| Name | Type |
|------|------|
| components | `Object` |

**Example**

```js
const component = manager.components['Camera'];
```

---

## Methods

### [`addComponent(component, iconClasses, category)`](###addComponent())

Add a component to the manager's registry

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Object` | The component class |
| iconClasses | `string` | Space-separated CSS icon classes |
| category | `string` | Component category (e.g., 'camera', 'graphics', 'physics') |

**Example**

```js
manager.addComponent(Camera, 'fas fa-camera-movie', 'camera');
```

### [`appendChild(component, iconClasses, category)`](###appendChild())

Create and append component DOM element to the components list

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Function` | The component class |
| iconClasses | `string` | Space-separated icon CSS classes |
| category | `string` | Component category |

---

## Notes

- `Manager` is responsible for registering and displaying available components in the editor
- Components are displayed in the UI with an icon and formatted name
- Clicking a component in the UI adds it to the currently selected object
- The manager automatically creates DOM elements for the component panel
- Component names are formatted from camelCase to spaced text (e.g., "CircleRenderer" becomes "Circle Renderer")
