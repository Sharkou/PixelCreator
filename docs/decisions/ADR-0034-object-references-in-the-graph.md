# ADR-0034 — A graph reaches other Objects through a handle, never through a scene identity

- **Status:** **accepted** (2026-08-21)
- **Amended by:** ADR-0039 (2026-08-27) — §7 (a designated target becomes a parameter again), §3.7 (dropping a Resource is allowed)
- **Clarified by:** ADR-0056 (2026-09-07) — invariant 3: a handle may live for the duration of a **flow**, and not only of a flow step, provided it is asked of the Scene again on every read; invariant 5: `Spawn` and `Destroy` change the Scene's shape through its own primitives, producing no Operation and minting no identity
- **Amended by:** ADR-0040 (2026-08-28) — §3.3: `Get`/`Set Property On` merge with `Get`/`Set Property`; §3.2: the "empty Object socket" warning applies only to a port no parameter can fill, and dropping a **Component** into a graph is withdrawn
- **Decides:** what a `.px` graph can reach outside its own Component
- **Depends on:** ADR-0010 (identity by ID), ADR-0015 (a graph is a type's behaviour), ADR-0018 (structural order), ADR-0021 (Component identity), ADR-0023 (`PropertyType`), ADR-0026 (`.px` = one resource, drag and drop), ADR-0027 (the graph model), ADR-0030 (references), ADR-0031 (authored values), ADR-0033 (rows and gestures)
- **Amends:** ADR-0023 §2, ADR-0027 §2 and §11, ADR-0031 §1
- **Closes:** ADR-0033's open point ("references to an Object or a Component in the graph")
- **Does not decide:** the execution order of `Runtime.step()` — see ADR-0035

---

## 1. Problem

A `.px` can only read and write **its own** Component. A creator therefore cannot write "the door
opens when the player touches it" without dropping into JavaScript.

Two facts measured in the repository frame the solution, and neither of them was written down.

**The interpreter already holds the access.** `io` carries `self` and `ctx.scene`
(`runtime/scripting/interpreter.js:255`, `runtime/runtime.js:127`). What is missing is not access:
what is missing is a **type** able to carry an Object between two nodes.

**`Scene.objects()`'s order is a function of history, not of state.** Measured on the real Operations
pipeline: three objects tagged `enemy`, deleting the first through `deleteObject()` then applying the
inverse Operation. The state is identical — hierarchical order `A,B,C` before and after — and
`findByTag` answers `A` and then `B`. Serialization also normalizes insertion order into hierarchical
order (`core/serialize.js:110`), so a client started from a snapshot does not have the same
`objects()` as a client that replayed the operations.

---

## 2. Invariants

1. A `.px` is **project**-scoped: no scene identity enters its payload.
2. No **semantic field** of the graph format can represent or resolve a scene Object identity. An
   arbitrary string stays a string: what is forbidden is the **semantics**, carried by the node
   catalogue, never by the payload.
3. A handle is never persisted, never serialized, and never memoized beyond a flow step.
4. A persistent reference to an Object is an **instance value** — a value carried by an attached
   Component.
5. A node produces no Operation and mints no identity.
6. Every scene traversal observable by the graph uses a **canonical** order, a function of the
   replicated state and not of the construction history.
7. Every object of a Scene is reachable from its roots.

### Vocabulary

The word "instance" designated two things. It now designates **one**.

| Term | Definition | Scope | Persisted |
|---|---|---|---|
| **Component type** | what `defineComponent()` produces; identity = `componentType`, a `ResourceId` for a `.px` | project | yes, in the `.px` |
| **graph value** | `node.params` and `node.inputs` | project | yes, in the `.px` |
| **attached Component** | the copy of a type on an Object, addressed by `(ObjectId, componentType)` | scene | yes, in the scene |
| **instance value** | a value carried by an attached Component | scene | yes, in the scene |
| **handle** | a live reference to an Object or an attached Component — always the reactive Proxy | none | **never** |

> **Amends ADR-0031 §1**, which called `node.inputs` an "instance value". It is a **graph value**: it
> belongs to the type, not to an attached Component.

---

## 3. Decision

### 3.1 A Scene's canonical order is the hierarchical order

It is already the serialization contract (`core/serialize.js:130`) and it is the only order that is a
function of the **replicated state**: it depends only on `roots` and `children`, two ordered lists
maintained by `REPARENT` alone and both serialized. Measured stable across five lifecycle steps:
creation, reparent, serialization, reload, `restoreScene`, and deletion followed by its inverse.

The traversal **exists** and is not reachable: `hierarchyOrder()` is a private function of
`serialize.js`. It becomes an exported Core function, and serialization keeps using it — **one**
definition of the order, never two. That is the argument `serialize.js` already makes about the
format's passes: "the order of the passes is the format's contract, and writing it twice means two
readers that will eventually diverge".

`findByTag`, `findByName` and `findByComponent` return their results in that order.

**What does not change:** `Scene.objects()`, which stays the storage and the insertion order;
`Runtime.step()`'s execution order (ADR-0035); the draw order at equal `layer`.

Invariant 7 is guaranteed nowhere today — `Scene.add()` only puts an object in the roots if it has no
parent. It becomes a test. **No fallback** is added for an unreachable object: a fallback would hide
a defect in adding instead of revealing it.

### 3.2 An `object` port carries a handle, never an identity

A new port value type, `object`. What flows is the **reactive Proxy** the Scene holds, whose identity
is stable (`makeReactive` is idempotent, `core/properties/reactive.js:85`), which makes `===`
reliable between two handles.

| | |
|---|---|
| `typesCompatible` | `object <-> object`. Nothing else, in particular **not `string`** |
| `ANY_TYPE` | stays universal: no `any` port in the catalogue writes to anything persisted |
| **A graph value** | **inert, always.** See §3.6 |
| `accepts` | no: "this object carries a Transform" is not checkable at gesture time, and an uncheckable constraint is a lie (ADR-0030 §1) |
| An unconnected port | returns `null`, and the validator emits a **warning** — the treatment ADR-0027 already gives "no property selected" |

**There is no `component` port type,** and that is a decision: with §3.3's merged nodes, nothing would
consume such a handle. A Component is named by its **type**, a project-scoped identity, in a
parameter. The day something has to carry one, it will be additive and this ADR does not forbid it.

**Why a handle and not an identity, when a `resource` travels by identity.** A `Resource` is resolved
through asynchronous storage that neither the Core nor the Runtime reaches (ADR-0020): its identity
must therefore stay on the wire. An Object is already inside the Scene the Runtime holds — resolution
is a `Map.get`. Encoding and then decoding again would be ceremony, and it would make `Parent` unable
to talk about a detached object.

### 3.3 The nodes

Category `Scene`.

| Type | Inputs | Outputs | Behaviour |
|---|---|---|---|
| `scene.self` | — | `object` | the carrying Object; cannot be null |
| `scene.parent` | `object` | `object` | `null` on a root, `null` if the input is null |
| `scene.findByTag` | `tag: string` | `object` | the **first in canonical order**; `null` if the tag is empty |
| `object.isValid` | `object` | `boolean` | what the creator has to defend against a missing target |
| `property.getOn` | `object` | depends on the property | params `{ component, property }` |
| `property.setOn` | `flow`, `object`, `value` | `flow` | params `{ component, property }` |

`scene.findByTag` returns `null` on an empty tag, and that is not politeness: `Object.tag` is `''` by
default, so an empty tag would match **every object in the scene**.

**The foreign-property nodes are merged, not split.** A `Get Component` returning a handle, followed
by a `Get Property` consuming it, would **not know which type** of component it holds: its output
port would fall back to `ANY_TYPE` and its property picker would have nothing to offer. A node
carrying both parameters resolves its schema locally, so its port is typed exactly and the refusal
arrives at gesture time — ADR-0027 §3's gain, not a refinement.

**They introduce no second semantics.** The property is referenced by **identity**, as in
`property.get`. The write is a **plain write** on the Proxy: a `Change`, no Operation (ADR-0003,
ADR-0027 §6). `property.get` and `property.set` stay unchanged and reserved for the carrying
Component — extending them with an Object port would have meant a wire silently changing **which
object is mutated** on a node that reads "write my property".

**An unconnected `object` port returns `null`, never "Self".** ADR-0031 §1's argument — "three literal
nodes to add two constants" — does not transfer: a literal has a value that can live in the node, an
Object has none, and that is precisely invariant 2.

### 3.4 Two families of failure

The rule existed in the repository without ever having been written. It is written here:

> **What a design-time check can resolve and does not is an ERROR. What only the current scene can
> resolve and does not is not an error: the value is kept, nothing runs, nothing is thrown, and the
> fact is shown where a human can see it.**

| Case | Family | Treatment |
|---|---|---|
| A Component type unknown to the registry | design | validator ERROR, node ringed in red, `GraphError` at runtime |
| A property absent from the named schema | design | `MISSING_PROPERTY`, the graph **not rewritten** (ADR-0027 §8) |
| An unconnected `object` port | design | a warning |
| The Object no longer exists | **runtime** | `null`; a read = the declared default; a write = a no-op; **nothing is thrown** |
| The Component is not attached to that Object | **runtime** | the same |

The second family is `Sprite`'s: a broken `source` does not draw, does not throw and keeps its value
(`runtime/rendering/components/sprite.js:48`). A vanished target is a normal game state — the enemy
is dead — not an authoring mistake. Reporting it on every step would turn Legacy's silence into its
exact opposite: permanent noise.

### 3.5 A persistent reference is a Component property — amends ADR-0023 §2

A new `PropertyType`, whose value is `ObjectId | null`.

```json
// in the .px — THE TYPE, project scope
"properties": { "target": { "id": "p_9", "type": "objectref", "default": null } }

// in the scene — THE INSTANCE, scene scope
{ "type": "res_c3", "values": { "target": "obj_7f3a" } }
```

ADR-0023 §2 removed `object` because the Core had an answer to none of its three questions. It has
all of them for this one: default `null`, valid if `null` or a string, serializes as a string. The
reasoning is not reversed, it is **paid for**, exactly as ADR-0030 §1 did for `resource`. The name is
not `object`: ADR-0023 removed that word to designate *a structure with fields*, and reusing it would
make that ADR unreadable.

> **An `objectref` property is read as an Object and written with an Object. The identity is what is
> stored, and it never appears in the graph.**

**`objectref` is a PERSISTENT type and nothing else. No port is ever typed `objectref`.** A
property's declared type is translated into a port type at the moment the port is built. Verified
exhaustively: **exactly two places** in the repository build a port from a property's declared type —
`core/graph/standard.js:134` (`property.get`) and `:149` (`property.set`) — and both use the identical
expression `property?.type ?? ANY_TYPE`. `property.getOn` and `property.setOn` will make a third and
a fourth, so the translation is **a shared function** and not a repeated expression.
`typesCompatible()` is untouched, no special case exists, and `objectref` stays confined to what is
persisted.

The member is only registered in `PropertyType` once its Inspector control exists: a type with no
control is a silent dead end, and the repository has refused that twice (ADR-0023 §3, ADR-0030 §1).

**What the rest of the model has to do: nothing, and that is verified rather than assumed.**
`editor/project/reconcile.js` mentions no `PropertyType`, imports nothing from `properties/types.js`
and branches on no type; the complete cycle was run on a property of identical shape
(`string | null`) and all three cases — a rename following the identity, an addition taking its
default, a removal dropping the value — are correct. Serialization, reconstruction and
`Scene.remove()` are just as agnostic.

What has to change comes down to: the `PropertyType` member; a `case` in `isValidValue` (without it,
the `default: return true` branch would accept `42` as an Object reference); the Editor's
`KIND_BY_PROPERTY_TYPE` table and the control that goes with it. `defaultForProperty` already returns
`null` through its default branch.

### 3.6 The door the format left open, and what closes it

Measured in the **runtime's evaluation path**, not in the Editor, with a catalogue declaring a port of
type `object`:

| Case | What the node receives today |
|---|---|
| A genuinely unconnected `object` port | `null` — correct |
| `node.inputs["target"] = "obj_7f3a91c2"` | **the raw string** |
| An `object` port wired to an `object` port | the handle — correct |
| `node.inputs["target"] = 42` | **`42`** |
| `node.inputs["target"] = { id: 'obj_fake', name: 'Fake' }` | **a forged object**, indistinguishable from a handle to a duck-typed node |

And the value is **written into the `.px` payload**: `"inputs":{"target":"obj_7f3a91c2"}` — so
invariant 1 falls through the same door.

The cause is that `defaultOf()` returns the graph value **before even looking at the port**
(`runtime/scripting/interpreter.js:335`), and that `Graph.setInput()` checks no port.

> **A port of type `object` ignores any graph value and returns `null`.**

One line, in `defaultOf()` — the function ADR-0031 §1 already names as *the* one place where a port's
priority is resolved. No new guard in `setInput()`, no second path, and the Editor is not the
authority: the contract is held by the Runtime.

The forged-object case is what decides the shape of the protection: it cannot be "refuse what is not
an Object", it has to be "ignore the graph value".

**The other doors are already closed, and it must be said by what.** A `string -> object` connection
is refused at gesture time by `canConnect()` (`TYPE_MISMATCH`, measured). A mistyped connection
written by hand is reported by `validateGraph()` as an ERROR and makes `runnable()` false; the
interpreter does not block it — ADR-0027 §7's choice, general to every type and not specific to
`object` — but the string that arrives is **harmless**, because nothing can turn it into an Object.

That is what makes the absence of a `scene.resolve(string -> object)` load-bearing rather than
stylistic:

> **No node resolves a string against the Scene.** `scene.get()` is reachable only from a node's
> `evaluate` or `execute`, and therefore from the catalogue. A node that converted a string into an
> Object would single-handedly reopen every door this ADR closes.

### 3.7 Dropping onto the canvas is refused, with its reason

Object, Component, Property, Resource, Scene and `.px`: all refused, each with its sentence.
ADR-0027 §11 refused a property drop because `Get` or `Set` is a choice you do not make on the
creator's behalf; the same argument holds for the others.

For an **Object**, two more reasons, each sufficient on its own:

- falling back on the name would write a **freely editable display name** into a project-scoped type,
  which ADR-0010 forbids at the root;
- an object with no tag would require giving it one, and therefore **one gesture writing into two
  resources with two undo stacks** (ADR-0024) — the open point that both ADR-0024 and ADR-0027 flag
  as untreated.

It is not a permanent "no": it is "not until an unambiguous gesture is designed". Nothing regresses
meanwhile — there is no drop zone on the canvas today.

> **Amended by ADR-0037 (2026-08-22) — dropping an Object is allowed.** The reasoning above assumed
> the reference would be encoded as a **tag**, and therefore through a write into the Scene; the
> second reason followed entirely from that. ADR-0037 encodes the gesture differently: the drop
> declares on the `.px` an **`objectref` property** named after the Object, and a node that reads it.
> **A single resource is written**, under a single batch of its own stack — the cross-resource
> question no longer arises, and the first reason is honoured as it stands: the name names a
> property, whose link is still carried by its `id`. No scene identity enters the `.px`: invariant 1
> is kept to the letter.
>
> The refusals for Component, Property, Resource, Scene and `.px` **on bare canvas** become explicit
> gestures at the drop point (ADR-0037 §2.4) or stay refused with their sentence.
>
> **Amended by ADR-0039 (2026-08-27) — dropping a Resource is allowed.** The refusal above filed the
> `ResourceId` with the `ObjectId`, whereas invariant 1 does not speak of identities in general: it
> speaks of **scene**-scoped identities, because a `.px` serves several scenes. A `ResourceId` is
> **project**-scoped — the `.px`'s own scope (ADR-0020) — so none of that reasoning reaches it. A
> `value.resource` node carries it as a literal, and invariant 1 is intact: no scene identity enters
> anywhere.

---

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| `findByTag` / `findByName` / `findByComponent` return canonical order | saving then reloading, and deleting then undoing, give the same first result |
| An `object` port ignores any graph value | after a `setInput()` on an `object` port, the node receives `null` — checked through the interpreter |
| A write from a graph produces no Operation | a counter on the Scene's pipeline after N steps |
| A vanished target produces no error report | `onError` is not called |
| An `objectref` value survives serialization byte for byte | a `serializeScene` / `deserializeScene` round trip, deleted target included |
| The same `.px` in two Scenes carries no shared identity | comparing the two payloads |

---

## 5. Required tests

| # | Test | Protects |
|---|---|---|
| T1 | The same scene saved then reloaded, then deleted then restored: `findByTag` gives the same first result | invariant 6 |
| T2 | Every object of a Scene is reachable from its roots, whatever the path by which it was added | invariant 7 |
| T3 | No `definition.params[*].reference` in the catalogue belongs to a kind of reference resolved against a Scene | invariant 2 |
| T4 | No shipped `evaluate` / `execute` names `.id` or `createId` — an extension of the purity test in `core/graph/nodes.test.js` | invariants 2 and 5 |
| T5 | An `object` port stays `null` after `setInput()`, including with a string, a number and a forged object — **tested through the interpreter** | §3.6 |
| T6 | After N steps with the scene nodes, the Scene's pipeline has emitted no Operation | invariant 5 |
| T7 | A vanished Object: a read = the default, a write = a no-op, `onError` not called | §3.4 |
| T8 | An `objectref` value survives the serialization round trip, deleted target included | §3.5 |
| T9 | The same `.px` loaded into two Scenes carries no shared identity | invariant 1 |
| T10 | A hundred Components of the same type with different instance values share no state | invariant 3 |

---

## 6. Consequences

### Positive

- A creator can write a game where two objects talk to each other, without JavaScript.
- A scene's observable order stops being a property of its history.
- No new Operation, no inverse, no handler: the invariants are tests, not code.
- `reconcile.js` has nothing to do, and that is verified rather than assumed.

### Negative

- The canonical traversal allocates on every call. The repository already accepts that cost rather
  than a cache, for the reason `scene-renderer.js` states: a cache invalidated on every write is a
  speculative optimization and one more piece of state to keep right.
- The validator can say nothing about a dead reference, because it does not see the scene. A
  structural limit, not a gap to fill.
- An unconnected `object` port costs one more `Self` node on the canvas.

---

## 7. Rejected alternatives

| Alternative | Why not |
|---|---|
| A targeting mode as a parameter on every property node | Non-composable — "my parent's parent" is inexpressible — and the targeting vocabulary duplicated on every node. **Conditionally rehabilitated by ADR-0039 §0.1:** the objection was about a param that REPLACES the port, and therefore about a MODE. The param adopted is not one — the socket is always there, the picker is next to it, and a connection simply wins by existing. "My parent's parent" therefore stays expressible exactly as before, and the wire disappears from the one case that has nothing to compute: a target the creator can designate |
| A `component` port type | Nothing would consume it; additive later without breaking anything |
| `Get Component` then `Get Property`, split | The second node does not know which type of component it holds: no typing, no picker |
| Inferring a port's type through the connections | Ports would become a function of the graph's topology and not of the node alone |
| Extending `property.get` / `property.set` with an Object port | A wire would silently change which object is mutated |
| An ObjectId on the wire, resolved by a `scene.resolve` node | It would become reachable from a `Text` node, and would reopen every door in §3.6 |
| An unconnected `object` port meaning Self | The implicit magic the rest of this ADR forbids |
| Throwing when a target has vanished | It contradicts `Sprite` and `MissingComponent`, and turns a normal game state into a per-frame error |
| Ordering `findByTag` by `id` | Deterministic and inexplicable: the creator cannot predict the result |
| A fallback for objects unreachable from the roots | It would hide a defect in adding instead of revealing it |
| Making `Scene.objects()` canonical | A rewrite: the storage, the renderer, the Editor and their tests depend on it |
| Keeping `objectref` as a port type | `typesCompatible('objectref','object')` would be false: a `Self` node could not feed a `Set Property On` |

---

## 8. What this ADR does not decide

| Open point | Why |
|---|---|
| **`Runtime.step()`'s execution order** | An independent engine decision: **ADR-0035** |
| A `component` port type | Additive the day something consumes one |
| `Find All By Tag`, an array of Objects | No loop node exists, and an array of handles is not persistable |
| ~~An Object drop pre-filling a node~~ | **Decided by ADR-0037**: the drop declares an `objectref` property, writes one resource only, and therefore no longer waits on ADR-0024 |
| The draw order at equal `layer` | Same cause as §3.1, another consumer: ADR-0035 |
| The "first step" divergence of a client joining | Pre-existing, accepted by ADR-0029 §3 |
| The prefab | Still deferred (ADR-0026 §7); §3.7's refusals do not prejudge it |
