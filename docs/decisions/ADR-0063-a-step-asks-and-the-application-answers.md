# ADR-0063 — A step asks, the application answers

- **Status:** **accepted** (2026-09-12)
- **Decides:** what `Load Scene` does; who reads the Scene and when; what becomes of the old world; what crosses a transition; what survives a transition and in what form
- **Depends on:** ADR-0011 (the server is the authority), ADR-0014 (input is passed in), ADR-0020 §4 (the store is asynchronous), ADR-0029 (Play/Pause/Stop), ADR-0042 (Preview is a runtime client), ADR-0057 §3 (identities come from the simulation), ADR-0058 (an execution may outlive a step), ADR-0060 §6 (`AudioSource` is a reconciler), ADR-0061 §4 (resolve before the simulation)
- **Does not decide:** an animated transition; loading a scene **alongside** another (additive); a saved game; scene changes in the Editor's Play mode — see §6

---

## 1. Problem

A Pixel Creator game was structurally **single-screen**. No menu, no level 2, no end screen: a
single Scene was played, and nothing in the catalogue could ask for another.

And the reason was the same as for prefabs: **a Scene is a Resource**, a Resource is read through
an **asynchronous** store, and `Runtime.step()` cannot wait. The prefab answered by resolving
**everything before** the simulation (ADR-0061 §4). A scene cannot: loading it **throws the
simulation away**.

---

## 2. The node asks, it does not load

> **`Load Scene` records a request. The step finishes where it was.**

```
step()                    the node calls ctx.requestScene(id) and returns
   …                      the following nodes run on the scene that is still there
advance() finishes        ← here, and only here, the application is told
   ↓  asynchronous, between two frames
read → deserialize → dispose → new Runtime
```

**Three properties follow, and they are exactly the ones required:**

- the interpreter stays **synchronous** — nothing was made `async`, not a node, not a step;
- no storage is touched **during** a step;
- there is never a half-replaced Runtime: the old one is disposed, then the new one is built on
  a complete world.

**A step's last request wins.** Two `Load Scene`s reached in one step is a graph saying two
things; loading both would play a scene for zero frames, and refusing would turn the order of
two flows into an error a creator cannot see.

**There is no `Then` port and no `Scene Loaded` output.** There is no "afterwards" for that flow
to continue into: by the time the scene is read, the graph that asked, the Component that
carried it and the Object that carried that have all gone.

**A Runtime nobody is listening to records the request and carries on.** That is what a headless
call does, and what the Editor's Play mode does today (§6).

---

## 3. The lifecycle: a new Runtime, and what crosses

> **Changing scene means throwing a Runtime away and building another.**

That is simpler than emptying a Runtime in place *and* safer: there is no residual state to
forget, because there is no surviving object to clean up.

| | What happens | Why |
|---|---|---|
| the old Scene | **emptied**, root by root | every departure is announced, so every `onRemoved` runs |
| music | **stopped** | a level must not keep the menu's music (ADR-0060 §6) |
| suspended `Delay` / `Tween` / `Every` | **unreachable** | they live in closures only `Behaviors`' WeakMap reaches, keyed by Component; the Component goes, they go. There is nothing to cancel (ADR-0058) |
| collisions | new | a snapshot of pairs is a fact about a world |
| clock | new | a level's time starts at the level |
| **Input** | **the same** | a player holding a key is still holding it; a fresh `Input` would lose a `keyup` — a stuck key, and the last bug anyone would connect to a scene change |
| **audio output** | **the same** | already unlocked; rebuilding one would cut the sound and ask for another gesture |
| **decoded images** | **the same** | they belong to the PROJECT; re-decoding them would be a black screen at every door |
| **resolved definitions** | **the same** | likewise |
| **Behaviors** | **the same** | a `.px` is project-scoped |
| **session** | **the same** | §5 |
| seed | **derived**: `session:scene` | a run stays reproducible from end to end (ADR-0057) |
| camera, `ScreenSpace` | the new scene's | they are Objects |

`Runtime.dispose()` **is not a `stop()`**: it touches neither the loop, nor the renderer, nor the
audio output. Those belong to the application, and the next Runtime receives the same ones.

---

## 4. The shape: a callback, not a poll

The Runtime receives `onSceneRequest`. `advance()` calls it **after** the frame's last stage,
once, with the identifier — then forgets the request.

**A callback rather than a flag read in a loop**: an application polling
`runtime.requestedScene` every frame has to remember to do it and to clear it, and one that
forgets accumulates a request that is never honoured. The callback is delivered exactly once, at
the only place where waiting is allowed.

`requestedScene` exists all the same, readable, because a test has to be able to observe that a
step **recorded** something without anything having been loaded.

---

## 5. What crosses: `SessionState`, and not a second Property System

A transition throws the world away. A score carried from `Level` to `GameOver` therefore has
**nowhere to live**: everything that could hold it dies on the way.

```
Get Session Value   Key = score   → Value
Set Session Value   Key = score   ← Value
```

This is **not** a second Property System, and the differences are the point:

| What the Property System has | `SessionState` |
|---|---|
| reactivity, `Change`, observers | none |
| Operations: replicated, arbitrated, undoable | none |
| schema, declared types, default values | three primitive types, declared nowhere |
| serialisation into a scene / a project | **never** |
| opaque identity (`ResourceId`, `ObjectId`) | a name a creator types |

A Component property **describes an Object**; this is a handful of numbers a run carries. Doing
the first with the second would be a saved game made of scratch paper; doing the second with the
first would need an Object that outlives the scene — the very thing a transition exists to
destroy.

**Three types: number, boolean, text.** An Object handle would name a scene that has just been
thrown away; an array or a record would be a format nobody has decided on, and the day someone
does, that is a **saved game**, not this. Anything that is not one of the three **deletes the
key** instead of being stored: reading back a transformed value after a transition would be
worse than an empty key (ADR-0054).

**It belongs to the application.** A Runtime is built per scene and this outlives several of
them: so the application creates it and passes it to every Runtime — the shape the audio output
and the resource registry already have. "New game" is `clear()`, and it is the application that
decides when.

---

## 6. What this ADR does not decide

| Open point | Why |
|---|---|
| **An animated transition** (fade, wipe) | Requires drawing while no scene is alive, so a presentation layer above both; that is a product |
| **Additive loading** | "Two scenes at once" requires deciding what an active camera is, a draw order, and a namespace between them |
| **A saved game** | §5. A snapshot of scratch paper is still scratch paper; what a saved game is has not been decided |
| **Scene changes in the Editor's Play mode** | The Editor's Runtime is bound to the Hierarchy, the Inspector and the history of an open Scene; replacing it means reopening a document. The request is recorded and is not honoured. **BLOCKED: Load Scene in the Editor's Play mode — Reason: replacing the open Scene is a `Workspace.open()`, which closes the first one and rebinds every window; that is not a change of Runtime but a change of document, and swapping documents is the window ADR-0020 §3 leaves open.** The Preview does it, and that is where a game is played |

---

## 7. Counter-tests

| Verified | Where |
|---|---|
| `Load Scene` records, and the step finishes on the starting scene | `preview/scene-transition.test.js` |
| The application is told **between** two frames | the same |
| A step's last request wins; a request is delivered once | the same |
| A Runtime with no listener records and carries on | the same |
| An empty selector asks for nothing | the same |
| The scene being left is emptied, so its music stops | the same |
| A `Delay` suspended in the old scene never comes back | the same |
| The new scene is what gets simulated, with its Objects | the same |
| Audio, Input and definitions are **the same objects** after the transition | the same |
| Two runs of the same seed reach the same identities | the same |
| A session value written before is readable after | the same |
| The three types pass; an Object handle and a `NaN` delete the key | the same |
| "New game" is a `clear()` | the same |
| A Runtime with no session reads nothing and writes nowhere | the same |
| **Counter-test**: a transition with no `dispose()` leaves the menu's music playing | the same |

---

## 8. Consequences

### Positive

- A game has a menu, levels and an end screen.
- The asynchronous constraint is respected without being worked around: the interpreter is
  unchanged.
- The lifecycle is stated, tested, and has no residual state to forget.
- Nothing expensive is redone at a door: images, sounds and definitions cross over.
- A run stays reproducible from one scene to the next.

### Negative

- `Runtime` gains three members (`requestScene`, `requestedScene`, `dispose`) and one option.
- The Editor's Play mode does not change scene (§6), and a creator who tries it there rather
  than in the Preview sees nothing happen.
- `SessionState` is one more place where a value can live; that is the price of a world that
  gets thrown away, and its limits (three types, no serialisation) exist so that it does not
  become a second model.
