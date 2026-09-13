# Architecture overview

This page is a **map**, not the specification. The specification is
[ARCHITECTURE.md](../ARCHITECTURE.md) and the 72
[ADRs](../decisions/), both authoritative. What follows orients you in the
code and tells you which document or ADR settles each subject, so you do not have to read
eight thousand lines to change one panel.

## The guiding idea

> Pixel Creator is not an external tool driving an engine. The editor is an **administrator's
> view of a living runtime**: the editor and the runtime share the same `Scene` and the same
> `Object`s, not two synchronised copies.

That is why you can edit a scene while it is playing, and it is the reason the layering below
matters so much — one shared model, and strictly one direction of dependency.

Two acquired properties are explicitly non-negotiable
([PROJECT.md §3](../PROJECT.md)):

1. **Writing a property is the communication channel.** `object.x = 100` does not only change a
   value; it propagates. No user code ever calls a "sync" function.
2. **The core is shared by client, server and editor.** There is no `ServerObject` and no
   `ClientObject`.

## The layers

```
          ┌──────────┐        ┌───────────┐
          │ editor/  │        │ preview/  │      two applications, and
          └────┬─────┘        └─────┬─────┘      NEITHER may import the other
               │   ┌────────────────┤
               ▼   ▼                ▼
          ┌──────────┐        ┌───────────┐
          │ project/ │        │ runtime/  │
          └────┬─────┘        └─────┬─────┘
               │                    │
               └────────┬───────────┘
                        ▼
                   ┌─────────┐
                   │  core/  │   imports nothing at all
                   └─────────┘
```

Enforced by `node tools/layers/run.js`, which also reports dead imports. The forbidden edges
are declared in `tools/layers/rules.js` with the reasoning attached to each.

| Layer | Responsibility | Needs a DOM? |
|---|---|---|
| `core/` | The model: `Object`, `Component`, `Scene`, properties, operations, serialization, the `.px` graph model | No |
| `project/` | Identity, resources, the manifest, storage, loading | No |
| `runtime/` | The simulation: loop, rendering, input, collision, physics, audio, the graph interpreter | No (a server builds a `Runtime` with no renderer) |
| `editor/` | The editor application | Yes |
| `preview/` | The game client, and the editor↔game seam | The seam does not; the client does |

`network/` appears in the rules table and **does not exist**. There is no networking code in
`src/`.

## Where each subject is specified

| Subject | Code | Authoritative document |
|---|---|---|
| `Object` stays `Object` | `core/object.js` | [ADR-0001](../decisions/ADR-0001-object-stays-object.md) |
| Transform as a component, `object.x` as a façade | `core/components/transform.js` | [ADR-0002](../decisions/ADR-0002-transform-component.md), [ADR-0050](../decisions/ADR-0050-turning-out-of-the-plane.md), [ADR-0051](../decisions/ADR-0051-rotation-is-a-pair.md) |
| Property System | `core/properties/` | [ADR-0003](../decisions/ADR-0003-property-system.md), [architecture/CORE.md](../architecture/CORE.md) |
| Property types | `core/properties/types.js` | [ADR-0023](../decisions/ADR-0023-property-types.md) |
| Authored values vs declarations | `core/component.js`, `core/instantiate.js` | [ADR-0031](../decisions/ADR-0031-authored-values-and-schema-change.md) |
| Component lifecycle (`update` / `draw`) | `core/component.js`, `runtime/runtime.js` | [ADR-0004](../decisions/ADR-0004-component-lifecycle.md) |
| Component identity vs display name | `core/definition.js`, `editor/registry.js` | [ADR-0021](../decisions/ADR-0021-component-identity.md) |
| Component definitions (`.px` as a type) | `core/definition.js`, `core/graph/definition.js` | [ADR-0016](../decisions/ADR-0016-component-definition.md) |
| Operations | `core/operations/` | [ADR-0008](../decisions/ADR-0008-operations.md), [ADR-0019](../decisions/ADR-0019-structural-operations.md) |
| Authority and origin | `core/operations/authority.js`, `core/properties/origin.js` | [ADR-0011](../decisions/ADR-0011-authority.md) |
| Undo / redo | `core/operations/invert.js`, `editor/history.js` | [ADR-0024](../decisions/ADR-0024-undo-redo.md) |
| Structural order | `core/scene.js`, `core/serialize.js` | [ADR-0018](../decisions/ADR-0018-structural-order.md) |
| Resources, ids, the project layer | `project/` | [ADR-0020](../decisions/ADR-0020-resources.md), [ADR-0010](../decisions/ADR-0010-game-identity.md) |
| Folders as resources | `project/folders.js` | [ADR-0025](../decisions/ADR-0025-folders-and-resource-inspection.md) |
| Persistence | `project/persistence.js`, `project/indexeddb.js` | [ADR-0065](../decisions/ADR-0065-a-project-outlives-the-tab.md), [ADR-0069](../decisions/ADR-0069-a-save-is-not-an-intention.md) |
| Runtime step order | `runtime/runtime.js` | [ADR-0035](../decisions/ADR-0035-runtime-step-order.md) |
| Runtime modules, not "systems" | `runtime/` | [ADR-0005](../decisions/ADR-0005-runtime-modules-not-systems.md) |
| Error isolation | `runtime/errors.js` | [ADR-0012](../decisions/ADR-0012-runtime-error-isolation.md) |
| Camera and viewport | `runtime/rendering/camera.js` | [ADR-0013](../decisions/ADR-0013-camera-and-viewport.md) |
| Draw spaces (world / screen) | `runtime/rendering/space.js` | [ADR-0060](../decisions/ADR-0060-a-second-space-and-a-second-output.md) |
| Input passed in | `runtime/input/`, `editor/input.js` | [ADR-0014](../decisions/ADR-0014-input-passed-in.md) |
| Collision as simulation, not drawing | `runtime/collision/` | [ADR-0059](../decisions/ADR-0059-touching-is-simulation-not-drawing.md), [ADR-0067](../decisions/ADR-0067-a-wall-that-stops-you.md) |
| Determinism, seed and streams | `runtime/random/` | [ADR-0057](../decisions/ADR-0057-one-seed-and-two-streams.md) |
| Graph model and interpreter | `core/graph/`, `runtime/scripting/interpreter.js` | [ADR-0027](../decisions/ADR-0027-graph-model-and-interpreter.md), [ADR-0009](../decisions/ADR-0009-px-and-js.md) |
| Suspended executions | `runtime/scripting/interpreter.js` | [ADR-0058](../decisions/ADR-0058-an-execution-may-outlive-a-step.md) |
| Objects in a graph | `core/graph/standard.js` | [ADR-0034](../decisions/ADR-0034-object-references-in-the-graph.md), [ADR-0036](../decisions/ADR-0036-objectref-boundary.md) |
| One node per intention | `core/graph/standard.js` | [ADR-0040](../decisions/ADR-0040-one-node-per-intention.md), [ADR-0041](../decisions/ADR-0041-events-are-moments-and-a-property-carries-its-path.md) |
| Prefabs | `core/prefab.js` | [ADR-0061](../decisions/ADR-0061-a-prefab-is-a-resource-resolved-before-the-simulation.md), [ADR-0056](../decisions/ADR-0056-a-copy-is-the-model.md) |
| Resolved resources handed to a runtime | `core/resources.js` | [ADR-0062](../decisions/ADR-0062-one-table-of-resolved-resources.md) |
| Tilesets and painting | `core/tileset.js`, `editor/viewport/tools/tile-tool.js` | [ADR-0070](../decisions/ADR-0070-a-cutting-is-a-resource.md), [ADR-0068](../decisions/ADR-0068-a-level-is-painted-not-assembled.md) |
| Scene change from a graph | `runtime/runtime.js`, `runtime/session-state.js` | [ADR-0063](../decisions/ADR-0063-a-step-asks-and-the-application-answers.md) |
| Editor as Web Components | `editor/ui/` | [ADR-0006](../decisions/ADR-0006-editor-web-components.md) |
| Inspector driven by schema | `editor/inspector/` | [ADR-0007](../decisions/ADR-0007-inspector-schema.md) |
| Selection, picking, intent | `editor/selection.js`, `editor/subject.js`, `editor/viewport/picking.js` | [ADR-0017](../decisions/ADR-0017-editor-selection.md), [ADR-0032](../decisions/ADR-0032-selection-intent.md) |
| Drag and drop | `editor/dnd/` | [ADR-0026](../decisions/ADR-0026-drag-and-drop-and-px.md), [ADR-0037](../decisions/ADR-0037-a-drop-declares-and-configures.md), [ADR-0052](../decisions/ADR-0052-a-drop-may-ask-a-question.md) |
| Reparenting policy | `editor/commands.js` | [ADR-0022](../decisions/ADR-0022-reparent-transform.md) |
| Play mode and snapshots | `editor/transport.js` | [ADR-0029](../decisions/ADR-0029-transport-and-play-mode.md) |
| Preview as a runtime client | `editor/preview.js`, `preview/` | [ADR-0042](../decisions/ADR-0042-preview-is-a-runtime-client-addressed-by-id.md), [ADR-0071](../decisions/ADR-0071-un-apercu-suit-les-trois-modeles.md) |
| Live channel to a Preview | `editor/live.js`, `preview/live.js` | [ADR-0044](../decisions/ADR-0044-one-folder-one-identity-and-a-live-channel.md) |
| Export as a file before a URL | `editor/preview.js`, `preview/store.js` | [ADR-0066](../decisions/ADR-0066-a-game-is-a-file-before-it-is-a-url.md) |
| Naming, wording, honesty in the UI | across the editor | [ADR-0048](../decisions/ADR-0048-a-property-is-named-the-way-it-is-read.md), [ADR-0049](../decisions/ADR-0049-an-identifier-is-read-aloud.md), [ADR-0054](../decisions/ADR-0054-say-what-is-true.md), [ADR-0072](../decisions/ADR-0072-un-avertissement-n-arrete-rien.md) |
| Performance policy | `tools/bench-*.mjs` | [ADR-0064](../decisions/ADR-0064-measure-before-optimising-refuse-before-running.md) |

The complete register is in [PROJECT_MEMORY.md](../PROJECT_MEMORY.md). **An ADR that is not in
that table does not exist**, and a file in `decisions/` that is not in it is a line to add.

## The model, in one pass

### `Object`

Four own properties — `name`, `tag`, `layer`, `active` — plus `lock` and `owner`, an immutable
`id`, children, and components. Everything else is a component.

`object.x` exists as a **façade** over the `Transform` component. In hot loops, read the
Transform once rather than the façade on every access; there is no `object.transform`
accessor, `getComponent('Transform')` is the only form.

### Property System

A property write is observable. `core/properties/reactive.js` makes an object's properties
reactive — including properties **added after construction**, which Legacy could not do.

Two ways to write, and they are not interchangeable:

| Form | Means | Produces |
|---|---|---|
| `object.x = v` | A result of simulation | A `Change` |
| `object.setProperty('x', v)` | An **intention** | A `Change` **and** an Operation |

> A component never calls `setProperty()`. The editor never writes without it.

The failure mode that costs time is the second one: writing `=` where `setProperty()` was
required gives a change that does not replicate and does not undo — with no error and no
trace. [CONVENTIONS.md](../CONVENTIONS.md) has the full table, including the trap that Legacy's
`setProperty()` means something different.

`Origin` (`local`, `runtime`, `editor`, `player`, `network`) says where a write came from, so
an incoming operation does not echo back out.

### Operations

Every intentional change is an `Operation`, submitted to an `Operations` pipeline that
arbitrates (through an `Authority`), applies, and announces.

`SET_PROPERTY`, `SET_CELLS`, `SET_PAYLOAD`, `ADD_OBJECT`, `REMOVE_OBJECT`, `ADD_COMPONENT`,
`REMOVE_COMPONENT`, `MOVE_COMPONENT`, `REPARENT`, `ADD_RESOURCE`, `REMOVE_RESOURCE`,
`MOVE_RESOURCE`, `ADD_NODE`, `REMOVE_NODE`, `CONNECT`, `DISCONNECT`, `ADD_PROPERTY`,
`REMOVE_PROPERTY`.

`invert()` in the core is what makes undo possible; `History` in the editor holds **one stack
per resource**. A `batch` groups several operations into one history entry — which is how a
drag, a stroke and a typed name each become a single `Ctrl Z`.

This one mechanism is also the foundation replication would use: it is why the architecture
can support multiplayer without any of it being implemented.

### Serialization

Explicit, versioned (`FORMAT_VERSION`), with structural order written down. Children are
**referenced, never nested twice**. No `_`/`$` duplicates. The manifest has its own version
(`MANIFEST_VERSION`).

### The runtime step

`Runtime.step()`, in order:

1. **Collisions are detected** against the Transforms the previous step left behind — one
   snapshot the whole step reads, so two nodes can never disagree about a hit.
2. **Components update**, walking the scene in **canonical hierarchy order** (roots in order,
   depth-first under each) — a function of the *state*, never of construction history. An
   inactive object is skipped; a component with `active === false` is skipped; an object a
   graph destroyed earlier in this step stops running at once.
3. A component's own `update()` runs, then the **behaviour** its `.px` graph defines.
4. A throw is caught, reported through `onError`, and the loop continues.
5. **Bodies move** and resolve against solids, recording crossings for the next step's events.
6. **Input is committed** — edge state becomes held state.

Rendering is a separate call. A scene change requested by a graph is applied **between
frames**, never inside one.

### The graph interpreter

**Flow is pushed, data is pulled.** A node definition is data: ports, params, and either
`evaluate(io)` (data outputs) or `execute(io)` (flow). The catalogue lives in the **core**
because it is shared — the editor draws it, the runtime interprets it, a headless check
validates it.

Two guards: a **node budget** per event, so a runaway loop fails loudly naming the node; and a
cap on **suspended executions** per component, so `Delay` in an `On Update` cannot accumulate
without bound.

A graph reaches nothing global. Everything it may touch is handed to it on the step context:
input, the clock, the seeded random stream, id minting, the collision snapshot, audio output,
resolved resources, session state, and the one request it may make of the application (change
scene). That is what makes the same graph runnable on a server.

### The editor

`editor.js` is a **composition root** and holds no application state — the state is the
`Scene`. Windows are native Web Components with a `px-` prefix; classes carry no prefix.

The Inspector is **schema-driven with reflective fallback**: a component declares
`static schema`, and `FieldKind` is derived from `PropertyType` in the editor. A component
without a schema still renders.

`Workspace` owns what is open: a resource, its live model, its pipeline and its undo stack.
Layout (sizes, which panels are shown) is the only non-model state the editor owns, and it is
per browser — never serialized with a scene, never replicated, never an Operation.

### Preview

The editor never hands the game a live object. It **bundles** the project to JSON, stores it
under the project's identity, and opens a page that asks for that identity. The client learns
nothing about where the bundle came from — `#p/<id>` (stored locally) and `#u/<url>` (hosted
anywhere) are indistinguishable to it.

Live updates go one way: the editor is the authority, a Preview applies what it is handed and
announces nothing back. A scene is kept in step by **operations** (it is a state being lived
in); a `.px` is sent **whole** (it is a definition being read).

## Things the architecture deliberately does not do

| | Why |
|---|---|
| No ECS, no `systems/` folder | [ADR-0005](../decisions/ADR-0005-runtime-modules-not-systems.md) — the runtime is organised by domain module |
| No `Entity` | An `Object` is an `Object`. [ADR-0001](../decisions/ADR-0001-object-stays-object.md) |
| No `$x` sigil | Removed. [CONVENTIONS.md](../CONVENTIONS.md) |
| No vector property type | [ADR-0023](../decisions/ADR-0023-property-types.md) removed it deliberately; pairs are declared and paired for display |
| No JavaScript scripting from a graph | [ADR-0009](../decisions/ADR-0009-px-and-js.md) — `.px` is a graph, `.js` is JavaScript, and they are not the same door |
| No docking manager | `editor/layout.js` says so in its own header |
| No framework | [PROJECT.md §7](../PROJECT.md) |

## Next

- [Extending Pixel Creator](extending.md) — the seams, and how to add to them
- [Testing and verification](testing.md)
- [Architecture decisions](decisions.md)
