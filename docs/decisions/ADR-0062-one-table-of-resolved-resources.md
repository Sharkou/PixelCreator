# ADR-0062 — One table of resolved resources, and the backend answers with pixels

- **Status:** **accepted** (2026-09-12)
- **Decides:** who turns a `ResourceId` into a decoded image; what `drawImage()` receives; where the cache lives; what a Sprite measures; how an animation is described; where a clip lives; why there is no `flipX`
- **Depends on:** ADR-0004 (optional capabilities), ADR-0005 (rendering goes through an abstraction), ADR-0007 (schema), ADR-0012 (isolation), ADR-0020 (Resource, asynchronous store), ADR-0021 (the identity of a definition), ADR-0026 §1 (a resource carries its content), ADR-0050 (a flip is a rotation out of the plane), ADR-0060 §5 (sound is an output built with a resolver), ADR-0061 §4 (definitions are resolved before the simulation)
- **Amends:** ADR-0061 §4 — `PrefabRegistry` becomes `ResourceRegistry`, one table for every kind of definition
- **Does not decide:** the free-rectangle atlas, per-frame pivot, per-frame duration, Aseprite import, bones, font loading — see §6

---

## 1. Problem

Three things missing, and the first was a **hole** rather than an absent feature:

```
Sprite.source = ResourceId        ← what a creator picks
Sprite.image  = null              ← what rendering reads
                                  ← and nothing, anywhere, connected the two
```

A `grep` for `new Image|createImageBitmap|\.image =` found nothing but the initialisation to
`null`. **A Sprite has never drawn anything, in any build.** The Component was not at fault: the
half that resolves was missing.

The other two followed: no image, no animation; and an animation would have brought an
`AnimationRegistry` alongside the `PrefabRegistry`, then a third, then a fourth.

---

## 2. The backend answers with pixels; the model carries nothing but an identity

> **`drawImage(source, …)` receives a `ResourceId`. The backend resolves it.**

This is the third application of one seam, not a third seam:

| | resolved by | filled by | read | value held |
|---|---|---|---|---|
| sound | `AudioOutput` built with a resolver | the application | `play(clip)` | `HTMLAudioElement` |
| prefab / animation | `ResourceRegistry` | `loadDefinitions()` | `ctx.resources.get(id)` | data |
| **image** | **`ImageCache` built with a resolver** | the application | `drawImage(id, …)` | `ImageBitmap` |

**Why the backend and not the Component.** An `ImageBitmap` is a Canvas 2D value; a WebGL backend
would hold a GL texture. Putting either one in `Sprite.image` meant putting a
**non-serialisable, backend-specific** value into the model. Giving the identity to the backend
keeps a Sprite exactly what the format writes.

**Decoding is asynchronous, drawing is not.** `get(id)` answers with what is decoded **at that
instant** — the image, or `null` — and starts the decode on first request. A frame that arrives
before the image draws nothing and the next one draws. Nothing waits, nothing blocks, and
`draw()` touches no storage.

**`preload()` exists for whoever CAN wait.** Opening a bundle and pressing Play are two moments
where waiting is allowed and where a first frame full of holes is not. Everything imported
afterwards arrives through `get()`, one frame later and with no wait.

**The image resolver may be asynchronous, the sound one may not**, and the difference is real: a
sound starts **from a step** and has to answer immediately, whereas an image is decoded off the
frame path anyway. The Editor therefore passes `project.read` itself and copies no payload.

**A host with no image API is not a breakdown.** No `createImageBitmap`, no `Image`: every
`get()` answers `null`, the simulation is identical and nothing is drawn — the sentence
`SilentAudio` already says for sound.

### What the cache guarantees

| Case | Answer |
|---|---|
| a hundred Sprites on one image | **one** decode |
| resource missing | remembered missing; the project is not re-read sixty times a second |
| unreadable image | failure remembered, tried **once**, nothing is thrown (ADR-0012) |
| payload replaced | `invalidate(id)`; the `revision` is what triggers it (ADR-0020 §7) |
| invalidated during a decode | the image that finishes belongs to nobody: it is closed |
| `clear()` | everything is released (`ImageBitmap.close()`) |

---

## 3. One truth about size: `0` means "the image's own"

`Sprite.width` / `height` defaulted to `0` and `0` meant **invisible** — so a Sprite added from
the menu drew nothing even once the image resolved, and the drop rule invented a `64 × 64` that
was true of no image at all.

> **Zero means "the size of the image", not "nothing".**

| Declared | Drawn |
|---|---|
| both | exactly that — an image stretched on purpose |
| **one only** | that one, the other **in proportion to what is actually drawn** |
| neither | the frame, or the whole image |
| not yet decoded | nothing this frame, and the next one draws |

**The proportion comes from the FRAME, not the sheet.** A 320 × 32 strip holding ten 32 × 32
frames is ten squares; scaling one of them by the strip's ratio would make a character ten times
too wide.

**`imageSize(source)` is an operation of the rendering contract**, and it is legitimate where
`measureText` was not (ADR-0060 §3): the size of an image is a **fact about the resource**,
identical in every backend, whereas a text metric depends on who rasterises it. `bounds()` reads
the last size actually drawn; an Object never drawn reports nothing, and picking falls back to
the handle square it already gives an Object with no geometry.

---

## 4. An animation is a Resource, and its rectangle is a pure function

```js
Walk.animation
{ version: 1, source, frameWidth, frameHeight, count, columns, first, fps, loop }
```

**A Resource, not a field per instance.** Ten enemies playing `Walk` name a clip; retiming it
retimes them all, and an instance carries a `ResourceId` instead of a copy. It is ADR-0026 §1's
argument for a `.px` and ADR-0061's for a prefab.

**`columns` is DECLARED, never measured**, and that is what makes `frameAt()` pure. Deriving it
from the decoded sheet's width would make a frame rectangle depend on the state of a decode —
the same frame would be two rectangles before and after the image arrived — and would put the
renderer inside a Core function. The shape of a sheet is a fact its author knows.

**The playhead is in SECONDS, never a frame index.** The same elapsed time gives the same frame
at 30 and at 144 frames per second, because the division is done once rather than accumulated
sixty times a second as a rounded index. That is what makes an animation part of the
deterministic simulation rather than a decoration laid on top of it.

**Read then advance, never the other way round.** Advancing first means showing frame 1 on the
very first step: the opening frame of every animation is never seen. The frame shown is the one
for the time the simulation **is** at; the clock moves afterwards.

### `SpriteAnimator`, and not twenty more fields on `Sprite`

A Sprite answers "which image, what size"; an animator answers "which frame, and when". Two
questions, two lifetimes, two Components — and an Object that wants both says so by carrying
both. The animator writes `Sprite.source` **and** `Sprite.frame`: the clip names its own sheet,
so the two cannot disagree.

### One node, and it exists for the one thing `Set Property` cannot say

`SpriteAnimator.clip` is an ordinary `resource` property, so picking an animation is already
`Set Property` — and by ADR-0060 §6's reasoning that should have been enough. It is not, for a
reason a creator meets within a minute: **writing the same value twice is a no-op**, so "replay
the attack" would do nothing at all. Restarting is a **moment**, and a moment is a node.

`Animation Finished` is a **question**, asked from `On Update`, not an event: an input node runs
on every update (`interpreter.js`), so a one-shot event would need memory per node and per
instance — the second kind of state ADR-0058 deliberately does not have.

### A clip is born from a sheet, because it can be born from nothing else

The Project panel's `+` offers `Animation…`, **next to `Image…` and through the same
mechanism**: the row declares that it needs a file, the panel asks for it, and the row makes
**two** resources — the imported sheet and the clip that names it.

| Decision | Reason |
|---|---|
| the row **picks an image** | a clip with no sheet names no frame. A menu entry that creates an inert resource is exactly the "menu that opens nothing" `project/commands.js` has refused since ADR-0025 |
| the grid is **read from the file header** | `project/image.js` already knows how to answer "how many pixels" without decoding; a strip of squares is the shape of every sheet exported by Aseprite or Piskel |
| a silent header gives 32 x 32, one frame | visibly wrong from the first read, rather than invisibly wrong forever |
| **two resources, two undos** | these are two `add` intentions; merging them would be deciding what a gesture is, and that is not this row's decision |

The Inspector then says what a clip **is** — its sheet by name, its grid, its speed, its loop —
read-only, like everything that is not the name (§ at the top of
`editor/inspector/resource.js`).

```
BLOCKED: setting a clip's grid in the Editor
Reason: the contract that makes a resource PAYLOAD editable from the Inspector is missing.
        Today only a `.px` is, and only because the Workspace attaches a LIVE MODEL to it
        (`editor/project/definitions.js`) whose every field is reactive and whose every write
        goes through that resource's pipeline — which is what gives the per-resource undo of
        ADR-0024. An animation has no model of that kind, and inventing one for four numbers
        would amount to writing half an animation editor without deciding the other half
        (§6: timeline, preview, slicing).
        What ships in the meantime: the grid guessed at creation, and `saveAnimation()` in the
        Project layer for whoever writes it through the API.
```

---

## 5. No `flipX`, and that is not an oversight

ADR-0050 **removed** `flipX`/`flipY` by showing that an orthographic projection makes a rotation
around the vertical axis **exactly** a horizontal scale by `cos θ`. `Transform.rotationY = 180°`
is therefore an exact mirror, already serialised, already tested, already in the Inspector — and
it can say `45` where a boolean can only say "facing away".

The rendering contract therefore has `clip` (what a sheet requires) and **nothing** for
mirroring.

---

## 6. What this ADR does not decide

| Open point | Why |
|---|---|
| **Free-rectangle atlas** | A regular grid is the shape of every tutorial sheet; an atlas is a pipeline, and a pipeline is a product |
| **Per-frame pivot / duration / trim** | Each one is a decision about that pipeline |
| **Aseprite import, bones, skeletons** | The same, on a larger scale |
| **Mipmaps, filtering, texture atlases** | Rendering optimisations; nothing asks for them yet |
| **An animation editor in the Editor** | A clip is **created** from the Project panel (§4) and can be inspected; **setting** it needs a timeline and a live resource model — see §4's `BLOCKED`, and ADR-0026, which already files the timeline among the windows that have not been designed |
| **Font loading** | ADR-0060 §8, unchanged |

---

## 7. Counter-tests

| Verified | Where |
|---|---|
| An image is requested synchronously and arrives one turn later | `runtime/rendering/images.test.js` |
| A hundred requests, one decode | the same |
| Resource missing: read **once**, never sixty times a second | the same |
| Unreadable image: failed once, nothing is thrown | the same |
| Invalidation: re-read, and the old image is closed | the same |
| **Counter-test**: with no invalidation, the old pixels stay | the same |
| `preload()` counts what is usable | the same |
| Asynchronous resolver (the Editor's path) | the same |
| Host with no image API: nothing, and nothing breaks | the same |
| The backend receives the identity and draws what it resolved | the same |
| `clip` draws a rectangle of the sheet | the same |
| Image not yet arrived: nothing is drawn | the same |
| Natural size, one dimension given, neither | the same |
| A spawned prefab shows its image on the frame it appears | the same |
| Frame grid, `first`, plain strip, clip with no cell | `runtime/rendering/components/sprite-animator.test.js` |
| Unknown version refused | the same |
| Loop, no loop, `fps: 0` | the same |
| The same elapsed time at two step sizes | the same |
| Pause, speed, clip change, clip deleted | the same |
| Animator with no Sprite, Runtime with no resources | the same |
| The playhead never reaches the format | the same |
| `Play Animation` restarts what `Set Property` would not | the same |
| `Animation Finished` on an Object with no animator | the same |
| A clip is created from a sheet, and the grid comes from the header | `editor/project/commands.test.js` |
| The sheet is imported with it, byte for byte | the same |
| An unreadable header still gives a playable clip | the same |
| The row refuses to invent a sheet | the same |
| **Counter-test**: two resources are two undos, and it is said | the same |
| The Inspector names the sheet, the grid, the speed, the loop | `editor/inspector/resource.test.js` |
| A deleted sheet is called "Missing", never an identifier | the same |
| A prefab says how many Objects it would make | the same |

---

## 8. Consequences

### Positive

- **A Sprite draws.** The repository's oldest hole is closed.
- One table of resolved definitions, one loader, one less boundary to maintain.
- A Sprite's size has a single truth and a useful default.
- A shared animation is a shared Resource.
- The Core still knows nothing of the DOM, of storage, or of a decoder.

### Negative

- `RENDERER_OPERATIONS` gains `imageSize`, and `drawImage` changes its first argument: every
  backend and every test double has to follow.
- `PrefabRegistry` is renamed `ResourceRegistry` and `Runtime({ prefabs })` becomes
  `Runtime({ resources })` — six weeks later it would have cost more.
- `bounds()` on a Sprite never drawn answers `null`; picking falls back to the handle square,
  which is correct and visible.
- `columns` is a field a creator has to fill in, where measuring would have looked automatic.
