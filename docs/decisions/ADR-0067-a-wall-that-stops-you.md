# ADR-0067 — A wall that really stops you

- **Status:** **accepted** (2026-09-12)
- **Decides:** what moves and what blocks; where movement happens in a step; how a body is stopped without tunnelling; what `grounded` means; what stays out of the engine
- **Depends on:** ADR-0002 (the parent's space), ADR-0004 (one Component, one `update`), ADR-0011 (fixed step), ADR-0014 (input is an argument), ADR-0034 §3.1 (canonical order), ADR-0057 (determinism), ADR-0059 (touching is a fact of simulation), ADR-0064 (broad phase, and the differential proof)
- **Amends:** ADR-0059 §9 — the physical response arrives, in its smallest form; the `trigger` ADR-0059 refused becomes `solid`, because it finally has an observable meaning
- **Does not decide:** mass, restitution, friction, physical rotation, joints, slopes, moving platforms, depenetration — see §6

---

## 1. The hole

The engine knew how to say **that** two things are touching. It did not know how to **stop** them
going through each other. A creator who wanted a floor had to write, themselves, in a `.px`, the
comparison of two rectangles and the correction of their own position — that is, to write a solver
in a node language designed so that you would not need one.

Nothing that existed was wrong. What was missing was the third sentence:

```
1. A overlaps B                      collider.js        a geometric fact
2. Enter / Stay / Exit               collisions.js      a contact cycle
3. B stops A moving forward          move.js            a physical response   ← missing
```

---

## 2. Three words, and a beginner can point at each one

```
Player  ▸ Body                    this object moves, and the world can stop it
Player  ▸ Box Collider ▸ Solid ✓  what stops it, and what it stops
Coin    ▸ Box Collider ▸ Solid ✗  blocks nothing, and still reports the contact
```

That is the **whole** model. No `RigidBody`, no `CharacterController`, no `PhysicsMaterial`, no
`layer mask`. A creator does not learn a physics-engine vocabulary; they tick a box and add a
Component.

| Decision | Reason |
|---|---|
| **`Body` carries no velocity** | `Velocity` already carries it — in the Inspector, in the schema, in `Get Property` and in every scene already saved. Two pairs of numbers would be two answers to one question, and the one the creator sees would be the wrong one half the time |
| **A `Body` with no `Velocity` does not move** | There is nowhere to accumulate a velocity. It is the family `SpriteAnimator` without `Sprite` already belongs to (ADR-0062 §4): a Component that writes into another does not invent a second home for itself |
| **`gravity` is on the body, and defaults to 0** | A top-down game is as common as a platformer, and this engine never does what it was not asked to — the doctrine `Velocity` has stated since day one. A world gravity would be a global setting nobody designed, and would rule out the flying enemy |
| **`solid` is true by default** | A box a creator draws around a crate **is** a crate. The beginner who wants a wall types nothing; the one who wants a pickup unticks a box and keeps all their `On Collision`s |
| **`grounded` is computed, therefore read-only** | It is the answer to "am I standing on something", and only the pass that stopped you can know it |

---

## 3. Three ideas, three files, one geometry

```
broad-phase.js   which pairs are worth testing
collisions.js    which ones overlap, and which has just started or finished
move.js          which movement is allowed to happen
       ╲              │              ╱
        collidersOf(scene)   — one walk, three readers
```

`collidersOf()` is the only shared thing: the same list, in the same canonical order, with the same
rules about what is switched off. A second walk derived from that one would be **two different
answers to "what is in this scene"**.

**`Is Overlapping` still answers a question of geometry**, never "did a resolution happen". And
`Enter` / `Stay` / `Exit` are exactly what they were: a differential test would have said so if
they had moved.

**An accepted consequence: landing on the floor raises no `On Collision`.** A body stopped by the
floor ends up **flush** against it — they share an edge and no area — and "touching is not
overlapping" (ADR-0059 §3). That is what makes the model readable: what **blocks** is asked with
`grounded`, what **detects** is asked with `On Collision`, and a collider never half does both.

---

## 4. A step's order, and why movement comes last

```
1. Collisions.update(scene)     against the Transforms the previous step left
2. every Component, then the graph bound to its type, in canonical order
3. moveBodies(scene, dt)        gravity → integration → sweep → resolution → grounded
4. input.commit()
```

**Movement is AFTER the graphs, and that is this ADR's main decision.** If a body were moved during
the Component walk — which is what `Velocity` did — then a graph reading a key and writing a
velocity **further along in the same walk** would be integrated on the next step: the character
would respond one frame late, for a reason invisible on screen. The test
`'a speed written during the step moves the body in that same step'` and its counter-test measure
exactly that gap.

**Detection stays at the beginning**, against the previous step's positions (ADR-0059 §4): a
`Destroy` in a collision callback still cannot rewrite the events the step had already decided.

**`grounded` is written at stage 3 and read at stage 2 of the next step.** That is not a delay: "am
I standing" cannot be known before having moved. A jump triggered on frame N is integrated on
frame N — the key and the movement are in the same step.

**A sweep, one axis at a time, X then Y.** The allowed distance is the smallest **gap** to a solid
ahead, never a position sampled after the move:

- **nothing tunnels.** A thousand units in one step against a four-unit wall stop at the wall,
  because the gap is what it is whatever the thickness. No substeps — subdividing would make the
  result depend on the number of substeps.
- **it slides, without anyone writing a projection.** Only the blocked axis is stopped, and only
  its velocity is cancelled. For an axis-aligned box against an axis-aligned wall, "cancel the
  normal component, keep the tangential one" **is** that, in two subtractions.

**Bodies are resolved in canonical order, one after another**, each seeing where the previous ones
stopped. This is a character controller, not a simultaneous solver: no iteration count to tune, and
the alternative would require the mass and impulse §6 refuses.

---

## 5. The Inspector and the graphs learned nothing new

`gravity` is a number, `solid` a checkbox, `grounded` a read-only boolean: three rows the Inspector
draws with the controls it already has (ADR-0023). **No node was added.**

A platformer's controls are written with what already existed:

```
On Key ArrowLeft  ▸ Down     → Set Property ▸ Velocity ▸ x = -190
On Key ArrowLeft  ▸ Released → Set Property ▸ Velocity ▸ x = 0
On Key Space      ▸ Pressed  → Branch (Get Property ▸ Body ▸ grounded) ▸ True
                             → Set Property ▸ Velocity ▸ y = -560
```

A `Set Velocity` or a `Jump` would have duplicated what the Property System already does, and the
question "why that node rather than Set Property" would have had no answer (ADR-0040 §1). That
graph is `tools/demo/platform.js`, played by a test and by a browser.

---

## 6. What this ADR does not decide — and does not pretend to have

| Refused | Why |
|---|---|
| **Mass, impulse, restitution, friction** | Each one needs a simultaneous solver and a set of settings with no good default. None of it is needed to stand on a floor |
| **Physical rotation** | Boxes are axis-aligned (ADR-0059 §3); a rotating box is no longer an AABB, and the whole sweep is written for AABBs |
| **Joints, springs, constraints** | An engine inside the engine |
| **Slopes and one-way platforms** | Two real platformer features, and two product decisions: what "walking up a slope" is, and which way you pass through a platform. The per-axis sweep will accommodate them; it does not invent them |
| **Moving platforms that carry a body** | Requires transmitting a solid's movement to whatever is standing on it — so knowing what is standing on it, so a contact kept between two steps. That is state, and this pass has none |
| **Depenetration** | A body that **starts** inside a wall is not pushed out: the axis concerned ignores it, so it can get out. Freezing it there would be worse than the overlap we claimed to be fixing |
| **`grounded` without gravity** | `grounded` is "my downward movement was stopped this step". With `gravity = 0` and zero velocity there is no downward movement, so no "standing" — and a top-down game has no use for it |
| **A body parented to a rotated or scaled object** | Movement goes back through the inverse of the parent's matrix, so it is correct; but the BOX of a rotated collider is its enclosing AABB (ADR-0059 §3), and that approximation is unchanged |

---

## 7. The broad phase is reused, not rewritten

A pair the grid ruled out must **never** become work in the solver. The pass therefore hands it the
same inputs, in the same canonical order, with one difference: a body's bounds are **stretched to
where it is going**, so the grid only rules a pair out if the body cannot reach it during this step.

`node tools/bench-physics.mjs` — the same pass, once with the grid's candidates, once against every
collider:

| bodies | solids | grid | every collider | saved |
|---|---|---|---|---|
| 1 | 200 | 0.886 ms | 1.305 ms | 1.5× |
| 20 | 200 | 1.099 ms | 2.657 ms | 2.4× |
| 100 | 500 | 3.702 ms | 16.634 ms | 4.5× |
| 400 | 2000 | **10.390 ms** | 249.487 ms | **24×** |

The loop is quadratic **without** the grid; with it, four hundred bodies in two thousand solids fit
into ten milliseconds per step.

---

## 8. Counter-tests

| Verified | Where |
|---|---|
| A body falls and stops **exactly** on the floor, vertical velocity cancelled | `runtime/physics/move.test.js` |
| Five hundred steps at rest, without a thousandth of a unit of drift | the same |
| Walking on the floor is not blocked by the floor being walked on | the same |
| Leaving the edge of the floor makes `grounded` false | the same |
| A wall stops the horizontal axis and lets you slide along it | the same |
| A ceiling cancels the rise, and is not a floor | the same |
| A corner stops both axes | the same |
| A thousand units in one step do not go through a four-unit wall | the same |
| Several candidate solids: the nearest one wins | the same |
| A trigger is passed through **and** produces Enter / Stay / Exit | the same |
| A body with no collider is stopped by nothing; a collider with no body is never moved | the same |
| A `Body` switched off gives movement back to `Velocity` | the same |
| A velocity written during the step moves the body **in that step** | the same |
| **Counter-test**: without `Body`, that same write arrives one step later | the same |
| The jump is conditioned on `grounded`, and there is no double jump | the same |
| A floor destroyed mid-air stops stopping anything | the same |
| Empty scene, scene with no bodies, no scene at all | the same |
| Headless: two runs, one result | the same |
| Two Runtimes on two identical scenes: same position, velocity and `grounded` | the same |
| The order in which the floors were added does not change where the body lands | the same |
| No physics state survives a scene change — the pass has none | the same |
| **Grid and exhaustive walk: same positions, velocities and `grounded` across five seeds** | the same |
| **Counter-test**: a body that ignores its blockers ends up somewhere else | the same |
| A complete platformer, played through a game client's door | `tools/demo/platform.test.js` |
| Walking, stopping, hitting both walls, jumping, landing on a ledge | the same |
| Not a single frame spent inside a wall, over four hundred steps | the same |
| The coin is passed through without slowing down, and still reports itself | the same |

---

## 9. The demo

`tools/demo/platform.js` — a floor, two walls, a ledge, a coin that does not block, a character.
Built **only** with the public API; played by `platform.test.js` under Node and by
`tools/demo/platform.html` in a browser, verified there: the character falls and lands, walks,
passes through the coin (which disappears and writes to the HUD), jumps, bumps into the underside of
the ledge, and stops dead against the right-hand wall.

There is **not one collision node** in its `.px`.

---

## 10. Consequences

### Positive

- A platformer or a top-down game with real walls can be built without writing a solver.
- ADR-0059's collision contract is intact: the three ideas stay three.
- Nothing goes through a wall, at any speed, with no substeps and no dependency on frame rate.
- No node added to the catalogue: the Property System was enough.

### Negative

- Landing on a floor raises no `On Collision` (§3) — it is consistent, and it has to be learned.
- Two bodies pushing each other are resolved one after the other: the second sees the first already
  moved. That is deterministic, it is not symmetric.
- No slopes, no moving platforms, no depenetration (§6).
- `Velocity` now has two timings depending on whether a `Body` is there; it is documented on both
  sides, and it is the price of not having rewritten the movement of everything that moves.
