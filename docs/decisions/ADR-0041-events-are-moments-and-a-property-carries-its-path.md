# ADR-0041 — An event is a moment, a state is a question, and a property carries its path

- **Status:** **accepted** (2026-08-28)
- **Decides:** what a keyboard/mouse input node is; how an input node says which flows it triggers; how a chosen property reads once it is chosen
- **Depends on:** ADR-0011 (determinism), ADR-0014 (input is passed, never read), ADR-0027 (the graph model), ADR-0033 (rows), ADR-0040 (one node per intention)
- **Amended by:** ADR-0045 (2026-08-29) — §3.2: a continuous input event exists, under a name that sets it apart (`Key Down`, `Pointer Button Down`), which the readability objection was asking for without saying so. §6.1: a Component can be dropped on a node that names one again. §2: the merged path becomes two rows again, `Component` and then `Property`.
- **Amends:** ADR-0014 §5 (the three questions are no longer one node); ADR-0040 §2 (the Component becomes visible again — as context, not as a question)
- **Does not decide:** buffering input transitions — see §3.4

---

## 1. The defect: a beginner's most common sentence was unwritable

> "When I press Space, jump."

The catalogue had no way of saying that. `Key` returned three booleans, so you had to write:

```
On Update ──▶ Branch ──▶ Jump
                 ▲
      Key.Just Pressed
```

Three nodes and two wires for a five-word sentence. And the real cost is not the node count: it is
that the creator first has to understand that **a press is not a moment but a value you test on every
frame**. That is a game-loop concept, imposed before the first success.

The node was moreover filed in an `Input` category carrying `Events`' hue: the interface said "this
is an event" and the model said "this is a boolean".

---

## 2. Decision: a chosen property reads with its Component

| | |
|---|---|
| **The old decision** | ADR-0040 §2: `component` is hidden, and the picker shows the property name alone. |
| **The problem** | The name alone is ambiguous as soon as two Components declare `speed`, `position`, `enabled` or `height` — which is the normal case and not an edge case. In the LIST a header answers; on the node, closed, there is no header. |
| **The new decision** | **One picker, hierarchical, as before.** What changes is how the ANSWER reads: closed, the control shows `Transform ▸ Rotation`; open, the list keeps the short names under their headers. The `.px`'s own properties have no prefix: there is only one possible Component. |
| **UX rationale** | The Component becomes **visible as context** again without becoming a **question** again. The creator never chooses it separately; they read it. Two independent selections stay refused — that was ADR-0040 §1's fault, and it is not reintroduced. |
| **Core impact** | None. The storage is unchanged: `component` + `property`, two project-scoped identities. |
| **Runtime impact** | None: it is presentation. |
| **Serialization** | None. |
| **Migration** | None. |

### 2.1 A glyph, never a dot

`Transform.rotation` is a programming-language expression. `Transform ▸ Rotation` is a direction: the
property is **inside** the Component, and the shape says so without a word. The node's title, for its
part, still does not move — `Get Property` stays `Get Property` (ADR-0040 §5).

---

## 3. Decision: an event and a state are two nodes

> **A node with a FLOW output triggers something. A node with a DATA output answers a question. No
> node does both.**

| | |
|---|---|
| **The old decision** | ADR-0014 §5: a `Key` node answers all three questions — held, pressed this step, released this step — through three boolean outputs. |
| **The problem** | The three are not the same kind of thing. "Held" is a STATE, true while you hold; "pressed" is a MOMENT, true once. Merging them into booleans forces every moment through `On Update → Branch`, and makes the creator carry a game-loop notion before their first success. |
| **The new decision** | **`On Key`** — an event node, a `Key` parameter, two flow outputs `Pressed` and `Released`, no data output. **`Key Is Down`** — a data node, a `Key` parameter, one boolean output `Is Down`. The same for the pointer: `On Pointer Button` and `Pointer Button Is Down`. |
| **UX rationale** | `On Key [Space] ▶ Jump`: one node, one wire. Each node has exactly one execution semantics, which makes the catalogue teachable — "a flow output starts, a data output answers" is a rule with no exception. The filing follows: `On Key` is in `Events`, `Key Is Down` in `Input`. |
| **Core impact** | Two node types added, two rewritten. No new vocabulary: see §3.1. |
| **Runtime impact** | `runEvent()` asks the node which flows fire, instead of following them all. |
| **Serialization** | Unchanged for `Key Is Down`: the `input.key` type and the `held` port are deliberately kept, so any graph that read `held` still reads it. |
| **Migration** | See §3.3. |

### 3.1 How an input node says what happened — with no new vocabulary

`runEvent()` followed **every** flow output of every node declaring `event:`. That was
indistinguishable from "follow them all" while no event was **conditional**.

The answer reuses the contract every flow node already honours:

```
execute(io) → portId | portId[] | null
```

It is `Branch`'s and `Sequence`'s. An input node that declares `execute` says which flows leave this
step; a node that declares none triggers them all — which is what `On Start` and `On Update` want,
and why neither of them changed.

`continuationsOf()` reads all three shapes in the same place, for both callers, so that an input node
and a flow node cannot diverge about what `null` means.

### 3.2 What stays a condition, and why that is deliberate

"While I hold Right, move forward" still costs `On Update → Branch → Set`. That is **correct**:
holding a key is not an event, it is true on every step until it is not. Making it an event would put
in the catalogue a node that fires sixty times a second while looking exactly like the one that fires
once.

### 3.3 Migration

| An old graph | After |
|---|---|
| reads `input.key` → `held` | **unchanged.** The type and the port are kept; only the label becomes `Key Is Down`. |
| reads `input.key` → `pressed` / `released` | the wire designates a port that no longer exists. `validateGraph()` reports it (`UNKNOWN_PORT`), and the interpreter **skips the stale wire and runs the rest** — the graph runs, amputated, and the panel says where. |

The second case is **not rewritten automatically**, and that is a choice: a data wire into a
`Branch`'s condition and a flow output do not have the same topology, and guessing which the creator
wanted would amount to rewriting their graph for them. A visible report beats a silent rewrite
(ADR-0027 §8). No game is maintained during this phase, which is precisely when to pay that cost.

### 3.4 What this decision does not fix

A press **and** a release between two simulation steps are seen by neither the old model nor the new
one: `pressed()` is `down now && not down at the previous step`, so a tap that is too quick leaves
both sets empty. That is a property of the input model (ADR-0014 §5), older than this decision and
not addressed here. A test records it so that it is observed rather than rediscovered.

---

## 6. The drag and drop matrix

The criterion is "**is this an action a creator could reasonably want to perform?**", never "is it
easy to implement". Each cell says what the gesture MEANS; a refused cell is refused with a sentence,
because a silent refusal is the worst answer to a gesture (ADR-0026 §6).

### Into the graph

| What you carry | On empty canvas | On a node |
|---|---|---|
| **Object** (Hierarchy) | **Accepts** — declares an `objectref` input named after the Object, and places a `Get Object` that reads it. No `ObjectId` enters the `.px`. | **Accepts** — points the node at that Object, reusing the input if it already exists. |
| **Property** (Inspector) | **Accepts, after a choice** — a `Get` / `Set` menu, then a **finished** node: the Object, the Component and the property were all known at the moment of the gesture. | **Accepts** — writes the full path onto the node. |
| **Component** (Inspector) | **Refuses**, with a sentence — see §6.1. | **Refuses**, with the same sentence. |
| **Resource** (Project) | **Accepts** — a `Resource` node holding its identity. Nothing is duplicated: the resource already exists. | **Accepts** if the node holds a resource. |
| **File** (from outside the browser) | **Accepts** — imports into the Project, then places a `Resource` node on it. **Two undos**, see §6.2. | **Accepts** if the node holds a resource: imports, then points. Same. |
| anything, on a canvas with no `.px` open | **Refuses** — "there is no Component open on this canvas". | — |

### Elsewhere

| What you carry | Target | Result |
|---|---|---|
| Object | an `objectref` property | **Accepts** — assigns the identity (ADR-0034 §3.5). |
| Object | Project | **Refuses** — an Object belongs to a scene; the Project holds resources. |
| Component | an Object (Hierarchy) | **Accepts** — adds it to that Object. That is this drag's main meaning. |
| Resource | a `resource` property | **Accepts** if the property declares that it accepts it. |
| Resource | the scene / Hierarchy | **Accepts** — instantiates. |
| Resource | a Project folder | **Accepts** — moves. |
| File | Project / scene / Hierarchy / a property / content | **Accepts** — imports, and then does what the target means. |

### 6.1 Component → graph: refused, and this time it is measured

The gesture was withdrawn a first time **by argument**: the Component was hidden, so the drop wrote a
parameter nothing showed. It was reactivated when the control started displaying `Transform ▸ …`,
which made the effect visible.

In use, the reasoning does not hold:

> **The property picker writes BOTH halves.** A Component drop sets `component` and leaves `property`
> open; the creator's very first action — choosing the property — rewrites `component`. The gesture's
> only effect is replaced by the next gesture.

That is exactly the criterion set for this slice: "without creating a parameter that will immediately
be replaced by another action". And there is no "finished" version of this gesture: which property is
precisely what a Component does not say, and guessing it would be the magic this editor refuses
(ADR-0037 §2.4).

**A Component therefore keeps one meaning, and only one, and it is elsewhere:** giving it to an
Object. The refusal says so.

| Gesture | What the creator wants | What is produced |
|---|---|---|
| Object → graph | "work on this Object" | a named input + a node that reads it — **finished** |
| Property → graph | "read/write this value" | a targeted, configured node — **finished** |
| Component → graph | — | nothing that survives the next click |

### 6.2 A file drop is not one undo, and cannot be

Measured: a Ctrl+Z removes the node, and the imported resource stays in the Project.

It is not a forgotten `batch`. The gesture writes into **two resources** — the project manifest for
the import, the `.px` for the node — and ADR-0024 gives each resource its own stack. An entry
covering both would be a cross-resource undo, which ADR-0034 §3.7 explicitly leaves open.

The behaviour is therefore: **the node undoes, the resource stays**. It is also the less surprising of
the two: an imported resource is a fact about the project, and making it disappear because you undid
a node would be more startling than leaving it. Drops that write only into the `.px` — Object,
Property — stay atomic (`batch`, ADR-0024 §4).

The same remark applies to `Add Component ▸ Custom Component`: creating the `.px` and attaching it are
two resources, and therefore two undos.

### What stays deliberately refused

| Gesture | Why not |
|---|---|
| File → graph, several at once | A node holds **one** resource. The others would be imported and then silently lost, which is worse than not taking them. |
| Property → a node that works on no property | There is nothing to write there; the refusal says where to drop. |
| Component → a node, or the canvas | §6.1: everything it writes is rewritten by the next click. |

---

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| `On Key` fires only on the step where the key moves | `interpreter.test.js`, through `Runtime.step()` |
| A key held for a hundred steps fires once | the same |
| `Key Is Down` stays true while you hold | the same |
| `input.key`'s `held` port is unchanged | `nodes.test.js` |
| An event node has no data output, and vice versa | `nodes.test.js`, on the real catalogue |
| `On Key` is in `Events`, `Key Is Down` in `Input` | the same |
| No node renames itself according to its configuration | `nodes.test.js` (ADR-0040 §5) |
| The closed control shows `Transform ▸ Rotation` | `inspector/node.test.js` |
| The list keeps the short names under their headers | the same |
| The path never contains a dot | the same |

---

## 5. Rejected alternatives

| Alternative | Why not |
|---|---|
| Keeping the booleans and adding an `On Key` node beside them | Two ways of reading a key, one of them a trap: a boolean `Just Pressed` stays a node that reads as a state and behaves as a moment. |
| A single `Key` node with both flow **and** boolean | It is the mixture that makes Blueprints unreadable for a beginner: one box, two execution semantics, and nothing in the drawing saying which applies. |
| A `When [Pressed | Released]` parameter instead of two ports | It hides half the possibilities behind a choice made before the creator knows they want it, and makes "on release, shoot" beside "on press, aim" non-composable. |
| Making `Is Down` a continuous event | A node that fires sixty times a second while looking like the one that fires once. |
| Automatically rewriting old `pressed` wires | Guessing a topology on the creator's behalf. The report is honest, the rewrite is not. |
| Two dropdowns, Component and then Property | The mistake ADR-0040 §1 fixed. The Component becomes context again, not a question. |
