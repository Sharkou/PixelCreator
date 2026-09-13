# Architecture v2

> **Status: DECISIONS ACCEPTED on 2026-08-12, AND IMPLEMENTED SINCE.** The blocking questions
> from Phase 0 have been settled, and `src/` today holds `core/`, `project/`, `runtime/`,
> `editor/` and `preview/`. This document describes the architecture **in force**; detailed
> progress lives in `migration/MIGRATION_STATUS.md` and the decisions taken since in
> `decisions/` — the complete table is in `PROJECT_MEMORY.md`.
>
> Every structural decision is justified by an observation from
> `migration/LEGACY_ANALYSIS.md`. The record of the Phase 0 decisions is in §10.
>
> **This file does not grow with every slice of work.** A decision taken after Phase 0 is an
> ADR; what is written here is what has not changed since.

## Accepted decisions — summary

| Subject | Decision |
|---|---|
| Property System | `object.x = 100` — direct state mutation |
| | `object.setProperty('x', 100)` — controlled mutation through the Property System → Operation |
| | **`object.$x` is removed** — too implicit for a public API |
| | Every mutation of the model is representable as an **Operation** |
| Components | **One Component per type** and per Object |
| | `Transform` is an ordinary Component; `object.x` is a convenient way into it |
| Runtime | Domains sit directly under `runtime/`, **no `Systems/` layer** |
| | `Object.update()` / `Object.draw()` are kept; a Component may do both |
| Rendering | **Canvas 2D** in v2, behind a thin abstraction that leaves WebGL/WebGPU open |
| Multiplayer | **The server is the simulation authority.** The model distinguishes a player mutation from an authorized editor mutation |
| Scripting | `.px` = visual graph, `.js` = native JavaScript. `.px` stops being JS |
| Editor | Native Web Components, **`px-`** prefix. Central model, reactive views |
| Runtime errors | The Runtime **isolates and reports**; it does not modify the model. No auto-disabling |
| Input | Abstract, indexed by owner, **passed to `step()`** — never a global |
| Camera | An ordinary `Object`; the `Viewport` is the screen; the view matrix is derived |
| Scripting | A Component may have a `.px` graph that defines its behaviour. **No `Script` Component**, no `ScriptSystem` |
| `.px` graph | Model in the **Core** (`core/graph/`), interpreter in the Runtime, SVG rendering in the Editor. Nodes, ports and connections addressed by **identity**; a user property carries an `id` that renaming does not touch (ADR-0027) |
| User-created Components | A **definition** (`type` + properties + graph) yields an ordinary Component; the definition belongs to the type, never to the instance |
| Drag feedback | **Live reflow in flat lists, never in the tree**: a flat list asks one question (which rank?), a tree asks two (which parent, which rank?) and its target must not move while you are aiming at it (ADR-0028) |
| Editor surfaces | The **stage** carries what is being edited — Viewport and Graph swap there through tabs. The Graph will not go in the bottom strip: a node editor needs surface area (ADR-0028 §4) |
| Transport | **Play plays the live scene**, not a copy. Play takes a snapshot, Stop restores it, changes made while playing are lost and history is cleared at start (ADR-0029) |
| References | A `resource` property is **chosen, dropped or cleared — never typed**: a control that shows what the reference designates, and a declaration (`kind`, `mime`) that both the picker and the drop rule read (ADR-0030 §1) |
| Ranks | Reordering a `.px` property is `REMOVE_PROPERTY` + `ADD_PROPERTY` **inside a `batch`**: two existing operations already carry the descriptor and the index, so there is no `MOVE_PROPERTY` (ADR-0030 §2) |
| Search | A long menu **opens on its categories**, and a query is **scored** against name, type, category and aliases — a pure, tested module, never an `includes()` (ADR-0030 §3) |
| Colour | **Six hues, two questions**: what a node is and what a wire carries draw from the same palette, so a Math node and a `number` port are the same blue (ADR-0030 §4). A literal node **is** a value, so it takes the hue of its type rather than of its category (ADR-0033 §4) |
| Selection | **An intent is announced, it is not inferred**: a window says `object` / `resource` / `clear`, a router writes into both holders, and at most one is filled (ADR-0032) |
| Nodes | **A node is a sequence of rows**: a control belongs to the row of the port it edits, so a `Number` fits on one line and the slot of `Set Property` faces its value (ADR-0033 §1) |
| Wires | The visible stroke is **inert**; what you point at is the target underneath it. Picking a wire back up writes nothing before the release, and replacement is **one** `batch` (ADR-0033 §2, §3) |
| Legacy projects | **No data migration to design** — there are no v1 projects |

---

## 1. Guiding principle

The analysis of Legacy leads to a clear conclusion: **the concepts are good, the
implementations are fragile.** The triple write channel, the shared Core, `update/draw` with
`self` as an argument, the reflective Inspector — all of it works, and none of it has a
simpler equivalent.

The real problems are elsewhere:

| Real problem | Nature |
|---|---|
| Reactivity lost on dynamic properties and `#` fields | implementation |
| ×3 serialization and duplicated children | implementation |
| `Core → Editor`, `Input → Network` | coupling |
| Adding a window means editing 4 files | UI modularity |
| A graph with no data model | missing feature |
| No tests | tooling |

**None of these problems requires an ECS, a Systems architecture, or a UI framework.**

---

## 2. Decomposition

```
                          Pixel Creator
                                │
      ┌───────────┬─────────────┼─────────────┬─────────────┐
      │           │             │             │             │
    core/     project/      runtime/       editor/      network/
      │           │             │             │             │
  Object      Resource      clock/        windows/     protocol
  Scene       Project       physics/      inspector/   transport
  Component   Store         animation/    viewport/    replication
  properties  loading       rendering/    graph/       authority
  operations                input/        ui/
  events                    scripting/
  logger                    loop
```

**One dependency rule, and it is checkable:**

```
editor/  ──►  project/  ──►  core/
editor/  ──►  runtime/  ──►  core/
network/ ──►  core/
core/    ──►  (nothing)
```

`core/` imports neither `project/`, nor `runtime/`, nor `editor/`, nor `network/`, nor the
DOM. `project/` — identity, storage, loading (ADR-0020) — imports neither the DOM, nor
`runtime/`, nor `editor/`: a server with no screen must load the same project a browser does.
`runtime/ → project/` is forbidden in the other direction, because `behaviors.bind(type, graph)`
takes an **already-resolved** graph.

An automated test checks this rule (see `development/TESTING.md`), and since 2026-08-17 the
same run also fails on a static import that resolves to no file.

### Why there is no `systems/` directory

**OBSERVED:** Legacy never had a "System". Physics lives in `Collider.update()`, animation in
`Animator.update()`. Organizing by domain module (`physics/`, `anim/`, `input/`) is what
exists, and it reads well.

**V2 PROPOSAL:** keep the organization by domain. The word "System" is used only where a
module genuinely orchestrates several objects — for instance a `CollisionSystem` that would
replace the current O(n²) loop with a spatial sweep. That would be a real service, not a box
in a diagram.

---

## 3. Core

### 3.1 Object

`Object` stays `Object` (ADR-0001). It becomes a **container** again:

```js
class Object {
    id            // the object's identity
    owner         // formerly `uid`: the owning player
    name, tag, layer
    active, visible, lock
    components    // Map<string, Component>   — one per type
    parent, children
}
```

Leaving `Object` (for `editor/`): `detectMouse`, `detectSide`, `select`, `createImage`,
`preview`. These are IDE operations; they have no business preventing the Core from loading on
the server.

**Renames adopted.** They were blocked by data compatibility; the decision "no v1 projects to
migrate" removes that block:

| Legacy | v2 | Reason |
|---|---|---|
| `childs` | `children` | correct English |
| `uid` | `owner` | `uid` designates the **owning player**, not the object |
| `static` | *removed* | declared, never read |

### 3.2 Transform becomes a Component, `object.x` stays `object.x`

**SETTLED** (ADR-0002). `x`, `y`, `rotation`, `scaleX`, `scaleY` leave `Object` for a
`Transform` component, **with a single source of truth**. `width` and `height` are not part of
it: a size belongs to the rendering and collision components. The values are **local**; the
world transform is derived, never stored.

```js
// Transform holds the values
object.components.get('Transform').x   // ← the single source of truth

// Object exposes a façade — not a copy
Object.prototype = {
    get x()  { return this.components.get('Transform').x; },
    set x(v) {        this.components.get('Transform').x = v; }
}
```

The two writes below are therefore strictly equivalent and cannot diverge:

```js
object.x = 100;
object.getComponent('Transform').x = 100;
```

Benefits: the transform hierarchy (today `_x`/`__x`, hard-coded in `Object`) becomes
`Transform`'s responsibility; a purely logical object needs no position; the Inspector shows
`Transform` like any other component.

Accepted risk: two indirections per read of `x` in hot loops. The benchmark in §4.2 shows the
budget is there, but rendering will have to read `transform` once per object rather than
repeat `self.x`.

### 3.3 Property System

The conceptual mechanism is kept identical. The implementation moves from a per-property
`Object.defineProperty` to **one `Proxy` per object** (ADR-0003).

**What does not change — the ergonomics:**

```js
object.x = 100;                   // changes + notifies the views, no Operation
object.setProperty('x', 100);     // changes + notifies + produces an Operation
```

**What the Proxy fixes, measured:**

| Legacy defect | Fixed |
|---|---|
| A property added later is not reactive | ✅ the trap intercepts every key |
| `#private` fields invisible | ✅ not applicable (internal state, outside the model) |
| `_prop`/`$prop` enumerable, ×3 serialization | ✅ no parasitic storage |
| Writing 301 ms / 3 M ops | ✅ **77 ms** — 4× faster |
| No previous value | ✅ the trap reads it before writing |

### The two forms of writing — SETTLED

```js
object.x = 100;                   // direct mutation of the object's state
object.setProperty('x', 100);     // controlled mutation through the Property System
```

**`object.$x` is removed** — too implicit, and too specific to Pixel Creator, to be a public
API. It exists neither in v2 nor as target syntax for the harness.

| Form | Effect |
|---|---|
| `object.x = 100` | updates the state, emits a `Change` — views react. **No Operation.** |
| `object.setProperty('x', 100)` | `Change` **and** Operation |

```
setProperty()  →  Property System  →  Operation  →  context / authority / destination
```

**`setProperty()` is not "the network method".** It is the model's controlled path. What the
Operation becomes depends on the context: validation by the authority, replication, history,
undo/redo, collaboration, hand-off to another system. The network is one possible destination,
not the definition.

An incoming Operation stays explicitly identifiable through `origin: 'network'`.

> **⚠ Same name, different meaning from Legacy.** In Legacy, `setProperty()` writes `_x`
> directly and **does not replicate**; `$x` / `syncProperty()` are what replicate. In v2, the
> role of `$x` / `syncProperty()` is taken over by `setProperty()`, and the historical
> `setProperty()` disappears as such. Any reasoning by analogy with `legacy/` will mislead —
> the mapping is explicit in the parity harness.

> **The internal layers are not an API.** Legacy stacks `object.x` → `_x` → `__x`. Those
> levels are documented because they explain observable behaviour, but `_x` and `__x` remain
> mere implementation possibilities: neither users nor components have any business touching
> them, and no public v2 API depends on them.

The emitted `Change` becomes:

```js
{ object, component, prop, value, previous, origin }
```

`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`. It replaces the current
trick ("which method was called") with explicit data, and removes the need for
`setProperty(prop, value, dispatch=false)` to avoid echoes: the network layer simply ignores
changes whose origin is `network`.

### 3.4 Serialization

An explicit `serialize()` replaces implicit serialization through `JSON.stringify`:

- no `_`/`$` duplicates (there are none left),
- children are referenced by id, **never nested whole**,
- images no longer travel as base64 inside the scene state (referenced by resource id),
- versioned, so existing projects stay readable.

Expected gain on the heartbeat: a factor of 3 on the `_prop` duplication, plus the removal of
the child duplication.

### 3.5 Events and Logger

The `System.addEventListener/dispatchEvent` bus is kept (synchronous, ordered, predictable).
It is extracted into `core/events.js` and gains a reliable `off()`.

`System` is dismantled: today it is a catch-all (id, random, sync, files, `<input>` validation,
events, logs). See `architecture/CORE.md`.

The logger keeps its historical visual identity (coloured categories) behind a named API — see
`development/LOGGING.md`.

---

## 4. Runtime

### 4.1 Components

The historical contract is kept **and finally made explicit** (ADR-0004):

```js
update(self, ctx)   // simulation      — client AND server
draw(self, renderer) // rendering      — client only
```

`self` is still passed as an argument (no `this.object`): that is what keeps components
serializable without a cycle. `ParticleSystem` remains the canonical example — simulation in
`update`, rendering in `draw`, server without `draw`.

`draw(self, renderer)` receives a rendering abstraction instead of reading the `Graphics.ctx`
singleton. That does **not** mean turning components into "RenderSystems": a component keeps
its rendering logic where that makes sense.

New: a component **declares its schema** (ADR-0007), which feeds the Inspector, validation and
serialization:

```js
static schema = {
    speed:  { type: 'number', default: 2, min: 0, max: 20 },
    layout: { type: 'enum', values: ['wasd', 'zqsd', 'arrows'], default: 'zqsd' }
};
```

The schema is **optional**: without it the Inspector falls back on the current reflective
inference, which already works. Writing a component stays a ten-line affair.

**SETTLED:** an `Object` carries **only one Component of a given type**. The key in
`components` stays the type name, as in Legacy.

**SETTLED:** a Component may implement `update()`, `draw()`, or both. `ParticleSystem`,
`Sprite` and `Tilemap` take part in rendering directly, on that basis.

> **Consequence for Legacy.** Two of those three cases are not conformant today: `Sprite` is a
> **subclass of `Object`**, not a Component, and `Tilemap` exposes `draw(ctx, camera)`, a
> signature incompatible with `Object.draw()`. In v2, `Sprite` becomes a Component and
> `Tilemap` adopts `draw(self, renderer)`. This is a deliberate abandonment of incorrect
> Legacy behaviour.

### 4.2 Organization

**SETTLED.** The domains sit directly under `runtime/`, with no intermediate layer:

```
runtime/
├── clock/         time, delta-time, timers
├── physics/       collisions, bodies, spatial hash
├── animation/     animator, animation, tween
├── rendering/     Canvas 2D backend + abstraction
├── input/         input state per owner
├── scripting/     Component behaviours defined by a .px graph
└── loop.js        phase orchestration
```

No `PhysicsSystem`, `RenderSystem`, `AnimationSystem` or `ScriptSystem` is created on
principle (ADR-0005).

### 4.3 Rendering

**SETTLED:** the v2 backend is **Canvas 2D**. A thin abstraction sits in front so that a WebGL
or WebGPU backend stays possible later — without being designed for them today.

Concretely that means one thing: `draw(self, renderer)` receives a `renderer` object instead
of reading the `Graphics.ctx` singleton. The abstraction is limited to the vocabulary the
existing components actually use (`rect`, `circle`, `image`, `text`, `fill`, `stroke`,
`light`, transforms).

**Do not over-architect**: no command graph, no batching, no materials, no passes until a real
need demands them.

### 4.4 Loop

The phases are separated, as the server already does:

```
frame:
  input.poll()
  for each object: object.update()     ← all the simulation first
  collisions.resolve()
  renderer.render(scene, camera)       ← then all the rendering
  editor.overlay()                     ← then the IDE overlays (if Editor)
```

**OBSERVED:** Legacy interleaves update and draw per object, which makes the observation order
depend on the `layer` sort — non-deterministic for a multiplayer engine. The server does not
make that mistake.

The `layer` sort is still done **every frame**. `layer` can change at any moment and the sort
is negligible next to rendering; a cache invalidated on write would be a speculative
optimization and one more piece of state to maintain. It will be introduced if a measurement
asks for it — see `architecture/RUNTIME.md`.

An exception thrown by a Component is **isolated and reported**, never turned into a mutation
of the model: the Runtime disables nothing (ADR-0012).

Mouse picking and the resize handles move out of `Renderer.render()` into `editor/viewport/`.
**That is what removes `import { Dnd } from '/editor/...'` from the Core.**

### 4.5 Input

`Input` no longer depends on `Network` (fixing the bug in §6.3 of the analysis):

```
runtime/input/  →  abstract state, indexed by owner; a "local" owner always exists
network/        →  feeds the input state of remote owners
```

> **Correction (ADR-0014).** This paragraph originally placed input in `core/`, contradicting
> `architecture/RUNTIME.md`. `runtime/` is what was adopted: the Core is the model, it has
> neither time nor input.

The state is **abstract** — keys, buttons, pointer, axes — and knows about no browser event.
It is **passed into the simulation step**:

```js
runtime.step(input);
runtime.advance(elapsed, input);
```

That is what makes the simulation deterministic and replayable on the server. A runtime built
without input runs on empty input rather than reaching for a global.

Direct consequence: **offline single-player works**, which is not the case today.

---

## 5. Editor

### 5.1 What we keep, absolutely

The current real-time synchronization is **good** and must not be replaced by a store or a
framework:

- single source of truth = the `Object`,
- the DOM is a projection,
- the `document.activeElement` guard is what allows letter-by-letter editing.

### 5.2 What we change: modularity

**OBSERVED:** adding a window requires editing `index.html` (700 lines), `app.js`, a CSS file
and the module itself; `editor/windows/window.js` is an empty `// TODO`.

**V2 PROPOSAL:** native Web Components as primitives (ADR-0006). Each window carries its own
markup, its styles (Shadow DOM) and its lifecycle.

```
Primitives          Windows built on them
──────────          ─────────────────────
<px-window>         <px-hierarchy>
<px-panel>          <px-inspector>
<px-split>          <px-assets>
<px-tabs>           <px-scene>
<px-toolbar>        <px-graph>
<px-tree>           <px-players>
<px-list>           <px-console>
<px-property>
<px-viewport>
<px-modal>, <px-menu>
```

Adding a window becomes: write one file, register it with the layout.

The property↔DOM binding through a global CSS class (`<id>-<prop>` +
`getElementsByClassName` on `document`) is replaced by a **scoped binding**: the
`<px-property>` component subscribes to the `Change` of the property it displays and updates
itself. Same observable behaviour, without a global DOM query, and compatible with the Shadow
DOM.

### 5.3 Inspector

Schema-driven where a schema exists, reflective otherwise (ADR-0007). Zero
`if (component === …)`. This incidentally fixes: decimals truncated by `parseInt`, missing
min/max, mis-detected colours (initial `''`), and the dead `TODO Range`/`TODO Array` branches.

### 5.4 Viewport

`Handler` (27 kB, an 8-case `switch` duplicated) is split into **tools**: `SelectTool`,
`MoveTool`, `ResizeTool`, `PanTool`, `ZoomTool`. One active tool, a common interface. The
8-direction resize becomes a single function parameterized by the side.

---

## 6. Network and Operations

### 6.1 Observation

**OBSERVED:** the current protocol *already is* an operation system that does not say so.
`update {id, component, prop, value}` = `SET_PROPERTY`. `addComponent`, `addChild`, `add`,
`remove` are already named operations.

### 6.2 Proposal

**SETTLED:** every mutation of the model must be representable as an internal Operation. That
is what eventually opens up network, history, undo/redo, collaboration and AI.

We formalize what already exists, without changing the user's ergonomics (ADR-0008):

```
object.setProperty('x', 100)   → Change { origin: 'editor' }
                               → Operation SET_PROPERTY { target, prop, value, previous }
                               → authority (ADR-0011)
                               → authoritative state → propagation
```

The user never writes an Operation by hand. It is **produced** by the Property System.

`object.x = 100` (direct mutation) produces **no** Operation: it is a simulation output, not an
intent. See ADR-0003 for the reasoning behind that boundary and the development guard that
protects it.

Operations: `SET_PROPERTY`, `ADD_OBJECT`, `REMOVE_OBJECT`, `ADD_COMPONENT`,
`REMOVE_COMPONENT`, `ADD_CHILD`, `REMOVE_CHILD`, `ADD_RESOURCE`, `REMOVE_RESOURCE`.

What the format adds over the current messages:

| Field | Unlocks |
|---|---|
| `previous` | undo/redo |
| `seq` | total ordering, loss detection |
| `author` | collaboration, attribution |
| `batch` | one drag = **one** operation, not 300 |

Batching answers directly the `delay = 0` that neutralizes the current throttle.

**This is not a CRDT and not OT.** Multi-user collaboration stays out of scope; we only make
sure we are not making it impossible.

### 6.3 State replication

The "full scene every 4 s" heartbeat (which overwrites in-progress edits) is replaced by
**delta snapshots**: only the properties modified since the last acknowledgement are sent. Full
reconciliation stays available on connection and on demand.

### 6.4 Authority — SETTLED

**The server is the simulation authority in competitive multiplayer.** See ADR-0011.

The model distinguishes two natures of mutation:

| Nature | Emitter | Handling |
|---|---|---|
| **Player/client mutation** | a player in game | an intent submitted to the server; the client may predict, the server decides |
| **Authorized editor mutation** | the creator, with permissions | an authorized Operation → **validated server-side** → applied to the authoritative state → propagated |

In both cases the path is the same: Operation → validation → authoritative state →
propagation. Only the source and the check differ.

**OBSERVED:** today the server has no authority — it applies what it is sent and rebroadcasts.
And the Editor is authoritative in practice, with no check of any kind. This is a deliberate
abandonment of Legacy behaviour.

The full permission system is **not implemented now**. The architecture merely has to provide
the insertion point: an `authority` that receives each Operation and answers accepted /
rejected / transformed.

---

## 7. Client / Server

```
                     core/  (identical on both sides)
                            │
              ┌─────────────┴─────────────┐
              │                           │
           Client                      Server
              │                           │
    runtime + renderer             runtime without rendering
    editor (optional)              network + persistence
```

No `ClientObject` / `ServerObject`. The difference is not in the model but in the **modules
loaded**: the server does not import `renderer/`.

`mod.js` remains the shared entry point. v2 splits it into `core/mod.js` (shared) and
`runtime/mod.js` (client), so that the server stops transitively importing rendering and the
DOM.

---

## 8. Scripting

Two languages, one object model (ADR-0009):

| Extension | Nature | Execution |
|---|---|---|
| `.px` | **graph**, a structured JSON resource | interpreted (or compiled) by the runtime |
| `.js` | a real JavaScript ES module | dynamic `import()`, as today |

**OBSERVED:** today `.px` sits in `allowedScriptsTypes` next to `text/javascript` and goes
through `import()` — so it is JavaScript in disguise, which the vision explicitly refuses. The
server, for its part, knows `application/pixelscript`. **The two MIME types must be unified.**

The graph finally gets a serializable data model, independent of the DOM.

> **Amended on 2026-08-18 (ADR-0027).** The original example designated a port by its **index**
> (`"from": ["nodeA", "out", 0]`) and carried `variables`. Both are abandoned: an index is
> exactly the defect measured in Legacy — a node type that gains a port silently rewires every
> graph — and a graph variable *is* a property of the Component (see "A Component created by a
> user").

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "event.update", "x": 40, "y": 96, "params": {} },
    { "id": "n2", "type": "property.set", "x": 320, "y": 96, "params": { "property": "p7" } }
  ],
  "connections": [
    { "id": "c1", "from": { "node": "n1", "port": "out" }, "to": { "node": "n2", "port": "in" } }
  ]
}
```

A node, a port and a connection each have a **stable identity**; `from` is always the output
and `to` always the input, whichever way the wire was dragged.

The node editor is rebuilt on top of that model rather than being it: `core/graph/` holds the
model, `editor/graph/view.js` the canvas arithmetic, and `editor/windows/graph.js` the SVG
rendering. The rendering ideas kept from Legacy — a horizontal Bézier with an offset of
`max(50, distance × 0.4)`, pan/zoom by view transform — are kept explicitly; the rest (a node
is a `<div>`, a port is located with `getBoundingClientRect()`) is what ADR-0027 refuses to
reproduce.

### What a node is, and who runs it (ADR-0027)

A node type declares **its shape and what it does in one table**, in the Core: its ports (flow
or data, typed by `PropertyType`) and its evaluation, which is pure — it reads its inputs and
writes through the Component, with no clock, no randomness, no DOM.

`runtime/scripting/interpreter.js` holds what belongs to no node: the execution order (flow
pushed depth-first, data pulled), per-instance state, a per-event budget, and structured
`GraphError`s that the runtime isolates and reports (ADR-0012). A flow that loops is a **loop**,
not an error; a **data** cycle is one, because a value defined by itself has no evaluation
order.

`.px` and `.js` manipulate the same `Object`, `Component`, `Property`, `Scene`, `Resource` and
`Event`: they are two façades over one API, not two engines.

### Where a graph enters the simulation (ADR-0015)

A graph is the **behaviour of a Component type**, never a component:

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

**There is no `Script` Component** and a `.px` generates no component type. A `.js` provides
one (the default-exported class); a `.px` defines the behaviour of a type that already exists.

```
graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
        once per graph        once per instance         every step
```

The graph is read once and shared by every component of its type; **each instance has its own
execution state**. The behaviour lives in a `WeakMap`, never in the component's serialized
data. The runtime runs the graph where it runs the component: same step, same order, same
error isolation, client and server alike.

### A Component created by a user (ADR-0016)

A Component is **properties + behaviour**. A **definition** writes that pair as data —
`{ type, properties, graph }` — and `defineComponent()` turns it into an ordinary component
class, registered like the others. The definition belongs to the **type**: an instance carries
only its values, never a copy of the graph.

That is what lets the Editor create a Custom Component, define its properties, edit its graph,
save its definition and reuse it everywhere.

**A user property has an identity (ADR-0027).** The schema stays keyed by name — that is what
`defineComponent()` reads and what the Inspector displays — but each descriptor carries an `id`
minted once, and **that** is what a node stores:

```json
"properties": { "speed": { "id": "p7", "type": "number", "default": 120 } }
```

Renaming `speed` to `walkSpeed` therefore leaves the graph wired. This is ADR-0021 one level
down: identity is not a name. A deleted property never leaves a dangling reference — the
validator reports it, the canvas rings the node, the interpreter throws a structured error.

`editor/graph/compiler.js` (a lexer for a Rust-like language, never executable) is abandoned.
`editor/graph/component.js` is renamed so that it no longer collides with game components.

---

## 9. Resources

- `Resource` becomes real and replaces the augmented `File` (today `Resource` exists but is
  never used).
- A stable id, independent of the path (today `id = path + name`: renaming a file changes its
  identity and breaks references).
- Images are no longer stored as base64 DataURLs inside the scene state.
- Blob URLs are revoked (a current leak on every re-import).
- IndexedDB (`Store`, already written and unused) serves as the local cache and the offline
  mode.
- Hot reload through `import()` + the `import` event is kept as is: it works.

**State as of 2026-08-17:** `project/` exists — `Resource`, `ResourceId`, `ResourceStore` (an
in-memory implementation), `Project` and its Operation pipeline, loading of Component
definitions and of scenes. IndexedDB remains to be plugged in: that is an implementation swap
behind the interface, with no effect on callers.

**Completed on 2026-08-17 (ADR-0025):** a folder is a `Resource` of `kind: 'folder'`, and
filing is a `parent` link — not a `path` string. Renaming a folder therefore rewrites nothing,
moving a resource is a `SET_PROPERTY`, and deleting a folder takes its contents with it in a
single undoable `batch`. `MANIFEST_VERSION = 2`. The displayed path (`Assets/Images`) is derived
from the links, never stored. Entries also carry `created` and `modified`; size belongs to the
store, which either measures it or answers `null`.

---

## 10. Decision register

### Settled on 2026-08-12

| # | Question | Decision |
|---|---|---|
| Q3 | Do we keep the `$` sigil? | **No — removed for good.** `object.x = v` is the direct mutation, `object.setProperty('x', v)` the controlled one. |
| Q4 | Two components of the same type per object? | **No.** One per type, keyed by type name. |
| Q5 | Server authority | **The server is the simulation authority.** The model distinguishes a player mutation from an authorized editor mutation (ADR-0011). |
| Q6 | Compatibility with Legacy projects | **None.** There are no v1 projects. Do not design a data migration. |
| Q8 | Renderer target | **Canvas 2D**, behind a thin abstraction leaving WebGL/WebGPU open later. Do not over-architect. |

### Unblocked by Q6, settled by default

These two renames were blocked only by data compatibility, which no longer applies. Adopted
unless someone objects:

| # | Question | Decision |
|---|---|---|
| Q1 | `childs` → `children`? | **Yes.** |
| Q2 | `uid` → `owner`? | **Yes.** The field designates the owning player. |

| Q7 | `.px`: interpreted or compiled to JS? | **Interpreted**, for debuggability and safety. The format will not have to change if compilation turns out to be necessary later. |

**Every blocking question is settled.** Only minor points remain, decidable at implementation
time and listed in the ADRs concerned (for example, whether `Transform` is added by default).

---

## 11. What we are not doing

- No ECS, no archetypes, no columnar storage.
- No `systems/` directory on principle.
- No `Object` → `Entity` rename.
- No removal of `Component.draw()`.
- No UI framework.
- No separate reactive store in the Editor — the source of truth stays the `Object`.
- No replacement of the Property System by a verbose API.
- No dependency on Lya.
- No publication of the private server.
- No mass file generation before this document is accepted.
