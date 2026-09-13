# ADR-0013 — The camera is an Object, the viewport is the screen

- **Status:** **accepted** (2026-08-12)
- **Decides:** what a camera is in the `Object → Components` model, and what distinguishes it from the viewport
- **Related to:** ADR-0002 (Transform), ADR-0004 (Components), ADR-0012 (errors)
- **Clarified on 2026-09-11:** *which one*, when a scene carries several. `activeCamera(scene)`
  returns **the first eligible camera in canonical order** — the hierarchical order ADR-0034 §3.1
  defines and that `Runtime.step()` and `SceneRenderer` already use; eligible in the sense of the
  two questions ADR-0004 asks everywhere else (the Object is active, the Component is not turned
  off). The Preview read `scene.objects()`, and therefore insertion order: two clients holding the
  same scene could be looking through two different cameras depending on which one had reloaded
  it. **No notion of a main camera, of priority or of `main` is introduced**: choosing among
  several cameras is a product feature nobody has designed, and what is fixed is that the answer
  depended on the scene's history rather than on its state.

---

## Observed context

**`Camera` designates three different things in Legacy**, often within the same function:

| What is written | What it actually is |
|---|---|
| `Camera` | a **component class** (`background`, `max_x`, `offset`, `preview()`) |
| `Camera.main` | an **`Object`** that carries that component |
| `renderer.render(scene, camera)` | the **screen projection** |

`Renderer.render()` writes `camera.getComponent('Camera').background` while reading `camera.x` and
`camera.scale`: the same identifier is sometimes the component, sometimes the carrying object. A
reader cannot tell which is meant without unrolling the call.

On top of that, `Camera.offset` is a second position coexisting with `camera.x` with nothing
saying which is authoritative.

---

## Decision

### 1. A camera is an ordinary `Object`

It carries a `Transform` like any object. `camera.x`, `camera.y` and `camera.rotation` **are** its
position and orientation, read by exactly the same rules as everything else (ADR-0002).

**There is no second position API.** No `offset`, nothing to keep in sync. An immediate, free
consequence: parenting the camera to the player makes it follow the player, because that is
already what parenting means. No follow code is required.

### 2. The `Camera` component carries only the lens

```js
class Camera { zoom = 1; }
```

It is the only thing a Transform cannot express. An `Object` with a `Transform` and **without** a
`Camera` component is a valid camera, at zoom 1.

### 3. The `Viewport` is the screen, not the scene

```js
class Viewport { width; height; }
```

It describes the display surface: how many pixels wide and tall. It has no world position, no
transform, and **does not belong to the scene**. Resizing a window changes a viewport and must
touch no model.

Screen space: the origin at the top left, `x` to the right, `y` downward — the convention every 2D
surface and every pointer event already uses.

### 4. The view matrix is **derived**, never stored

```
view = centre(viewport) · zoom · inverse(worldMatrix(camera))
```

It reads right to left: undo the camera's placement, apply the lens, then bring the origin to the
centre of the screen.

Being derived, it **cannot diverge** from the camera, unlike a cached projection. The renderer
receives a `Matrix` and does not know what a camera is — that is what permanently rules out a
`Core → renderer` dependency.

The camera's own scale is part of its world matrix and is therefore inverted with the rest:
enlarging the camera object shows **more** world, which is exactly what inverting a transform
means. `zoom` is a named multiplier that **composes** with it; it is not a duplicate, it is the
setting the user and the Editor manipulate.

### 5. Conversions

```js
worldToScreen(view, x, y)
screenToWorld(view, x, y)
```

`screenToWorld()` is the first link of the Editor's picking:

```
pointer  →  Viewport  →  screenToWorld()  →  geometry  →  selection
```

**The runtime provides the mapping, not the selection policy.** The following links belong to the
Editor and are not built here (see §Picking below).

A zero, negative or non-finite `zoom` is **refused when the view is constructed**. It leaves the
camera's matrix perfectly invertible: nothing would throw, the view would simply collapse the whole
scene onto a point, and the only symptom would appear much later in `screenToWorld()`, naming a
matrix nobody wrote.

---

## Picking: what is prepared, and what is not

`bounds(self)` stays what it is: an **optional geometric capability**, declared by the components
that genuinely have an extent. It is not a selection API, and it is not generalized.

**An Object with no geometry stays perfectly valid** and the runtime does not make it artificially
selectable in any way. Making an object with no gameplay hitbox selectable presumes an *editorial*
representation — therefore an Editor decision, taken with it.

---

## Consequences

### Positive

- One position API, the one every object has.
- Camera following is free: it is parenting.
- The renderer stays ignorant of the camera; `SceneRenderer.render(scene, { view })` is unchanged.
- `screenToWorld()` unblocks the Editor's picking before the Editor exists.
- The server has neither a camera nor a viewport, and imports none of that code.

### Negative

- The view is recomposed on every call (a few 2D matrix multiplications). A cache is not called
  for: it would have to be invalidated on every write to any ancestor.
- `screenToWorld()` inverts on every call. A tool testing many objects against one pointer should
  invert once and reuse — that is a caller's optimization, not a cache to hide here.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Camera = a component carrying its own position** | It recreates exactly the Legacy ambiguity and a second source of truth for the position. |
| **Camera = a special object outside the scene** | It forbids parenting, and therefore reintroduces follow code the model gives for free. |
| **Merging Camera and Viewport** | It conflates the world and the screen. Two cameras in one viewport, or one camera in two viewports, would become impossible. |
| **`zoom` = the Transform's `scaleX`/`scaleY`** | Two values for a setting that has one, with an inverted and counter-intuitive meaning in the Inspector. |
| **A view matrix stored on the camera** | A second state to invalidate on every move, of the camera or of any parent. |
