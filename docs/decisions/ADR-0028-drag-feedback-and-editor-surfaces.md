# ADR-0028 — Live reflow belongs to flat lists, never to the tree; the Graph stays inside the stage

- **Status:** **accepted** (2026-08-18)
- **Depends on:** ADR-0006 (Web Components), ADR-0018 (structural order), ADR-0019 (structural Operations), ADR-0024 (Undo/Redo), ADR-0026 (cross-cutting drag and drop)
- **Amends:** ADR-0026 §6 (drop feedback was not described), and the unwritten decision carried by a comment in `windows/hierarchy.js`

## Observed context

`windows/hierarchy.js` carried, in a comment, a decision that was never recorded in an ADR:

> *"The row being carried stays in place and goes quiet: a list that reflows under the pointer is a
> list you cannot aim at."*

It was right — for a tree — and wrong everywhere else, and nothing said which of the two situations
you were looking at. A decision of that weight cannot live in an implementation comment: it is
invisible from the other windows, which then inherited a static feedback without anyone having
decided.

Three measured facts motivated the revision:

| Finding | Where |
|---|---|
| `legacy/editor/misc/sorter.js` did reorganize the list **under** the pointer (`dragEnter` → `insertBefore`) | Legacy, and it was its best gesture |
| The Editor shows only a 2 px line, identical whatever the list | Hierarchy, Inspector, Project |
| The drop geometry is already pure and tested (`windows/drop.js`) | Nothing to rewrite to change the feedback |

Legacy proves the ergonomics; its architecture is not to be copied (HTML5 Drag & Drop, mutating the
real DOM during `dragenter`, static state shared between windows).

## Decision

### 1. Two feedbacks, and it is the **shape of the collection** that chooses

**SETTLED.**

| Collection | Feedback | Why |
|---|---|---|
| **A flat list** — Components, a `.px`'s properties, Project tiles | **Live reflow**: the element follows the pointer, the others reorganize before the drop | One question — *at which rank?* — and the answer is visible exactly where it will apply |
| **A tree** — Hierarchy | **No reflow**: the carried row fades, an indicator says *before / into / after* | Two questions — *which parent?* **and** *which rank?* — and a list that moves shifts the target while you are aiming |

This is not an aesthetic preference: in a tree, dropping *into* changes the parent, and therefore
the object's place in the world (ADR-0022). A target that slips away during the gesture makes that
mistake easy and expensive. In a flat list there is no "into": the only risk is a neighbouring rank,
correctable by one pixel.

### 2. The preview never touches the model

**SETTLED.** It is **pure and reversible**:

- no `setProperty`, no Operation, no history entry during the gesture;
- the previewed order is **derived** from the real order and a candidate rank, never stored;
- cancelling the gesture (Esc, `pointercancel`, a refused drop) restores the real order without
  undoing anything — there is nothing to undo;
- **one** Operation is produced, at the drop, exactly as today.

It is the same boundary ADR-0026 draws between `rules.js` (what a drop means) and the windows (the
DOM): feedback is a view, not a mutation.

### 3. A possible drop is **seen**, and so is a refused one

**SETTLED.** Everywhere — Project, Hierarchy, Inspector, Graph, a property that accepts a resource:

- the zone that accepts carries an explicit `drag-over` state;
- a refused target is marked as refused, not left silent;
- the cursor follows the same convention (`grab` / `grabbing` / `copy` / `no-drop`);
- `rules.describe()` already provides the refusal's sentence (ADR-0026 §6): it is displayed, not
  guessed.

"Nothing happened" remains the worst answer to a gesture.

### 4. The Graph stays inside the **stage**

**SETTLED.** The current `stage-tabs` is kept: the viewport and the Graph swap in the centre.

The stage means *"what the creator is editing"*, and a node editor needs surface area. The bottom
strip — Timeline — is a temporal track: putting it in competition with a graph would give 200 px of
height to a canvas you traverse in two dimensions.

**What this decision does not close.** `px-graph` knows neither its size nor its place: it attaches
to a definition and draws itself. The day a resizable panel system exists, moving it will be a change
to `editor.js` and `layout.js`, and to no other file. The decision is therefore reversible by
construction, and that is what makes it acceptable now.

## What this ADR does not decide

- **The transport's semantics** — Play / Pause / Stop: ADR-0029.
- **The prefab**: still deferred (ADR-0026 §7).
- **A docking system**: nothing here designs one; §4 merely refrains from preventing it.

## Consequences

### Positive

- The rule is written once and holds for every future list; `hierarchy.js`'s comment now points
  here instead of deciding on its own.
- The reflow cannot corrupt the model: it does not reach it.
- A creator sees where their element will land before releasing, in the lists where that is the only
  question being asked.

### Negative

- Two feedbacks to maintain instead of one. Accepted: they answer two different questions, and
  conflating them is precisely what made the tree hard to aim at.
- The reflow requires measuring the ranks before the gesture and keeping them up to date during it:
  a computation cost per pointer move, bounded by the number of visible elements.
