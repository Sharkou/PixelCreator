# ADR-0060 — A second drawing space, and a second output

- **Status:** **accepted** (2026-09-11)
- **Decides:** how text is drawn; where the primitive lives; what a HUD is; what shape "do not move with the camera" takes; where sound lives; what an `AudioSource` is; why there is neither a `Stop Sound` node nor a mixer; which text nodes were missing
- **Depends on:** ADR-0004 (a Component's optional capabilities), ADR-0005 (rendering goes through an abstraction), ADR-0007 (schema), ADR-0011 (the server is authoritative), ADR-0013 (the camera is an Object, the viewport is a surface), ADR-0014 (input is passed, never fetched), ADR-0020 (Resource, an asynchronous store), ADR-0023 (a type says what a value *means*), ADR-0026 §6 (a table says what a drop means), ADR-0048 (a property is named the way it is read), ADR-0054 (say what is true)
- **Does not decide:** font loading; layout (line wrapping, paragraphs, vertical alignment); a UI engine; a mixer, buses, effects, spatialized sound — see §8

---

## 1. Problem

Three things were missing between "it plays" and "it looks like a game":

| Missing | Observed consequence |
|---|---|
| **No text** | A score exists in the model and cannot be shown. The only way to display a number was `Log`, in the browser console |
| **No sound** | A shot, a collision and a destruction are seen and not heard |
| **No HUD** | An Object placed at `(20, 20)` is twenty units from the **world**'s origin: it leaves the screen as soon as the camera moves |

All three are fixed together because the first two are useless without the third — a score that
wanders off with the scenery is not a score.

---

## 2. A HUD is a **space**, not a window

`ScreenSpace` is a Component. An Object carrying one is drawn through the **surface** instead of the
camera: `(0, 0)` is the top-left corner, one unit is one CSS pixel, and `x = 20, y = 20` stays twenty
pixels from the corner whatever the camera does.

```js
render(scene, { view, screen })     // two matrices, two spaces
```

**Two matrices rather than a matrix and a flag.** The caller knows one thing the `SceneRenderer` does
not: on a 2× screen, the density scale sits **above both**. Passing the identity for screen space
would draw the HUD at half size, and only on those screens — the kind of bug you do not see on your
own machine.

**The space is inherited, because a transform is inherited.** `worldMatrix()` already composes a child
through its parent; a child that did not inherit the space would be positioned in screen units and
then drawn through the camera, which is never what anybody wanted. The question walks up the parent
chain — the same chain along which the matrix is composed.

**There is no second draw order.** A HUD goes on top because its `layer` is higher. Sorting screen
objects after world objects would be a second rule a creator can read nowhere in the Inspector.

**And the Editor knows it too.** Picking, the selection outline, the handles, the cursor and dragging
with the mouse all go through `objectMatrix(object, view, screen)`: a HUD label is clicked where it
is, and moves at the pointer's speed even at 200 % zoom. Without that, the Editor would have shown the
HUD in the right place and made it ungrabbable — worse than a limitation, a lie.

### Why not the three other shapes

| Alternative | Why not |
|---|---|
| **`space: World \| Screen` on every renderer** | The same decision written three times (`TextRenderer`, `Sprite`, `RectangleRenderer`), and an Object carrying two renderers could disagree with itself about *where it is*. "Where is this Object drawn" is a question about the **Object** |
| **A `fixed` boolean** | An obscure flag, with no name for what it does, and no room for the second space of the day one is needed |
| **A separate UI camera** | A second camera to keep in step with the viewport, and a new question on every resize: what the HUD follows. The screen already *is* that camera |
| **A DOM UI engine** | A second tree, a second layout system, a second event system, and a published game that can no longer be a single surface. That is an entire product, and it is not designed |

### What `ScreenSpace` does not carry

No field. An **anchor** (`top-left`, `centre`, `bottom-right`) is the first thing asked for, and it is
deliberately absent: the surface's origin already **is** the top-left corner, so an anchor would be a
second coordinate system laid over the one a creator has just learnt. It will come back the day there
is a layout to hook it to.

---

## 3. `fillText` is a primitive of the rendering contract

The Core does not touch the DOM and neither does a Component (ADR-0005). `TextRenderer` calls
`renderer.fillText(text, x, y, { color, alpha, fontSize, fontFamily, align, baseline })`, and only
`canvas2d.js` knows what a canvas is — exactly as for `Sprite`, `Tilemap` and `ParticleSystem`.

**The font travels as two values, never as a CSS shorthand.** `16px sans-serif` means nothing to a
WebGL backend that rasterizes its own glyphs. Composing the string lives in the one file that owns a
canvas.

**There is no `measureText`.** A Component that asked its renderer a **question** would stop being
drawable without one: `bounds()` would answer differently on a canvas, on a server and in a test, so
picking and the outline would depend on who drew last. The extent is therefore **estimated** from the
declaration (`AVERAGE_ADVANCE`), which gives the same number everywhere. It is wrong by a few pixels;
it is wrong **in the same way** on every machine, and that is what matters here.

**One line, not a paragraph.** `fillText` does not break on a newline and this component does not
pretend otherwise. Inventing a line height would be the first half of a text engine nobody has
designed.

### What `TextRenderer` declares

```
Text          string   "Text"
Font Size     number   16
Font Family   string   "sans-serif"
Color         color    #ffffff
Align         choice   Left | Center | Right
Alpha         number   1
```

`fontSize` and not `size`: the Inspector humanizes a name into a label (ADR-0048), so `fontSize` reads
`Font Size` — and `size` would collide with the `Size` row that `width`/`height` already form on a
`Sprite`, where it means something else.

Three alignments and not fifteen typographic options. `start`/`end`, justification, letter spacing and
direction are typography a 2D engine has no layout to apply them to; each is one more line the day
something reads it.

---

## 4. Two nodes bridge what a game *knows* and what it *shows*

`TextRenderer.text` is an ordinary `string` property, so `Set Property` already writes it. What was
missing was **producing** the string: `typesCompatible()` refuses a number on a text port, deliberately
and correctly (ADR-0023 — the type says what a value *means*), so a score had no path to a label.

```
To Text      Value (anything) → Text
Join Text    A (text) + B (text)  → Text
```

**One polymorphic port, and the type system already had it.** `ANY_TYPE` is the *absence* of a
constraint, not a union of shapes: `To Text` therefore costs no new rule in `typesCompatible()` and no
second socket type — which is what `Number To Text` + `Boolean To Text` + `Text To Text` would have
been, three nodes for one act and a creator forced to know which one their wire is asking for.

**Both of `Join Text`'s ports are text, on purpose.** Typing them `any` would make `To Text`
decorative *and* quietly readmit the conversion the system refuses on every other port — a number
would read as text in one place and not the next. The wire a creator has to pull **is** the statement
that they wanted it (ADR-0054).

**Two ports, not N.** Three pieces are two `Join Text`s — which reads left to right exactly like the
sentence. A configurable port count would make this the first node in the catalogue whose **shape**
you have to set before you can wire it.

**And no formatter.** `"Score: {0}"` would be a small language with its syntax, its errors and its
escaping rules, to be learnt before the first label works. Converting and concatenating are the two
acts that language would be made of, and they already have the shape of a graph.

`To Text` answers **empty** for `null`, for `NaN`, for infinities and for an Object handle: an
arithmetic accident does not land on screen, and there is no stable Object name to show —
`Get Property ▸ Object ▸ Name` is the node that answers the question actually being asked.

---

## 5. Sound is an **output**, like rendering

```
AudioOutput
  play(clip, { volume, loop, rate }) -> handle | null
  stop(handle)
  set(handle, { volume, rate })
  unlock()
```

It is the same joint `ADR-0005` draws for rendering, and for the same three reasons: the Core and the
simulation stay DOM-free, a server arbitrating a match builds a Runtime **with no output** and stays
silent, and a test is a twenty-line object literal instead of a simulated browser.

**A clip is a `ResourceId`, and it is the backend that resolves it.** The simulation names what it
wants to hear by identity, exactly as `Sprite.source` names an image: no Blob URL, no element, no byte
ever approaches a serialized value. Turning an identity into something a speaker accepts requires the
project's payloads — knowledge the application owns and the Runtime must not (ADR-0020 §5). The backend
is therefore built **with a resolver**, and the Runtime receives the backend.

**Sound is never an input to the simulation.** A Runtime with no audio output produces exactly the same
state as the same Runtime with one: that is what keeps determinism intact, and why a silent server is
not a broken server.

### The autoplay rule is real, and it is not hidden

Every current browser refuses to make a sound before an interaction. A refused `play()` **rejects its
promise** — so a game starting its music on the first step would simply be silent, with an unhandled
rejection in the console and nothing else to hold on to.

| Case | Handling |
|---|---|
| The refusal | caught, **counted** (`output.blocked`), never swallowed |
| A **held** sound (looping) | remembered, and started by `unlock()` |
| A **one-shot** | abandoned — a gunshot from eight seconds ago is no longer a gunshot |
| `unlock()` | called by the application on the first real key or click |

`unlock()` is in the contract because "has this person clicked" is a fact about a **browser**, not a
state of the game: a graph must never be able to read it.

In the Editor, the gesture that triggers everything is **the Play button itself**, which is the most
honest possible form: the creator clicked, so sound is allowed.

### Why an element and not `AudioContext`

An `HTMLAudioElement` plays the data URL the store already holds, with a volume, a loop and a rate, in
four lines and with no decoding step to schedule. A Web Audio graph buys sample-accurate scheduling,
effects and mixing — three products nobody has designed. The day one of them is, it is a second file
beside `html-audio.js`, and nothing else moves.

**One element per sound, not one per clip.** Two shots in the same second have to overlap, and a
rewound element cuts the first — which is exactly what a shared element does, and exactly what it
sounds like.

---

## 6. `AudioSource` is the **state**, `Play Sound` is the **moment**

A gunshot is a **moment**: it has no state, nothing can change once it is gone, and the node that
fires it is `Play Sound`. A soundtrack is a **state**: on or off, at a volume a fade changes, and it
lives as long as the Object. A state belongs to a Component — the Inspector shows it, the format saves
it, `Set Property` writes it; a moment does not.

```
Audio Source
  Clip     resource<asset, audio/>
  Volume   0 → 1
  Loop     true
  Playing  false
```

**There is therefore no `Play` or `Stop` node for it, and that is the whole design.** `playing` is an
ordinary boolean: starting the music is `Set Property AudioSource.playing = true`, stopping it is the
same node with `false`. A `Play Sound` targeting a Component would be a second way of writing a value
`Set Property` already writes, and the two would contradict each other the first time one was used
while the other was suspended in a `Delay` (ADR-0058).

**And a fade is a `Tween` on `volume`,** for the same reason: the mixer nobody has designed is not
needed to turn music down, because the Property System already animates numbers and the output already
accepts a new volume on a playing sound.

**The component is a reconciler, never a commanded object.** On every step it makes what is sounding
match its values: that is what makes the state after a load, after an undo and after a network
operation identical, because all three end on the same values. Changing the clip or the loop
**replaces** the sound; changing the volume merely adjusts it — the difference between what a sound
*is* and how loud it is.

**One `AudioSource` per Object, and that falls out of the model.** An Object carries at most one
Component of a type (ADR-0004), so an Object needing three sounds does not get three `AudioSource`s:
it fires them with `Play Sound`. The separation is not a taste, it is a consequence.

### `onRemoved(self, ctx)` — a fourth optional capability

A reconciler that stops running leaves the last thing it asked for sounding. But `onDetach(self)` —
which already existed — fires when a **Component leaves an Object**, and destroying an Object removes
nothing from it. What was missing was the event "the Object has left the Scene".

The Core **names** the capability and **raises** the event (`Scene.remove()` already announces it, for
the object and for every descendant); it is the `Runtime` that **calls** it, because it holds the
context a Component would ask for — the audio output, the scene, the time — and because it already
isolates a Component that throws (ADR-0012). A destroyed enemy still humming is the bug this closes.

---

## 7. One more line in the table, and nothing else

"A sound is an `AudioSource`" is the same sentence as "an image is a `Sprite`" (ADR-0026 §6). No second
drag-and-drop infrastructure was written:

```
image → Sprite(source)        width/height   an existing line
audio → AudioSource(clip)     playing: true  a line added
```

`playing: true` makes the gesture **answer**: a fresh `AudioSource` is silent on purpose — adding a
Component must never make a noise nobody asked for — but dragging a sound into a game is asking for
it, and a drop that produces an inert component is what ADR-0026 §6 calls the worst possible answer to
a gesture.

The same reasoning applies twice more:

- **The Project's `+`** gains `Sound…` beside `Image…`: one line, one `accept`, and the import itself
  is written once.
- **A resource's icon** stops depending on `kind` alone. An image and a sound are the **same** kind
  (ADR-0020 §2) and that is right; what differs is what a creator is looking at, and an image
  thumbnail on an `.mp3` is a panel saying something false (ADR-0054). The mime decides, by prefix, in
  two table lines.
- **An audio resource's Inspector** offers a `controls` player — the only control in the Editor that
  makes a noise, and only when you press it.

---

## 8. What this ADR does not decide

| Open point | Why |
|---|---|
| **Font loading** | A family is a string the surface already knows how to resolve. A **shipped** font is a Resource, a pipeline and an ADR of its own |
| **Text layout** | Wrapping, paragraphs, vertical alignment, exact measurement: that is a text engine, and §3 says why measurement cannot go through the renderer without breaking `bounds()` |
| **A UI engine** | Buttons, fields, focus, layout, events: an entire product. This slice's HUD is made of Objects, which is honest and enough for a score and a "You win!" |
| **A `ScreenSpace` anchor** | §2. It needs a layout to hook to |
| **A mixer** | Buses, groups, ducking, effects: each is a decision about a mixer, and a mixer is a product nobody has designed |
| **Spatialized sound** | Pan, attenuation, a listener. The contract's shape does not forbid it — it is one more `set(handle, …)` — but what it *means* in a 2D game is a product decision |
| **Sound in the Editor's rendering outside Play** | The Editor does not simulate in edit mode (ADR-0029 §1), so nothing sounds until you press Play. That is intended: a panel playing music while you tidy a scene is a panel you mute |
| **Decoding formats** | What the browser can read, it reads; `.mp3`, `.ogg` and `.wav` are already in the extension table. There is no transcoder and there will not be one here |

---

## 9. Counter-tests

| What is checked | Where |
|---|---|
| A fresh `TextRenderer` shows something, and its schema says the same as its constructor | `runtime/rendering/components/text-renderer.test.js` |
| A number written by a graph is drawn, and `0` is not "nothing" | the same |
| Empty text and a zero size draw nothing at all | the same |
| The font is composed as `18px Georgia, serif` and the alpha is restored afterwards | the same |
| Position, rotation, scale, parenting, `layer`, `active`, `Component.active` | the same |
| The extent follows the text, the size and the alignment | the same |
| A serialization round trip, and nothing but the schema's keys | the same |
| The camera moves the world and leaves the HUD where it is | `runtime/rendering/space.test.js` |
| The screen matrix applies above, so a 2× screen does not halve the HUD | the same |
| The space is inherited over two levels, and goes out with `active` | the same |
| Every renderer honours it, because the decision belongs to the Object | the same |
| `layer` still decides what covers what | the same |
| `To Text`: a number, a boolean, text, `null`, `NaN`, an infinity, an Object handle | `core/graph/nodes.test.js` |
| `Join Text` refuses a number, which is what gives `To Text` its meaning | the same |
| `"Score: " + score` in exactly two nodes | the same |
| An incomplete audio backend is named; a volume is clamped in one place | `runtime/audio/audio.test.js` |
| An unknown clip plays nothing; two sounds of one clip are two elements | the same |
| An autoplay refusal is counted; a refused loop restarts at `unlock()`, a one-shot does not | the same |
| `AudioSource` is reconciled: asking five times plays once | the same |
| `playing = false` stops; the volume adjusts; the clip replaces | the same |
| A destroyed Object, a destroyed parent, a removed Component: the sound stops | the same |
| A handle is never serialized; `playing: true` plays again on load | the same |
| `Play Sound`: the picker, a wire beating the picker, an empty clip, a Runtime with no output | the same |
| A host with no `Audio` at all does not crash | `editor/project/session.test.js` |

---

## 10. Consequences

### Positive

- A score is displayed, changes and reads — with `Set Property`, `To Text` and `Join Text`, with no new
  vocabulary.
- A HUD stays in place, in the Preview **and** in the Editor, including under the pointer.
- A shot, an impact and music are heard, and the autoplay rule is handled rather than worked around.
- The audio contract is the rendering contract a second time: a silent server, a literal test, a Web
  Audio backend possible with nothing else moving.
- Two table lines (image, audio) cover import, DnD, the icon and the Inspector.

### Negative

- `RENDERER_OPERATIONS` gains an operation: every backend and every test double has to provide
  `fillText`.
- A text's `bounds()` is an estimate, and says so. A selection outline is off by a few pixels on a very
  narrow or very wide font.
- `SceneRenderer.render()` gains an argument, and five Editor functions gain an optional `screen`
  parameter. Their default is `view`, so no existing caller changes.
- The Editor makes no sound before Play, which can be surprising — and it is the intended behaviour
  (§8).
