# Development

## Running the v2 Editor

`src/` uses **relative** imports, so the served root does not matter as long as `src/` is
inside it. From the repository root:

```bash
tools/dev-server.sh 8099 .
```

then `http://localhost:8099/src/editor/index.html`.

The direct equivalent: `python -m http.server 8099`.

No dependencies, no build step: these are ES modules loaded as they are.

## Running Legacy

`legacy/` uses absolute imports (`/src/core/object.js`, `/editor/...`). **It must therefore be
served with `legacy/` as the root**, not with `engine/`.

```bash
cd legacy && python -m http.server 8099
```

then `http://localhost:8099/index.html`.

`tools/dev-server.sh` now serves `legacy/` as its default root (port and root are settable as
arguments), which amounts to the same thing as the command above.

### Debugging objects exposed

`app.js` publishes `window.scene`, `window.project`, `window.loader`. That is the entry point
for inspecting state from the console — and it is how the checks in
`../migration/LEGACY_ANALYSIS.md` were made.

```js
scene.objects                        // every object
scene.current                        // the selected object
scene.getObjectByName('Player')
```

### Online mode

`app.js` contains `const online = false`. Switching it to `true` makes it attempt a connection
to `apps.pixelcreator.io:443` (the private server) and download the project's resources.

**Careful:** offline, the runtime is partly broken (components that read input throw once per
frame — see `../MIGRATION.md` §4.1).

## Repository structure

```
engine/
├── src/         Pixel Creator v2 — core/ project/ runtime/ editor/ preview/
├── docs/        documentation — project memory, user guide, developer docs
├── legacy/      the reference archive, READ-ONLY
├── tools/       development tooling and checks
└── .github/     CI, issue and PR templates, Copilot instructions
```

The full detail, layer by layer, is in
[`../developer/repository-structure.md`](../developer/repository-structure.md).

### `legacy/` is read-only

You may read it, search it, analyse it, compare against it, document it.
You do not refactor it, clean it up, modernize it or delete from it.

Legacy answers "how did Pixel Creator actually work?".
It does not define "how v2 must be implemented".

### `docs/reference/` describes an intended API — and it is Legacy's

**Careful:** those documents do not describe the current code. For example:

- `docs/reference/core/object.md` documents `new Object({ name, x, y })` with an options object,
  while Legacy's real constructor is positional
  `new Object(name, x, y, width, height, layer)` — and v2's differs from both;
- `docs/reference/editor/collab.md` documents a `Collab` module based on Socket.IO, **absent
  from the code**.

Treat them as a source of intent, never as a description of behaviour. Every page now carries a
banner saying so, and [`../reference/README.md`](../reference/README.md) explains where the
current answers are.

## The private server

It lives **outside** this repository:

```
PixelCreator/            (public)
└── legacy/

PixelCreator-private/    (private)
└── legacy-server.js
```

It must **never** be moved or copied into the public repository. Its analysis is in
`../architecture/NETWORK.md`, with no code reproduced beyond the strict minimum.

Technology: Deno, `std@0.117` for WebSocket (an obsolete API), TLS, writing resources to disk.

## Browser validation

For any change to UI, interaction, rendering or the runtime, validate in the browser, in
proportion to the size of the change:

1. serve `legacy/` (or v2, as the case may be);
2. attach `console` and `pageerror` listeners;
3. test **the behaviour directly concerned**;
4. if it works with no relevant error, stop.

Do not turn a local problem into an architectural overhaul.

## Before implementing v2

The architecture decisions are **accepted** (`../ARCHITECTURE.md` §10).

The sequence is in `../MIGRATION.md` §5. **Step 1 is the tooling and the parity harness — before
any code migration.** Risk R1 (a silent Property System breakage) is detectable in no other way.
