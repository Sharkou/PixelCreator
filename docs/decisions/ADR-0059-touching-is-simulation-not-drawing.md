# ADR-0059 — Touching is a fact of simulation, not a picture

- **Status:** **accepted** (2026-09-11)
- **Decides:** where collision detection lives; what a Collider declares; what the first version really measures; when a step decides its events; what `Enter`, `Stay` and `Exit` mean; whether the event is Object↔Object or Collider↔Collider
- **Depends on:** ADR-0002 (Transform), ADR-0004 (Component lifecycle), ADR-0011 (the server is the authority), ADR-0012 (error isolation), ADR-0013 (the camera is an Object), ADR-0014 §1 (`runtime/`, not `core/`), ADR-0034 §3.1 and §3.4 (canonical order, two failure families), ADR-0046 §6 (one card, several moments), ADR-0056 §5 (what a step does with a created or destroyed Object), ADR-0058 (an execution may outlive a step)
- **Does not decide:** physical resolution; collision layers; a polygon collider; a broad phase — see §7

---

## 1. Problem

A creator can spawn, move, animate and destroy an Object. They cannot know that **two things are
touching**, so they can write neither a shot that hits, nor a coin picked up, nor a door walked
through, nor damage. It is the last thing missing between "objects are moving" and "this is a game".

What is asked for here is **detection, not an engine**. No Box2D, no solver, no rigid body: knowing
that two objects overlap, and firing a graph.

---

## 2. `runtime/collision/`, not `core/`, not `rendering/`

The argument is ADR-0014 §1's, applied a third time:

> "The Core knows about no input. An `Object` has no input; a simulation does."

An `Object` does not bump into things either. What does is a **simulation**. And it is above all not
rendering: an overlap is a function of the `Transform`s the step has just produced, it has to be
**identical on a server and on every client**, and a server has no screen. Putting it next to the
`SceneRenderer` would make the game's truth depend on what is drawn.

```text
runtime/clock/      when
runtime/input/      what was done
runtime/random/     the luck
runtime/collision/  what is touching
```

Four things the environment would otherwise supply, four directories, and the Runtime holds them all.

---

## 3. What a Collider declares, and what it really measures

```text
Box Collider
Width        32
Height       32
Offset X      0
Offset Y      0
```

**Declared, never inferred from the Sprite.** A size taken from the image would be a size nobody typed,
changing when the image changes, invisible in the Inspector — and "why didn't it hit?" would have no
answer on screen. A beginner has to be able to **read** what collides.

**An AABB of the transformed corners, and it says so.** The four corners go through `worldMatrix()` —
so position, scale and the whole parent chain are exact — and the answer is the smallest axis-aligned
box containing them. Under **rotation**, that box is larger than the drawn shape: a square rotated 45°
is reported ~1.41 times wider. It is a real approximation, **conservative** (it never misses a true
contact, it may announce one a little early), and calling it an OBB would be a lie from the first
rotation.

**Touching edge to edge is not overlapping.** Two boxes sharing exactly one line share no area;
counting that as contact would make a wall placed flush against another collide forever.

**No `trigger`, no `solid`.** This slice resolves nothing: a collision is an **overlap** and an
**event**. A boolean with no observable difference would be a word copied from another engine to
promise behaviour this one does not have.

---

## 4. A step decides its events before a single graph runs

```text
1.  detect the overlaps            ← against the previous step's Transforms
2.  derive Enter / Stay / Exit
3.  run the behaviours             ← canonical order, Object by Object
4.  close out the input
```

It is the order that makes the dangerous case correct. Two bullets hitting an enemy on the same step:
if detection ran **after** or **during** the behaviours, the second would see a world the first has
already dismantled, and whether it fires would depend on the traversal order. Deciding first makes the
set of events **immutable for the duration of the step**: a `Destroy` inside a callback cannot
retroactively erase an event already decided.

It is also exactly the gesture ADR-0056 §5 already makes for execution order — the order is
materialized before the loop — applied one layer up.

### 4.1 What a destroyed Object produces: nothing

A pair one of whose members is no longer in the Scene **produces no transition**, not even an `Exit`.
Two reasons, each sufficient: it would return a handle to something the Scene no longer holds, and
"what you were touching has stopped touching you, because it has stopped existing" is not a sentence a
creator can act on. The disappearance is read through the reference that dies, which is the family
ADR-0034 §3.4 already defines.

An Object **created** during a step enters no pair of that step: the overlaps were decided before it
existed. It collides on the next step — the same answer ADR-0056 §5 already gives for execution.

---

## 5. One card, three moments, and they are disjoint

```text
On Collision
→ Enter     the step where they start touching
→ Stay      every FOLLOWING step, while they are touching
→ Exit      the step where they stop
Other       the other Object
```

One card, like `On Key` and for the same reason (ADR-0046 §6): a creator has to tell "it has just
touched" from "it is still touching" before their first damage works, and three nearly identical cards
is the problem one card does not have.

**`Enter` and `Stay` do not overlap.** The first step fires `Enter` and nothing else. Firing both would
make "one damage" and "one damage per step" a single wire, from which the creator would have to
subtract the other.

**Object ↔ Object, and the model settles it for us.** One Component per type and per Object
(ARCHITECTURE.md): a second `BoxCollider` is **refused**. "A player with two hitboxes hits an enemy
twice" is therefore not a constructible case today. The detector nevertheless gathers every shape an
Object carries, which a future `Circle Collider` beside a box will need, without changing that
contract.

### 5.1 An event may happen several times in one step

Touching two enemies at once is **two** events with two different `Other`s — which one firing could not
carry. An input node may therefore answer a **list of firings**, each with its own pushed values, and
the interpreter runs one flow per entry. A list of **strings** stays one firing toward several ports,
which `On Key` answers when a key goes down and is held in the same step; the two are told apart by
what the list **holds**, with no flag.

---

## 6. Asking rather than waiting

```text
Is Overlapping
A  object
B  object
→  boolean
```

It reads **the step's snapshot**, never its own geometry. Measuring here would be a second opinion on
what "touching" means, and would answer a different question from the event firing beside it in the
same step. Nothing to query — no collider, a destroyed Object, an empty socket — is `false`: game
states, not faults (ADR-0034 §3.4).

---

## 7. O(n²), measured, and behind a seam

Every pair is tested. Measured on this repository, the cost of one detection step:

| Colliders | ms per step | share of a 60 Hz frame |
|---|---|---|
| 10 | 0.07 | 0.4 % |
| 100 | 0.61 | 3.7 % |
| 500 | 3.9 | 23 % |
| 1000 | 11.3 | 68 % |

**Kept as it is.** Up to a few hundred colliders — the scale of a beginner's 2D game — it is not the
game's problem. A quadtree built today would be a structure to keep correct for a scale nobody has yet
reached.

The public surface is `overlapping()` and `transitions()`. A broad phase replaces the middle of
`update()` with no contract moving, the day a measurement asks for it — and the line at which it will
start asking is written above.

---

## 8. Observable contracts

| Contract | Verifiable by |
|---|---|
| A world box follows position, scale and the parent chain | `runtime/collision/collisions.test.js` |
| A rotation gives the corners' AABB, and it is wider | the same |
| Edge to edge is not overlapping | the same |
| `Enter` once, then `Stay`, then `Exit` once, never together | the same |
| Both sides are told, each about the other | the same |
| An inactive Object, a Collider turned off, no Collider: nothing | the same |
| The same scene built in two orders gives the same transitions **in the same order** | the same |
| Save/reload gives the same pairs | the same |
| A pair one of whose Objects has vanished produces nothing | the same |
| Touching two things at once is two events, each with its own `Other` | `runtime/gameplay.test.js` |
| Two Objects that destroy each other on contact: one event each, no crash | the same |
| A destroyed Object then raises neither `Stay` nor `Exit` | the same |
| A spawned Object collides on the NEXT step | the same |
| `Is Overlapping` answers from the same snapshot as the events | the same |
| Two Runtimes see the same transitions on the same steps | the same |

---

## 9. What this ADR does not decide

| Open point | Why |
|---|---|
| **Physical resolution** | Nothing here pushes anything back. That is a whole decision — restitution, mass, resolution order, tunnelling — and taking it in passing would be exactly what ADR-0026 §11 files among "the decisions a hasty implementation takes in the architect's place" |
| **Collision layers** | "who can touch whom" is a product feature; today a graph filters with `Get Property ▸ Tag`, which is readable and enough |
| **A polygon collider** | The model does not forbid it; it is waiting for a need |
| **Exact rotation (OBB)** | §3 says it rather than hiding it. A SAT over two oriented boxes is fifteen lines with the existing matrices, and will be a refinement of `boxesOverlap()` — not a new boundary |
| **The collider gizmo in the Scene** | The Inspector makes it editable today; drawing it needs a gizmo layer the Editor does not have |
| **The broad phase** | §7, with the number at which it will justify itself |
