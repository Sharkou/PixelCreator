# ADR-0038 — The pointer exists in two spaces, and it is the viewport that fills in the second

- **Status:** **accepted** (2026-08-27)
- **Decides:** which pointer coordinates a `.px` graph reads, and who computes them
- **Depends on:** ADR-0013 (camera and viewport), ADR-0014 (input is passed into the runtime), ADR-0027 (the node catalogue)
- **Amends:** ADR-0014 §2 — the "the pointer position in world coordinates" line of its rejected alternatives

---

## Observed context

ADR-0014 gave the pointer a place in `InputState` and settled its space:

> The pointer position is **in screen space**. Converting it to world coordinates is the camera's job
> (`screenToWorld`, ADR-0013) […] freezing it into the input state would make it depend on how you
> are looking at the scene.

**Measured before writing a line:** `movePointer()`, `pointerX` and `pointerY` have **no reader** in
the repository. A `grep` over `src/` finds them only where they are defined. The decision of
2026-08-12 therefore fixed a coordinate space **before** anything had to read it, and this slice is
the first consumer.

And that first consumer cannot use it:

| What a node would read | What it could do with it |
|---|---|
| `pointerX = 400`, `pointerY = 300` | nothing — it is the centre of a surface whose size it does not know |
| to derive the world from it | it would need the camera, the zoom, the pan and the viewport |

And the step context carries **neither a camera nor a viewport**, deliberately: `Runtime.step()`
receives `time`, `deltaTime`, `scene`, `runtime` and `input`. Adding the view to it would make the
simulation depend on how you are looking at it — exactly what ADR-0014 protects, and what would break
headless execution.

The path was therefore closed at both ends: the node cannot convert, and it cannot be given what it
would take to convert.

---

## Decision

### 1. The two spaces coexist; neither replaces the other

**SETTLED.** `InputState` keeps `movePointer()` / `pointerX` / `pointerY` **unchanged**, in screen
space, and gains `movePointerInWorld()` / `pointerWorldX` / `pointerWorldY`.

They are not two views of one datum:

```
screen   "where the pointer is on the surface"   a raw device fact
world    "what the pointer designates"           a game fact
```

**No arithmetic links the two inside `InputState`**, and none could: the correspondence belongs to a
viewport that file must never know about. ADR-0014's objection — "do not freeze the conversion into
the input state" — is therefore honoured: nothing is converted there. What is **written** there is a
result, by whoever had the means to compute it.

### 2. The node reads the world, because it is the only one of the two that is playable

**SETTLED.** `input.pointer` outputs `x` and `y` in world coordinates.

A `.px` must be able to aim, to follow, to place something where you clicked. All those sentences
speak about the scene. None speaks about pixels.

> **What it costs, and why it is the right price.** The written value depends on the camera at the
> moment it was written. That was ADR-0014's objection to this path — and it is the **very content**
> of the datum: "what the player is aiming at" means nothing without the point of view they were
> aiming from. The fact is not polluted by the camera, it is constituted by it.

### 3. For a server, it is the world that is transportable — not the screen

**SETTLED, and it is what reverses ADR-0014's argument.**

| What the client sends | What the server can do with it |
|---|---|
| "the mouse was at (400, 300)" | nothing, without knowing the client's window and camera |
| "the player was aiming at (120, −45)" | validate, simulate, reconcile |

Only the client owns a viewport. It is therefore **the client's** job to resolve the aim, and the
server's to receive the resolved aim. Requiring screen space on the wire would force the server to
replicate every client's camera to interpret anything — that is, to bring the point of view into the
authoritative simulation, precisely what we wanted to avoid.

### 4. The conversion lives in the viewport, and it is pure

**SETTLED.** `editor/viewport/surface.js` gains `locatePointer()`, which states the whole chain in one
readable place:

```
PointerEvent.clientX/Y  →  the surface's top-left corner  →  device pixels  →  screenToWorld
```

It is **pure**, and therefore checked under Node against the very matrices the renderer draws with —
pan, zoom, the surface's offset in the page, and the device/CSS ratio. It is the only part of the
pointer's path that can be wrong without any screenshot showing it.

`Viewport.locate()` exposes it; `PointerInput` calls it and **does no computation**.

### 5. What goes out to the Runtime is in CSS pixels and world units, never in device pixels

**SETTLED.** The "device pixels" step is a fact about the canvas's backing store, not about the game.
A `.px` must read the same numbers on a Retina screen and on an ordinary one, otherwise a game would
behave differently depending on which machine is editing it.

### 6. The pointer is indexed by owner like everything else

**SETTLED.** The world position lives on `InputState`, so `input.of(owner)` already separates it by
player, with not one line more. The browser has one mouse today; that is no reason for the model to
have only one (ADR-0014 §3).

### 7. The buttons gain no semantics

**SETTLED.** `isButtonDown()`, `buttonPressed()` and `buttonReleased()` already exist, bounded to the
same single step by the same `commit()` (ADR-0014 §5). `input.pointerButton` exposes them under the
same three words as `input.key`.

What the `.px` **stores**, however, is a **name** — `"left"`, `"middle"`, `"right"` — and not the
index. `InputState` indexes by number because that is what every platform reports, but a `.px` is a
file that outlives the platform that wrote it: it therefore carries a name, as `input.key` carries
`"Space"`, and for the reason ADR-0014 §2 already gives. There are not two numberings for all that —
**the position in the list of names IS the index**, so one list, read from both ends.

> **Measured in the Editor, and it is what settled it.** A first version stored the index with
> `labels`. The canvas's Choice control converts its value to a string before looking up its label
> (`ui/field.js`, `String(next ?? '')`), so `0` did not find `Left` and the node displayed `0`. Named
> values are the shape that control already knows how to render — and, independently of it, the
> better of the two for the format.

---

## What is not decided here

- **"Game focus".** It has not been necessary: the adapter listens on the game's surface, so a press
  in the Inspector never reaches it. The day the game occupies more than one surface, or a shared
  one, the question will have to be asked properly.
- **Delta and wheel.** `InputState` has none, and nothing asks for them yet.
- **Multitouch.** A single pointer is tracked; `pointerId` is ignored.

---

## Observable contracts

| Contract | Verifiable by |
|---|---|
| A page coordinate is not a world coordinate | a surface offset in the page |
| Pan and zoom compose | a camera both moved **and** zoomed |
| The device ratio changes no game coordinate | the same click, two backing stores |
| The two spaces are independent | writing one does not move the other |
| A graph reads the world, never the screen | writing the screen alone moves nothing |
| A press outside the surface is not a game click | a `pointerup` alone, on the window |
| A release outside the surface ends the press | a `pointerdown` on the surface, a `pointerup` on the window |

---

## Consequences

### Positive

- A `.px` can aim, follow and click inside the scene, knowing nothing about the camera.
- The Runtime stays free of the DOM, of `PointerEvent` and of the viewport; headless is intact.
- The conversion is tested against the real matrices, outside a browser.
- `pointerX` / `pointerY` stop being a dead API without their contract moving.
- The server path is opened by the same datum, with no second format.

### Negative

- Two positions instead of one, and therefore two things an adapter has to remember to write.
- The world position is dated by the camera that produced it. A recording replayed under another
  camera replays the aim, not the pixels — which is intended, and worth knowing.
- ADR-0014 §2 now reads with this amendment beside it.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping the screen alone, and converting in the graph** | The node would need the camera and the viewport, and therefore bringing them into the simulation step. |
| **Putting the view into the step context** | The simulation would depend on how you look at it; headless would have nothing to put there. |
| **Replacing the screen with the world** | It would destroy the raw device fact, the only one useful to a future drawn cursor or a screen UI. |
| **Converting inside `InputState`** | It would need a camera; that is exactly what ADR-0014 §2 refuses, and rightly. |
| **A `Screen To World` node with a camera input** | It defers the problem: the node would still need a viewport, which the graph does not have. |
| **Having the adapter carry the conversion** | Pan, zoom and the device ratio belong to the Viewport; a second copy of that arithmetic is a second chance to diverge. |
| **A global pointer outside `InputState`** | A singleton, and the end of indexing by owner (ADR-0014 §3). |
| **Storing the button index inside the `.px`** | It makes a file depend on a platform's numbering, and the Choice control cannot display a non-textual value. |
