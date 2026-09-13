# ADR-0036 — The `objectref` ↔ `object` boundary translates the value, not just the type

- **Status:** **accepted** (2026-08-22)
- **Decides:** what crosses the boundary between a **persisted** Object reference and an Object reference **flowing through a graph**, in both directions
- **Depends on:** ADR-0003 (a plain write versus an intent), ADR-0007 (a declared schema), ADR-0010 (identity by ID), ADR-0023 (`PropertyType`), ADR-0027 (the graph model), ADR-0034 (Object references in the graph)
- **Amends:** ADR-0034 §3.6 — "no node resolves a string against the Scene" gains the **provenance** criterion that makes it applicable
- **Completes:** ADR-0034 §3.5 — the contract is stated there and was applied only to the type; its decision does not change, it is honoured
- **Does not decide:** dragging onto the canvas, future reference nodes, a `component` or `property` port type

---

## Why this is an ADR

ADR-0034 §3.5 states a contract in so many words:

> An `objectref` property is read as an Object and written with an Object. The identity is what is
> stored, and it never appears in the graph.

ADR-0034 §3.6 states, just as categorically:

> **No node resolves a string against the Scene.** `scene.get()` is reachable only from a node's
> `evaluate` or `execute`, and therefore from the catalogue. A node that converted a string into an
> Object would single-handedly reopen every door this ADR closes.

**Both cannot be true as they stand.** An `objectref` property is stored as a string; reading it "as
an Object" is exactly the operation §3.6 forbids. The repository settled it by implementing neither:
`portTypeOf()` translated the **type**, the translation of the **value** was never written, and the
defect below follows directly from that.

So this is not documentation of an implementation: it is the missing criterion that makes the two
sections compatible. Without it, the fix reads as a violation of ADR-0034, and a future reader would
be right to undo it.

---

## The measured defect

Measured on a `.px` declaring `target: objectref`, entirely constructible from the Editor —
`objectref` appears in `authorableTypes()` and the property picker offers it. No manual payload
editing is needed.

**The read direction.** `property.get` returned `io.component[name]`, that is, the `ObjectId`, on a
port `portTypeOf()` had typed `object`. `canConnect()` allowed the wire and `validateGraph()` stayed
silent: the type system said *handle*, the value was a string.

| Reference state | `Is Valid` | `Parent` | Expected |
|---|---|---|---|
| live | `true` | **`null`** | the parent Object |
| dead (target deleted) | **`true`** | `null` | `false` |
| empty | `false` | `null` | conformant |

`Is Valid` is what ADR-0034 §3.3 calls "what the creator has to defend against a missing target". It
answered `true` on a dead reference, because a non-empty string is not `null` — the one node whose
whole purpose that is was the one that lied.

**The write direction.** `Self.object → Set Property.value` on that same property wrote the reactive
Proxy into the instance value. `serializeScene()` then wrote the whole Object record into the scene
payload:

```json
{ "target": { "id": "…", "name": "Hero", "tag": "", "layer": 0,
              "active": true, "lock": false, "owner": null } }
```

That is ADR-0034's invariant 3 — "a handle is never persisted, never serialized" — broken by a wire
the type system allowed, because the port and the property agreed on the type and diverged on the
shape.

---

## Decision

### 1. The value translation is a pair, in the same place as the type translation

Two functions, in `core/graph/standard.js` — the node catalogue, which already holds `io.ctx.scene`
and is the only place where a graph reads or writes a Component value:

```
portValueOf(property, value, scene)    stored value  → port value
storedValueOf(property, value)         port value    → stored value
```

They are **`portTypeOf()`'s twin**, and the reasoning is its own: four nodes build a port from a
property's declared type, so the expression is a shared function and not a repeated one. Those same
four nodes — `property.get`, `property.set`, `property.getOn`, `property.setOn` — now cross the
boundary through these two.

**A property that is not `objectref` crosses unchanged.** No nullish fallback: `0`, `false` and `''`
are values.

**What does not resolve becomes `null`, never itself.** A deleted target, an empty reference, no
Scene, a value of an unexpected shape: all answer `null`, which is what a port typed `object`
promises and what gives `Is Valid` its meaning back.

**`storedValueOf` reads `value?.id`.** A string returns `undefined`, and therefore `null`: nothing
here promotes an arbitrary string into a stored reference.

### 2. What §3.6 forbids is the **provenance**, not the operation

> **A node never resolves a graph value. It resolves an instance value whose schema declares the type
> `objectref`, and nothing else.**

That is the criterion that was missing, and it is checkable rather than asserted:

| | a graph value (`node.inputs`) | an instance value declared `objectref` |
|---|---|---|
| Scope | **project** — a `.px` serves several scenes | **scene** — an identity is already legal there |
| Who can write it | any payload, including one forged by hand | the Component's schema, and it alone |
| Forgeable | yes — an `{ id, name }` record is indistinguishable from a handle | no — the type is declared, not guessed |
| Treatment | **refused without inspection** (`defaultOf`, ADR-0034 §3.6) | **resolved**, by `scene.get()` |

The two rules are the same rule seen from both sides of a boundary: `defaultOf()` refuses to let an
identity enter the graph through the payload, `portValueOf()` allows a declared identity to become a
handle through the model. What §3.6 protected — that a `.px` carries no scene identity — is intact:
nothing resolved here was ever written into a `.px`.

**No generic `Resolve(string) → Object` node is introduced, and this ADR authorizes none.** The
declaration is the authorization; without a declaration, there is no resolution.

### 3. No backward compatibility for corrupted values

A run of the defect may have written an Object record where a string is expected. The repository
**adds no tolerant read**, and the refusal is reasoned:

- **The data does not exist here.** No `.px`, no scene and no JSON fixture in the repository declares
  an `objectref` property; the starter project contains none.
- **The path is narrow.** You have to declare the property, wire an `object` port into a
  `Set Property`, press Play — the Runtime runs on the live scene (ADR-0029 §1) — and save before
  Stop, since Stop restores the snapshot taken at the start.
- **The degradation is already correct and visible.** `scene.get(record)` answers `undefined`, and
  therefore `null`: the reference reads as empty in the graph and shows red in the Inspector, where
  `ui/object-field.js` shows a dead reference rather than an empty one. The fact is shown where a
  human can see it, which ADR-0034 §3.4 requires.
- **A fallback would hide the next corruption.** Reading `value.id` when the value is a record would
  make the class of defect this ADR closes permanently undetectable. That is the reasoning ADR-0034
  §3.1 makes about another fallback — the one it refuses for an unreachable object, because it would
  hide a defect in adding instead of revealing it.

---

## Observable contracts

| Contract | Verifiable by |
|---|---|
| A live reference flows as a handle | `Parent` returns the target's real parent — a string cannot fake that |
| A dead reference does not flow | `Is Valid` returns `false` after the target is deleted, the stored value being kept |
| A write stores the identity | `typeof` of the instance value after a `Set Property` fed by `Self` |
| No handle is serialized | no component value in the payload is a record |
| The round trip preserves the reference | serialize, deserialize, read back: the target still resolves |
| A graph value never becomes an Object | a forged record in `node.inputs` still returns `null` |
| A non-`objectref` property is unchanged | `0`, `false`, `''` cross all four nodes as they are |

---

## Tests

Written in `core/graph/nodes.test.js` (the pair, pure) and `runtime/scripting/interpreter.test.js`
(the boundary, through a running graph).

| # | Test | Protects |
|---|---|---|
| B1 | A stored reference becomes the handle the Scene holds | §1 |
| B2 | An absent target, an empty reference, no Scene: `null`, never the identity | §1 |
| B3 | A handle becomes the identity; a string becomes nothing | §1, §2 |
| B4 | A non-`objectref` property crosses unchanged, falsy values included | §1 |
| B5 | `Get Property`: a live reference → `Is Valid` true **and** `Parent` returns the real parent | the main defect |
| B6 | `Get Property On`: the same behaviour on another Object's Component | §1 across all four nodes |
| B7 | A dead reference: `Is Valid` false, `Parent` null, the stored value kept | `Is Valid`'s lie |
| B8 | An empty reference: `Is Valid` false | no regression |
| B9 | `Set Property` / `Set Property On` fed by `Self` store a string | invariant 3 |
| B10 | `serializeScene()` writes no record into a component value | invariant 3, stated as an invariant |
| B11 | Round trip: the reference comes back and still resolves | §3.5 over time |
| B12 | A deleted target then a round trip: the value kept, the resolution null | §3.4 after reload |
| B13 | A forged record in `node.inputs` still does not become an Object | **no regression of §3.6** |

Sixteen tests cover those thirteen lines. **Ten of the thirteen fail** against the previous
implementation, which is the only proof worth having that they guard something. The other three — B4,
B8, B13 — already passed, and guard against a future regression: that the translation touches an
ordinary value, that an empty reference stops being empty, or that the resolution added here extends
to graph values.

---

## Consequences

### Positive

- `Is Valid` stops lying, so the one means of defence ADR-0034 gives the creator works.
- `Parent`, `Get Property On` and `Set Property On` operate on a persisted reference exactly as they
  operate on `Self`: one Object semantics in the graph.
- A scene can no longer hold a serialized handle.
- The complete "`objectref` property → graph" path becomes usable: it is the only legal way to
  designate a specific Object from a `.px`, since project scope forbids writing a scene identity
  into one.

### Negative

- `property.get` on an `objectref` property needs `io.ctx.scene`. A caller that does not supply one
  reads `null` where it read a string. That is the honest degradation — the port promises a handle —
  but it is a behaviour that changes.
- A value corrupted by the defect now reads as a dead reference rather than as a string. No data in
  the repository is affected.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| Typing the port `objectref` rather than `object` | `typesCompatible()` compares names: the port would no longer be compatible with what `Self` produces. ADR-0034 §3.5 already writes it — "no port is ever typed `objectref`" |
| Resolving in the interpreter rather than in the catalogue | the interpreter does not know a property's schema; it would have had to be given what the catalogue already holds, plus a second authority on what a property is |
| An explicit `Resolve` node, left to the creator | it exposes the internal mechanics instead of closing them, and reopens §3.6 for good: the node would accept any string |
| Validating on write rather than translating | `isValidValue()` is not consulted by a plain write, and ADR-0003 requires a graph to write plainly. Validating would have required a second write path |
| A tolerant read for corrupted values | it would hide the class of defect this ADR closes, for data whose existence could not be established |
