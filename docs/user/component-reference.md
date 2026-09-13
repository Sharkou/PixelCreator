# Component reference

Every component Pixel Creator ships today, with every field it has. Fifteen types, in the
four groups the **Add Component** menu shows.

A note on names: the menu shows a **label** (`Rectangle`), the engine uses a **type name**
(`RectangleRenderer`). Both are given below, because a graph's *Get Property* node and a
saved scene file use the type name.

The Inspector pairs some fields into one row — `x` and `y` read as **Position**, `width` and
`height` as **Size**, `rotationX`/`rotationY` as **Rotation**, `scaleX`/`scaleY` as
**Scale**.

---

## Rendering

### Rectangle — `RectangleRenderer`

A solid or outlined coloured box. The simplest thing that draws, and what the create tool
gives you.

| Field | Type | Default | Notes |
|---|---|---|---|
| `width` | number | `32` | |
| `height` | number | `32` | |
| `color` | colour | `#ffffff` | |
| `alpha` | 0…1 | `1` | Shown as a slider |
| `fill` | on/off | on | Off draws an outline only |
| `lineWidth` | number | `1` | Outline thickness when `fill` is off |

### Sprite — `Sprite`

Draws an image.

| Field | Type | Default | Notes |
|---|---|---|---|
| `source` | image resource | — | Drag an image from the Project panel, or pick one |
| `width` | number | `0` | `0` means "the image's own width" |
| `height` | number | `0` | `0` means "the image's own height" |
| `alpha` | 0…1 | `1` | |

### Sprite Animator — `SpriteAnimator`

Plays an [animation resource](resources.md#animation) on the object's Sprite.

| Field | Type | Default | Notes |
|---|---|---|---|
| `clip` | animation resource | — | The clip to play |
| `playing` | on/off | on | |
| `speed` | number ≥ 0 | `1` | A multiplier on the clip's own frame rate |

A graph can start a clip with **Play Animation**, and react to the end of one with
**Animation Finished**.

### Text — `TextRenderer`

Draws a line of text in the world. This is how you put a score on screen.

| Field | Type | Default | Notes |
|---|---|---|---|
| `text` | text | `Text` | |
| `fontSize` | number ≥ 1 | `16` | |
| `fontFamily` | text | `sans-serif` | Any CSS font family the browser has |
| `color` | colour | `#ffffff` | |
| `align` | Left / Center / Right | Left | |
| `alpha` | 0…1 | `1` | |

To show a number, build the string with the **To Text** and **Join Text** nodes and write it
into `text` with **Set Property**.

### Particles — `ParticleSystem`

A simple emitter: coloured dots thrown out from the object.

| Field | Type | Default | Notes |
|---|---|---|---|
| `max` | number | `100` | Ceiling on live particles |
| `rate` | per second | `20` | How many are born each second |
| `lifetime` | seconds | `1` | |
| `speed` | number | `40` | Initial speed |
| `spread` | degrees | `360` | The cone they are thrown into |
| `radius` | number | `3` | Particle size |
| `color` | colour | `#ffaa33` | |
| `gravity` | number | `0` | Downward pull on each particle |
| `additive` | on/off | on | Additive blending — bright, good for sparks and fire |
| `emitting` | on/off | on | Turn off to stop making new ones |

### Tilemap — `Tilemap`

A grid of tiles cut from a tileset. See [Tilemaps and tilesets](tilemaps.md), which is where
this component is actually explained — it is painted in the viewport, not typed into the
Inspector.

| Field | Type | Default | Notes |
|---|---|---|---|
| `tileSize` | number ≥ 1 | `16` | The size of one cell, in world units |
| `columns` | number | `0` | Grid width, in cells |
| `rows` | number | `0` | Grid height, in cells |
| `tiles` | list | empty | The painted cells. Written by the tile tool, not by hand |
| `tileset` | tileset resource | — | Which cutting to draw from |

### Screen Space — `ScreenSpace`

Marks the object as part of the **interface** rather than the world: its Transform is read in
screen units and the camera never touches it. That is what a HUD is — a score that stays in
the corner while the world scrolls past.

It has no fields. Adding it is the whole statement.

---

## Audio

### Audio Source — `AudioSource`

| Field | Type | Default | Notes |
|---|---|---|---|
| `clip` | sound resource | — | Drag a sound from the Project panel |
| `volume` | 0…1 | `1` | |
| `loop` | on/off | on | |
| `playing` | on/off | off | Turn on to play; a graph can also use **Play Sound** |

Browsers refuse to play sound before the player has interacted with the page. A sound that
does not start until the first click is the browser, not Pixel Creator.

---

## Scene

### Transform — `Transform`

Where the object is. Covered in
[Objects and components](objects-and-components.md#where-is-it-the-transform).

| Field | Type | Default |
|---|---|---|
| `x`, `y` | number | `0` |
| `rotationX`, `rotationY` | degrees in the Inspector | `0` |
| `scaleX`, `scaleY` | number | `1` |

A child's Transform is relative to its parent's.

### Velocity — `Velocity`

How fast the object is moving, per second. It is **data**: on its own it moves nothing.

| Field | Type | Default | Notes |
|---|---|---|---|
| `x` | per second | `0` | |
| `y` | per second | `0` | |

Something has to consume it — add a **Body**, or write your own movement in a graph.

### Body — `Body`

Makes the object move according to its Velocity, and makes solid things stop it.

| Field | Type | Default | Notes |
|---|---|---|---|
| `gravity` | per second² | `0` | Downward acceleration added to Velocity every second. `0` for a top-down game |
| `grounded` | read-only on/off | off | True while a solid stopped this Body on its way down |

Add **Velocity** to give it a speed. A Body with no collider still moves; it just never
collides with anything.

### Box Collider — `BoxCollider`

A rectangle used for collision.

| Field | Type | Default | Notes |
|---|---|---|---|
| `width` | number | `32` | |
| `height` | number | `32` | |
| `solid` | on/off | on | Blocks objects that have a Body. Off means it only *detects* |
| `offsetX` | number | `0` | Shifts the box relative to the Transform |
| `offsetY` | number | `0` | |

A non-solid collider is how you build a trigger — a coin, a checkpoint, a damage zone. Read it
from a graph with **On Collision** or **Is Overlapping**.

### Tilemap Collider — `TilemapCollider`

Makes the painted cells of this object's Tilemap solid. It has no fields — put it on the same
object as the Tilemap and it is done.

### Follow — `Follow`

Keeps this object beside another one. The usual use is a camera following a player.

| Field | Type | Default | Notes |
|---|---|---|---|
| `target` | object reference | — | The object to stay with. Drag one here, or pick it |
| `offsetX` | number | `0` | How far to the side of it to sit |
| `offsetY` | number | `0` | How far above or below it to sit |

### Camera — `Camera`

Decides what part of the world is on screen. A camera is an ordinary object: it has a
Transform, so you move it, parent it and animate it like anything else.

| Field | Type | Default | Notes |
|---|---|---|---|
| `zoom` | number > 0 | `1` | Larger means closer |

---

## Your own components

A `.px` graph is a component type too. It appears in **Add Component** under its file name,
its declared properties become Inspector fields, and it can declare its own menu category.
See [Visual scripting](visual-scripting.md).

## What is not here

If you are looking for a component that does not exist yet, it genuinely does not exist —
this list is complete and is checked by a test. There is no circle renderer, no light, no
polygon collider, no rigid-body physics engine, no networking component, and no tween
component (tweening is a [graph node](node-reference.md#flow)).
