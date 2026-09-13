# ADR-0003 — Property System: a Proxy, and two replicated-mutation APIs

- **Status:** **accepted** (2026-08-12)
- **Decides:** how property writes are intercepted in v2
- **Supersedes:** `System.sync()` (`legacy/src/core/system.js:31`)
- **Related to:** ADR-0008 (Operations), ADR-0011 (authority)

---

## Observed context

`System.sync(object, component?)` walks the enumerable properties **at the moment it is
called** and replaces each of them with a pair of accessors, plus a write-only `$prop`
accessor. The result is three write channels, all intentional:

| Write | `setProperty` | `syncProperty` | Use |
|---|---|---|---|
| `obj.x = 100` | ✅ | ✗ | simulation, local camera |
| `obj.$x = 100` | ✅ | ✅ | user editing (Inspector, viewport) |
| `obj.setProperty('x', 100)` | ✅ | ✗ | network receipt, with no echo |

That distinction is **why the simulation does not flood the network** while keeping the
Inspector synchronized letter by letter. It has to survive.

### Measured defects

1. A property added after construction is **never** reactive — silently.
2. `#private` fields are invisible (`for...in` does not see them). Commit `38906c2` thereby
   removed `scaleX`, `scaleY` and `scaleFromBox` from `Texture`'s Property System without anyone
   noticing.
3. `_prop` and `$prop` are enumerable: every logical property occupies 3 entries. Serialization
   measured at **1733 B raw vs 560 B filtered — a factor of 3.09**.
4. `$prop` is write-only: `obj.$x` returns `undefined`.
5. The event does not carry the previous value → undo/redo is impossible.
6. The only way to know *why* a value changed is to know *which method* was called. Fragile and
   not transmissible.

### Performance measurement

3 M operations, Chrome:

| Implementation | Read | Write |
|---|---|---|
| A plain property | 18.6 ms | 4.8 ms |
| Legacy accessors | 81.6 ms | **301.5 ms** |
| `Proxy` | 82.0 ms | **76.9 ms** |

The `Proxy` reads as fast as what exists and **writes 4× faster**. The cost of a Legacy write
comes from `this['_' + prop] = value` (concatenation + dynamic property creation). The
reactivity overhead on reads is already being paid today.

---

## Decision

**One `Proxy` per object and per component**, replacing the per-property
`Object.defineProperty`. **Two forms of writing, and only one is public for controlled
mutation.**

### The two forms of writing

```js
object.x = 100;                   // direct mutation of the object's state
object.setProperty('x', 100);     // controlled mutation, through the Property System
```

**`object.$x` is removed.** The sigil was too implicit and too specific to Pixel Creator to be a
public API. It exists neither in v2 nor as target syntax for the parity harness.

### What each form does

| Form | Effect |
|---|---|
| `object.x = 100` | updates the state, emits a `Change` — views react. **No Operation.** |
| `object.setProperty('x', 100)` | goes through the Property System, emits a `Change` **and produces an Operation** |

```
setProperty()
    ↓
Property System
    ↓
Operation
    ↓
context / authority / destination
```

**`setProperty()` is not "the network method".** It is the model's controlled path. What the
Operation becomes next depends on the context: it may be validated by the authority, replicated,
recorded in the history, undone/redone, shared in collaboration, or handed to another system.
The network is only one possible destination among others.

No user code writes `network.updateProperty(...)`, and **no call site carries a synchronization
flag**. The path is chosen once, at the write, by choosing the form.

### The origin stays explicit

An Operation coming from the network must stay identifiable:

```js
{ …, origin: 'network' }
```

That is what prevents echoes, without resorting to Legacy's `dispatch = false` flag.
`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`.

### ⚠ `setProperty()` does not mean the same thing in Legacy

This is the main trap, and it concerns an identical name on both sides.

| | Legacy | v2 |
|---|---|---|
| `object.x = v` | writes the state, emits `setProperty` | writes the state, emits a `Change` — **close** |
| `object.setProperty('x', v)` | writes `_x` directly, emits `setProperty` — **does not replicate** | the **controlled path** — `Change` + Operation |
| `object.$x = v` | writes + emits `syncProperty` (replicated) | **does not exist** |
| `object.syncProperty('x', v)` | writes + emits `syncProperty` (replicated) | replaced by `setProperty()` |

The historical role of `$x` / `syncProperty()` is therefore **taken over by `setProperty()`**,
while Legacy's `setProperty()` — a direct writer with no replication — disappears as such.

Anyone reading `legacy/` and reasoning by analogy will be wrong. Repeated in `CONVENTIONS.md`,
in `setProperty()`'s JSDoc, and **explicitly encoded in the parity harness's mapping**.

### What `object.x = 100` means

The axis of distinction is **not** "replicated / not replicated": it is **"simulation output"
versus "intent"**.

| Form | Nature | Who is authoritative |
|---|---|---|
| `object.x = 100` | a simulation output — a component integrates a velocity, a camera follows a target | both sides compute; the server decides through state replication |
| `object.setProperty('x', 100)` | an **intent** — a human (or an AI) decides on a value | the authority validates, then propagates |

That framing is better than "not replicated", for three reasons:

1. It explains why `self.x += vx` inside `Controller.update()` must **not** produce an
   Operation: it is not a decision, it is a result.
2. It aligns with server authority (ADR-0011): a client intent is *submitted*, a simulation
   output is *predicted*.
3. It gives a simple rule:
   **a Component never calls `setProperty()`; the Editor never writes without it.**

**The failure mode is asymmetric.** Calling `setProperty()` where `=` would have done costs
traffic and one history entry. Writing `=` where `setProperty()` was required produces a change
that **neither replicates nor undoes** — silently. It is that second case that has to be
detected.

**A guard (development only).** The Property System knows the active origin (`editor`,
`runtime`, `player`). A direct `=` write occurring in an `editor` context emits a warning naming
the property and its file. No blocking, no cost in production — just the end of a class of
invisible bugs.

### The internal layers are not an API

Legacy stacks `object.x` → `object._x` → `object.__x`. Those levels are documented
(`../migration/LEGACY_ANALYSIS.md` §2.2) because they explain observable behaviour, in
particular hierarchical propagation.

**They do not become a v2 API.** `_x` and `__x` remain internal implementation possibilities;
neither users nor components have any business touching them, and **no public v2 API depends on
those conventions**. The `Proxy` makes the parasitic storage unnecessary anyway (see below).

### What changes inside

The `set` trap emits a **Change** instead of two distinct events:

```js
{
  object,      // the Object concerned
  component,   // the Component, or null
  prop,
  value,       // the new value
  previous,    // the old value           ← new
  origin       // 'local' | 'editor' | 'runtime' | 'network'   ← new
}
```

`origin` replaces inference from the method called:

| Origin | Emitter | Network replicates? | Views react? |
|---|---|---|---|
| `runtime` | a component's `update()` | no | yes |
| `editor` | Inspector typing, viewport drag (`$`) | yes | yes |
| `network` | an incoming message | **no** (no echo) | yes |
| `local` | a user script | no | yes |

The rule "do not send back to the network what came from it" becomes explicit data rather than a
side effect of `setProperty(prop, value, dispatch=false)`.

### What this fixes mechanically

| Defect | Fixed by |
|---|---|
| Silent dynamic properties | the trap intercepts every key, known or not |
| Invisible `#` fields | they leave the model: internal state, not serialized, not inspected — by design rather than by accident |
| ×3 serialization | there is no longer a stored `_prop` or `$prop` |
| Slow writes | 77 ms instead of 301 ms |
| No `previous` | read before writing, inside the trap |

---

## Consequences

### Positive

- The Property System becomes testable in isolation (no DOM or network dependency).
- A direct basis for Operations (ADR-0008): a `Change` with `previous` **is** a reversible
  `SET_PROPERTY`.
- Serialization becomes explicit and compact.
- Undo/redo becomes possible without a rewrite.

### Negative, and limits

- **Identity:** `proxy !== target`. Every comparison by reference (`obj === other`, `Map`/`Set`
  keys, `scene.objects[id] === obj`) must handle **the proxy everywhere**, never the target.
  Rule: the target never leaves `core/properties`.
- **Reads are still 4× slower** than a bare property. Identical to today, but it constrains
  rendering: read `transform` once per object rather than repeating `self.x`, `self.y`,
  `self.width`…
- **Nested objects** (`Vector`, `Color`, `animations`) are not intercepted deeply by default.
  Legacy did not handle them either (`// TODO: Gérer les objets`). The decision: **shallow**
  interception to begin with; value types (`Vector`, `Color`) are replaced whole, not mutated in
  place.
- `Proxy` does not exist in ES5 — moot here, the target is the modern browser.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keep `defineProperty`, fix the bugs** | It solves neither dynamic properties nor the `_`/`$` pollution, and it stays 4× slower on writes. |
| **An explicit `obj.set('x', 100)` API** | It destroys the ergonomics, which are the heart of the product. Explicitly ruled out by the vision. |
| **Signals / observables** | They require declaring each property, change how the user writes, and add a concept. |
| **Per-frame dirty checking** | It loses letter-by-letter immediacy and the previous value. |
| **Immutability + structural sharing** | Incompatible with `self.x += vx` inside components. A total rewrite of the model. |

---

## Required validation

Before this decision is considered settled:

1. A harness that runs the same sequence of writes on Legacy and on v2 and compares the
   **sequence of emitted events** (ordering included).
2. A CI benchmark on a realistic scene (≥ 500 objects, 60 fps).
3. A check that letter-by-letter editing stays identical (Inspector + Hierarchy).
4. A test that `object.setProperty('x', v)` produces a `Change` **and** an Operation.
5. A test that `object.x = v` produces a `Change` and **no** Operation.
6. A test that an applied Operation with `origin: 'network'` produces **no** outgoing Operation
   (no echo).

> **A warning about the parity harness (point 1).** It compares the *shape* and the *order* of
> the notifications, not the semantics of `setProperty()`, whose name is identical on both sides
> but whose meaning differs. The mapping must be explicit:
>
> | Legacy | v2 |
> |---|---|
> | `obj.x = v` | `obj.x = v` |
> | `obj.$x = v` / `obj.syncProperty('x', v)` | `obj.setProperty('x', v)` |
> | `obj.setProperty('x', v)` | *a Legacy-only probe* — no v2 equivalent |
> | a plain assignment on network receipt | `applyOperation({ origin: 'network' })` |
>
> **No v2 scenario uses `.$x`.** Without this mapping, the harness would report false
> regressions.

The `$` sigil is **removed** (a final decision, 2026-08-12).
