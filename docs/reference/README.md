# Legacy API reference — historical

> ## ⚠ This folder does not describe Pixel Creator v2.
>
> These 45 pages are the API reference of the **Legacy** engine, kept for the record. They are
> **not** the current API, and several of them do not match any code that has ever shipped.
>
> **Current documentation:** [user guide](../user/README.md) ·
> [developer documentation](../developer/README.md)

## Why it is kept

It records what the previous engine's API was *intended* to look like, which is useful when
reading `legacy/` or when working out why a v2 decision was taken the way it was. Deleting it
would throw away that context.

## Why it must not be read as current

The problems are not cosmetic. Two examples, both verified against the code:

- `core/object.md` documents `new Object({ name, x, y })` — an options object. The real Legacy
  constructor is positional, `new Object(name, x, y, width, height, layer)`. **The v2
  constructor is different again**: `new Object(name, { id, tag, layer, owner })`, and position
  is not on the object at all — it is the `Transform` component.
- `editor/collab.md` documents a `Collab` module built on Socket.IO. **That module does not
  exist**, in Legacy or in v2. There is no collaboration code and no Socket.IO anywhere in the
  repository.

More broadly, the pages describe modules organised as `src/graphics/`, `src/physics/`,
`src/input/`, `src/network/`, `src/anim/`, `src/time/`, `editor/system/` — a layout v2 does not
have. Components named here (`Texture`, `Circle`, `Light`, `Animator`, `Controller`, `Gamepad`,
`Store`, `Timeline`, `Compiler`) are **not** v2 component types; the fifteen that exist are
listed in the [component reference](../user/component-reference.md).

## Where the current answers are

| Looking for | Go to |
|---|---|
| What a component does, and every field it has | [Component reference](../user/component-reference.md) |
| What a graph node does | [Node reference](../user/node-reference.md) |
| The `Object` / `Component` model | [Architecture overview](../developer/architecture.md), [architecture/OBJECT.md](../architecture/OBJECT.md) |
| The Property System | [architecture/CORE.md](../architecture/CORE.md), [ADR-0003](../decisions/ADR-0003-property-system.md) |
| Rendering, input, physics, audio | [architecture/RUNTIME.md](../architecture/RUNTIME.md) |
| The editor | [architecture/EDITOR.md](../architecture/EDITOR.md) |
| The public module surface | `src/core/mod.js`, `src/runtime/mod.js`, `src/editor/mod.js`, `src/project/mod.js` |

**For v2, the barrels are the reference.** `mod.js` in each layer lists exactly what that layer
exports, with a comment on each entry explaining why it is public — and unlike a hand-written
page, it cannot drift from the code: `node tools/check-exports.js` fails when it does.

## Other historical material

- [`../archive/`](../archive/README.md) — pre-v2 project documents, with the list of their
  claims the code contradicts.
- [`../migration/`](../migration/) — the Legacy analysis and the data-model audits.
- `legacy/` — the Legacy engine itself. Read-only.
