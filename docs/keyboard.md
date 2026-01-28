Static class for keyboard input handling

```js
import { Keyboard } from '/src/input/keyboard.js';
```

---

## Static Methods

### [`keyPressed()`](###keyPressed())

Check if any key is currently pressed for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| pressed | `boolean` | True if any key is pressed |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

**Exemple**

```js
if (Keyboard.keyPressed(player.uid)) {
    console.log('Player is pressing a key');
}
```

### [`keyReleased()`](###keyReleased())

Check if all keys are released for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| released | `boolean` | True if no key is pressed |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

**Exemple**

```js
if (Keyboard.keyReleased(player.uid)) {
    player.idle();
}
```

### [`keys()`](###keys())

Get the keys object for a specific user

**Return**

| Name | Type | Description |
|------|------|-------------|
| keys | `Object` | The keys state object |

**Parameters**

| Name | Type | Description |
|------|------|-------------|
| uid | `string` | The user identifier |

**Exemple**

```js
const keys = Keyboard.keys(player.uid);
if (keys['ArrowUp']) {
    player.jump();
}
if (keys['Space']) {
    player.attack();
}
```

---

## Events

The Keyboard class dispatches events through the System:

### `keydown`

Dispatched when a key is pressed

**Data**

| Name | Type | Description |
|------|------|-------------|
| key | `string` | The key that was pressed |

**Exemple**

```js
System.addEventListener('keydown', key => {
    console.log('Key pressed:', key);
});
```

### `keyup`

Dispatched when a key is released

**Data**

| Name | Type | Description |
|------|------|-------------|
| key | `string` | The key that was released |

**Exemple**

```js
System.addEventListener('keyup', key => {
    console.log('Key released:', key);
});
```

---

## Key Names

Common key names used:

| Key | Name |
|-----|------|
| Space bar | `'Space'` |
| Arrow keys | `'ArrowUp'`, `'ArrowDown'`, `'ArrowLeft'`, `'ArrowRight'` |
| Letters | `'a'`, `'b'`, `'c'`, ... |
| Numbers | `'0'`, `'1'`, `'2'`, ... |
| Modifiers | `'Shift'`, `'Control'`, `'Alt'` |
| Special | `'Enter'`, `'Escape'`, `'Tab'` |
