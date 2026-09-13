# ADR-0019 — Structural Operations, `invert()`, and a unified `REPARENT`

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0008 (Operations), ADR-0011 (authority), ADR-0018 (structural order)
- **Completes and amends:** ADR-0008, §"Observed context"

## Observed context

`OperationType` contained only `SET_PROPERTY`. Every **structural** mutation — creating, deleting,
attaching a Component, reparenting — was done by a direct call, and therefore: with no arbitration,
no replication, no history.

`ADR-0008` listed Legacy's network messages, including `addChild` and `removeChild`. That list is
an **inventory of an existing protocol**, not a design decision: it described what Legacy sent.

`Object.addChild()` already detached the object from its previous parent (`object.js`) — "adding a
child" *already was* a reparent.

## Decision

### 1. Seven types for the Scene, two for the Project

| Type | Scope | Payload | Inverse |
|---|---|---|---|
| `SET_PROPERTY` | Scene | `{ target, prop, value, previous }` | `previous` ↔ `value` |
| `ADD_OBJECT` | Scene | `{ object, subtree, parent, index }` | `REMOVE_OBJECT` |
| `REMOVE_OBJECT` | Scene | `{ object, subtree, parent, index }` | `ADD_OBJECT` |
| `ADD_COMPONENT` | Scene | `{ object, component, index, values }` | `REMOVE_COMPONENT` |
| `REMOVE_COMPONENT` | Scene | `{ object, component, index, values }` | `ADD_COMPONENT` |
| `MOVE_COMPONENT` | Scene | `{ object, component, index, previousIndex }` | indices swapped |
| `REPARENT` | Scene | `{ object, parent, index, previousParent, previousIndex }` | the same, `previous*` swapped |
| `ADD_RESOURCE` / `REMOVE_RESOURCE` | Project | manifest + payload | each other |

### 2. `REPARENT` replaces `ADD_CHILD` and `REMOVE_CHILD`

**SETTLED.** One Operation covers four gestures:

- reparenting;
- detaching (`parent: null`);
- reordering among siblings (the same parent, another index);
- **reordering among the roots** — a Scene's roots are the children of an implicit `null` parent
  (ADR-0018).

The real gesture in a Hierarchy is a drop *between two rows*: it changes the parent **and** the
position, atomically. Two separate Operations would always have to travel together, undo together,
and in the right order.

And the decisive argument: **the inverse of a `REPARENT` is a `REPARENT`**. Two operations that
cancel each other out are the same operation.

> **This is not a reversal of ADR-0008.** The capability covered is rigorously identical; what is
> simplified is the list of a network inventory. ADR-0008 is amended accordingly.

### 3. The structural events do not merge

`child:added` / `child:removed` stay. **They are two different layers:**

| | Operation | Scene event |
|---|---|---|
| What it is | an arbitrable, replicable, undoable intent | a notification that the shape has changed |
| Produced by | `submit()` | any mutation, including a script's `addChild()` |

Merging the two would make every script call replicable, and every replicated change
unobservable.

### 3 bis. A structural event is announced when the shape is whole — added 2026-08-17

A clarification from the implementation, not a reversal. `reparent()` unlinks and then relinks; the
notifications emitted **between the two** described a tree in which the object belonged to nothing.
A listener that rebuilds at that moment — the Hierarchy — drew a tree without it, and nothing
followed to fix it.

The notifications of a rearrangement are therefore held and emitted **once**, when the shape is the
one the scene has. The list of events does not change; what is additionally guaranteed is that
**the state read during an event is a coherent state**. Without that guarantee, "the Scene
announces that the shape has changed" has no usable meaning.

### 4. `apply()` never writes through an API that would resubmit

**The anti-echo property is extended to the structural Operations.** Every handler mutates through
the internal primitives (`linkChild`, `unlinkChild`, the ordered collection), which produce no
Operation. Applying a replicated operation therefore sends nothing back: **the loop is not
prevented, it is unrepresentable** (ADR-0008).

### 5. A handler refuses, it does not throw

A cycle, an index that changes nothing, a Component already attached → `applied: false`, **no
Operation emitted**. A `throw` inside the pipeline would propagate to the transport. The cycle
guard (`isAncestorOf`) now lives in the handler, not only in `addChild()`, because a replicated
operation must be validated too.

**A cycle over the network:** two clients simultaneously reparent A under B and B under A. Each
operation is valid locally; their composition is not. It is the authoritative server that decides,
in **its** order (ADR-0011). No extra machinery.

### 6. `seq` is per pipeline

It used to be a module-level counter, shared by every scene in the process. It becomes an instance
counter, **stamped by the pipeline at `submit()` time**. An operation that arrives already
numbered — replicated — keeps its author's number.

### 7. Identifiers are generated by the author

They travel in the payload. An identifier minted by the receiver would make the scenes diverge from
one machine to another.

### 8. `invert()` belongs to the Core

Pure, model-free, testable under Node. One place knows each type's inversion rule. The inverse's
`seq` is reset to `null`: it is a **new** intent, which takes its own number from whichever
pipeline accepts it. `actor` and `batch` are preserved. See ADR-0024 for what is done with it.

### 9. The inversion fields are named and separable

`previous`, `subtree`, `values` and `previous*` serve only to invert. A transport is free to prune
them — a server does not need them in order to apply. **That optimization is not built**; the
format merely makes it possible, and it is naming the fields that makes it possible.

## What this ADR does not decide

- The granularity of graph editing Operations (`ADD_NODE`, `CONNECT`…). As long as the graph model
  does not exist, a graph is saved whole. A deliberate deferral.
- The network format of the structural Operations on the wire.

## Consequences

### Positive

- Creating, deleting, attaching, reordering and reparenting become replicable and undoable, with no
  dedicated undo code.
- A Hierarchy drop is **one** atomic operation, with **one** inverse and **one** cycle validation.
- Four gestures, one mental model.

### Negative

- ADR-0008 had to be amended: a list written in an accepted ADR is being replaced.
- `Scene` takes a `registry`, since an `ADD_COMPONENT` rebuilds an instance.
- `Operations.register` takes a `resolveTarget` option, because an `ADD_OBJECT` names a target that
  does not exist yet.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping `ADD_CHILD` / `REMOVE_CHILD` + a reordering Operation** | A drop produces two or three operations that must always travel and undo together, and whose order matters. Three inversion rules instead of one. |
| **A separate `UNPARENT`** | Its inverse is a `REPARENT`. It is the same operation with `parent: null`. |
| **Validating cycles in `addChild()` only** | A replicated operation does not go through `addChild()`. |
| **Making invalid handlers throw** | The `throw` would propagate to the transport. |
| **Keeping `seq` global to the module** | Harmless while it is a local ordering number; wrong the day it is a network sequence number. |
