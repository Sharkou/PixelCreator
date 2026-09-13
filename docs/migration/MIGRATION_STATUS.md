# Migration status

**Last updated:** 2026-09-12

## Current phase

```
Understand → Map → Document → Compare → Propose → Get it accepted ✅
    → ◄ IMPLEMENT → Test → Compare against Legacy → Document
```

**Phase 0 closed. Decisions accepted on 2026-08-12. Implementation under way.**

No file in `legacy/` has been modified.

### Steps completed

| Step | Contents |
|---|---|
| **1** | Parity harness — 39 scenarios captured from Legacy (`tools/parity/`) |
| **1 bis** | `tools/dev-server.sh` serves `legacy/`; `tools/layers/run.js` checks the layers |
| **2** | `core/` — `Object`, `Component`, `Scene`, the Property System (Proxy), Operations, Authority, events, explicit serialization, identity |
| **2.8** | `Transform`, matrices and hierarchical composition; the renderer abstraction; the Canvas 2D backend; `SceneRenderer`; `RectangleRenderer`, `Sprite`, `ParticleSystem`, `Tilemap`; `Runtime`; `Clock` |
| **2.9** | The runtime error model — isolation and reporting separated from policy (ADR-0012) |
| **2.10** | `runtime/input/` (ADR-0014); `Camera` / `Viewport` and world↔screen conversions (ADR-0013); the `runtime/scripting/` foundation — **revised**: a Component may have a `.px` graph that defines its behaviour, and there is no `Script` Component (ADR-0015) |

| **2.11** | Component definition — properties + graph, `defineComponent()` (ADR-0016); the four Component forms locked down and tested (ADR-0004); `preview()` removed from the contract; verification of the foundations before the Editor |
| **3** | **The Editor's first vertical slice** — Shell, a Viewport over the real Runtime, editorial selection and picking (ADR-0017), Hierarchy, a schema-driven Inspector, adding/removing Components. Core addition: the `Scene`'s five structural events |
| **3.1** | **Editor UX-2** — a resizable window shell (`window` / `tabs` / `splitter` / `layout`), a Hierarchy with search and per-row actions, Viewport tools (`select-tool` / `pan-tool`), a parameterized 8-direction resize, smoothed zoom, cursor guides, an Inspector with typed controls, a drag-to-create toolbar, Project / Timeline shells |
| **3.2** | **Modern Pixel — design system** (`795a545`): tokens with semantic roles, a coral accent, `row` / `control` / `hit` density, icons rendered at two sizes (16 / 20), named z layers, easing and durations. The Legacy palette abandoned |
| **3.3** | **Modern Pixel — Viewport** (`bb8268a`): a DPR backing store, DPR change detection, robust resize, optimized picking and grid, a cache of DOM measurements, coalesced `pointermove`, a *dirty* render loop, touch and pinch zoom |
| **3.4** | **Modern Pixel — Inspector** (`a38d90e`, `2cc7411`): `.row > .label + .fields`, the grid belongs to the Inspector, `px-field` reduced to a cell, scrub, stacked steppers, monospace values; `box-sizing` restored in the sheet adopted by the Shadow Roots |
| **3.5** | **Modern Pixel — chrome, windows and the L4 layout**: `window` / `hierarchy` / `menu` / `splitter` / `tabs` / `toolbar` / `editor` converged, the block of temporary aliases **removed**, `px-dock` split into `px-project` and `px-timeline`, the L4 layout (Hierarchy and Project on the left, an Inspector in an unbroken column, a conditional Timeline) |

| **4** | **Structural order and structural Operations** (ADR-0018 to ADR-0024): `PropertyType`, ordered collections, ordered Component storage, structural primitives, `seq` per pipeline, `invert()`, handlers that refuse, v2 serialization with explicit order (`FORMAT_VERSION = 2`), `Matrix.decompose()`, the `project/` layer, the Undo/Redo history, the reparenting policy |
| **4.4** | **The `.px` graph** (ADR-0027): the graph model in the Core (`core/graph/` — nodes, ports, connections, all addressed by **identity**), a node catalogue (events, properties, flow, values, arithmetic, comparison, logic), a Component's user properties with a stable `id` that renaming does not touch, `ComponentDefinition` — the live model of a `.px`, one pipeline and one stack for the whole resource —, `ADD_NODE` / `REMOVE_NODE` / `CONNECT` / `DISCONNECT` / `ADD_PROPERTY` / `REMOVE_PROPERTY` Operations, all invertible, a UI-independent `validateGraph()`, a headless **interpreter** (`runtime/scripting/interpreter.js`, flow pushed / data pulled, a budget, `GraphError`), a **Graph** window in SVG, a multi-editor `Workspace` with opening and **closing**, an Inspector for a `.px`'s properties and for nodes |
| **4.3** | **Project / Inspector / Drag-and-drop coherence** (ADR-0026): `.px` = **one** resource (Component + graph), `active` as the only liveness state (`visible` removed), identical renaming in Project and Hierarchy (a second click) and reactive in the Inspector with **one** undo entry per typing session, the extension determined by the type, `MOVE_RESOURCE` (folder **and** rank), a cross-cutting drag-and-drop system (`editor/dnd/`), Project as an asset browser with previews, categorized `+` menus and `…`, `Share` and a profile in the titlebar |
| **4.2** | **Project / Resource UX** (ADR-0025): folders as `Resource`s and a hierarchy by `parent` link (`MANIFEST_VERSION = 2`), a `+` menu extensible through a table of kinds, breadcrumb navigation, moving by drag and drop, tree deletion in one `batch`, committed renaming (one operation, not one per keystroke), resource selection and deselection in the `Workspace`, the Inspector's `Resource` panel driven by `describeResource()`, image import and replacement, resource icons distinct from window icons |
| **4.1** | **Editor ↔ Project integration**: `Workspace`, the scene declared as a `Resource`, `Ctrl S`, the "unsaved" state derived from the pipeline, `<px-project>` listing the real manifest, reparenting and reordering by drag and drop (Hierarchy and Inspector), a dead-import check in `tools/layers/` |

### Verified state (2026-09-12)

```bash
tools/test.sh                  # 2300 tests, 2300 passed
node tools/layers/run.js       # v2: 0 violations, 0 dead imports — legacy: 1 violation + 2 dead imports, tracked
node tools/parity/run.js       # 39 identical, 0 problems
node tools/check-css-literals.js
node tools/check-boot.js
node tools/check-exports.js
```

Also verified in the browser, with no console error: dropping a Hierarchy row onto another
(nesting) and between two rows (reordering), `Ctrl Z` / `Ctrl Y` on a drop, reordering a
Component by its header, `Ctrl S` and the titlebar's "unsaved" dot. Then, for step 4.2: creating
a Folder, a Scene and a Component from `+`, renaming a resource across several characters and
committing with Enter, undoing and redoing that rename, entering a folder and coming back
through the breadcrumb, moving a resource into a folder by drag and drop, selecting a resource
and reading its properties in the Inspector, renaming it from the Inspector, deselecting with a
click in empty space, deleting a resource and undoing, and confirming that the open scene — like
the folder containing it — refuses to be deleted and says why.

### Three defects found while implementing, and fixed

| Defect | Effect | Fix |
|---|---|---|
| `Scene.reparent()` emitted its events **during** the rearrangement | The Hierarchy rebuilt on a half-moved tree; undoing a drop made the object **disappear** from the tree even though the model was right | The notifications of a rearrangement are held and emitted once the shape is whole (ADR-0019 §3 bis) |
| `Project.deserialize()` replayed one `ADD_RESOURCE` per entry | Reopening a project on a shared store **overwrote every payload** with `null`, and numbered operations nobody had authorized | The manifest is rebuilt by a primitive, never by the pipeline |
| `editor/mod.js` re-exported `./windows/dock.js`, deleted two commits earlier | The Editor's entry point was **unloadable**, and no test could see it | The export was fixed, and `tools/layers/run.js` now fails on any static import that does not resolve |

Gains from the previous passes, still verified: selection by click and from the Hierarchy,
filtering search that keeps ancestors, letter-by-letter renaming Inspector ↔ Hierarchy, `lock` /
`visible` / delete per row, moving and resizing with the handles, pan, zoom, framing, creation by
dragging from the toolbar, persisted seams, the right column collapsing below 760 px.

`src/` contains `core/`, `project/`, `runtime/`, `editor/` and `preview/`. **`network/` does not
exist yet**: what a transport would have to carry already exists — an Operation — and the live
channel between an Editor and its previews is its first demonstration (ADR-0044, ADR-0071).

### What steps 3 and 3.1 added to the Core

Two additions, and only two.

**Step 3**, deliberately closed: the `Scene` announces changes of **shape** —
`component:added` / `component:removed` / `child:added` / `child:removed`, alongside the existing
`added` / `removed`. A property is already observed on the object that carries it; a shape is
not. See `../architecture/CORE.md` §Events.

**This is not a general mutation bus** and the list must not grow without a reason of the same
nature.

**Step 3.1**: `serializeComponent()` writes `active` when the component carries it. `active`
belongs to the Component contract and to no schema, so a Component disabled from the Editor
produced a replicable Operation and then got lost at the next save. See
`../architecture/CORE.md` §Serialization.

### The review pass of 2026-09-12 — what it found

A full reread of the active code, backed by a real walkthrough in the browser. What it fixed, by
family:

**A store that can make you wait was not being waited on** (ADR-0020 §4). `ResourceStore.read()`
has been asynchronous since a persistent store existed (ADR-0065), and four callers read its
answer as a value:

| Where | What a creator saw |
|---|---|
| `preview/bundle.js` | **Preview and Export were broken**: every payload went out as a `Promise`, which `JSON.stringify` writes as `{}` |
| `windows/project.js`, `ui/resource-field.js` | no image thumbnail in a saved project |
| `windows/inspector.js` | a resource's size stayed empty |
| `Project.remove()`, `Project.setPayload()` | undoing a deletion gave back a resource **without its content** |

`PersistentResourceStore.read()` now goes through the same queue as `write()`: a read just after
a save used to answer with the state from before.

**The Editor wrote constantly.** Autosave listened to its own bookkeeping — `dirty: false` after
a write, and the `Origin.LOCAL` `SET_PROPERTY`s from `save()` — so every write asked for another:
**21 IndexedDB writes in three seconds on an Editor nobody was touching**, and a `revision` that
climbed on its own, invalidating every cache that depends on it. Measured at zero after the fix
(ADR-0069 §2).

**Three shipped types had no name.** `Body`, `Follow` and `TilemapCollider` were in
`runtime/builtins.js` and not in the Editor's table: the Add Component menu offered
`TilemapCollider` — the class name — under `Other`, two shelves away from the `Tilemap` it
completes. A test now walks `BUILT_IN` and fails if a type has neither a shelf nor a glyph.

**A reparent overwrote the second half of the rotation.** `decompose()` returns the product
`scaleX · cos(rotationY)`; writing it into `scaleX` without touching `rotationY` applied the
cosine twice — an object rotated by 60° lost half its width at every rearrangement in the
Hierarchy, silently (ADR-0051).

**A graph under construction stopped.** The validator classes "no property chosen" as a warning
so that a graph being written still runs; the interpreter threw on it, at every step, and an
exception unwinds the whole `walk` — so everything wired after the untargeted node stopped
running. See ADR-0072, which also settles the ceiling on suspended waits and the isolation of a
resumed execution that fails.

**A preview followed only two of the three models.** See ADR-0071.

And a few real gaps: `Ctrl D` (the Core knew how to duplicate, nothing in the Editor reached it),
`Escape` abandoning a gesture instead of committing it, a drop onto a `list<resource>`, and the
icon and label of the five components that had none.

### Deliberately left for later

| Subject | Why |
|---|---|
| A browser adapter for input | Belongs to the layer that owns the DOM, not to the runtime (ADR-0014) |
| Opening a **second** scene from the Project panel | Requires rebinding every window to another `Scene`. `Workspace` really does open and close, and holds several editors; so opening one scene closes the other (ADR-0027 §10) |
| Multiple selection, copy/paste and comments in the graph | Each is a gesture with its own questions; shipping half of one makes a canvas unpredictable |
| Migrating instances when a definition changes | An Editor decision, not a runtime one (ADR-0016) |
| A working Timeline | Requires an animation editing model, which the clip format (ADR-0062 §4) does not give on its own |
| The renderer presented as a single type in the Inspector | An open UX question: a `Type ▼` would assert one renderer per Object, which the model does not impose |
| Publishing a game at a URL | `Export game…` writes the bundle a preview reads; hosting it requires accounts and permissions, which are product decisions (ADR-0066 §2) |
| `network/` | What a transport would carry — an Operation — exists; the live channel between an Editor and its previews is its first demonstration (ADR-0044, ADR-0071) |

### What has shipped since

The following lines were in the table above and no longer are, because they exist:

| Subject | Where |
|---|---|
| The `ResourceStore` IndexedDB adapter | `project/persistence.js`, `project/indexeddb.js` (ADR-0065) |
| Play / Pause / Stop in the Editor | `editor/transport.js` (ADR-0029) |
| Prefab (Object → Project) | `core/prefab.js`, `project/prefabs.js` (ADR-0061) |
| Sound import | `runtime/audio/`, the `audio → AudioSource` drop rule (ADR-0060) |
| `runtime/physics/`, `animation/`, `audio/` | All three domains exist (ADR-0059, ADR-0062, ADR-0067) |
| An inline value on an unconnected node input | `node.inputs` (ADR-0031 §1) |
| Dragging a property onto the canvas | The menu offers `Get` and `Set`, explicitly (ADR-0037, ADR-0053) |

### Interface decisions still open

They block elements the mockup draws and the code refuses to invent.

| Subject | Why it is open |
|---|---|
| The `Ctrl K` command bar | There is no registry of commands to query. `openMenu()` places a list, it does not build one. A command system is a piece of work in its own right |
| Family colours | The prototype's direction A gives `--hue-*: var(--accent)`: the four hues exist **only** in direction B. The decision taken limits them to a panel's header icon, but their value is not settled, so no family token was introduced |
| `px-tabs` | It has had no consumer since `px-dock` was split. The primitive is kept and registered; removing it is a decision, not a cleanup |

## Accepted decisions

**The table below stops at ADR-0027, and that is deliberate:** it records the decisions of
Phase 0 and of the first implementation slice. The **complete, current** list of ADRs is in
[`../PROJECT_MEMORY.md`](../PROJECT_MEMORY.md).

| Subject | Decision | Reference |
|---|---|---|
| Property System | `x =` is a direct mutation; `setProperty()` a controlled mutation → Operation. **`$x` removed** | ADR-0003 |
| Operations | Every mutation of the model is representable as an Operation | ADR-0008 |
| Components | One per type; `update`/`draw`/both | ADR-0004 |
| Transform | An ordinary Component, `object.x` as a convenient way in | ADR-0002 |
| Runtime | Domains directly under `runtime/`, no `Systems/` | ADR-0005 |
| Rendering | Canvas 2D + a thin abstraction | ADR-0004 |
| Authority | The server is authoritative; a player mutation ≠ an authorized editor mutation | ADR-0011 |
| Scripting | `.px` = an **interpreted** graph (debuggability, safety), `.js` = native JS | ADR-0009 |
| Editor | `px-*` Web Components, a central model, reactive views | ADR-0006 |
| Runtime errors | The Runtime isolates and reports; it does not modify the model. No auto-disabling | ADR-0012 |
| Camera / Viewport | The camera is an `Object`; the viewport is the screen; the view is derived | ADR-0013 |
| Input | Abstract, indexed by owner, passed to `step()` — never a global | ADR-0014 |
| Scripting | A Component may have a `.px` graph that defines its behaviour. No `Script` Component, no `ScriptSystem` | ADR-0015 |
| User Components | A definition (`type` + properties + graph) yields an ordinary Component; it belongs to the type | ADR-0016 |
| Folders and resources | A folder is a `Resource`; the hierarchy is a `parent` link; the Inspector routes to a table-driven `Resource` panel | ADR-0025 |
| Drag and drop, `.px`, `active` | One rule table for every drop; a Component and its graph are **one** resource; `Object.visible` removed; `MOVE_RESOURCE` carries the rank | ADR-0026 |
| Structural order | The order of Components and of roots is data: persisted, replicated, undoable | ADR-0018 |
| Structural Operations | Seven types for the Scene, two for the Project; `REPARENT` covers four gestures; a handler refuses, it does not throw | ADR-0019 |
| Resources | A single `Resource` unit; an opaque identity, never a path; an asynchronous `ResourceStore`; the `project/` layer | ADR-0020 |
| A Component's identity | A user Component's `type` is the `ResourceId` of its definition | ADR-0021 |
| Reparenting | World placement is preserved, recomposed once by the Editor and sent as numbers | ADR-0022 |
| Property types | `PropertyType` in the Core, `FieldKind` derived on the Editor side | ADR-0023 |
| The `.px` graph | The model in the Core, the interpreter in the Runtime, SVG rendering in the Editor; nodes, ports and connections by identity; a user property carries a stable `id`; a flow that loops is a loop, a data cycle is an error | ADR-0027 |
| Undo / Redo | `invert()` in the Core, `History` in the Editor, one stack per resource, `submit(invert(op))` and never `apply()` | ADR-0024 |
| Legacy projects | No data migration to design | — |
| Renames | `childs` → `children`, `uid` → `owner`, `static` removed | ADR-0001 |

## Open questions

No blocking question. Q7 (the `.px` execution mode) was settled on 2026-08-12:
**interpreted**, for debuggability and safety.

**Q8 — should the Inspector present a single `Renderer [ Type ▼ ]`?** Open since 2026-08-13.
Today an Object may carry `RectangleRenderer` **and** `Sprite` **and** `ParticleSystem`: they all
draw. A single type selector would assert "one renderer per Object" and would make any type
change a removal plus an addition, and therefore a loss of properties. No line of Core is needed
to implement it: what would be decided is the **mental model**, not the technique. In the
meantime, the Add menu groups and renames (`Rendering ▸ Rectangle`), which is compatible with
either outcome.

Minor points remain, decidable at implementation time and listed in the ADRs concerned (for
example, whether `Transform` is added by default).

## Semantic changes relative to Legacy

To flag to anyone reading `legacy/` as a reference:

| Subject | Legacy | v2 |
|---|---|---|
| `setProperty()` | writes `_x`, **does not replicate** | the **controlled path** → Operation |
| `$x` / `syncProperty()` | the replicated paths | **removed** — replaced by `setProperty()` |
| `_x` / `__x` | observable internal layers | internal, **outside any public API** |
| Authority | none — the server applies and rebroadcasts | an authoritative server, `authority.check()` mandatory |
| `Sprite` | a subclass of `Object` | a Component |
| `Tilemap` | `draw(ctx, camera)` — broken if attached | `draw(self, renderer)` |
| `.px` | treated as JavaScript | a JSON graph resource, **the behaviour of a Component type** |
| `childs`, `uid` | — | `children`, `owner` |
| An exception in a Component | a silent `try/catch` — the error disappears | isolated **and** reported (`onError`), never converted into a model mutation |
| Input | the `Keyboard` singleton → `Network.users` — single-player broken | abstract state indexed by owner, passed to `step()` |
| `Camera` | the same name designates the component, the carrying Object and the projection | `Camera` = the lens; the `Object` = the position; `Viewport` = the screen |
| `Camera.offset` | a second position competing with `camera.x` | removed — one position API |

## Checks run in Phase 0

| Check | Result |
|---|---|
| Three write channels (`x`, `$x`, `setProperty`) | confirmed, distinct behaviour |
| Hierarchical propagation through `_x` | confirmed |
| Letter-by-letter editing Inspector ↔ Hierarchy | confirmed |
| Properties added after construction | **not reactive** |
| `#private` fields | **invisible to the Property System** |
| Serialization overhead | **a factor of 3.09** |
| Children serialized twice | confirmed |
| Offline single-player mode | **broken** — a silent `TypeError` every frame |
| Proxy vs accessors benchmark | Proxy: reads equal, **writes 4× faster** |
| `Tilemap` / `Lighting` / `LightSource` | signatures that do not honour the Component contract |

## Findings from the parity harness (2026-08-12)

Obtained by running Legacy, not by reading it:

| Finding | Scenario |
|---|---|
| `copy()` from a live `Object` sets `components` / `childs` / `image` to `undefined` | `scene/copy-from-live-object-wipes-containers` |
| `instantiate()` throws as soon as the source carries a component — prefabs and `Network.add` broken | `scene/instantiate-throws-with-components` |
| `copy()` from raw JSON works, which hid the defect | `scene/copy-from-plain-json-works` |
| Constructing an `Object` emits 19 notifications | `property/construction-emits-every-property` |
| 57 enumerable keys for 19 public properties | `property/enumerable-pollution` |
| Legacy's `setProperty()` produces no operation (the inversion confirmed) | `property/legacy-set-property-path` |
| 4 keystrokes → 4 operations, no grouping | `network/no-batching` |
| `gamepad.js` uses a DOM guard different from the other modules | `env/globals.js` |
