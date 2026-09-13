# ADR-0023 — `PropertyType` belongs to the Core, `FieldKind` is derived from it in the Editor

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0007 (schema-driven Inspector)
- **Completes:** ADR-0007, §"Contemplated types"

## Observed context

Three lists of types coexisted, and none of them matched:

| `core/definition.js` — `DEFAULTS` | `editor/inspector/schema.js` — `FieldKind` | ADR-0007 (contemplated) |
|---|---|---|
| number, int, boolean, string, color, array, **object** | number, int, **range**, boolean, string, color, **enum**, **readonly** | number, int, boolean, string, color, enum, range, vector2, resource, object, array, action |

And in the shipped code: `Sprite.source` declares `resource`, `Tilemap.tiles` and `palette` declare
`array` — three properties the Core did not know what to do with, and that the Editor displayed
read-only **for want of a mapping**, not by decision.

`type: 'object'` appeared in **no shipped component**. The repository's only occurrence: a test
fixture.

## Decision

The divergence was not an oversight: **two different questions were being asked with one word.**

- *"what shape does this value have?"* → default, validation, serialization, replication → **a Core
  question**;
- *"with what control should it be edited?"* → slider, checkbox, picker → **an Editor question**.

> **The Core owns `PropertyType`. The Editor derives `FieldKind` from it.**

### 1. `PropertyType` — eight members, each justified

| Type | Justification | Default |
|---|---|---|
| `number` | ubiquitous | `0` |
| `int` | `layer`, `columns`, `rows` | `0` |
| `boolean` | `active`, `emitting`, `additive` | `false` |
| `string` | `name`, `tag` | `''` |
| `color` | `ParticleSystem.color`, `RectangleRenderer` | `''` |
| `enum` | already rendered by the Inspector, with no Core default until now | the first declared value |
| `resource` | `Sprite.source` already declares it; indispensable for `.px` and for user Components | `null` |
| `array` | `Tilemap.tiles` and `palette` already declare it | `[]` |

For each descriptor, the Core answers three questions: what the starting value is
(`defaultForProperty`), whether that value is valid (`isValidValue`), and how it serializes. **A
type is added here only when the Core has all three answers.**

No type is added to complete a list: two were already declared in the shipped code, one was already
rendered, one is removed.

### 2. `type: 'object'` is removed

No schema, no validation, no editor, no meaning for replication. It was the only member nothing
justified, and nothing declared it.

### 3. An unknown type is refused, not ignored

`defineComponent()` **throws** on a `type` the Core does not know. That is what stops a definition
from declaring a property the Inspector will display read-only forever, with nobody knowing why.

### 4. `FieldKind` is derived, member by member

The mapping is **written down**, not left to a name collision: `number → NUMBER` is a decision, not
a coincidence, and both `resource` and `array` had to appear in it to be **handled** rather than
falling into a default.

| `PropertyType` | `FieldKind` |
|---|---|
| number | NUMBER, or **RANGE** when `min` and `max` are both declared |
| int | INT |
| boolean | BOOLEAN |
| string | STRING |
| color | COLOR |
| enum | ENUM, or READONLY when `values` is empty |
| resource | READONLY *(see below)* |
| array | READONLY *(see below)* |

`resource` and `array` are now **real Core types** — a starting value, validation, serialization.
What they lack is a **control**:

- an `array` displays its element count, which is true and useful; editing it needs a list control
  that does not exist;
- a `resource` carries an **opaque** `ResourceId`; choosing one needs a resource browser, whose
  place is the Project window. Offering a text field would invite the creator to type over it and
  break the reference.

That is visible, named work, rather than a silent dead end.

### 5. Two `FieldKind` members have no Core counterpart

- **`range`** is not a shape of value: it is a `number` bounded at both ends. It is **derived** from
  the constraints a component already declares, so no component has to be rewritten — ADR-0007
  listed it as a type; this is the same conclusion reached differently.
- **`readonly`** is a display fallback, never data.

### 6. Rejected

| Type | Verdict |
|---|---|
| `vector2` | unnecessary — the Inspector's `PAIRS` table already puts `x`/`y` on a single row |
| `action` | it is not a property. A button is a command, not serializable data. Its place is a future command registry |

### 7. The reflective fallback produces a `PropertyType`

Reflection answers the Core's question — what shape this value has — and the control is derived from
it as for any other. A shape it cannot name gives `null`, and a descriptor with no shape displays
read-only. **The fallback stays a requirement, not a tolerance** (ADR-0007).

## What this ADR does not decide

- The list control for `array`, and the resource browser for `resource`.
- The `min: 'max'` form (a bound naming another property), legal in ADR-0007: nothing reads it yet,
  and it is ignored rather than half-honoured.

## Consequences

### Positive

- Three properties of shipped components stop being dead ends in the Core.
- A user Component can no longer declare a property the Core initializes wrongly.
- The difference between "the shape of the value" and "the editing control" is named, so it stops
  drifting.

### Negative

- `defineComponent()` becomes stricter: a definition that declared `object` is refused. None
  exists.
- A hand-written mapping is one line to add when a type is added — which is the point: adding a type
  must force a decision about what edits it.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **A single shared list** | It would ask two questions with one word, which is exactly the cause of the measured divergence. |
| **Keeping `object`** | It invites declaring a property you can neither edit, nor validate, nor diff. Nothing declared it. |
| **Making `range` a Core type** | It is not a shape of value, and it derives from already-declared constraints. |
| **Letting an unknown type fall back to READONLY** | That is what kept `resource` and `array` invisible as a problem for months. |
