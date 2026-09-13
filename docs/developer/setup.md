# Local setup

## What you need

| | |
|---|---|
| **Node.js 22 or newer** | Only to run the tests and the checks. The engine itself never runs under Node in production |
| **Python 3** | Only for the development web server. Any static server that sets `Cache-Control: no-store` works |
| **A modern browser** | Chrome, Edge, Firefox or Safari |
| **Git** | |

There is **no `npm install`**, because there is no `package.json` and no dependencies. That is
deliberate ([PROJECT.md §7](../PROJECT.md)).

## Clone

```bash
git clone https://github.com/Sharkou/PixelCreator.git
cd PixelCreator
```

## Run the editor

`src/` uses **relative** imports, so it does not matter what the HTTP root is, as long as
`src/` is inside it. From the repository root:

```bash
tools/dev-server.sh 8080 .
```

Then open:

```
http://localhost:8080/src/editor/index.html
```

No build step, no bundler, no watcher. Edit a file, reload the page.

> **Use this server, not `python -m http.server`.** The stock server sends `Last-Modified`
> and no `Cache-Control`, so a browser applies heuristic freshness to ES modules: one module
> comes from cache while another is re-fetched, the two disagree, and the app dies at boot
> with a `SyntaxError` about an export that is present on disk, over the wire and in Node.
> `tools/dev-server.py` answers `no-store` on every response, and `dev-server.sh` is a thin
> wrapper over it.

Note the argument order and the default: `tools/dev-server.sh [port] [root]`, and **root
defaults to `legacy/`**, because Legacy uses absolute imports rooted at its own directory.
For v2 you must pass `.`.

### Other pages worth opening

| Page | What it is |
|---|---|
| `/src/editor/index.html` | The editor |
| `/src/preview/index.html` | The game client. Takes `#p/<id>` (a stored preview) or `#u/<url>` (a hosted bundle) |
| `/tools/demo/index.html` | A minimal hand-written game, without the editor |
| `/tools/demo/platform.html` | A platformer demo |
| `/tools/demo/tiles.html` | A tilemap demo |
| `/legacy/index.html` | The Legacy editor — serve `legacy/` as the root: `tools/dev-server.sh 8080 legacy` |

## Run the tests

```bash
tools/test.sh
```

Node's built-in runner, no configuration, no dependency. It runs every `*.test.js` under
`src/` and `tools/` — around 2 300 tests in under ten seconds.

A subset:

```bash
tools/test.sh src/core/graph/graph.test.js
tools/test.sh "src/editor/**/*.test.js"
```

Full detail, and the other five checks, in [Testing and verification](testing.md). Before
opening a pull request, run all of them:

```bash
tools/test.sh
node tools/layers/run.js
node tools/check-boot.js
node tools/check-exports.js
node tools/check-css-literals.js
node tools/parity/run.js
node tools/check-links.js
```

## Debugging

**Everything is source.** There is no bundle and no source map, so the file in your browser's
debugger is the file on disk. Set breakpoints directly.

| Want to | Do |
|---|---|
| See what the editor refuses, and why | Open the console. The editor reports refusals with a `[prefix]` naming the subsystem |
| Test engine logic | Write a `*.test.js` beside the module and run it under Node — no DOM needed |
| Test something that needs a DOM | Verify it in the browser, proportionally to the change, and note what you checked |
| Understand a rendering or input problem | `src/runtime/rendering/` and `src/runtime/input/` are pure modules with their own tests |
| Profile | `tools/bench-collision.mjs`, `tools/bench-physics.mjs`, `tools/bench-tilemap.mjs` |

Logging conventions are in [development/LOGGING.md](../development/LOGGING.md).

### Browser validation

For any change to UI, interaction, rendering or the runtime, validate in the browser —
proportionally to the size of the change:

1. serve the repository root and open the editor;
2. attach `console` and `pageerror` listeners;
3. exercise **the behaviour directly concerned**;
4. if it works with no relevant errors, stop.

Do not turn a local problem into an architectural refactor.

## Editor conventions that matter while you work

- **Four-space indentation, single quotes, semicolons.**
- **One file, one class, one responsibility.** Shallow folder hierarchies.
- **JSDoc on constructors and public methods**, not on classes.
- A unit test lives beside the module it covers: `x.js` / `x.test.js`.

Full list: [CONVENTIONS.md](../CONVENTIONS.md).

## The private server

The historical Pixel Creator server lives **outside this repository** and is not public.
It must never be copied into the public repository. Its analysis — written from an external
copy, without reproducing code beyond the strict minimum — is in
[architecture/NETWORK.md](../architecture/NETWORK.md).

There is **no networking code in `src/`**. The v2 runtime is built so that a server can share
the core, and nothing more than that is implemented.

## Next

- [Repository structure](repository-structure.md)
- [Architecture overview](architecture.md)
- [Testing and verification](testing.md)
