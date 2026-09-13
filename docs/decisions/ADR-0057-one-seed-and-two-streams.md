# ADR-0057 — One seed, two streams, and an editing identity is not a simulation identity

- **Status:** **accepted** (2026-09-11)
- **Decides:** where a simulation's seed lives; who owns the random state; how an identity created by a step is produced; what is deterministic and what deliberately is not
- **Depends on:** ADR-0010 (an identity is an opaque ID), ADR-0011 (the server is the authority), ADR-0014 (input is passed into the runtime), ADR-0034 §3.1 (canonical order), ADR-0035 (`Runtime.step()`'s order), ADR-0049 (an identifier is read aloud), ADR-0056 (a copy is the model)
- **Closes:** ADR-0045 §11.5's open point for `Random`; ADR-0056 §8's open point about the determinism of identities under replication
- **Completed by:** ADR-0058 (2026-09-11) — `Delay`, left open below, is settled: per-instance execution state, and a time that comes only from `deltaTime`
- **Does not decide:** `Delay` (per-instance execution state, a separate question); the transport that would carry the seed from a server to its clients; resuming a simulation mid-flight — see §7

---

## 1. Problem

ADR-0011 makes the server the authority over a simulation that **every client also runs**. That is
worth something only if the same simulation, run twice, arrives at the same place. Two halves of that
promise were already kept:

| Already solved | By |
|---|---|
| time | `Clock` — a fixed step, never the screen's cadence |
| input | ADR-0014 — passed to `step()`, never a global |

And one exception remained that nobody had written down: **a graph that creates an Object reaches a
source the two machines do not share.** `duplicateObject()` drew its identities from `createId()`, and
therefore from the platform's CSPRNG. Two clients running the same `Spawn` on the same step created two
objects they could never again agree on — and any reference stored afterwards pointed, for one of
them, at something the other had never had.

The same class of problem was waiting for `Random`, which ADR-0045 §11.5 refused to write for exactly
that reason: "An unseeded `Math.random()` desynchronizes. You have to decide where the seed lives and
who assigns it."

### 1.1 Inventory, and it is short

Measured over all of `src/`, tests excluded:

| Source | Where | Class |
|---|---|---|
| `createId()` inside `duplicateObject()` | `core/duplicate.js` | **A — to fix**: a consequence of a step |
| `Math.random()` | **nowhere** in executed code | — |
| `createId()` — undo batches, `ResourceId`, `ProjectId`, node ids, `SceneId`, `new Object()` | `editor/`, `project/`, `core/graph/` | **B — an editing identity**, outside the simulation |
| `Date.now()` | `project/project.js`, `project/resource.js` (`created`, `modified`) | **B** — resource metadata, never read by the simulation |
| `performance.now()` | `editor/viewport/viewport.js` | **C — deliberate real time**: display cadence |
| `ParticleSystem`'s LCG | `runtime/rendering/components/` | **D** — already deterministic, an instance seed fixed at construction |
| `Map`/`Set` iteration | `input/`, `behaviors/`, `scene-renderer` | **D** — all sorted or contractual; `Runtime.step()` reads the canonical order (ADR-0034 §3.1) |

**One single entry in A.** The fix therefore did not have to be big: it had to be in the right place.

---

## 2. The Runtime owns randomness, because a simulation is what it is

`runtime/random/`, **not** `core/random/`. The argument is ADR-0014 §1's, word for word:

> "The Core knows about no input. An `Object` has no input; a simulation does."

An `Object` has no luck either. What does is a **simulation**, and a simulation is what the Runtime is.
The three things the environment would otherwise supply a game become three directories side by side,
and it is the structure that decides, not a preference:

```text
runtime/clock/    when              a fixed step
runtime/input/    what was done     passed to step() (ADR-0014)
runtime/random/   the luck          seeded (here)
```

### 2.1 One seed, two named streams

```text
seed ──┬── "seed:random"  ──►  ctx.random          what a graph draws
       └── "seed:ids"     ──►  ctx.createObjectId   what a step creates
```

**Two streams and not one counter**, and the reason is measurable on a real graph: with a single
counter, "how many dice have been rolled" becomes an input to every identity minted afterwards. Adding
a `Random` **anywhere** then renumbers the whole match, and adding a `Spawn` changes every subsequent
random value. A creator has no way of reading that coupling off the canvas.

**Derived by NAME, not by alternating draws.** A third stream costs one line and shifts neither of the
others — whereas "every other draw is for ids" freezes the number of streams forever.

### 2.2 This is not a framework

Two `Random`s and a string. No stream registry, no hierarchy, no serialization of position. `Random`
exposes `next()`, `between()`, `fill()` and nothing else.

---

## 3. An editing identity is not a simulation identity

It is the distinction that stops the fix from being a naive generalization.

| | an **editing** identity | a **simulation** identity |
|---|---|---|
| Example | the Object a creator places in the Hierarchy; a `ResourceId`; an undo batch | the Object a `Spawn` creates at step 37 |
| What it is | **content**, minted once and never re-minted | a **consequence** of a step, which two machines must mint identically |
| Drawn from | the platform's CSPRNG | the `seed:ids` stream |
| Replayable | no, and there is nothing to replay | yes, and it has to be |

> **`createId()` does not become a seeded generator. It is the Runtime's path that supplies the
> identity at duplication time.**

Concretely, the seam is a parameter and nothing else:

```text
duplicateObject(scene, source, { createId })   ◄── default: core/id.js
        ▲
        └── the Spawn node passes ctx.createObjectId
```

The Editor learns nothing, depends on no Runtime, and keeps minting its identities as before. The Core
does not know what a simulation is: it takes a factory.

---

## 4. A simulation identifier is an ordinary identifier

`createId(length, { randomBytes })`. The seam goes down to the **bytes**, and no higher:

| What does not move | Why |
|---|---|
| the 22-letter alphabet with no ambiguous digits | ADR-0049 — an identifier is read aloud |
| the length of 14 | 62 bits, ADR-0010's guarantee |
| the rejection at 242 | 22 does not divide 256; masking would bias the first letters |

A second identity function for the Runtime would have been a **second answer** to "what is an
identity". There is only one, and what changes is where the bytes come from.

> **An identifier drawn from a seeded stream is reproducible, and therefore guessable.** That is
> exactly what you want of a simulation identity and exactly what you do not want of a `ProjectId` in a
> URL. §3's distinction is also what keeps the CSPRNG where it matters.

---

## 5. One generator in the repository

`ParticleSystem` already carried a deterministic LCG, with that very comment — it was right before
everyone else. It goes through `advance()` rather than a second copy of the constants.

**It keeps its own position in the stream, and that is not an oversight.** An emitter restarts in the
same place on every construction, so its particles are a function of the scene and of nothing else:
they do not shift because a graph rolled a die earlier in the frame, and they are not part of what the
seed decides. One thing is shared: the generator's definition.

`unitOf()` **throws away the low-order byte**, and it is visible where a creator meets it first: an
LCG's low bits have a short period, so `next() < 0.5` read on the whole state gives
heads-tails-heads-tails. A test says so.

---

## 6. The seed is drawn, and it is said

`new Runtime(scene, { seed })`. With no seed, the Runtime **draws one** and exposes it as
`runtime.seed`.

| Refused | Why |
|---|---|
| A constant default seed | Every match would be identical to the last — the opposite of what a creator expects from `Random` |
| A hidden draw | A bug would not be reproducible; "which seed?" would have no answer |

**Controlled means said.** The difference between two matches is one string long, and that string is
readable on the object. It is what makes a replay possible with no transport: the starting payload plus
the seed are all you need.

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| Two Runtimes, one seed: the same identities created by `Spawn` | `runtime/determinism.test.js` |
| Two Runtimes, one seed: the same `Random` draws | the same |
| Two Runtimes, one seed: the same serialized payload after N steps | the same |
| The internal references of a spawned subtree are the same on both sides | the same |
| Different seeds: draws and identities diverge | the same |
| Adding a `Random` does not change what a `Spawn` creates | the same |
| Adding a `Spawn` does not change what a `Random` draws | the same |
| The starting payload + the seed replayed: the same final state | the same |
| An identity minted outside the simulation is still drawn from the machine | the same |
| One seed is one run, two seeds are two runs | `runtime/random/random.test.js` |
| A draw is in [0, 1), and a coin does not alternate | the same |
| No shipped node names `Math.random` | `core/graph/nodes.test.js` |

---

## 8. What this ADR does not decide

| Open point | Why |
|---|---|
| **Who sends the seed** | The transport does not exist (ADR-0042 §6: two windows are already two clients, what they lack is a channel). When it does, the seed is one more string in the opening message — nothing here moves |
| **Resuming a simulation mid-flight** | The contract is "same start + same seed + same steps". Resuming halfway would require serializing the streams' POSITION, and therefore making it scene state. Nobody needs it while a client joins by receiving a snapshot |
| ~~`Delay`~~ | **Settled by ADR-0058**: per-instance execution state, beside `started`; time comes from `deltaTime` and determinism from that same contract |
| **A copy's particles** | Two copied `ParticleSystem`s emit the same pattern, since an emitter's seed is fixed at construction (§5). That is too much determinism rather than too little, and it is a rendering question |
| **The camera `preview/client.js` chooses** | `scene.objects().find(…)` reads insertion order: class D, it does not touch the simulation, but two clients could look through two cameras if a scene carried two |
