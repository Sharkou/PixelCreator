# ADR-0022 — Reparenting preserves the world, and that policy belongs to the Editor

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0002 (local values, a derived world), ADR-0012 (the Runtime reports, it does not correct), ADR-0019 (`REPARENT`)

## Observed context

`Object.addChild()` kept the **local Transform**. Dropping an object into another branch of the
Hierarchy therefore made it jump on screen, to wherever its new parent placed it.

`Matrix` had no `decompose()`: nothing allowed going back from a matrix to the five values a
`Transform` stores.

## Decision

### 1. The world is preserved by default, and the policy lives in the Editor

```
A gesture in the Hierarchy  =  batch {
                                 REPARENT      { object, parent, index, previous… }
                                 SET_PROPERTY  x
                                 SET_PROPERTY  y
                                 SET_PROPERTY  rotation
                                 SET_PROPERTY  scaleX
                                 SET_PROPERTY  scaleY
                               }
```

Tidying your tree is tidying — not moving. Unity, Godot and Blender all do this, and for the same
reason.

**Five reasons to compose that recomputation in the Editor rather than in the Core:**

1. **`REPARENT` stays invertible by its structure alone.** A `REPARENT` that recomputed the
   Transform would also have to carry the five previous values to be undoable; it would carry two
   mutations under one name.
2. **Replication stays exact.** The recomputed values travel as numbers. If each node recomputed
   its own decomposition, two machines would diverge on floats — the kind of desynchronization you
   never diagnose.
3. **`batch` already exists** (ADR-0008) and does exactly this: one drop = **one** history entry,
   six operations.
4. **The Core keeps one law.** `parent.addChild(child)` from a script preserves the local
   transform — which is what a script expects, and what `editor/project/starter.js` uses. World
   preservation is an **editor policy**, written in `editor/commands.js`.
5. **ADR-0002 is honoured**: the values stay local, the world stays derived, nothing is stored
   twice.

`reparentObject(scene, object, parent, index, { preserveWorld })`: `preserveWorld: false` keeps the
local transform, which is what a "keep the local position" checkbox in the UI will one day do.

### 2. `Matrix.decompose()` is pure, and exact outside shear

```
x, y     = e, f
scaleX   = hypot(a, b)
rotation = atan2(b, a)
scaleY   = (a·d − b·c) / scaleX        signed: a mirrored parent stays mirrored
skew     = (a·c + b·d) / scaleX²       exactly zero when the columns are orthogonal
```

`scaleY` is derived from the **determinant** rather than from `hypot(c, d)`: `hypot` would return a
positive value and silently lose the flip.

### 3. Shear is reported, never silently corrected

`(x, y, rotation, scaleX, scaleY)` describes a translation, a rotation and an axis scale — **five
numbers for an affine transform that has six**. The sixth is shear, and it appears as soon as an
ancestor carries a **non-uniform scale** *and* an intermediate node is **rotated**. It is the same
wall as Unity's `lossyScale`, and it has no clean solution in a local five-value model.

**The policy adopted:**

- `decompose()` returns the best shear-free approximation, **and** `sheared: true` with the measured
  `skew`;
- the reparent **happens** — the user's gesture is not refused;
- the local values are **left as they are** — a defensible placement rather than a wrong one;
- a report is emitted (`onReport`, `kind: 'reparent:sheared'`).

This is ADR-0012 applied to geometry: **the system does not silently correct, it says what it could
not do.** Reparenting under a shearing parent is rare; making it silently distorting would be far
worse than making it noisy.

The same fallback covers a parent with zero scale, whose matrix is not invertible.

## What this ADR does not decide

- The exact wording of the message shown to the creator, nor the channel (the Console window does
  not exist yet — the report goes through `onReport`).
- The "keep the local position" UI option. The model already carries it (`preserveWorld: false`),
  the interface does not yet.

## Consequences

### Positive

- Tidying the Hierarchy no longer moves anything.
- A drop stays a single undo entry.
- No remote node recomputes floats: they travel.
- The five-value model's limit is named and reported, instead of being discovered as a rendering
  bug.

### Negative

- A drop produces six Operations where it produced none. That is the price of exact replication,
  and the `batch` brings it back to one history entry.
- The sheared case asks the caller to handle a report.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping the local transform by default** | The object jumps on screen when the creator was tidying. |
| **Recomputing in the Core handler** | Every node would recompute its own floats → an undiagnosable divergence; and `REPARENT` would stop being invertible by its structure alone. |
| **Forbidding non-uniform scale on a parent** | Too restrictive for a 2D engine, where stretching scenery is common. |
| **Storing world matrices** | It contradicts ADR-0002 and reintroduces two sources of truth. |
| **Approximating the shear without saying so** | It silently distorts the object. That is exactly what ADR-0012 refuses. |
| **Refusing the gesture under a shearing parent** | Refusing a legitimate action for a rare case, instead of doing it and saying so. |
