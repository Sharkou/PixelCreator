# ADR-0048 — A property is named the way it is read

- **Status:** **accepted** (2026-08-31)
- **Amended by:** ADR-0052 (2026-08-31) — §3: the final refusal of the Component → graph gesture now applies to bare canvas only; on a node that asks for a property, the release opens its picker.
- **Decides:** how a search query is compared against an entry; what a property is called in a list; what a Component released on a graph means, definitively; which computation nodes the catalogue was missing
- **Depends on:** ADR-0026 §10 (grouped menus), ADR-0039 (taxonomy), ADR-0043 (the Object answers for itself), ADR-0047 (one question)
- **Amends:** ADR-0047 §2 (the refusal of the Component → graph gesture is confirmed, with a measurement behind it rather than an argument)
- **Does not decide:** `On Collision` and physics; a project's identity and its slug; `Random`, `Delay`, `Timer`, `Destroy`, `Spawn`; a port's unit

---

## 1. A query may name the group and the row

Removing the `Component` field (ADR-0047 §1) made the GROUP half of a property's name. The search
engine, however, compared the **whole** query against **one field at a time** — so
`Transform Position X`, the query a creator writes when they know exactly what they want, could match
nothing: `Transform` is the category, `Position X` is the label, and no field holds both.

> **Every word of the query must be answered, by the field that answers it.**

The whole query against a single field is still tried **first**, so any single-word search ranks
exactly as before. The split only kicks in when nothing answers as a block.

It is an **AND**: the list narrows as you type, which is what a filter is supposed to do. A word
nothing answers excludes the entry.

| Query | Before | After |
|---|---|---|
| `Transform Position X` | nothing | `Transform ▸ Position X` |
| `Health Value` | nothing | `Health ▸ Value` |
| `Object Name` | nothing | `Object ▸ Name` |
| `add` | `Add`, `Add Component` | unchanged |

---

## 2. `X` is not a name, it is half a name

The Inspector draws `x` and `y` on **one row** under the word `Position`: the row says the pair, so the
property does not have to. A picker has no such row — `X` ends up there under `Transform`, beside
`Scale X`, and a creator searching for the words they see in the panel found nothing.

> **In a list, a property that is half a pair says which pair.**

Only the halves that cannot speak for themselves: `scaleX` already humanizes to `Scale X` and `width`
to `Width`, and prefixing them would produce `Scale Scale X` and `Size Width`. A one- or two-character
label is exactly the case the pair's name has to catch.

```
  Transform
    Position X   ← was "X"
    Position Y   ← was "Y"
    Rotation
    Scale X
    Scale Y
    Rotation X
    Rotation Y
```

It is also what makes §1's query useful: a creator searches for the words they read.

---

## 3. A Component still is not released on a graph — and this time it is measured

ADR-0047 §2 refused it because the gesture would write a dead value. The model has changed since (the
picker is hierarchical), so the question was asked again honestly: **could a Component release open
the picker positioned on that Component?**

Technically yes. But the gesture that already exists is shorter, and it was **run in Chrome**:

```
  drag THE PROPERTY   →  a Get / Set menu  →  a FINISHED node
                          (Object and Property filled)

  drag THE COMPONENT  →  the picker open on a group  →  a choice still to make
```

The first finishes the node; the second opens a question. A gesture that saves a click on a path
already longer than the other path is not an affordance, it is a second way of doing worse. **The
refusal is final** and its message names the two routes that work — drag the property, or open the
picker where that Component is a group.

---

## 4. A catalogue with no gaps

Eight nodes were missing, all one-liners, none touching the runtime, replication or the scene — and
therefore none requiring a decision:

| Category | Added |
|---|---|
| `Math` | `Modulo`, `Min`, `Max`, `Absolute`, `Round` |
| `Compare` | `Greater Or Equal`, `Less Or Equal`, `Not Equal` |

`Modulo` takes the decision `Divide` had already taken, for the same reason: `x % 0` is NaN, and a NaN
entering a Transform propagates silently into every following frame. It answers `0`.

`Absolute` and `Round` take **one** number where `arithmetic()` takes two: it is the same shape with
one port fewer (`unary()`), not a second idea.

`Not Equal` reads **the same comparison** as `Equal`, through a function both call. Writing it as `!==`
beside an `Equal` written as `===` is how two rules that were one begin to diverge the day one of them
learns a new type.

---

## 5. Observable contracts

| Contract | Verifiable by |
|---|---|
| A multi-word query finds what its words name together | `relevance.test.js`, and on screen |
| A single-word search ranks as before | the same |
| `x` reads `Position X` in a list, `scaleX` stays `Scale X` | `schema.test.js` |
| The picker's `Transform` group reads like the panel | by eye, in Chrome |
| A Component released on a graph is refused, with both routes named | `dnd.test.js` |
| Dragging an Object property produces a finished node | **run in Chrome** |
| The eight added nodes answer | `nodes.test.js` |
