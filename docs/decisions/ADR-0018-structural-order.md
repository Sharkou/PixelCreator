# ADR-0018 — Structural order is meaningful, persistent, and serialized as such

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0004 (the key of `object.components`), ADR-0007 (schema)
- **Completed by:** ADR-0019 (structural Operations)

## Observed context

**Component order already governed behaviour, and was destroyed on save.**

| Consumer | What it reads | Effect |
|---|---|---|
| `runtime/runtime.js` | `Object.keys(object.components)` | the execution order of `update()` |
| `runtime/rendering/scene-renderer.js` | `Object.keys(object.components)` | the `draw()` order **inside an object** |
| `editor/windows/inspector.js` | `Object.keys(object.components)` | the display order |
| `core/serialize.js` | `Object.keys(...).sort()` | **the order is lost** |

An `Object` carrying `RectangleRenderer` **and** `Sprite` draws both, and Component order decides
which goes on top. It was therefore already a composition technique — but one that did not survive
a save.

`core/serialize.js` asserted in a comment that "component type carries no ordering meaning". That
was false when it was written.

Likewise, `Scene.roots()` **filtered** the objects with no parent. The order of the top of the
Hierarchy was therefore creation order: not modifiable, not saved, not undoable.

## Decision

**SETTLED: the order of an `Object`'s Components, and the order of a `Scene`'s roots, are part of
the project's state.**

> The order of an `Object`'s Components is the order in which the Runtime runs their `update`, the
> order in which the renderer runs their `draw`, and the order in which the Inspector displays
> them. It is the same order. It is persistent.

### 1. The internal storage is ordered, the public getter does not change

`object.components` stays a frozen object keyed by type. What changes is that **the order of its
keys is now the collection's**, and not an accident. A `Map` preserves insertion order, and the key
order of a JavaScript object is insertion order for any key that is not an integer — which a type
name never is.

**No existing reader is broken.** `runtime.js`, `scene-renderer.js` and `inspector.js` read the
same shape and now see the right order.

Added to it: `object.componentTypes()`, `object.componentList()`, `object.componentIndex(type)`,
`object.moveComponent(type, index)`, and an optional `index` on `addComponent()`.

### 2. The Scene holds an ordered list of roots

`Scene.roots()` returns a list the Scene owns, instead of a filter. The roots are the children of
an implicit `null` parent — see ADR-0019, which makes it one and the same `REPARENT`.

### 3. The serialized form carries the order

`components` becomes an **array**, and the scene carries `roots`:

```json
{
  "version": 2,
  "roots": ["a1b2", "c3d4"],
  "objects": [{
    "id": "a1b2",
    "components": [
      { "type": "Transform",         "values": { "x": 0, "y": 40 } },
      { "type": "res_c3",            "values": { "speed": 120 } },
      { "type": "RectangleRenderer", "values": { "width": 64 } }
    ]
  }]
}
```

An array **is** ordered. An `order` field inside an object would be an ordering you have to keep
consistent, validate, and repair when it is not.

The sort disappears from `serialize.js`. The determinism that sort was after is obtained otherwise,
and better: two serializations of the same model are identical byte for byte because **the model is
ordered**, not because the writer imposes an order on top.

### 4. The flat `objects` list follows the hierarchy

`serializeScene` writes the root objects first, then depth-first. The insertion order in the flat
storage is an accident of history — deleting a subtree and then undoing made an identical model
serialize differently. The file's order is now **derived from `roots` and `children`**, which are
data.

### 5. `FORMAT_VERSION` goes to 2

No migration to write: there is no v1 project (`ARCHITECTURE.md` §10). Format 1 is not tolerated —
`components` as an object is **refused** rather than read, because accepting the old form would
amount to loading a project whose order had been silently alphabetized.

## What this ADR does not decide

- The **draw order between objects** stays governed by `layer` and then by scene order
  (`SceneRenderer.#drawOrder`, a stable sort). Unchanged, and deliberately distinct from `update`
  order.
- The ergonomics of reordering in the Inspector (a drag handle, a menu) remain to be designed. The
  model and the Operation exist (ADR-0019).

## Consequences

### Positive

- Stacking two renderers on one object becomes a **saved** technique, not a tolerated accident.
- `serialize.js` stops asserting the opposite of what the model does.
- Reordering becomes a mutation like any other: replicated, undoable, arbitrated.
- Two serializations of the same model are identical, whatever the construction order.

### Negative

- The serialized form of `components` changes. Three tests encoded it and were fixed, including one
  that explicitly asserted the opposite of this decision (`serialize.test.js`, "component keys are
  sorted").
- Reordering inside a `Map` is a rewrite, and therefore O(n). On a collection holding a handful of
  components, that is the price of a single storage rather than a `Map` plus an order array that
  could diverge.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **An `order` field in the serialized object** | An ordering to maintain, validate and repair, where an array simply is one. |
| **Turning `object.components` into an indexed array** | It breaks `runtime.js`, `scene-renderer.js`, `inspector.js` and their tests, for index access that only `moveComponent` needs — and `moveComponent` operates on the internal storage. It would triple the scope and add nothing. |
| **Keeping the alphabetical sort** | It destroys information three consumers already read. |
| **Tolerating format 1 on read** | It would load a project whose order has been lost, without saying so. No v1 project exists. |
