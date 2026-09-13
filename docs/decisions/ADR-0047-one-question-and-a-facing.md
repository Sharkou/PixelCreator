# ADR-0047 — One question, and a facing

- **Status:** **accepted** (2026-08-29)
- **Amended by:** ADR-0048 (2026-08-31) — §2: the refusal of the Component → graph gesture is confirmed by measuring the competing gesture rather than by reasoning about a dead value.
- **Amended by:** ADR-0055 (2026-09-07) — §4 is **replaced**: four parts of control to one part of air produced a third right edge that lined up with nothing; a lone control takes back ADR-0046 §7's two cells.
- **Amended by:** ADR-0050 (2026-08-31) — §3 is **replaced**: `flipX` / `flipY` disappear in favour of `rotationX` / `rotationY`, two numbers in degrees. §3's reasoning (a facing is not a negative scale) stays true; what was wrong was answering it with a boolean.
- **Amended by:** ADR-0052 (2026-08-31) — §2: the refusal of the Component → node gesture is lifted. The premise changed — the picker has levels, so a release can open a question instead of writing an answer.
- **Decides:** how many fields name a property in a node; what a Component released on a graph means; how a 2D object says which way it is facing; what a lone control on its row measures
- **Depends on:** ADR-0002 (spaces), ADR-0007 (schema, `hidden`), ADR-0023 §2 (no vector type), ADR-0034 §3.3 (the scope of a reference), ADR-0039 (taxonomy), ADR-0040 (one node per intention), ADR-0043 (the Object answers for itself), ADR-0045, ADR-0046
- **Amends:** ADR-0045 §1 (the `Component` field disappears, the question stays), §2 (the output keeps its name, and so does the `Value` input); ADR-0046 §3 (the Component → node gesture is withdrawn), §7 (a lone control no longer takes the full width)
- **Does not decide:** `On Collision` and the collision event model; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`; the fate of an instance whose `.px` is deleted; a port's unit; the format of a project identifier

---

## 1. A property is one question

ADR-0045 §1 had split "which Component" and "which property" into two fields, for a measured and true
reason: the merged list held every Component in the project and was no longer readable. The split
fixed readability and introduced something else — **a creator thinks "this object's rotation", not
"the Transform Component, and inside it, rotation"**. The second is the engine's decomposition wearing
the creator's clothes.

> **The node asks for the Object, then for the property. The Component is stored and never asked for.**

What actually fixes readability is not a second control, it is a picker that **groups**:

```
  Property ▾
  ┌────────────────────────┐
  │ 🔍 Search property     │
  ├────────────────────────┤
  │ › Object          4  › │
  │ › Camera          1  › │
  │ › Rectangle       6  › │
  │ › Sprite          4  › │
  │ › Transform       7  › │
  └────────────────────────┘
            → enters, ← leaves
```

It is **the node picker, without a line more**: `ui/menu.js` already knows how to open on its
categories (`browse`), enter with `→`, leave with `←` while reselecting the one you are leaving
(ADR-0046), and rank across every group as soon as you type — so `rot` finds `Rotation` while showing
`Transform` beside it, **without anyone having chosen a Component first**. There was nothing to build;
there was a list to group.

### 1.1 The value carries both halves, the model keeps two

The picker returns `Transform/rotation`; `paramWrites()` splits it back into the two params the model
has always had. **A composite in the picker is an encoding; a composite in the payload would be a
format** — and the format stays ADR-0040 §2's, so every already-written graph reads back.

The two writes share the same batch: there is no state in which a node names the property of a
Component it is not pointed at, and one `Ctrl Z` puts the pair back.

The Component is marked `hidden` — ADR-0007's word for a parameter that is model and not interface.
`resolvedProperty()` is untouched.

### 1.2 The closed control says the short name

`Transform ▸ Rotation` was tried and **measured**: it does not fit in a 176 px card and truncates to
`Transform ▸ …`, which hides the half that identifies the choice and keeps the half the picker had just
shown as a group heading. The group belongs where you choose.

The same reasoning for `Set Property`'s `Value` port, which displayed `flipY` — the MODEL's name,
beside a picker reading `Flip Y`. The picker above already says which; the port says what it **is**
(ADR-0045 §2, applied to the input as to the output).

---

## 2. A Component is not released on a graph

The gesture was refused, restored, and it is refused a third and final time. The underlying reason
never changed: **what a Component names is a GROUP of properties, and a node wants one**.

It briefly had a field to fill (ADR-0046 §3). Now that one picker asks the whole question, writing
`component` alone places a value the creator does not see and the next click overwrites — the
definition of a dead value, which the refusal should prevent rather than produce.

The refusal names the two gestures that work: drag **the property**, or open the picker, where that
Component is a group to enter.

---

## 3. A facing is not a rotation, and not a negative scale either

The engine is strictly 2D and stays so: `rotation` remains **a scalar**, no third axis is invented,
`Matrix` is untouched. What was missing is the word for the other half of "which way it is facing": a
character turning around is not rotated, it is **mirrored**.

> **`flipX` and `flipY`, two Transform booleans.**

**Not `scaleX < 0`.** Reusing the sign would make one number answer two questions — what size, and
which way round — so a creator who set the scale to 2 and then flipped the object would have to type
`-2` and remember why. The two compose: scale says the size, flip says the facing, the matrix
multiplies them.

**One place becomes geometry.** `localMatrix()` is the seam the renderer, picking and physics all
cross through `worldMatrix()`, so the mirror is composed once and nothing downstream learns a new
word. A mirror IS a negative scale inside the matrix; what the model refuses is making the creator
write it.

| What it touches | What changes |
|---|---|
| Transform | two more booleans in the schema |
| Renderer | **nothing** — it reads `worldMatrix()` |
| Serialization | two booleans, like any declared property |
| Inspector | two switches, short width, with their handle |
| Graph | `Transform ▸ Flip X` / `Flip Y` in the picker |
| Undo, replication | `setProperty`, like any property |
| Hierarchy | a child is mirrored with its parent, by composition |

**No `Flip X` node is added.** `Set Property ▸ Flip X` does it with the node that exists. A node that
TOGGLED would be another intention — see the report.

---

## 4. A lone control on its row does not take the row

ADR-0046 §7 gave the whole column to a wide control. That was too much: a Sprite field ran from edge
to edge while every number above it stopped at 40 %, so the panel had two right margins and no
column.

> **Short: one cell out of two (≈ 40 %). Alone: four parts of control to one part of air (≈ 70 %).**

Long enough for a file name, short enough for the panel to keep a shape. **The handle keeps its own
column**, the same last column where paired rows end, so every handle in the panel is on one vertical
line whatever the row above it is.

---

## 5. Observable contracts

| Contract | Verifiable by |
|---|---|
| A property node has two fields: the Object and the property | `inspector/node.test.js`, and by eye |
| The picker opens on the Components and is navigable by keyboard | by eye, in Chrome |
| Typing ranks across every group, the group staying readable | by eye |
| Choosing writes both params, in a single batch | `node.test.js` |
| What the model holds reads back as the path the control shows | the same |
| A Component released on a graph is refused, with the route to take | `dnd.test.js` |
| A flip mirrors without touching the scale | `transform.test.js` |
| A flip composes through the hierarchy and serializes | the same |
| A short control measures 40 %, a lone control 70 % | measured in Chrome |
