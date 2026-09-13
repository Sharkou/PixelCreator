# ADR-0030 — A reference is chosen, a rank is two operations, a search is scored, and a palette answers two questions

- **Status:** **accepted** (2026-08-18)
- **Amended by:** ADR-0039 (2026-08-27) — §4's palette goes from six hues to seven, because "returning a reference" and "reaching a property" could not be told apart with six
- **Depends on:** ADR-0007 (Inspector schema), ADR-0018 (structural order), ADR-0019 (structural Operations), ADR-0020 (Resources), ADR-0023 (property types), ADR-0024 (Undo/Redo), ADR-0026 (cross-cutting drag and drop), ADR-0027 (the graph model), ADR-0028 (reflow and feedback), ADR-0029 (transport)
- **Amends:** ADR-0023 (`resource` was not editable), ADR-0029 §7 (the Core gains `restoreScene()`)

## Observed context

The previous pass shipped the model. Using it, four gaps of the same kind appeared — **a decision
that was correct when it was taken, and became wrong once the brick it was missing existed.**

| Finding | What was missing then | What exists now |
|---|---|---|
| `Sprite.source` displayed `res_a7f3` read-only | a resource browser | the Project window, its icons, its previews |
| A `.px`'s properties could not be reordered | an operation carrying a rank | `REMOVE_PROPERTY` already carries its index |
| The node menu showed twenty entries behind a single scroll | nothing — it was `label.includes()` | eight categories, and aliases to declare |
| The graph canvas was monochrome | a colour vocabulary | six hues, and two questions to ask of them |

And a fifth, measured: `editor.js` refused to draw a transport while the snapshot did not exist
(ADR-0029). It exists.

## Decision

### 1. A `resource` property has a control — amends ADR-0023

**SETTLED.** `inspector/schema.js` said, and it was right:

> "a `resource` holds a ResourceId, and picking one needs a resource browser — the Project window is
> where that will live, and inventing a text field for an opaque identifier would invite a creator
> to type over it and break the reference."

The reasoning is not reversed, it is **paid for**. What it refused was a text field; what arrives is
`ui/resource-field.js`:

- it shows **what the reference designates** — the name, a real thumbnail, the kind's icon;
- it opens the same categorized dropdown as all the others (ADR-0026 §10);
- it accepts a drop, and refuses one with its reason (ADR-0028 §3);
- it clears with one click;
- a broken reference is displayed **in red**, never empty: a dead pointer is a fact the creator must
  be able to see (the same rule as ADR-0027's for a node pointing at a deleted property).

**What a reference accepts is declared, never guessed.** `kind` and `mime` (ADR-0007) are read by
**one** table: the picker's list and `rules.acceptsResource()` both come out of it, so a resource
the menu offers cannot be refused at the drop. `Sprite.source` now declares
`kind: 'asset', mime: 'image/'` — a Sprite pointed at a scene is not a state you should be able to
reach.

`array` **stays** read-only: what it lacks is a list control, and that is visible work rather than a
silent dead end.

### 2. Reordering a property is `REMOVE_PROPERTY` + `ADD_PROPERTY`, under one `batch`

**SETTLED. No `MOVE_PROPERTY`.**

ADR-0026 §5 created `MOVE_RESOURCE` with a precise argument: `SET_PROPERTY` cannot carry a rank. It
does not apply here, because **two existing operations already carry it**: `REMOVE_PROPERTY` carries
the descriptor *and* the index it occupied, `ADD_PROPERTY` places a descriptor *at* an index.

```
moveProperty(id, index)  ->  REMOVE_PROPERTY { property, index: from }   batch: b
                             ADD_PROPERTY    { property, index: to }     batch: b
```

- **one** history entry, because it is a `batch` (ADR-0024 §4);
- the inverse is free: `invert()` already knows both, and a stack replaying them backwards puts the
  property back where it was;
- **the identity survives** — the descriptor is reinserted with the same `id`, so any node that read
  that property is still wired to it (ADR-0027).

A third operation would have needed its inverse, its handler and its tests to say what these two
already say.

> **The limit, and it is real:** the reactive record is recreated, so an observer attached to the
> descriptor itself is lost. That is acceptable because the panel redraws on a structural operation —
> which is what this pair *is*. The day something has to survive a move without a redraw, that will
> be the argument for `MOVE_PROPERTY`, and not before.

### 3. A long menu opens on its categories, and a search is **scored**

**SETTLED.**

`label.toLowerCase().includes(query)` is not a search, and the node catalogue is where that stops
being an opinion: `float` found nothing (the node is called `Number`), and `event` only found the two
event nodes by accident.

Two changes, in `ui/menu.js` and `ui/relevance.js`:

**The menu has three states, and the query chooses which.**

| State | What is shown |
|---|---|
| a query is typed | the scored results, across every category |
| `browse` mode, no category open | one row per category, with its count |
| otherwise | the entries, under their headers |

`browse` is an option, not a second format: a category *is* a `heading` followed by its entries —
the shape every Editor menu already passes.

**The score is pure, and it is tested.** `ui/relevance.js` reads the name, the type, the category
and the declared aliases, and ranks: exact, prefix, word start, substring, then subsequence as a last
resort. A match on the **name** always beats a match on the category — otherwise typing `not` would
answer with the whole Logic group.

Ranking is the part of a picker you cannot verify by looking at it, so it lives in a pure module with
its own test file, and not in a menu that would need a browser to run.

`Escape` **undoes the last step** — the query, then the category, then the menu.

### 4. Six hues, and they answer **two** questions

**SETTLED.**

A graph must say *what a node is* and *what a wire carries*. One hue per category means twenty
colours and no meaning. So: **one** palette, and both questions draw from it.

```
--px-hue-flow        the execution order — a wire, not a value
--px-hue-number      number, int        · Math, Compare
--px-hue-boolean     boolean            · Logic
--px-hue-text        string             · Values
--px-hue-reference   a property, a resource, a colour · Properties
--px-hue-any         unconstrained      · Debug
```

Events takes the product's accent, because an event is where everything begins.

A `Multiply` node and a `number` port are **deliberately** the same blue: it is the same idea seen
twice, and the creator learns the palette once. The same hues dress the ports, the wires and the type
badge of a property in the Inspector.

They are **tokens**, not literals, because a shadow root sees custom properties and sees nothing
else.

### 5. A Resource icon, a Node category icon, and a Graph icon

**SETTLED.** All three used to be one drawing, which made the creation menu read as twenty copies of
the window it had been opened from.

- **Resource**: `iconForResource()` — what you open (`.px`, `.scene`, an image);
- **the graph canvas**: `graph` — two nodes and the wire between them;
- **Node**: `iconForNode()` — **by category**, not by type. Twenty drawings would be twenty things to
  recognize; eight say what *kind* of node it is, which is the question you are asking with the menu
  open. A type that wants its own can declare it.

And seven glyphs for the **shapes of value** (ADR-0023), used for a property's badge, for the Type
picker and for the ports.

### 6. The Core gains `restoreScene()` — amends ADR-0029 §7

**SETTLED.** ADR-0029 said the Runtime would gain only one method, `Clock.reset()`. That holds. But
`Stop` needs one more thing, and it is in the **Core**:

```js
restoreScene(scene, snapshot, { registry })   // puts a scene back, IN PLACE
```

`deserializeScene()` builds a **new** `Scene`, which is the wrong shape for `Stop`: the Runtime, the
Viewport, the Hierarchy and the Inspector all hold the starting scene, and handing them another one
would be exactly the copy ADR-0029 §1 refuses. The two now share their three passes, because **the
order of the passes is the format's contract** and writing it twice means two readers that will
eventually diverge.

It emits **no** Operation: restoring is not an authoring intent, it is the Editor undoing a session
nobody recorded (ADR-0029 §5).

### 7. The loop belongs to the Viewport, and it has to be woken

**SETTLED.** The Viewport already owns the Editor's only `requestAnimationFrame`, and it is
**demand-driven**: a frame is requested when something it *observes* changes. `Runtime.running` is
none of that — it is a flag on an object it owns but does not observe. Hence `viewport.wake()`,
called once by the transport; from then on, the "running" branch of its own tick requests the next
frame.

A frame's time is **capped** (`frameDelta`, 0.25 s): a background tab stops receiving frames, and
coming back to it delivers a gap of several seconds that the clock would faithfully catch up — that
is, a scene leaping half a minute the moment you look at it. The cap is a pure, tested function,
because it is the only arithmetic of the loop verifiable without a browser.

## What this ADR does not decide

- **The prefab**: still deferred (ADR-0026 §7). Dragging an Object into Project stays refused, with
  its reason.
- **A list control** for `array` (§1).
- **Values edited in the node itself**: a node shows its ports; its `params` are edited in the
  Inspector. A field inside a scaled SVG is a separate decision.
- **Stepping, playback speed, "play from here"**: ADR-0029 leaves them open and nothing here closes
  them.
- **Keyboard input during Play**: `Input` exists and nothing feeds it from the DOM, because no
  standard node reads it yet. The day an `On Key` node exists, it is one listener in the Viewport and
  one row in the catalogue.

## Consequences

### Positive

- A reference is seen and chosen: `Sprite.source` stops being an opaque identifier.
- Reordering a property cost **no** new operation, no inverse, no handler.
- Typing `multiply`, `float` or `event` answers first time, and the ranking is tested under Node.
- The canvas reads in colour with six hues instead of twenty.
- `Stop` really restores, and the rendered scene is the same instance: nothing to rebind.

### Negative

- Moving a property recreates the reactive record (§2). Documented, and it is the condition that
  would one day justify `MOVE_PROPERTY`.
- Two menu modes to maintain (§3): `browse` and flat. Accepted — a three-entry menu that opened on
  its categories would be one step too many for nothing.
- The palette (§4) adds two hues to the theme. Bounded, named by role, and reused by the two systems
  that needed them.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A text field for a `ResourceId`** | It invites overwriting a reference you cannot read back |
| **`MOVE_PROPERTY`** | Two existing operations already carry the descriptor and the rank |
| **Keeping `label.includes()` and lengthening the menu** | `float` does not find `Number`, and twenty entries are not browsable |
| **One colour per node category** | Twenty colours, none of them learned, and an unreadable canvas |
| **A second Runtime for Play** | It destroys the product's promise: editing while it runs (ADR-0029 §1) |
| **`deserializeScene()` for `Stop`** | A new `Scene` forces every window to be rebound — the copy ADR-0029 refuses |
| **An animation loop inside the transport** | A second loop to keep in step with the Viewport's |
