# ADR-0014 — Input is abstract, indexed by owner, and passed into the runtime

- **Status:** **accepted** (2026-08-12)
- **Amended by:** ADR-0041 (2026-08-28) — §5: a key's three questions are no longer one node. A moment (`On Key`) and a state (`Key Is Down`) are two nodes, because they are two things
- **Decides:** where input lives, what shape it has, and how the simulation reaches it
- **Related to:** ADR-0001 (`uid` → `owner`), ADR-0004 (the `update` context), ADR-0011 (authority)

---

## Observed context

**Offline single-player does not work in Legacy**, and nothing says so:

```
Controller.update()  →  Keyboard  →  Network.users  →  undefined  →  TypeError
```

One exception per frame, swallowed by the silent `try/catch` in `Object.update()`. The coupling is
a complete layer inversion: a local player's input goes through the network.

Input there is also a **global singleton** read from inside components. A server therefore cannot
simulate several players, and two runs of the same scene are not reproducible since the key state
can change between two reads.

---

## Decision

### 1. `runtime/input/`, not `core/input/`

The Core knows about no input. An `Object` has no input; a simulation does.

> **A correction.** `ARCHITECTURE.md` §4.5 originally placed input in `core/`, while
> `architecture/RUNTIME.md` placed it under `runtime/`. `runtime/` is what was adopted: the Core
> stays the pure model, with no notion of time or input.

### 2. An abstract state, no browser events

`InputState` knows about keys, buttons, a pointer position and named axes. It knows about neither
`KeyboardEvent`, nor `MouseEvent`, nor `window`, nor `document`.

```
browser adapter ───┐
                   ├─►  InputState  ──►  simulation
network layer ─────┘
```

Key names are opaque strings. A browser adapter puts `KeyboardEvent.code` values in them;
**nothing in the runtime depends on that**, and a server replaying names received from the network
never has to fabricate an event.

**The browser adapter is not built here.** It belongs to the layer that owns the DOM, and the
runtime only defines its contract.

The pointer position is **in screen space**. Converting it to world coordinates is the camera's
job (`screenToWorld`, ADR-0013), because only the camera and the viewport know that mapping;
freezing it into the input state would make it depend on how you are looking at the scene.

### 3. Indexed by owner, and the local one always exists

`Object.owner` designates the owning player (ADR-0001). Input is therefore state **per owner**, not
a global keyboard:

```js
const input = ctx.input.of(self.owner);
```

A server advances a simulation containing every player's input; a client fills its own. The `local`
owner **always exists**: `of(null)` returns the local state, so an object with no owner is
playable — that is what repairs single-player mode, with no special case.

`set(owner, state)` replaces a state wholesale: it is the network layer's path, which receives a
snapshot rather than a sequence of keys.

### 4. Passed into the simulation step, never fetched from a global

```js
runtime.step(input);
runtime.advance(elapsed, input);
```

**That is what makes the simulation deterministic.** The same initial scene and the same inputs ⇒
the same result, in a browser as on a server replaying what the players sent. It is the property
every reconciliation rests on (ADR-0011).

A runtime built with no input **runs on empty input** rather than failing. It never reaches for a
global: that is precisely what Legacy did.

### 5. Rising edges on exactly one step

`pressed()` and `released()` answer true on the single step that observes the transition. The
runtime calls `input.commit()` at the end of each step, so a press is observed once, **no matter
how many steps a frame owes** — a 30 Hz game and a 144 Hz game count the same jump.

---

## Consequences

### Positive

- Offline single-player works, with no network.
- A server simulates several players with one runtime.
- The simulation is replayable, and therefore testable and reconcilable.
- No DOM in the runtime; the browser adapter is replaceable.

### Negative

- `ctx.input.of(self.owner)` is more verbose than `Keyboard.isDown(...)`. That is the price of
  multiplayer, and the only form that stays correct with several players.
- `of()` creates an unknown owner's state on the first read. The map therefore grows with the
  owners actually consulted; `remove(owner)` cleans it up on disconnection.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A global `Input` singleton** | Neither multiplayer, nor deterministic, nor testable. It is the Legacy defect. |
| **Input in `core/`** | The Core is the model; it has neither time nor input. |
| **A DOM adapter inside the runtime** | It would make the runtime unusable server-side. |
| **The pointer position in world coordinates** | It would make the input state depend on the camera. |
| **Input read from `runtime.input` with no `step()` argument** | The state could change between two steps of the same frame: determinism disappears. |
