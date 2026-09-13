# ADR-0040 — One node per intention: the Component is filed, the target is designated, the name does not move

- **Status:** **accepted** (2026-08-28)
- **Amended by:** ADR-0045 (2026-08-29) — §2: `Component` becomes a separate row again, but a question that is **already answered** (`This Component`), because the price ADR-0040 §8 had itself measured — "the property list holds every Component in the project" — grew with the projects. §4 (dropping a Component into a graph) is **reactivated**: the premise of the refusal, a picker that wrote both halves, no longer exists — see ADR-0045 §12.
- **Amended by:** ADR-0041 (2026-08-28) — §2: the Component becomes visible again in the closed control (`Transform ▸ Rotation`), as the property's context and not as a second question. §4 (dropping a Component into a graph) is **confirmed**: reactivated and then withdrawn a second time, this time on measurement — see ADR-0041 §6.1
- **Decides:** how many property nodes exist; whether `Component` is a question asked of the creator; how a node designates the Object it acts on; what a Component dropped on a graph means; whether a node's name can change
- **Depends on:** ADR-0007 (Inspector schema), ADR-0021 (Component identity), ADR-0023 (`PropertyType`), ADR-0024 (undo per resource), ADR-0027 (the graph model), ADR-0034 (Object references), ADR-0036 (the `objectref` ↔ `object` boundary), ADR-0037 (a drop declares), ADR-0039 (taxonomy, scope, titles)
- **Amends:** ADR-0034 §3.2 and §3.3 (two pairs of nodes become one); ADR-0034 §3.2 (the "empty Object socket" warning); ADR-0037 §2.4 and ADR-0034 §3.2 (dropping a **Component** into a graph is withdrawn); ADR-0039 §5 (the name rule becomes absolute: the mechanism disappears)
- **Does not decide:** a `component` or `property` port type, still refused (ADR-0039 §4); the shape of the grouped picker, which is UI and not a contract

---

## 1. The defect: four nodes for two intentions

The catalogue offered:

| Node | What it read | Why it existed |
|---|---|---|
| `Get Property` | a property of **this** Component | the local case |
| `Get Property On` | a property of a Component of **another** Object | the remote case |
| `Set Property` | the same, writing | |
| `Set Property On` | the same, writing | |

A creator who wants "the speed" first has to answer a question they never asked: **where is that
property filed?** They pick a node from an engine distinction — two places where the Core goes
looking for a declaration — and they pick it **before** knowing what they are looking for, since the
node comes before the picker.

The price is paid twice:

- **at the drop.** Dragging `Transform.rotation` onto a `Get Property` was **refused**: that node
  only read its own properties. The right gesture, on the node that carried the right name, did not
  work;
- **on revisiting.** Going from "my speed" to "the player's speed" meant deleting the node, creating
  another one and redoing the wires. The change in the creator's head was tiny; the change in the
  graph was not.

The fact that an engine looks in two places is **not** a reason to keep two nodes. It is a reason to
hide it.

---

## 2. Decision: two nodes, and `Component` stops being a question

> **There is `Get Property` and `Set Property`, and nothing else. The creator picks ONE property from
> a list grouped by Component (`Transform ▸ Rotation`). The Core still stores the `component` +
> `property` pair; the UI never asks for it.**

| | |
|---|---|
| **The old decision** | ADR-0034 §3.3: `Get Property On` / `Set Property On` are distinct nodes carrying two parameters — a Component type, then one of its properties — presented as two dropdowns. |
| **The problem** | The creator picks a **node** from an internal distinction (where the Core looks for the declaration), then a **Component** from an engine abstraction, before reaching what they wanted: a property. Three decisions for one intention, two of which do not talk about their game. |
| **The new decision** | One node per intention (read / write). One picker, grouped: the **This Component** group first, then one group per Component type. The chosen value carries both identities; the Editor splits them into two parameters on write. |
| **UX rationale** | The question asked is the one the creator asks ("which property?"). The Component stays **visible** — it is the group's name — but as the shape of the answer, never as a prior question. The number of decisions goes from 3 to 1, and the node stops being a choice you can get wrong. |
| **Core impact** | `property.getOn` / `property.setOn` disappear from the catalogue. `property.get` / `property.set` carry `{ target, component, property }`, **always** expose an `object` socket, and resolve through a single `resolvedProperty(node, context)`: `component` absent → this `.px`'s properties; `component` present → those of the named type. The two reference kinds `PROPERTY_REFERENCE` and `COMPONENT_PROPERTY_REFERENCE` merge into `PROPERTY_REFERENCE`: one question, one kind. |
| **Runtime impact** | No change of semantics. `targetObject()` / `targetComponent()` already answered both cases; they now answer from one node. The Runtime stays DOM-free and the graph stays runnable without an Editor. |
| **Serialization** | Unchanged. The stored parameters are exactly the ones the four nodes wrote — `component` is a **project**-scoped type (a `ResourceId` or a class name), `property` a stable identity. No `ObjectId` enters a `.px` (ADR-0034 invariant 1). |
| **Migration** | A rename, applied **at both doors**: `Graph.deserialize()` for the Editor and `compile()` for the Runtime, which never builds a `Graph` and compiles the raw payload. `{ 'property.getOn': 'property.get', 'property.setOn': 'property.set' }` — the parameters are untouched, so a graph published before the merge returns the same value after. An unknown type stays refused: the migration is a table, not a shrug. |

### 2.1 Why `Component` is still stored

Hiding an abstraction is not removing it. The Core needs to know **which type** the property is
declared on to resolve it at run time, and that type is a project-scoped identity, legal in a `.px`.
What was wrong was making the creator carry that need as a second dropdown.

The parameter is therefore declared `hidden: true` — ADR-0007's word for "stored, never drawn" — and
the Inspector skips it. One control writes both halves.

---

## 3. Decision: the absence of a target is `Self`, and it is not a blank

> **A property node has three ways of answering "on which Object?": a wire, a picker, or nothing —
> and *nothing* means the Object this Component is attached to.**

| | |
|---|---|
| **The old decision** | ADR-0034 §3.2: an unconnected `object` socket returns `null`, and the validator emits a warning — "no Object is chosen or connected". |
| **The problem** | The rule was written when `Get Property On` was a **distinct** node whose target could only come from a wire. On the merged node, it warns about the most common graph there is: "rotate **me**". A defect reported as an error stops reading as a defect. |
| **The new decision** | An `object` port **the node can fill itself** — that is, one carrying a target picker on its row — is never reported empty. A **bare** `object` port (`Is Valid`, `Parent`), which has no other possible answer, always is. The distinction is read from the node's definition, not from a list of node types. |
| **UX rationale** | `Self` is a beginner's default case, and a default is not declared: it is observed. The picker **shows it** — it displays `Self` while nothing is chosen — so the creator sees what the node acts on without having to know a convention. Nothing hides behind the blank. |
| **Core impact** | `checkObjectInputs()` skips the ports named by an `OBJECT_SOCKET_REFERENCE` parameter. The `COMPONENT_REFERENCE` kind loses its `empty` message: a node naming no type reads **this** Component, which is the ordinary case and not a gap. |
| **Runtime impact** | None. `targetObject()` already returned `io.self` as a last resort; the validator simply stops contradicting the interpreter. |
| **Serialization** | None. "Nothing" is the absence of a parameter, which every graph written before this decision already carries. |
| **Migration** | None. A graph that carried the warning no longer carries it; its behaviour never changed. |

---

## 4. Decision: a Component is not dropped into a graph

> **A drag and drop has a meaning per family: an Object is a place to act, a property is something to
> read or write, a resource is a value — and a Component is a thing you give to an Object. It is not
> a thing you put into a graph.**

| | |
|---|---|
| **The old decision** | ADR-0034 §3.2 / ADR-0037 §2.4: a Component dropped on a node writes its type into the `component` parameter; dropped on the canvas, it creates an already-pointed `Get`/`Set Property On`. |
| **The problem** | The `component` parameter is now written by the property picker — which writes **both halves at once**. A drop that writes only the `component` half produces a state nothing can read: the node does nothing while `property` is empty, and the creator's first interaction overwrites the dropped value. The gesture changes nothing visible and nothing readable. |
| **The new decision** | The `component-to-canvas` and `component-to-node` rules are withdrawn. A Component released on a graph is refused, with the sentence that says what to do: "a graph works on properties, not on Components — drag one of its properties, or drop it on an Object to add it". `component-to-object` is unchanged. |
| **UX rationale** | A gesture that seems to do nothing is worse than a refused one: the creator does not know whether they missed the target, whether the product is broken, or whether nothing was ever planned. One drag family, one meaning — the promise the vocabulary already made everywhere else. |
| **Core impact** | None: the drag rules live in the Editor. |
| **Runtime impact** | None. |
| **Serialization** | None. |
| **Migration** | None: nothing dropped previously is read differently. A `.px` carrying `component` without `property` already behaved like an unconfigured node. |

---

## 5. Decision: a node's name cannot change — the mechanism disappears

| | |
|---|---|
| **The old decision** | ADR-0039 §5: the catalogue declares no `title()` any more, but `NodeDefinition.title` stays available and `shapeDependsOnNode()` takes it into account. |
| **The problem** | An absolute rule held by discipline is not a rule: the next node with "a good reason" to rename itself could, and `Get Ground` would come back by addition rather than by argument. |
| **The new decision** | `title` disappears from the `NodeDefinition` contract, from `shapeDependsOnNode()` and from `describeNode()`. A node type has a `label` and **no other way** of saying what it is called. A test walks the whole catalogue and fails if a definition declares a `title`. |
| **UX rationale** | "Add a `Set Property`" has to designate the same node an hour later, in another project, in a tutorial and in the creation menu. What the node is configured with is read **inside**, on the rows where it is changed. |
| **Core impact** | `shapeDependsOnNode()` now looks only at `inputs` / `outputs`. What a creator sees move when they configure a node is its **ports**; its name is the one thing that holds. |
| **Runtime impact** | None: a title was presentation, never seen by the interpreter. |
| **Serialization** | None. |
| **Migration** | None. |

---

## 6. What it changes for a beginner, measured

Five tasks, counted in **decisions** (a node chosen, a dropdown opened, a wire pulled, a concept you
have to have understood to move forward).

| Task | Before | After |
|---|---|---|
| Read my own speed | 1 node + 1 list | 1 node + 1 list |
| Rotate my Object | 1 node (`Set Property On`) + `Self` + 1 wire + 2 lists | 1 node + 1 list |
| Write into the player's speed | 1 node + 1 Object drag + 1 wire + 2 lists | **1 drag** (the node arrives finished) |
| Go from "my speed" to "the player's" | delete, recreate, rewire | 1 list |
| Read a property of an Object found by tag | 2 nodes + 1 wire + 2 lists | 2 nodes + 1 wire + 1 list |

Concepts you have to have understood to write those five sentences: **Object**, **property**,
**event**, **wire**. `Component` is no longer among them; neither is "where the engine files a
declaration".

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| The catalogue holds only `property.get` and `property.set` | `registry.types()` |
| A graph naming `property.getOn` loads as `property.get` | `graph.test.js`, at both doors |
| A `.px` published before the merge still runs | `interpreter.test.js`, on the raw payload |
| No node exposes a `component` field | `describeNode().fields`, on the real catalogue |
| `Set Property` says Object, Property, Value — once each | `nodeRows()`, on the real descriptors |
| An empty Object socket is reported only when the node has no other answer | `validate.test.js` |
| A property node with no target acts on its own Object | `interpreter.test.js` |
| No node type can rename itself | `nodes.test.js`, over the whole catalogue |
| A Component released on a graph is refused with a sentence | `dnd.test.js` |
| Every drag family has one rule and only one | `ruleFor()`, per zone |

---

## 8. Consequences

### Positive

- Two nodes instead of four, and the right node is the one whose name matches the intention.
- The word `Component` leaves the graph's visual language without leaving the model.
- Changing the target is a change of list, not a rebuild.
- Dragging and dropping a property works on the node that carries the expected name.
- One drag family, one meaning.

### Negative

- The property list is longer: it holds every Component in the project. It is grouped and filterable,
  which a flat list would not be — but on a very large project it will need a search, which this ADR
  does not decide.
- The "drop a Component on the canvas" gesture disappears. It produced nothing readable; the
  equivalent gesture is dropping a **property**, which produces a finished node.
- `component` is stored and never shown: invisible state, accepted, whose only possible write goes
  through the picker that also writes `property`.

---

## 9. Rejected alternatives

| Alternative | Why not |
|---|---|
| Keeping the four nodes "since the Core distinguishes the two cases" | An internal distinction is not a reason to expose a choice. It is the reason to hide it. |
| Keeping two lists (`Component`, then `Property`) | Two questions for one intention, the first of which talks about the engine. |
| A mode on the node (`Local` / `On Object`) | ADR-0039 §0.1: a mode is a word about the implementation. The gesture already states the intention. |
| Showing `Self` as a **value** of the picker, to be chosen | A default is not chosen. It is displayed, and another answer replaces it. |
| A Component drop that pre-filters the list | The state would still not be readable on the node, and would be overwritten on the first click. |
| Leaving `title` in the contract "just in case" | An absolute rule held by discipline ends up being negotiated. |
