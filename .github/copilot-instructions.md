# Pixel Creator – AI Agent Guidelines

## Project Identity & Philosophy

Pixel Creator is **not** a generic game engine and must never be treated as such.

It is a **web-based, beginner-oriented, no-code / low-code 2D multiplayer game engine**, designed to allow anyone — even without programming knowledge — to create, collaborate on, and publish online games (MMO, MOBA, .io-style).

This project exists to **reduce complexity**, not showcase clever abstractions.

Primary objectives:
- Make multiplayer game creation accessible to beginners
- Hide networking complexity entirely from users
- Favor clarity, determinism, and real-time systems
- Enable collaborative development directly in the browser
- Prioritize learning, experimentation, and creativity

If a proposed solution:
- Makes the engine harder to understand
- Adds unnecessary abstraction
- Assumes advanced programming knowledge
- Shifts complexity onto the user

Then it is wrong.

---

## Vision & Long-Term Goals

Pixel Creator is developed with the following long-term vision:
- A living ecosystem around multiplayer game creation
- A community-driven marketplace for modules and assets
- A platform for publishing and distributing games
- A collaborative environment where multiple users edit the same project in real time

The engine is opinionated by design:
- Web-first
- Multiplayer-first
- Beginner-first

---

## Target Audience

Pixel Creator targets:
- Beginners with no programming background
- Indie creators who want multiplayer without server headaches
- Small teams collaborating remotely
- Developers who value simplicity over maximal control

This engine does **not** target:
- AAA pipelines
- Engine hackers
- People who want to rewrite the engine instead of using it

---

## Technology Stack (Intentional Choices)

- Language: JavaScript (ES modules)
- Editor: HTML5 + Canvas
- Client runtime: Browser
- Server runtime: Deno (authoritative, real-time)
- Rendering: Canvas 2D (WebGL/WebGPU later when justified)
- External libraries: Avoided unless strictly beneficial

Everything is built **custom and native** to keep the engine:
- Lightweight
- Flexible
- Predictable
- Maintainable

---

## Code Style

- Language: English (code, comments, variables, functions)
- Naming: camelCase by default
- Classes: PascalCase (e.g., `Player`, `Renderer`, `Random`)
- Files: lowercase, single word (e.g., `renderer.js`, `random.js`, `camera.js`)
- Structure: 1 file = 1 module = 1 class = 1 component
- Documentation files: lowercase (e.g., `renderer.md`, `random.md`)

---

## Architecture Overview

Pixel Creator is split into two strictly separated layers:

- **Engine Core (`src/`)**
  - Runtime logic
  - Rendering
  - Physics
  - Networking
  - Component behavior

- **Editor (`editor/`)**
  - Visual IDE
  - Drag-and-drop workflows
  - Visual scripting
  - Real-time collaboration tools

The editor **never mutates engine state directly**.  
All communication goes through the event system.

---

## Core Architectural Principles

### Object–Component Pattern

Objects are **dumb containers**.  
Components contain **all behavior and logic**.

```javascript
const obj = new Object('Player', 0, 0, 32, 32);
obj.addComponent(new Texture('player.png'));
obj.addComponent(new Controller());
scene.add(obj);
```

Rules:
- Components are imported exclusively from /src/core/mod.js
- Never import components from deep paths
- Components must remain modular and independent
- Access components via: `obj.getComponent(ComponentClass)`

---

### Event-Driven Communication

All state changes go through the global event bus.
No direct mutation. No shortcuts.

Core API:
- System.dispatchEvent(eventName, payload)
- System.addEventListener(eventName, callback)

Important events:
- `add`, `remove`, `instantiate`, `destroy` → object lifecycle
- `setCurrentObject` → editor selection
- `addComponent`, `import`, `removeComponent` → component lifecycle
- `setProperty` → property changes + local editor update
- `syncProperty` → authoritative network sync

Events are synchronous.
Listener order matters.

---

### Property Synchronization Model

Objects expose a two-layer property system.

Local editor update:
```javascript
obj.setProperty('x', 100);
```

Network synchronization:
```javascript
obj.syncProperty('x', 100);
```

This separation allows:
- Immediate local feedback in the editor
- Never assign properties directly
- `setProperty` updates UI and editor state
- `syncProperty` propagates changes to server and clients
- Network sync must be explicit and intentional

---

### Rendering Model

Rendering is fully component-driven.

```javascript
export class CircleRenderer extends Component {
    render(ctx, camera) {
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(
            this.x - camera.x,
            this.y - camera.y,
            this.radius,
            0,
            Math.PI * 2
        );
        ctx.fill();
    }
}
```

If something is visible, it owns a renderer component.
No implicit rendering logic.

---

## Multiplayer & Collaboration

Pixel Creator is **multiplayer by design**.

Key principles:
- Real-time gameplay
- Deterministic logic when possible
- Avoid RNG-driven advantages

Collaboration:
- Multiple users can edit the same project simultaneously
- Property changes are synchronized live
- The editor reflects authoritative engine state in real time

---

## Editor Responsibilities

The editor is responsible for:
- Provides visual tooling only
- Converts user actions into engine events
- Manages project files and assets

Editor subsystems:
- Scene view (canvas)
- Object hierarchy panel (objects tree)
- Properties (components and values)
- Project (assets)
- Graph (visual scripting & behaviors)
- Handler (canvas interactions)
- Timeline (animations & sequences)
- Collaboration (real-time multi-user editing)
- Settings (project configuration)
- Toolbar (common actions)
- Menu (file, edit, view, help)
- Modal (dialogs & prompts)
- Notifications (user feedback)
- Shortcuts (keyboard bindings)
- Context menu (right-click actions)
- History (undo/redo)
- Search (find objects, assets, components)

If logic belongs to the game, it belongs in the engine.

---

## Modularity & Extensibility

Pixel Creator uses a modular architecture:
- Core modules are minimal (e.g., Renderer, Physics, Networking = 3 modules = 3 classes)
- Components are independent and reusable
- New components can be added without modifying core code
- Additional functionality is opt-in
- Modules must remain isolated and interoperable
- Avoid monolithic classes or god objects

A future marketplace will allow:
- Sharing custom modules
- Downloading community-created components
- Selling assets
- Extending engine capabilities safely

---

## Known Constraints & Reality

Pixel Creator is a work in progress.
- The project is developed by a single developer
- Infrastructure is currently limited
- Connection limits exist during beta
- Stability and clarity are prioritized over feature count
- Some advanced features may be deferred or simplified
- Feedback from early users is actively sought
- The engine will evolve based on real-world usage and needs
- Documentation will improve over time
- The focus remains on accessibility and ease of use

Any suggestion must respect these constraints.

---

## Infrastructure & Tools

### PixelBot (Discord Bot)

- **Platform** : Deno (JavaScript) hosted on Raspberry Pi
- **GitHub** : Collaborator with write access
- **Git identity** : `PixelBot <bot@pixelcreator.io>`
- **Branch** : Commits to `sandbox` branch for review before merge
- **Repo path on Pi** : `~/PixelCreator`

**Future capabilities** (to be developed):
- Discord commands (`/deploy`, `/status`, `/sync`)
- GitHub notifications on Discord
- Automated deployments
- AI-assisted code generation (requires API key)

### Workflow Preferences

- Local file editing preferred (faster iteration)
- Commit/push from local PowerShell (developer's account)
- Manual validation before push
- PixelBot reserved for future automation tasks only

---

## Summary / Final Reminders

When contributing to Pixel Creator, always remember if a suggestion:
- Adds complexity for the user
- Breaks beginner accessibility
- Obscures engine behavior
- Requires advanced knowledge to debug

Then it must be rejected.

Pixel Creator exists to empower creators —
not to impress engineers.