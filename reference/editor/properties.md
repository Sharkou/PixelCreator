Initialize a new `Properties`

```js
import { Properties } from '/editor/windows/properties.js';

const properties = new Properties('properties', scene);
```

---

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| node | `HTMLElement` | The HTML element ID |
| scene | `Scene` | The current scene |

---

## Static Properties

### [`main`](###main)

Get/set current properties panel

**Type**

| Name | Type |
|------|------|
| main | `Properties` |

**Example**

```js
const currentProperties = Properties.main;
```

---

## Properties

### [`node`](###node)

The properties panel DOM container element

**Type**

| Name | Type |
|------|------|
| node | `HTMLElement` |

### [`scene`](###scene)

Reference to the current scene

**Type**

| Name | Type |
|------|------|
| scene | `Scene` |

---

## Methods

### [`add(obj)`](###add())

Add object to properties panel

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to display |

**Example**

```js
properties.add(player);
```

### [`updateProperty(obj, component, prop, value)`](###updateProperty())

Update a single property in the editor UI

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object updated |
| component | `Object` | The component updated |
| prop | `string` | The property name |
| value | `any` | The new value |

### [`updateProperties(obj)`](###updateProperties())

Update all object properties in the editor

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to update |

### [`clear()`](###clear())

Clear the properties panel

**Example**

```js
properties.clear();
```

### [`addComponent(component)`](###addComponent())

Add component to object properties

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Object` | The component |

### [`updateCurrentObject(el)`](###updateCurrentObject())

Update current object from input element change

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `Element` | The input element |

### [`updateObjectProperties(data)`](###updateObjectProperties())

Update object root properties in editor UI

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| data | `Object` | The object data |

### [`updateComponentsProperties(data)`](###updateComponentsProperties())

Update object component properties in editor UI

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| data | `Object` | The object data |

### [`createObjectView(obj)`](###createObjectView())

Create view of object root properties

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object |

**Returns:** `Element` - The DOM element

### [`createComponentView(component)`](###createComponentView())

Create view of a component

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Object` | The component |

**Returns:** `Element` - The DOM element

### [`createProperty(parent, name, value, id)`](###createProperty())

Create a property input field

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| parent | `Element` | Parent DOM element |
| name | `string` | Property name |
| value | `any` | Property value |
| id | `string` | Property ID |

---

## System Events

The `Properties` panel listens to:

### `setCurrentObject`

Triggered when current object changes - updates the properties panel

### `setProperty`

Triggered when a property changes - updates specific property in UI

### `import`

Triggered when a component is imported - refreshes properties panel

---

## Drag and Drop

The properties panel accepts:

- **Script components**: Drop a script file to add it as a component
- **Other components**: Drop from component library

---

## Notes

- Automatically updates UI when object properties change
- Only updates input fields that are not currently focused
- Number properties are parsed as integers when displayed
- String properties are displayed as text
- Ignores internal properties (starting with `_` or `$`)
- Excludes certain properties from display: `id`, `uid`, `type`, `active`, `visible`, `lock`, `image`, `parent`, `components`, `childs`
- Synchronizes with the global event system for real-time updates
