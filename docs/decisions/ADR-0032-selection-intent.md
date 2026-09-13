# ADR-0032 — There is a single subject, and a selection intent is announced instead of propagated

- **Status:** **accepted** (2026-08-19)
- **Decides:** how a panel says "this is what the creator is looking at", and what guarantees that
  only one panel says it at a time
- **Depends on:** ADR-0006 (Web Components, no window knows the others), ADR-0011 (authority and
  anti-echo), ADR-0017 (selection belongs to the Editor), ADR-0020 (Resources), ADR-0025 (the
  Workspace owns the selected resource), ADR-0027 (a selected node is a `.px` selection)
- **Amends:** ADR-0017 §4 (Object selection was not the only subject; there are three), and the echo
  routine in `editor.js`

---

## Observed context

The Editor has **three subjects** — an Object, a Resource, a graph node — and **two holders**:
`Selection` (ADR-0017) and `Workspace.selectedId` (ADR-0025). Neither is redundant: object selection
is not replicated and has no lifecycle, while the selected resource does have one (it can be
deleted, closed, renamed). What was missing is what **links** them.

Lacking that link, `editor.js` propagated every change to the other holder, with a `routing` flag to
cut the echo. Three measured defects, all from the same gesture:

| Finding | Cause |
|---|---|
| Clicking empty space in the scene did not deselect the Project's resource | `Selection.set(null)` **emits nothing** when the selection was already empty: the echo never leaves |
| `hierarchy.js` and `project.js` clear **both** holders by hand | each window had to discover on its own that the echo was not enough — and the Viewport never discovered it |
| The `routing` flag has to be true for exactly one round trip | a guard that depends on the order in which observers are called |

The flag was not badly written: it answered the wrong question. An echo exists when a change has to
**cross** a system; here the two holders respond to a single gesture by the creator, and that gesture
can be announced once, upstream, instead of being reconstructed afterwards from its consequences.

---

## Decision

### 1. An intent is announced, it is not inferred

**SETTLED.** `editor/subject.js` carries the only vocabulary a window needs:

```js
subject.object(object)     // "the creator is working on this Object"
subject.resource(id)       // "… on this Resource"
subject.clear()            // "… on nothing"
```

A window calls **one** of those three methods. It does not have to know a second holder exists, nor
clear it, nor check what it contains — which is exactly ADR-0006's constraint: no window knows the
others.

### 2. `Subject` is a router, never a third holder

**SETTLED, and it is the important half of the decision.**

It stores no value. `Selection` stays the source of truth for the Object, the `Workspace` stays the
one for the Resource, and the views keep observing whichever concerns them — nothing to rewire, no
duplicated notification.

A third holder would have been one more state to keep in step with two others, for an idea that has
no data of its own: "what is the subject" is **read** from the two holders, it is not stored.

> **The invariant, and it is testable without a browser:** after any `Subject` method, **at most one**
> of the two holders is non-empty.

### 3. Reentrancy is bounded by the gesture, not by a round trip

**SETTLED.** `Subject` applies its two writes under a reentrancy guard. The difference from the flag
it replaces is that it no longer protects against an **echo** — there is none any more, since nobody
re-propagates — but against an **observer that reacts by selecting something else**: deleting an
object from a panel that listens to the selection, for instance. The first gesture wins, the
following ones are ignored until it has finished.

It is not the same guard as ADR-0011's: that one tells a local intent from a replicated operation,
while this one orders two writes of a single gesture.

### 4. Clearing is an intent like any other

**SETTLED.** That was the bug, and this is the rule that closes it: `subject.clear()` writes into both
holders **unconditionally**. That one of them was already empty was never a reason to leave the other
full.

The click in empty space — the scene, the Project's grid, the space below the tree — therefore calls
`subject.clear()`, and all three panels answer the same gesture with the same effect.

### 5. Selecting a node stays a `.px` selection

**SETTLED, unchanged (ADR-0027 §10).** A selected node means "the Component is what you are working
on", so it is `subject.resource(definition.type)`. The Graph window keeps its own node selection for
moving and deleting: that is view state, not a subject.

---

## What this ADR does not decide

- **Multiple selection.** ADR-0017 §4 leaves it open and nothing here closes it: `Subject` takes one
  Object, and the day it takes several, that will be a decision about what "the selected object"
  means for each consumer.
- **Selecting a Component of an Object** as a subject in its own right: the Inspector already shows
  the selected object's Components, and nothing asks for a fourth subject.
- **Replicating the selection** between two creators: ADR-0017 rules it out, and that is not
  reopened.

---

## Consequences

### Positive

- A click in empty space means the same thing in all four windows.
- The `routing` flag disappears, and with it the dependency on observer ordering.
- A new window has only one vocabulary to learn, and cannot forget the second holder: it does not see
  it.
- The "at most one subject" invariant is a test under Node, not an inspection by eye.

### Negative

- One more indirection between a window and `Selection`. Bounded: three methods, no state.
- Direct calls to `selection.set()` remain possible from code that *reads* the selection. That is
  accepted — `Selection` is still the read API — and it is what the invariant test watches.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping the echo and making `Selection.set(null)` emit even when empty** | A notification matching no change, sent to every view on every click in empty space |
| **Merging the two holders into one** | An Object and a Resource have neither the same lifecycle nor the same observers; ADR-0017 and ADR-0025 separated them for good reasons |
| **A third holder that owns "the subject"** | Three states to keep in step for an idea that is readable from the other two |
| **Letting each window clear both** | That is the starting state: two windows had found it, one had not, and nothing said so |
