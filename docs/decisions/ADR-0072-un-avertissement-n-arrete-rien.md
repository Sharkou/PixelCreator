# ADR-0072 — A warning stops nothing, and a wait has a ceiling

- **Status:** **accepted** (2026-09-12)
- **Decides:** what a node does when nothing has been chosen inside it yet; what tells a warning
  from an error at runtime; how many suspended executions one instance may hold; what happens to
  the others when one of them fails; where `io.resumed` comes from
- **Depends on:** ADR-0012 (the Runtime isolates and reports), ADR-0027 (the graph model and
  its interpreter), ADR-0031 (a value carried by the instance), ADR-0058 (an execution may
  outlive a step), ADR-0064 (refuse before running)
- **Does not decide:** an error console in the Editor, resuming a wait mid-game, cancelling a wait
  from the graph — see §5

---

## 1. The defect: two layers, one finding, two verdicts

A creator drops in a `Set Property` and has not chosen the property yet. That is the state of every
graph while it is being written, and the two layers looking at it did not say the same thing about
it:

| Layer | Verdict | Consequence |
|---|---|---|
| `validate.js` | **warning** | `runnable()` is true, `project/graphs.js` binds the graph |
| `standard.js` | **`GraphError` thrown** | on every instance, on every step |

And an exception unwinds the whole `walk`: **everything wired AFTER the unaimed node stopped
running**. The comment in `graphs.js` names the case word for word, though — "refusing to run a
graph under construction would make the Editor unusable".

> **The rule: severity decides whether a graph runs, so it also decides what may stop it along the
> way. What a warning lets through, execution must not kill.**

Concretely, two different sentences where there had been only one:

- **nothing has been chosen yet** — the node does nothing, the flow carries on, a `Get` answers
  `null`. The validator goes on saying that something is missing;
- **what had been chosen has gone** — `MISSING_PROPERTY`, an error, and the graph does not run at
  all (ADR-0064 §6, unchanged).

---

## 2. A wait has a ceiling

`On Update ▸ Every` is the wiring a beginner writes first. Every step suspended one more execution
there, and nothing bounded them: ten seconds at sixty steps gives **six hundred** live waits,
counted down and resumed on every step, each with its full budget. The pulse rate climbed from
0.2/s to 120/s and kept going.

`interpreter.js`'s header promises "a budget, and a cycle guard, so that a bad graph cannot freeze
a frame". The budget bounds **one** `walk`; nothing bounded **how many** `walk`s a step performed —
so a bad graph froze the frame by a route the budget could not see, and did it gradually, which is
the worst kind.

**`MAX_PENDING = 256` per instance.** This is not a retreat to a table keyed by node: ADR-0058 §3
is explicit, two passes through the same `Delay` wait independently, and the list stays a list.
What is added is a ceiling, and reaching it is a **stated refusal** — the `GraphError` the Runtime
isolates and reports, as it does for the budget.

---

## 3. An execution that fails does not take the others with it

Due executions are removed from `pending` **before** any of them runs — they have to be, or a
re-suspension would be counted down twice in the same step. An exception in the middle of the loop
therefore permanently deleted all the ones after it: two branches of a `Sequence` behind a `Delay`,
one node fails, and the other branch never resumed again.

Each one is now isolated; the first failure is rethrown once the loop has finished, so the Runtime
receives it and reports it as before (ADR-0012). What it no longer cancels is work that had nothing
to do with it.

**And the step itself is part of that.** `resumeDue()` is called before `start` and `update`; a
failure coming up from there took the component's `On Update` with it for that step, which is
exactly the same sentence one storey up. It is now held and rethrown after both events: the Runtime
still receives it, once the step has done what it could.

---

## 4. `resumed` only applies to the node that parked on itself

`io.resumed` tells a node "you are coming back" rather than "you are arriving down a wire" — that is
how `Every` starts its clock on the way in and fires its pulse on the way back.

A **wait** (`wait`) parks the continuation on the **next** node; a **return** (`again`) parks it on
the node itself. Marking both as resumed told the first something untrue: an `Every` placed behind
a `Delay` believed it was back from its own interval and fired the moment it arrived. Only the
second form carries the mark.

---

## 5. What this ADR does not decide

- **An error console in the Editor.** A `GraphError` still goes wherever `onError` sends it; giving
  it a window is separate work.
- **Resuming a wait after a reload.** ADR-0058 still refuses it: nothing suspended is serialised.
- **Cancelling a wait from the graph.** No node expresses it, and inventing one would mean deciding
  what "cancel" means for a `Tween` already halfway through.
