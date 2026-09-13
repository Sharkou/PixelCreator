# Repository structure

```
PixelCreator/
├── README.md              Project landing page
├── CONTRIBUTING.md        How to contribute
├── SECURITY.md            How to report a vulnerability
├── CHANGELOG.md           What changed
├── LICENSE.md             The licence (custom — see below)
│
├── src/                   Pixel Creator v2 — all of it
│   ├── core/              The shared model. No DOM, no dependencies
│   ├── project/           Identity, resources, storage, loading
│   ├── runtime/           The simulation: loop, rendering, input, physics, audio, scripting
│   ├── editor/            The editor application
│   └── preview/           The game client, and the editor↔game seam
│
├── tools/                 Development tooling. Nothing here ships
├── docs/                  All documentation (this folder)
├── legacy/                The previous engine — READ-ONLY reference
└── .github/               Issue and PR templates, CI, Copilot instructions
```

## `src/` — the five layers

### `src/core/` — the shared model

The foundation. It depends on **nothing**: no DOM, no rendering backend, no network, no
editor, not the project layer. That is what lets a server run the same model as a browser, and
what lets the whole of it be tested under Node.

| Path | Holds |
|---|---|
| `object.js` | `Object` — name, tag, layer, active, children, components |
| `component.js` | The `ComponentRegistry` and the component contract |
| `scene.js` | `Scene`, and hierarchy order |
| `definition.js` | `defineComponent()` — a component type built from a definition |
| `properties/` | The Property System: `reactive.js`, `types.js`, `origin.js` |
| `operations/` | `Operation`, `Operations` pipeline, `invert()`, `Authority` |
| `components/transform.js` | `Transform`, and hierarchical matrix composition |
| `graph/` | The `.px` model: `graph.js`, `nodes.js`, `standard.js`, `validate.js`, `definition.js` |
| `serialize.js` | Explicit serialization, with structural order |
| `resources.js` | The registry of resolved resources a runtime is handed |
| `prefab.js`, `tileset.js`, `animation.js` | Resource payload formats |
| `math/matrix.js` | `Matrix` |
| `id.js` | `createId()` — one notion of identity in the whole product |
| `mod.js` | The public entry point |

`mod.js` is the barrel. Import from it, not from individual files, outside the layer.

### `src/project/` — identity and storage

What a project *is*, and how it survives the tab. It sits between the editor and the core, and
reaches neither the editor nor the runtime — because a headless server has to load the same
project a browser does.

| Path | Holds |
|---|---|
| `project.js` | `Project` and the manifest |
| `resource.js`, `resources.js` | `ResourceKind`, resource entries, ids |
| `store.js` | The `ResourceStore` interface, and the in-memory one |
| `persistence.js` | `PersistentResourceStore` over a key-value area; `MemoryArea` |
| `indexeddb.js` | `IndexedDbArea` — the browser half, about forty lines |
| `folders.js`, `scenes.js`, `graphs.js`, `prefabs.js` | Per-kind helpers |
| `image.js` | Reading an image's size out of its header, without decoding |
| `naming.js` | Unique names, extensions per kind |

### `src/runtime/` — the simulation

Everything here runs unchanged on a server, except that a server builds a `Runtime` with no
renderer and therefore never draws.

| Path | Holds |
|---|---|
| `runtime.js` | The `Runtime` and its step order |
| `clock/` | Fixed-step clock |
| `rendering/` | Renderer abstraction, Canvas 2D backend, camera, viewport, draw spaces |
| `rendering/components/` | The renderers: rectangle, sprite, sprite animator, text, particles |
| `input/` | Abstract input, indexed by owner and passed in |
| `collision/`, `physics/` | Colliders, broad phase, collision snapshot, `Body`, movement |
| `tilemap/` | `Tilemap` and `TilemapCollider` |
| `audio/` | Audio output abstraction, HTML backend, `AudioSource` |
| `scripting/` | `Behaviors`, and the headless graph `interpreter.js` |
| `random/` | The seeded stream a simulation draws from |
| `session-state.js` | What survives a change of scene |
| `builtins.js` | The fifteen component types the engine ships |
| `errors.js` | Error isolation and reporting, separate from policy |

### `src/editor/` — the editor

Everything here needs a DOM. The editor depends on the runtime and the core; neither depends
on it.

| Path | Holds |
|---|---|
| `editor.js` | The composition root — builds the model, the windows, the shortcuts |
| `windows/` | `hierarchy`, `inspector`, `project`, `graph`, `timeline`, `toolbar`, `documents`, `drop`, `search` |
| `inspector/` | Schema-driven field description: `schema`, `definition`, `node`, `resource`, `list` |
| `viewport/` | The scene surface, picking, overlay, resize, zoom, grid, guides |
| `viewport/tools/` | `select-tool`, `pan-tool`, `tile-tool` |
| `graph/` | The graph canvas's geometry (`view.js`) and its colour palette |
| `ui/` | Web Components and primitives: `window`, `field`, `menu`, `tabs`, `splitter`, `number`, `scrub`, … |
| `dnd/` | The cross-cutting drag-and-drop system: `payload`, `rules`, `reflow`, `files` |
| `project/` | `Workspace`, autosave, the project library, definitions, session, reconcile |
| `commands.js` | Editorial commands — create, delete, add component, reparent |
| `history.js` | Undo/redo: one stack per resource |
| `selection.js`, `subject.js` | Selection, and selection *intent* |
| `transport.js` | Play / Pause / Stop |
| `preview.js`, `live.js` | Opening a Preview, exporting, and keeping Previews in step |
| `registry.js` | Which component types this application knows, and how the menu reads them |
| `layout.js` | Where the windows are and how big — the only non-model state the editor owns |
| `index.html` | A mount point, and nothing more |

### `src/preview/` — the game client

The other top of the graph. It may reach `project/`, `runtime/` and `core/`, and **never**
`editor/` — a game client that could import the editor would be an editor with its panels
hidden.

| Path | Holds |
|---|---|
| `bundle.js` | `bundleProject()` / `openBundle()` — the seam, and it touches no DOM |
| `store.js` | Where a bundle is kept, and the two URL shapes `#p/<id>` and `#u/<url>` |
| `client.js` | The client application |
| `live.js` | The channel that carries editor edits to a running game |
| `input.js` | Browser input, adapted |
| `index.html` | The game page |

## `tools/`

| Path | What it is |
|---|---|
| `test.sh` | The unit test runner — `node --test` over `src/**` and `tools/**` |
| `layers/` | Layer-dependency rules, and the dead-import check |
| `check-boot.js` | Every module the entry points reach actually loads |
| `check-exports.js` | Every named import designates an export that exists |
| `check-css-literals.js` | No stray backtick inside a CSS template literal |
| `check-links.js` | Every relative Markdown link resolves to a file that exists |
| `parity/` | 39 scenarios captured from Legacy, replayed against v2 |
| `bench-*.mjs` | Collision, physics and tilemap benchmarks |
| `demo/` | Small hand-written games that use the engine without the editor |
| `dev-server.py`, `dev-server.sh` | A static server that refuses to be cached |

Nothing in `tools/` ships. Everything in it is documented in
[Testing and verification](testing.md).

## `docs/`

See the [documentation index](../README.md). In short: `user/` and `developer/` are the two
public entry paths, `PROJECT.md` / `ARCHITECTURE.md` / `CONVENTIONS.md` / `architecture/` /
`decisions/` are the authoritative specification, and `reference/`, `archive/`, `migration/`
and `audit/` are historical.

## `legacy/`

The previous engine, **read-only**. It answers *"how did Pixel Creator actually behave?"*, not
*"how should v2 be implemented?"*. Never commit into it.

Its absolute imports (`/src/core/object.js`) mean it must be served with `legacy/` as the HTTP
root — which is why `tools/dev-server.sh` defaults to it.

## `.github/`

| Path | What it is |
|---|---|
| `workflows/ci.yml` | The CI pipeline |
| `ISSUE_TEMPLATE/` | Bug, feature, documentation, task |
| `PULL_REQUEST_TEMPLATE.md` | The PR checklist |
| `CODEOWNERS` | Review routing |
| `release.yml` | Release-note categories |
| `copilot-instructions.md` | Guidance for AI coding assistants |

`.agents/` at the repository root holds the same kind of guidance in a tool-neutral form.

## What is deliberately absent

| Absent | Why |
|---|---|
| `package.json`, `node_modules/` | No dependencies, and nothing to install |
| A bundler, a transpiler, a watcher | Native ES modules, served as they are |
| `src/network/` | There is no networking code. The layer rules reserve the name |
| A desktop wrapper (Electron, Tauri) | Pixel Creator is web-first on purpose |
| A `dist/` build | `.gitignore`d; nothing produces one today |
