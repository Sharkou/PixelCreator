# ADR-0046 — One gesture, one model, and two widths

- **Status:** **accepted** (2026-08-29)
- **Amended by:** ADR-0055 (2026-09-07) — §7: "a word and a chosen option" are no longer short; what a creator types or picks takes both cells. §7's rule itself is confirmed and becomes the only one again.
- **Amended by:** ADR-0047 (2026-08-29) — §3: the Component → node gesture is withdrawn one last time, the field it filled no longer existing. §7: a control alone on its row measures about 70 % and not the whole column.
- **Decides:** what carries a property of the Object; how many handles a property carries; what the Inspector shows after a `.px` is created; what a Component with no file is called; how many nodes describe a key; what a control measures; what an identifier may contain; how many models a resource has
- **Depends on:** ADR-0006 (a window announces, the shell routes), ADR-0011 (authority), ADR-0014 (input is passed), ADR-0021 (an identity is not a name), ADR-0028 (reordering), ADR-0041 (an event is a moment), ADR-0043 (the Object answers for itself), ADR-0044 (a live channel), ADR-0045 (two questions, two rows)
- **Amends:** ADR-0041 §3.2 (settled differently, see §6); ADR-0045 §4 (three nodes become three ports), §9 (a colour becomes short again), §10 (a property's handle is the reordering one)
- **Does not decide:** the Preview's transport (see §1, which explains why it does not change); a port's unit; `Rotation X/Y`; the fate of an instance whose file is deleted (§5); the nodes' Object/Component/Property model; `Random`, `Delay`, `Destroy`, `Spawn`

---

## 1. The Preview's transport does not change, and the legacy says why

The legacy mechanism was found and read (`legacy/editor/misc/play.js`, `legacy/build/index.html`):

```js
const app = window.open('/build/', '_blank', '…');
app.data = { host, port, online, objects: scene.objects };   // ← the editor's scene
```

```js
const editorObjects = window.data?.objects;
objects = editorObjects;         // the SAME objects
scene.init(objects, camera);     // that the game window renders every frame
```

**There is no synchronization: there is aliasing.** No `postMessage`, no `window.opener`, no `message`
event anywhere in the legacy's Editor ↔ Preview path — a search finds `onmessage` only inside the
network's WebSockets. The Preview displayed the editor's live objects because they were literally the
same objects.

The cost, measured and not assumed:

| What aliasing gives | What it costs |
|---|---|
| Zero lines of synchronization | The Preview does not survive `F5`: `window.data` is gone |
| Perfect fidelity — not "synchronized", **identical** | The Preview is not a URL, and therefore never a published game |
| No latency | **Playing is editing**: the Preview's runtime mutates the editor's scene |
| — | Two Previews would mutate the same objects and fight each other |
| — | Nothing crosses, so nothing on that path prepares a network |

The legacy in fact had **two disjoint mechanisms**: the aliasing above, and 355 lines of `network.js`
— one message per kind of mutation (`update`, `add`, `remove`, `addComponent`, …) plus full-state
`heartbeat`s. The local path was not a degraded version of the network path; it bypassed it entirely.

### Comparison

| Solution | Complexity | Real-time sync | Several previews | A future WebSocket | A future WebRTC | Limits |
|---|---|---|---|---|---|---|
| Legacy / `window.open` + a shared reference | 24 lines | total, by construction | no — they would fight | **contributes nothing** | contributes nothing | no `F5`, no URL, no isolation, same process |
| `postMessage` | ~60 lines | yes | yes, but you have to keep the window list | close | close | you need to drop `noopener`, add a startup handshake and close detection, and a Preview opened by URL has no `opener` |
| `BroadcastChannel` (current) | **29 + 40 lines** | yes | **free** | `openLiveChannel()` changes, nothing else | the same | one browser only |
| A transport abstraction | + one layer | yes | yes | yes | yes | **premature**: the seam is already `openLiveChannel()` |

`noopener` is already passed to `window.open` (`editor/preview.js`), which **makes the `postMessage`
model impossible without removing it** — and removing it reopens the Preview's access to
`window.opener.*`, that is, exactly the door the legacy aliasing was.

> **Decision: the channel stays ADR-0044's.** It is shorter than the alternative, it has no state to
> keep, it works for a Preview opened by URL, and the only function to change on WebSocket day is
> already isolated. No abstraction is added: there is nothing to abstract while there is one
> implementation.

---

## 2. The Object's four properties are properties like the others

`Name`, `Tag`, `Layer` and `Active` had no handle. The cause was one missing argument: the panel drew
their rows without naming a Component, and therefore with nothing to put in the drag payload.

ADR-0043 had already done the work — the Object answers for itself under its own namespace, and the
catalogue exposes it as a type. The four rows a beginner meets **first** were the four a graph could
not reach, and no exception was created to fix them: they go through the mechanism that existed.

---

## 3. A property has one handle, not two

A `.px`'s property carried two handles: one to reorder, one to carry away. That was the honest cost of
two gestures — and it was the wrong bargain. A creator has **one** intention, "take this property";
what distinguishes them is where they release.

The primitive already said it: *"a gesture with no payload never leaves"*. A Component section has had
its payload all along; a property had none. It is the payload that arrives, not a second mechanism —
and the tooltip now names both destinations, without which half the gesture stays invisible.

---

## 4. Creating a Custom Component means opening it AND going to it

The canvas opened, the Inspector stayed on the Object. But an empty `.px` does nothing: the next thing
you need is **a property**, and `Add property` lives in the Inspector.

The panel **announces** the opening (`px-open-resource`, ADR-0006) and **goes through the router** for
the selection: an Object and a Resource are two mutually exclusive subjects, and `Subject` is the only
place that keeps them so. Writing to the Workspace directly would leave the Object selected underneath
and the two holders in disagreement.

---

## 5. An identity is not a name, even when the file is gone

Deleting a `.px` still attached to an Object left a Component titled `ffs2qex9nw0v` — reproduced
exactly, at the model level:

```
BEFORE delete: label = "New Component"
AFTER  delete: still registered = true
AFTER  delete: label = "ffs2qex9nw0v"
```

Two distinct defects, and only one is fixed here.

**Fixed: the name.** The fallback chain ended on the type, which for a `.px` **is** its ResourceId —
precisely what ADR-0021 exists to keep out of sight. A type nothing can name now reads
`Missing Component`. The condition is exact rather than heuristic: `static definition` is what
`defineComponent()` stamps on a class built from a project payload, while a shipped Component declares
`static schema`. A type that comes from a file whose project no longer has the file is a missing file.

**Not fixed, deliberately: the instance.** Nothing unregisters the type, so the Component stays
attached and keeps running. Turning it into a `MissingComponent` — ADR-0021's placeholder, which keeps
the values and never runs — is the obvious next step, but it needs a decision: is it an Operation, does
it undo with the deletion's `Ctrl Z`, what does a collaborator see? See the report, §C.

Worth noting: **the Editor offers no resource deletion gesture today.** The defect is therefore latent,
not reachable by a creator — which is also why it was not seen earlier.

---

## 6. A key is one node and three ports

There were three — `On Key`, `Key Down`, `Key Is Down` — and the first two asked the same question of
the same key. A creator therefore had to **know the difference before** being able to choose the card
that would have taught it to them.

> **`On Key` has three outputs: `Pressed`, `Released`, `Down`. `On Pointer Button` has the same, in
> the same words.**

That settles ADR-0041 §3.2 better than ADR-0045 §4 did. That section refused a continuous event
because it *would look like* the one-shot; two cards that look alike is a problem one card does not
have.

**The semantics are the runtime's, not the node's.** `InputState` already answers all three questions,
and `commit()` bounds both transitions to exactly one step whatever the frame rate — so a server
replaying inputs computes the same three answers (ADR-0011, ADR-0014 §5). Nothing here is a boolean
wearing an event's name.

| Port | True when |
|---|---|
| `Pressed` | the downward transition happened **this step** |
| `Released` | the upward transition happened **this step** |
| `Down` | the key is held, **now** |

The step where a key goes down is `Pressed` **and** `Down`, and both leave: "on press, then on every
step" is what holding a key *is*.

**`Events` versus `Input`, and the line is the model's:** what **starts a flow** is an Event; what
**answers a question** is an Input. `Key Is Down`, `Pointer` and `Pointer Button Is Down` therefore
stay in `Input`, where they are what you ask inside a condition.

`input.keyDown` and `input.pointerButtonDown` are **removed**, with no alias: a second way of saying
one thing is the duplication this recomposition removes.

---

## 7. Two widths, declared once

> **A short control takes one cell; a wide control takes both.**

What decides is not taste but what the control has to **show**: a file name, an Object's name, a
slider's travel and a list of rows overflow half a column — a number, a switch, a swatch, a word and a
chosen option do not.

`Color` was wide "because a colour is a value like any other", which made it the one row whose right
edge went past every number above it. Fixed: short. `Alpha` stays wide, because a slider has travel.

**Inside a node the rule cannot be the same, and that has to be said.** An Inspector row has a label
column and a value column; a node row has 176 px and ports on both sides. Applying "50 %" there would
leave a number less room than its own mechanics occupy. What the two surfaces share is the **control**
and its descriptor, not the column.

What the node was missing was simpler and quite real: every row measured itself alone, so
`Get Property` — whose first row carries an Object socket and whose next two do not — drew three
controls at two different x positions. **One left edge per card**, at most 8 px, and the column reads.
The right edge stays each row's: a port that **prints** its label really does occupy that space.

---

## 8. An identifier contains digits, and that is normal

`createId()` draws from Crockford base32 — ten digits and twenty-two letters. Nothing in this engine
restricts an identifier to letters: not the generation, not the storage, not `idFromHash()` (which
takes everything after `#p/`), not the store's keys. The one CSS selector built from an identifier goes
through a quoted attribute value, where a leading digit has no effect.

The assumed constraint does not exist. A regression test now pins that down, because an absent
constraint is easier to reintroduce by accident than a written one.

---

## 9. One resource, one model, even when two callers ask at the same time

`#attach()` awaits a load. Two callers arriving in the same tick therefore both saw "no model yet" and
each built one: two `ComponentDefinition`s on one payload, two histories, and the second silently
replacing the first in the table — **after** the first caller had captured it. `open()` then flipped
`open` on a record nobody held any more, announced it, and no window drew the document.

That is not theoretical: §4 above reaches that path from **a single gesture** — creating a Custom
Component OPENS it and SELECTS it, and selecting attaches. The in-flight promise is shared; that is
what makes those two requests one model.

---

## 10. Observable contracts

| Contract | Verifiable by |
|---|---|
| `Name`, `Tag`, `Layer`, `Active` carry a handle | the Inspector, by eye and by `getBoundingClientRect()` |
| A `.px` property has exactly one handle | the same |
| Creating a Custom Component opens the canvas **and** moves the Inspector | by eye |
| A deleted `.px` never reads as its identifier | `describeType`, in a test |
| `On Key` has three ports, and the press step lights two | `nodes.test.js`, `pipeline.test.js` |
| `input.keyDown` no longer exists, not even as an alias | `nodes.test.js` |
| Every short control measures one cell, every wide one measures two | measured in Chrome |
| A node card draws its controls from a single left edge | `view.test.js` |
| An identifier with digits survives the URL, the store and the parsing | `store.test.js` |
| Two simultaneous `attach()` calls give one model | §4's workflow, in Chrome |
