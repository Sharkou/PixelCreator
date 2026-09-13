# ADR-0004 — `update()` / `draw()` are kept

- **Status:** **accepted** (2026-08-12)
- **Decides:** a Component's lifecycle contract
- **Answers:** "should `Component.draw()` be replaced by a RenderSystem?"

---

## Observed context

Legacy has **no base class and no interface**. A component is any class, and the contract is
purely conventional, by duck-typing:

```js
// Object.update()
if (this.components[i].active && this.components[i].update)
    this.components[i].update(this);
```

The hooks actually called:

| Hook | Called by | Context |
|---|---|---|
| `update(self)` | `Object.update()` | every frame, client **and server** |
| `draw(self)` | `Object.draw()` | client only, if `obj.visible` |
| `preview(self)` | `Object.preview()` | client, if `renderer.inspector` |
| `onCollision(self, other)` | `Object.onCollision()` | |
| `onCollisionStart` / `onCollisionExit` | same | |
| `constructorAfterLink(self)` | `Object.addComponent()` | |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | `Renderer.render()` | editor |

**`self` is passed as an argument, never stored.** A component holds no reference to its
`Object`. That is what makes components JSON-serializable without a cycle, and what lets
`copyComponent()` work by plainly copying properties.

### The update/draw split is justified by the code, not by tradition

`ParticleSystem` (`legacy/src/graphics/particle.js`) is the textbook case:

```js
update(self) { /* integrates the position, velocity and lifetime of N particles */ }
draw(self)   { /* draws the N particles, globalCompositeOperation = 'lighter' */ }
```

The server runs the following loop — **and never calls `draw()`**:

```js
for (let obj of Object.values(scene.objects).sort(...)) {
    if (obj.active) obj.update();
}
```

Particle simulation can therefore run on the server and be replicated, while the rendering stays
on the client. No other decomposition gives you that as simply.

The split observed across the existing components:

| | `update` only | `draw` only | both |
|---|---|---|---|
| Components | `Controller`, `Body`, `Rotator`, `Collider`, `Animator`, `Timer` | `RectangleRenderer`, `Tilemap`\* | `Texture`, `CircleRenderer`, `Text`, `Light`, `Map`, `ParticleSystem` |

\* `Tilemap` does declare a `draw`, but with the signature `draw(ctx, camera)` — incompatible
with `Object.draw()`, which calls `draw(this)`. See the decision below.

---

## Decision

**The `update(self)` / `draw(self)` model is kept.** It is not replaced by a Systems
architecture.

**SETTLED:** a Component may implement `update()`, `draw()`, or **both**. `ParticleSystem`,
`Sprite` and `Tilemap` take part in rendering directly, on that basis.

> **Clarified on 2026-08-13 — all four forms are valid**, including **neither of the two**: a
> pure-data component is legitimate, and a component whose behaviour is a `.px` graph often has
> no method at all (ADR-0015, ADR-0016). The runtime and the `SceneRenderer` **check that a hook
> exists before calling it**, and a component without `draw()` costs nothing at render time: an
> object's transform is only established when a component actually draws. `draw()` is never
> required on the server.
>
> **`preview()` is not part of the v2 contract.** Legacy called it for IDE overlays; in v2 those
> belong to `editor/viewport/`, which draws through the same renderer abstraction. Nothing in
> the runtime calls it, and a contract read by the server too has no business carrying an editor
> method.

> **Two of those three cases are not conformant in Legacy** — the v2 decision therefore implies
> fixing them, deliberately abandoning the historical behaviour:
>
> | | Legacy | v2 |
> |---|---|---|
> | `Sprite` | a **subclass of `Object`** that adds `Texture` + `Animator` in its constructor | a **Component** in its own right |
> | `Tilemap` | `draw(ctx, camera)` → a masked `TypeError` if attached | `draw(self, renderer)`, conformant |
> | `ParticleSystem` | already conformant | unchanged |
>
> `Lighting` and `LightSource` are not Components either (`render(ctx, camera)`, `update()`
> without `self`). They become either conformant Components, or a rendering service explicitly
> outside the composition model.

**SETTLED:** an `Object` carries **only one Component of a given type**. The key in
`object.components` stays **the type**, as in Legacy — this confirms the historical behaviour
rather than changing it.

> **Amended by ADR-0021 (2026-08-14).** The key stays `componentType(component)`. What is
> clarified is that this type is an **identity**, not necessarily a readable name: for a shipped
> Component it is its class name, which is code and therefore stable; for a Component a creator
> builds, it is the opaque `ResourceId` of its definition, and its displayed name lives in
> `static label`. The original phrasing, "the type name, as in Legacy", presumed a readable name
> and no longer holds for that second case — renaming would have broken every instance.

> **Completed by ADR-0018 (2026-08-14).** The **order** of `object.components` is now meaningful
> and persistent: it is the `update` order, the `draw` order inside an object, and the
> Inspector's display order. The getter's shape is unchanged; it is the order of its keys that
> stops being an accident.

Three clarifications are added:

### 1. The contract becomes explicit

Documented, tested, but **still duck-typed**: no mandatory base class. A component stays
`class MyComponent { update(self) {} }`. That is what lets a beginner write a component in ten
lines.

### 2. `draw` receives a rendering abstraction

```js
draw(self, renderer)
```

instead of reading the global `Graphics.ctx` singleton. This makes rendering testable, enables
offscreen rendering (the Hierarchy thumbnails, produced today by `Object.createImage()`, which
manipulates an offscreen canvas from inside the Core), and allows a later backend change.

**SETTLED:** the v2 backend is **Canvas 2D**. The abstraction exists so that a WebGL/WebGPU
backend stays possible, without being designed for it — it is limited to the vocabulary actually
used today (`rect`, `circle`, `image`, `text`, `fill`, `stroke`, `light`, transforms). **Do not
over-architect**: no command graph, no batching, no materials until a real need demands them.

This does **not** imply that components become RenderSystems: a component keeps its own
rendering logic where that makes sense.

### 3. `update` receives a context

```js
update(self, ctx)   // ctx: { time, deltaTime, scene, runtime, input }
```

That is what decouples `Controller` from `Keyboard` → `Network` (`ctx.input` instead of the
singleton), and therefore what **repairs offline single-player mode** (see `MIGRATION.md` §4.1).

Both parameters are optional: a component that ignores the second one keeps working.

---

## A "System" is only introduced when it describes something real

The word is not forbidden — it is simply reserved for cases where a module genuinely orchestrates
several objects. A legitimate example: collision detection.

**OBSERVED:** `Collider.testCollisions(self)` loops over `Scene.main.objects` **from inside a
component**, which gives O(n²) and couples the component to the global scene (and is broken
besides: `Scene` is not imported in `collider.js`). `SpatialHash` already exists in
`src/physics/` but is wired to nothing.

A `CollisionSystem` that sweeps a spatial grid and then calls `obj.onCollision(other)` would be a
real system. It is not a box in an org chart: it is an algorithm with nowhere else to live.

**No `RenderSystem`, `PhysicsSystem`, `AnimationSystem` or `ScriptSystem` is created on
principle.**

---

## Consequences

### Positive

- Total continuity for existing user components.
- The server stays render-free, with no effort.
- The "one component = one behaviour" mental model is preserved — it is the central concept for a
  beginner audience.

### Negative

- Duck-typing does not catch typos (`updat()` will never be called, silently). Mitigation: a
  development mode that reports unrecognized methods on a component.
- The logic stays in the components, so global optimizations (render batching, culling) have to
  be done by the renderer without the components' cooperation.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Systems (Physics/Render/Animation/Script)** | No basis in the code. It would take the logic out of the components, breaking the beginner mental model and serializability. Explicitly ruled out by the vision. |
| **ECS (components = pure data)** | It would forbid `Component.draw()` and `update()`. Pixel Creator aims at readability, not throughput over 100,000 entities. |
| **`this.object` instead of `self` as an argument** | It introduces a cycle: it breaks `JSON.stringify`, `copyComponent()` and replication. |
| **A mandatory `Component` base class** | It adds ceremony for zero benefit; it breaks existing user components. |
