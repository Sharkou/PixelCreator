# ADR-0026 — Drag and drop is a cross-cutting capability, `.px` is a single resource, and `active` is the only liveness state

- **Status:** **accepted** (2026-08-18)
- **Depends on:** ADR-0003 (Property System), ADR-0007 (schema), ADR-0016 (Component definition), ADR-0019 (structural Operations), ADR-0020 (Resources), ADR-0024 (Undo/Redo), ADR-0025 (folders, resource Inspector)
- **Amends:** ADR-0016 (the graph was referenced by `ResourceId`), ADR-0025 (§6 renaming, §ordering), ADR-0001 (`Object.visible` removed)

## Observed context

The previous pass made Project functional. Using it, seven inconsistencies appeared — all of the
same kind: **two mechanisms for one idea**.

| Finding | Cause |
|---|---|
| Creating a Component created **two** resources, `.px` + a graph | ADR-0016 required a `ResourceId` for the graph |
| Renaming was on double-click in Project, on a second click in Hierarchy | Two gestures for one act |
| Renaming from the Inspector waited for `Enter`; elsewhere, every keystroke propagates | Two ergonomics for one field |
| Renaming `player.png` let you write `player.txt` | The name and the type were a single free field |
| `Hide` in Hierarchy wrote `visible`, the Inspector's checkbox wrote `active` | **Two flags** for a state nothing distinguished |
| Ordering inside a folder was not editable | No Operation represented it |
| The `grab` cursor covered a Component's whole header, which is also a collapse button | Two gestures on one surface, with no mark |

And one gap: drag and drop existed in only three places, each with its own code.

## Decision

### 1. `MyComponent.px` is **one** resource — amends ADR-0016

**SETTLED.** A Component's definition **carries its graph**:

```js
{ type: 'res_c3', label: 'Controller', properties: { … },
  graph: { version: 1, nodes: [], connections: [] } }
```

ADR-0016 required a `ResourceId` for the graph for two reasons: not duplicating a graph, and letting
the Graph window open a graph without loading the definition. **With a single resource, duplication
is impossible by construction** and "opening the graph" *is* "opening the `.px`". What the
identifier bought becomes structural.

`defineComponent()` now refuses a string, and the message says so: a `.px` carries its graph, it
does not point at another file. A creator thinks "I created a Component", and the model says the
same thing.

`ResourceKind.GRAPH` stays in the enumeration — a standalone graph remains conceivable — but
**nothing creates one any more**.

### 2. `active` is an Object's only liveness state — amends ADR-0001

**SETTLED: `Object.visible` is removed.**

The Runtime skipped an `!active` object; the renderer additionally skipped a `!visible` one. The
distinction — simulated but not drawn — was exposed by **no control**, and the two that existed each
wrote a different field: hiding a row in the Hierarchy did not uncheck the Inspector's box.

One field, two controls, one value. `serializeObject()` no longer writes `visible`.

> If "simulated but invisible" becomes a need again, it will come back as a property of a
> **rendering Component** — where the question arises — and not as a second flag on the Object.

### 3. Renaming: the same gesture everywhere, reactive everywhere, **one** history entry

**SETTLED.**

| Gesture | Where | Effect |
|---|---|---|
| A second click on an already-selected item | Project, Hierarchy | in-place editing, after the 400 ms pause |
| `F2` | Project, Hierarchy | immediate editing |
| Double-click | Project, Hierarchy | **open**, never rename |
| Typing in the Inspector | Inspector | the model moves on **every character** |

The apparent contradiction — "reactive" and "a single undo entry" — is resolved with what the format
already carries: the field **mints a `batch` at focus** and forgets it at blur. Eleven keystrokes
produce eleven replicated operations (the model is live, that is the product) and **one** history
entry (ADR-0024 §4). No debounce, no second history.

This **amends ADR-0025 §6**, which had settled the opposite for resources.

### 4. The extension belongs to the type, not to the creator

`player.png` → `player_idle.png`: yes. `player.png` → `player.txt`: **no**.

- the extension is **derived** — from the `mime` for an asset, from the `kind` otherwise (`.px`,
  `.scene`);
- the Inspector's field holds the **base**, the extension is displayed next to it, read-only;
- a typed extension is stripped if it looks like a type (`.txt`, `.jpg`), kept if it looks like a
  name (`v1.2`);
- the uniqueness counter goes **before** the extension: `hero 2.png`.

**The name stays ONE field in the model.** No separately stored `base` + `extension`: there is no
file system behind it — the store is indexed by `ResourceId` (ADR-0020) — so a second field would
be redundancy to keep in step for a derivable suffix.

### 5. `MOVE_RESOURCE` — amends ADR-0025

ADR-0025 left the internal ordering of a folder unrepresented. It is represented now, and by **one**
operation, like `REPARENT` for objects (ADR-0019):

```
MOVE_RESOURCE { resource, parent, index, previousParent, previousIndex }
```

`index` is a **rank among siblings**, never a position in the flat manifest: a creator drops between
two tiles of the folder they are looking at, and a global position would mean something different on
each machine. The inverse of a move is a move.

`SET_PROPERTY parent` is no longer the path for a move — it could not carry a rank — but the cycle
guard stays in the handler, for both.

### 6. Drag and drop is **one** capability, described by a rule table

```
payload                 target                      rule
─────────────────────   ─────────────────────────   ──────────────────────────────
files (from the desktop) project | scene |           import, then instantiate
resource                 hierarchy | property |      according to the target
object                   content
component
```

- `dnd/payload.js` — what is carried: `files`, `resource`, `object`, `component`;
- `dnd/rules.js` — what a drop **means**, pure, tested under Node;
- `dnd/files.js` — the only part that needs a browser (`DataTransfer`).

**A rule can refuse, and say why.** `describe()` provides the sentence a panel displays and a test
checks; "nothing happened" is the worst answer to a gesture.

**What is instantiable is one table row.** An image becomes `Object + Transform + Sprite(source)`. A
sound, a tilemap, a prefab: one more row, and nothing else changes. A resource with no row is not
instantiable, and the refusal is visible.

The rules live in the layers they concern: they call the model (`project.move`,
`component.setProperty`, the object-adding command), never the DOM.

### 7. A prefab is not a format, it is a decision — **deferred**

Dragging an Object from the Hierarchy into Project is **refused, with its reason**. What is not
decided: what a prefab contains, how an instance stays linked to it, what an override means, and what
becomes of an instance when the prefab changes. A "temporary" implementation would be a format the
graph model would then have to undo.

The API is ready — it is one row in the rule table — and the decision will come with the Graph
window, which raises exactly the same questions.

### 8. A surface that is both clicked **and** dragged carries a handle

A Component's header is a button (it collapses): cursor `pointer`. Dragging is taken on a six-dot
**handle**, which shows `grab`. The gesture already existed (`MOVE_COMPONENT`, ADR-0018/0019); what
was missing was saying **where** it is taken.

### 9. "Search components" becomes "Search properties"

A Component belongs to the `Object` model: it is a capability of an object. A Resource has an
identity, metadata and content — **not** Components. One search field serves both panels, so it is
named for what they have in common.

### 10. `+` and `…`, in every window, with the same primitive

The Project's creation menu is **the same** categorized, filterable dropdown as Add Object and Add
Component (`ui/menu.js`): the same groups, the same headers, the same arrows. The resource
categories — `General`, `Scenes`, `Graphics`, `Audio`, `Components`, `Other` — are a table,
extensible with no `if` at all.

`…` completes `+` in Project, Hierarchy and Inspector, and contains **only what exists**: import, go
up, expand all, collapse all, deselect.

### 11. Project is an asset browser, not a second Hierarchy

A tile grid, a chequerboard thumbnail, a real preview for images, a per-type glyph otherwise — as in
`design/prototype.js`. The breadcrumb, folder navigation, selection and search are kept. A scene is
**arranged**, a project is **browsed**: these are not the same gestures, so not the same view.

## What this ADR does not decide

- **The prefab** (§7).
- **Opening a resource** other than a folder: the double-click is reserved and emits the intent, but
  there is no editor to open as long as the Graph window and scene swapping do not exist.
- **The graph model** itself: `.px` carries `{ version, nodes, connections }` and nobody interprets
  it yet.
- **Importing sounds and tilemaps**: one row in `INSTANTIABLE` the day a Component consumes them.

## Consequences

### Positive

- A creator who makes a Component gets **one** file.
- One table says what a drop means; adding a source, a target or a type is one row.
- Refusals are visible and tested — including the prefab, which says why it does not exist.
- `active` can no longer diverge from itself.
- Renaming is the same gesture everywhere, and costs one undo entry.

### Negative

- `Object.visible` disappears from the format: scenes from the previous pass lose a field that only
  the renderer read (no published project exists).
- `defineComponent()` refuses a form ADR-0016 required: the tests and payloads written in between
  had to be migrated.
- Cross-window dragging goes through a shell event rather than through `DataTransfer`, because an
  HTML5 drag does not cross several Shadow Roots cleanly.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping `.px` + a GraphResource** | Two resources for one thing, in the panel as in the creator's head |
| **Keeping `visible` beside `active`** | Two flags, no control to tell them apart, two views in disagreement |
| **Renaming on double-click in Project** | The double-click must open; two gestures for one act, depending on the window |
| **Waiting for `Enter` in the Inspector** | The product propagates letter by letter; the exception was the one thing that needed explaining |
| **`base` + `extension` stored separately** | Two fields to keep in step for a derivable suffix, with no file system behind |
| **Reordering through `SET_PROPERTY parent`** | A `parent` carries no rank; it would have taken two operations and an order between them |
| **A `handleDropX()` per window** | Three different ideas of what an image means, and none testable |
| **A minimal prefab right away** | A format invented before the decision, which the graph model would have to undo |
