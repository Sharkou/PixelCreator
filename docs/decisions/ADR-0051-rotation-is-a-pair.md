# ADR-0051 — Rotation is a pair

- **Status:** **accepted** (2026-08-31)
- **Decides:** how the Transform exposes rotation; how a type renames a property without breaking data already written
- **Depends on:** ADR-0002 (a local Transform), ADR-0003 (Property System), ADR-0007 (schema), ADR-0023 §2 (no vector type), ADR-0021 (unreadable data must not lose the scene)
- **Supersedes:** ADR-0050 — `rotationX`/`rotationY` in degrees, independent, disappear in favour of a pair
- **Does not decide:** the presentation unit anywhere other than in the Inspector; any notion of depth or a 3D camera

---

## 1. One property, two components

The panel read `Position X Y`, then `Rotation` alone, then `Scale X Y`: two pairs around a scalar,
three shapes for one idea.

> **`Rotation` becomes `rotationX` / `rotationY`, paired like `Position` and `Scale`.**

| | |
|---|---|
| `Rotation.X` | rotation **in the plane** of the screen, like a clock hand. It is exactly the old `rotation`, bar the name. |
| `Rotation.Y` | rotation **about the vertical axis**, out of the plane. |

**No vector type is introduced.** ADR-0023 §2 removed them from the Property System deliberately, and
none is needed: the Inspector already pairs `x`/`y` and `scaleX`/`scaleY` by declaration (`PAIRS`,
`inspector/schema.js`). Rotation joins that table. The Graph, DnD, undo and the live sync learn
nothing: these are two declared properties like the others.

### 1.1 `Rotation.Y` is not an approximation

The renderer already projects orthographically. Turning by φ about the vertical axis sends `(x, y, 0)`
to `(x·cos φ, y, −x·sin φ)`; dropping `z` leaves `(x·cos φ, y)`.

> **A horizontal scaling by `cos φ` IS that rotation, exactly.**

| Rotation Y | Effect |
|---|---|
| 0° | at rest |
| 45° | a sprite caught mid-flip (×0.707) |
| 90° | its edge — invisible under this projection |
| 180° | its back, and therefore a horizontal mirror |
| 360° | back to the start |

That 180° reads as a mirror is a **consequence of the cosine**, not a written case. Nothing here is a
flip under a longer name, and the intermediate values are the point of the model.

The axis you turn about keeps its length: `rotationY` never touches the vertical axis.

### 1.2 One unit

Both halves are in **radians**, like the old `rotation` — migrating that one would rewrite every
scene. One property, one unit: the Inspector converts both to degrees through the same
`DISPLAY_UNITS` entry, so a creator types `45` into either. Nothing mixed on one row.

### 1.3 What the matrix reports

`Matrix.decompose()` answers `rotation` — one angle, and there is only one in an affine. What
reparenting copies across is therefore `rotationX`. **`rotationY` is not decomposed**: it left the
matrix as a horizontal scale, and `scaleX` brings it back. Writing a sixth value there would be
inventing a number the geometry never reported.

### 1.4 The constructor's positional order is not the schema's

`rotationY` is declared **beside** `rotationX` — the Inspector reads the schema to draw its rows — and
arrives **last** in the constructor, because the positional signature is a compatibility surface:
every `new Transform(x, y, rotation, scaleX, scaleY)` written before keeps meaning what it meant.

---

## 2. What it costs

| | |
|---|---|
| Schema | a scalar becomes two `number`s, in the order Position / Rotation / Scale |
| `localMatrix()` | one more `cos`, in the scale term the composition already carried |
| Renderer, picking, camera | **nothing** — everything goes through `worldMatrix()` |
| Inspector | **one `Rotation` row with X and Y**, short width, handles like Position |
| Graph, DnD, undo, live sync | free: two Property System properties |

---

## 3. A type may rename a property

`reconcileValues()` **drops what the schema does not declare** — that is what lets a definition change
with no migration written, and it is also what would have silently destroyed this rename: a scene
saved yesterday carries `rotation`, and it would have reopened with every object unrotated.

> **`static migrate(values)` is the only place where a type says "this used to be called something
> else". It runs before the filter, not around it.**

Declared, not hand-stitched: any Component may have one, and no caller of the serializer learns
`Transform`'s name. A migration that throws is caught — losing a component's values is annoying,
losing the whole file because a rename was badly written is the failure ADR-0021 exists to prevent.

The migration here is a pure read: `rotation` → `rotationX`, `rotationY` at its default. A value
already written against the new schema wins.

---

## 4. The trap, named

**An object disappears at `Rotation.Y = 90°` and 270°**, because `cos` is zero there. That is
geometrically right — it is what a sheet turned to its edge does — and no guard is added: adding one
would lie about the geometry. Likewise, `cos` is even, so `+45°` and `−45°` are visually identical.

---

## 5. Observable contracts

| Contract | Verifiable by |
|---|---|
| `Rotation` is an X/Y pair, and the Inspector draws it on one row | `schema.test.js`, and on screen |
| There is no scalar `rotation` any more, nor independent `Rotation X`/`Y` | `transform.test.js` |
| `flipX` / `flipY` exist nowhere | the same |
| An old `rotation` value becomes `rotationX`, with `rotationY` at rest | the same |
| `Rotation.X` composes exactly like the old rotation | the same |
| `Rotation.Y` is `cos φ` at 0°, 45°, 90°, 180°, 360° | the same |
| The vertical axis is untouched whatever `rotationY` is | the same |
| Both serialize and read back | the same |
| Reparenting writes five values, not six | `reparent.test.js` |
