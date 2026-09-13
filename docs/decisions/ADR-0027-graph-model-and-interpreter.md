# ADR-0027 — The `.px` graph model, its user properties, and its interpreter

- **Status:** **accepted** (2026-08-18)
- **Decides:** what a `.px` graph is, and how it is edited, validated and executed
- **Depends on:** ADR-0003 (Property System), ADR-0007 (schema-driven Inspector), ADR-0008
  (Operations), ADR-0009 (`.px` is a graph, interpreted), ADR-0012 (runtime errors),
  ADR-0015 (a Component may have a graph), ADR-0016 (a definition = properties + graph),
  ADR-0020 (Resources), ADR-0023 (`PropertyType`), ADR-0024 (Undo/Redo), ADR-0026 (`.px` is
  **one** resource)
- **Closes:** the open points "the graph model and its interpreter" (ADR-0009, ADR-0015,
  ADR-0016), and "a graph's `variables`" (ADR-0009, ADR-0015)
- **Amends:** ADR-0009 (the shape of connections in the payload)

---

## Observed context

ADR-0009 settled that `.px` is an interpreted graph. ADR-0015 fixed **where** a graph enters the
simulation. ADR-0016, amended by ADR-0026, fixed that a definition **carries** its graph. Three
ADRs, and the one thing that makes them usable was still missing: the graph itself.
`createComponent()` wrote `{ version: 1, nodes: [], connections: [] }` and nothing in the world knew
how to read it.

**OBSERVED in `legacy/editor/graph/`** — an experimental implementation, inspected before a line was
written:

| What Legacy did | Verdict |
|---|---|
| Horizontal Bézier paths, offset `max(50, distance × 0.4)` | **taken as is** — it is what makes a wire read as a cable |
| Pan/zoom by view transform, node coordinates untouched | **taken** — it is the only way not to lose the layout |
| A node is a `<div>`, a connection a pair of elements linked by `connector.other` | **rejected** — the graph *was* the DOM, so closing the tab lost the work |
| A port's position read with `getBoundingClientRect()` on every `mousemove` | **rejected** — a port existed only while it was on screen |
| Ports addressed by their **index** (`outputs[i + 1]`), recreated on every keystroke | **rejected** — a node type gaining a port silently rewired every graph |
| A node editable as `contenteditable`, ports derived from the typed text | **rejected** — a node's type is not a string the user types |
| A static `Graph.main`, a `Graph.updateScript()` that does `console.log` | **rejected** — no model, no serialization, no execution |
| `editor/graph/compiler.js` — a lexer for a Rust-like textual language, with no `evaluate` | **abandoned** (already settled by ADR-0009) |

Legacy is therefore a **source of rendering ideas**, and a catalogue of what must not be done again
on the model side.

---

## Decision

### 1. The graph is a Core model, not a view

```
graph model        core/graph/          no DOM, no browser
     ↓
graph view         editor/graph/view.js  pure arithmetic, tested under Node
     ↓
graph renderer     editor/windows/graph.js  SVG, pointer events
```

`core/graph/` knows about no pixel, no window and no storage. That is what lets a headless server
load, validate and run a `.px` — ADR-0011's requirement — and it is exactly what Legacy made
impossible.

### 2. The payload

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

**This amends ADR-0009's shape**, which wrote `"from": ["n1", "out", 0]`. A port was designated
there by an **index** — the defect measured in Legacy — and the triple did not say which of the two
ends was the output. Here:

- a node, a port and a connection each have a **stable identity**;
- `from` is **always** the output, `to` **always** the input, whichever way the creator dragged the
  wire. No downstream code has to wonder about the order;
- `version` is carried from day one: a payload that cannot say what shape it is in is a migration
  nobody can write.

ADR-0009's `variables` **do not exist**, and that closes the open point: a graph variable *is* a
property of the Component (§4). Two state systems for one idea is exactly what the rest of these
ADRs refuse.

### 3. What a node is: **one table**, in the Core

A node type declares its shape **and** what it does:

```js
{ type: 'flow.branch', label: 'Branch', category: 'Flow',
  inputs:  [flow('in'), data('condition', 'boolean', 'Condition', false)],
  outputs: [flow('true'), flow('false')],
  execute: io => (io.input('condition') ? 'true' : 'false') }
```

**Why shape and behaviour are not separated.** The "intuitive" split would have put the ports in the
Core (the editor draws them, the validator checks them) and the evaluation in the Runtime (ADR-0015
puts the interpreter there). That would be **two tables to keep in step** — the failure mode every
ADR in this repository is written against, and the one ADR-0023 has just fixed for property types.

A node's evaluation is **pure in the Core's sense**: it reads its inputs and writes through the
Component, and nothing else. No shipped node touches the DOM, a clock, a source of randomness or
storage — that is checked by a test which inspects the source of the shipped nodes. What is left to
the Runtime is what belongs to no node: the execution order, the per-instance state, the budget and
the error reporting (§6).

### 4. User properties have an **identity**, and the name is not one

A Component's schema is a table **keyed by name** — that is what `defineComponent()` reads and what
the Inspector displays (ADR-0007, ADR-0016). But a node referencing a name would break at the first
rename. Each descriptor therefore carries an `id`, minted once:

```json
"properties": { "speed": { "id": "p7", "type": "number", "default": 120 } }
```

- what the creator reads and freely changes: the **key**;
- what a node stores: the `id`.

Renaming `speed` to `walkSpeed` leaves the graph wired. This is ADR-0021 applied one level down:
*identity is not a name*.

**The Core ignores `id`**: `defineComponent()` only validates `type`, and one more field in a
descriptor does not bother it. No second property system is created — ADR-0023's eight
`PropertyType`s are the only list, and the control that edits a default value is derived through the
mapping that already exists.

### 5. A `.px` is **one** live model, **one** pipeline, **one** undo stack

`ComponentDefinition` (`core/graph/definition.js`) is to a `.px` payload what `Scene` is to a
scene's payload: the live model, with its own `Operations`. Declaring a property and wiring two
nodes go through **the same** pipeline, and therefore land on **the same** stack — which ADR-0024 §4
requires, and which ADR-0026's single resource makes natural.

`Document` is not reintroduced (ADR-0020): this model carries no selection, no view state and no
notion of "open".

**The Operations added are exactly the ones the format could not already express:**

| Operation | Why it exists |
|---|---|
| `ADD_NODE` / `REMOVE_NODE` | a node appears and disappears; `REMOVE_NODE` carries **its connections** and its rank, without which undoing a deletion would give back a node with no wires |
| `CONNECT` / `DISCONNECT` | the same for a wire |
| `ADD_PROPERTY` / `REMOVE_PROPERTY` | a row of the **schema**, not an instance value |

**What deliberately has no Operation**: moving a node, changing one of its `params`, renaming a
property, changing its type, changing its default. Each is a field of a reactive record, so each is
a `SET_PROPERTY` — which replicates and inverts from the day the format existed. A dedicated
operation would be a second way of saying what the format already says.

Moving a node is therefore `SET_PROPERTY x` + `SET_PROPERTY y` under **one** `batch`: a drag across
the canvas is **one** `Ctrl Z`, with no debounce and no second history.

### 6. The interpreter

`runtime/scripting/interpreter.js` plugs the model into ADR-0015's seam, without changing it:

```
interpretGraph(graph) ──► create(component) ──► behavior.update(self, ctx)
     once per graph           once per instance           every step
```

- **flow pushed, data pulled.** A flow is followed from an event node; a value is pulled by walking
  back up its dependencies;
- **depth-first, in declared order.** `Sequence` means "everything the first branch does, then
  everything the second does" — not the two interleaved. Determinism is not added afterwards, it is
  that order;
- **the value cache is reset at every flow step.** Memoizing across the whole event would let a
  `Get Property` serve the old value after a `Set Property`;
- **a budget** of 4096 nodes per event. A flow that loops is how a creator writes a loop: forbidding
  it would be forbidding the feature. What is forbidden is a frame that never ends;
- **errors are structured `GraphError`s**, thrown. The runtime isolates and reports them without
  touching the model: it is ADR-0012's path, with no second mechanism.

**A graph writes with a plain write**, never through `setProperty()`: a behaviour running inside
`update()` is a **simulation output**, not an intent (ADR-0003, `CONVENTIONS.md`). The write stays
observable, because the component is the reactive Proxy the Object holds (ADR-0015 §5).

### 7. Validation is a module, not a window

`validateGraph(payload, { registry, properties })` is pure: it takes the payload — the only shape a
server and an editor have in common — and returns structured findings.

| Finding | Severity |
|---|---|
| an unknown version, an unknown node type, a duplicate identifier | error |
| an unknown port, a reversed wire, a flow wired onto data, incompatible types | error |
| a data input fed twice, a flow output continuing twice | error |
| a **data cycle** | error — a value defined by itself has no evaluation order |
| a **flow cycle** | *none* — it is a loop, bounded by the budget |
| a referenced property that no longer exists | error |
| a node with no property selected | warning — it runs, it just has nothing to write |

### 8. A deleted property **never** leaves a dangling reference

Three views of one finding, never three rules:

1. `validateGraph()` returns `MISSING_PROPERTY`;
2. the Graph window rings the node in red and shows the sentence;
3. the interpreter throws a `GraphError` that the runtime reports.

**The graph is not rewritten** when a property is deleted. Rewriting would make one gesture change
two things the creator can see, and a `Ctrl Z` would have to guess which one to restore. Undoing the
deletion makes the graph valid — that is tested.

### 9. Rendering is SVG, in **one** layer

Legacy drew nodes as `<div>`s and wires as SVG: two DOM trees to keep in agreement, and a port
position that existed only while the element was displayed. A single SVG gives a single coordinate
space: a port's position is arithmetic (`editor/graph/view.js`), the same arithmetic that hit-tests
it, and zoom is an attribute.

**A flow port is a triangle, a data port a disc.** It is the only rule the canvas actually enforces,
so showing it is not decoration.

### 10. Opening and closing a resource

`Workspace` holds a map of open editors, each with its model, its pipeline and its stack. This makes
`Workspace.open()` real and makes possible what ADR-0025 refused for want of a way to close:
**deleting a scene after closing it**.

**"Attached" is not "open".** Selecting a `.px` in Project gives the Inspector a live model for
editing its properties — the resource is *attached*. Only a double-click *opens* it, and only an
open resource refuses to be deleted. Without that distinction, clicking a Component once would make
it indestructible.

**One scene at a time**, always: every window is bound to a `Scene`, so opening a second one closes
the first. Several `.px`s can be open together.

### 11. Dragging a property onto the graph is **refused, with its reason**

ADR-0026 §6 made drag and drop a rule table. A property dropped on the canvas could mean
`Get Property` **or** `Set Property`, and choosing on the creator's behalf is exactly the magical
behaviour ADR-0026 asks us to avoid. A modifier to tell the two apart would be an invisible
convention.

What exists instead is explicit and discoverable: the node creation menu has a `Properties`
category, and the chosen node offers the Component's properties by name. The rule can be added the
day an unambiguous gesture is designed — it is one line in `dnd/rules.js`.

> **Amended by ADR-0037 (2026-08-22) — the gesture has been designed, and the refusal is lifted.**
> The unambiguous gesture this section called for is a **menu opened where the pointer released**:
> the creator chooses `Get` or `Set` explicitly, locally, and nothing is guessed. §11's reasoning is
> not reversed, it is **satisfied**. A drop on an **existing** node opens no menu: placing that node
> was already the choice, and the drop merely fills its params.

---

## What this ADR does not decide

| Open point | Why it stays open |
|---|---|
| **An inline value on an unconnected input** | today a free input yields the default declared by the port. A field on the node itself is a real convenience and a real rendering question; it does not change the format |
| **Drawing nodes** | `draw` belongs to the Component type (ADR-0015 §9). A node that produces pixels needs a seam nothing is asking for yet |
| **Multiple selection, copy/paste, comments, a minimap** | each is a gesture with its own questions; shipping half of one is what makes a canvas unpredictable |
| **The undo scope of an action touching two resources** (ADR-0024) | the Graph window exists now, but closing an editor already frees its stack — the remaining case (undoing in Project the creation of a `.px` whose stack has been freed) can no longer produce an orphan entry. The general treatment remains to be written |
| **The `Log` node in production** | it takes its sink from the host and is inert without one. A Console window is another step |

---

## Consequences

### Positive

- A `.px` is finally **runnable**: the product's first real visual scripting runtime.
- A creator declares their properties, edits them, renames them — and the graph follows, because
  what a node stores is an identity.
- Graph undo/redo cost **no** mutation code: the format already carried it.
- Client and server interpret the same graph through the same code, with no variant.
- The model is testable under Node, including the canvas geometry — which was strictly impossible in
  Legacy.

### Negative

- The node catalogue lives in the Core, which puts a **function** into a layer that until now held
  only data and model. That is accepted and bounded: a node is pure, and a test refuses a shipped
  node that names `document`, `Date.now` or `Math.random`.
- An unconnected `Set Property` writes the property's default on every step rather than doing
  nothing. That is coherent (a free input is worth its default) and surprising; an inline value will
  make it explicit.
- The budget is an arbitrary number. It is frank rather than right.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A node's shape and behaviour in two layers** | Two tables to keep in step, for one idea. |
| **The catalogue and the interpreter entirely in the Runtime** | The Editor draws the ports and the validator checks them; both would have had to depend on the Runtime to know what a node is. |
| **Keeping ADR-0009's `variables`** | A second state system beside the Component's properties, for the same idea. |
| **A port designated by its index** (`["n1","out",0]`, ADR-0009) | It is the defect measured in Legacy: a node type gaining a port rewires every graph. |
| **An `Operation` for moving a node** | A position is a reactive field; `SET_PROPERTY` does it, replicates and inverts already. |
| **An `UPDATE_PROPERTY` `Operation`** (rename / retype / redefine) | The same argument: three fields of a reactive record. |
| **Forbidding all cycles** | A flow that loops **is** a loop. Forbidding it is forbidding the feature. |
| **Rewriting the graph when a property is deleted** | One gesture would change two visible things, and undo would have to guess which to give back. |
| **HTML nodes + SVG wires** (Legacy) | Two DOM trees to keep in agreement, and a port position that only exists on screen. |
| **Compiling the graph to JavaScript** | Settled by ADR-0009 Q7: `.px` is interpreted, without `eval`. |
| **A property drop that creates a `Get Property`** | `Get` or `Set` — guessing on the creator's behalf is the magical behaviour ADR-0026 refuses. |
