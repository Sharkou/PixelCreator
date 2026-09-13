# ADR-0064 — Measure before optimising, refuse before running

- **Status:** **accepted** (2026-09-12)
- **Decides:** which partition replaces the O(n²) loop; what a broad phase is not allowed to change; how that is proved; where a broken graph is stopped
- **Depends on:** ADR-0012 (error isolation), ADR-0015 (a `.px` is a behaviour), ADR-0027 (graph model, `validateGraph`), ADR-0034 §3.1 (canonical order), ADR-0059 (touching is a fact of simulation)
- **Amends:** ADR-0059 §7 — the broad phase arrives, with the number that justified it
- **Does not decide:** physical resolution; collision layers; the polygon collider; the exact OBB — ADR-0059 §9 is unchanged
- **Amended on 2026-09-12 (ADR-0072):** "only ERRORS hold back binding" applies **during**
  execution too. A node whose validator raises nothing but a warning — a property not yet
  chosen — must not throw on every step: an exception unwinds the whole `walk`, so it also
  stopped everything wired after it

---

## 1. Two debts, one shape

ADR-0059 §7 said the O(n²) loop would be replaced "the day a measurement asks for it".
`validateGraph()` had known since ADR-0027 how to say that a wire names a port that does not
exist, and nobody was asking it before playing. Both debts were already **named**; all that was
missing was a number for the first and a caller for the second.

```
1000 colliders spread out    7.56 ms per step   — 500,000 box tests for 0 contacts
1000 colliders overlapping 760    ms per step
```

The second number is not a broad phase's problem: a thousand things genuinely touching **are** a
half-million pairs. The first one is entirely its problem.

---

## 2. A uniform spatial hash, not a quadtree

The world is 2D, the shapes are AABBs, and a game's objects are mostly of comparable size and
mostly clustered — the exact case where a grid is best and a tree is worst. It is also forty
lines: **no structure to rebalance, no node to split, no depth to tune and nothing to keep
between two steps.** That matters more than the asymptotics: a tree that has to stay correct
across a thousand spawns and destructions per second is a second source of bugs, and this has no
state at all.

| Decision | Reason |
|---|---|
| **cell size = mean extent** | a grid sized to what it holds puts a typical object in one to four cells. A fixed size would be a setting with no good value: a game of 8 px balls and a platformer of 256 px tiles want two different ones, and no creator should have to know that |
| derived from the state | two machines compute the same size, hence the same buckets |
| **fewer than 24 objects: no partition** | at two dozen boxes, the whole brute-force loop costs less than allocating a `Map` — and a scene that size is the overwhelming majority |
| **more than 64 cells for one object: the "large" list** | a 4000-unit floor would be inserted into hundreds of cells. Whatever covers everything is paired with everything, which is what it would have been paired with anyway |
| deduplication by `i * n + j` | two boxes sharing three cells are **one** pair; an arithmetic key allocates nothing where a dense scene offers a hundred thousand candidates |
| **final sort into canonical order** | §3 |

---

## 3. The observable contract does not move — and that is proved, not asserted

What changes is **which pairs are tested**. What does not change:

- which pairs overlap;
- the order in which they are reported;
- `Enter`, `Stay`, `Exit` and their disjointness (ADR-0059 §5);
- the pair at the **Object** level (ADR-0059 §5);
- what `Is Overlapping` answers;
- determinism.

A `Map` iterates in insertion order, which is an order the hash invents. The caller's contract is
the scene's (ADR-0034 §3.1), and two machines have to agree on it: **candidates are therefore
sorted by `(i, j)` before they leave**. That is what makes the hash an implementation detail
rather than an observable one.

---

## 4. The proof is differential, not unit

A change of partition is the easiest kind of silent regression: nothing throws when a candidate
pair is missed — a collision simply does not happen, in one corner of one level, for one layout.
Unit tests of the grid do not find that, because a wrong grid stays consistent with itself.

> **`Collisions` keeps an `exhaustive` mode, and the test replays the same scenes both ways.**

Eight distributions generated from a seed — spread out, clustered, stacked, tiny, huge, one giant
object among small ones — and the **sequences** of transitions must be identical, not just the
sets. Plus six steps of movement, so that `Enter`, `Stay` and `Exit` are compared and not just
one instant's overlaps.

Nothing in the product uses `exhaustive` mode: it exists so that this sentence can be verified.

---

## 5. The numbers, before and after

`node tools/bench-collision.mjs`

| layout | n | brute force | grid | gain | pairs tested (brute → grid) | real contacts |
|---|---|---|---|---|---|---|
| spread out | 1000 | 45.87 ms | **2.87 ms** | 16× | 499,500 → 0 | 0 |
| spread out | 5000 | 1374.21 ms | **17.68 ms** | **78×** | 12,497,500 → 0 | 0 |
| clustered | 1000 | 39.40 ms | **4.92 ms** | 8× | 499,500 → 2,700 | 1,700 |
| clustered | 5000 | 1422.13 ms | **27.91 ms** | **51×** | 12,497,500 → 13,500 | 8,500 |
| stacked | 1000 | 854.14 ms | 970.09 ms | **0.9×** | 499,500 → 499,500 | 499,500 |

**The benchmark reports two costs, not one.** `tested` is what a broad phase moves; `contacts` is
what nothing can move. Without both, the last row would read as a failure of the grid when it is
the measurement of a pathological scene: a thousand objects that **all** overlap are a
half-million real pairs, and the grid pays for them **plus a 10 % tax** for having proposed what
it could not rule out. That is honest and it is the price; the case does not exist in a game.

---

## 6. A broken graph is stopped at the door, not in the loop

A wire to a non-existent port was reported by `validateGraph()` and **silently ignored** at
runtime: the interpreter did not find the port, the input took its default value, and every node
kept running. Met for real while writing the demo game — `time.delta` has a `seconds` port, not a
`delta` one — and the symptom was "the player does not move", with not a word anywhere.

> **The check is done once, at binding time, in the Project layer.**

| Where | Why not elsewhere |
|---|---|
| `project/graphs.js` (`bindGraph`, `checkGraph`) | it is **the** door every `.px` goes through to enter a game: loading a project, installing an edited definition, arriving over the live channel |
| not in the interpreter | validating on every port read would be a per-frame cost for a question that never changes |
| not in `Behaviors` | that is a **duck-typed** seam: its own tests bind hand-made objects to hand-made interpreters. A validator in there would be judging things it does not govern |

**Only ERRORS hold back binding.** A `Set Property` with nothing chosen is a graph **in
progress**, and refusing to run it would make the Editor unusable while you build it — it is a
warning, and ADR-0027 already said so.

**A refused `.px` is not fatal (ADR-0012).** Its Component exists, attaches and carries its
properties; only the behaviour is withheld, and the reason is reported along with the node and
the port. A project opens; it says what is not running.

---

## 7. Counter-tests

| Verified | Where |
|---|---|
| Grid and brute force find **exactly** the same pairs, across eight distributions | `runtime/collision/broad-phase.test.js` |
| They agree on `Enter`, `Stay`, `Exit` over six steps of movement | the same |
| Far fewer pairs tested when nothing is near anything | the same |
| **Every** pair tested when everything is touching, and saying so | the same |
| A small scene is not partitioned | the same |
| A pair found in several cells is proposed once | the same |
| Candidates come out in canonical order | the same |
| A huge object is paired with everything rather than filling the grid | the same |
| Zero-sized boxes do not divide by zero | the same |
| **Counter-test**: reporting the same pairs in a different order is a different answer | the same |
| A wire to a non-existent port is an error, and already was | `project/graphs.test.js` |
| An unknown node type too | the same |
| A graph in progress is a warning, and runs | the same |
| A non-runnable graph **is not bound**, and the reason is reported | the same |
| The TYPE is registered all the same: only the behaviour is withheld | the same |
| A broken `.px` does not stop the others from loading | the same |
| Binding directly goes through the same door | the same |
| **Counter-test**: without the door, the wire is ignored and nothing is said | the same |

---

## 8. Consequences

### Positive

- A scene of a thousand spread-out colliders goes from 45.87 ms to 2.87 ms per step; five thousand, from 1.37 s to 17.7 ms.
- The collision contract is unchanged, and a differential test guarantees it for the next
  implementation too.
- A broken graph says so, once, with the node and the port — instead of an object that has
  silently stopped moving.

### Negative

- The "everything is touching" case costs 10 % more than before. It already cost 850 ms per step.
- `Collisions` gains a mode that exists only for tests; it is documented as such.
- A `.px` being written whose wire has been broken stops running until it is fixed — that is the
  intended behaviour, and it is a visible change for anyone who had got used to the silence.
