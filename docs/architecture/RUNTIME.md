# Runtime

> Organized by **domain modules**, not by "Systems" (ADR-0005).

## OBSERVED

### There is no identifiable runtime

`src/runtime/` contains only `environment.js` — 411 lines of platform detection (WebGL, WebGPU,
IndexedDB, mobile…), unrelated to the game loop. The directory is a false friend.

The real runtime is:

- `Renderer.render(scene, camera)` — the one loop;
- the domain modules: `physics/`, `graphics/`, `anim/`, `input/`, `audio/`, `time/`.

**No "System" exists.** Physics is in `Collider.update()`, animation in `Animator.update()`.
The logic lives in the components.

### The client loop

`app.js`:

```js
Stats.begin();
Dnd.update();
Time.deltaTime = (Time.now() - Time.last) / (1000 / 60);
Performance.update();
requestAnimationFrame(loop);
renderer.render(scene, camera);
Ruler.active  ? Ruler.update(...) : false;
Grid.active   ? Grid.draw(...)    : false;
Stats.end();
```

`Renderer.render()` does, **in a single pass per object**:

1. sort by `layer` — `Object.values(...).sort()`, **reallocated every frame**;
2. `obj.update()` if not paused;
3. **mouse picking and resize-handle detection — Editor code**;
4. `ctx.save()`, camera projection, zoom, rotation;
5. `obj.draw()`, then `obj.preview()` if `inspector`;
6. `ctx.restore()`;
7. `obj.select(ctx)` if selected.

### Two structural problems

**a) Update and draw are interleaved per object.** Object 2 is updated *after* object 1 has
been drawn. A component that reads another object's position reads a mixed state, dependent on
the `layer` sort order. For a multiplayer engine, that is a source of non-determinism.

The server, for its part, separates them cleanly: it loops over every `update()` without
drawing.

**b) The Core imports the Editor.**

```js
// src/core/renderer.js:6
import { Dnd } from '/editor/system/dnd.js';
```

The game runtime cannot be loaded without the IDE's drag-and-drop module. It is the most
visible layer violation in the repository.

### The Camera ambiguity

`Camera` is a **component class** (`background`, `max_x`, `offset`, `preview()`), but
`Camera.main` holds an **`Object`** that carries that component. The renderer writes
`camera.getComponent('Camera').background` while also reading `camera.x`, `camera.scale`. The
same identifier designates two things depending on the context.

→ Settled by **ADR-0013**, see "Camera and Viewport" below.

### The runtime is broken offline

See `MIGRATION.md` §4.1. `Controller` → `Keyboard` → `Network.users` (undefined) → a
`TypeError` every frame, swallowed by the `try/catch` in `Object.update()`. **Single-player
mode does not work and nothing says so.**

---

## V2 DECISIONS

**SETTLED:** domains sit directly under `runtime/`, with no `Systems/` layer.

```
runtime/
├── clock/           time, delta-time, timers
├── physics/         collisions, bodies, spatial hash
├── animation/       animator, animation, tween
├── rendering/       Canvas 2D, projection, rendering abstraction
├── input/           input state per owner, with no network dependency
├── scripting/       Component behaviours defined by a .px graph
├── loop.js          phase orchestration
└── mod.js           the client entry point (the server does not import it)
```

`audio/` and `camera/` are added as needed; the list is not frozen, the principle is: **one
directory = one domain, no abstraction layer above it.**

### Rendering — SETTLED

v2 backend: **Canvas 2D**. A thin abstraction sits in front so that a WebGL or WebGPU backend
stays possible later, without being designed for it today.

Concretely: `draw(self, renderer)` receives a `renderer` object instead of reading the
`Graphics.ctx` singleton. The vocabulary is limited to what components already use (`rect`,
`circle`, `image`, `text`, `fill`, `stroke`, `light`, transforms).

**Do not over-architect**: no command graph, no batching, no materials, no passes until a real
need demands them.

### Separate phases

```
frame:
  input.poll()
  for each object: object.update(ctx)     ← all the simulation
  collisions.resolve()
  renderer.render(scene, camera)          ← then all the rendering
  editor.overlay()                        ← then the IDE overlays
```

This is what the server already does. The client falls into line.

### Render order — sorting every frame, deliberately

The `SceneRenderer` sorts objects by `layer` **every frame**. This is not an oversight: `layer`
can change at any moment, and sorting a few hundred objects is negligible next to the cost of
drawing them.

A cache invalidated on every `layer` write would be a speculative optimization and one more
piece of state to keep correct. **No optimization without a measurement to justify it**; it
will be introduced the day a profile asks for it, and not before.

> This paragraph replaces an earlier prescription of a cached sort, written before a renderer
> existed. The implemented behaviour is the normative behaviour.

**Careful (risk R7)**: separating update and draw changes the observation order. A Legacy game
may unintentionally depend on the interleaving. To be checked against a reference scene.

### Input — SETTLED (ADR-0014)

`runtime/input/`, never `core/`. The state is **abstract** — keys, buttons, pointer, named axes
— and knows neither `KeyboardEvent`, nor `window`, nor `document`.

```js
const input = ctx.input.of(self.owner);   // indexed by owner; the "local" owner always exists
if (input.isDown('ArrowRight')) self.x += this.speed * ctx.deltaTime;
```

It is **passed into the simulation step**, never fetched from a global:

```js
runtime.step(input);
runtime.advance(elapsed, input);
```

The same initial scene and the same inputs ⇒ the same result. That is what lets a server replay
what the players sent. A runtime with no input runs on empty input — **that is what repairs
offline single-player.**

`pressed()` / `released()` are true for exactly one step: the runtime calls `input.commit()`
after each step, so one press counts once no matter how many steps a frame owes.

**The browser adapter does not belong here.** It lives in the layer that owns the DOM; the
runtime only defines its contract.

### A Component's behaviour — SETTLED (ADR-0015)

A concrete Component may have a `.px` graph that defines its behaviour:

```
Object
├── Transform
├── Sprite
├── Controller
│   └── Controller.px
└── Collider
```

`Controller.px` is not a component and does not become one. **There is no `Script` Component**,
and no component type is generated by a `.px`.

```
graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
        once per graph        once per instance         every step
```

The `Behaviors` host binds a **Component type** to a graph (`behaviors.bind(Controller,
graph)`). The graph interpreter is passed to it: no language, no graph model and no VM is built
at that stage (ADR-0009).

The graph is read once; **each component instance receives its own behavior**, so two
`Controller`s never share an execution state. The behavior lives in a `WeakMap` keyed by the
component: what serializes is the component's properties, never functions.

**There is no `ScriptSystem`.** The runtime runs, per active component and in scene order, its
`update` and then the graph bound to its type — one component, one place in the order, one
`try`/`catch`. The graph thereby inherits error isolation, the fixed step, the deterministic
order and headless execution, with no second client/server path.

```js
new Runtime(scene, { behaviors });
```

### The graph interpreter — IMPLEMENTED (ADR-0027)

`runtime/scripting/interpreter.js` fills the seam ADR-0015 had left empty, without changing it:

```js
const behaviors = new Behaviors(createGraphInterpreter());
behaviors.bind(Controller, graph);   // the RESOLVED graph, never a ResourceId
```

It receives a `.px`'s **payload** — not the Editor's live model — and reads it once per graph;
the factory then gives each instance its own execution state.

| What it holds | Why here and not in a node |
|---|---|
| **Flow pushed, data pulled** | the order belongs to no node taken on its own |
| **Depth-first, in declared order** | `Sequence` means "the whole first branch, then the second"; determinism *is* that order |
| **A value cache reset at every flow step** | memoizing across the whole event would let a `Get Property` serve the old value after a `Set Property` |
| **A budget per event** (4096 nodes) | a flow that loops is a loop; what is forbidden is a frame that never ends |
| **A ceiling on suspended executions** (256 per instance) | the budget bounds ONE `walk`; nothing bounded how many a step started, so `On Update ▸ Every` piled one up per step, endlessly (ADR-0072) |
| **Structured `GraphError`s, thrown** | the runtime isolates and reports them without touching the model (ADR-0012) |

**No `eval`, no `new Function`, no code generation** — ADR-0009 Q7. Nothing in it reads a
clock, a source of randomness, the DOM or storage: time comes from the step context, values
come from the Component. The same graph therefore reaches the same state on a client and on a
server, which is what ADR-0011 requires.

**A graph writes with a plain write**, never through `setProperty()`: what runs inside
`update()` is a simulation output, not an intent (ADR-0003). The write stays observable,
because the component is the reactive Proxy the Object holds.

### Execution errors — SETTLED (ADR-0012)

The Runtime **isolates** an exception thrown by a Component and **reports** it. It never
modifies the model's state in reaction to an error.

```js
new Runtime(scene, { onError: report => { /* policy */ } });
```

The report is structured — `{ error, object, component, type, phase, time }` — and the original
`Error` is never modified. The consumer reads fields; it does not parse a message.

| | |
|---|---|
| Isolation | Runtime — a `try/catch` around `update()` and `draw()` |
| Reporting | Runtime — `onError(report)`, a single channel |
| Policy (display, count, pause, disable) | a higher layer — Editor, server, host |
| Simulation state | the model alone — never written by the Runtime |

**No auto-disabling.** A Component that fails is not disabled after N errors: that would turn
an exception into a replicated state mutation, and make two machines diverge depending on
whether a script threw. `component.active` stays an ordinary reactive property, **read** by the
Runtime and the SceneRenderer, **written** by the user, a Component or the Editor.

Without an `onError`, the error is rethrown asynchronously with the original as its `cause`:
Legacy's silence is never reproduced.

### Camera and Viewport — SETTLED (ADR-0013)

The Legacy ambiguity is settled:

| | v2 |
|---|---|
| **Camera** | an ordinary `Object`, with a `Transform`. `camera.x` **is** its position |
| **The `Camera` component** | the lens alone: `zoom` |
| **`Viewport`** | the screen: `width`, `height`. Not in the scene, no transform |
| **View matrix** | **derived**, never stored |

```
view = centre(viewport) · zoom · inverse(worldMatrix(camera))
```

```js
const view = viewMatrix(camera, viewport);
runtime.render({ view, clear: '#101018' });
```

The renderer receives a `Matrix` and **does not know what a camera is** — that is what
permanently rules out a `Core → renderer` dependency.

No second position: no `offset`. Parenting the camera to the player makes it follow the player,
because that is already what parenting means.

`worldToScreen()` / `screenToWorld()` complete the API. `screenToWorld()` is the first link of
the Editor's future picking — **the runtime provides the mapping, not the selection policy.**

### What leaves the renderer

`Dnd`, mouse picking, handle detection, the selection rectangle and `preview()` move to
`editor/viewport/`. **That is what removes the `/editor/...` import from the Core.**

The renderer exposes an abstraction passed to the components (`draw(self, renderer)`, ADR-0004)
instead of the `Graphics.ctx` singleton.

### Expected fixes

| Problem | Fix |
|---|---|
| Update/draw interleaved | separate phases |
| Errors swallowed by the `try/catch` | isolated **and** reported (`onError`, ADR-0012) |
| `Input → Network`, single-player broken | abstract input passed to `step()`, a "local" owner always present (ADR-0014) |
| The `Camera` ambiguity | `Camera` = the lens; the carrying `Object` = the position; `Viewport` = the screen (ADR-0013) |
| `Core → Editor` | picking and overlays moved out |
| `Collider` O(n²) | a `CollisionSystem` over a spatial grid — **the only justified "System"** (ADR-0005); `SpatialHash` already exists and is wired to nothing |
| `environment.js` misfiled | into `core/` or `platform/` — it is not runtime |

### Client vs server

The difference is not in the model but in the **modules loaded**:

| | Client | Server |
|---|---|---|
| `core/` | ✅ | ✅ |
| `runtime/physics`, `input`, `animation`, `clock` | ✅ | ✅ |
| `runtime/rendering`, `audio` | ✅ | ❌ |
| `component.update()` | ✅ | ✅ |
| `component.draw()` | ✅ | ❌ |
| `editor/` | optional | ❌ |

`ParticleSystem` illustrates the cut: `update()` on both sides, `draw()` on the client only.
