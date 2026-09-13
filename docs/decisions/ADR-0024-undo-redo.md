# ADR-0024 — Undo/Redo: `invert()` in the Core, `History` in the Editor, one stack per resource

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0008 (Operations, `previous`, `batch`), ADR-0011 (authority), ADR-0019 (`invert()`), ADR-0020 (`ResourceId`)

## Observed context

ADR-0008 established that "undo/redo becomes a consequence of the architecture, not a separate
feature". Nothing had been built: `SET_PROPERTY` carried `previous`, and no code used it.

## Decision

### 1. The division of responsibility

| What | Where | Why |
|---|---|---|
| An Operation carries what it needs to invert | **Core** — the format | already the case for `SET_PROPERTY` |
| `invert(operation) → operation` | **Core** | one place knows each type's rule; pure, testable under Node; it stops the Editor from re-deriving those rules |
| The stack, the grouping, the shortcut | **Editor** | undoing is an authoring act. A headless server replaying operations undoes nothing |

It is the same boundary ADR-0017 draws for selection.

### 2. Four rules, and they are enough

**1. We record what `submit()` emitted** — therefore never an operation received through
`apply()`. The anti-echo (ADR-0008, ADR-0019) protects the history **for free**: a replicated
operation emits nothing, so it never reaches the listener.

**2. We record only our own operations** (`actor === me`). Without that rule, `Ctrl Z` would undo
another creator's work. No machinery: the field already exists. `actor: null` records everything,
which is the single-user case, and the current case.

**3. Undoing goes through `submit(invert(op))`, never through `apply()`.** An undo is a **new
intent**: it must be arbitrated — the server may refuse it — and it must replicate. An undo applied
locally would silently desynchronize the project.

> It is the easiest point in the whole system to get wrong. It is covered by a dedicated test: **an
> undo does emit `'operation'`**, and what the pipeline announces is a real, replicable mutation.

**4. A `batch` is one entry**, inverted in reverse order. A drag is one undo; so is a Hierarchy
drop that also rewrote five Transform values (ADR-0022).

The redo stack is the stack of undone operations, **cleared as soon as a new operation is
submitted**: it described a future that no longer exists.

An undo refused by the authority flips nothing: both stacks stay intact, because there is nothing
to re-undo.

**An entry whose target has disappeared is not a refused entry** (amended 2026-09-12). A `Destroy`
removes an Object as a primitive: no Operation records it, so the entry that created it designates
an identifier that will never resolve again. Keeping it freezes the stack — `canUndo` stays true,
every following `Ctrl Z` does nothing, and everything beneath becomes unreachable. It is therefore
**discarded**, and the keystroke continues to the most recent entry that can actually be taken
back. The two causes are told apart by the pipeline's answer: an authority decision that refuses
may be granted later, an absent target does not come back.

**An abandoned gesture does not cost an entry** (amended 2026-09-12). A drag writes as it goes —
that is what makes the object follow — and putting back what it had moved is written under the
**same `batch`**, so rule 4 leaves behind an entry that does nothing. `Ctrl Z` was spent on it with
nothing moving on screen. The gesture announces the `batch` it abandons and the Editor removes that
entry (`History.forget()`), under three conditions that keep it harmless:

- only **the top entry** is removed, and only if it carries that `batch`. If a foreign operation
  slipped in during the gesture — a `Delete` or a `Ctrl D` pressed with the button held — the part
  of the gesture before the intrusion stays on the stack: an entry that changes nothing on screen,
  never a wrong inversion;
- **nothing is mutated**: removing an entry emits no Operation, so rule 3 holds;
- **the redo stack loses nothing**: it had already been cleared by the gesture's first operation,
  before anyone knew it would be abandoned.

### 3. No second mutation path

The history **never mutates the model directly**. It has one action: `submit(invert(op))`. There is
therefore nothing undoable that is not replicable, and no way for the history and the network to
disagree about what happened.

### 4. One stack per resource

A global stack is the classic mistake: `Ctrl Z` in the `Graph` window would undo a change made in
the scene.

| Stack | On which pipeline | What it undoes |
|---|---|---|
| Project | the Project pipeline | creating / deleting / renaming a resource |
| Scene (one per open scene) | that Scene's pipeline | the whole scene model |
| Graph (one per open graph) | that graph's pipeline | graph editing, once its model exists |

`Histories` indexes them by `ResourceId` (ADR-0020). Closing an editor frees its stack.

### 5. What is not restored, and must be said

A graph's execution state (the `Behaviors` `WeakMap`) and a Component's working fields are **not**
restored. They are live state, not project data; **undoing does not rewind the simulation.** It is
the same boundary as between a direct write and a `setProperty()` (ADR-0003), and it needs to be
stated rather than discovered.

### 6. What the format must carry for this to work

These fields serve only to invert, and ADR-0019 names them:

| Without which | The undo would give back |
|---|---|
| `SET_PROPERTY.previous` | nothing |
| `REMOVE_OBJECT.subtree` | an object stripped of its children |
| `REMOVE_OBJECT.index` | the object at the end of the list |
| `REMOVE_COMPONENT.values` | a component reset to its defaults — the `42 → 1` measured in Phase 1 |
| `REPARENT.previousParent` / `previousIndex` | an object reparented "somewhere" |

## What this ADR does not decide

**The undo scope of an action that touches two resources.** Creating a Component creates a
`ComponentResource` **and** a `GraphResource`: that is a `batch` on the Project pipeline, so one
entry in the Project stack — coherent. But if the creator then edits the graph, undoes three times
in the `Graph` window, and then undoes once in the Project panel, the creation is undone while
changes to its graph are still in a stack pointing at a resource that no longer exists.

Three possible treatments — closing a tab clears its stack; deleting a resource invalidates the
entries targeting it; forbidding the undo of a resource deletion from another stack. **None is
adopted.** It is the one point where inventing would be a mistake, and it becomes decidable once the
`Graph` window exists.

Also undecided: the real stack depth (200 by default, arbitrary and inconsequential), and the
Undo/Redo menu entry — only the shortcuts are wired.

## Consequences

### Positive

- Undo/redo is a consequence of the format, with no dedicated mutation code.
- An undo is observable, replicable and arbitrable like everything else.
- `Ctrl Z` cannot cross a resource boundary nor undo someone else's work.

### Negative

- An undo can be **refused** by the authority. That is correct, and it is new to anyone who expects
  an undo always to succeed.
- The module has to ignore the operations it emits itself while replaying, otherwise an undo would
  immediately become its own undo.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Undoing through `apply()`** | It desynchronizes silently: no arbitration, no replication. |
| **A snapshot per history entry** | It loses the intent, does not replicate, and costs a whole scene per keystroke. |
| **`invert()` in the Editor** | A second copy of the format's rules, invisible to a server replaying operations. |
| **A global stack** | `Ctrl Z` in one window would undo work done in another. |
| **Restoring the execution state too** | Undoing is not rewinding a simulation; it would be a second model of time. |
