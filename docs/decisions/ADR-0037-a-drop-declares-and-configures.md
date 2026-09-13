# ADR-0037 — A drop declares, configures, and never guesses

- **Status:** **accepted** (2026-08-22)
- **Amended by:** ADR-0039 (2026-08-27) — §2.4 (a drop produces a finished node), §2.3 (a Resource is droppable)
- **Amended by:** ADR-0040 (2026-08-28) — §2.4: dropping a **Component** into a graph is withdrawn; a Component has a meaning, and it is to give itself to an Object
- **Amended by:** ADR-0043 (2026-08-29) — §2.4: dropping an **Object** no longer writes only into the `.px`. It still declares the `objectref` socket — no scene identity enters the file — and it additionally points the open scene's instances at that Object, where nothing has been answered yet. The sentence "a single resource is written" served to set aside the cross-resource undo question, which has since been answered (ADR-0041 §6.2)
- **Decides:** what a drag and drop coming from the Editor can do inside a `.px` graph
- **Depends on:** ADR-0010 (identity by ID), ADR-0016 / ADR-0026 (a `.px` is **one** resource), ADR-0021 (Component identity), ADR-0023 (`PropertyType`), ADR-0024 (undo per resource), ADR-0027 (the graph model), ADR-0034 (Object references), ADR-0036 (the `objectref` ↔ `object` boundary)
- **Amends:** ADR-0027 §11; ADR-0034 §3.7 (the *Object* row) and its "does not decide" table
- **Does not decide:** pre-filling the instance value; the drag gesture on an Inspector property row; a `component` port type, which stays refused by ADR-0034 §3.2

---

## 1. The fact that decides, and that no ADR had written

A `.px` **is a Component type**, of project scope. The Graph window binds it as such:
`graph.bind(workspace.attached(id))` returns a `ComponentDefinition`, never an instance.

> **When a `.px` is open, there is no current instance.** It may be attached to zero Objects of the
> open scene, or to fifty, and the Object selection is independent — ADR-0032 even makes them
> mutually exclusive.

Dropping *Player* into *Door.px*'s graph: **on which of the five doors would you write
`target = Player`?** The question has no answer. This is therefore not an ADR constraint to be
loosened, it is the absence of a recipient.

That fact invalidates the idea of a node carrying the target, and at the same time it designates the
only shape the gesture can take.

---

## 2. Decision

### 2.1 The drop declares a **socket**, not a target

> **Dropping an Object into a graph declares on the `.px` an `objectref` property named after that
> Object, and a node that reads it. The Object's identity enters nowhere.**

The creator sees `[Player]`. The file holds "a socket called Player". Every Object carrying the
Component says in the Inspector where **its** socket points (ADR-0034 §3.5).

```json
// in the .px — PROJECT scope
"properties": { "Player": { "id": "p_a1", "type": "objectref", "default": null } }

// in the scene — SCENE scope, one value per instance
{ "type": "res_door", "values": { "Player": "obj_7f3a" } }
```

That is what makes a `.px` **reusable** rather than locked onto a scene — and the creator reads it: a
named socket gets filled, an engraved identifier does not.

### 2.2 A drop writes into **one** resource, the one that is open

A `.px`'s properties and its graph share **one** pipeline and **one** stack (ADR-0027 §5). Declaring
the property, adding the node and laying the wire happen under **one batch**: a single `Ctrl Z` takes
the whole gesture back.

> **No drop modifies the Scene.** The cross-resource undo scope question ADR-0034 §3.7 was waiting on
> **does not arise**: nothing outside the `.px` is touched.

### 2.3 What enters a `.px` is always project-scoped

| What is dropped | What enters the `.px` | Scope |
|---|---|---|
| Object | a property **name**, and its `objectref` type | project |
| Component | its `componentType`, in a param | project |
| Property | `componentType` + `property.id`, in two params | project |
| Resource | its `ResourceId`, in a param — **added by ADR-0039** | project |

ADR-0034's invariant 1 is kept to the letter: **no scene identity**. A display name is used to name a
property — whose link is still carried by its `id`, immune to renaming (ADR-0027 §4) — and not to
designate anything.

### 2.4 Where the gesture would be ambiguous, the creator decides at the drop point

ADR-0027 §11 refused a property drop because reading and writing are two intentions and choosing one
would be magical. It announced the lifting itself: "the rule can be added the day **an unambiguous
gesture** is designed".

> **That gesture is a menu opened where the pointer released.** The choice is explicit, local, and
> made by the creator.

It is the menu every creation already opens in this Editor (ADR-0026 §10); no second one is created.

**Landing on an existing node opens no menu**: placing that node *was* the choice. A drop on a node
**configures** its params; a drop on bare canvas **creates**, after the question.

> **Extended by ADR-0039 §3 — the drop creates a FINISHED node, not a half-filled one.**
> A property drop wrote `component` and `property` and left the target empty: the creator then had to
> drag the Object from the Hierarchy and pull a wire to `Target`, when the Inspector was already
> showing that Object at the moment of the gesture. The drop now declares (or reuses) that Object's
> `objectref` socket and points the node at it, under **one single batch**. What enters the `.px` is
> unchanged: a socket NAME and two project-scoped identities — the `ObjectId` travels with the drag
> and is written nowhere (ADR-0034's invariant 1).

### 2.5 Typing stays the existing chain

```
Reference → Object → Component → Property → PropertyType
```

A port's type comes from `(componentType, propertyId)` through `portTypeOf()` — **never from the
Object**, which contributes nothing to it and cannot (there is no Scene in the port context). An
`objectref` property is carried as `object` (ADR-0036). No parallel type table, `typesCompatible()`
untouched, no new port family.

### 2.6 Invalid references stay visible

Nothing is rewritten to hide a problem. A deleted Object → the instance value is kept, resolves to
`null`, and the Inspector shows it in red (ADR-0034 §3.4, ADR-0036). A vanished Component or property
→ `MISSING_PROPERTY`, the node ringed, the graph not rewritten (ADR-0027 §8).

---

## 3. What this ADR amends

| ADR | Section | What changes |
|---|---|---|
| **0034** | §3.7, the *Object* row | argument **(b)** — "a gesture would write into two resources with two undo stacks" — assumed an encoding by **tag**, and therefore a write into the scene. The socket writes one resource only: the argument falls. Argument **(a)** — no display name serving as an identity — **stands, and is honoured**: the name names a property, the `id` carries the link |
| **0034** | "does not decide" | "an Object drop pre-filling a node" stops waiting on ADR-0024 |
| **0027** | §11 | the refusal of a property drop is lifted, by the unambiguous gesture §11 called for |

**Still valid and untouched:** ADR-0034 invariants 1-7, §3.1 to §3.6; ADR-0023; ADR-0027 §3, §5, §8,
§9; ADR-0036; ADR-0024. **Still refused:** the `component` port (ADR-0034 §3.2) — nothing consumes it
in this model.

---

## 4. Observable contracts

| Contract | Verifiable by |
|---|---|
| No scene identity in a `.px` | the serialized payload contains no `ObjectId`, even when the dropped Object is real |
| An Object drop is a single gesture | an `undo` removes the property **and** the node; a `redo` puts them back |
| A drop does not touch the Scene | no Operation on the scene's pipeline; identical serialization |
| A socket name overwrites nothing | two drops of the same Object declare `Player` and then `Player 2` |
| The Get/Set choice is explicit | with no answer from the menu, no node is created |
| A drop on a node configures, it does not create | the node count does not change |
| The type is the property's | a configured node's port carries the declared type, `objectref` excepted (ADR-0036) |

---

## 5. Consequences

### Positive

- A creator takes what they see and drops it; they no longer have to know `Get Property On` before
  they can start.
- A `.px` stays reusable, and the named socket **shows** it.
- A configured node reads: `Get Health.hp`, `Player`.
- No gesture crosses two undo stacks.

### Negative

- The instance value still has to be filled in: dropping *Player* does not point the socket at
  Player, it declares the socket. That is the price of reusability, and it is deliberately paid (see
  §6).
- The `.px` gains one property per dropped Object. A creator who drops five declares five sockets,
  which is what they asked for but may not be what they wanted.

---

## 6. What this ADR leaves open

| Point | Why |
|---|---|
| **Pre-filling the instance value** when the `.px` is attached to a single Object | the one place where a cross-resource write would reappear; to be decided with ADR-0024, not in passing during a drop |
| ~~**The drag gesture on an Inspector property row**~~ | **Settled (ADR-0039):** the dedicated handle this point called for exists — six dots on the row, which stop the `pointerdown` so that the label's scrub never sees a drag's events. A paired row (`Position`) has none: that is two properties, and the Core has no vector type (ADR-0023 §2) |
| **A `component` port type** | refused by ADR-0034 §3.2; nothing consumes it |
