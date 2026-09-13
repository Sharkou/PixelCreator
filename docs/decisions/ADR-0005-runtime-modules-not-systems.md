# ADR-0005 — The Runtime is organized by domain modules, not by "Systems"

- **Status:** **accepted** (2026-08-12)
- **Answers:** the `Runtime/Systems/{Physics,Animation,Render,Script}System` hypothesis

## Observed context

An earlier proposal suggested:

```
runtime/systems/
├── PhysicsSystem
├── AnimationSystem
├── RenderSystem
└── ScriptSystem
```

Checked against the code: **Legacy never had a System.**

- Physics lives in `Collider.update()` and `Body.update()`.
- Animation lives in `Animator.update()`, which delegates to `Animation.update()`.
- Rendering lives in `Renderer.render()` **plus** each component's `draw()`.
- Scripting is a component loaded by dynamic `import()`.

The historical organization is **by domain**:

```
src/physics/  src/graphics/  src/anim/  src/input/  src/audio/  src/time/  src/math/
```

It reads well: you are looking for a collision, you open `physics/collider.js`.

A note: `src/runtime/` exists but contains only `environment.js` (platform detection, 411 lines)
— unrelated to the game loop. The directory is a false friend.

## Decision

**SETTLED: keep the organization by domain module**, directly under `runtime/`, with no
intermediate layer.

```
runtime/
├── clock/         time, delta-time, timers
├── physics/       collisions, bodies, spatial hash
├── animation/     animator, animation, tween
├── rendering/     Canvas 2D backend + abstraction
├── input/         input state per owner
├── scripting/     Component behaviours defined by a .px graph
└── loop.js        phase orchestration
```

The word "System" is not forbidden. It is **reserved for modules that genuinely orchestrate
several objects** — and only when the algorithm has nowhere else to live.

### The only candidate identified

`Collider.testCollisions(self)` loops over `Scene.main.objects` from inside a component: O(n²),
a coupling of the component to the global scene, and a `Scene` reference that is never imported
(a bug masked by the `try/catch` in `Object.update()`). `SpatialHash` exists in `src/physics/`
and is wired to nothing.

A `CollisionSystem` that sweeps a spatial grid and then calls `obj.onCollision(other)` would be a
real system: it solves an algorithmic problem the component cannot solve on its own. **It is the
only case where the term is justified to date.**

## Rationale

- No observation supports the Systems architecture.
- Taking the logic out of the components would break `Component.update()`/`draw()` (ADR-0004),
  serializability, and the beginner mental model.
- A Systems architecture imposes a global execution order and typed queries — complexity with no
  benefit at this scale.

## Consequence

The word "System" also disappears from `core/system.js`, which is today a catch-all (ids,
randomness, reactivity, files, `<input>` validation, events, logs) and not a system. Its contents
are redistributed — see `architecture/CORE.md`.
