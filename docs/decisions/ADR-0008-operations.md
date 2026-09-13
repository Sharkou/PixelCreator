# ADR-0008 — Formalize mutations as Operations

- **Status:** **accepted** (2026-08-12)
- **Depends on:** ADR-0003 (Property System)
- **Completed by:** ADR-0011 (authority)

## Observed context

**Legacy's network protocol already is an operation system that does not say so.**

| Current message | Payload | Implicit operation |
|---|---|---|
| `update` | `{id, type, component, prop, value}` | `SET_PROPERTY` |
| `add` | a serialized object | `ADD_OBJECT` |
| `remove` | an id | `REMOVE_OBJECT` |
| `addComponent` | `{id, component}` | `ADD_COMPONENT` |
| `removeComponent` | `{id, component}` | `REMOVE_COMPONENT` |
| `addChild` | `{id, child}` | `ADD_CHILD` |
| `removeChild` | `{id, child}` | `REMOVE_CHILD` |
| `upload_file` / `delete_file` | | `ADD_RESOURCE` / `REMOVE_RESOURCE` |

The shape is good. What is missing:

- **`previous`** — undoing is impossible;
- **`seq`** — no total ordering, no loss detection;
- **`author`** — no attribution, and therefore no collaboration;
- **grouping** — a drag produces hundreds of independent messages; the throttle meant to limit
  them is neutralized (`const delay = 0` in `Network.sync()`).

## Decision

Formalize what exists. **The user's ergonomics do not change.**

**SETTLED:** every mutation of the model must be representable as an internal Operation. That is
what eventually opens up network, history, undo/redo, collaboration and AI.

```
object.setProperty('x', 100)
   → Change { object, prop:'x', value:100, previous:80, origin:'editor' }   (ADR-0003)
      → Operation SET_PROPERTY { target, prop, value, previous, seq, actor }
         → authority.check()                                                (ADR-0011)
            → authoritative state → propagation
```

The user **never writes** an Operation by hand. It is produced by the Property System.

`object.x = 100` — a direct mutation of the state — produces **no** Operation: it is a simulation
output, not an intent (see ADR-0003).

**`setProperty()` is not "the network method".** The network is one possible destination of the
Operation, not its definition: the same Operation also feeds the history, undo/redo,
collaboration and any other subscribed system.

### Format

```js
{
  op: 'SET_PROPERTY',
  target: { object: 'a1b2c3', component: 'Controller' | null },
  prop: 'speed',
  value: 4,
  previous: 2,
  seq: 1042,
  author: 'user-7f3a',
  batch: 'drag-88'
}
```

### What this unlocks

| Field | Unlocks |
|---|---|
| `previous` | undo / redo |
| `seq` | total ordering, loss detection, replay |
| `author` | collaboration, attribution, logging |
| `batch` | one drag = **one** history entry |

And, further out: replaying a session, an audit log, and an AI able to modify a project by
emitting Operations rather than by manipulating the DOM.

## Amendments

> **ADR-0019 (2026-08-14) — the structural Operations.** The table above is an **inventory of the
> Legacy protocol**, not a design list. ADR-0019 replaces it with the set actually implemented,
> and in particular merges `ADD_CHILD` and `REMOVE_CHILD` into a single Operation:
>
> `REPARENT { object, parent, index, previousParent, previousIndex }`
>
> It covers four gestures — reparenting, detaching (`parent: null`), reordering among siblings,
> reordering among the roots — because they are the same mutation: a drop between two rows
> changes the parent **and** the position, atomically. The capability covered is rigorously
> identical to that of the two Legacy messages. Added to it are `ADD_OBJECT`, `REMOVE_OBJECT`,
> `ADD_COMPONENT`, `REMOVE_COMPONENT`, `MOVE_COMPONENT`, and `ADD_RESOURCE` / `REMOVE_RESOURCE`
> at Project scope (ADR-0020).
>
> ADR-0019 also clarifies that **`seq` is per pipeline** and not per module: a sequence number
> orders the operations of **one** replicated unit.

> **ADR-0024 (2026-08-14) — undo/redo.** "Undo/redo becomes a consequence of the architecture" is
> made concrete: the Core provides `invert(operation)`, the Editor holds the stack, and undoing
> goes through `submit(invert(op))` — never through a silent `apply()`, which would
> desynchronize the project without a sound.

## Explicit non-decisions

- **This is neither a CRDT nor OT.** Multi-user collaboration stays out of scope. We only make
  sure we are not making it impossible.
- **No event sourcing.** State remains the source of truth; Operations are a mutation channel and
  a history, not the primary storage.
- **Conflict resolution stays "last write wins"**, as today. `seq` merely makes the conflict
  detectable — and server authority (ADR-0011) now provides an arbiter where there was none.
- **The permission system is not implemented.** Operations carry an `actor` and go through
  `authority.check()`, but the initial policy may be permissive.

## Consequences

### Positive

- Undo/redo becomes a consequence of the architecture, not a separate feature.
- Batching fixes a real network defect (one message per keystroke).
- The protocol becomes versionable and documentable.

### Negative

- **A heavier payload** (`previous`, `seq`, `author`). To be offset by removing the `_prop`
  duplication (a measured factor of 3) and by batching.
- **A coordinated migration is mandatory**: the server is private, in Deno, on an obsolete
  WebSocket API. Client and server must switch together (risk R4).
- Computing `previous` requires a read before every write — already necessary for the Proxy's
  `set` trap, so the cost is nil in practice.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keep the current messages** | No undo, no batching, no ordering. It blocks several product goals. |
| **Expose Operations to the user** (`ops.setProperty(...)`) | It destroys the ergonomics, explicitly ruled out by the vision. |
| **A CRDT (Yjs, Automerge)** | A heavy dependency, an imposed data model, complexity out of all proportion to the current need. |
| **Per-frame state diffing** | It loses the intent ("the user moved the object") and therefore the quality of the undo. |
