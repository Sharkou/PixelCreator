# ADR-0012 — The Runtime isolates and reports errors, it does not modify the model

- **Status:** **accepted** (2026-08-12)
- **Decides:** what the Runtime does — and does not do — when a Component throws
- **Related to:** ADR-0004 (Component lifecycle), ADR-0003 (Property System), ADR-0011 (authority)

---

## Observed context

### Legacy swallows errors

`Object.update()` wraps every component call in a `try/catch` that **reports nothing**. That is
what made three defects documented in `migration/LEGACY_ANALYSIS.md` invisible:

| Defect | What the `try/catch` made of it |
|---|---|
| `Tilemap.draw(ctx, camera)` receives an `Object` | a `TypeError` every frame, never shown |
| `Collider.update()` references `Scene.main` without importing it | a `ReferenceError` every frame, never shown |
| `Controller` → `Keyboard` → `Network.users` offline | single-player broken, **and silent** |

The isolation was good: a frame did not fall over. The reporting was absent.

### The first v2 fixed the reporting and introduced a worse defect

Step 2.8 added an `onError`, but also a failure counter: after `maxFailures` consecutive
exceptions (3 by default), the Runtime ran

```js
component.active = false;
```

The intent was reasonable — do not replay a systematic error sixty times a second. The mechanism
is not.

**An attached Component is wrapped in a reactive Proxy** (`Object.addComponent()` calls
`makeReactive()`). That write is therefore not an internal Runtime detail: it goes through the
Property System's `set` trap, **emits a `Change`**, is visible to the Inspector and is a candidate
for replication.

In other words: **an exception in a user script mutated simulation state.**

For an authoritative multiplayer engine (ADR-0011) that is exactly backwards. The state the server
arbitrates would start depending on whether a script threw, on that machine, on that frame. Two
clients running the same simulation would diverge because one hit an error and the other did not.
The disabling would furthermore be replicated as a legitimate intent, when no intent ever existed.

---

## Decision

**The Runtime isolates execution errors and reports them. It never automatically modifies the
model's state in reaction to an error.**

Four concerns were conflated; they are now separated:

| Concern | Whose it is |
|---|---|
| Isolating an exception | **Runtime** — a `try/catch` around `update()` and `draw()` |
| Reporting | **Runtime** — a structured report passed to `onError` |
| Policy (display, count, pause, disable) | **a higher layer** — Editor, server, host |
| Simulation state | **the model alone** — never written by the Runtime |

### 1. No auto-disabling

`maxFailures`, the failure counter and the `component.active = false` write are removed. A
Component that throws every frame will be called every frame, and reported every frame. It is for
the higher layer to decide that is enough.

**An invariant, covered by a test:** an execution error produces no `Change` merely because the
Runtime handled it.

### 2. `active` stays an ordinary Component property

No special mechanism is created for `active`. It is an ordinary reactive property, of which only
the **direction of use** is normative:

- **read** by the Runtime and the SceneRenderer, to decide whether to run `update()` / `draw()`.
  An absent property means "active";
- **written** by user code, by a Component or by the Editor, through the normal Property System;
- **never written by the Runtime.**

A higher layer that *chooses* to disable a script after N errors remains perfectly free to do so:
it will write `active` itself, explicitly, and that write will then be a real intent, attributable
and representable as an Operation (ADR-0008).

### 3. A structured report, a single channel

```js
new Runtime(scene, { onError: report => { /* policy */ } });
```

```js
{
    error,      // the original Error object, never modified
    object,     // the Object concerned
    component,  // the Component concerned
    type,       // the Component's type name
    phase,      // 'update' | 'draw'
    time        // the simulation time of the failure, null if unknown
}
```

The consumer **reads fields; it never parses a message**. That is what lets the Editor group by
component, open the offending object, or tell a simulation failure from a rendering failure — none
of which is recoverable from a string.

The previous version rewrote `error.message` to inject the context: it mutated an object that did
not belong to it, and destroyed the original message. **The original Error is never touched
again.**

**One reporting channel.** No parallel `runtime.errors` emitter. A minimal API, onto which the
Editor will plug its own policy when the time comes.

### 4. Without an `onError`, the error stays noisy

The default reporter defers the throw (`queueMicrotask`) so that the current frame finishes, then
throws a context error whose `cause` is the original error, intact. It lands on the environment's
uncaught-error path, where it cannot go unnoticed.

**Legacy's silence is never reproduced.** An unconsumed error stays visible.

---

## Consequences

### Positive

- The Runtime no longer has any write path into the model. The rule is verifiable by reading the
  file, and by a test.
- The simulation can no longer diverge between two machines because of an exception.
- Error policy is decided where the context exists: the Editor can pause in development, the
  server can apply a stricter rule, without the Runtime having to know about either.
- The report is directly usable by the Editor, before it even exists.
- The contract is fixed **before** scripting, physics and the other runtime domains arrive, all of
  which will consume it.

### Negative

- A systematically broken Component is called and reported every frame. With no `onError`
  consumer, that can produce a lot of noise. That is deliberate: noise is a visible symptom,
  Legacy's silence was not. The higher layer has everything it needs to throttle or disable —
  explicitly.
- `onError` is called in the hot loop. If it throws, the frame falls over: that is a defect in the
  policy layer, not in the Runtime, and it must be visible.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keep auto-disabling** | It turns an exception into a replicated state mutation. Incompatible with ADR-0011. |
| **Disable through a Runtime-internal flag rather than `component.active`** | It would emit no `Change`, but it would create a second activation state invisible to the model and to the Inspector — two sources of truth, and a disabling nothing explains. |
| **A `runtime.errors` emitter in addition to `onError`** | Two channels for one need. `onError` is enough; an emitter can be added by the higher layer if it wants one. |
| **Enriching `error.message` with the context** | It mutates an object belonging to the caller and forces string parsing. That is what the report's fields are for. |
| **Swallowing the error when there is no consumer** | That is precisely the Legacy bug. |
| **Counting errors in the Runtime without disabling** | A counter is already a policy. The higher layer counts if it needs to; the Runtime does not get to decide what "too many" is. |

---

## Scope

This decision covers Components' execution errors during `update()` and `draw()`. It does not
cover:

- loading and running `.px` / `.js` scripts — scripting does not exist yet (ADR-0009);
- Operation validation errors, which belong to the authority (ADR-0011);
- displaying errors in the Editor, which is a policy and will be designed with it.
