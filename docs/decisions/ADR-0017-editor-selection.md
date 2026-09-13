# ADR-0017 — Selection and picking belong to the Editor

- **Status:** **accepted** (2026-08-13)
- **Decides:** what a creator can click in the Viewport, and where that knowledge lives
- **Related to:** ADR-0004 (Components), ADR-0006 (Editor), ADR-0013 (Camera / Viewport)

---

## Context

ADR-0013 stops at `screenToWorld()`: "the runtime provides the mapping, not the selection
policy". `core/component.js` goes further and states the constraint without solving it:

> Editor picking must also reach objects that carry no geometry at all, so it needs an editorial
> representation that `bounds()` alone cannot provide.

Two things therefore had to be settled: **which geometry** is clickable, and **where** the
selection is stored.

**OBSERVED IN LEGACY.** Both answers were wrong, and coupled:

- `Renderer.render()` imports `editor/system/dnd.js` to read `Dnd.hovering` and `Dnd.resize` — the
  render engine depends on the IDE. `tools/layers/rules.js` still tracks that violation, and it is
  the only one in the repository.
- `detectMouse(self, x, y)` and `detectSide()` are carried by `Collider`, `RectCollider` and
  `CircleCollider`: **an object was selectable only if it had a gameplay collision component.**
- Selection lived in the model, as `scene.current` / `scene.currentComponent`, read by five modules
  — including `Network`.

---

## Decision

### 1. Three distinct geometries, which lend each other nothing

| Geometry | Who defines it | What it is for |
|---|---|---|
| **Gameplay** | a future `Collider` | what the game hits |
| **Rendering** | the `bounds(self)` of a component that draws | what is painted |
| **Editorial** | the Editor, `viewport/picking.js` | what a creator can click |

Diverting one for another is Legacy's defect, not a shortcut.

### 2. Every Object has an editorial extent

```
editorBounds(object) = the union of the bounds() of the components that declare one
                     = otherwise, a 24-unit grab square on the origin
```

An empty object, a camera, a spawn point, a grouping node: **clickable, without anything being
added to them.** `bounds(self)` stays an optional capability and is never made mandatory by
selection.

### 3. The test is done in local space

The pointer goes through the inverse of `view · worldMatrix(object)`, and is then compared against
a box aligned to the **local** axes. Rotation, scale and parent composition are therefore handled
by matrices, not by special cases — and the selection outline follows the object instead of
boxing it.

`lock`, `visible` and `active` exclude an object from picking. That is `lock`'s only role.

### 4. Selection is an Editor object, not a model field

`editor/selection.js`: a current object, `set` / `clear` / `has` / `observe`. The Core does not
know about it, it is not serialized, it produces no Operation and it is not replicated — two
creators on the same project each have their own.

**Single selection for now.** Multiple selection changes what "the selected object" means for
every consumer; it will be decided together with the tools that need it, not by placing an array
in advance that nobody reads.

### 5. Overlays are drawn after rendering, by the Editor

The outline and the pivot go through the **ordinary renderer contract** (`setTransform`,
`strokeRect`, `fillRect`), on the surface, after `Runtime.render()`. No IDE-only drawing API, no
second backend, and above all: **nothing in `runtime/` knows an editor exists.**

---

## Consequences

### Positive

- A published game loads nothing of the IDE: Legacy's `engine → editor` dependency is not
  reproduced.
- An object is selectable from the moment it is created, before any component.
- Physics will be able to change without touching selection, and vice versa.
- `picking.js` is pure computation: tested under Node, with no DOM.

### Negative

- The 24-unit grab square is a hand-picked constant. It is correct as long as it matches the
  marker that is drawn; if the marker changes, it must change with it.
- An editorial extent is not a silhouette: clicking a sprite's transparent corner selects the
  sprite. Acceptable — and fixable later with an alpha test, without the model moving.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Reusing the Colliders** | It makes selection depend on gameplay. That is exactly Legacy's defect. |
| **Making `bounds()` mandatory** | It forces a geometry onto components that have none (a particle system, pure logic) and contradicts ADR-0004. |
| **Selection in the Core (`scene.current`)** | IDE state inside a model the server also runs. `core/scene.js` explicitly refuses it. |
| **Picking by reading canvas pixels** | It requires an extra render buffer, does not survive a headless backend, and ties selection to whether an object draws. |
| **Picking in the Runtime** | It recreates `runtime → editor`; ADR-0013 already settled that the runtime provides the mapping and not the policy. |
