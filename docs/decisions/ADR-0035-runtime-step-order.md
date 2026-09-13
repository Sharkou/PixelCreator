# ADR-0035 — The execution order of `Runtime.step()`

- **Status:** **accepted** (2026-08-22)
- **Decides:** in what order the Runtime runs a Scene's Objects, and in what order the renderer draws them at equal `layer`
- **Depends on:** ADR-0005 (runtime modules), ADR-0011 (authority and determinism), ADR-0015 (a graph runs where its Component runs), ADR-0018 (structural order), ADR-0034 (a Scene's canonical order)
- **Amends:** the contract written in `runtime/runtime.js` — "in scene insertion order"

---

## Why this is a separate ADR

ADR-0034 needed a canonical order and defined one. The temptation was to fold the Runtime's
execution-order change into it as well. Three reasons ruled that out, and each one suffices:

1. **It changes a written contract.** `runtime/runtime.js` documented, in so many words, that
   components run "with the same fixed delta, **in scene insertion order**". Changing that in passing,
   inside a decision about references, would have been a contract change by side effect.
2. **It is not a consequence of ADR-0034.** That one is about **observation** — a node building an
   ordered list and taking the first of it. This one is about **execution** — who runs before whom. A
   canonical `Find By Tag` is deterministic whatever `step()`'s order is.
3. **The scope is not the same.** Execution order concerns **every component in the engine**,
   including those written in JavaScript that have nothing to do with visual scripting.

---

## Observed context

`runtime/runtime.js` iterated `this.#scene.objects()`, that is, the insertion order in the Scene's
`Map`.

ADR-0034 §1 measured that **this order is a function of the construction history, not of the state**:

- after a reparent, insertion order and hierarchical order diverge (`A,B,C` versus `A,C,B`);
- serialization **normalizes** insertion order into hierarchical order, so a reload changes
  `objects()` without the state having moved;
- a deletion followed by its inverse Operation leaves the state identical and the insertion order
  different.

The consequence: two machines in the same replicated state but with different histories — one started
from a snapshot, the other having replayed the operations — ran their components in a different
order.

That fact was **unobservable from a `.px`** while a graph could neither read nor write outside its own
Component. ADR-0034 §3.3 makes it reachable without writing a line of code, through
`property.setOn`.

---

## Measured impact on what exists

| Item | Finding |
|---|---|
| Shipped components with an `update()` | **exactly one**: `ParticleSystem`. `Transform`, `Sprite`, `RectangleRenderer`, `Tilemap` and `Camera` have none |
| Does that `update()` read other objects? | No: it advances its own particles |
| Tests asserting an inter-object order | **exactly one**, in `runtime/runtime.test.js`: two roots created in order, so insertion and hierarchy coincide. It passed without adaptation |

The practical risk was therefore low. The contract change, however, is real: that is what this ADR
exists to make deliberate rather than incidental.

---

## Decision

### 1. `Runtime.step()` walks the canonical order

**SETTLED.** `Runtime.step()` iterates `hierarchyOrder(scene)` — the function ADR-0034 §3.1 lifted out
of `serialize.js` — and no longer `scene.objects()`. There is **no** second implementation of the
hierarchical order: the writer, the Scene's lookups and the Runtime all read the same one.

**A parent runs before its children**, which is also what a hierarchy of transforms means.

Execution order becomes a function of the **replicated state**: it depends only on `roots` and
`children`, two ordered lists maintained by `REPARENT` alone, both replicated and both serialized.
Insertion order is none of those things.

Nothing else in the simulation step moves: the delta stays fixed, the order of Components inside an
Object stays ADR-0018's, and ADR-0012's error isolation is unchanged.

### 2. The written contract says the real order, and why it is that one

**SETTLED.** The phrase "in scene insertion order" is replaced in `runtime/runtime.js` by the
canonical order and its reason: insertion order is a fact about how a scene was **built**, not about
what it **is**.

### 3. At equal `layer`, drawing follows the same canonical order

**SETTLED.** `runtime/rendering/scene-renderer.js` now starts from `hierarchyOrder(scene)` and then
sorts by `layer`. Since `Array.prototype.sort` is stable:

1. **`layer` decides** — the existing behaviour of layers is intact;
2. **at equal `layer`, the canonical order breaks the tie.**

Before, the tiebreak came from `scene.objects()`, and therefore from insertion order: "what covers
what" was a fact about a scene's history, and the same scene saved and reloaded could draw a pair the
other way round. It was the same defect as in §1, on a different consumer.

**The Runtime and the renderer therefore start from the same canonical order.** There is one, not
two: leaving drawing on insertion order would have been keeping two orders for one idea.

### 4. `Scene.objects()` does not change

**SETTLED.** It stays the storage and the insertion order, and its public API is unchanged. Making it
canonical would have been a rewrite — the storage, serialization, the renderer, the Editor and the
whole test suite depend on it — and ADR-0034 §1 had already ruled that path out.

### 5. The reachability invariant was violable, and the cause is fixed at its source

**SETTLED.** The risk this document flagged in S6 was not theoretical: it was reachable through the
public API, and **it already broke serialization**.

`Scene.add()` only put an object in the roots `if (!object.parent)`, without checking that the parent
belonged to **this** Scene. An object added while its parent is elsewhere was therefore neither a
root, nor the child of anything the scene could reach. Measured:

```
elsewhere.addChild(orphan);   // `elsewhere` never joined the scene
scene.add(orphan);

scene.size          → 1
scene.objects()     → ['Orphan']
scene.roots()       → []
hierarchyOrder()    → []          ← invisible to the canonical traversal
serializeScene()    → []          ← and already lost on save
```

The scene held it, `objects()` listed it, and nothing else saw it. As long as the Runtime iterated
`objects()`, it ran anyway; adopting the canonical traversal, it would have **stopped being
simulated**.

**The fix is in `Scene.add()`, at the source:** a root is an object with no parent **in this Scene**.
It is the missing half of a condition, not a fallback.

> **It is not a fallback in `Runtime.step()`,** and that is the part worth defending. A fallback —
> "then the unreachable objects, in the order they are found" — would have made the simulation correct
> by hiding the defect in adding that produced it, and would have reintroduced a share of insertion
> order into the canonical order. ADR-0034 §3.1 already wrote it: no fallback is added for an
> unreachable object.

The ordinary case is untouched: attaching a child to a parent that **is** in the scene, then adding
it, still gives a child and not a root.

The fix benefits `serializeScene()` as much as the Runtime, since both read the same traversal: such
an object is now written into the saved scene instead of silently disappearing from it.

---

## Observable contracts

| Contract | Verifiable by |
|---|---|
| A parent runs before its children | the child may have joined the scene first |
| The `update` order does not depend on history | a serialization round trip, then a deletion followed by its inverse |
| Two construction paths, one order | replayed operations versus a snapshot |
| `layer` wins, the canonical order breaks the tie | two objects at the same `layer`, two objects at different `layer`s |
| Every object of the scene is simulated, and written | an object added while its parent is elsewhere |
| `Scene.objects()` stays insertion order | a direct assert, beside every execution-order assertion |

---

## Tests

Written in `runtime/runtime.test.js` and `runtime/rendering/rendering.test.js`.

| # | Test | Protects |
|---|---|---|
| S1 | The `update` order is identical before and after a serialization round trip | the order is a function of the state |
| S2 | The `update` order is identical before and after a deletion followed by its inverse Operation, through the real pipeline | the same, on the undo path |
| S3 | A parent runs before its children, even if the child joined the scene first | §1's semantic consequence |
| S4 | The existing order test in `runtime/runtime.test.js` keeps passing | no regression of the visible contract |
| S5 | Two `Runtime`s built by two different paths — replayed operations versus a snapshot — produce the same trace while storing differently | **the criterion that justifies the ADR** |
| S6 | Every object of a Scene is reachable from its roots, and therefore simulated and written | §5 |
| S7 | Two objects at the same `layer` are drawn in canonical order | §3 |
| S8 | `layer` still wins over the shape of the tree | §3, the other way round |

Seven of those eight tests fail against the previous implementation, which is the only proof worth
having that they guard something. The eighth — S8 — already passed: it guards against a future
regression where the tiebreak would override the `layer` sort.

---

## Consequences

### Positive

- The engine's execution order stops being a property of a scene's history.
- The Runtime and the renderer read **one** order, defined **once**, shared with the writer.
- A parent runs before its children, which is what a hierarchy of transforms says.
- An object the scene held without being able to reach it ceases to exist: it is simulated and it is
  saved.
- ADR-0034 §3.3's cross-object write now carries its multiplayer guarantee.

### Negative

- The traversal allocates on every step and every frame, where `objects()` returned a copy of the
  storage. The repository already accepts that cost rather than a cache, for the reason
  `scene-renderer.js` states: a cache invalidated on every write is a speculative optimization and one
  more piece of state to keep right.
- A written contract changes. No shipped component depended on it — only one has an `update()`, and it
  is self-contained — but hand-written code relying on insertion order would now run in a different
  order.
- `Scene.add()` gains a condition. It changes only the case that was already broken.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| Changing nothing | Tenable while no node writes to a neighbour; untenable as soon as `property.setOn` exists |
| Making `Scene.objects()` canonical | Ruled out by ADR-0034 §1: a rewrite of the storage and all of its readers |
| Having the Scene maintain the canonical order incrementally | A cache, and therefore a second source of truth to invalidate on every `REPARENT` |
| Sorting by `id` | Deterministic, but execution order would stop having a meaning a creator can read |
| Leaving drawing on insertion order | Two orders for one idea, and "what covers what" would stay a fact about history |
| A fallback in `Runtime.step()` for unreachable objects | It would hide the defect in adding that produces them, and would put insertion order back into the canonical order |
