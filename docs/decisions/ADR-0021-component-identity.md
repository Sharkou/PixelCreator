# ADR-0021 — A Component definition's identity is distinct from its displayed name

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0004 (the key of `object.components`), ADR-0010 (identity by ID), ADR-0016 (definition), ADR-0020 (`ResourceId`)
- **Amends:** ADR-0004, §"the key in `object.components` stays the type name"

## Observed context

ADR-0016 showed a definition keyed by a readable name:

```json
{ "type": "Controller", "properties": { … } }
```

The consequence: **renaming a Component created by a creator broke every one of its instances.**
Every `Object` carries its type as a key, and every scene writes it into its JSON. A rename would
have required rewriting every scene in the project — or forbidding renaming.

Two other defects were measured:

- `registry.create()` **threw** on an unknown type, so the absence of a single definition file made
  you lose **the whole scene** at load time;
- a modified definition left already-saved instances carrying keys the schema no longer declared
  (phantom values), and without the newly added keys.

## Decision

### 1. `type` is the identity, `label` is the displayed name

| | A shipped Component | A creator's Component |
|---|---|---|
| `static type` | `'Transform'` — it is **code**, and therefore stable by nature | the `ResourceId` of its definition — it is **data**, and therefore unstable by nature |
| `static label` | absent; the type is read as is | `'Controller'` — freely editable |

**The asymmetry is accepted** and it is what makes the choice cheap: a shipped component's name
cannot change under a project's feet, a user component's can.

**Renaming becomes a `SET_PROPERTY` on the definition's `label`.** No instance is touched, no scene
rewritten, no project broken.

> **An amendment to ADR-0004.** The letter is honoured: the key in `object.components` stays
> `componentType(component)`. What is clarified is that this type is an **opaque identity** for a
> user Component, and not its display name — the "as in Legacy" intent presumed a readable name and
> no longer holds for that case.

### 2. What it costs, consumer by consumer

| Consumer | Effect |
|---|---|
| Serialization | keys by `componentType()` → **unchanged**. The JSON carries the identifier |
| `describeType()` (`editor/registry.js`) | already read `ComponentClass?.label ?? SHIPPED[type]?.label ?? type` → **the seam existed** |
| Icons | `iconForComponent()` reads `ComponentClass.icon` **before** the name table → unchanged |
| Inspector search | filtered on `humanise(type)` → **fixed**, it filters on the label |
| Section titles | displayed the type → **fixed**, they display the label; the collapsed state stays indexed by the **type**, so that a rename does not expand a panel |
| Runtime | the type is only a key → **unchanged** |
| Registry | keys by an opaque string → **unchanged** |

### 3. Structural reconciliation at load time (strategy S1)

The stored values are filtered by the current schema: **an unknown key is dropped, a missing key is
filled with the constructor's default.**

This is ADR-0016 §4 — "a fresh instance has exactly the declared properties" — applied at **load
time** and not only at construction. Adding a property makes it appear with its default; removing
one drops the phantom value. No migration script is written, and the result is deterministic on
every machine.

A component **with no schema** keeps everything it is given: the reflective fallback is a
requirement, not a tolerance (ADR-0007).

`active` is never filtered: it belongs to the Component contract, not to the schema (ADR-0004).

**The only case not covered is renaming a property.** The honest remedy, the day the need arises, is
a `previousNames: [...]` on the descriptor. **Not built.**

### 4. A missing type no longer loses the scene

Deserializing a Component of an unknown type produces a **`MissingComponent`** that:

- keeps its type name, and therefore the place it occupies;
- keeps its serialized values **in full**, byte for byte;
- keeps its rank in the ordered collection (ADR-0018);
- does not run — neither `update` nor `draw`;
- reports itself in the Inspector, with the values it holds.

Losing a scene because a file is missing is the worst possible behaviour for an editor. A
placeholder that preserves the data lets you restore the definition and find the project intact.

`registry.create(type)` **still throws** on an unknown type: asking the registry for a type it does
not have remains a programming error. What changes is loading.

### 5. `revision` serves invalidation, not migration

It tells `Behaviors` that a graph has changed and the Editor that a panel must be rebuilt.
**Instances do not store it** — that is what keeps S1 simple.

## What this ADR does not decide

| Open point | Where it will be settled |
|---|---|
| Renaming a **property** of a definition | when the need arises (`previousNames`) |
| What an **authoritative server** does with an incomplete scene: refuse it, or load it with placeholders | server policy, out of scope |
| The UI for creating and editing a definition | Editor |

## Consequences

### Positive

- Renaming a Component is free and risk-free.
- A name collision between two imported projects is impossible.
- A definition can evolve with no migration script.
- A missing file costs a placeholder, not a scene.

### Negative

- A scene's JSON is less readable: `"type": "res_c3"` instead of `"type": "Controller"`. The
  manifest provides the mapping, and that is the price of a stable identity.
- Two notions not to confuse when reading the code — but they are now named differently, which is
  precisely the remedy.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A `type` that is always readable** | Renaming breaks every instance. That is the defect being fixed. |
| **A readable slug fixed at creation** | Renaming stays free, but the slug and the label diverge over time, and a cross-project collision becomes possible again. All the complexity of an identifier without its benefit. |
| **S2 — versions + migration scripts** | High complexity, network determinism depending on the scripts, for a need S1 covers. |
| **S3 — do nothing** | Phantom values serialized, added properties absent. Incorrect. |
| **Throwing at load time on an unknown type** | It loses the whole scene because a file is missing. |
