# ADR-0056 — A copy is the model, and a simulation step decides when

- **Status:** **accepted** (2026-09-07), **§6 completed on 2026-09-07** — the limit recorded there is closed: a reference internal to the copied subtree follows the copy
- **Decides:** what `Spawn` instantiates; what a node may do to a Scene's shape; how a flow node returns a value; what a `Runtime.step()` does with an Object created or destroyed while it runs
- **Depends on:** ADR-0003 (Property System), ADR-0011 (the server is the authority), ADR-0012 (error isolation), ADR-0015 (a graph is a type's behaviour), ADR-0018 (structural order), ADR-0019 (structural operations), ADR-0020 (Resources), ADR-0026 §7 (the prefab is deferred), ADR-0027 (the graph model), ADR-0034 (references in the graph), ADR-0035 (`Runtime.step()`'s order), ADR-0040 §3 (a designated target), ADR-0045 §11 (what is not written, and what is missing for it to be)
- **Clarifies:** ADR-0034's invariant 3 — a handle may live for the duration of **one flow** and not only of a flow step, provided it is asked of the Scene again on every read
- **Closes:** ADR-0043 §8's and ADR-0045 §11.5's open point for `Destroy` and `Spawn`
- **Completed by:** ADR-0057 (2026-09-11) — §8's determinism of identities is settled: a `Spawn` mints its identities on the Runtime's `seed:ids` stream, never on the machine's CSPRNG
- **Completed by:** ADR-0058 (2026-09-11) — a suspended execution carries away what it had produced, so §4.1 holds across a wait too
- **Does not decide:** the prefab (ADR-0026 §7 stands as it is); the determinism of identities under replication — see §7

---

## 1. Problem

A creator cannot write a game loop. A shot does not appear, an enemy does not die, a coin picked up
stays there. `.px` can read, write, branch, count and move; it cannot **make** or **unmake** an
Object.

The two missing nodes have been listed for three slices, and each time for the same reason —
ADR-0045 §11.5 writes it in black and white:

| Node | What was missing |
|---|---|
| `Destroy` | **a decision.** Removing an object while the pipeline is iterating it; and is it an authoring `Operation` or a simulation output? |
| `Spawn` | **a concept.** There is no prefab. Instantiate what, from what? |

And ADR-0043 §8 adds the constraint that held both: "ADR-0034's invariant 5 has to be settled first".

---

## 2. `Spawn` instantiates an Object of the Scene, and that is the whole decision

**There is no prefab, and there cannot be one inside a simulation step.** A `Resource` is resolved
through **asynchronous** storage that neither the Core nor the Runtime reaches — that is exactly
ADR-0034 §3.2's argument, written to justify an Object travelling by handle and a Resource by
identity. A node that instantiated a `ResourceId` would therefore have to wait in the middle of a
`step()`, which a fixed step does not allow and which an authoritative server cannot afford
(ADR-0011).

**A live Object, on the other hand, already describes an instance completely**: its Components, their
values, its children, their order. It is in the Scene the Runtime holds, and resolving it is a
`Map.get`.

> **A `Spawn`'s model is an Object of the Scene, and what is created is a copy of it.**

The vocabulary stays the creator's: *place the model object in the scene, point the node at it, and
the graph makes copies of it*. It is what a Legacy creator already did with an object kept off-screen,
except that there it was a convention and here it is the model.

### 2.1 What this avoids

| Refused | Why |
|---|---|
| A minimal prefab format | A format invented before the decision, which ADR-0026 §7 explicitly deferred and which ADR-0026 §11 files among "decisions a hasty implementation takes in the architect's place" |
| Instantiating a `ResourceId` (`.px`, a scene) | Asynchronous resolution, unreachable from `step()` (ADR-0020, ADR-0034 §3.2) |
| An "empty Object + Components" built out of nodes | Three nodes and an ordering to say one sentence, and a second way of describing what an Object is |

### 2.2 The primitive is an existing one, read from both ends

`core/duplicate.js` does a **round trip through the format**: `serializeObject()` knows exactly which
fields make an Object, `restoreSubtree()` knows exactly how to put it back — links and ranks included,
since that is what undoing a deletion applies (`ADD_OBJECT`). A hand-written traversal would be a
**second opinion** on what an Object is, and it would diverge at the first added field. Legacy had that
second opinion: it was called `copy()` and it wiped `components`, `childs` and `image`.

The identities are **drawn first, for the whole subtree**, then the `children` lists **and the values
declared as references** (§6) are rewritten through the same table: remapping as you walk would leave a
parent pointing at an identity not yet drawn.

**The copy lands beside its model, last among its siblings.** Beside, because `Transform` is a position
in the **parent's** space (ADR-0002): a copy sent to the root would keep its numbers and change what
they mean. Last, because it is the only rank that is a function of the state.

### 2.3 `Destroy` removes what `Scene.remove()` removes

No new semantics: `Scene.remove()` deletes depth-first, detaches from the parent, removes from the
roots. A child is never left in the scene pointing at a parent that has gone. An absent target returns
`false`, and `false` is not an error.

---

## 3. Invariant 5 holds: no node produces an Operation

ADR-0034's invariant 5 says *"a node produces no Operation and mints no identity"*. Both halves hold,
and for two different reasons:

**No Operation.** `duplicateObject()` and `Scene.remove()` write through the Scene's primitives,
exactly as a `parent.addChild(child)` called from a script does. They are the primitives the Operation
handlers call themselves, and `scene.js` already says why: "Applying a replicated operation therefore
submits nothing back — the echo is unrepresentable rather than merely prevented" (ADR-0019). A spawn is
a **simulation output**, not an authoring intent — the reading ADR-0003 already gives a property write
from a graph.

**No identity minted.** The node receives a **handle**, through a wire or through an `objectref` socket
this `.px` declares. Nothing from a scene enters the payload, and invariant 1 is untouched: what the
`.px` stores is the `id` of a **property it declares itself**.

### 3.1 One word separates `Spawn` from all the others: `unset`

Every targeted node in the catalogue declares `unset: 'Self'` — the picker prints `Self`, and an empty
box is a creator saying *this* Object (ADR-0040 §3). **`Spawn` declares none**, exactly like
`Get Object` (ADR-0043 §7): a copy node with no model must copy **nothing**. A fallback to `Self` would
duplicate its own Object on every step, for a creator who simply had not chosen yet.

That word is read in three places and written in one:

| Reader | What it does with it |
|---|---|
| `inspector/node.js` | shows the `Self` row only where it exists |
| `graph/standard.js` | `targetObject(io, fallback)` — the fallback is a parameter, not a second copy of the rule |
| `graph/validate.js` | an empty socket **is** a gap where nothing answers for it |

---

## 4. A flow node may return a value

`Spawn` is the first shipped node that **acts** and **produces**. Until now the separation was clean:
`evaluate` for what is pulled, `execute` for what is pushed.

**Pulling it would be the trap.** A data output is *pull*: the interpreter calls `evaluate` every time
somebody downstream reads the port. A `Spawn` read twice would create two Objects and give the second
to the second reader; a `Spawn` never read would create nothing.

> **A flow node may answer `{ next, values }`. The values are pushed once, at the moment the node
> runs, and read afterwards.**

`continuationsOf()` gains a fourth shape and `execute` stays what it was for every other node. The
interpreter never re-runs a node to answer a read: a node with no `evaluate` answers from what it
produced, or `null`.

### 4.1 What this clarifies in ADR-0034's invariant 3

The invariant says: *"a handle is never persisted, never serialized, and never memoized beyond a flow
step"*. The interpreter's value cache is **per flow step** — deliberately: memoizing further would let
a `Get Property` serve the value from before a `Set Property`.

But `Spawn` creates the Object and the node three cards later positions it: the handle has to survive
from one flow step to the next, or the output is useless.

> **The memory of produced values is carried by the FLOW, and every read of an `object` port is asked
> of the Scene again.**

What the invariant protects is kept to the letter: a handle is never returned if the Scene no longer
answers for it. A `Spawn` destroyed three nodes later reads `null`, like a dead `objectref`
(`portValueOf`, ADR-0034 §3.4) — so nothing can come out of a memory that outlives what it remembers.
The memory dies with the flow, touches no Component, no payload, no frame.

### 4.2 `Spawn` has no position port, and that is a reasoned refusal

The "X and Y on the node" form was written and then withdrawn, for two reasons:

1. **It would be `Set Position` a second time.** ADR-0045 §11.2 settles it: the absolute form is
   `Set Position`, it exists, it reads correctly. Spawning and then positioning in the same step is
   indistinguishable from spawning at a position — nothing is drawn in between.
2. **A port's default is a VALUE.** `data('x', NUMBER, 'X', 0)`: a `Spawn` placed and left alone would
   read `X 0  Y 0` and teleport every copy to the origin instead of leaving it where its model stands.
   Avoiding that would require an *optional* number port, a notion the port model does not have and a
   node has no business inventing.

The `Spawned` output says the same sentence with nodes that already exist and that read.

---

## 5. What a simulation step does with a change of shape

A `step()`'s order is materialized **before** the loop — it has to be, otherwise removing an object
would shift the walk under itself. Both directions are therefore decided rather than left to chance:

| During a `step()` | Decision | Why |
|---|---|---|
| An Object is **created** | it does not run this step; it runs on the next, `On Start` included | it is not in the materialized order; and it is what stops a graph that spawns on every update from spawning endlessly within one frame |
| An Object is **destroyed** | it is **skipped**, its remaining Components included | it is still in the list; simulating it would be simulating an Object the Scene no longer holds |

The question is asked **before each Component** and not only at the top of an object, because the two
cases are the same question: *is this Object still in the scene?* A Component that destroys its own
Object is therefore the last thing that runs on it.

### 5.1 `Is Valid` asks the Scene

"Is there a handle here" and "is this Object still in the scene" were the **same question** as long as
only the Editor could remove an object, between two frames. `Destroy` separates them: the flow that
destroys still holds the handle. `object.isValid` therefore asks the Scene — and with no Scene in
hand, a handle still reads as valid, which is the honest answer rather than an assumption of absence.

---

## 6. A reference follows the copy when its target was copied, and not otherwise

Everything is copied: every Component, every value. What §6 had left open is **what** a copied
`objectref` points at, and the question has two answers because there are two cases.

> **An identity is rewritten exactly when it appears in the identity table this duplication drew.**

| The value of a copy's `objectref` property | Becomes |
|---|---|
| an identity **from the copied subtree** | the corresponding copy's identity |
| an **external** identity | unchanged — the target was not copied |
| `null`, or the property absent | unchanged |
| an identity that no longer designates anything | unchanged: a dead reference is a state of the scene and not a thing to repair (ADR-0034 §3.4) — and here it is indistinguishable from an external reference, which is the honest reading: the table knows what was copied, never what exists |

Without that rule, duplicating a turret whose gun names its own base gave a gun naming the **first**
turret's base: two turrets for one base, and the second silently wired to the first.

### 6.1 The rule is applied to the SCHEMA, never to the value

What is rewritten is a property whose **declared** type is `objectref`, or a list whose declared
element type is. Nothing else is looked at. Scanning values for strings that look like an identifier
would rewrite the name of a level called `abcdefghjkmnpq` — and ADR-0023 already says that the type is
what a value **means**.

The reader is `declaredProperties()`, the one the graph, the property picker and the Inspector already
use. It answers for a hand-written class (`static schema`) and for a `.px` (its definition's
`properties`) **through the same call** — which is why a `.px` needs no special case, and why no new
metadata is created.

### 6.2 The genuinely declarable shapes, and there are exactly two

| Shape | Declarable? | Handled |
|---|---|---|
| `objectref` | yes | yes |
| an `array` whose `elementOf()` returns `objectref` (`of: 'objectref'` or `element: { type }`) | yes | yes, element by element |
| an `array` of `array` | **no** — `elementOf()` refuses an element that is itself a list (ADR-0031 §3) | moot |
| `enum` | no — its values are a fixed set of options, not identities | moot |
| a structure with fields | **does not exist** — ADR-0023 §2 removed `object` | moot |

There is therefore nothing below `array<objectref>` to descend into, and the recursion stops of its own
accord on the existing contract. **No speculative generalization is added**: the day the Property
System admits one more composite shape, `remapReference()` is the only place to extend.

### 6.3 Three passes, never a correction after the fact

1. **allocate** every new identity of the subtree;
2. **rewrite the payload** — `id`, `parent`, `children`, then the values declared as references;
3. **restore** through `restoreSubtree()`.

The table is complete **before** a single field is rewritten, so the rewrite depends on no ordering:
parent → child, child → parent, sibling → sibling, descendant → ancestor and a cycle between two
Components are the same lookup in a table that is already made. No pass can reach a reference before
its target has an identity, since no identity is drawn during the pass.

And it is rewritten in the **payload**, never on live Objects: what is restored is already right, so
what is serialized is too, with no second pass to keep in step.

### 6.4 The limit that remains, and it is declared

A Component of a type the registry does not resolve — a `MissingComponent` — **declares nothing**, so
its values are carried as they are, internal identities included. That is the answer this placeholder
gives everywhere else: it keeps every byte precisely because nothing knows how to interpret it
(ADR-0021). Guessing which of its values are identities would be exactly the heuristic §6.1 refuses.

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| A copy is a new Object, subtree included | `core/duplicate.test.js` |
| A copy carries its model's values and shares no state | the same |
| A reference internal to the subtree follows the copy — parent→child, child→parent, sibling→sibling, a cycle | the same |
| An external, `null` or dead reference is left as it is | the same |
| An `array<objectref>` is remapped element by element | the same |
| A property declared `string` is never remapped, even if its value looks like an identifier | the same |
| A `.px` declaring `objectref` is handled like a class that declares one | the same |
| Two copies of a model each point only inside their own subtree | the same |
| The model serializes to the same bytes before and after being copied | the same |
| The remapped references survive serialization and reload | the same |
| What a `Spawn` creates is internally coherent, and its output names that copy | `runtime/spawn-destroy.test.js` |
| A copy lands with its model's parent, last | the same |
| A copy is reachable from the roots (invariant 7) | the same |
| Copying produces no Operation | the same |
| `Spawn` with no model copies nothing, and above all not `Self` | `runtime/spawn-destroy.test.js` |
| The produced Object leaves the node and the next node acts on it | the same |
| Two readers of a `Spawn` get one copy, not two | the same |
| Reading a `Spawn` that has not run yet gives `null` | the same |
| A destroyed Object no longer runs in the step that destroyed it | the same |
| A created Object does not run in the step that created it | the same |
| Nothing is rewritten in the graph's payload | the same |
| An empty `Model` socket is a warning, `Destroy`'s `Object` socket is not | `core/graph/validate.test.js` |
| `Spawn`/`Destroy` are on the `Object` shelf, with no new hue or glyph | `core/graph/nodes.test.js` |

---

## 8. What this ADR does not decide

| Open point | Why |
|---|---|
| **The prefab** | ADR-0026 §7 stands as it is. This ADR does not prejudge it: the day a prefab exists, it will be a second possible **model**, not a second creation mechanism |
| ~~The determinism of identities under replication~~ | **Settled by ADR-0057**: an identity created by a step is drawn from the `seed:ids` stream, an identity created while editing stays drawn from the machine |
| **The values of a type the registry does not resolve** | §6.4 — a `MissingComponent` declares nothing, so nothing is remapped inside it |
| `Random`, `Delay` | Unchanged (ADR-0045 §11.5) |
| **A population limit** | A graph that spawns on every update fills the scene; the interpreter's budget bounds an EVENT, not a match. That is a product question, not an execution one |
