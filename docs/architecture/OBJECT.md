# Object

> `Object` — never `Entity` (ADR-0001).

## OBSERVED — the current state

```js
class Object {
    id, uid, name, layer, tag, type, active, visible, lock, static, image,
    components{}, childs{}, x, y, width, height, rotation, scale
}
```

680 lines. It mixes three responsibilities: the data model, the transform hierarchy, and
editor tooling.

### Fields worth knowing

| Field | Reality |
|---|---|
| `id` | the object's identity — `Math.random().toString(36).substr(2,9)` |
| `uid` | **the owning player's identifier**, not the object's. A trap of a name. |
| `type` | a free-form string (`'object'`, `'image'`, `'camera'`, `'prefab'`…) driving the icon |
| `image` | the `HTMLImageElement` thumbnail for the Hierarchy — **DOM inside the Core** |
| `childs` | incorrect English, but present in the network protocol and in saved files |
| `static` | declared, never read |
| `lock` | prevents selection in the editor |

### Editor methods carried by the Core

`detectMouse(x, y)`, `detectSide(x, y)`, `select(ctx)`, `createImage(ctx)`, `preview()`.

`createImage()` calls `document.createElement()`: **`Object` cannot be loaded cleanly on the
server.** It works today only because the server never calls those methods.

### `copy()` — the most fragile point

```js
copy(obj) {
    for (let prop in obj) {
        if (typeof obj[prop] !== 'object') this[prop] = obj[prop];
        else { /* TODO: Gérer les objets */ }        // ← children are not copied
    }
    for (let name in obj.components) {
        this.addComponent(new components[name], false);   // ← lookup by name in mod.js
        for (let prop in component) this.components[name][prop] = component[prop];
    }
}
```

- Object-valued properties are not copied → `Scene.init()` has to rebuild the parent/child
  links in a second pass.
- `new components[name]`: a component missing from `mod.js` makes deserialization fail,
  silently.
- `for (let prop in obj)` sees `_x`, `$x`… so the copy reassigns the duplicates;
  `this['_x'] = …` reaches the prototype accessor `set _x` and **triggers propagation to the
  children during a network copy**.
- `copy()` is called **per object and per heartbeat**: a full re-copy, never a patch.

### `update()` / `draw()`

```js
try { this.components[i].update(this); }
catch (err) { console.error(err); }
```

The per-component, per-frame `try/catch` isolates broken user scripts — **a legitimate intent,
worth keeping**. But it also hides systematic failures: it is what conceals that offline
single-player does not work (`MIGRATION.md` §4.1) and that `Collider.update()` references a
`Scene` it never imported.

---

## V2 PROPOSAL

`Object` becomes a container again.

```js
class Object {
    id             // the object's identity
    owner          // formerly `uid`: the owning player
    name, tag, layer
    active, visible, lock
    components     // Map<string, Component>  — one per type
    parent, children

    addComponent / removeComponent / getComponent / hasComponent
    addChild / removeChild
    update(ctx) / draw(renderer)
}
```

**Renames adopted.** They were blocked only by data compatibility; the decision "no v1 projects
to migrate" removes that block.

| Legacy | v2 | Reason |
|---|---|---|
| `childs` | `children` | correct English |
| `uid` | `owner` | designates the owning player, not the object |
| `static` | *removed* | declared, never read |

### What leaves

| Leaves `Object` | For | Reason |
|---|---|---|
| `x`, `y`, `rotation`, `scaleX`, `scaleY` | the `Transform` component | ADR-0002 |
| `width`, `height` | rendering / collision components | a size is not a transform |
| `_x` / `__x` and delta propagation to children | removed | replaced by matrix composition, with local values preserved |
| `detectMouse`, `detectSide`, `select` | `editor/viewport/` | IDE tooling |
| `createImage` | `editor/` (offscreen rendering) | removes the DOM from the Core |
| `preview` | `editor/viewport/` | an IDE overlay; removed from the Component contract (ADR-0004) |
| `image` | `editor/` (thumbnail cache) | it is not game data |
| `type` | `editor/` (display) or removed | duplicated by the presence of components |
| `static` | removed | never read |

### What stays and does not move

- The name `Object`.
- Identity by a short, opaque id.
- `components` keyed by class name, and the parent/child hierarchy.
- `update()` / `draw()`, iterating over the components and passing `self` as an argument
  (ADR-0004).
- The per-component `try/catch` — but with a counter: a component that fails N times in a row
  is disabled and reported, instead of failing silently forever.

### The Transform façade

```js
object.x = 100;                           // these three lines are
object.getComponent('Transform').x = 100; // strictly the same
object.components.Transform.x = 100;      // write path
```

No value is stored on `Object`. There is no `Object._x` (ADR-0002).

### `copy()` and instantiation

Replaced by explicit `serialize()` / `deserialize()`:

- components are resolved through an explicit **registry**, not by name lookup in `mod.js`;
- children are referenced by id, and the links are restored in one deterministic pass;
- no `_`/`$` duplicates to filter out, since there are none left.

---

## Decisions settled (2026-08-12)

| # | Question | Decision |
|---|---|---|
| Q1 | `childs` → `children`? | **Yes** |
| Q2 | `uid` → `owner`? | **Yes** |
| Q4 | Two components of the same type on one object? | **No** — one per type, as in Legacy |
| Q6 | Compatibility with Legacy projects? | **None** — no v1 projects to migrate |

One minor point remains, decidable at implementation time: is `Transform` added by default when
an `Object` is constructed?
