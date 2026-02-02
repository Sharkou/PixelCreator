Initialize a new `Object`

```js
import { Object } from '/src/core/object.js';

const obj = new Object({
    name: 'Player',
    x: 10,
    y: 20
});
```

## Parameters

| Name   | Type   | Description |
|------|--------|-------------|
| name | `string` | `Object` name |
| x    | `number` | `Object` x-coordinate position |
| y    | `number` | `Object` y-coordinate position |
| width | `number` | `Object` width |
| height | `number` | `Object` height |
| layer | `number` | `Object` layer (z-index) |

---

## Properties

### [`id`](###id)

Get `Object` identifier
> *Do not modify this property.*

**Parameters**

| Name | Type |
|------|------|
| id | `string` |

**Example**

```js
const playerId = player.id;
```

### [`name`](###name)

Get `Object` name

**Parameters**

| Name | Type |
|------|------|
| name | `string` |

**Example**

```js
particleSystem.name = 'Particle System';
```

### [`tag`](###tag)

Get `Object` tag

**Parameters**

| Name | Type |
|------|------|
| tag | `string` |

**Example**

```js
zombie.tag = 'enemy';
```

### [`x`](###x)

Get `Object` x-coordinate position

**Parameters**

| Name | Type |
|------|------|
| x | `number` |

**Example**

```js
player.x += 1;
```

### [`y`](###y)

Get `Object` y-coordinate position

**Parameters**

| Name | Type |
|------|------|
| y | `number` |

**Example**

```js
player.y += 1;
```

### [`width`](###width)

Get `Object` width

**Parameters**

| Name | Type |
|------|------|
| width | `number` |

**Example**

```js
player.width = 200;
```

### [`height`](###height)

Get `Object` height

**Parameters**

| Name | Type |
|------|------|
| height | `number` |

**Example**

```js
player.height = 150;
```

### [`layer`](###layer)

Get `Object` layer (z-index)

**Parameters**

| Name | Type |
|------|------|
| layer | `number` |

**Example**

```js
player.height = 150;
```

### [`active`](###active)

Get `Object` active status

**Parameters**

| Name | Type |
|------|------|
| active | `boolean` |

**Example**

```js
hud.active;
```

### [`visible`](###visible)

Get `Object` visible status

**Parameters**

| Name | Type |
|------|------|
| visible | `boolean` |

**Example**

```js
player.visible;
```

### [`lock`](###lock)

Get `Object` locking status

**Parameters**

| Name | Type |
|------|------|
| lock | `boolean` |

**Example**

```js
door.lock;
```

### [`static`](###static)

Get `Object` static status

**Parameters**

| Name | Type |
|------|------|
| static | `boolean` |

**Example**

```js
if (light.static) {
    return;
}
```

### [`rotation`](###rotation)

Get `Object` rotation degree

**Parameters**

| Name | Type |
|------|------|
| rotation | `Vector` |

**Example**

```js
player.target(enemy.rotation);
```

### [`scaling`](###scaling)

Get `Object` scaling percentage

**Parameters**

| Name | Type |
|------|------|
| scaling | `Vector` |

**Example**

```js
if (boss.scaling > 2) {
    boss.changeStatus("angry");
}
```

### [`childs`](###childs)

Get the array `Object` childs

**Parameters**

| Name | Type |
|------|------|
| childs | `Array` |

**Example**

```js
player.childs.push(new Weapon());
```

### [`components`](###components)

Get the array `Object` components

**Parameters**

| Name | Type |
|------|------|
| components | `Array` |

**Example**

```js
const playerName = player.components.name; // || player.components['name'];
```

---

## Methods

### [`update()`](###update())

`update` is called every frame while `Object` is `active`
> *Do not modify this method.*

**Example**

```js
import { Time } from '/src/time/time.js';

export class Accelerator {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} speed - the speed in degree
     */
    constructor(speed = 1) {
        this.speed = speed;
    }
    
    /**
     * Update the component
     * @update
     * @param {Object} self - The container object
     */
    update(self) {
        self.speed = this.speed * Time.deltaTime;
    }
}
```

### [`draw()`](###draw())

`draw` is called every frame while `Object` is `visible`
> *Do not modify this method.*

**Example**

```js
export class Aura {
    
    /**
     * Initialize the component
     * @constructor
     * @param {number} intensity - the intensity of aura lighting
     */
    constructor(intensity  = 1) {
        this.intensity = intensity;
    }
    
    /**
     * Draw the component
     * @draw
     * @param {Object} self - The container object
     */
    draw(self) {
        self.setAura(this.aura);
    }
}
```

### [`addComponent()`](###addComponent())

Add the `Object` component

**Return**

| Name | Type | Description |
|------|------|--------|
| this | `Object` | The current object |

**Parameters**

| Name | Type | Return |
|------|------|--------|
| component | `Component` | `void` |

**Example**

```js
let circle = new Object();
circle.addComponent(new Circle('#CC8844', 0.6));
scene.add(circle);
```

### [`removeComponent()`](###removeComponent())

Remove the `Object` component

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| component | `Component` | The component to remove |

**Example**

```js
let creeper = new Object();
creeper.removeComponent(Explode);
```

### [`addChild()`](###addChild())

Add child to `Object`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| child | `Object` | The child to add |

**Example**

```js
let parent = new Object('Parent');
let child = new Object('Child');
parent.addChild(child);
```

### [`removeChild()`](###removeChild())

Remove child from `Object`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| child | `Object` | The child to remove |

**Example**

```js
let parent = new Object('Parent');
let child = new Object('Child');
parent.addChild(child);
parent.removeChild(child);
```

### [`contains()`](###contains())

Contains the `Object` component

**Return**

| Name | Type | Description |
|------|------|--------|
| result | `boolean` | The boolean result |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| component | `Component` | The content component |

**Example**

```js
let circle = new Object();
let circleComponent = new Circle();
circle.addComponent(circleComponent);
if (circle.contains(circleComponent)) {
    return true;
}
```

### [`translate()`](###translate())

Translate an `Object` using coordinates (x, y)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| x | `number` | The x-coordinate translation of the entity |
| y | `number` | The y-coordinate translation of the entity |

**Example**

```js
let player = new Object();
player.translate(1, 0);
```

### [`rotate()`](###rotate())

Rotate the `Object` by angle (in degrees)

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| angle | `number` | The angle in degrees |

**Example**

```js
let player = new Object();
player.rotate(60);
```

### [`copy()`](###copy())

Copy the `Object` properties

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| object | `Object` | The object to copy |

**Example**

```js
for (let id in scene.objects) {
    let obj = new Object();
    obj.copy(scene.objects[id]);
    scene.add(obj);
}
```

### [`detectMouse()`](###detectMouse())

Detect `Mouse` hover

| Name | Type | Description |
|------|------|--------|
| detection | `boolean` | The result of the mouse detection |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| x | `number` | The x mouse value |
| y | `number` | The y mouse value |

**Example**

```js
if (obj.detectMouse(Mouse.x, Mouse.y)) {
    Dnd.hovering = true;
}
```

### [`detectSide()`](###detectSide())

Detect the sides for resizing the editor

**Return**

| Name | Type | Description |
|------|------|--------|
| side | `string` | The detected side |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| x | `number` | The x mouse value |
| y | `number` | The y mouse value |

**Example**

```js
if (obj.detectMouse(Mouse.x, Mouse.y)) {
    Dnd.resize = obj.detectSide(Mouse.x, Mouse.y);
}
```

### [`select()`](###select())

Select `Object` in editor with `Mouse`

| Return |
|--------|
| `void` |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| context | `CanvasRenderingContext2D` | The current rendering context |

**Example**

```js
if (obj === scene.current && !obj.lock) {
    obj.select(this.ctx);
}
```

### [`createImage()`](###createImage())

Create image of the `Object`

**Return**

| Name | Type | Description |
|------|------|--------|
| img | `Image` | The generated image |

**Parameters**

| Name | Type | Description |
|------|------|--------|
| context | `CanvasRenderingContext2D` | `The current rendering context` |

**Example**

```js
let obj = new Object();
obj.addComponent(new Light());
let img = obj.createImage();
```