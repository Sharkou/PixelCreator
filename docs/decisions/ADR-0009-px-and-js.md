# ADR-0009 — `.px` is a graph, `.js` is JavaScript

- **Status:** **accepted** (2026-08-12), including the execution mode (Q7: interpreted)

## Observed context

### The real state of visual scripting

The node editor **works**: creation by drag and drop, input/output/error connectors, SVG Bézier
paths, pan and zoom (recently improved). The palette is defined in HTML:

- **events**: `init`, `update`, `mouse`, `key`, `collision`, `timer`
- **structures**: `if`, `repeat`
- **functions**: `math`, `move`, `edit`, `create`, `delete`, `draw`, `print`

But **everything else is missing**:

- **The graph is the DOM.** A node is a `<div>`; a connection is a pair of connectors linked by
  JS properties set on DOM elements (`connector.other`, `connector.path`).
- **No serialization.** Closing the tab loses the work.
- **No compilation.** `Graph.updateScript()` does `console.log(this.nodes)` and then
  `this.code = ''`; the useful lines are commented out.
- **No link to the runtime.** No object ever runs a graph.
- **No variables, no metadata.**

`editor/graph/compiler.js` is not a graph compiler: it is the lexer/parser of a textual language
with Rust-like syntax (`i32`, `fn`, `let`, `struct`, `match`, `mod`). Its `compile()` method calls
`lex`/`parse`/`transpile`/`evaluate` **without the `Compiler.` prefix**, and `evaluate` exists
nowhere → a systematic `ReferenceError`. Dead code.

### `.px` is JavaScript in disguise today

This is the most important point, and it contradicts the stated intent:

```js
// legacy/src/core/loader.js
static allowedScriptsTypes = ['text/javascript', 'application/javascript', 'application/px'];
```

A `.px` file follows **exactly** the path of a `.js`: read as text → a Blob URL → `import()` →
`module.default` treated as a component class.

On top of that, the private server knows a different type: `application/pixelscript`. **Two
divergent MIME types for the same idea.**

## Decision

Two formats, two natures, **one object model**.

| Extension | Nature | MIME | Execution |
|---|---|---|---|
| `.px` | a **graph** — a structured JSON resource | `application/px` (unified) | interpreted by the runtime |
| `.js` | a JavaScript ES module | `text/javascript` | dynamic `import()` |

`.px` **stops** being routed to `import()`.

### The `.px` data model

```json
{
  "version": 1,
  "nodes": [
    { "id": "n1", "type": "update", "x": 120, "y": 80, "params": {} },
    { "id": "n2", "type": "move",   "x": 340, "y": 80, "params": { "speed": 2 } }
  ],
  "connections": [
    { "from": ["n1", "out", 0], "to": ["n2", "in", 0] }
  ],
  "variables": [
    { "name": "speed", "type": "number", "value": 2 }
  ],
  "metadata": { "name": "player" }
}
```

The current node editor is kept and **drives this model** instead of being the model.

### One API for both

`.px` and `.js` manipulate the same concepts: `Object`, `Component`, `Property`, `Scene`,
`Resource`, `Event`, `Runtime`.

```
        The engine's API
       ┌───────┴───────┐
   a .px graph      a .js script
```

A `move` node and a `self.x += speed` in JavaScript go through the same write path, therefore
through the same Property System, therefore through the same network replication. **They are not
two engines.** A node can do nothing a script cannot do, and vice versa.

### Two distinct roles, not two ways of getting a component

| Format | What it produces |
|---|---|
| `.js` | a **Component type** — the default-exported class, registered like the others |
| `.px` | the **behaviour** of a Component type that already exists — `Controller.px` for `Controller` |

A `.px` **generates no component type** and does not appear as a component: it is the behaviour of
the one under which the editor displays it (ADR-0015). What is inspected therefore stays the
**Component** and its properties (ADR-0007), not the graph.

> **An open point.** What becomes of a graph's `variables` — pure execution state, or a
> declaration carried into the Component's schema — is settled together with the graph model.
> Nothing depends on it today: a graph's execution state is already, by construction, distinct
> from the component's serialized data.

## Execution mode — SETTLED: interpreted

**Q7 settled: `.px` is interpreted, for debuggability and safety.**

| | Interpretation ✅ | Compilation to JS |
|---|---|---|
| Debugging | step by step, visual breakpoints | hard (generated source) |
| Safety | **no `eval`** | depends on the generation |
| Performance | slower | close to native |
| Complexity | moderate | high (a generator + source maps) |

A gameplay graph runs a few dozen nodes per frame: the readability of stepping and the absence of
`eval` are worth more than raw speed.

The practical consequence: `runtime/scripting/` contains a **graph interpreter** — it walks the
nodes and calls the engine's API. No code generation, no `eval`, no `Function()`. It is wired
into the `Behaviors` host, which binds a graph to a Component type and gives each instance its own
execution state (ADR-0015).

The `.px` format stays unchanged if compilation should one day become necessary: it is an
execution decision, not a format decision.

> **A security note.** `.js` keeps going through dynamic `import()`, which runs arbitrary code —
> accepted for scripts the creator writes themselves. `.px`, by contrast, is interpreted and never
> runs arbitrary code: that is what makes it the safe format for shared content.

## Addition — where a graph lives (ADR-0020, 2026-08-14)

A `.px` graph is a **`Resource` of `kind: 'graph'`**: an opaque identity, a JSON payload, stored
by the `ResourceStore`, openable on its own in the **`Graph`** window. A Component definition
references it by `ResourceId`, never inline (ADR-0016 amended).

The `src/project/` layer resolves that reference and passes the resolved graph to
`behaviors.bind()` — that is the answer to the "who loads and who binds" point, left open here as
in ADR-0015 and ADR-0016.

**Terminology:** the window that edits a graph is called **`Graph`**. `Composer` is reserved for a
possible future music composition window and never designates this (`PROJECT.md` §2).

None of this touches the execution mode: no `eval`, no `new Function`, the graph stays
interpreted.

## Consequences

### Positive

- A graph becomes a real resource: saved, versioned, replicated, diffable.
- `.px` stops being a `.js` in disguise, as the vision requires.
- The JSON format is readable by a human and by an AI.

### Negative

- **This is construction, not migration.** To be kept off the critical path (risk R11) so that it
  does not delay Core/Runtime/Editor.
- A graph executor is needed, and there is none at all today.
- The name collision with `editor/graph/component.js` (a `Component` class unrelated to game
  components) must be resolved by renaming.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **`.px` = JavaScript** (the status quo) | Explicitly refused by the vision; it deprives the graph of any model. |
| **Reviving `compiler.js`** | It is a Rust-like textual language, unrelated to the graph, and it does not work. |
| **A single `.js` format, with the graph as a view** | A graph cannot be expressed cleanly as JavaScript without losing layout and metadata. |
| **A binary format** | Unreadable, not diffable, no benefit at this scale. |
