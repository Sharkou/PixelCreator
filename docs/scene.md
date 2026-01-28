Initialize a new `Scene`

```js
import { Scene } from '/src/core/scene.js';

const scene = new Scene('Main Scene');
Scene.main = scene;
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| name | `string` | The scene name (default: '') |

---

## Properties

### [`name`](###name)

Get the `Scene` name

**Parameters**

| Name | Type |
|------|------|
| name | `string` |

**Exemple**

```js
const scene = new Scene('Main Scene');
console.log(scene.name); // 'Main Scene'
```

### [`objects`](###objects)

Contains all `Scene` objects

**Parameters**

| Name | Type |
|------|------|
| objects | `Object` |

**Exemple**

```js
for (let id in scene.objects) {
    const obj = scene.objects[id];
    obj.setActive(true);
}
```

### [`events`](###events)

Contains all `Scene` events

> Do not use this property directly.

**Parameters**

| Name | Type |
|------|------|
| events | `Object` |

### [`camera`](###camera)

Get the active `Scene` camera object

**Parameters**

| Name | Type |
|------|------|
| camera | `Object` |

**Exemple**

```js
const camera = scene.camera;
camera.x = player.x;
camera.y = player.y;
```

### [`current`](###current)

Get or set the currently selected object

**Parameters**

| Name | Type |
|------|------|
| current | `Object` |

**Exemple**

```js
let selectedObject = scene.current;
scene.current = player; // Select player
```

### [`currentComponent`](###currentComponent)

Get or set the currently selected component

**Parameters**

| Name | Type |
|------|------|
| currentComponent | `boolean\|string` |

---

## Static Properties

### [`main`](###main)

Get or set the current active `Scene`

**Parameters**

| Name | Type |
|------|------|
| main | `Scene` |

**Exemple**

```js
const scene = Scene.main;

// Set main scene
Scene.main = new Scene('Game');
```

---

## Methods

### [`add()`](###add())

Add an object to the scene

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to add |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
const player = new Object('Player', 100, 100, 32, 32);
scene.add(player);
```

### [`remove()`](###remove())

Remove an object from the scene

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to remove |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
scene.remove(enemy);
```

### [`instantiate()`](###instantiate())

Instantiate a copy of an object in the scene

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to instantiate |
| uid | `boolean\|string` | User ID (true for current user, string for specific) |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
// Instantiate for current user
scene.instantiate(playerTemplate, true);

// Instantiate for specific user
scene.instantiate(playerTemplate, 'user123');

// Instantiate without user binding
scene.instantiate(enemyTemplate, false);
```

### [`init()`](###init())

Initialize the scene with objects and camera

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| objects | `Object` | Objects to initialize |
| camera | `Object` | Camera object (optional) |

**Exemple**

```js
scene.init(savedObjects, cameraObject);
```

### [`refresh()`](###refresh())

Refresh the current object (triggers setCurrentObject event)

| Return |
|--------|
| `void` |

**Exemple**

```js
scene.refresh(); // Re-select current object
```

### [`dispatchEvent()`](###dispatchEvent())

Dispatch a scene-specific event

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `string` | The event name |
| data | `object` | The event data (optional) |

**Exemple**

```js
scene.dispatchEvent('levelComplete', { score: 1000 });
```

### [`addEventListener()`](###addEventListener())

Listen to a scene-specific event

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| e | `string` | The event name |
| fn | `function` | The callback function |

**Exemple**

```js
scene.addEventListener('levelComplete', data => {
    console.log('Level complete! Score:', data.score);
});
```

### [`getObjectByName()`](###getObjectByName())

Get an object by its name

**Return**

| Name | Type | Description |
|------|------|-------------|
| object | `Object` | The found object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| name | `string` | The object name |

**Exemple**

```js
const player = scene.getObjectByName('Player');
```

### [`getObjectsByName()`](###getObjectsByName())

Get all objects with a specific name

**Return**

| Name | Type | Description |
|------|------|-------------|
| objects | `Array<Object>` | The found objects |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| name | `string` | The object name |

### [`getObjectsByTag()`](###getObjectsByTag())

Get all objects with a specific tag

**Return**

| Name | Type | Description |
|------|------|-------------|
| objects | `Array<Object>` | The found objects |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| tag | `string` | The tag |

**Exemple**

```js
const enemies = scene.getObjectsByTag('enemy');
for (const enemy of enemies) {
    enemy.setActive(false);
}
```

### [`updateName()`](###updateName())

Update an object's name from an HTML element

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| el | `HTMLElement` | The HTML element |
| obj | `Object` | The object (optional) |

### [`update()`](###update())

Update all objects with a specific component

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Component` | The component class |

---

## Usage

### Basic Scene Setup

```js
import { Scene } from '/src/core/scene.js';
import { Renderer } from '/src/core/renderer.js';
import { Camera } from '/src/core/camera.js';

// Create scene
const scene = new Scene('Game');
Scene.main = scene;

// Create camera
const viewport = new Object('Viewport', 0, 0, 800, 600);
viewport.addComponent(new Camera('#1a1a2e'));
scene.add(viewport);

// Add game objects
const player = new Object('Player', 100, 100, 32, 32);
player.addComponent(new Texture('player.png'));
scene.add(player);
```

### Finding Objects

```js
// Find by name
const boss = scene.getObjectByName('Boss');

// Find by tag
const enemies = scene.getObjectsByTag('enemy');
const collectibles = scene.getObjectsByTag('coin');
```

### Scene Events

```js
// Listen for scene events
scene.addEventListener('enemyDefeated', data => {
    score += data.points;
    updateUI();
});

// Dispatch event
scene.dispatchEvent('enemyDefeated', { points: 100 });
```
