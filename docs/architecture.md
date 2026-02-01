# Pixel Creator Architecture

## High-Level Structure

Pixel Creator is split into two strictly separated layers:

- **Engine Core (`src/`)**
  - Runtime logic
  - Rendering
  - Physics
  - Networking
  - Components

- **Editor (`editor/`)**
  - Visual IDE
  - Object hierarchy
  - Property panels
  - Visual scripting
  - Collaboration tools

The editor never mutates engine state directly.
All communication flows through the event system.

---

## Object–Component Model

Objects are passive containers.

Components:
- Hold all logic
- Are modular and independent
- Can be added or removed at runtime

```js
const obj = new Object('Player', 0, 0, 32, 32);
obj.addComponent(new Texture('player.png'));
obj.addComponent(new Controller());
scene.add(obj);
```

Rules:
- One component = one responsibility
- No component-to-component coupling
- Access via `obj.getComponent(ComponentClass)` only

---

## Event-Driven Architecture

All state changes go through the global event bus.

Core API:
- `System.dispatchEvent(eventName, payload)`
- `System.addEventListener(eventName, callback)`

Events are synchronous.
Listener order matters.

This ensures:
- Deterministic behavior
- Predictable debugging
- Network-safe synchronization

---

## Property Synchronization

Properties are updated in two explicit steps:

Local update:
```js
obj.setProperty('x', 100);
```

Network synchronization:
```js
obj.syncProperty('x', 100);
```

This separation prevents accidental network traffic and preserves real-time editor feedback.

---

## Rendering Model

Rendering is entirely component-driven.

If something is visible, it owns a renderer component.
There is no implicit or global rendering logic.

---

## Multiplayer Principles

- Server-authoritative logic
- Real-time synchronization
- Deterministic systems when possible
- RNG avoided for competitive advantage

Multiplayer is not an add-on; it is a foundational constraint.