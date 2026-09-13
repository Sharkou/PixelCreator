# Network and Server

> The historical server is **private**. It is never committed to the public repository.
> This analysis was made from an external copy (`PixelCreator-private/`).
> No server code is reproduced here beyond what is necessary to understand the protocol.

---

## OBSERVED — topology

```
Editor (inspector = true)              Player (inspector = false)
  update / add / remove                  mousemove / mousedown / mouseup
  addComponent / removeComponent         keydown / keyup
  addChild / removeChild
  upload_file / delete_file / save / pause
          │                                        │
          └────────────────┬───────────────────────┘
                           ▼
              ┌──────────────────────────────┐
              │  Deno server (private)       │
              │  imports the client's mod.js │
              │  scene = new Scene()         │
              │  loop      : 60 Hz  → update │
              │  heartbeat : 4 s    → scene  │
              └──────────────────────────────┘
```

### The single most important fact

The server imports **literally the same module as the client**, served over HTTPS:

```js
import * as components from 'https://editor.pixelcreator.io/src/core/mod.js';
```

Then:

```js
const Scene = components.Scene;
let scene = new Scene();
// loop: for (obj of scene.objects) obj.update();     ← never draw()
```

**There is no `ServerObject` and no `ClientObject`.** It is proof, in production, that the Core
is shareable. It is the project's most valuable architectural asset and must be preserved
without compromise.

The server also separates update and rendering cleanly — which the client does not (see
`RUNTIME.md`).

---

## OBSERVED — messages and functional needs

This list must not be frozen as the v2 protocol; what matters is identifying the need behind
each entry.

| Message | Meaning | Need |
|---|---|---|
| `init` | the client asks for the scene; the server returns `scene.objects` | **state bootstrap** |
| `getUID` / `getUsers` / `connection` / `disconnection` | identity and presence | **presence** |
| `heartbeat` / `beat` | the whole scene every 4 s | **reconciliation** |
| `update` | `{id, type, component, prop, value}` | **property mutation** |
| `add` / `remove` | a stringified object / an id | **object lifecycle** |
| `addComponent` / `removeComponent` | | **composition** |
| `addChild` / `removeChild` | | **hierarchy** |
| `upload_file` / `update_file` / `delete_file` | | **resource lifecycle** |
| `mousemove` / `mousedown` / `mouseup` / `keydown` / `keyup` | per user | **player input** |
| `pause` | starts/stops the server loop | **runtime control** |
| `save` | **an empty body server-side** | persistence — not implemented |
| `message` | a text broadcast | chat / debug |

**`update` already is a `SET_PROPERTY`.** `add`, `remove`, `addComponent` and `addChild` are
already named operations (ADR-0008).

---

## OBSERVED — structuring behaviours

### Echo prevention

Two mechanisms combine:

1. The server uses `client.broadcast(...)`, which **excludes the sender**.
2. On receipt, the client applies the value through a path that does **not** emit
   `syncProperty` — so nothing goes back out.

That is correct, and it is what `origin: 'network'` will replace in v2, explicitly.

### Only the Editor pushes mutations

`Network.sync()` is called only if `inspector === true`. Players send only input. The Editor is
therefore, in practice, **the authoritative client** — without that being formalized or
checked.

### No server authority

The server applies what it is sent, then rebroadcasts. Any client can modify any object.
Acceptable for a cooperative prototype, **blocking for a competitive game** (.io, MOBA) — which
is nevertheless the product's stated target.

### Input is routed per user

```js
Network.users[uid].keys      // keyboard state per player
Controller.update(self) → Keyboard.keys(self.uid)
```

An object is controllable only if its `uid` matches a connected user. **The multiplayer model
is inside the engine, not beside it** — that is a strength.

But `Input` imports `Network`, which **breaks offline single-player**: `Network.users` is
`undefined` offline, `Keyboard.keys()` throws a `TypeError` swallowed by the `try/catch` in
`Object.update()`, and the object never moves. (verified — `MIGRATION.md` §4.1)

### The heartbeat overwrites

Every 4 s, `broadcast('heartbeat', scene.objects)` → client-side `obj.copy(data[id])` on every
object. Consequences:

- a value being typed in the Inspector can be overwritten by a heartbeat;
- `copy()` brings all its limitations with it (see `OBJECT.md`);
- the payload is **not** filtered: it contains the `_x`, `_name`, `_components`… duplicates and
  serializes every child twice. **A measured factor of 3.09.**

### No interpolation

`// TODO: Interpolate the movement` in `Network.update`. Remote positions jump from one value
to the next.

### The throttle is neutralized

`Network.sync()` implements a throttle with `const delay = 0`: **every keystroke produces a
message**. `syncInputs()` uses a real `delay = 50` for the mouse.

---

## V2 PROPOSAL

### Operations

See ADR-0008. A formalization of what already exists, with no change of ergonomics:

```
object.x = 100  →  Change  →  Operation SET_PROPERTY  →  transport
```

Additions: `previous` (undo), `seq` (ordering, loss detection), `author` (collaboration),
`batch` (one drag = one operation, instead of hundreds).

### State replication

The full heartbeat is replaced by **delta snapshots**: only the properties modified since the
last acknowledgement are sent. Full reconciliation stays available on connection and on demand.

Combined with the removal of the `_prop` duplicates and of the child duplication, the payload
reduction is substantial.

### Decoupling input

```
runtime/input   input state per owner; a "local" owner always exists
network/        feeds the remote owners
```

The Core no longer depends on the network. **Single-player mode works.**

### Client / Server

```
                  core/  (identical)
                        │
          ┌─────────────┴─────────────┐
       Client                      Server
   runtime + renderer          runtime without rendering
   editor (optional)           network + persistence
```

`mod.js` is split into `core/mod.js` (shared) and `runtime/mod.js` (client), so that the server
stops transitively importing rendering and the DOM.

---

### Authority — SETTLED (ADR-0011)

**The server is the simulation authority in competitive multiplayer.**

The model distinguishes two natures of mutation:

| Nature | Emitter | Handling |
|---|---|---|
| **Player / client mutation** | a player in game | an intent submitted to the server; the client predicts, the server decides |
| **Authorized editor mutation** | the creator, with permissions | an authorized Operation → **validated server-side** → applied to the authoritative state → propagated |

The common path:

```
Operation → authority.check(op, actor) → authoritative state → propagation
```

The **permission system is not implemented now**. What is implemented is the checkpoint: every
Operation carries an `actor` and an `origin`, and goes through `authority.check()` without
exception — even if the initial policy accepts everything.

The Editor applies **optimistically** and reconciles if the server refuses: letter-by-letter
synchronization stays local and immediate, only the confirmation is asynchronous.

In single-player / offline, the authority is a permissive local implementation — no network
round trip.

---

## Remaining questions

| Question | What is at stake |
|---|---|
| Does the server stay on Deno? | It uses `std@0.117` `ws`, an obsolete API; any protocol change forces a simultaneous migration of both sides (risk R4) |
| Persistence: `save` has an empty body. Where and how is a project stored? | A prerequisite for CREATE/PLAY/SHARE |
| One server per game, or one multi-project server? | Legacy: one server = one singleton scene (ADR-0010) |

These questions concern infrastructure, not the model. They do not block steps 1 to 4 of
`../MIGRATION.md` §5.
