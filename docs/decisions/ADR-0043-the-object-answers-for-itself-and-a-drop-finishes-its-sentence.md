# ADR-0043 — The Object answers for itself, a drop finishes its sentence, and one intention is worth one node

- **Status:** **accepted** (2026-08-29)
- **Completed by:** ADR-0056 (2026-09-07) — §8's open `Destroy` / `Spawn` point is settled: they are structural changes written by the Scene's primitives, so invariant 5 holds with no Operation
- **Decides:** how a graph reaches the Object's own properties; where the `ObjectId` goes when a drop
  names an Object; what justifies a utility node; what stays refused
- **Depends on:** ADR-0001 (Object stays Object), ADR-0002 (Transform is a Component), ADR-0007
  (schema-driven Inspector), ADR-0023 (`PropertyType`), ADR-0024 (undo per resource), ADR-0026 (drag
  and drop), ADR-0027 (the graph model), ADR-0034 (Object references), ADR-0037 (a drop declares),
  ADR-0039 (the scope of an identity), ADR-0040 (one node per intention), ADR-0041 (moments, states,
  property paths)
- **Amends:** ADR-0037 §2.4 (an Object drop no longer writes *only* into the `.px`); ADR-0007 (the
  Inspector's Object fields are derived, not rewritten)
- **Does not decide:** a `component` or `property` port, still refused (§5); dropping a Component
  into a graph, still refused (§6); a refusal sentence for the Inspector's Component list (§7)

---

## 1. The defect: the four properties a beginner sees first were the four a graph could not touch

The Inspector opens on `Name`, `Tag`, `Layer`, `Active`. They are literally the first lines a creator
meets. None was reachable from a graph.

The cause is not an oversight, it is a consequence: the property picker is fed by the **Component
registry** (`componentCatalogue()`), and those four belong to no Component — they belong to the
Object (ADR-0001). Nothing declares them, so nothing offers them.

Measured: `objectFields()` wrote them **by hand** in the Editor, and the Core said nothing about them.
Two readers, one written list, the other nonexistent.

> "Turn this enemy off", "rename this object", "change its draw layer": three ordinary sentences,
> unwritable.

---

## 2. Decision: `Object` is a property NAMESPACE, never a Component

> **`component: 'Object'` in a `.px` resolves to the Object itself. It is not a type, it is in no
> registry, and `getComponent('Object')` will never answer.**

| | |
|---|---|
| **The problem** | The only path to a property went through a Component. The Object's four properties have none. |
| **The decision** | The Core declares `OBJECT_COMPONENT = 'Object'` and `objectProperties()` — `name`, `tag`, `layer`, `active`, in the exact shape `declaredProperties()` returns. The picker opens on that group; the interpreter, on seeing it, returns **the Object** instead of one of its components. |
| **UX rationale** | The creator reads `Object ▸ Name` beside `Transform ▸ X`, in one grouped list. They learn nothing new: it is ADR-0041 §2's shape, applied to what was already in front of them. |
| **Core impact** | One declaration (`core/object.js`), two branches (`targetComponent()`, `catalogueOf()` in `graph/standard.js`). No new type, no new `PropertyType`, no new port. |
| **Runtime impact** | No new mechanism: the Object is already the reactive Proxy the Scene holds, so `object.name = …` from a graph is the same `Change` as from the Inspector (ADR-0003, ADR-0015 §5). |
| **Serialization** | `component: 'Object'` is a **fixed engine word**, project-scoped exactly like `'Transform'`. No scene identity enters anywhere: ADR-0034's invariant 1 is intact. |
| **Migration** | None. No existing graph names `Object`. |

### 2.1 Why not a real Component

A registered `ObjectProperties` would have given the same picker — and would have lied three times: it
would have appeared in **Add Component**, it could have been **removed** from an Object, and you would
have had to add it to the fifty objects of an existing scene for their graphs to work. An Object *has*
a name; it does not get given one.

### 2.2 What protects the word

The sentinel is a word, so something could take it. Three facts make it safe, and the third is a
test:

- no shipped class is called `Object`;
- a `.px` is identified by its `ResourceId` and cannot claim a name;
- `builtins.test.js` fails the day a registered type is called `Object`.

### 2.3 `lock` and `owner` are absent, deliberately

`lock` is an editing convenience the Hierarchy owns and the simulation never reads; `owner` names a
player and belongs to the multiplayer vocabulary, which has no creator-facing story yet. Neither is a
property of the **game**.

### 2.4 One declaration, two readers

`objectFields()` (Inspector) now **derives** from `objectProperties()`. The labels and tooltips stay in
the Editor — that is presentation — but the list and the types come from the Core. Written twice, it
would have diverged at the fifth field, and a creator would have met a property on one side and not
the other.

---

## 3. Decision: a drop that NAMES an Object writes its identity into the SCENE

> **The `.px` receives a socket name. The scene receives the `ObjectId`. One gesture does both.**

| | |
|---|---|
| **The old decision** | ADR-0037 §2.4: dropping an Object on a graph declares an `objectref` property named after it, and a node that reads it — and **stops there**, "a single resource is written". |
| **The problem, measured** | The gesture produced a node that *looked* finished and did **nothing**. The socket was `null` on every instance, so a `Set Property` pointed at it wrote nowhere, silently (ADR-0034 §3.4 — and that is correct). You then had to select each carrying Object and set the value in the Inspector: three steps nothing announces. It is the most common way this feature failed. |
| **The new decision** | The gesture also writes the instance value: for every Object of the **open scene** carrying that Component, the socket is pointed at the named `ObjectId` — **only where nothing has been answered yet**. |
| **UX rationale** | "Drag Player onto your graph" has to produce a graph that **runs**. ADR-0037's model stays teachable — a `.px` declares an input, each Object says what to plug into it — but a default is observed, not hunted for. |
| **Core impact** | None. The command lives in the Editor (`editor/commands.js:pointSocketAt`). |
| **Runtime impact** | None. |
| **Serialization** | None on the `.px` side. On the scene side, it is an ordinary `objectref` value, the one ADR-0034 §3.5 defined. |
| **Migration** | None. The `.px`s already written keep their sockets; they fill in on the next drop. |

### 3.1 Only where nothing has been answered

A creator who pointed door #3 at a different Player keeps it. **A gesture that names a default must
not undo a decision.** The rule is therefore "fill the blanks", never "overwrite".

### 3.2 Two resources, two undos — and it is said

The gesture writes into the `.px` and into the Scene. ADR-0024 gives each resource its own stack, so
`Ctrl Z` on the canvas removes the socket and the node, and the values the scene gained undo on the
scene's stack.

That is exactly the shape ADR-0041 §6.2 already settled for a file drop, and the less surprising of
the two splits: a scene keeps pointing at the Object a creator designated even if they change their
mind about the node.

**ADR-0037 §2.4 is amended on that point, and on that point only.** Its sentence "a single resource is
written" served to set aside the cross-resource undo question; that question has since been answered
(ADR-0041 §6.2), so the premise stopped being necessary. The invariant it protected — no scene
identity in a `.px` — is untouched.

### 3.3 The writes are AUTHORIZED, not silent

`setProperty()`, like every value the Editor writes: an Operation, replicated, undoable
(CONVENTIONS.md). A plain write would have reached the value without ever reaching the history.

---

## 4. Decision: `Translate` — an intention deserves a node, a mechanic does not

> **`Translate` moves an Object relative to its position. It is not `Set Position`, and both stay.**

| | |
|---|---|
| **The problem, counted** | Moving one step along X cost `Get Property ▸ x` + `Add` + `Set Property ▸ x`: three nodes, two wires, two trips through the picker. On both axes, **six nodes**. None of the three speaks about moving; they speak about how a move is computed. |
| **The decision** | A `transform.translate` node, category `Properties`, with `Object` (a socket + picker, like Get/Set Property), `X`, `Y`, and a flow in/out. |
| **UX rationale** | "Move" is an intention; `Get`, `Add`, `Set` are its mechanics (ADR-0040). The criterion is not "how many nodes are saved" but "is this a sentence the creator thinks". |
| **Why not a seventh category** | A category answers "what this node IS" (ADR-0039 §2) and gives it a hue. `Translate` changes what an Object holds — that is the `Properties` family, the same as the `Get`+`Add`+`Set` it abbreviates. |
| **Why X and Y and not a Vector2** | The Core has no vector type, and ADR-0023 §2 removed the idea deliberately. `x` and `y` are two numbers everywhere else — in Transform, in the Inspector's paired row, in `Pointer`. Inventing a type for one node would be the abstraction this catalogue exists without. |
| **Local space** | `Transform.x` is a position in the parent's space (ADR-0002), so `Translate` adds into it. A world-space move would need the inverse of the parent's matrix and would quietly contradict the number the Inspector shows for the same Object. |
| **An Object with no Transform** | Nothing happens, nothing is thrown, the flow continues — ADR-0034 §3.4's failure family. |

### 4.1 What was NOT added, and why

`Set Position`, `Rotate`, `Scale`, `Clamp`, `Destroy`, `Spawn`, `Random` and `Delay` stay absent.
`Translate` was admitted because it abbreviates a sentence **measured** at six nodes; the others await
the same measurement. In particular: `Destroy` and `Spawn` are **structural** changes to the Scene, and
ADR-0034's invariant 5 says a node produces no Operation — that is a decision to take, not a line to
write. `Random` and `Delay` collide with determinism (ADR-0011) and with the absence of per-instance
execution state.

---

## 5. Refused: a Component or a property supplied by a wire

The question was asked again seriously, with the code in front of us.

**It is not cleanly feasible, and the reason is typing, not conservatism.**

`Get Property`'s output port is typed by `resolvedProperty(node, context)`, resolved **locally**, from
the node's own params. That is what makes three things possible:

| What local typing gives | What it becomes if the Component arrives by a wire |
|---|---|
| The output port has the property's exact type | it falls back to `ANY_TYPE` |
| The picker offers the named type's properties | it has nothing to offer |
| A bad wire is refused **at gesture time** (`canConnect`) | it can only be refused at run time |
| `shapeDependsOnNode()` knows when to redraw | the shape would depend on the graph's topology |

That is exactly the `Get Component → Get Property` split ADR-0034 §3.3 ruled out by argument, and which
ADR-0039 §4 confirmed by refusing the `component` and `property` port types.

**Decision: unchanged.** What a creator actually wants — "read that property of that Component, on an
Object that may be dynamic" — is already entirely expressible: the **property** is the intention and it
is known at writing time; the **Object** is what varies, and it already varies (a socket, a picker, or
`Self`). A half-solution is not built.

---

## 6. Refused, for the third time: a Component dropped into a graph

| Gesture | What the creator wants | What is produced | Durable? |
|---|---|---|---|
| **Object → graph** | "work on this Object" | a named input, a node that reads it, and the scene pointed at it (§3) | yes |
| **Property → graph** | "read/write this value" | a targeted, configured node | yes |
| **Component → graph** | — | a parameter the first click rewrites | **no** |

The property picker writes **both halves**. A Component drop sets `component` and leaves `property`
open; choosing the property — the very first thing the creator will do — rewrites `component`. Measured
once (ADR-0040 §4), remeasured (ADR-0041 §6.1), unchanged here.

A Component keeps one meaning, and only one: **giving itself to an Object**. The refusal says so.

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| `Object ▸ Name/Tag/Layer/Active` is offered by the picker, as the first group | `inspector/node.test.js` |
| No registered type is called `Object` | `runtime/builtins.test.js` |
| The Inspector's Object rows and the picker's group come from one declaration | `inspector/schema.test.js` |
| Writing `Object ▸ Active` from a graph removes the object from the next frame | `runtime/pipeline.test.js` |
| An Object drop points the scene's instances, and only those with no answer | `editor/commands.test.js` |
| An empty or dead socket writes nothing and reports nothing | `runtime/pipeline.test.js` |
| `Translate` adds, and twice in a row adds twice | `interpreter.test.js` |
| `Translate` and `Get`+`Add`+`Set` reach the same state | the same |
| A pressed key moves the object, and the frame draws it in its new place and not its old one | `runtime/pipeline.test.js` |
| A file dropped on the Component list imports and attaches | `dnd/dnd.test.js` |

## 8. What this ADR does not decide

| Open point | Why |
|---|---|
| A refusal sentence for the Inspector's Component list | A silent refusal already exists there for non-consumable resources; filling it in is coherent (ADR-0026 §6) but concerns the whole area, not this slice |
| `Destroy`, `Spawn` | Structural changes to the Scene; ADR-0034's invariant 5 has to be settled first |
| `Random`, `Delay` | Determinism (ADR-0011) and per-instance execution state |
| An input transition shorter than a step | Pre-existing, recorded by ADR-0041 §3.4 |
| An Object picker listing the scene from the node | Drag and drop is the designed gesture, and it now suffices; a scene picker inside a project-scoped editor is a separate question |
