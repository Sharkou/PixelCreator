# ADR-0033 — A node is a sequence of rows, a wire is drawn without being aimed at, and a colour says what flows

- **Status:** **accepted** (2026-08-19)
- **Decides:** a node's geometry, the gestures that carry a wire, and what a hue asserts on the canvas
- **Depends on:** ADR-0006 (Web Components), ADR-0023 (property types), ADR-0024 (Undo/Redo),
  ADR-0027 (the graph model and SVG rendering), ADR-0028 (drop feedback and preview), ADR-0030 (a
  six-hue palette), ADR-0031 (an instance value on a port)
- **Amends:** ADR-0030 §4 (a category gave its hue, including when the node *is* a value), ADR-0028
  §2 (the principle "the preview does not touch the model" had not been applied to the canvas)

---

## Observed context

ADR-0031 gave a port an instance value, and the Editor drew it. Using it produced four findings —
three about geometry, one about interaction, and all of the same kind: **a rendering decision taken
twice, in two places, with nothing saying which one wins.**

| Measured finding | Cause |
|---|---|
| A `Number` node showed its output slot on one line and the value coming out of it on another | a node had **two zones** stacked: the port rows, then a strip of params |
| `Set Property` put the `value` port four pixels away from the field that feeds it | the same cause |
| `Add` drew its field **through** the word "Result", which was reduced to a `t` | a field's width did not account for the labels it does not replace |
| Cutting a wire worked at the edges of the band and not on the stroke | the **visible** stroke is drawn above its own click target |

And a fifth, about vocabulary: a `Number` node carried the green of the `Values` category while its
port carried the blue of `number`. Two colours, one object.

None of these is a pixel adjustment. Each is the symptom of a rendering model that describes a node
as a stack of zones when a creator reads it **row by row**.

---

## Decision

### 1. A node is a sequence of rows, and one rule fills them

**SETTLED.** `editor/graph/view.js` no longer knows "the ports" and "the params" as two lists to
stack. It knows **rows**, each carrying at most one input port, one output port, and one control:

> **A control belongs to the row of the port it edits; a control that edits no port takes the first
> row that has none, and creates one when there are none left.**

That is the whole algebra. What it produces, with not a single special case:

| Node | Rows |
|---|---|
| `Number`, `Boolean`, `Text` | **one** — the field and the output slot, side by side |
| `Get Property` | **one** — the property picker, and the slot carrying its value |
| `Set Property` | flow in / picker / flow out, then the `value` slot **next to** its field |
| `Add` | `A` with its field and `Result`, then `B` with its own |
| `Branch` | flow in / `True`, then the condition next to its checkbox / `False` |

**Why this is more than tidying.** A creator reads a graph by following a value to a slot. When the
value is on one line and the slot on another, the node stops saying **which slot** that value enters
— that is, exactly what a visual language is for. Two stacked zones made that impossible to fix by
moving pixels.

**A control is its row's label**, and a row says one thing once:

- a control that edits a port replaces **that port's label** — the field *is* what the slot carries,
  and `A [0] A` writes the same word twice on a 176 px card;
- a control that edits no port replaces the labels of the ports in **its** row: a `Number` node is a
  field and the slot through which its contents leave.

That rule lives in the **geometry** (`silencedPorts()`), not in the renderer, because the answer
decides two things that must agree: whether a label is drawn, and how much room the field leaves it.
A renderer deciding on its own would end up writing a label inside a field — which is what it was
doing.

### 2. A wire is drawn; what you point at is the target underneath it

**SETTLED.** A wire's visible stroke is now **inert** (`pointer-events: none`).

It is the fix for a defect that read as imprecision and was an inversion: the stroke is drawn
**above** its own wide target, so at the exact spot a creator aims at — the stroke itself — it was
the topmost element. Its events went to the canvas, which read them as a click in empty space.
Cutting a wire worked **only** on the fringe of the band, on either side of the aimed-at stroke.

Two consequences, in the same direction:

- **cutting is a click, not a press.** Cutting on `pointerdown` made a wire disappear under a hand
  that had not finished deciding;
- **strokes are measured on screen** (`vector-effect: non-scaling-stroke`). A 2 px wire inside a
  group scaled to 0.25 is half a pixel of colour, and its 14 px target is three and a half: the more
  a creator zoomed out, the less usable the canvas became, precisely when they were seeing the most
  of it.

### 3. Picking a wire back up destroys nothing before the release — extends ADR-0028 §2

**SETTLED.** Pressing a **connected** input port picks up the wire feeding it, by its other end. It
is the gesture every node editor has, and the only way to move a connection without first destroying
it and hoping to remember where it came from.

ADR-0028 §2 says a preview is pure and reversible; it wrote that for lists, and the canvas had not
been reread in that light. So:

- the old connection **stays in the model** for the whole gesture, drawn as a faded dashed line;
- releasing replaces it in **one** `batch` — moving a connection is **one** `Ctrl Z`, not a deletion
  you have to undo twice (ADR-0024 §4);
- abandoning the gesture undoes nothing, because nothing was written. That is what makes trying
  free.

**A wire released into empty space stays a question** (ADR-0027): the picker opens and offers only
compatible types. A wire that was *picked up* and released into empty space asks the same question,
and its original connection leaves in the same `batch` as the new one.

### 4. A node that **is** a value carries that value's hue — amends ADR-0030 §4

**SETTLED.** ADR-0030 §4 settled that six hues answer two questions — *what is this node* and *what
does this wire carry* — and that the category gives the first. That is right everywhere except for
one category: `Values`.

A `Number` node **is** a number. Giving it the green of `Values` while its port carries the blue of
`number` is the one place in the palette where the same object gets two colours, and it is the place
where the creator learns the vocabulary.

> **The `Values` category gives no hue: a literal node carries the hue of the type it produces.**
> Every other category stays as in ADR-0030 §4.

It is not a convenient exception, it is ADR-0030's rule applied to a case it had not distinguished:
the hue says *what it is*, and for a literal, what it is **is** its type.

**And a wire's preview carries its hue**, plus the product's accent. A wire in flight is the moment a
creator most needs to know what is flowing; coral only said "something is happening".

---

## What this ADR does not decide

- **References to an Object or a Component inside the graph**: that is a **model** problem, not a
  rendering one, and it touches replication. It stays open and deserves its own ADR.
- **Comment nodes, multiple selection, a minimap**: ADR-0027 leaves them open and nothing here
  closes them.
- **Collapsing a node** (hiding its rows): the question only arises for nodes much larger than the
  current catalogue's.
- **An error console**: the strip exists, and what it was missing — being clickable, counting by
  severity — is not a window.

---

## Consequences

### Positive

- `Number`, `Boolean` and `Text` fit on **one** line, with nothing hard-coded for them: the row rule
  produces it.
- `Set Property`'s slot faces the value it receives, and `Get Property`'s faces the property it
  returns.
- Cutting a wire works where you aim, at every zoom level.
- Moving a connection is a reversible gesture and a single history entry.
- A `number` is blue from the field to the wire, by way of the node that carries it.

### Negative

- A row is 22 px instead of 20: a four-port node is eight pixels taller. Accepted — a row has to be
  able to hold a field, and 20 px is not an input box.
- The width reserved for a label (`CONTROL_LABEL_INSET`) is a hand-picked constant, like ADR-0017's
  grab square. It is correct as long as it matches the port labels' font.
- The visible stroke no longer reacts to hover by itself; the target colours it. One CSS rule fewer,
  but it depends on a sibling selector.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping two zones and moving the strip closer to the ports** | The value stays on a different line from its slot; the node still does not say what enters where |
| **A "value node" special case in the renderer** | Three nodes today, ten tomorrow, and a rule nothing can check |
| **Deciding hidden labels in the renderer** | Two opinions on the same question, and the day they differ a label is drawn inside a field |
| **Declaring `label: ''` in the catalogue for value nodes** | The model would lose true information for a display reason; the validator and the tests read those labels |
| **Widening a wire's click target** | The problem was not the width, it was that the aimed-at stroke sat above the target |
| **Disconnecting on press to pick a wire up** | "Release where you grabbed" would become a destructive act |
| **A seventh hue for literals** | One more colour to say what the palette already says |
