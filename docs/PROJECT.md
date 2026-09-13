# Pixel Creator — Project

> Entry document. Read in order: `PROJECT.md` → `ARCHITECTURE.md` → `MIGRATION.md` → `CONVENTIONS.md`.

## 1. What Pixel Creator is

A 2D game creation environment **in the browser**, multiplayer-oriented, built around three
verbs:

```
CREATE  →  PLAY  →  SHARE
```

The creator opens the editor, composes a scene, presses Play, watches the game run, and
shares it. The network is meant to be invisible to them.

It is **not** a Unity/Godot clone, not an academic ECS, not a generic framework. It is a
product with ergonomics of its own, and those must be preserved.

## 2. The product vocabulary

The vocabulary has been stable since the beginning and does not change in v2:

| Term | Meaning |
|---|---|
| `Project` | A game: its scenes, its resources, its identity |
| `Scene` | A set of `Object`s |
| `Object` | A scene entity — **never** renamed `Entity` |
| `Component` | A piece of behaviour/data attached to an `Object` |
| `Property` | An observable value of an `Object` or a `Component` |
| `Resource` | A project file (image, script, graph) |

```
Project
└── Scene
    └── Object
        ├── Object
        ├── Object
        └── Component…
```

## 3. The two ideas that define the project

All of Pixel Creator's ergonomics rest on two historical mechanisms. They are the reason the
project deserves to be modernized rather than rewritten.

### 3.1 Writing a property is the communication channel

`object.x = 100` does not merely change a value: it propagates the information to every view
and, on request, to the network. The user never writes `network.updateProperty(...)`.

**These ergonomics are non-negotiable.** (see `architecture/CORE.md`)

### 3.2 The Core is shared between client and server

The historical server literally imports the same module as the client:

```js
import * as components from 'https://editor.pixelcreator.io/src/core/mod.js';
```

There is no `ServerObject` and no `ClientObject`. The server runs `obj.update()`; the client
runs `obj.update()` and then `obj.draw()`. That symmetry is a major asset.
(see `architecture/NETWORK.md`)

## 4. The Editor's role

The Editor is not an external tool driving the engine: it is an **administrator view onto a
live runtime**. The creator must be able to watch the game, see the connected players, modify
an object and see the effect immediately — including while the game is running.

That is why the Editor and the Runtime share the same `Scene` and the same `Object`s, rather
than two synchronized copies.

## 5. Game identity

**SETTLED** (ADR-0010). A game is identified by an opaque ID, not by its name:

```
play.pixelcreator.io/7f3a91c2
```

```json
{ "id": "7f3a91c2", "name": "Medieval Arena" }
```

Two games may carry the same name. A cosmetic slug may be added later as an alias, never as
identity.

**OBSERVED IN LEGACY.** There is currently no persisted notion of a `Project`: the server
scene is a singleton (`let scene = new Scene()`), with no identity and no project name.
Everything remains to be built.

## 6. Out of scope for the initial v2

- **Real-time multi-user collaboration.** A future direction. The architecture must not make
  it impossible, but it is not implemented now.
- **AI integration.** Lya is a separate project (an autonomous agent written in Rust). Pixel
  Creator must work perfectly without Lya and never depends on it.
- **Marketplace, forum, blog.** Other parts of the website, outside the engine.

## 7. Structural constraints

- **Native.** No React/Vue/Angular/Svelte. Web Components, DOM, JS classes.
- **No heavy dependencies.** The project must stay readable end to end.
- **The historical server stays private.** It must never be committed to the public
  repository. See `architecture/NETWORK.md` for its analysis, done from an external copy.
- **`legacy/` is read-only.** A functional reference archive. We read it, compare against it,
  document it; we do not refactor it.

## 8. Guiding sentence

> Modernize Pixel Creator, do not replace it.
> Keep the magician, improve the wand.

Every architecture decision has to be held up against that sentence. Never modernize
something merely because another approach looks more modern — the repository already holds a
documented counter-example (see `migration/LEGACY_ANALYSIS.md`, the "private fields" section).
