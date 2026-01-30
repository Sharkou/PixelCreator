Initialize a new `Sprite` object (Object with Texture and Animator)

```js
import { Sprite } from '/src/graphics/sprite.js';

const player = new Sprite('Player', 100, 100, 32, 32, 'player.png', {
    idle: idleAnimation,
    walk: walkAnimation
});
```

---

## Parameters

| Name | Type | Description |
|------|--------|-------------|
| name | `string` | The sprite name |
| x | `number` | X-coordinate position |
| y | `number` | Y-coordinate position |
| width | `number` | Sprite width |
| height | `number` | Sprite height |
| image | `string` | The texture image path |
| animations | `Object` | Object containing named animations |

---

## Inherited From Object

Sprite extends `Object` and inherits all its properties and methods:

- `id`, `name`, `tag`, `layer`
- `x`, `y`, `width`, `height`
- `active`, `visible`, `lock`, `static`
- `rotation`, `scale`
- `components`, `childs`
- `addComponent()`, `removeComponent()`, `translate()`, etc.

---

## Built-in Components

Sprite automatically includes:

### Texture

The visual representation of the sprite

```js
const texture = sprite.components.Texture;
texture.flip = true; // Flip horizontally
```

### Animator

Animation controller for the sprite

```js
const animator = sprite.components.Animator;
animator.play('walk');
```

---

## Usage

### Creating a Simple Sprite

```js
import { Sprite } from '/src/graphics/sprite.js';

const player = new Sprite('Player', 100, 100, 32, 32, 'player.png', {});
scene.add(player);
```

### Sprite with Animations

```js
import { Sprite } from '/src/graphics/sprite.js';
import { Animation } from '/src/anim/animation.js';

const animations = {
    idle: new Animation(['idle1.png', 'idle2.png'], 200),
    walk: new Animation(['walk1.png', 'walk2.png', 'walk3.png'], 100),
    jump: new Animation(['jump1.png', 'jump2.png'], 150)
};

const player = new Sprite('Player', 100, 100, 32, 32, 'idle1.png', animations);

// Play animations
player.components.Animator.play('idle');
```

### Adding Additional Components

```js
const player = new Sprite('Player', 100, 100, 32, 32, 'player.png', animations);

// Add controller
player.addComponent(new Controller(2));

// Add collider
player.addComponent(new RectCollider(0, 0, true, '#00ff00', 32, 32));

scene.add(player);
```

### Enemy Sprite

```js
const enemy = new Sprite('Enemy', 300, 100, 48, 48, 'enemy.png', {
    idle: new Animation(['enemy_idle1.png', 'enemy_idle2.png'], 300),
    attack: new Animation(['enemy_attack1.png', 'enemy_attack2.png', 'enemy_attack3.png'], 100)
});

enemy.tag = 'enemy';
enemy.addComponent(new CircleCollider(0, 0, true, '#ff0000', 24));

scene.add(enemy);
```

---

## See Also

- [Texture](https://github.com/Sharkou/PixelCreator/wiki/Texture) – Simple image component
- [Graphics](https://github.com/Sharkou/PixelCreator/wiki/Graphics) – Static drawing methods
- [Animation](https://github.com/Sharkou/PixelCreator/wiki/Animation) – Animation clips
