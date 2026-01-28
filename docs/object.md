Initialize a new `Object`

```js
import { Object } from '/src/core/object.js';

const obj = new Object('Player', 100, 100, 32, 32);
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| name | `string` | Object name (default: '') |
| x | `number` | Object x-coordinate position (default: 0) |
| y | `number` | Object y-coordinate position (default: 0) |
| width | `number` | Object width (default: 0) |
| height | `number` | Object height (default: 0) |
| layer | `number` | Object layer/z-index (default: 0) |

---

## Properties

### [`id`](###id)

Get `Object` unique identifier

> Do not modify this property.

**Parameters**

| Name | Type |
|------|------|
| id | `string` |

**Exemple**

```js
const playerId = player.id;
```

### [`uid`](###uid)

Get `Object` user identifier (for multiplayer)

**Parameters**

| Name | Type |
|------|------|
| uid | `string` |

**Exemple**

```js
player.uid = Network.uid;
```

### [`name`](###name)

Get `Object` name

**Parameters**

| Name | Type |
|------|------|
| name | `string` |

**Exemple**

```js
particleSystem.name = 'Particle System';
```

### [`tag`](###tag)

Get `Object` tag for grouping

**Parameters**

| Name | Type |
|------|------|
| tag | `string` |

**Exemple**

```js
zombie.tag = 'enemy';
```

### [`type`](###type)

Get `Object` type

**Parameters**

| Name | Type |
|------|------|
| type | `string` |

### [`x`](###x)

Get `Object` x-coordinate position

**Parameters**

| Name | Type |
|------|------|
| x | `number` |

**Exemple**

```js
player.x += 1;
```

### [`y`](###y)

Get `Object` y-coordinate position

**Parameters**

| Name | Type |
|------|------|
| y | `number` |

**Exemple**

```js
player.y += 1;
```

### [`width`](###width)

Get `Object` width

**Parameters**

| Name | Type |
|------|------|
| width | `number` |

**Exemple**

```js
player.width = 64;
```

### [`height`](###height)

Get `Object` height

**Parameters**

| Name | Type |
|------|------|
| height | `number` |

**Exemple**

```js
player.height = 64;
```

### [`layer`](###layer)

Get `Object` layer (z-index)

**Parameters**

| Name | Type |
|------|------|
| layer | `number` |

**Exemple**

```js
player.layer = 5; // Render above layer 4
```

### [`active`](###active)

Get `Object` active status

**Parameters**

| Name | Type |
|------|------|
| active | `boolean` |

**Exemple**

```js
if (hud.active) {
    hud.update();
}
```

### [`visible`](###visible)

Get `Object` visible status

**Parameters**

| Name | Type |
|------|------|
| visible | `boolean` |

**Exemple**

```js
player.visible = false; // Hide player
```

### [`lock`](###lock)

Get `Object` locking status (editor only)

**Parameters**

| Name | Type |
|------|------|
| lock | `boolean` |

**Exemple**

```js
background.lock = true; // Prevent selection in editor
```

### [`static`](###static)

Get `Object` static status

**Parameters**

| Name | Type |
|------|------|
| static | `boolean` |

**Exemple**

```js
if (light.static) {
    return; // Skip update for static objects
}
```

### [`rotation`](###rotation)

Get `Object` rotation in radians

**Parameters**

| Name | Type |
|------|------|
| rotation | `number` |

**Exemple**

```js
const angle = player.rotation;
```

### [`scale`](###scale)

Get `Object` scale

**Parameters**

| Name | Type |
|------|------|
| scale | `number` |

**Exemple**

```js
player.scale = 2; // Double size
```

### [`childs`](###childs)

Get the `Object` children

**Parameters**

| Name | Type |
|------|------|
| childs | `Object` |

**Exemple**

```js
for (let id in player.childs) {
    player.childs[id].visible = false;
}
```

### [`components`](###components)

Get the `Object` components

**Parameters**

| Name | Type |
|------|------|
| components | `Object` |

**Exemple**

```js
const texture = player.components.Texture;
const collider = player.components.RectCollider;
```

### [`parent`](###parent)

Get the parent object ID

**Parameters**

| Name | Type |
|------|------|
| parent | `string` |

**Exemple**

```js
if (child.parent) {
    const parentObj = scene.objects[child.parent];
}
```

---

## Methods

### [`update()`](###update())

Update all active components

> Called automatically by the engine each frame.

**Exemple**

```js
// Custom component with update method
export class Rotator {
    constructor(speed = 1) {
        this.speed = speed;
    }
    
    update(self) {
        self.rotation += this.speed * Time.deltaTime;
    }
}
```

### [`draw()`](###draw())

Draw all active components

> Called automatically by the engine each frame.

**Exemple**

```js
// Custom component with draw method
export class Glow {
    draw(self) {
        Graphics.circle(self.x, self.y, self.width);
        Graphics.fill('#ffff00', 0.3);
    }
}
```

### [`preview()`](###preview())

Preview components in editor mode

> Called automatically by the editor.

### [`getProperty()`](###getProperty())

Get a property value without triggering sync

**Return**

| Name | Type | Description |
|------|------|-------------|
| value | `any` | The property value |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| prop | `string` | The property name |

**Exemple**

```js
const x = player.getProperty('x');
```

### [`setProperty()`](###setProperty())

Set a property value (triggers setProperty event)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| prop | `string` | The property name |
| value | `any` | The new value |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.setProperty('x', 100);
```

### [`setComponentProperty()`](###setComponentProperty())

Set a component property value

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `string` | The component name |
| prop | `string` | The property name |
| value | `any` | The new value |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.setComponentProperty('Texture', 'flip', true);
```

### [`syncProperty()`](###syncProperty())

Sync a property to the server

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| prop | `string` | The property name |
| value | `any` | The new value |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.syncProperty('x', 100); // Sync to server
```

### [`syncComponentProperty()`](###syncComponentProperty())

Sync a component property to the server

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `string` | The component name |
| prop | `string` | The property name |
| value | `any` | The new value |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.syncComponentProperty('Controller', 'speed', 2);
```

### [`addComponent()`](###addComponent())

Add a component to the object

**Return**

| Name | Type | Description |
|------|------|-------------|
| this | `Object` | The current object (for chaining) |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Component` | The component to add |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
let player = new Object('Player', 0, 0, 32, 32);
player.addComponent(new Texture('player.png'))
      .addComponent(new Controller(2));
```

### [`removeComponent()`](###removeComponent())

Remove a component from the object

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Component\|string` | The component or name to remove |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.removeComponent('Controller');
// or
player.removeComponent(player.components.Controller);
```

### [`getComponent()`](###getComponent())

Get a component by name

**Return**

| Name | Type | Description |
|------|------|-------------|
| component | `Component` | The component |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `string` | The component name |

**Exemple**

```js
const texture = player.getComponent('Texture');
```

### [`contains()`](###contains())

Check if object has a component

**Return**

| Name | Type | Description |
|------|------|-------------|
| result | `boolean` | True if component exists |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Component` | The component to check |

**Exemple**

```js
if (player.contains(player.components.Collider)) {
    // Has collider
}
```

### [`addChild()`](###addChild())

Add a child object

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| child | `Object` | The child to add |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
let weapon = new Object('Weapon', 10, 0, 16, 16);
player.addChild(weapon);
```

### [`removeChild()`](###removeChild())

Remove a child object

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| child | `Object` | The child to remove |
| dispatch | `boolean` | Dispatch event (default: true) |

**Exemple**

```js
player.removeChild(weapon);
```

### [`getChild()`](###getChild())

Get a child object

**Return**

| Name | Type | Description |
|------|------|-------------|
| child | `Object` | The child object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| child | `Object` | The child to get |

### [`translate()`](###translate())

Translate the object by coordinates

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | X translation (default: 0) |
| y | `number` | Y translation (default: 0) |

**Exemple**

```js
player.translate(5, 0); // Move right
player.translate(0, -10); // Move up
```

### [`rotate()`](###rotate())

Rotate the object by angle in degrees

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| angle | `number` | The angle in degrees (default: 0) |

**Exemple**

```js
player.rotate(45); // Rotate 45 degrees
```

### [`setActive()`](###setActive())

Set object active state

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| active | `boolean` | The active state |

**Exemple**

```js
enemy.setActive(false); // Disable enemy
```

### [`copy()`](###copy())

Copy properties from another object

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| obj | `Object` | The object to copy from |

**Exemple**

```js
let clone = new Object();
clone.copy(player);
```

### [`copyComponent()`](###copyComponent())

Create a copy of a component

**Return**

| Name | Type | Description |
|------|------|-------------|
| copy | `Component` | The copied component |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| component | `Component` | The component to copy |

### [`onCollision()`](###onCollision())

Called every frame while colliding with another object

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| other | `Object` | The other colliding object |

### [`onCollisionStart()`](###onCollisionStart())

Called when collision first begins

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| other | `Object` | The other colliding object |

### [`onCollisionExit()`](###onCollisionExit())

Called when collision ends

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| other | `Object` | The other colliding object |

### [`detectMouse()`](###detectMouse())

Detect mouse hover

**Return**

| Name | Type | Description |
|------|------|-------------|
| detection | `boolean` | True if mouse is over object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Mouse x coordinate |
| y | `number` | Mouse y coordinate |

**Exemple**

```js
if (button.detectMouse(Mouse.x, Mouse.y)) {
    button.highlight();
}
```

### [`detectSide()`](###detectSide())

Detect which side the mouse is near (for resizing)

**Return**

| Name | Type | Description |
|------|------|-------------|
| side | `string` | The detected side |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| x | `number` | Mouse x coordinate |
| y | `number` | Mouse y coordinate |

**Return Values**

| Value | Description |
|-------|-------------|
| `'left'` | Left side |
| `'right'` | Right side |
| `'top'` | Top side |
| `'bottom'` | Bottom side |
| `'left-top'` | Top-left corner |
| `'left-bottom'` | Bottom-left corner |
| `'right-top'` | Top-right corner |
| `'right-bottom'` | Bottom-right corner |

### [`select()`](###select())

Draw selection box in editor

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |

### [`createImage()`](###createImage())

Create an image of the object

**Return**

| Name | Type | Description |
|------|------|-------------|
| img | `HTMLImageElement` | The generated image |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| ctx | `CanvasRenderingContext2D` | The canvas context |

**Exemple**

```js
const thumbnail = player.createImage(ctx);
```

### [`stringify()`](###stringify())

Convert object to JSON string

**Return**

| Name | Type | Description |
|------|------|-------------|
| json | `string` | The JSON string |

**Exemple**

```js
const json = player.stringify();
localStorage.setItem('player', json);
```

### [`parse()`](###parse())

Parse JSON string to object

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| json | `string` | The JSON string |

**Exemple**

```js
const player = new Object();
player.parse(localStorage.getItem('player'));
```
