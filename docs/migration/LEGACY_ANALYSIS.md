# Legacy analysis

> **Status: OBSERVED.** This document describes what the code actually does, verified by
> reading the source and, for the points marked ✅, by running it in the browser (a static
> server on `legacy/`, plus the console).
>
> It contains no proposals. The proposals live in `../architecture/*.md` and
> `../decisions/ADR-*.md`.

---

## 1. Inventory

~13,000 lines of JavaScript, with no runtime dependency, no build and no tests.

| Area | Files | Lines (order of) | Role |
|---|---|---|---|
| `src/core/` | object, scene, system, renderer, camera, loader, resource, player, mod | ~2,400 | The model + the render loop |
| `src/graphics/` | graphics, texture, sprite, circle, rectangle, text, light, lighting, map, particle, color | ~1,100 | Canvas 2D rendering |
| `src/physics/` | collider, controller, body, tilemap, rotator, spatialhash | ~1,100 | Collisions and movement |
| `src/network/` | network, socket, room, client, spawner | ~800 | WebSocket + replication |
| `src/math/`, `time/`, `input/`, `audio/`, `anim/`, `storage/`, `ui/`, `runtime/` | — | ~2,000 | Utilities and services |
| `editor/` | windows, system, graph, misc, scripting, lib | ~4,500 | The IDE |
| `css/` | 30 stylesheets | — | UI |
| `index.html` | 1 file | 700 | The IDE's entire structure |

Empty files (intentions never realized): `math/noise.js`, `math/fractal.js`,
`math/raytracer.js`, `editor/windows/timeline.js`, `css/picker.css`.

`editor/windows/window.js` contains only `// TODO: Implement base window class`. That is the
exact admission of the Editor's modularity problem.

---

## 2. The Property System

It is the heart of the project. Everything else follows from it.

### 2.1 Mechanism

`System.sync(object, component?)` (`src/core/system.js:31`) walks the object's enumerable
properties **at the moment it is called** and replaces each of them with a pair of accessors:

```js
Object.defineProperty(obj, prop, {
    get() { return this['_' + prop]; },
    set(value) {
        this['_' + prop] = value;
        System.dispatchEvent('setProperty', { object, component, prop, value });
    },
    configurable: true, enumerable: true
});

Object.defineProperty(obj, '$' + prop, {   // write-only
    set(value) {
        this[prop] = value;                 // triggers setProperty
        System.dispatchEvent('syncProperty', { object, component, prop, value });
    },
    configurable: true, enumerable: true
});
```

The result is **three distinct write channels**, all verified ✅:

| Write | `setProperty` | `syncProperty` | Actual use |
|---|---|---|---|
| `obj.x = 100` | ✅ emitted | ✗ | Runtime, simulation, local camera |
| `obj.$x = 100` | ✅ emitted | ✅ emitted | Editor: viewport drag, Inspector typing |
| `obj.setProperty('x', 100)` | ✅ emitted (manually) | ✗ | Network receipt (no echo) |

This is an **intentional and load-bearing** distinction, not an accident: it stops the
simulation from flooding the network while keeping the views synchronized.

`obj.syncProperty('x', v)` produces the same effect as `obj.$x = v`: both write through
`this[prop]` and then emit `syncProperty`.

> **⚠ This describes Legacy, not the v2 target.** In v2, `$x` and `syncProperty()` are
> **removed**; their role is taken over by `setProperty()`, whose Legacy meaning (a direct,
> non-replicated write) disappears. See ADR-0003.

### 2.2 A three-level chain for x/y

`Object` defines on its prototype (`src/core/object.js:56-96`):

```
obj.x            (an instance accessor installed by System.sync)
  → obj._x       (a prototype accessor: propagates the delta to the children)
    → obj.__x    (the real storage)
```

✅ Verified: a parent's `x` going 300 → 350 moves the child from 100 → 150. The double
indirection exists solely to offer a hook for hierarchical propagation.

> **⚠ `_x` and `__x` are Legacy implementation details.** They are documented here because they
> explain observable behaviour. They do **not** become a v2 API: no public v2 API depends on
> these conventions, and neither users nor components touch them.

### 2.3 Measured limits

**a) Properties added after construction are not reactive.** ✅

```js
obj.health = 100;   // an ordinary data property
obj.health = 50;    // → no event emitted
```

Any property not present when `System.sync()` was called stays silent: no Inspector, no
network, no view updated. Silently.

**b) `#` private fields are invisible.** ✅

`for...in` does not see `#private` fields. `Texture` declares `#scaleX`, `#scaleY`,
`#scaleFromBox`: those properties are **neither synchronized, nor inspectable, nor serialized**.
`Object.keys(texture)` returns only `source, image, flip, name, active`.

> Commit `38906c2` — *"refactor: use ECMAScript # private fields"* — therefore silently removed
> those properties from the Property System. That is the exact illustration of what must not
> happen again: a modernization applied for its own sake broke a cross-cutting mechanism that
> was invisible from the file being changed.

**c) `_prop` and `$prop` are enumerable and pollute everything.** ✅

Every logical property costs three entries (`x`, `_x`, `$x`). Measured consequences on a test
object with one child and one component:

| Serialization | Size | Keys |
|---|---|---|
| `JSON.stringify(obj)` — what the server broadcasts | 1733 B | 38 |
| `obj.stringify()` — filters `_`/`$`, used by `add` | 560 B | 19 |

**A factor of 3.09.** The server heartbeat (`broadcast('heartbeat', scene.objects)`) applies no
filter at all: it sends the `_x`, `_name`, `_components`… duplicates.

**d) Children are serialized twice.** ✅ A child appears in full inside `parent.childs` *and* as
a root object of `scene.objects`.

**e) `$prop` is write-only.** No getter is defined. `obj.$x` returns `undefined`, which is
asymmetric and confusing.

**f) No `previous`.** The event carries only the new value. There is no way to build undo/redo
without reading the value beforehand.

**g) The network debounce is neutralized.** `Network.sync()` implements throttling logic with
`const delay = 0` (`src/network/network.js:401`). ✅ Verified: four keystrokes produce **four
operations**, with no grouping at all. How many messages actually go out, on the other hand,
depends on the millisecond — so on luck. `syncInputs()` uses a real `delay = 50` for the mouse.

**h) Constructing an `Object` emits 19 notifications.** ✅ `System.sync()` rewrites each
property through its own setter to "restore the value" (`obj[prop] = value` at the end of the
loop), and every rewrite emits `setProperty` — before the object even belongs to a scene.
Measured: **57 enumerable keys for 19 public properties**, and 19 notifications when
constructing an empty object.

**i) Two different guards for the same intent.** Four modules protect their DOM code with
`if (window.document)`; `gamepad.js:211` tests `typeof window !== 'undefined'`. The second one
therefore runs in an environment with no DOM and calls `window.addEventListener`.

### 2.4 Measured performance ✅

Micro-benchmark, 3 M operations, Chrome:

| Implementation | Read | Write |
|---|---|---|
| A plain property | 18.6 ms | 4.8 ms |
| Legacy accessors (`_prop`) | 81.6 ms | **301.5 ms** |
| `Proxy` (get/set traps) | 82.0 ms | **76.9 ms** |

A counter-intuitive and decisive result: a `Proxy` reads **just as fast** as the current
implementation and writes **~4× faster**. The cost of a Legacy write comes from dynamically
creating the second property (`this['_' + prop] = value`).

The reactivity overhead on reads (×4 vs a bare property) is **already being paid today**.

---

## 3. Object

`src/core/object.js`, 680 lines.

### 3.1 What it holds

```js
id, uid, name, layer, tag, type, active, visible, lock, static, image,
components{}, childs{}, x, y, width, height, rotation, scale
```

- `id`: the object's identity (`Math.random().toString(36)`, 9 characters).
- `uid`: **the owning player's identifier**, not the object's. It is used to route input (see
  §6.3). A historically misleading name.
- `image`: the `HTMLImageElement` thumbnail for the Hierarchy — UI inside the Core.
- `childs`: incorrect English, but present in the network protocol and in serialization.
  Renaming it breaks data compatibility.

### 3.2 Responsibilities that do not belong here

`Object` carries purely Editor code:

| Method | Nature |
|---|---|
| `detectMouse(x, y)` | mouse picking, reads `Camera.main` |
| `detectSide(x, y)` | resize handles |
| `select(ctx)` | draws the blue selection rectangle |
| `createImage(ctx)` | creates a DOM `<img>`, manipulates an offscreen canvas |
| `preview()` | the editor render loop |

`createImage()` reaches for `document`: **`Object` cannot be loaded on the server unless those
methods are inert.** They are never called on the server, so it works by luck, not by design.

### 3.3 `copy()`: the most fragile point

```js
copy(obj) {
    for (let prop in obj) {
        if (typeof obj[prop] !== 'object') this[prop] = obj[prop];
        else { /* TODO: Gérer les objets */ }
    }
    for (let name in obj.components) {
        this.addComponent(new components[name], false);
        for (let prop in component) this.components[name][prop] = component[prop];
    }
}
```

- Object-valued properties are **not** copied (an explicit `TODO`) — so `childs` is not copied
  by `copy()`; `Scene.init()` has to rebuild the links in a second pass.
- `new components[name]` does a **lookup by name in `mod.js`**: a component whose class is not
  exported from `mod.js` makes deserialization fail.
- `for (let prop in obj)` includes `_x`, `$x`… so `copy()` also reassigns the duplicates.
  `this['_x'] = …` bypasses the instance accessor but reaches the prototype accessor `set _x` —
  so propagation to the children fires during a network copy.
- `copy()` is called **per object and per heartbeat** (`Network.heartbeat`). It is a full
  re-copy, not a patch.

#### `copy()` destroys `components`, `childs` and `image` ✅

Verified by the parity harness (`scene/copy-from-live-object-wipes-containers`).

`for (let prop in obj)` also visits the `$prop` accessors, which are **write-only**. Reading
`obj.$components` therefore gives `undefined`, `typeof undefined !== 'object'`, and the
"primitive" branch runs: `this.$components = undefined` → the `$` setter writes
`this.components = undefined`.

Primitives survive because `_prop` comes immediately after `$prop` in key order and restores the
value. The containers, being objects, are skipped by the restoring branch, and their value stays
`undefined`.

| Source of `copy()` | Result |
|---|---|
| **A live Object** (Editor, prefab, `instantiate`) | `components`, `childs`, `image` → `undefined` |
| **Raw JSON** (a network message, the heartbeat) | correct — JSON has no `$` accessors |

A direct, verified consequence: **`Scene.instantiate()` throws a `TypeError` as soon as the
source carries a component** (`scene/instantiate-throws-with-components`), since
`addComponent()` writes into a `this.components` that has become `undefined`.

This breaks prefab creation (`Project` does `prefab.copy(instance)`) and the `Network.add` path.
The heartbeat, however, works — because it copies from flat JSON. That is what let the defect
stay invisible.

### 3.4 `update()` / `draw()` swallow errors

```js
update() {
    for (let i in this.components)
        if (this.components[i].active && this.components[i].update)
            try { this.components[i].update(this); }
            catch (err) { console.error(err); }
}
```

The per-component, per-frame `try/catch` is what stops a broken user script from killing the
loop — **a legitimate intent**. But it also hides systematic failures (see §6.3).

---

## 4. Scene

`src/core/scene.js`, 292 lines. Deliberately thin.

- `objects{}` is indexed by id and flat. The hierarchy exists only through `parent`/`childs`.
- `current`: the object selected in the Editor — **Editor state stored in the Core**. Its setter
  emits `setCurrentObject`, which drives the Inspector and the Hierarchy.
- `currentComponent`: the same, for component manipulation in the viewport.
- `Scene.main`: a static singleton.
- `instantiate()` creates a `new Object()` and then `copy()`s — so **every object received from
  the network goes through the limits of `copy()`** described in §3.3.
- `refresh()` does `this.current = this.current` to force an Inspector re-render. An idiom worth
  knowing.
- `updateName(el)` reads `el.textContent`: **the Core reads the DOM.**

---

## 5. Components

### 5.1 The real contract

There is **no base class and no interface**. A component is any class. The contract is purely
conventional, by duck-typing:

| Hook | Signature | Called by |
|---|---|---|
| `update(self)` | `self` = the carrying `Object` | `Object.update()`, every frame |
| `draw(self)` | same | `Object.draw()`, if `obj.visible` |
| `preview(self)` | same | `Object.preview()`, if `renderer.inspector` |
| `onCollision(self, other)` | | `Object.onCollision()` |
| `onCollisionStart` / `onCollisionExit` | | same |
| `constructorAfterLink(self)` | | `Object.addComponent()` |
| `detectMouse(self, x, y)` / `detectSide(self, x, y)` | | `Renderer.render()` (editor) |

**The crucial point: `self` is passed as an argument, never stored.** A component holds no
reference to its `Object`. That is what makes components JSON-serializable without a cycle, and
what lets `copyComponent()` work.

`component.name` is overwritten by `addComponent()` with `component.constructor.name`, and
serves as the key in `object.components{}`. An object can therefore carry **only one instance of
each component type**, and minifying the code would break everything.

### 5.2 Client / server split

| Component | `update` | `draw` | `preview` | Server? |
|---|---|---|---|---|
| `Camera` | — | — | ✅ | no (data only) |
| `Texture` | ✅ | ✅ | — | pointless (it resolves an image) |
| `RectangleRenderer`, `CircleRenderer`, `Text` | — | ✅ | — | no |
| `Light`, `Lighting` | ✅ | ✅ | — | partial (`Light.update` writes `self.width`) |
| `ParticleSystem` | ✅ | ✅ | — | **yes for `update`, no for `draw`** |
| `Collider` / `Rect` / `Circle` | ✅ | — | ✅ | yes |
| `Controller` | ✅ | — | — | yes (it reads network input) |
| `Body`, `Rotator`, `Tilemap` | ✅ | — | — | yes |
| `Animator`, `Animation` | ✅ | — | — | debatable |

`ParticleSystem` is exactly the case the vision describes: simulation in `update()`, rendering
in `draw()`, and the server never calls `draw()`. **The update/draw model is justified by the
code, not merely by tradition.**

### 5.3 Three classes exported as components are not components

`mod.js` exports, at the same level, classes whose signature is incompatible with
`Object.update()` / `Object.draw()`:

| Class | Real signature | Effect if attached to an `Object` |
|---|---|---|
| `Tilemap` | `draw(ctx, camera)` | `Object.draw()` calls `draw(this)` → `ctx` receives the Object, `camera` is `undefined` → a `TypeError`, **swallowed by the `try/catch`** |
| `Lighting` | `render(ctx, camera)`, `init()`, `addLight()` | never called — a rendering service, not a component |
| `LightSource` | `update()` **without `self`** | works by accident, but breaks the contract |

Nothing in the code signals that a class is not attachable: duck-typing accepts anything, and
the `try/catch` hides the failure.

Beyond that, `Manager` exposes only **7 components** in the UI (`Camera`, `Texture`,
`CircleRenderer`, `RectangleRenderer`, `Collider`, `Controller`, `Rotator`). `Light`, `Map`,
`Animation` and `Animator` are commented out; `Text`, `ParticleSystem`, `Body`, `Tilemap`,
`Timer` and `Sound` are not listed — although they are exported.

### 5.4 Problematic couplings

- `Collider.update()` references `Scene.main` without importing it → a `ReferenceError` on the
  first call (`src/physics/collider.js:44`). The `try/catch` in `Object.update()` hides it.
- `Texture.update()` re-does `Loader.files[this.source]?.image` **every frame** for every
  textured object — one dictionary lookup per frame per object.
- `Light.update()` writes `self.width`/`self.height`: a component resizes its host every frame,
  overwriting anything typed into the Inspector.

---

## 6. Runtime

### 6.1 Organization

**There is no functional `runtime/` directory.** `src/runtime/` contains only `environment.js`
(platform detection, 411 lines, unrelated to the loop).

The real runtime consists of:

- `Renderer.render(scene, camera)` — the one loop,
- the per-domain modules: `physics/`, `graphics/`, `anim/`, `input/`, `audio/`, `time/`.

**There is no "System" of any kind.** No `PhysicsSystem`, no `RenderSystem`. Physics lives in
`Collider.update()`, animation in `Animator.update()`. The historical organization is **by
domain module**, and the logic lives **in the components**.

### 6.2 The loop

`Renderer.render()` (`src/core/renderer.js:164`) does, in a single pass per object:

1. sorts by `layer` (`Object.values().sort()` — **reallocating an array every frame**),
2. `obj.update()` if not paused,
3. **mouse picking and resize-handle detection (Editor code)**,
4. `ctx.save()`, camera projection, zoom, object rotation,
5. `obj.draw()`, then `obj.preview()` if `inspector`,
6. `ctx.restore()`,
7. `obj.select(ctx)` if selected.

Update and draw are therefore **interleaved per object**: object 2 is updated after object 1 has
been drawn. A component that reads another object's position reads a mixed state — a source of
non-determinism, problematic for a multiplayer engine.

The server, for its part, separates them cleanly: it loops over every `obj.update()` with no
drawing.

`src/core/renderer.js:6`:

```js
import { Dnd } from '/editor/system/dnd.js';
```

**The Core imports the Editor.** It is the most visible layer violation in the repository: the
game runtime cannot be loaded without the IDE's drag-and-drop module.

### 6.3 The runtime is broken offline ✅

`Keyboard.keys(uid)` returns `Network.getUser(uid)?.keys`, and `Network.users` is only
initialized inside `Network.init()`. In offline mode (`const online = false` in `app.js`):

```
Controller.update(self)
  → Keyboard.keyPressed(self.uid)      // self.uid === undefined
    → Network.getUser(undefined)
      → this.users[undefined]           // this.users === undefined
        → TypeError
```

Verified: `o.update()` throws a `TypeError` **every frame and per component**, silently swallowed
by the `try/catch` in `Object.update()`. The object does not move.

**Consequence: offline single-player mode does not work, and nothing says so.** `Input` depends
on `Network`, which is an inverted layer coupling.

---

## 7. Editor

### 7.1 How real-time synchronization actually works ✅

There is **no** reactive framework, **no** virtual DOM, **no** duplicated state. The mechanism
fits in three lines:

1. **Binding by CSS class.** Every editable field carries `class="<objectId>-<prop>"`, or
   `class="<objectId>-<Component>.<prop>"` for a component.
2. **Resolution by global query.** `document.getElementsByClassName(obj.id + '-' + p)` returns
   *every* view of that property, wherever it is in the document.
3. **A focus guard.** `if (el[i] !== document.activeElement)` — the field being typed into is
   never rewritten.

The full cycle of one keystroke in the Inspector:

```
input "P"
  → Properties.updateCurrentObject(el)
    → object.$name = "P"
      → the $name setter
        → this.name = "P"        → dispatch setProperty ──┐
        → dispatch syncProperty ─────────────────────┐    │
                                                     │    │
   Network.sync()  ◄──────────────────────────────────┘    │
     → send('update', {id, prop:'name', value:'P'})        │
                                                           │
   Properties + Hierarchy  ◄────────────────────────────────┘
     → getElementsByClassName('<id>-name')
     → writes into every element except activeElement
```

✅ Verified letter by letter (`P`, `Pl`, `Pla`, `Play`): both views — the Inspector field and the
Hierarchy's `contenteditable` — reflect every keystroke.

**There really is a single source of truth: the `Object` itself.** The DOM is only a projection.
It is simple, direct, and it works. It is also the reason not to introduce a separate store in
v2.

Cost: `getElementsByClassName` over the whole `document` on every property change, and a global
identifier that breaks if two panels display the same object differently.

### 7.2 The Inspector is already generic

`editor/windows/properties.js` **contains no `if (component === "Health")`.** It reflects over
the object and derives the widget from the value's type:

| Value | Widget |
|---|---|
| `number` | `<input type="text">` |
| `boolean` | `<input type="checkbox">` |
| a `string` starting with `#` | `<input type="color">` |
| a `string` | `<input type="text">` |
| `Color` | `<input type="color">` |
| any other object | `<input type="text">` |

The "schema" is therefore **implicit, inferred from the value at that instant**.

Limits: a hard-coded blacklist (`id`, `uid`, `scale`, `static`, `type`, `active`, `visible`,
`lock`, `image`, `parent`, `components`, `childs`); no min/max, no unit, no enumeration, no
tooltip; the `case 'TODO Range'`, `'TODO Array'`, `'TODO Enumeration'`, `'TODO Image'`,
`'TODO Button'` branches are never reached (they are compared against
`value.constructor.name`); a `number` property initialized to `0` and a colour initialized to
`''` are mistyped; `updateProperty` does a `parseInt` on numbers, which **truncates decimals in
the display**.

The component icon, on the other hand, is a `switch` on the name (`appendName`) — the only
genuinely per-component place.

### 7.3 The DOM coupling

The `editor/misc/*.js` modules run at load time and reach for fixed `id`s:

```js
document.getElementById('play').addEventListener('click', …)   // play.js
document.getElementById('pause').addEventListener('click', …)  // pause.js
document.getElementById('sync').addEventListener('click', …)   // sync.js
```

`sync.js` references `#sync`, which is commented out in `index.html` — the module would throw;
it simply is not imported by `app.js`. The windows (`Hierarchy`, `Properties`, `Project`)
receive a container `id` and assume the whole HTML skeleton already exists in `index.html` (700
lines).

**Consequence: adding a window requires editing `index.html`, `app.js`, a CSS file and the
module.** That is the Editor's real modularity problem — not the fact that it uses the DOM.

`Handler` (`editor/system/handler.js`, 27 kB) concentrates the entire viewport: drop, selection,
drag, 8-direction resize (the 8-case `switch` is **duplicated** between object and component),
pan, zoom. No notion of a tool or of a command.

---

## 8. Network

### 8.1 Topology

```
Editor (inspector = true)        Player (inspector = false)
   │  update / add / remove          │  mousemove / keydown / keyup
   │  addComponent / addChild        │
   ▼                                 ▼
        ┌───────────────────────────────┐
        │  Deno server (private)        │
        │  imports the client's mod.js  │
        │  scene = new Scene()          │
        │  setInterval(loop, 16ms)      │  → obj.update()
        │  setInterval(heartbeat, 4000) │  → broadcast(scene.objects)
        └───────────────────────────────┘
```

The server imports **the same `mod.js` as the client**, served over HTTPS from
`editor.pixelcreator.io`. Direct confirmation that the Core is shareable.

### 8.2 The real messages and the need behind each

| Message | Meaning | Underlying need |
|---|---|---|
| `init` | the client asks for the scene, the server returns `scene.objects` | **state bootstrap** |
| `getUID`, `getUsers`, `connection`, `disconnection` | presence | **identity and presence** |
| `heartbeat` / `beat` | the whole scene every 4 s | **state reconciliation** |
| `update` | `{id, type, component, prop, value}` | **property mutation** |
| `add` / `remove` | an object (stringified) / an id | **object lifecycle** |
| `addComponent` / `removeComponent` | | **composition** |
| `addChild` / `removeChild` | | **hierarchy** |
| `upload_file` / `update_file` / `delete_file` | | **resource lifecycle** |
| `mousemove` / `mousedown` / `mouseup` / `keydown` / `keyup` | per user | **player input** |
| `pause` | starts/stops the server loop | **runtime control** |
| `save` | an empty body server-side | **persistence (not implemented)** |
| `message` | a text broadcast | chat/debug |

**The `update` message already is an operation.** `{id, component, prop, value}` is literally a
`SET_PROPERTY` without the name. `addComponent`, `addChild`, `add` and `remove` are already
`ADD_COMPONENT`, `ADD_CHILD`, `ADD_OBJECT` and `REMOVE_OBJECT`.

What is missing to turn them into usable Operations: the previous value (no undo), a
timestamp/sequence number (no total ordering), an author (no collaboration), and transactional
grouping (one drag = hundreds of independent operations).

### 8.3 Notable behaviours

- **No authority.** The server applies what it is sent and then rebroadcasts to the others
  (`client.broadcast`). Any client can modify any object.
- **No echo to the sender**: `client.broadcast` excludes the author. That is the loop
  prevention. Combined with `setProperty()` on receipt (which does not emit `syncProperty`), it
  avoids infinite round trips.
- **The heartbeat overwrites.** `Network.heartbeat` does `obj.copy(data[id])` on every object,
  every 4 s, with the limits of `copy()` (§3.3). A value typed into the Inspector can be
  overwritten by a heartbeat in flight.
- **No interpolation.** `// TODO: Interpolate the movement` in `Network.update`.
- **Input is routed per user**: `Network.users[uid].keys`. An object is controllable only if its
  `uid` matches a connected user (§6.3).
- **`Network.sync()` is only enabled if `inspector === true`**: only the Editor pushes
  mutations; players send only input.
- An incoming `Camera` property is handled separately and re-centred (`camera.x -= width/2`).

---

## 9. Visual scripting

### 9.1 The real state

`editor/graph/graph.js` + `node.js`: a working node editor — creation by drag and drop,
input/output/error connectors, SVG Bézier paths, pan and zoom (recently improved, commits
`e35e00b`, `8bd26bd`, `a52633b`).

The palette is defined **in HTML** (`index.html`):

- events: `init`, `update`, `mouse`, `key`, `collision`, `timer`
- structures: `if`, `repeat`
- functions: `math`, `move`, `edit`, `create`, `delete`, `draw`, `print`

### 9.2 What does not exist

- **No data model.** The graph **is** the DOM: a node is a `<div>`, a connection is a pair of
  connectors linked by JS properties (`connector.other`, `connector.path`) set on the DOM
  elements.
- **No serialization.** Nothing turns the graph into JSON. Closing the tab loses everything.
- **No compilation.** `Graph.updateScript()` does `console.log(this.nodes)` and then
  `this.code = ''`. The three useful lines are commented out.
- **No link to the runtime.** No object ever runs a graph.
- **No variables, no metadata.**

`editor/graph/compiler.js` (`Compiler`) is **not** a graph compiler: it is a lexer/parser for a
textual language with Rust-like syntax (`i32`, `fn`, `let`, `struct`, `match`, `mod`). Its
`compile()` method calls `lex()`, `parse()`, `transpile()` and `evaluate()` **without the
`Compiler.` prefix**, and `evaluate` does not exist → always a `ReferenceError`. Dead code.

`editor/graph/component.js` defines a `Component` class (id/name/type) unrelated to game
components — a name collision to avoid in v2.

### 9.3 `.px` today

**Contrary to the stated intent, `.px` is treated as JavaScript.**
`Loader.allowedScriptsTypes` contains `'application/px'` next to `'text/javascript'`; a `.px`
file therefore follows exactly the path of a `.js`: read as text, turned into a Blob URL, passed
to `import()`. The server, for its part, knows `application/pixelscript` — two divergent MIME
types for the same idea.

---

## 10. Resources

`Loader` (static) is the single registry: `Loader.files[id]`, with `id = path + name`.

- A file is a native `File` **augmented** by `System.createFile()`: `name`, `extension`, `path`,
  `id`, `value`, and then `System.sync()` on top. A resource is therefore reactive like an
  `Object`, and travels through the same events.
- `Resource` (`src/core/resource.js`) exists but is **never used** — `Loader` builds augmented
  `File`s instead.
- Images: read as a DataURL (`readAsDataURL`) → `file.value` holds the full base64. Those
  resources therefore go **as base64 inside the JSON** to the server.
- Scripts: read as text, then `createScriptComponent()` → `URL.createObjectURL` → `import()` →
  `module.default` is the component class.
- **Real hot reload**: `Loader.import()` emits `import`, `Scene` listens for it and re-injects
  the component into every object carrying it. Renaming a script even rewrites the `class`
  declaration with a regular expression.
- Persistence: `XMLHttpRequest` POST/PUT/DELETE to the server, which writes to disk.
  `Store`/`Database` (IndexedDB) exist but are wired to nothing.
- The Blob URLs created are never revoked (a memory leak on every re-import).

---

## 11. Dynamic component loading

The mechanism works and deserves to be kept:

```
a project .js file → Blob URL → import() → module.default → new Component()
                                                  │
                                        dispatch('import') → Scene.update()
                                                  │
                                        re-injection into the objects concerned
```

Limit: `plugins/test.js` — the only plugin example — imports `Manager` from
`/editor/system/manager.js` and calls `Manager.addComponent(Test, …)` **statically**, while
`addComponent` is an **instance method**. The example plugin is broken, and it couples a game
component to the IDE.

---

## 12. Logging

No logger. `console.log` calls with inline CSS styles, scattered around:

| Colour | Pattern | Meaning |
|---|---|---|
| `#11AB0D` green | `[SERVER] …` | network traffic |
| `#3b78ff` blue | `info: …` | engine information |
| `#F9F1A5` yellow | `warn: …` | a warning |

Partly codified in `System.log/debug/warn`, but **most calls do not use those helpers** and
rewrite the style by hand. `System.getDate()` formats a timestamp that is never used.

The visual identity (coloured categories) is an asset worth keeping.

---

## 13. Tests, tooling, dependencies

- **No tests.** No framework, no test file. `plugins/test.js` is an example component, not a
  test.
- **No build, no bundler, no `package.json`** in `engine/`.
- **Zero runtime dependencies.** Only Font Awesome (local CSS) and some Google fonts (CDN) are
  external.
- **Absolute imports** (`/src/core/...`): the application must be served from the root of
  `legacy/`.
- Tooling: `tools/dev-server.sh` (python http.server) — it serves the `engine/` root, while the
  application needs the `legacy/` root. To be fixed.

### Existing documentation

- `docs/architecture.md`, `docs/coding-guidelines.md`, `docs/project-vision.md`,
  `docs/documentation.md`: they describe **intentions**, several of which the code contradicts.
  - "The editor never mutates engine state directly" — false: `Handler` writes
    `scene.current.$x = …` directly.
  - "Local update: `obj.setProperty('x', 100)` / Network: `obj.syncProperty('x', 100)`" — those
    methods exist, but the Editor actually uses the `$` accessor.
  - "No component-to-component coupling" — false: `Animator` drives `Animation`, and
    `Controller` calls `self.translate()`, which calls `components.collider.update()`.
- `reference/*.md`: API documentation describing an **intended** API, not the current one (for
  example `new Object({name, x, y})` with an options object, while the real constructor is
  positional). `reference/editor/collab.md` documents a `Collab` module (Socket.IO) **absent from
  the code**.

These documents are therefore to be treated as sources of intent, never as descriptions of
behaviour.

---

## 14. Summary of couplings

```
 Core ──────► Editor      renderer.js imports editor/system/dnd.js        ❌ inverted
 Core ──────► DOM         object.createImage(), scene.updateName(el)      ❌ inverted
 Core ──────► Editor      scene.current, scene.currentComponent           ⚠ IDE state
 Input ─────► Network     Keyboard.keys(uid) → Network.users              ❌ breaks single-player
 Loader ────► Network     the server URL hard-coded in the loader         ⚠
 Component ─► Editor      plugins/test.js imports Manager                 ❌
 Editor ────► index.html  getElementById on fixed ids, everywhere         ⚠ modularity
 Server ────► HTTPS       imports the client's mod.js by URL              ✅ an asset
```

---

## 15. What works and must be protected

1. The triple write channel `x` / `$x` / `setProperty()` — the distinction is right.
2. Letter-by-letter synchronization by CSS class + the `activeElement` guard.
3. The Core shared between client and server, proven in production.
4. `update(self)` / `draw(self)` with `self` as an argument — serializable components, a server
   without rendering.
5. The generic Inspector, by reflection.
6. Component hot reload through dynamic `import()` + the `import` event.
7. The per-component `try/catch` that isolates user scripts.
8. Reactive resources (a file behaves like an object).
9. Input routed by `uid` — the multiplayer model is inside the engine, not beside it.
10. The vocabulary: `Object`, `Component`, `Scene`, `Resource`.
