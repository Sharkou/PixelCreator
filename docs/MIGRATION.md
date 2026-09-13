# Migration v2

> **Status: ACTIVE PLAN.** Decisions accepted on 2026-08-12; no step started yet. This document
> serves as the plan and as the risk register.

---

## 1. Order of work

```
Understand → Map → Document → Compare → Propose → GET IT ACCEPTED
    → Implement → Test → Compare against Legacy → Document
```

**The decisions were accepted on 2026-08-12.** Phase 0 is closed:
`migration/LEGACY_ANALYSIS.md` describes how things really work, `ARCHITECTURE.md` sets the
target, and its §10 records the decisions.

One question remains open (Q7, the `.px` execution mode) and it is **not blocking**: it only
comes up at step 9.

We are therefore at **"Implement"**, whose first step is tooling (§5).

---

## 2. System-by-system comparison

Format: **Legacy → Limits → Keep → Simplify → v2 proposal → Risk**

### 2.1 Object

| | |
|---|---|
| **Legacy** | Container + transform + IDE methods (`detectMouse`, `select`, `createImage`) + a reflective `copy()` |
| **Limits** | Editor and DOM code inside the Core; `copy()` does not copy objects (`TODO`); components resolved by name through `mod.js`; `uid` designates the player, not the object |
| **Keep** | The name `Object`; identity by short id; `components{}` and the hierarchy; `active`/`visible`/`lock` |
| **Simplify** | Move picking/selection/thumbnail out to `editor/` |
| **Proposal** | A pure container + `Transform` as a component + the `object.x` façade (ADR-0001, ADR-0002) |
| **Risk** | A façade that diverges from `Transform` would recreate the two sources of truth we are trying to avoid. A test is mandatory. |

### 2.2 Property System

| | |
|---|---|
| **Legacy** | `System.sync()`: per-property accessors, `_prop`/`__prop` storage, the `$prop` network channel and `syncProperty()` |
| **Limits** | Dynamic properties stay silent; `#` fields invisible; `_`/`$` enumerable (×3 serialization); writes 4× slower than a Proxy; no `previous`; the network throttle is neutralized (`delay = 0`) |
| **Keep** | **The `object.x = 100` ergonomics** and the simulation / intent distinction |
| **Simplify** | One `Proxy` per object replaces N `defineProperty` calls |
| **Proposal** | ADR-0003 — `Change { object, component, prop, value, previous, origin }`; `$prop` **removed**, `setProperty()` becomes the controlled path |
| **Risk** | **The highest in the project.** Everything depends on it: Inspector, Hierarchy, network, resources. A regression is invisible (a value simply stops being propagated). Requires tests before any other migration. |

### 2.3 Scene

| | |
|---|---|
| **Legacy** | A flat `objects{}`, `current`/`currentComponent`, `Scene.main`, `instantiate()` via `copy()` |
| **Limits** | IDE state (`current`) inside the Core; `updateName(el)` reads the DOM; no notion of a `Project` |
| **Keep** | The flatness of `objects{}`; `refresh()`; the `add`/`remove`/`instantiate` events |
| **Simplify** | Move `current` into an Editor selection; introduce `Project` |
| **Proposal** | `core/scene.js` without the DOM; `editor/selection.js` |
| **Risk** | `scene.current` is read by Inspector, Hierarchy, Handler, Manager and Network. A cross-cutting move. |

### 2.4 Components

| | |
|---|---|
| **Legacy** | Free-form classes, duck-typed `update(self)`/`draw(self)`, keyed by class name |
| **Limits** | No explicit contract; only one component per type; minification ruled out; `Collider` references `Scene.main` without importing it; `Texture.update()` does a lookup every frame |
| **Keep** | **`self` as an argument**; `update`/`draw` kept separate; no mandatory base class |
| **Simplify** | A documented contract, an optional `schema`, fixing the couplings |
| **Proposal** | ADR-0004 (lifecycle), ADR-0007 (schema) |
| **Risk** | Making `schema` mandatory would break user components. It stays optional. |

### 2.5 Runtime / Renderer

| | |
|---|---|
| **Legacy** | `Renderer.render()` does sorting + update + IDE picking + projection + draw + preview + selection |
| **Limits** | `import { Dnd } from '/editor/...'` inside the Core; update/draw interleaved (non-deterministic); `sort()` every frame; `Camera` plays two roles (a component *and* an Object) |
| **Keep** | Canvas 2D; the camera projection; the editor display overlays — but in `editor/viewport/`, not as a Component hook |
| **Simplify** | Separate the phases; move picking out; cache the sort |
| **Proposal** | `runtime/loop.js` + `runtime/rendering/`; IDE overlays in `editor/viewport/` |
| **Risk** | Separating update and draw **changes the observation order**: a Legacy game could unintentionally depend on the interleaving. |

### 2.6 Network

| | |
|---|---|
| **Legacy** | WebSocket, ~20 messages, a full heartbeat every 4 s, no authority |
| **Limits** | The heartbeat overwrites in-progress edits; ×3 payload; duplicated children; no interpolation (`TODO`); `Network.sync()` only when `inspector`; inputs keyed by `uid` coupled to `Input` |
| **Keep** | The `{id, prop, value}` shape; not echoing back to the sender; routing input per user; **the shared Core** |
| **Simplify** | Formalize as Operations; delta snapshots; batching |
| **Proposal** | ADR-0008 |
| **Risk** | The server is private, written in Deno against an obsolete WebSocket API (`std@0.117`). Any protocol change requires migrating both sides **at the same time**. |

### 2.7 Editor

| | |
|---|---|
| **Legacy** | Monolithic HTML (700 lines), modules bound to fixed `id`s, binding through a global CSS class |
| **Limits** | Adding a window = 4 files; `window.js` is empty; a 27 kB `Handler`; `getElementsByClassName` on `document` |
| **Keep** | **Letter-by-letter synchronization**; the `activeElement` guard; the `Object` as the single source of truth; the reflective Inspector |
| **Simplify** | Web Components; scoped binding; a viewport made of tools |
| **Proposal** | ADR-0006, ADR-0007 |
| **Risk** | The Shadow DOM **breaks the global `getElementsByClassName`**. The binding has to be migrated *before* encapsulation, or real-time synchronization disappears silently. |

### 2.8 Visual scripting

| | |
|---|---|
| **Legacy** | A working node editor, **with no model, no serialization, no execution** |
| **Limits** | The graph is the DOM; `updateScript()` is a `console.log`; `compiler.js` is dead code; `.px` treated as JS |
| **Keep** | The UI (pan, zoom, Bézier, connectors), recently improved; the node palette |
| **Simplify** | — (there is almost nothing to simplify: it all has to be built) |
| **Proposal** | A serializable `.px` model + an execution runtime (ADR-0009) |
| **Risk** | This is **construction**, not migration. Isolate it so it does not delay the rest. |

### 2.9 Resources

| | |
|---|---|
| **Legacy** | A static `Loader`, a native `File` augmented and made reactive |
| **Limits** | `Resource` unused; `id = path + name` (renaming breaks references); images as base64 in the state; Blob URLs never revoked; IndexedDB not wired up |
| **Keep** | Resource reactivity; hot reload through `import()` |
| **Simplify** | A stable id, a real `Resource`, an IndexedDB cache |
| **Proposal** | `core/resources/` |
| **Risk** | Changing the shape of ids invalidates existing projects. |

---

## 3. Risk register

| # | Risk | Severity | Detection | Mitigation |
|---|---|---|---|---|
| R1 | **Property System breakage**: a property stops being propagated | Critical | No error, a visual symptom noticed late | Tests first; a harness comparing the events emitted by Legacy vs v2 |
| R2 | **Editor/Runtime desynchronization**: the Shadow DOM breaks class-based binding | Critical | The field stops updating while typing | Migrate the binding before encapsulation; a letter-by-letter editing test |
| R3 | **Client/server divergence**: the server can no longer import the Core | High | The server stops starting | A Core import test in Node/Deno, with no DOM, in CI |
| R4 | **Network regression**: the protocol changed on one side only | High | Frozen objects, desync | Version the protocol; the private server migrates at the same time |
| R5 | **Two sources of truth, `Object.x` / `Transform.x`** | High | Values that diverge after a network round trip | An identity test: `object.x === transform.x` after every write path |
| R6 | **Component incompatibility** | ~~High~~ **Low** | — | **Downgraded**: there is no v1 project to preserve. `schema` stays optional and `self` stays an argument for ergonomics, no longer for compatibility |
| R14 | **`setProperty()` carries the same name as in Legacy with another meaning** | High | A developer reads `legacy/`, infers the wrong behaviour, and writes code that produces no Operation | Flagged in ADR-0003, `CONVENTIONS.md` and the JSDoc; an explicit mapping in the parity harness |
| R15 | **Writing `=` where `setProperty()` was required** | High | The change neither replicates nor undoes — **silently** | A development-mode guard: warn on a direct write in an `editor` context (ADR-0003) |
| R7 | **Loss of undocumented historical behaviour** | High | Found by the user, late | `LEGACY_ANALYSIS.md` §15 (an explicit list); `legacy/` stays runnable for comparison |
| R8 | **Performance loss** (Transform façade, Proxy) | Medium | FPS drop | The benchmark already exists (§2.4 of the analysis); rebuild it in CI |
| R9 | **Over-abstract architecture** | Medium | The code becomes harder to read than before | Rule: any abstraction must delete more lines than it adds |
| R10 | **UI debt moved, not resolved** | Medium | 700 lines of HTML become 30 equally coupled components | Every Web Component must be openable on its own in a test page |
| R11 | **Visual scripting blocks the migration** | Medium | The effort drags on | Keep it off the critical path |
| R12 | **Excessive dependencies** | Low | A growing `package.json` | Zero runtime dependencies; dev tooling only |
| R13 | **A pre-existing regression mistaken for a v2 regression** | Low | Confusion during testing | Known Legacy bugs are recorded (§4) |

---

## 4. Known Legacy bugs — present *before* any migration

Recorded so that they are not attributed to v2:

1. **Offline single-player does not work** — `Keyboard.keys()` throws a `TypeError` every
   frame, swallowed by the `try/catch`. (verified)
2. **`Collider.update()`** references `Scene.main` without importing it → a masked
   `ReferenceError`.
3. **`plugins/test.js`** calls `Manager.addComponent()` statically when it is an instance
   method → the example plugin is broken.
4. **`Compiler.compile()`** calls `lex`/`parse`/`transpile`/`evaluate` without a prefix and
   `evaluate` does not exist → always a `ReferenceError`.
5. **`Interpreter.update()`** references `Properties` without importing it.
6. **`Network.addChild/removeChild`** log `data.component.name` while the message carries no
   `component` → a `TypeError` on receipt.
7. **`Loader.load()`** destructures `blob.type` without checking that the `fetch` succeeded.
8. **`tools/dev-server.sh`** serves `engine/` when the application needs `legacy/`.
9. **Decimals are truncated** in the Inspector (`parseInt` on `number` values).
10. **`Light.update()`** overwrites `self.width`/`self.height` every frame, cancelling any user
    input.
11. **`Tilemap.draw(ctx, camera)`** has a signature incompatible with `Object.draw()`: attached
    to an object, it throws a masked `TypeError`. `Lighting` and `LightSource` also violate the
    component contract while being exported by `mod.js`.
12. **`Object.copy()` destroys `components`, `childs` and `image`** when the source is a live
    `Object`: it reads the write-only `$prop` accessors and reassigns them. Consequence:
    **`Scene.instantiate()` throws as soon as the source carries a component** — which breaks
    prefab creation and the `Network.add` path. The heartbeat survives because it copies from
    flat JSON, with no `$` accessors.
    *(found by the parity harness, not by reading)*
13. **`gamepad.js`** tests `typeof window !== 'undefined'` where the other modules test
    `window.document` — so it runs in an environment with no DOM.

Points 12 and 13 were found by **running** Legacy through `tools/parity/`. That is exactly
what step 1 was meant to produce.

---

## 5. Proposed sequence

The order is dictated by dependencies and by risk, not by ease.

| Step | Contents | Exit criterion |
|---|---|---|
| **0** | *(done)* Analysis, proposal, decisions | §10 settled — **done on 2026-08-12** |
| **1** | **Tooling + parity harness**: capture Legacy's behaviour | ✅ **done** — `tools/parity/`, 39 scenarios, `node tools/parity/run.js` |
| **1 bis** | A fixed dev server, a layer dependency rule test | to do |
| **2** | `core/`: events, logger, Property System (Proxy + Operations), Object, Component, Scene, serialize | Parity proven by the step 1 harness |
| **3** | `Transform` + façade | `object.x === transform.x` on every path |
| **4** | `runtime/`: loop, rendering, input decoupled from network | A scene runs; **offline single-player works** |
| **5** | `network/` + `authority`: Operations, deltas, batching — **client and server together** | Two synchronized clients, no echo, every Operation goes through `authority.check()` |
| **6** | `editor/`: `px-*` primitives, scoped binding, schema-driven Inspector | **Letter-by-letter editing preserved** |
| **7** | A viewport made of tools | Functional parity with `Handler` |
| **8** | Resources: `Resource`, stable ids, IndexedDB | A project can be reloaded |
| **9** | Visual scripting: the `.px` model, execution (Q7) | A graph drives an object |

Steps 2 and 3 are inseparable. Step 5 requires a migration window coordinated with the private
server. Step 9 is off the critical path.

**What disappeared from the sequence:** any data migration step. There are no v1 projects (Q6),
so no converter, no transition format, no dual reading in `deserialize()`.

---

## 6. Success criterion

At any moment, it must be possible to answer with a pointer into this folder:

1. How Pixel Creator really works → `migration/LEGACY_ANALYSIS.md`
2. Which behaviours matter → `LEGACY_ANALYSIS.md` §15
3. What must be kept / rebuilt / removed / deferred → §2 of this document
4. How client and server share the Core → `architecture/NETWORK.md`
5. How synchronization works → `LEGACY_ANALYSIS.md` §7.1
6. How to make the Editor modular without a framework → `decisions/ADR-0006`
7. How to preserve the API's ergonomics → `decisions/ADR-0003`
8. How to integrate `.px` and `.js` → `decisions/ADR-0009`
9. How Network evolves toward Operations → `decisions/ADR-0008`
10. What the risks are → §3 of this document
