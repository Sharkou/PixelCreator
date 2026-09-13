# ADR-0042 — A Preview is a runtime client, addressed by an identifier

- **Status:** **accepted** (2026-08-28)
- **Decides:** the Editor / Runtime boundary as two applications; how a project is handed to a runtime; what a `preview id` is and how it will become a `game id`
- **Depends on:** ADR-0005 (the runtime is made of modules), ADR-0011 (authority), ADR-0015 (a graph is a type's behaviour), ADR-0020 (Resources), ADR-0029 (transport and Play), ADR-0035 (`step()`'s order)
- **Amends:** nothing. ADR-0029 stays valid and intact — see §1.
- **Amended by:** ADR-0044 — the two directories become one (§2), the `prv_` prefix disappears and the identifier is the project's (§3), the store keeps one entry per project (§4), and a live channel keeps open Previews up to date (§6).
- **Does not decide:** multiplayer, network transport, authentication, server-side persistence. See §6, which says precisely where they will plug in.

---

## 1. Play and Preview are two things, and both stay

ADR-0029 decided that **Play works on the live scene**: no second Runtime, no copy, and an object
modified while the game runs is seen immediately. It is the product's reason for being — "an
administrator view onto a live runtime" (`docs/PROJECT.md` §4). That decision is good and is not
touched.

What was missing is the other half:

| | Play (ADR-0029) | Preview (here) |
|---|---|---|
| Where | inside the editor | a separate window |
| What | the **live** scene, editable while it runs | a **snapshot**, isolated from the editor |
| For | tuning, observing, correcting live | **playing**, as a player |
| Interface | every panel | none |
| Addressable | no | **yes, by URL** |
| Several at once | no | yes — several windows |

A creator needs both, and for different reasons: Play answers "why is my object doing that", Preview
answers "is my game playable". Preview is also the only one of the two that can become
`play.pixelcreator.io/<id>`.

---

## 2. Decision: two applications, one boundary, no imports between them

> **The editor and the game client are two pages. They share no state, no memory and no imports —
> only an identifier and a format.**

```
  src/editor/   the editor         →  project, runtime, core
  src/play/     the game client    →  preview, runtime, core
  src/preview/  what passes between →  project, core
```

> **Amended by ADR-0044 §2:** `src/play/` and `src/preview/` are now one directory,
> `src/preview/`. The boundary described here — the game client imports nothing from the editor —
> is unchanged; it is the split into two directories that no longer was.

`src/play/` can import nothing from `src/editor/`, and the reverse is true too. What the editor sends
the client is not an object: it is a **bundle**, JSON, crossing a boundary that `postMessage`,
`localStorage` or HTTP can carry indifferently.

That is the property that prevents the dead end. The day the bundle comes from a server, only
`resolve(id)`'s implementation changes; the game page does not know where it came from.

### 2.1 The bundle

A complete project, with no reference to the editor:

```
{ format, id, name, manifest, payloads: { [resourceId]: payload }, scene }
```

The manifest is ADR-0020's (`Project.serialize()`), the payloads are what the `ResourceStore` holds,
and `scene` names the scene to open. `bundleProject()` and `openBundle()` are **pure** and tested
without a DOM: the same bundle a game page opens, a headless server will be able to open to arbitrate
a match (ADR-0011).

---

## 3. Decision: an opaque identifier, resolved behind a single seam

> **The game page receives an identifier and asks for a bundle. It does not know whether that
> identifier is a local preview or a published game, and it must never know.**

```
play/index.html#p/<id>   →   resolve(id)   →   bundle   →   Runtime
```

> **Amended by ADR-0044 §2.1:** a `preview id` is the project's own identifier, with no prefix. The
> seam described here — `resolve(id)` is the only thing distinguishing a preview from a published
> game — is exactly what makes the prefix unnecessary: that function never read it.

| | `preview id` | `game id` (to come) |
|---|---|---|
| Shape | ~~`prv_` + random~~ the project's identifier | assigned by the server |
| Scope | this browser | public |
| Lifetime | until replaced or cleaned up — §4 | as long as the game is published |
| Resolution | local storage | HTTP |
| Who writes it | the editor, on every Preview | the Publish action |

One function tells them apart, and it is deliberately the **only** one: `resolve(id)`. The prefix
makes the identifier's nature readable without having to guess it.

---

## 4. What is local and temporary today

- The bundle is written into the browser's storage, under its preview key.
- The store keeps the **few most recent previews** and discards the rest: a project holds images as
  data URLs, and an editing session would otherwise produce an endless history of them. *(ADR-0044
  §2.1: one entry per PROJECT, rewritten, and not one per press of Preview.)*
- Nothing leaves the machine. A preview link opened elsewhere finds nothing and says so.

These are properties of **`resolve`'s implementation**, not of the model. None of them is visible from
`src/play/`.

---

## 5. What the game client is, and is not

**It is:** a canvas, a `Runtime`, a loop, and the keyboard/mouse wired into the `Input` ADR-0014
describes. It opens the bundle, registers the `.px`s as types, binds the graphs, and advances on
ADR-0035's fixed clock.

**It is not:** an amputated editor. No panel, no selection, no `Operation`, no undo. The client cannot
modify the project — it does not even have the vocabulary to, since it imports nothing from
`src/editor/`.

---

## 6. How this becomes `play.pixelcreator.io/<id>`, and multiplayer

None of what follows is built now. What matters is that every step is a **replacement**, never a
rework.

| Step | What changes | What does not |
|---|---|---|
| A hosted preview | `resolve(id)` does a `fetch` instead of reading local storage | the page, the bundle, the identifier |
| `play.pixelcreator.io/<id>` | the URL, and a durable `game id` written by Publish | `resolve(id)` stays a function from an id to a bundle |
| Several players | each window is already a separate client; they need an `owner` and a transport | the `Input` is **already** indexed by owner (ADR-0014 §3), and the simulation is **already** deterministic (ADR-0011) |
| An authoritative server | it opens the same bundle, headless | `openBundle()` is pure and touches no DOM |

The important point: **several preview windows are already several clients.** What multiplayer is
missing is not a rewrite, it is a transport and an `owner` per client — exactly the two things
ADR-0011 and ADR-0014 left pending.

---

## 7. Observable contracts

| Contract | Verifiable by |
|---|---|
| `bundleProject()` / `openBundle()` are pure and DOM-free | headless tests |
| A reopened bundle gives back the same scene and the same resources | a round trip, in a test |
| `src/preview/` imports nothing from `src/editor/` | `tools/layers` — *ADR-0044 §2* |
| Nothing outside the editor imports `src/preview/` | the same |
| An unknown identifier produces a message, never a blank page | the game page |
| Several previews coexist | two windows, two identifiers |

---

## 8. Rejected alternatives

| Alternative | Why not |
|---|---|
| An `<iframe>` inside the editor | It is not what was asked for, and it never becomes a shareable URL: the context stays the editor's. |
| `postMessage` from the opening window | A refresh breaks the page, and the URL designates nothing. A preview that does not survive F5 is not a game client. |
| A local preview server right now | A process to launch and watch over, for a feature browser storage already makes real. The `resolve(id)` seam will make it trivial the day it brings something. |
| Serializing the scene alone | A game is a project: the `.px`s are the behaviour, the images are the rendering. A scene without its resources is not playable. |
| Reusing the editor's Runtime for the window | That would be redoing ADR-0029, which has already answered, and it would stop the window being a client like any other. |
