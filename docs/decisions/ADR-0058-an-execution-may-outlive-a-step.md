# ADR-0058 — An execution may outlive the step that began it

- **Status:** **accepted** (2026-09-11)
- **Decides:** where a graph execution's temporary state lives between two `Runtime.step()`s; what a continuation is and what it holds; whether one node can wait twice at once; where time comes from; what happens to a wait when what it belongs to disappears
- **Depends on:** ADR-0004 (Component lifecycle), ADR-0011 (the server is the authority), ADR-0012 (error isolation), ADR-0015 §3 (a graph is read once, run per instance), ADR-0027 (the graph model and the budget), ADR-0034 invariant 3 (a handle is not memoized), ADR-0035 (`Runtime.step()`'s order), ADR-0056 §4 (a flow node may return a value), ADR-0057 (one seed, two streams)
- **Closes:** ADR-0045 §11.5's last open point — `Delay`
- **Extended on 2026-09-11:** §6 — a node may ask to be **re-run** rather than to defer what follows it. `Wait Until` and `Every` follow with no other mechanism
- **Extended on 2026-09-11:** §6.3 — a continuation carries the node's **private** state for that execution. It is exactly the extension §10 had recorded as missing for `Tween`, and nothing more
- **Does not decide:** resuming a simulation mid-match — see §10
- **Amended on 2026-09-12 (ADR-0072):** the list stays a list — two passes through one `Delay` still wait independently — but it has a **ceiling** (`MAX_PENDING`), and a resumed execution that fails no longer takes the ones that were due with it

---

## 1. Problem

`Delay` was the last node ADR-0045 §11.5 refused to write, and its difficulty was never time:

> "**a decision.** Where does the pending timer live, does it survive a `bind`, is it serialized, what
> does an `undo` do?"

The real subject is wider than that node: **where does a graph execution's temporary state live between
two steps?** As long as no node stopped in the middle of a flow, the question did not have to be asked
— an execution was born and died inside a `step()`, entirely on the JavaScript stack. The first node
that says "not yet" asks it in full, and the answer decides the behaviour of every temporal node to
come.

---

## 2. Three things, and the repository already told them apart

The vocabulary was missing, the code was not:

| Level | What it is | Where it lives today | Shared by |
|---|---|---|---|
| **definition** | the graph read once, immutable | `compiled`, memoized by `Behaviors.#factories` (a WeakMap keyed by graph) | every Component of the type |
| **instance** | this `.px` on this Object | the closure of `create(component)`, held by `Behaviors.#running` (a WeakMap keyed by component) | nothing |
| **execution** | one particular firing of an event | `runFlow()`: a stack, a budget, a `produced` table — **on the JS stack** | nothing |

`started` already lived at level 2, with the comment that says why: "ONE EXECUTION STATE PER COMPONENT
[…] two Controllers must each get their own first step".

> **A suspended execution is execution state, and execution state belongs to the instance.** It is
> filed beside `started`, in the closure `Behaviors` holds by WeakMap.

### 2.1 Why not elsewhere

| Model | Rejection |
|---|---|
| **B — the interpreter** | The interpreter is one reading shared by every instance of the type. Putting the waiting state there would make a `Delay` on one enemy hold back another's shot. |
| **C — the Runtime, as a queue of suspended executions** | The Runtime knows about no node, no port and no produced-value table: it knows Components. Teaching it all of that to carry a list would be a generic scheduler — and you would then have to write a cancellation pass for every way an Object can disappear. |
| **On the Component, as a property** | It would be scene state: serialized, replicated, shown in the Inspector. A wait is none of those things (§8). |
| **On the node** | The graph is immutable as far as the Runtime is concerned (ADR-0016 §7) and shared by every instance. It is the bug §2.1 "B" describes, one layer down. |

### 2.2 What the choice gives for free

**The whole lifecycle, with no line of cancellation.** The closure is reachable only from `Behaviors`'
component-keyed WeakMap. A destroyed Object, a removed Component, a replaced Scene, an abandoned
Runtime: the component goes, the closure goes, and the suspended executions go with it. There is no
cancellation pass **because there is nothing to cancel**.

And the Runtime already drives the resumption without knowing it: it calls
`behaviorFor(component).update(self, ctx)` on every step, in canonical order, for active Objects and
Components only. No new call site, no scheduler.

---

## 3. What a continuation is

A node says **when**, never **whether to wait**:

```text
execute(io) -> { next, wait }
```

`next` is read by `continuationsOf()` as in the four other shapes; `wait` is the fifth and the only one
that does not continue immediately. The interpreter then parks what it would have pushed:

```text
{ remaining, to, produced }
```

| Field | Why it is there, and no more |
|---|---|
| `remaining` | the time left, counted down by `deltaTime` |
| `to` | `{ node, port }` — where to resume. The graph holds all the rest |
| `produced` | what this execution had pushed out of its flow nodes |

**No identity is minted.** A continuation is ephemeral runtime state: it is neither addressed, nor
referenced, nor persisted, so it needs no `ObjectId` and no `ResourceId` (ADR-0010 speaks of content
identities, and this is not one).

**`produced` crosses the wait, and that is safe.** ADR-0056 §4.1 had already extended ADR-0034's
invariant 3 from "a flow step" to "an execution", **on condition that every read of an `object` port be
asked of the Scene again**. That condition is held by `producedFrom()` and does not depend on duration:
a `Spawn` before a `Delay` and a `Set Position` after work, and if the copy has been destroyed in the
meantime the port reads `null` rather than returning a dead handle. Without that, a spawn followed by a
wait would be unusable.

---

## 4. Two passes through one `Delay` wait separately

```text
On Update → Delay(1) → Action
```

starts an execution **on every step**. The answer is explicit:

> **Yes. Two executions of the same node wait independently.** What waits is an execution, not a node.

Technically it is a **list**, not a node-keyed table. A table would make the second overwrite the
first: the graph would silently stop being reentrant, and every later temporal node would inherit the
defect without an ADR ever having decided it. It is a test, not an intention.

### 4.1 The resumption order

**The order in which they were suspended**, and it is already canonical: it follows from the Scene's
canonical order (ADR-0034 §3.1), then the Components' order (ADR-0018), then the payload's order, then
a flow's depth-first walk. Nothing is sorted; the order is read where it already exists.

### 4.2 The order within a step

```text
resume the due waits  →  On Start (on the first step)  →  On Update
```

Two reasons, and the second is decisive:

1. what was suspended belongs to a moment **earlier** than what this step raises;
2. **the step that REACHES a `Delay` must not count down its own `deltaTime`.** A one-second wait
   begun at `t = 0` ends at `t = 1`, not at `t = 1 − dt`. Resuming first guarantees that a continuation
   parked by this step's `start` or `update` stays intact until the next one — by construction, with no
   flag saying which step it dates from.

The due waits are moreover **taken out before any of them runs**: a resumed execution may suspend
again, and an entry added during the loop would otherwise be counted down twice in one step.

---

## 5. What a duration that is not one means

> **A wait is a finite, strictly positive number. Everything else is not another kind of wait: it is no
> wait at all.**

`0`, a negative, `NaN`, `Infinity`, a string: the flow continues **within that very step**. That is not
a rule invented here — it is the numeric convention `number()` already applies in `Clamp`, `Lerp`,
`Translate` and everywhere else in the catalogue.

And it has a consequence the opposite choice would not: **a `Delay(0)` in a loop is an ordinary loop**,
bounded by ADR-0027's budget and reported as such. If `Delay(0)` suspended for a step, a loop would run
forever, one turn per frame, without ever triggering anything — a graph that does not finish and that
nothing reports.

The duration is **read when the `Delay` is reached, then captured**. Re-reading it during the wait
would make a wait fed by a property change length mid-flight: a wait whose end moves is not a wait, and
nothing on the canvas would say so.

---

## 6. Two words, and the second is "ask me again"

`Delay` parks **what follows** the node. Two other forms of waiting cannot: a condition has to be
**re-read**, and a pulse has to **start again**. Neither is a node that has finished.

> **`wait` delays the flow the node names. `again` comes back to THAT node.**

An `again` continuation is parked **at the node itself** rather than at what follows it, so resuming
re-runs its `execute`. That is all it took, and it adds **no node state** anywhere:

| Node | What it answers | What that means |
|---|---|---|
| `Delay` | `{ wait: s, next: 'then' }` | I am done; take `Then` in `s` seconds |
| `Wait Until` | `'then'` or `{ again: true }` | true on arrival, otherwise ask me again next step |
| `Every` | `{ again: i }` then `{ next: 'then', again: i }` | arm the clock, then pulse and rearm |

`again: 0` — what `true` means — is **the next step**, not the absence of a wait. It is the only
reading difference from `wait`, and the reason it is a separate word rather than a flag on the same
one.

### 6.1 One thing tells a node's two passes apart

`io.resumed`. A boolean, **derived from the continuation** and stored nowhere: arriving through the
wire arms `Every`'s clock, coming back makes it pulse. Without it you would have had to remember "when
did I last pulse" somewhere — that is, invent the per-node, per-instance state §2.1 refuses.

**The overshoot is carried over, and bounded to one interval.** The step that crosses the deadline
overshoots it by a fraction; losing that on every turn makes a 1 s interval drift to 1.2 s when the step
is 0.3 s. The carry-over is capped at one interval, which stops an interval of zero — "every step" —
from accumulating a debt it would never repay.

### 6.2 Why `Every` and not an `On Timer` event

An input node is run by the interpreter on **every** update (`runEvent`). A repeating event would
therefore have to remember when it last pulsed, and the only place would be per-node, per-instance
state — a second kind of state this ADR deliberately does not have. `On Start → Every` says the same
sentence with the pieces that exist, and it reads as a sentence.

### 6.3 A continuation also carries what the node was in the middle of doing

`§10` had written the missing contract: *"a continuation holds where to resume, never what the node was
in the middle of doing"*. `Tween` needs both — it has to know how far it has got — so the parked entry
gains **one field**, and `io` **one reader**:

```text
{ remaining, to, produced, kept }        ◄── what the node asked to keep
io.kept                                  ◄── null on the way in, what it kept on the way back
```

**Opaque, and that is the whole contract.** The interpreter never reads inside it, never copies it, and
gives it back only to the node that parked it. It is therefore neither a second kind of value, nor a
port, nor anything a graph or a payload can see.

**Per EXECUTION, never per node.** It travels on the continuation, so two passes through one `Tween`
carry two and neither sees the other — the same reason `pending` is a list and not a node-keyed table
(§4). Two instances of a `.px` are independent for the earlier reason: the closure is per Component.

**And nothing more was added.** No lifetime, no identity, no serialization: the state dies with the
continuation, which dies with the Component (§2.2).

---

## 7. Determinism and budget

Time comes from `ctx.deltaTime` and from nothing else: no wall clock, no `Promise`, no `setTimeout`, no
browser scheduler. The step is fixed and identical on a server and on every client (`Clock`), so **two
Runtimes fed the same steps resume the same executions on the same steps** — ADR-0057's contract
extended to what waits.

The countdown uses **`Clock.advance()`'s relative tolerance**: subtracting 1/60 sixty times does not
leave exactly zero, and a bare `<= 0` would make a one-second wait finish a step late. The defect is the
one `Clock` already documents for its accumulator, met one layer up and fixed the same way.

**A resumed execution is an ordinary execution**: the same stack, the same nodes, the same budget. What
it does not get is the right to go further than one event.

---

## 8. This is not Scene state

A continuation lives in a closure, held by a WeakMap. Nothing reaches the Component from it, so
`serializeScene()` writes none of it and there is no field to ignore.

A reload **starts from the initial state**: waits in progress do not resume. That is exactly the
position ADR-0057 §8 took for the random streams' position, and for the same reason — resuming a
simulation mid-flight would require serializing the execution state, and therefore making it scene
state, and nobody needs it while a joining client receives a snapshot.

---

## 9. Observable contracts

| Contract | Verifiable by |
|---|---|
| Nothing before the deadline, once at the deadline, never twice | `runtime/delay.test.js` |
| A wait is a duration, not a frame count | the same |
| The same elapsed time gives the same result however it is divided up | the same |
| The duration is captured when the node is entered | the same |
| `0`, negative, `NaN`, `Infinity`, non-numeric: no wait | the same |
| A looped `Delay(0)` is bounded by the budget and reported | the same |
| Two executions of one node wait separately | the same |
| Two instances of one `.px` have their own waits | the same |
| Two deadlines in one step resume in suspension order | the same |
| Object destroyed, Component removed: nothing resumes, nothing is reported | the same |
| Component turned off: the wait holds, it does not elapse | the same |
| Nothing of a wait appears in a scene payload | the same |
| Two Runtimes, the same steps: the same resumptions, an identical payload | the same |
| A handle produced before the wait is still usable after | the same |
| `Wait Until` re-reads its condition on every step, and passes once | the same |
| A `Tween` starts from `From`, advances, and lands exactly on `To` | `runtime/gameplay.test.js` |
| Two `Tween`s in one node never share their progress | the same |
| A zero duration finishes within the step, on `To` | the same |
| Nothing a `Tween` keeps appears in a scene payload | the same |
| A condition that is already true suspends nothing | the same |
| Two executions of a `Wait Until` are held separately | the same |
| `Every` pulses after its interval, not on entry, and does not drift | the same |
| An interval of zero pulses once per step, never within a step | the same |

---

## 10. What this ADR does not decide, and what it makes possible

| Open point | Why |
|---|---|
| **Resuming a simulation mid-match** | §7. The same position as ADR-0057 §8 |
| ~~`Tween`~~ | **Done** (§6.3): the extra field on the parked entry and the extra reader on `io` are exactly what had been recorded here as missing |
| **Cancelling a wait from the graph** | "stop what is waiting" is a product gesture nobody has designed; nothing here prevents it, and a continuation is already addressable by the instance holding it |
| **An `undo` during a match** | Moot: history stops at Play mode's door (ADR-0029 §5) |

**`Wait Until`, `Every` and `Tween` arrived the same day** (§6), and they cost nothing but the word
`again`: that is the measure of this ADR describing a mechanism rather than a node. What stays
naturally within reach, with §10's contract for `Tween`: **`Tween`**, **`Debounce`**, **`Cooldown`**,
**`Sequence With Pauses`** — all the same structure with a different resumption condition.
