# ADR-0044 — One folder, one identity, and a live channel

- **Status:** **accepted** (2026-08-29)
- **Decides:** where the Preview lives in the tree; what identifies it; how a change in the editor reaches an already-open Preview
- **Depends on:** ADR-0011 (authority and arbitration), ADR-0016 §7 (rebinding a graph replaces the behaviour), ADR-0019 (replication), ADR-0027 (an `Operation` is an authoring intent), ADR-0042 (the Preview is a runtime client addressed by identifier)
- **Confirmed by:** ADR-0046 §1 (2026-08-29) — the legacy mechanism (`window.open` + shared references) was found and analysed; it is not a transport and prepares nothing. The channel stays the one decided here.
- **Amends:** ADR-0042 §2 (the two directories become one), §3 (the `prv_` prefix disappears), §4 (what the store keeps), §7 (the layer contracts)
- **Does not decide:** the reverse direction (Preview → Editor), multiplayer, conflict resolution, server-side persistence. See §6.

---

## 1. What was wrong

Three defects, and they are the same one: **the Preview had no stable identity**.

| Symptom | Cause |
|---|---|
| Two directories, `src/play/` and `src/preview/`, for one application | ADR-0042 separated "the client" and "what passes between" before knowing the second had only one reader |
| Opening Preview twice gave two unrelated games | the identifier was drawn on every opening (`prv_` + random) |
| A change in the editor never reached an open window | you had to close it, press again, and find your place |

The third is the costly one. Pixel Creator is multiplayer-oriented: a creator's normal gesture is to
have **the game open beside the editor** and to tune while it runs. A window you have to relaunch on
every attempt is not that gesture, it is a compiler.

---

## 2. Decision: one directory, and the project's identity

> **`src/preview/` is the Preview application, whole. A Preview is identified by the project it
> shows, and by nothing else.**

```
  src/editor/    the editor          →  project, runtime, core, preview
  src/preview/   the game client     →  runtime, core
```

`src/preview/` still imports nothing from `src/editor/` — that is ADR-0042 §2's boundary and it is
intact. What changes is that the bundle, the store and the client live together: there is one
application, and it has one directory.

**No `play → preview` alias is left in place.** A permanent alias is a second name for something that
already has one; it survives rewrites, slips into fresh imports, and makes `tools/layers` lie about
what exists.

### 2.1 The identifier is the project's

| | before | now |
|---|---|---|
| Shape | `prv_` + random | the project's identifier |
| How many per project | one per press of Preview | **one** |
| Two windows | two unrelated games | two clients of one game |
| The store | one entry per press | one entry per project, rewritten |

The prefix existed to make "the identifier's nature readable" (ADR-0042 §3). It answered a question
nobody asks: what `resolve(id)` does with the identifier is already the only difference between a
preview and a published game, and that function never read the prefix. What it cost, on the other
hand, is real — **nothing could name "THIS project's Preview"**, which is exactly what a live channel,
and later a published URL, have to name.

A `game id` assigned by a server stays possible and stays distinct: it is assigned by Publish, not
derived from the project. ADR-0042 §3's column still holds, minus the preview's "Shape" row.

---

## 3. Decision: the editor broadcasts its `Operation`s, the Preview applies them

> **What crosses is an `Operation` — the same record the editor's history holds, and the same one a
> server will one day transmit.**

No protocol is invented here, because the Core already has one. ADR-0011 separated two verbs, and the
separation existed precisely for this moment:

```
  submit()   arbitrates, applies and ANNOUNCES      ← what an author does
  apply()    applies what is authoritative          ← what a follower does
             and announces nothing
```

`apply()` announces nothing, "which is why applying a remote operation sends nothing back"
(`core/operations/operations.js`). Nothing loops, because nothing can: a pipeline emits `operation`
only from `submit()`.

All that was missing was a **channel**. It is a `BroadcastChannel` named `px.live.<projectId>`: the
smallest thing that carries a message between two pages of a browser. The day it is a WebSocket,
`openLiveChannel()` changes and **nobody else** — ADR-0042 §6's promise, kept one layer down.

### 3.1 Two kinds of message, and the asymmetry is the point

| | `operation` | `definition` |
|---|---|---|
| Carries | a change to the **scene** | a whole `.px` |
| Because | the scene is a **state the Preview inhabits**: the objects have moved, the timers have run. Replacing it would throw away everything the session has become | a `.px` is a **definition the Preview reads**. Rebinding a graph replaces the running behaviour, which ADR-0016 §7 already says about a graph change |
| The cost of moving a node | — | one send, not forty `SET_PROPERTY`s |

A `.px` is therefore sent **whole and at most once per frame**. A microtask would be too eager — a
batch of operations holds several — so the send waits for the frame in which the creator's gesture
ends.

### 3.2 What the editor tracks

The Workspace announces `attached` at the exact moment a resource gains a live model (ADR-0043 §3).
Tracking "every model there is" is therefore **a subscription**, and not a registry to keep up to
date. Models already attached at startup — the scene in particular — are picked up on the way:
without that, the resource that matters most would be the only one never tracked.

> **Amended by ADR-0071 (2026-09-12).** "Every model there is" left one out: the **manifest**, which
> is attached to nothing and yet carries its own pipeline. An imported image, a re-cut tileset, a
> replaced prefab therefore reached no already-open window. It now crosses the same channel, as an
> Operation, under the project's identity — no message kind was added — and only `Origin.EDITOR`
> operations cross, a save's bookkeeping being nobody's intent (ADR-0069 §2).

---

## 4. What is not decided, and why

| Question | Today's answer |
|---|---|
| Preview → Editor | **no**. The Preview does not have the vocabulary of a change (ADR-0042 §5) and must not acquire it through a channel. |
| Two editors on one project | out of scope here: only one author emits. That is ADR-0011's arbitration, and it will plug into the same place. |
| Conflicts, ordering, recovery after loss | nothing. A `BroadcastChannel` does not lose messages between two tabs of one browser, and a Preview that missed something is reopened. Over a WebSocket the question becomes real and deserves its own ADR. |
| Replaying the history to a Preview opened late | no. The Preview opens the bundle of the moment it was opened, then follows. |

---

## 5. What a failure does

None of these paths is an authoring error, and none interrupts editing:

- **No `BroadcastChannel`** (an old browser, a restricted context) → `openLiveChannel()` answers
  `null`, and the Preview plays without following. A Preview that cannot follow the editor is still a
  Preview.
- **A closed channel** (the window opposite has gone) → the send is swallowed. A change cannot fail
  because nobody was listening.
- **A message for another resource** → ignored. The Preview applies only what concerns the scene it
  is playing.

---

## 6. How this becomes multiplayer

It is the same sentence as ADR-0042 §6, one layer down and now true:

```
  today   Editor ──BroadcastChannel──▶ Preview           (one machine, N windows)
  next    Client ──WebSocket──▶ server ──▶ Clients       (N machines)
```

What crosses does not change: an `Operation`. What changes is `openLiveChannel()`, and the arbitration
ADR-0011 already described settles on the server side. **Two windows of a project are already two
clients of a match** — the property ADR-0042 named as the entirety of the preparation for multiplayer.

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| `src/play/` no longer exists, and no alias replaces it | the tree, `tools/check-exports` |
| `src/preview/` imports nothing from `src/editor/` | `tools/layers` |
| Two openings of a project give one store entry | `preview/store.test.js` |
| An `Operation` emitted by the editor arrives at the Preview | `preview/live.test.js` |
| What the Preview applies does not go back out | `apply()` emits nothing — `operations.test.js` |
| An absent channel breaks neither the editor nor the Preview | `live.test.js`, both directions |
| A modified `.px` arrives whole, once per frame | `live.test.js` |
| Moving an object in the editor moves it in an open Preview | two windows, by eye |

---

## 8. Rejected alternatives

| Alternative | Why not |
|---|---|
| Resending the whole bundle on every change | The scene is an inhabited state: the Preview would lose the running session on every keystroke. That is exactly §3.1's distinction. |
| A diff computed between two states | The Core already produces the exact intent, arbitrated and announced. Recomputing afterwards what you knew beforehand is duplicated work, and wrong as soon as an operation is not idempotent. |
| `postMessage` on the opened window | It does not survive a Preview refresh and names only the window you opened yourself — not "this project's Previews". |
| `storage` events on `localStorage` | You would have to rewrite the whole bundle to signal a keystroke, and the event carries no intent. |
| A local server right now | A process to launch for a feature the browser already makes real. The seam is in place for the day it brings something. |
| Keeping `prv_` and adding a project identifier beside it | Two identities for one thing: the store, the channel and the URL would have to agree on which is the real one. |
| A `src/play/` alias re-exporting `src/preview/` | A second permanent name for something that has one. It slips into fresh imports and makes the layer check lie. |
