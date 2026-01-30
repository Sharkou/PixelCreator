The **Gamepad** class provides complete controller support with button detection, analog sticks, triggers, and vibration feedback.

---

## Overview

The Gamepad API allows detecting and reading input from game controllers. This class wraps the browser's Gamepad API with deadzone handling and convenient methods.

---

## Import

```javascript
import { Gamepad } from '/src/input/gamepad.js';
```

---

## Static Methods

### Connection

#### `isConnected(index)`
Check if a gamepad is connected.
```javascript
if (Gamepad.isConnected(0)) {
    console.log('Controller connected!');
}
```

#### `getAll()`
Get all connected gamepads.
```javascript
const gamepads = Gamepad.getAll();
```

### Buttons

#### `isButtonPressed(index, button)`
Check if a button is pressed.
```javascript
if (Gamepad.isButtonPressed(0, Gamepad.BUTTONS.A)) {
    player.jump();
}
```

#### `getButtonValue(index, button)`
Get analog button value (0-1).
```javascript
const triggerValue = Gamepad.getButtonValue(0, Gamepad.BUTTONS.RT);
```

### Analog Sticks

#### `getAxis(index, axis)`
Get axis value with deadzone (-1 to 1).
```javascript
const horizontal = Gamepad.getAxis(0, Gamepad.AXES.LEFT_STICK_X);
```

#### `getLeftStick(index)` / `getRightStick(index)`
Get stick values as object.
```javascript
const { x, y } = Gamepad.getLeftStick(0);
player.move(x, y);
```

### Triggers

#### `getLeftTrigger(index)` / `getRightTrigger(index)`
Get trigger values (0-1).
```javascript
const acceleration = Gamepad.getRightTrigger(0);
const brake = Gamepad.getLeftTrigger(0);
```

### Vibration

#### `vibrate(index, duration, weakMagnitude, strongMagnitude)`
Trigger haptic feedback.
```javascript
Gamepad.vibrate(0, 200, 0.5, 1.0); // Strong rumble
```

### Update

#### `update()`
Update gamepad states (call each frame).
```javascript
function gameLoop() {
    Gamepad.update();
    // Handle input...
}
```

---

## Button Constants

Standard mapping (Xbox layout):

| Constant | Index | Button |
|----------|-------|--------|
| `A` | 0 | A / Cross |
| `B` | 1 | B / Circle |
| `X` | 2 | X / Square |
| `Y` | 3 | Y / Triangle |
| `LB` | 4 | Left Bumper |
| `RB` | 5 | Right Bumper |
| `LT` | 6 | Left Trigger |
| `RT` | 7 | Right Trigger |
| `BACK` | 8 | Back / Select |
| `START` | 9 | Start |
| `LEFT_STICK` | 10 | Left Stick Click |
| `RIGHT_STICK` | 11 | Right Stick Click |
| `DPAD_UP` | 12 | D-Pad Up |
| `DPAD_DOWN` | 13 | D-Pad Down |
| `DPAD_LEFT` | 14 | D-Pad Left |
| `DPAD_RIGHT` | 15 | D-Pad Right |
| `HOME` | 16 | Home / Guide |

---

## Axis Constants

| Constant | Index | Axis |
|----------|-------|------|
| `LEFT_STICK_X` | 0 | Left Stick Horizontal |
| `LEFT_STICK_Y` | 1 | Left Stick Vertical |
| `RIGHT_STICK_X` | 2 | Right Stick Horizontal |
| `RIGHT_STICK_Y` | 3 | Right Stick Vertical |

---

## Properties

| Property | Type | Default | Description |
|----------|------|---------|-------------|
| `deadzone` | number | 0.15 | Minimum stick threshold |
| `gamepads` | Object | {} | Cached gamepad states |

---

## Events

The class dispatches system events on connection changes:

```javascript
System.addEventListener('gamepadconnected', e => {
    console.log(`Controller ${e.index} connected: ${e.id}`);
});

System.addEventListener('gamepaddisconnected', e => {
    console.log(`Controller ${e.index} disconnected`);
});
```

---

## Common Patterns

### Movement
```javascript
function update() {
    Gamepad.update();
    
    if (Gamepad.isConnected(0)) {
        const stick = Gamepad.getLeftStick(0);
        player.vx = stick.x * speed;
        player.vy = stick.y * speed;
    }
}
```

### Actions
```javascript
function handleInput() {
    if (Gamepad.isButtonPressed(0, Gamepad.BUTTONS.A)) {
        player.jump();
    }
    if (Gamepad.isButtonPressed(0, Gamepad.BUTTONS.X)) {
        player.attack();
    }
}
```

### Triggers for Acceleration
```javascript
function drive() {
    const gas = Gamepad.getRightTrigger(0);
    const brake = Gamepad.getLeftTrigger(0);
    car.accelerate(gas - brake);
}
```

### Impact Feedback
```javascript
function onHit(damage) {
    player.health -= damage;
    Gamepad.vibrate(0, 100, damage / 100, damage / 50);
}
```

---

## Notes

- Gamepad API requires user interaction before detection
- Button mappings may vary between controller types
- Not all controllers support vibration
- Deadzone prevents stick drift when idle

---

## See Also

- [Keyboard](keyboard.md) – Keyboard input handling
- [Mouse](mouse.md) – Mouse input handling
- [Controller](controller.md) – Movement physics
