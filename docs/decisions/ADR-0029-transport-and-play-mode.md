# ADR-0029 — Play works on the live scene, Stop restores a snapshot, and history stops at the door

- **Status:** **accepted** (2026-08-18)
- **Depends on:** ADR-0003 (Property System), ADR-0005 (runtime modules), ADR-0008 (Operations), ADR-0011 (authority), ADR-0012 (error isolation), ADR-0013 (camera), ADR-0015 (a graph and a Component), ADR-0024 (Undo/Redo)
- **Amends:** nothing. It fills the gap `editor.js` flagged by refusing to draw a decorative transport.

## Observed context

`editor.js` carried this, and it was the right answer at the time:

> "THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE. Play needs a scene snapshot restored on stop,
> which does not exist yet. A green button that does nothing would be the one kind of lie this Editor
> has consistently refused."

What exists today, and makes the decision possible:

| Brick | State |
|---|---|
| `Runtime.running`, `advance(dt, input)`, `render({ view })` | in place, and the Viewport already holds the loop |
| `serializeScene()` / `deserializeScene()` | in place, tested, with no DOM dependency |
| A `History` per resource, entries grouped by `batch` | in place (ADR-0024) |
| `Behaviors`: a graph's execution state in a WeakMap | in place, already declared not restored by ADR-0024 §5 |
| `Clock`: `time`, `fixedStep`, an accumulator | in place, but with no `reset()` |

The Viewport builds a `Runtime` with `running = false`: it draws every frame and never simulates. The
transport therefore does not have to create an engine — it has to decide who owns the scene's state
while it runs.

## Decision

### 1. Three states, and one scene object

**SETTLED.** The transport is a three-state machine carried by the Editor:

```
        Play              Pause              Play
EDITING -----> PLAYING ---------> PAUSED ---------> PLAYING
   ^              |                  |
   +--------------+------------------+
                Stop
```

| State | `Runtime.running` | The loop advances | The scene is editable |
|---|---|---|---|
| `EDITING` | `false` | no | yes |
| `PLAYING` | `true` | yes | yes, and that is deliberate (§4) |
| `PAUSED` | `false` | no | yes |

**There is no second Runtime, and no copy of the scene while it runs.** The Editor's Runtime is the
one that plays. It is the product's reason for being: "an administrator view onto a live runtime"
(`docs/PROJECT.md` §4) — modify an object while the game runs and see the effect immediately. Running
Play on a copy would destroy precisely that.

### 2. Play takes a snapshot before starting

**SETTLED.** `Play` from `EDITING`:

1. `serializeScene(scene)` produces a JSON snapshot, kept by the Editor;
2. `runtime.running = true`.

The snapshot is a value, not a live object: it cannot drift, and it costs a serialization that is
already written and already tested. `Play` from `PAUSED` takes no new snapshot — resuming is not
starting.

### 3. Stop restores exactly the snapshot, and nothing else

**SETTLED.** `Stop`:

1. `runtime.running = false`;
2. the scene is brought back to the snapshot taken at the last `Play`;
3. the simulation clock restarts from zero;
4. the graphs' execution state is discarded;
5. the input state is cleared;
6. the state goes to `EDITING`.

**What Stop does not restore, and must be said:** the Editor's camera (it is a point of view, not
content — ADR-0013), the selection, the collapse state of sections, the open window, the Graph's
position. None of that is in the scene, so none of it moves.

### 4. What happens to changes made during Play: they are lost, and the Editor says so

**SETTLED.** It is the direct consequence of §2 and §3, and the one point that must be visible rather
than discovered: everything a creator changes during `PLAYING` or `PAUSED` disappears at `Stop`.

It is Unity's and Godot's behaviour, and it is correct: playing is for observing, and a play session
must not modify the project by accident. What would be missing is the warning, so the Editor marks
the state — the transport is visibly active, and the scene is visibly running.

> **Not decided here:** offering to keep the changes at Stop (the "apply play mode changes" Unity
> users have been asking for for fifteen years). It requires diffing the snapshot against the current
> state, and therefore a scene diff model that does not exist.

### 5. History stops at the door

**SETTLED. Leaving `EDITING` clears the undo stacks, and nothing is recorded during Play.**

The reasoning is ADR-0024 §5, pushed one step further: undoing does not rewind the simulation. A
stack that crossed a `Play` would offer to invert an operation whose target has been destroyed by a
graph, or to give back a value an `update()` has already rewritten three hundred times. `invert()`
would produce a valid operation toward a state that never existed.

Clearing is brutal and honest; mixing would be flexible and wrong.

### 6. Editing during PAUSED is allowed

**SETTLED.** `PAUSED` is not a protected state: it is `PLAYING` without time passing. Writes follow
the normal path (`setProperty` then an Operation), the views update, and rendering continues — which
is exactly what `Runtime` already documents: "Whether the simulation advances. Rendering continues
while paused."

Those changes fall under §4 like the others: `Stop` takes them away.

### 7. What the Runtime must gain, and that is all

**SETTLED.** One addition, in `runtime/clock/clock.js`:

```js
/** Put the simulation clock back to zero. */
reset()
```

`Clock` accumulates `#time` and a step remainder; without `reset()`, a second `Play` would restart
with the first one's time, and a graph reading `time` would observe a jump. It is not a feature, it
is `Stop`'s counterpart.

**Nothing else changes in `runtime/`.** No transport state in the Runtime: it does not know what a
Play button is, and it must not learn (ADR-0005). The three-state machine lives in the Editor, which
already owns the loop.

### 8. Multiplayer and headless: what is anticipated, what waits

**SETTLED for now: the transport is local.**

What the decision preserves for later:

- the server runs `advance()` on the same `Scene` and the same Core (`PROJECT.md` §3.2); nothing
  here adds a parallel execution path;
- the snapshot is JSON produced by `serializeScene()` — the format a server would already send to
  bootstrap a client;
- `Play` emits no Operation: it does not replicate, and therefore cannot start somebody else's game
  by accident.

What explicitly waits for the multiplayer runtime:

| Question | Why it cannot be settled here |
|---|---|
| Who is allowed to press Play in a shared session | It needs the session authority model (ADR-0011 covers mutations, not lifecycle) |
| What Stop means for the other players | It needs to know whether a session is an object of the model |
| Whether the snapshot comes from the client or the server | It needs server-side project loading |

## What this ADR does not decide

- **Stepping** (advancing by one frame): trivial once `PAUSED` exists, but no control asks for it
  yet.
- **Playback speed.**
- **A "play from here" mode** (game camera versus editor camera): it requires deciding which of the
  scene's `Camera`s is active, which ADR-0013 leaves open.
- **Keeping the changes at Stop** (§4).

## Consequences

### Positive

- Three buttons each with a written definition, and a `Stop` that really restores.
- No second runtime, no copy of the scene: the "edit while it runs" promise is kept instead of
  worked around.
- The cost to `runtime/` is one method, and it has a meaning outside the transport.

### Negative

- Changes made during Play are lost (§4) — standard behaviour, but it must be made visible rather
  than only documented here.
- History is cleared at start (§5): a creator loses their undo by playing. The opposite choice would
  be an undo that lies.
