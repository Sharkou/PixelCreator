# ADR-0016 — A definition describes a Component type: properties + graph

- **Status:** **accepted** (2026-08-13)
- **Decides:** how a Component created by a user is described, shared and reused
- **Related to:** ADR-0004 (Components), ADR-0007 (schema), ADR-0009 (`.px`), ADR-0015 (behaviour)

---

## Context

ADR-0015 established that a `.px` graph is the **behaviour** of a Component type, and left one
point open: **where the type comes from**. For a component shipped with the engine the answer is
obvious — a JavaScript class. For a component a creator builds in the editor there was none.

Yet it is a central product need: a user must be able to create their own reusable Component, with
its properties, its graph, and a definition shared by all of its instances.

**OBSERVED in Legacy:** a file became a component through `URL.createObjectURL` + `import()`, and
the type was `module.default`. There was no schema, no definition and no stable identity: the
component *was* the file, and nothing described what it contained.

---

## Amendment of 2026-08-18 (ADR-0026) — the graph is CARRIED, not referenced

This ADR required `definition.graph` to be a `ResourceId`, for two reasons: not duplicating a
graph, and letting the Graph window open it without loading the definition.

**A Component and its graph are now a single `.px` resource**, and `graph` carries the graph
itself. Both reasons still hold, differently: with a single resource, duplication is impossible by
construction, and "opening the graph" *is* "opening the `.px`". What changes is that a creator who
makes a Component gets **one** file, not two.

`defineComponent()` now refuses a string, with a message that says why.

## Decision

### 1. A Component is properties + behaviour

```
Controller.px
     ↓
Component Controller
├── properties    the schema — therefore what serializes (ADR-0007)
└── behaviour     the graph bound to the type (ADR-0015)
```

A **definition** is that pair, written as data:

```json
{
  "type": "res_c3",
  "label": "Controller",
  "revision": 1,
  "properties": { "speed": { "type": "number", "default": 120 } },
  "graph": "res_d4"
}
```

> **Amended on 2026-08-14.** The original example showed `"type": "Controller"` and the graph
> **inline**. Two of this ADR's open points are now closed:
>
> - **identity (ADR-0021)** — `type` is the definition's `ResourceId`, `label` is the displayed
>   name. The original example made every rename a rewrite of every scene in the project;
> - **storage (ADR-0020)** — `graph` is the `ResourceId` of a `GraphResource`. A graph is a
>   resource like any other: openable on its own in the `Graph` window, stored once, diffed
>   separately. An inline graph would make it impossible to open `Controller.px` without also
>   opening the definition file, and would let two copies of the same graph diverge.
>
> `defineComponent()` **refuses** an inline graph.

It is JSON: saveable, versionable, diffable, replicable — like the graph itself (ADR-0009).

### 2. A definition produces an **ordinary** Component

`defineComponent(definition)` (`core/definition.js`) turns it into a component class:

```js
const Controller = components.register(defineComponent(definition));
behaviors.bind(Controller, graph); // the graph, resolved by the Project layer (ADR-0020)
```

It enters the `ComponentRegistry`, attaches through `addComponent()`, displays in the Inspector by
its schema, serializes by its properties. **Nothing downstream can distinguish a component born
from data from one written by hand**: there is no second kind of Component.

### 3. The definition belongs to the type, never to the instance

The schema and the graph live on the class. An instance carries only **its values**.

A scene of a thousand `Controller`s contains a thousand `speed`s and **one** graph; a snapshot or a
replicated payload never carries behaviour. Each instance, by contrast, owns its own execution
state (ADR-0015).

### 4. A fresh instance has exactly the declared properties

Every schema key exists on a fresh instance, with its default. That is what makes the Inspector,
serialization and the graph agree on what a `Controller` *is*, and it removes the drift flagged in
ADR-0007 ("the schema declares `speed`, the constructor forgot it").

A container default (an array, an object) is **copied** per instance: sharing one array across every
instance of a type is an aliasing bug, not a default.

### 5. For the Core, a graph is data

`core/definition.js` carries the graph and never reads it. Interpreting it belongs to the runtime
(ADR-0015). **No Core → Runtime dependency**, and the server loads the same definitions as the
client.

### 6. Redefining a type is a deliberate act

Two distinct classes claiming the same name stay an error — it is the bug the registry exists to
catch. A creator editing their component, however, says so:

```js
components.register(defineComponent(edited), { replace: true });
```

The name is rebound for whatever is created next. **Components already attached keep the class they
came from**; migrating existing instances is an editor decision, not a runtime one (see the open
points).

### 7. A graph is immutable as far as the runtime is concerned

The graph is read once and identified by its object identity. Editing a behaviour means
**producing a new graph and binding it** (`behaviors.bind`), not mutating the one in place —
otherwise a change would be invisible or would take effect at an unpredictable moment.

---

## What this ADR does not decide

| Open point | Where it was / will be settled |
|---|---|
| ~~The file format and storage of a definition (a resource)~~ | **closed: ADR-0020** — a definition is a `Resource` of `kind: 'component'`, its graph a `Resource` of `kind: 'graph'` referenced by `ResourceId` |
| ~~Who loads the definitions and calls `register` / `bind`~~ | **closed: ADR-0020** — the `src/project/` layer (`loadComponentDefinitions`). It resolves the graph and passes the **value** to `behaviors.bind()`; the Runtime never reads storage |
| ~~What becomes of existing instances when a definition changes~~ | **closed: ADR-0021** — structural reconciliation at load time (S1): an unknown key is dropped, a missing key is filled with its default. No migration scripts |
| The graph model, its `variables` and its interpreter | ADR-0009, ADR-0015 |
| The graph editing interface | Editor — the **`Graph`** window, never "Composer" (`PROJECT.md` §2) |
| The fate of a definition that is **deleted** while instances use it | **closed: ADR-0021** — `MissingComponent`, which preserves type, values and rank |

---

## Consequences

### Positive

- A creator can have their own reusable Component without writing any JavaScript.
- One Component model for the engine, for `.js` files and for definitions.
- The graph is stored once, never in the instances nor in the snapshots.
- A schema exists for every component created in the editor, so the Inspector, validation and
  serialization are exact by construction.

### Negative

- A modified definition does not update already-attached instances: that responsibility falls to
  the Editor, and it is still to be designed.
- The schema of a defined component is necessarily exhaustive: an undeclared property does not
  exist. That is intended — it is what makes serialization predictable.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **The instance carries its schema and its graph** | It duplicates the definition into every object, bloats snapshots and lets two instances of the same type diverge. |
| **A `.px` generates the Component type** | The type would become the consequence of a behaviour file; it contradicts ADR-0015 and deprives the component of a schema. |
| **Generating a class through `eval`/`new Function`** | Unnecessary — a class can be built without evaluating source — and it contradicts ADR-0009's safety rule. |
| **A `Component` base class to extend** | It contradicts ADR-0004 (duck-typing, no base class) and brings nothing here. |
| **Letting the Editor build its classes itself** | The server loads the same definitions; building them therefore belongs to the Core, not to the IDE. |
