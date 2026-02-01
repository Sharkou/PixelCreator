# Pixel Creator Documentation & Guidelines

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
- Wiki pages: PascalCase (e.g., `Renderer.md`, `Camera.md`, `Vector.md`)

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
- **Branch** : Commits to `sandbox` branch for review before merge (code), or `master` directly (wiki)
- **Repo path on Pi** : `~/PixelCreator`
- **Wiki path on Pi** : `~/PixelCreator.wiki`

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
- When user shares useful information to remember, add it to this file automatically

### Useful Links

- **Website**: https://pixelcreator.io
- **GitHub**: https://github.com/Sharkou/PixelCreator
- **Discord**: https://discord.gg/X8scDNX
- **Wiki**: https://github.com/Sharkou/PixelCreator/wiki
- **Contact**: contact@pixelcreator.io
- **Presentation**: https://docs.google.com/document/d/1ujmM65EZabiN6_Wxxp7lpiCNUaSDuFDV92dQ8SjPsPU/edit?usp=sharing

### Subdomains

| Subdomain | Purpose | Access |
|-----------|---------|--------|
| `pixelcreator.io` | Main website | Public |
| `docs.pixelcreator.io` | User documentation (also: sharkou.github.io) | Public |
| `editor.pixelcreator.io` | The game engine editor | Public |
| `console.pixelcreator.io` | User project & server management panel | Public |
| `store.pixelcreator.io` | Marketplace (modules, assets, games) | Public |
| `play.pixelcreator.io` | Game launcher / developer's game | Public |
| `apps.pixelcreator.io` | Community-created apps and games | Public |
| `blog.pixelcreator.io` | Blog articles | Public |
| `forum.pixelcreator.io` | Forum (TBD, Discord may replace) | Public |
| `admin.pixelcreator.io` | Internal project & server management | Private |

### Business Model

- **Offline mode**: Free (no server required)
- **Online mode**: Subscription-based (server rental for multiplayer)
- Dynamic creation and automated deployment of game servers
- Focus on ease of use for multiplayer without server management

---

## Project Presentation (Full Text)

**Author**: Sharkou, creative developer

### Genesis

There are countless game engines, but none suited the creator's needs. Learning such software requires many hours, even for programmers. Adding multiplayer is even harder — countless forum posts ask "how to make a MMORPG?" with no clear answer.

These problems led to Pixel Creator: not another Game Maker clone, not competing with Unity/Unreal, but a **simple yet effective solution** for creating online games accessible to beginners.

### What is Pixel Creator?

A **multiplayer game creation tool**, accessible online, designed for beginners. It enables creation of online games (MOBA, MMO, .io games) with a graphical interface.

Current features:
- **Visual editor**: Scene navigation, object hierarchy, resource management
- **Visual scripting**: Event-based programming system for behaviors
- **Properties manager**: Components, particle systems, lighting
- **Core system**: Nearly complete, supports .io games in 2D environment

Alpha available at: **pixelcreator.io** (Chrome recommended)

### Upcoming Features (Beta)

- Material and sprite editor
- Map editor
- Animation editor
- Audio mixing
- And more...

### Technology

- **Language**: JavaScript (ES7+), HTML5 interface
- **Libraries**: None (everything custom-built = lightweight, flexible, performant)
- **Real-time sync**: Property synchronization in real-time

**APIs Used**:
- Canvas API + WebGL for graphics
- Fullscreen API
- Web Audio API for sound
- Gamepad API for controllers
- Web Storage API for saves
- WebSocket API for real-time networking

**Servers**: Written in Rust, running in secure environment. When creating a project, a server is automatically deployed. Collaborators can edit in real-time.

**Current Infrastructure**: Raspberry Pi (most powerful model) for testing. Limited to 4 simultaneous connections per project during beta.

### Project Goals

1. Create a **simple, beginner-accessible** multiplayer game creation tool
2. No existing solution lets beginners easily create flexible online games in persistent worlds
3. Leverage modern web technologies and architectures
4. **Community dimension**: Open source core + editor at https://github.com/Sharkou/PixelCreator (server code obfuscated for security)
5. Future **distribution platform** for community projects and modules
6. Eventually: dedicated servers instead of Raspberry Pi for massively multiplayer projects

### Unique Features

**Simplicity**
- Accessible to all, especially beginners
- Drag & drop + visual scripting = no programming required

**Portability**
- Runs directly in browser (multiplatform)
- Projects stored in cloud (accessible anywhere, shareable)

**Connectivity**
- Built specifically for multiplayer
- No server management needed (handled internally)
- Real-time collaboration for team game development

**Flexibility**
- Modular architecture (like Unity's Asset Store)
- Future marketplace for custom modules

**Stability**
- No version update concerns (always latest stable)
- Independent modules prevent dependency issues

**Performance**
- Benefits from V8 (Chrome) and WebAssembly
- Hardware acceleration when available
- Multithreading via Web Workers
- Future optimizations: WebAssembly for objects/vectors, WebGPU for graphics

### Contact

- **Discord**: https://discord.gg/X8scDNX
- **Website**: pixelcreator.io
- **Email**: contact@pixelcreator.io

---

## Code Style Guidelines

### JSDoc Comments

**File structure**: First line must be `import` or `export class`. No class-level JSDoc comments.

**DO**: Put description in constructor JSDoc
```javascript
export class Vector {
    
    /**
     * Create a new vector for physics and transformations
     * @param {number} x - The x component
     * @param {number} y - The y component
     * @param {number} z - The z-index for depth sorting
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
```

**DON'T**: Class-level comments or verbose property JSDoc
```javascript
// BAD - class-level comment
/**
 * 2D Vector mathematics class
 * Provides vector operations...
 */
export class Vector {

// BAD - verbose property JSDoc
/** @type {boolean} Whether the button is enabled */
this.enabled = true;

// GOOD - clean
this.enabled = true;
```

**Static classes**: No JSDoc needed (no constructor to document).

**Be minimal**: Don't over-explain. The engine will evolve. Use `//` only when truly needed.

---

## Technical Guidelines

### Rendering Separation

**Canvas (game frames only):**
- Animations
- Sprites
- Tilemaps
- Particles
- Lights
- Game visuals

**HTML/DOM (UI elements):**
- Buttons
- Text/Labels
- HUD elements
- Menus
- Dialogs
- Any user interface

UI components must **never** render on the canvas context.

### Vector Class

- The `z` component exists only for **z-index ordering** (depth sorting)
- The engine is strictly **2D** — no 3D rendering
- Z is not used for 3D calculations, only layer ordering

### Multiplayer Focus

- The engine's core value proposition is **multiplayer made easy**
- Dynamic server creation and automated deployment
- Users don't manage servers — the platform does
- Deterministic game logic when possible

---

## Wiki Documentation Format

When creating or updating wiki pages, follow this structure:

**Header format (NO `# Title` - GitHub Wiki displays title from filename):**
```markdown
Short description of the class.

\`\`\`js
import { ClassName } from '/src/path/to/file.js';

const instance = new ClassName();
\`\`\`

---
```

**Sections (in order, each separated by `---`):**
1. `## Parameters` – Constructor parameters table
2. `## Properties` – Each property as `### propertyName` with Parameters table and Example
3. `## Methods` – Each method as `### methodName()` with Return table, Parameters table, and Example

**Table format:**
```markdown
| Name | Type | Description |
|------|------|-------------|
| name | `type` | Description with \`backticks\` for types/classes |
```

**Rules:**
- **NO `# Title`** at the start (wiki auto-generates from filename)
- Start directly with the short description
- Import + instantiation in ONE code block (use `js` not `javascript`)
- Use `---` horizontal rules as section separators
- Use backticks for types in tables (e.g., `number`, `string`, `Element`)
- Keep descriptions concise and beginner-friendly

---

## AI Agent Memory Instructions

When the user says "mémoriser", "enregistrer", "retenir", or "remember":
- Add the information to this file (`copilot-instructions.md`)
- This ensures persistence across sessions
- Always confirm what was saved

---

## Summary / Final Reminders

**Pay attention to details.** When analyzing examples, documentation, or code:
- Note EVERY detail, not just the global structure
- Compare character by character when needed
- Don't assume — verify
- If the user shows an example, replicate it exactly

When contributing to Pixel Creator, always remember if a suggestion:
- Adds complexity for the user
- Breaks beginner accessibility
- Obscures engine behavior
- Requires advanced knowledge to debug

Then it must be rejected.

Pixel Creator exists to empower creators —
not to impress engineers.