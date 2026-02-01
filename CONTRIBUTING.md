# Contributing to Pixel Creator

Thank you for your interest in contributing to **Pixel Creator**! We welcome contributions from developers, artists, and other creatives. This guide will help you understand how to contribute effectively and responsibly.

**Note:** Pixel Creator uses a hybrid open source model. The **core engine and editor are open source** and available on GitHub, but the **server-side code handling multiplayer hosting is private** for security reasons. Contributions cannot include reverse engineering or attempts to replicate server functionality outside the official hosted system.

---

## Table of Contents

1. [Architecture Overview](#architecture-overview)
2. [How to Contribute](#how-to-contribute)
3. [Reporting Issues](#reporting-issues)
4. [Feature Requests](#feature-requests)
5. [Marketplace Contributions](#marketplace-contributions)
6. [Code of Conduct](#code-of-conduct)
7. [Resources](#resources)
8. [Contact & Support](#contact--support)

## Architecture Overview

### Project Structure

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
├── reference/              # Documentation (synced to wiki)
├── css/                    # Editor stylesheets
├── images/                 # Assets
├── plugins/                # Modules plugins
├── build/                  # Build entry point
├── app.js                  # Engine entry point
└── index.html              # Editor entry point
```

### Two-Layer Separation

1. **Engine (`src/`)** — Runtime logic, rendering, physics, networking
2. **Editor (`editor/`)** — Visual tools, UI panels, user interactions

The editor **never mutates engine state directly**. All changes go through events.

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
const scene = new Scene('Main Scene');

// Add objects
scene.add(player);
scene.add(enemy);

// Access objects
const obj = scene.get('Player');

// Remove objects
scene.remove(player);
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

### Multiplayer Basics

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

## How to Contribute

### What to Contribute

- 🐛 **Bug fixes** — Check [Issues](https://github.com/Sharkou/PixelCreator/issues)
- 📝 **Documentation** — Improve wiki pages
- 🎨 **UI improvements** — Editor usability
- ⚙️ **New components** — Extend engine capabilities
- 🧪 **Examples** — Sample projects and demos

### Prerequisites

- Basic JavaScript knowledge (ES6 modules)
- A modern browser
- Git basics

You are welcome to:

- Submit bug fixes  
- Suggest or implement enhancements in the editor  
- Improve documentation or examples

**Important:**  
All code contributions must target the **`sandbox` branch**.

- `sandbox` is used for development, testing, and experimentation  
- `master` is reserved for stable releases and is maintained by the project owner  

A **Pull Request (PR)** is a request to merge your changes into the project.
Pull Requests targeting `master` directly will be closed or redirected to `sandbox`.

### Step-by-step

1. **Fork the repository**  
   https://github.com/Sharkou/PixelCreator

2. **Create a branch from `sandbox`**:

   ```bash
   git checkout sandbox
   git checkout -b feature/awesome-feature
   ```

3. Make your changes with clear, concise commits:

   ```bash
   git commit -m "Add feature XYZ"
   ```

4. Push your branch and open a Pull Request.

   ```bash
   git push origin feature/awesome-feature
   ```

Include a clear description of your changes and why they are useful.

5. Open a Pull Request on GitHub:

- Base branch: sandbox
- Compare branch: your feature branch
- Clearly explain what you changed and why

Tip: Smaller, focused PRs are easier to review and more likely to be merged quickly.

### Code Style

Follow these conventions:

| Element | Convention | Example |
|---------|------------|---------|
| Variables | camelCase | `playerSpeed`, `getPosition()` |
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

## Reporting Issues

If you find a bug or unexpected behavior:

- Check existing issues first
- If none match, open a new issue with:
  
     - A clear description of the problem
     - Steps to reproduce
     - Screenshots or examples if applicable
 
## Feature Requests

We love ideas! To suggest a new feature:

- Open an issue with the label `enhancement`
- Include the problem you want to solve, your proposed solution, and any references
- Keep requests realistic to the scope of the project

## Marketplace Contributions

Pixel Creator allows creators to submit assets (sprites, sounds, templates) for the official marketplace:

- Ensure you own the rights to your submissions
- Provide clear previews and descriptions
- High-quality contributions are more likely to be featured

## Code of Conduct

We aim to maintain a friendly and inclusive community. Please:

- Be respectful in discussions
- Avoid spam or self-promotion unrelated to Pixel Creator
- Follow GitHub guidelines and use constructive feedback

Anyone violating the code of conduct may have their contributions or access revoked.

## Resources

- [Wiki Documentation](https://github.com/Sharkou/PixelCreator/wiki)
- [API Reference](https://docs.pixelcreator.io)
- [Discord Community](https://discord.gg/X8scDNX)

## Contact & Support

If you have questions about contributing, you can reach out on our [Discord](https://discord.gg/X8scDNX) or open an issue with the label `help wanted`.

For subscription and monetization inquiries, please contact us by email at contact@pixelcreator.io

Enjoy taking part in this adventure!
