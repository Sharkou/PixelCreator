# ADR-0050 — Turning out of the plane

- **Status:** **accepted** (2026-08-31)
- **Superseded by:** ADR-0051 (2026-08-31) — rotation becomes a `rotationX` / `rotationY` PAIR, paired like Position and Scale. `Rotation.X` is the old in-plane rotation; `Rotation.Y` takes the role §3 gives `rotationX`. Both are in radians, no longer in degrees.
- **Decides:** how a 2D object says it is turned out of the plane of the screen
- **Depends on:** ADR-0002 (spaces and Transform), ADR-0003 (Property System), ADR-0007 (schema)
- **Supersedes:** ADR-0047 §3 — `flipX` / `flipY` are removed
- **Does not decide:** the unit of `rotation`, which stays radians; any notion of depth, a 3D camera or z-order

---

## 1. The problem with the flip

ADR-0047 §3 was right about the diagnosis — "a facing is not a rotation, and not a negative scale
either" — and wrong about the answer. A boolean can say only two things: **front** or **back**. What a
card caught mid-flip asks for is `45`.

The flip was therefore not a model, it was **a special case promoted to a property**.

---

## 2. The decision

> **`rotationX` and `rotationY`, two numbers in degrees, beside `rotation`.**

```
  Transform
    Position X    Position Y
    Rotation                  ← in the plane, as always
    Scale X       Scale Y
    Rotation X    Rotation Y  ← out of the plane
```

No `Rotation Z`: in-plane rotation is called `Rotation` because that is what a 2D game creator means
when they say "rotation". Naming the axes of the two new ones is enough to remove the ambiguity
without importing a third axis into the vocabulary.

---

## 3. This is not an approximation

The renderer already projects orthographically: `worldMatrix()` produces a 2×3 affine that
`context.setTransform` consumes, with no depth. Under that projection, a rotation of θ about the X
axis sends `(x, y, 0)` to `(x, y·cos θ, y·sin θ)`; dropping `z` leaves `(x, y·cos θ)`.

> **A vertical scaling by `cos θ` IS the rotation about X, exactly.**

There is therefore nothing to simulate and nothing to approximate. The pipeline does not move: what
comes out of it is the same affine as before.

| Rotation X | Effect |
|---|---|
| 0° | at rest |
| 45° | a card caught mid-flip (×0.707) |
| 90° | its edge (×0) |
| 180° | its back (×−1) |

**That 180° looks like a mirror is a consequence of the cosine, not a written case.** That is exactly
what distinguishes this model from a renamed flip.

**The axis you turn about keeps its length** — `rotationX` shortens the vertical axis, `rotationY` the
horizontal one. The pairing looks like a transposition and is not one.

---

## 4. What it costs

| | |
|---|---|
| Schema | two `number`s, default 0 |
| `localMatrix()` | two `cos`, multiplied into the scale terms the composition already carried |
| Renderer, picking, camera | **nothing** — everything goes through `worldMatrix()` |
| Serialization | two numbers, like any declared property |
| Inspector | two numeric rows with the `°` suffix, at short width, with their handle |
| Graph | `Transform ▸ Rotation X` in the picker, `Get`/`Set` for free |
| DnD, undo, live sync | free: they are Property System properties |
| Hierarchy | a child turns with its parent, by composition |

**Degrees, stored as such.** `rotation` stays in radians because it always has been and because
migrating would rewrite every scene; these are new, so they hold the number the creator wrote. The
unit is declared for the suffix alone: `DISPLAY_UNITS` has no entry for `°`, so the scale stays 1 and
nothing is converted.

## 5. The trap, named

**An object disappears at 90° and 270°**, because `cos` is zero there. That is geometrically right and
visually confusing for a beginner dragging the field. It is not a defect in the code: it is what
turning a sheet of paper to its edge does. No guard is added — adding one would lie about the geometry
— but the fact is recorded here so that nobody rediscovers it as a bug.

Likewise, `cos` is even: `+45°` and `−45°` are visually identical.

---

## 6. Observable contracts

| Contract | Verifiable by |
|---|---|
| `flipX` / `flipY` exist nowhere | `transform.test.js` |
| `rotationX` / `rotationY` are numbers, in degrees, default 0 | the same |
| The perpendicular axis measures `cos θ` at 0°, 45°, 90°, 180° | the same |
| The axis of rotation keeps its length | the same |
| The turn multiplies the scale rather than replacing it | the same |
| `rotation` composes exactly as before | the same |
| Both serialize and read back | the same |
| They compose through the hierarchy | the same |
| They appear in the Inspector and the picker with no special mechanism | on screen |
