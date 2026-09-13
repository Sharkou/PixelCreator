# Components

> See ADR-0004 (lifecycle) and ADR-0007 (schema).

## OBSERVED — the real contract

No base class, no interface. A component is any class; the contract is **duck-typing**:

```js
export class Rotator {
    constructor(speed = 2) { this.rotation = 0; this.speed = speed; }
    update(self) {
        this.rotation = (this.rotation + this.speed * Time.deltaTime) % 360;
        self.rotate(this.rotation);
    }
}
```

**`self` is passed as an argument, never stored.** That is what makes components serializable
without a cycle, and what lets `copyComponent()` work by plain copying.

`component.name` is overwritten by `addComponent()` with `component.constructor.name`, and
serves as the key in `object.components{}`. Consequences: **one component per type**, and
**minification would break everything**.

### Hooks called

| Hook | Called by | Context |
|---|---|---|
| `update(self)` | `Object.update()` | every frame, client **and server** |
| `draw(self)` | `Object.draw()` | client, if `obj.visible` |
| `preview(self)` | `Object.preview()` | client, if `renderer.inspector` |
| `onCollision(self, other)` | `Object.onCollision()` | |
| `onCollisionStart` / `onCollisionExit` | same | |
| `constructorAfterLink(self)` | `Object.addComponent()` | the only "after attachment" hook |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | `Renderer.render()` | editor |

`active` is set to `true` by `addComponent()` and tested before every hook.

---

## Inventory

A systematic survey of the hooks actually declared.

| Component | `update` | `draw` | `preview` | Server | Notes |
|---|:--:|:--:|:--:|:--:|---|
| `Camera` | | | ✅ | data | `Camera.main` holds an **Object**, not a `Camera` |
| `Texture` | ✅ | ✅ | | no | looks up `Loader.files` **every frame** |
| `RectangleRenderer` | | ✅ | | no | |
| `CircleRenderer` | ✅ | ✅ | | no | |
| `Text` | ✅ | ✅ | | no | |
| `Light` | ✅ | ✅ | | partial | `update` **overwrites `self.width`/`self.height`** every frame |
| `Map` | ✅ | ✅ | | no | |
| `ParticleSystem` | ✅ | ✅ | | **yes for `update`** | the textbook case for the update/draw split |
| `Collider` | ✅ | | ✅ | yes | references `Scene.main` **without importing it** → a masked error |
| `RectCollider` / `CircleCollider` | ✅ | | ✅ | yes | also carry `detectMouse`/`detectSide` |
| `Controller` | ✅ | | | yes | reads `Keyboard.keys(self.uid)` → **depends on Network** |
| `Body` | ✅ | | | yes | writes `self.x`/`self.y` |
| `Rotator` | ✅ | | | yes | |
| `Animator` | ✅ | | | debatable | delegates to `Animation` |
| `Animation` | ✅ | | | debatable | called by `Animator`, not by `Object` |
| `Timer` | ✅ | | | yes | |
| `Sound` / `Audio` | | | | no | static services, not components |
| `SpatialHash` | | | | yes | exported in `mod.js`, **instantiated nowhere** |

### Three "components" do not honour the contract

Exported by `mod.js` just like the others, but with signatures incompatible with
`Object.update()` / `Object.draw()`:

| Class | Real signature | What happens if you attach it to an `Object` |
|---|---|---|
| `Tilemap` | `draw(ctx, camera)` | `Object.draw()` calls `draw(this)` → `ctx` receives the **Object**, `camera` is `undefined` → an immediate `TypeError`, **swallowed by the `try/catch`** |
| `Lighting` | `render(ctx, camera)`, `init`, `addLight` | never called — it is not a component but a rendering service |
| `LightSource` | `update()` **without `self`** | works by accident (it does not use `self`), but breaks the contract |

This is the direct consequence of having no explicit contract: nothing signals that a class is
not attachable. Duck-typing accepts anything, and the `try/catch` hides the failure.

### Only 7 components are reachable from the UI

`Manager` exposes only `Camera`, `Texture`, `CircleRenderer`, `RectangleRenderer`, `Collider`,
`Controller`, `Rotator`. `Light`, `Map`, `Animation` and `Animator` are **commented out**;
`Text`, `ParticleSystem`, `Body`, `Tilemap`, `Timer`, `Sound` are not listed at all — although
most of them are exported and working.

### Why the update/draw split is justified

`ParticleSystem` simulates N particles in `update()` and draws them in `draw()`. The server
runs:

```js
for (let obj of Object.values(scene.objects).sort(...))
    if (obj.active) obj.update();      // never draw()
```

The simulation runs server-side and replicates; rendering stays on the client. **No other
decomposition gives you that as simply.** That is an observation, not a preference.

### Couplings to fix

| Problem | File |
|---|---|
| `Collider.update()` references `Scene.main` without importing it → a masked `ReferenceError` | `physics/collider.js:44` |
| `Controller` → `Keyboard` → `Network`: **breaks offline single-player** | `physics/controller.js` |
| `Texture.update()`: a dictionary lookup per frame and per object | `graphics/texture.js` |
| `Light.update()` overwrites `self.width`/`self.height`, cancelling the Inspector | `graphics/light.js` |
| `#private` fields invisible to the Property System (`Texture`, `Collider`) | ADR-0003 |
| `plugins/test.js` calls `Manager.addComponent()` statically (it is an instance method) and couples a component to the IDE | `plugins/test.js` |

---

## V2 PROPOSAL

### Contract

```js
update(self, ctx)        // ctx: { time, deltaTime, scene, runtime, input }
draw(self, renderer)
bounds(self)             // optional geometry — see below
onCollision(self, other) / onCollisionStart / onCollisionExit
onAttach(self) / onDetach(self)   // replaces constructorAfterLink
```

Both parameters are optional: a component that ignores the second one keeps working. **Still
duck-typing, no mandatory base class** — writing a component must stay a ten-line affair.

**All four forms are valid**, and the runtime checks that a hook exists before calling it:

| Form | Simulation | Rendering |
|---|---|---|
| no method | — | no cost |
| `update()` only | client **and server** | no cost |
| `draw()` only | — | client only |
| `update()` + `draw()` | client **and server** | client only |

A component without `draw()` costs **nothing** at render time: the `SceneRenderer` only
establishes an object's transform when a component actually draws. `draw()` is never required
on the server, which builds no renderer.

> **`preview()` is not part of the v2 contract.** Legacy called it from `Renderer.render()` for
> IDE overlays; in v2 those overlays belong to `editor/viewport/`, which draws through the same
> renderer abstraction and will define its own hook if it needs one. A runtime contract, read by
> the server too, has no business carrying an editor method that nothing calls.

`ctx.input` replaces the `Keyboard` singleton: that is what decouples input from the network
and **repairs single-player mode**. It is indexed by owner (ADR-0014):

```js
update(self, ctx) {
    const input = ctx.input.of(self.owner);
    if (input.isDown('ArrowRight')) self.x += this.speed * ctx.deltaTime;
}
```

### A Component may have a `.px` graph (ADR-0015)

A concrete Component type — `Controller`, `Health`, `Weapon` — may have its behaviour defined
by a graph carrying its name:

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

`Controller.px` is the Component's **interpreted behaviour**, not a component: **there is no
`Script` Component**, and a `.px` generates no component type.

The graph is bound to the **type** (`behaviors.bind(Controller, graph)`), so nothing from the
graph enters a component's serialized data: a `Controller` serializes `speed`, and that is all.
Each instance receives its own behaviour, so two `Controller`s never share their variables or
their timers.

The graph receives the component exactly as the Object holds it — the reactive `Proxy` — so a
write from a graph is an ordinary write: same `Change`, same replication, same Inspector as a
write from hand-written code.

For an active component, the runtime runs its `update` **and then** the graph bound to its
type. Drawing remains the business of the Component type, which declares `draw` (ADR-0015 §9).

The graph's temporal entry point is the **`On Update`** node: what it triggers takes part in
the **same simulation** as `update()`, therefore at the same fixed step, in the same
deterministic order, and runs **on the server as well as on the client**.

### A Component created by a user (ADR-0016)

A Component is **properties + behaviour**. A component shipped with the engine writes that in
JavaScript; a component a creator builds in the editor describes it as a **definition**, in
JSON:

```json
{
  "type": "res_c3",
  "label": "Controller",
  "properties": { "speed": { "id": "p7", "type": "number", "default": 120 } },
  "graph": { "version": 1, "nodes": [], "connections": [] }
}
```

```js
const Controller = components.register(defineComponent(definition));
behaviors.bind(Controller, definition.graph);   // the RESOLVED graph, never an identifier
```

**`type` is the definition's `ResourceId`, `label` is the displayed name** (ADR-0021): a rename
rewrites one field of one resource and touches no instance, no scene and no saved project.

**Each property carries an `id`, and that is what a graph node stores** (ADR-0027). The schema
stays keyed by name — that is what `defineComponent()` reads and what the Inspector displays —
but renaming `speed` to `walkSpeed` leaves the graph wired, because what is referenced is the
identity. The Core ignores that field: it validates only `type`.

A deleted property **never** leaves a dangling reference: `validateGraph()` returns
`MISSING_PROPERTY`, the Graph window rings the node, and the interpreter throws a `GraphError`
that the runtime reports (ADR-0012). The graph is not rewritten — one gesture must not change
two things the creator can see, and undo would then have to guess which one to restore.

`defineComponent()` turns it into an **ordinary component class**: registry, `addComponent()`,
Inspector, serialization — nothing downstream distinguishes a component born from data from one
written by hand. Every schema key exists on a fresh instance with its default, so the
Inspector, serialization and the graph agree on what a `Controller` is.

The definition belongs to the **type**: a thousand `Controller`s in a scene means a thousand
`speed`s and **one** graph.

### `active` — who reads it, who writes it (ADR-0012)

`active` is an **ordinary reactive property**. No special mechanism is attached to it. Only the
direction of use is normative:

| | |
|---|---|
| **Read** | by the Runtime and the SceneRenderer, to decide whether to run `update()` / `draw()`. An absent property = active |
| **Written** | by user code, a Component or the Editor, through the normal Property System |
| **Never written** | by the Runtime — including in reaction to an exception |

Writing `active` is a `Change` like any other, and therefore replicable. A Runtime that
disabled a faulty component would make simulation state depend on a script having thrown on
some particular machine, at some particular frame. See ADR-0012.

### `bounds(self)` — an optional geometric capability, **not** a picking API

A component that genuinely has an extent may declare it, in the object's **local space**, as
`{ x, y, width, height }`. That is the case for `RectangleRenderer`, `Sprite` and `Tilemap`. It
is not the case for `ParticleSystem`, nor for a purely logical component, and **they must not
be forced into it**: `bounds()` is not generalized to all Components.

**This is not the selection system.** The Editor's picking must also reach objects that carry
no game geometry, which only an editorial representation can determine. Three geometries stay
distinct:

- **gameplay** geometry (collision);
- **rendering** geometry;
- **Editor picking** geometry.

No runtime code calls `bounds()` today, and **nothing must be built on it** until the Editor's
selection model is designed. Picking belongs to the Editor (`architecture/EDITOR.md`), not to
the Core.

`ctx.input` replaces the `Keyboard` singleton: that is what decouples input from the network
and **repairs single-player mode**.

`renderer` replaces the `Graphics.ctx` singleton: it makes rendering testable and enables
offscreen rendering (the Hierarchy thumbnails, produced today by `Object.createImage()` from
inside the Core).

### Optional schema

```js
export class Controller {
    static schema = {
        speed:  { type: 'number', default: 2, min: 0, max: 20 },
        layout: { type: 'enum', values: ['wasd', 'zqsd', 'arrows'], default: 'zqsd' }
    };
    static icon = 'fas fa-gamepad';
    static category = 'physics';
}
```

Without a `schema`, the Inspector falls back on the current reflective inference (ADR-0007).
`icon` and `category` replace the hard-coded `switch` in `properties.js` and the hard-coded
list in `Manager`.

### Registry

An explicit registry replaces resolution by name lookup in `mod.js`:

```js
components.register(Controller);       // engine components
components.register(await import(url)); // project components, loaded dynamically
```

This keeps Legacy's **hot reload** (`import()` → the `import` event → re-injection into every
object that carries the component), which works well, while removing the coupling of plugins to
`editor/system/manager.js`.

**SETTLED (Q4):** an `Object` carries **only one Component of a given type**. The key in
`components` stays the type name. The Legacy behaviour is confirmed, not changed.

### Non-conformant components to fix — SETTLED

The decision "a Component may do `update()`, `draw()` or both, and take part in rendering
directly" names `ParticleSystem`, `Sprite` and `Tilemap` explicitly. Two of those three are not
conformant today:

| | Legacy | v2 |
|---|---|---|
| `ParticleSystem` | conformant | unchanged |
| `Sprite` | a **subclass of `Object`**, not a Component | becomes a **Component** |
| `Tilemap` | `draw(ctx, camera)` → a masked `TypeError` | `draw(self, renderer)` |
| `Lighting` / `LightSource` | outside the contract | conformant Components, or a rendering service explicitly outside the model |

This is a deliberate abandonment of incorrect Legacy behaviour, permitted by the "no v1 project
migration" decision.
