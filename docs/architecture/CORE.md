# Core

> The Core is the only layer shared between client, server and editor.
> It depends on nothing.

## Absolute rule

```
core/  ──►  (nothing)
```

No DOM, no `window`, no `document`, no Canvas, no WebSocket, no import into `runtime/`,
`editor/` or `network/`.

**OBSERVED:** Legacy breaks this rule in three places.

| Violation | File | Effect |
|---|---|---|
| `import { Dnd } from '/editor/system/dnd.js'` | `src/core/renderer.js:6` | the Core imports the IDE |
| `document.createElement('canvas' / 'img')` | `src/core/object.js` (`createImage`) | the Core touches the DOM |
| `el.textContent` | `src/core/scene.js` (`updateName`) | the Core reads the DOM |

The server only survives these paths by luck: it never calls `createImage()` nor the
renderer. v2 makes the rule checkable by a test (see `../development/TESTING.md`).

---

## Contents

```
core/
├── object.js         Object: identity, hierarchy, components
├── scene.js          Scene: a collection of Objects
├── component.js      the contract + the component registry
├── definition.js     the definition of a Component type: properties + graph (ADR-0016)
├── graph/            the `.px` graph model: nodes, ports, connections (ADR-0027)
│   ├── graph.js      Graph: the model, and the Operations that mutate it
│   ├── nodes.js      NodeRegistry, ports, type compatibility
│   ├── standard.js   the node library that ships with the engine
│   ├── definition.js ComponentDefinition: the live model of a `.px`
│   ├── validate.js   "is this graph runnable, and if not, where"
│   └── errors.js     GraphIssue / GraphError, structured
├── properties/       Property System (Proxy, Change, observe)
├── operations/       Operation, application, history
├── resources/        Resource, registry, loading
├── events.js         a synchronous event bus
├── serialize.js      explicit, versioned serialization
├── id.js             identifier generation
└── logger.js         logging by category
```

`operations/` is in the Core, not in `network/`: an Operation exists offline too (history,
undo/redo). The network is a **transport** for it, not its owner.

`graph/` is in the Core for the same reason as `definition.js`: the Editor draws it, the
Runtime interprets it, a headless server loads and validates it — three consumers, therefore
the shared foundation (ADR-0027). A node type declares **its shape and its evaluation** there,
and that evaluation is pure: it reads its inputs and writes through the Component, with no
DOM, no clock and no source of randomness. What belongs to the Runtime is the execution order,
the per-instance state, the budget and the error reporting — not what a node *is*.

---

## Dismantling `System`

**OBSERVED:** `src/core/system.js` is a 257-line catch-all bundling unrelated
responsibilities:

| Current contents | v2 destination |
|---|---|
| `createID()` | `core/id.js` |
| `random(a, b)` | `math/` (a duplicate of `Random`) |
| `sync(object, component)` | `core/properties/` (ADR-0003) |
| `createFile(...)` | `core/resources/` |
| `validate(e, event)` — validates a DOM `<input>` | `editor/ui/` |
| `dispatchEvent` / `addEventListener` / `removeEventListener` | `core/events.js` |
| `setIntervalX`, `include(url)` | removed (unused or obsolete) |
| `stringify` / `parse` — serialize **functions** | removed (see below) |
| `getDate()` | `core/logger.js` (never called today) |
| `log` / `debug` / `warn` | `core/logger.js` |
| `document.addEventListener('contextmenu', ...)` as a load-time side effect | `editor/` |

The name "System" disappears (ADR-0005): it is not a system.

### Security note

`System.stringify()` serializes functions as text, and `System.parse()` was designed to
re-evaluate them. Deserialization has been disabled (a console warning), but **the
serialization remains**. In v2, no function travels in the state: a behaviour is referenced by
its component name or by its resource id.

---

## Object

See `OBJECT.md`.

## Scene

```js
class Scene {
    id, name
    objects        // flat, indexed by id
    add(obj) / remove(obj) / instantiate(obj)
    getObjectById / getObjectsByName / getObjectsByTag
}
```

What leaves `Scene`:

- **`current` and `currentComponent`** — IDE selection state. They move to
  `editor/selection.js`. Read today by Inspector, Hierarchy, Handler, Manager and Network: a
  cross-cutting move to do in one go.
- **`updateName(el)`** — reads the DOM. Becomes a normal property write on the Editor side.

What stays: the flatness of `objects` (the hierarchy is only a `parent`/`children` link), the
`add`/`remove`/`instantiate` events, and `refresh()`.

**V2 PROPOSAL:** introduce `Project`, absent from Legacy — a project holds scenes, resources
and an identity (ADR-0010).

---

## Property System

See ADR-0003. The contract in summary:

```js
object.x = 100;                  // direct mutation — views notified, no Operation
object.setProperty('x', 100);    // controlled mutation — views + Operation + authority
```

`object.$x` **does not exist in v2**.

```js
{ object, component, prop, value, previous, origin }
```

`origin` ∈ `runtime` | `local` | `editor` | `player` | `network`.
The network layer ignores `origin === 'network'`: that is what prevents echoes, without
resorting to Legacy's `dispatch = false` flag.

> **⚠ `setProperty()` carries the same name in Legacy, with another meaning.** There it writes
> `_x` directly and **does not replicate**; `$x` and `syncProperty()` are what replicate. In
> v2, `setProperty()` takes over that role and both Legacy forms disappear. Applying an
> incoming change is done through an Operation with `origin: 'network'`.

> **The internal layers are not an API.** `_x` and `__x` remain implementation possibilities;
> no public v2 API depends on them, and neither users nor components touch them.

---

## Events

Legacy's synchronous bus is kept — the ordering is deterministic and debugging predictable.
Two fixes:

- `removeEventListener` already exists but is **called nowhere**: listeners accumulate (every
  `new Properties()`, every script import adds one). In v2, every subscription returns an
  unsubscribe function.
- An error in one listener today interrupts the `for` loop and starves the following listeners
  of the event. In v2, errors are isolated per listener.

### The Scene's structural events — IMPLEMENTED

A property write is observed on the object that carries it (`object.observe`). A change of
**shape** is not a property: there is no field name to subscribe to. The `Scene` therefore
announces it, and this is the complete list:

| Event | Payload |
|---|---|
| `added` / `removed` | the object |
| `component:added` / `component:removed` | `{ object, component, type, index }` |
| `component:moved` | `{ object, type, index, previousIndex }` |
| `child:added` / `child:removed` | `{ parent, child, index }` |
| `roots:reordered` | `{ object, index, previousIndex }` |

```js
scene.on('component:added', ({ object, type }) => …);   // returns an unsubscribe
```

The last two arrived with structural order (ADR-0018): a rank that changes adds and removes
nothing, so none of the existing events said it.

Mechanics: on joining a scene, an object receives from it the function through which to emit
(`attachToScene(object, scene, notify)`). The object therefore does not import `Scene`, and
nobody but the `Scene` holds that entry point. A detached object announces nothing — there is
nobody to listen.

**This is not a mutation bus.** The list is closed and only covers what a property cannot
express. It exists so that the Editor does not have to push its views from the code that
writes — the inversion `EDITOR.md` requires.

#### An event never announces a half-moved tree — FIXED 2026-08-17

`Scene.reparent()` unlinks and then relinks. The notifications from the first half were emitted
**during** the rearrangement: a listener that rebuilds on `child:removed` — which is exactly
what the Hierarchy does — read a scene where the object belonged to nothing, neither to a
parent nor to the roots, and drew a tree without it. No later event came to correct the
display.

The notifications of a rearrangement are therefore **held and emitted once**, when the shape
they describe is the one the scene really has. That is what used to make an object vanish from
the Hierarchy when a drop was undone (`Ctrl Z`), without the model being wrong at all. Two
tests pin it down: `scene.test.js`, "a structural event never announces a tree that is half
moved" and its Editor-side counterpart in `reparent.test.js`.

---

### `Object.visible` has been removed — 2026-08-18

An `Object` carried `active` **and** `visible`: the Runtime skipped an inactive object, and the
SceneRenderer additionally skipped an invisible one. No Editor control exposed the difference,
and the two that existed — the Hierarchy's eye and the Inspector's checkbox — each wrote a
different field, so they contradicted each other on screen.

`active` is now an object's only liveness state, and `serializeObject()` writes it only once
(ADR-0026 §2). "Simulated but not drawn", if it becomes a need again, will belong to a
rendering Component — where the question actually arises.

---

## Serialization

An explicit, versioned `serialize()`:

- no `_prop` / `$prop` duplicates — they no longer exist;
- **children referenced by id**, never nested (Legacy serializes each child twice: in
  `parent.childs` and in `scene.objects`);
- images referenced by resource id, never as base64 in the scene state;
- derived or display properties (`image`, thumbnails) are excluded by nature, not by a
  blacklist.

**SETTLED:** the format is versioned **for the future**, not for the past. There is no v1
project to read back: `deserialize()` has **no Legacy compatibility path** to implement. Do not
design a data migration.

Expected measured gain on the heartbeat: a factor of 3 on the `_prop` duplication, plus the
removal of the child duplication.

### `active` is part of the contract, not of the schema — IMPLEMENTED

A Component that declares a `static schema` serializes only its schema keys. But `active` is in
no schema: it is a property of the Component **contract**, read by the Runtime and the
SceneRenderer, written by the user or the Editor (ADR-0004, ADR-0012 §2).

Observed on 2026-08-13: disabling a Component from the Editor did produce a replicable
Operation, **and then vanished at the next save**. `serializeComponent()` therefore writes
`active` when the component carries it. Absent stays absent — a component that never had an
`active` does not gain one, because "absent" already means "active".

---

## Resources

**They are not in the Core, and that is the decision.** `Resource`, `ResourceStore` and
`Project` live in `src/project/` (ADR-0020): the Core never touches storage. See
`../ARCHITECTURE.md` §9 and `../decisions/ADR-0025-folders-and-resource-inspection.md`.

What the Core provides and the Project layer reuses, with nothing resource-specific about it:

- `createId()` — one single notion of identity across the whole product (ADR-0010).
- `makeReactive()` — a manifest entry is observed like an `Object`, which is why renaming a
  resource retitles a row and a panel without anyone pushing them.
- `Operations`, `invert()` — the Project's pipeline is **the same class**, instantiated a
  second time with a different `resolve`. A folder created, moved or deleted is therefore
  replicated and undone by the Core's machinery, without one more operation type (ADR-0025 §3).

---

## What the Core does not contain

- Rendering (`runtime/rendering/`)
- Input (`runtime/input/`)
- The network (`network/`)
- Any notion of selection, window, cursor or thumbnail (`editor/`)
- `Camera` — which is today both a component and an `Object` that carries one (`Camera.main`
  holds an `Object`, not a `Camera`). An ambiguity to resolve in `RUNTIME.md`.
