# ADR-0015 — A Component may have a `.px` graph that defines its behaviour

- **Status:** **accepted** (2026-08-12) · **revised** (2026-08-12)
- **Decides:** where a `.px` graph enters the simulation
- **Related to:** ADR-0004 (Components), ADR-0005 (no "Systems"), ADR-0007 (Inspector),
  ADR-0009 (`.px` and `.js`), ADR-0012 (errors)

---

## What this revision fixes

The first version of this ADR introduced a generic `Script` Component carrying `kind` + `source`,
and a registry of "script kinds". That model is borrowed from other engines, **not Pixel
Creator's**: it makes a notion of "script" appear in the UX, where the user only handles
Components, and it made `.px` a component type instead of a behaviour.

The model adopted is Pixel Creator's from the beginning:

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

`Controller.px` **is not a component and never becomes one**. It is the *behaviour* of the
`Controller` Component type: the graph that says what a Controller does. A `Health` has its
`Health.px`, a `Weapon` its `Weapon.px`.

**There is no `Script` Component**, no "scripting" exposed to the user, and no Component type is
generated dynamically by a `.px`.

---

## Decision

### 1. A graph is bound to a Component **type**

The association is `Component type → graph`, held by a `Behaviors` host
(`runtime/scripting/behaviors.js`):

```js
behaviors.bind('Controller', graph);      // or bind(Controller, graph)
```

It is carried by the type, not by the instance: that is what guarantees that **nothing from the
graph enters a component's serialized data**. What serializes from a `Controller` is its
properties (`speed`, …) and nothing else.

`.js` needs nothing here: a module whose default export is a component class **is** a Component
type, resolved by `import()` and registered like the others (ADR-0009). A graph is the other half
of the sentence: the behaviour of a type, not a type.

### 2. The seam

```
graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
        once per graph        once per instance         every step
```

`interpret` is the graph interpreter. **It is not built here** — no language, no graph model, no
VM, no sandbox (ADR-0009). What is fixed is where it plugs in, so that it can arrive without
changing anything in the runtime.

### 3. Two levels, because two different things are shared

| | Depends on | Done |
|---|---|---|
| **Interpretation** | the graph alone | **once per graph**, shared by every component of that type |
| **Instantiation** | the instance | **once per component**, never shared |

A graph has variables, timers, a position within its own execution. A hundred `Controller`s in a
scene share one interpretation and **never have a common execution state**. That is the whole
reason the seam is a factory and not a single object.

### 4. An interpreted behaviour is not state

A component's own enumerable properties **are** its serialized state. A behavior is a live object
carrying methods, derived from the graph. Writing it onto the component would put functions into
every snapshot and every replicated payload.

It therefore lives in a `WeakMap` keyed by the component.

### 5. The graph writes through the normal reactive path

The factory receives the component **exactly as the Object holds it**, that is, the reactive
`Proxy`. A write from a graph is therefore an ordinary write: the same `Change`, the same
replication, the same Inspector update as a write from hand-written code. There is no "graph" write
path and no "code" write path (ADR-0009).

### 6. Rebinding a type edits its behaviour live

`bind()` on an already-bound type replaces the graph; the current behavior is replaced on the next
step, on every instance. Editing `Controller.px` in the editor takes effect with nothing to
reload.

### 7. Errors follow ADR-0012, with no exception

An impossible interpretation, an invalid factory, an exception from the graph: everything surfaces
as a `throw` during `update()`. The runtime **reports** it and touches nothing — no automatic
disabling, no implicit write of `active`, no `Change` produced by handling the error, and the rest
of the scene continues.

The report is attributed **to the Component** (`type: 'Controller'`), since it is what runs. A
systematically broken graph is reported on every step: Legacy's silence is what we refuse.

### 8. A Component is the unit of execution and of isolation

The runtime runs, for each active component and in scene order: its `update` if it has one, **and
then** the graph bound to its type. One component, one place in the order, one `try`/`catch`.

**There is no `ScriptSystem`** (ADR-0005). A graph runs because the Component carrying it runs: it
inherits error isolation, the fixed step, the update/draw separation, the deterministic order and
headless execution for free — **with no second execution path to keep consistent between client
and server.** The same runtime interprets the same graph on both sides, because there is only one.

### 9. The seam covers `update` only

Drawing belongs to the **Component type**: it is what declares `draw`, and the `SceneRenderer`
already knows how to run it. A purely logical `Controller` therefore pays no
`save`/`setTransform`/`restore` per frame and is not counted as drawn. A graph that produces pixels
will come with the graph model, not before.

---

## What this ADR does not decide

| Open point | Where it will be settled |
|---|---|
| ~~How a purely graph-based Component type is declared~~ | **settled**: ADR-0016 (a definition = type + properties + graph) |
| What becomes of a graph's `variables` with respect to the schema and the Inspector | ADR-0007 + the graph model |
| The graph model and the interpreter themselves | ADR-0009 |
| ~~Who calls `bind()` (project loading, editor, server)~~ | **settled: ADR-0020** — the `src/project/` layer. It reads the `GraphResource` designated by `definition.graph` and passes the **resolved** graph to `behaviors.bind(type, graph)`. `bind()` refuses a `ResourceId`: the Runtime never reads storage, and `runtime → project` is a forbidden import |

---

## Consequences

### Positive

- The editor's UX and the execution model say the same thing: a Component, its `.px`.
- Zero new execution paths in the runtime.
- Several behaviours on one object are natural: they are several Components, each with its graph.
  The previous version's "one script per Object" limit disappears without loosening "one component
  per type" (ADR-0004).
- Identical on client and server, by construction.
- Nothing of the `.px` language is frozen prematurely.

### Negative

- A Component type must exist before a graph can be bound to it — that is deliberate (no type is
  generated by a `.px`). The brick that declares a type is ADR-0016.
- Interpretation is lazy: a component's first step pays for reading the graph.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A generic `Script` Component (`kind` + `source`)** — the previous version of this ADR | It invents a notion of "script" in the UX; it puts the source into the component's data; it makes `.px` a type instead of a behaviour. |
| **A `.px` generates its Component type** | The type would become a consequence of a behaviour file, and the Inspector would depend on a graph to know what a `Controller` is. |
| **A graph bound to the instance and serialized with it** | It duplicates the behaviour into every object and mixes behaviour with data. |
| **A `ScriptSystem` orchestrating the graphs** | A second execution path to maintain, and it contradicts ADR-0005. |
| **A single behavior shared by every instance** | Two `Controller`s would share timers and variables: a guaranteed bug, and non-deterministic over the network. |
| **`eval` / `new Function`** | Security, and it contradicts ADR-0009 (`.px` is interpreted). |
| **A behavior stored on the component** | It puts functions into serialization and replication. |
| **Explicit compilation through a `load()`** | One more phase you can forget to call, and a "not loaded yet" state to handle everywhere. |
