<div align="center">

# 🎮 Pixel Creator

**Make 2D games in your browser. No installation, no code, no account.**

### [▶ Launch Pixel Creator](https://editor.pixelcreator.io)

[![Documentation](https://img.shields.io/badge/Docs-User%20%26%20Developer-2ea44f?style=flat-square)](docs/README.md)
[![Status](https://img.shields.io/badge/Status-Alpha-orange?style=flat-square)](#project-status)
[![Website](https://img.shields.io/badge/Website-pixelcreator.io-blue?style=flat-square)](https://pixelcreator.io)
[![Discord](https://img.shields.io/badge/Discord-Join%20us-7289da?style=flat-square&logo=discord&logoColor=white)](https://discord.gg/X8scDNX)
[![Licence](https://img.shields.io/badge/Licence-Custom-lightgrey?style=flat-square)](LICENSE.md)

</div>

<!--
  Screenshots go here once they exist. None are committed on purpose: an invented or
  out-of-date screenshot of an editor that changes every week is worse than none.
-->

---

## What Pixel Creator is

A **2D game editor that runs entirely in a web browser**. You open a page, arrange objects in a
scene, give them behaviour by drawing a graph, press Play, and your game runs.

It is built for people who want to make a game without first learning to program — and it is
built on an engine clean enough that programmers want to read it.

- 🌐 **Web-first** — nothing to download, nothing to install
- 🎯 **Beginner-friendly** — a visual editor, drag and drop, and visual scripting instead of code
- 🧩 **Object + Component** — one simple mental model for everything in a scene
- 🔌 **Zero dependencies** — plain JavaScript, ES modules, no build step, no framework
- 🧪 **Verified** — ~2 300 tests, layer rules, and a parity harness against the previous engine

### Who it is for

| You are… | Start here |
|---|---|
| Someone who wants to **make a game** | [Getting started](docs/user/getting-started.md) |
| Curious about **how it is built** | [Developer documentation](docs/developer/README.md) |
| Here to **contribute** | [CONTRIBUTING.md](CONTRIBUTING.md) |

## Quick start

1. Open **[editor.pixelcreator.io](https://editor.pixelcreator.io)**.
2. Click an object in the scene and drag it around.
3. Press **Add Component** in the Inspector to give it something to do — a Sprite, a Body, a
   Camera.
4. Press **Add Component ▸ New ▸ Custom Component** to draw a behaviour, and wire
   **On Update** into **Translate**.
5. Press **Play**.

The ten-minute version, in full: **[Getting started](docs/user/getting-started.md)**.

## What it can do today

Only what is actually implemented is listed here.

| | |
|---|---|
| **Editor** | Scene viewport, Hierarchy, Project browser, schema-driven Inspector, resizable panels, document tabs |
| **Objects** | Hierarchy with parent/child transforms, layers, tags, per-object active and lock |
| **Components** | 15 shipped types: Rectangle, Sprite, Sprite Animator, Text, Particles, Tilemap, Screen Space, Audio Source, Transform, Velocity, Body, Box Collider, Tilemap Collider, Follow, Camera |
| **Visual scripting** | `.px` graphs with 77 nodes — events, input, flow, time, objects, properties, transform, animation, audio, values, text, maths, comparison, logic, debug |
| **Custom components** | A `.px` graph *is* a component type, with its own properties in the Inspector |
| **Resources** | Scenes, images, sounds, prefabs, animations, tilesets, folders — all drag-and-droppable |
| **Tilemaps** | Cut a tile sheet into a tileset, paint the level in the viewport, make it solid |
| **Physics** | Velocity, gravity, solid and detect-only box colliders, tilemap collision |
| **Rendering** | Canvas 2D, cameras, layers, world and screen space |
| **Play mode** | Play / Pause / Stop on the live scene; Stop restores it exactly |
| **Preview** | The game in its own window, kept in step with the editor as you edit |
| **Persistence** | Projects saved in the browser, autosaved, with undo/redo per document |
| **Export** | A `.pxgame.json` bundle, playable from any static host |

### What it cannot do yet

Stated plainly, because older documentation promised some of it:

- ❌ **No multiplayer and no networking.** There is no networking code in this repository. The
  architecture is built to support it — every change is an operation with an authority check, and
  the simulation is deterministic from a seed — but none of it is running.
- ❌ **No real-time collaboration.**
- ❌ **No accounts, and no publishing to a URL from the editor.** Export gives you a file you can
  host yourself.
- ❌ **No marketplace.**
- ❌ **No animation timeline.** Sprite animations exist as resources; the Timeline panel is an
  empty shell and says so.
- ❌ **No desktop build.** Pixel Creator is web-first by design.

## Documentation

Everything is in this repository, in [`docs/`](docs/README.md) — versioned alongside the code.

| | |
|---|---|
| 📖 **[Documentation index](docs/README.md)** | Both entry paths |
| 🎮 **[User guide](docs/user/README.md)** | Making games: editor, components, graphs, tilemaps, prefabs, export |
| 🛠 **[Developer documentation](docs/developer/README.md)** | Setup, architecture, extension points, testing |
| 🧭 **[Architecture & ADRs](docs/PROJECT_MEMORY.md)** | The specification and 72 decision records *(in French)* |

> The GitHub Wiki is **no longer** the documentation. `docs/` is the single source of truth.

## Contributing

Contributions are welcome — bug fixes, editor UX, new components, new graph nodes,
documentation, demos.

Read **[CONTRIBUTING.md](CONTRIBUTING.md)** first. The short version:

```bash
git clone https://github.com/Sharkou/PixelCreator.git
cd PixelCreator
tools/dev-server.sh 8080 .        # then open http://localhost:8080/src/editor/index.html
tools/test.sh                     # ~2300 tests, no dependencies to install
```

Branch off `master` as `feat/…`, `fix/…`, `docs/…`, `refactor/…` or `test/…`, run the
verification suite, and open a pull request against `master`.

| | |
|---|---|
| 🐛 [Report a bug](https://github.com/Sharkou/PixelCreator/issues/new?template=bug_report.md) | |
| 💡 [Request a feature](https://github.com/Sharkou/PixelCreator/issues/new?template=feature_request.md) | |
| 📝 [Report a documentation problem](https://github.com/Sharkou/PixelCreator/issues/new?template=documentation.md) | |
| 🔒 [Report a vulnerability](SECURITY.md) | Please do not open a public issue |
| 📦 [Releases](https://github.com/Sharkou/PixelCreator/releases) · [Changelog](CHANGELOG.md) | |

## Project status

**Alpha, under active development.** The editor works and games run, but interfaces still move
between commits and there is no stability guarantee yet. Where a panel is not finished, it says
so rather than faking a feature.

**Your projects live in your browser.** There is no cloud storage and no account system. Use
*Share ▸ Export game…* to keep a copy of anything that matters.

Release policy: [docs/developer/releases.md](docs/developer/releases.md).

## Licence

Pixel Creator uses a **custom licence** — see [LICENSE.md](LICENSE.md). It is **not** an OSI
open-source licence, and the repository does not claim to be open source.

In short: you may use and modify the client/editor code for personal or educational purposes,
and redistribute modifications as marketplace modules or extensions with attribution. You may
not sell the engine or editor as a whole, and you may not run your own Pixel Creator server.

The server is not in this repository and is not covered by this licence.

Read the licence itself before doing anything beyond using the editor. If the terms do not fit
your use, open an issue or ask on Discord.

---

<div align="center">

Made with ❤️ by [Sharkou](https://github.com/Sharkou)

[Launch the editor](https://editor.pixelcreator.io) ·
[Website](https://pixelcreator.io) ·
[Discord](https://discord.gg/X8scDNX) ·
[Documentation](docs/README.md)

</div>
