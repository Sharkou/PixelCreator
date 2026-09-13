# ADR-0002 — Transform becomes a Component, `object.x` stays a façade

- **Status:** **accepted** (2026-08-12), clarified on 2026-08-13
- **Decides:** where `x`, `y`, `rotation`, `scaleX`, `scaleY` live

---

## Observed context

In Legacy, the transform is **hard-coded into `Object`**:

```js
this.x = x; this.y = y;
this.width = width; this.height = height;
this.rotation = 0.0; this.scale = 1.0;
```

`x` and `y` go through a three-level chain (`legacy/src/core/object.js:56-96`):

```
obj.x     an instance accessor installed by System.sync  → emits setProperty
  → obj._x   a prototype accessor                        → propagates the delta to the children
    → obj.__x  the real storage
```

The intermediate `_x` level exists only to offer a hook for hierarchical propagation. `width`,
`height`, `rotation` and `scale` have none, and therefore do **not** propagate to the children —
an undocumented asymmetry.

Observed consequences:

- every `Object` carries a position, even a purely logical one (a score manager, a timer, a
  spawner);
- the hierarchy logic lives in `Object` and cannot be replaced;
- the Inspector lists `x`/`y`/`width`/`height`/`rotation` as object properties and hides
  `scale` with a hard-coded blacklist;
- serialization exposes `__x`, `__y` (visible in the heartbeat).

---

## Decision

`Transform` becomes a component. It holds the values. `Object` exposes a **façade**.

```js
// The single source of truth
object.components.get('Transform').x

// The façade on Object — reads AND writes delegate, no copy
get x()  { return this.components.get('Transform').x; }
set x(v) {        this.components.get('Transform').x = v; }
```

The three writes below are the same path:

```js
object.x = 100;
object.getComponent('Transform').x = 100;
object.components.Transform.x = 100;
```

**There is never an `Object._x` and a `Transform.x` as two values.** The façade stores nothing.

### The exact contents of Transform — clarified on 2026-08-13

`Transform` carries **only the local spatial transform**:

| Property | Meaning |
|---|---|
| `x`, `y` | position, relative to the parent |
| `rotation` | rotation in radians, relative to the parent |
| `scaleX`, `scaleY` | scale factors, relative to the parent |

**`width` and `height` do not belong to `Transform`.** A size does not describe *where* an
object is but *what* is drawn or collides: it therefore lives in the components that actually
need it (`Sprite`, `RectangleRenderer`, `Tilemap`, colliders). Nor do they come back onto
`Object`.

A uniform `scale` is replaced by `scaleX` / `scaleY`: non-uniform scaling is a common need, and
a single scalar would have had to be widened later anyway.

### Hierarchy: composition, not propagation

**The stored values are always local.** A parent never rewrites a child's values — which is
exactly what Legacy did, pushing a delta into every child on every move, which made a child's
stored position depend on its parent's history, and left `width` and `rotation` inconsistent for
want of being propagated at all.

The **world** transform is **derived**: the engine composes an object's local transform with
those of its parents when it needs to (rendering, physics, picking).

It is therefore never:

- a second source of truth;
- serialized as a property of the `Object`;
- exposed as a position the user has to maintain.

The mutation API stays `object.x`, `object.y`, `object.rotation`, `object.scaleX`,
`object.scaleY` — one coordinate system on the user's side, **never** a `localX` / `worldX` pair
to untangle. Reading the world transform is a **derived and separate** API, intended for the
engine (`worldMatrix(object)`).

---

## Consequences

### Positive

- An object without a `Transform` is legitimate (pure logic, no position).
- The transform hierarchy becomes replaceable (pivot, local/global transform, matrices) without
  touching `Object`.
- The Inspector shows `Transform` like any other component: no more blacklist.
- The `x → _x → __x` chain disappears.

### Negative

- **Two indirections per read of `x`**: façade → component → Proxy trap. In
  `Renderer.render()`, `self.x` is read several times per object per frame. Mitigation:
  rendering and physics read `const t = self.transform` once, then `t.x`, `t.y`. It is a style
  constraint to write down in `CONVENTIONS.md`.
- **All Legacy code assumes `Transform` exists.** `object.x` must throw a clear error ("Object
  has no Transform component") rather than return `undefined`, otherwise the bugs go silent.
- The serialization format changes: `x` goes from an object property to a component property.
  It affects the network protocol — but **not** existing projects: there is no v1 project to
  migrate (Q6 settled).

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keep the transform in `Object`** | The status quo. It keeps the 3-level chain, the propagation asymmetry and the impossibility of an object with no position. |
| **`Transform` as a component, with no façade** | Breaks `object.x`, which is in all the documentation, all user scripts and the spirit of the product. Ruled out by the vision. |
| **A cached façade** (`Object.x` copies `Transform.x`) | Recreates exactly the two sources of truth we are trying to avoid. |
| **An implicit `Transform`, added at construction** | Conceivable, but it cancels the "object without a position" benefit. To reconsider if the ergonomic cost proves too high. |

---

## Required validation

1. An identity test on **every** write path:
   `object.x === object.getComponent('Transform').x` after a write through the façade, through
   the component, through the network, through the Inspector.
2. A before/after rendering benchmark on a scene of ≥ 500 objects.
3. Decide whether `Transform` is added by default at construction (a minor, non-blocking point —
   settleable at implementation time).
