# Getting Started with Pixel Creator

Welcome! This guide will help you understand Pixel Creator and start contributing to the project.

---

## What is Pixel Creator?

Pixel Creator is a **web-based, beginner-oriented, no-code/low-code 2D multiplayer game engine**. It allows anyone to create online games (MMO, MOBA, .io-style) without programming knowledge.

### Core Philosophy

- **Simplicity over complexity** — If it's hard to understand, it's wrong
- **Multiplayer by default** — Networking is handled automatically
- **Web-first** — Runs entirely in the browser
- **Beginner-first** — Designed for people with no coding experience

---

## Project Structure

```
PixelCreator/
├── src/                    # Engine core (runtime)
│   ├── core/               # Core classes (Scene, Object, Renderer, Camera...)
│   ├── graphics/           # Visual components (Texture, Sprite, Circle...)
│   ├── physics/            # Physics components (Collider, Controller...)
│   ├── input/              # Input handling (Mouse, Keyboard, Gamepad)
│   ├── network/            # Multiplayer (Network, Client, Socket...)
│   ├── anim/               # Animation system
│   ├── math/               # Math utilities (Vector, Random, Math...)
│   ├── time/               # Time management
│   └── ui/                 # UI components (Button...)
│
├── editor/                 # Visual editor (IDE)
│   ├── windows/            # UI panels (Hierarchy, Properties, Project...)
│   ├── graph/              # Visual scripting
│   ├── scripting/          # Code editor integration
│   ├── system/             # Editor systems (Handler, Manager...)
│   ├── network/            # Collaboration features
│   └── misc/               # Utilities (Grid, Tabs, Shortcuts...)
│
├── docs/                   # Documentation (synced to wiki)
├── css/                    # Editor stylesheets
├── images/                 # Assets
└── index.html              # Editor entry point
```

---

## Architecture Overview

### Object-Component Pattern

Pixel Creator uses an **Object-Component architecture**:

- **Objects** are containers (position, size, name)
- **Components** add behavior (rendering, physics, input...)

```javascript
// Create an object
const player = new Object('Player', 100, 100, 32, 32);

// Add components for behavior
player.addComponent(new Texture('player.png'));
player.addComponent(new Controller());
player.addComponent(new Collider());

// Add to scene
scene.add(player);
```

### Event-Driven Communication

All state changes go through a global event system:

```javascript
// Dispatch an event
System.dispatchEvent('setProperty', { object: obj, key: 'x', value: 100 });

// Listen to events
System.addEventListener('setProperty', (data) => {
    console.log(`${data.key} changed to ${data.value}`);
});
```

**Key events:**
- `add`, `remove` — Object lifecycle
- `setProperty` — Local property change
- `syncProperty` — Network-synchronized change
- `addComponent`, `removeComponent` — Component lifecycle

### Two-Layer Separation

1. **Engine (`src/`)** — Runtime logic, rendering, physics, networking
2. **Editor (`editor/`)** — Visual tools, UI panels, user interactions

The editor **never mutates engine state directly**. All changes go through events.

---

## Key Concepts

### Components

Components are imported from `/src/core/mod.js`:

```javascript
import { Texture, Collider, Controller } from '/src/core/mod.js';
```

Common components:
- `Texture` — Display an image
- `CircleRenderer` / `RectangleRenderer` — Draw shapes
- `Collider` — Collision detection
- `Controller` — Player movement
- `Camera` — Viewport control
- `Animator` — Animation playback

### Properties

Objects expose properties that can be modified:

```javascript
// Local update (editor only)
obj.setProperty('x', 100);

// Network sync (multiplayer)
obj.syncProperty('x', 100);
```

### Scenes

Scenes contain all objects:

```javascript
const scene = Scene.main;

// Add objects
scene.add(player);
scene.add(enemy);

// Access objects
const obj = scene.get('Player');

// Remove objects
scene.remove(player);
```

---

## Contributing

### Prerequisites

- Basic JavaScript knowledge (ES6 modules)
- Git basics
- A modern browser (Chrome recommended)

### Setup

1. **Fork** the repository on GitHub
2. **Clone** your fork:
   ```bash
   git clone https://github.com/YOUR_USERNAME/PixelCreator.git
   ```
3. **Open** in VS Code
4. **Run** with Live Server (or any local server)

### Code Style

Follow these conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Variables/Functions | camelCase | `playerSpeed`, `getPosition()` |
| Classes | PascalCase | `Player`, `CircleRenderer` |
| Files | lowercase, single word | `renderer.js`, `camera.js` |
| Language | English | Comments, variables, everything |

### JSDoc Guidelines

- **DO**: Document constructors with class description
- **DON'T**: Add class-level comments before `export class`
- **DON'T**: Verbose JSDoc on self-explanatory properties

```javascript
// ✅ Good
export class Vector {
    
    /**
     * Create a new vector for physics and transformations
     * @param {number} x - The x component
     * @param {number} y - The y component
     */
    constructor(x = 0, y = 0) {
        this.x = x;
        this.y = y;
    }
}

// ❌ Bad - class-level comment
/**
 * 2D Vector mathematics class
 */
export class Vector {
```

### File Structure

First line must be `import` or `export class`:

```javascript
// ✅ Good
import { Component } from '/src/core/mod.js';

export class MyComponent extends Component {
    // ...
}

// ❌ Bad - comment before export
/**
 * My component description
 */
export class MyComponent {
```

### Making Changes

1. **Create a branch**:
   ```bash
   git checkout -b feature/my-feature
   ```

2. **Make your changes** following the code style

3. **Test** in the browser

4. **Commit** with clear messages:
   ```bash
   git commit -m "Add player respawn feature"
   ```

5. **Push** and create a Pull Request

### What to Contribute

- 🐛 **Bug fixes** — Check [Issues](https://github.com/Sharkou/PixelCreator/issues)
- 📝 **Documentation** — Improve wiki pages
- 🎨 **UI improvements** — Editor usability
- ⚙️ **New components** — Extend engine capabilities
- 🧪 **Examples** — Sample projects and demos

---

## Rendering Rules

### Canvas vs DOM

**Canvas** (game rendering):
- Sprites, textures
- Shapes (circles, rectangles)
- Particles, effects
- Game visuals

**HTML/DOM** (UI):
- Buttons, menus
- Text labels
- HUD elements
- Editor interface

UI components must **never** render on the canvas.

---

## Multiplayer Basics

Pixel Creator handles networking automatically:

```javascript
// Properties sync automatically when using syncProperty
obj.syncProperty('x', newX);
obj.syncProperty('health', 100);

// Access other players' input
const keys = Keyboard.keys(uid);
const mouse = Mouse.get(uid);
```

Key principles:
- Server is authoritative
- Use deterministic logic when possible
- Avoid RNG-driven advantages

---

## Resources

- [Wiki Documentation](https://github.com/Sharkou/PixelCreator/wiki)
- [API Reference](https://docs.pixelcreator.io)
- [Discord Community](https://discord.gg/X8scDNX)
- [Contributing Guidelines](https://github.com/Sharkou/PixelCreator/blob/master/CONTRIBUTING.md)

---

## Need Help?

- 💬 Ask on [Discord](https://discord.gg/X8scDNX)
- 🐛 Report issues on [GitHub](https://github.com/Sharkou/PixelCreator/issues)
- 📧 Contact: contact@pixelcreator.io

---

*Made with ❤️ by Dylan "Sharkou" Audic*
