# Testing and verification

Seven checks, no dependencies, all of them fast. Run every one before opening a pull request;
CI runs the same seven.

```bash
tools/test.sh                    # ~2300 unit tests, Node's built-in runner
node tools/layers/run.js         # layer rules + dead imports
node tools/check-boot.js         # every module the entry points reach loads
node tools/check-exports.js      # every named import designates a real export
node tools/check-css-literals.js # no stray backtick in a CSS literal
node tools/parity/run.js         # 39 scenarios captured from Legacy
node tools/check-links.js        # every relative Markdown link resolves
```

The whole set takes well under a minute on a laptop.

## The unit tests

```bash
tools/test.sh                          # everything
tools/test.sh src/core/scene.test.js   # one file
tools/test.sh "src/editor/**/*.test.js"  # a subtree
```

`tools/test.sh` is a short shell script over `node --test`. No framework, no configuration,
no dependency. Requires **Node 22 or newer** (glob patterns in `node --test`).

The count is there to give an order of magnitude, not as a target. What matters is what the
tests protect.

### Conventions

- **A test lives beside the module it covers**: `x.js` next to `x.test.js`.
- **A unit test needs neither a DOM nor a browser.** This is a design constraint, not a
  convenience: it is the same property that lets the core and the runtime load on a server.
- **What needs a DOM is made pure where it can be.** The geometry of a Hierarchy drop lives in
  `editor/windows/drop.js` for exactly this reason, and the graph canvas's arithmetic lives in
  `editor/graph/view.js`. The part worth testing is extracted; the part that draws is verified
  in the browser.
- Use `node:test` and `node:assert/strict`. Assertion messages are sentences — read a few
  existing tests before writing yours.

### What the suite protects, in priority order

The list comes from the migration's risk analysis
([development/TESTING.md](../development/TESTING.md)), and it is worth knowing which of these
your change is near:

1. **The Property System.** `object.x = v` emits a `Change` and **no** Operation;
   `setProperty()` emits both; a property added after construction is reactive; an operation
   with `origin: 'network'` produces no outgoing operation; hierarchical propagation moves
   children; internal layers are exposed by no public API.
2. **Layer direction**, statically (see below).
3. **The core loads outside a browser** — the single most valuable property the project has.
4. **Transform / façade identity** — `object.x === object.getComponent('Transform').x` after a
   write from any origin.
5. **Serialization** — round trip without loss, children referenced and never nested twice,
   payload size guarded.
6. **Components** — `update`/`draw` only when active, `draw` never on a server, a throwing
   component does not stop the loop, a component without a schema still renders.
7. **The editor's letter-by-letter editing** — typing `P`, `Pl`, `Pla`, `Play` in a field
   updates every other view **except** the focused one.

## Layers, and dead imports

```bash
node tools/layers/run.js
```

Two checks in one, and both have cost the project time before they existed:

- **Direction.** The forbidden edges are declared in `tools/layers/rules.js`, each with the
  reasoning attached. `core/` reaches nothing; `editor/` and `preview/` never reach each other.
- **Dangling imports.** Every static import must designate a file that exists. This was added
  after an `export … from './windows/dock.js'` survived two commits past the deletion of the
  file — `editor/mod.js` was unloadable and no unit test could see it.

A violation that genuinely cannot be fixed — `legacy/` is read-only and has one — is declared
in `rules.js`, reported on every run, and does not fail the check. A declared violation that
no longer exists is reported as **stale**, so the declaration cannot outlive the problem.

## Boot

```bash
node tools/check-boot.js
```

Walks every module reachable from the entry points and loads it. This catches the class of
failure a unit test cannot: a module that is syntactically fine and individually testable but
cannot be loaded as part of the application.

## Exports

```bash
node tools/check-exports.js
```

Every named import designates an export that exists. The barrels (`mod.js`) are where a
collision of names becomes a collision of exports, and this is what notices.

## CSS literals

```bash
node tools/check-css-literals.js
```

Styles are template literals inside JavaScript. A stray backtick silently truncates a
stylesheet — the page still loads, and half the rules are simply missing. This scans every
file that holds one.

## Parity

```bash
node tools/parity/run.js
```

**39 scenarios captured from the Legacy engine**, replayed against v2, comparing the sequence
of emitted events — order included.

It exists because of one risk nothing else can detect: **nothing would tell you that a
property had stopped propagating.** Legacy has no tests at all, so for behaviour that is hard
to specify, the reference is Legacy's observed behaviour.

Each scenario is labelled with what it is:

| Label | Meaning |
|---|---|
| `contract` | Behaviour v2 must keep |
| `quirk` | Legacy behaviour that v2 deliberately does not reproduce |
| `legacy bug` | A defect, recorded so nobody reintroduces it |

The harness encodes a **semantic mapping** between the two APIs — Legacy's `$x` and
`syncProperty()` map to v2's `setProperty()`, Legacy's own `setProperty()` has no v2
equivalent. Without that mapping it would report false regressions. See
`tools/parity/README.md`.

It reads `legacy/`, which is in the repository, so it runs anywhere the repository is checked
out.

## Documentation links

```bash
node tools/check-links.js
node tools/check-links.js docs/user   # a subtree, or a single file
```

Every relative Markdown link in the repository must resolve to a file that exists. A document
that is moved or renamed leaves every link to it still rendering as a link, and GitHub reports
nothing — the reader gets a 404 and the author never finds out.

It resolves paths the way GitHub does when browsing the repository, which is also how a
branch-based Pages deployment serves them, so one check covers both renderings.

It deliberately does **not** fetch `http(s)` links — a verification tool that makes the build
depend on somebody else's uptime is a tool people learn to ignore — and does not check `#`
anchors, because GitHub's heading-to-anchor rules are its own and reimplementing them would
produce failures nobody could act on. Links inside fenced code blocks are illustration rather
than navigation, and are skipped. `legacy/` is skipped: it is a read-only archive.

## Benchmarks

```bash
node tools/bench-collision.mjs
node tools/bench-physics.mjs
node tools/bench-tilemap.mjs
```

**Not in CI**, deliberately: they have no wired thresholds, and a benchmark that fails a build
on a noisy runner teaches people to ignore the build. Run them by hand when you touch
collision, physics or tilemaps.

The policy is
[ADR-0064](../decisions/ADR-0064-measure-before-optimising-refuse-before-running.md): measure
before optimising.

## Browser validation

Some things genuinely need a browser: layout, focus, pointer gestures, rendering, Shadow DOM,
IndexedDB. For any change to UI, interaction, rendering or the runtime:

1. serve the repository root — `tools/dev-server.sh 8080 .`;
2. open the editor and attach `console` / `pageerror` listeners;
3. exercise **the behaviour directly concerned**;
4. if it works with no relevant errors, stop.

Keep it proportional to the change. Say in your pull request what you checked in the browser —
that is the part a reviewer cannot re-derive.

## What is not tested, on purpose

| | Why |
|---|---|
| Pixel-by-pixel rendering | Too fragile for the value it would add |
| The appearance of the UI | Same |
| The private server | It is not in this repository |

## CI

`.github/workflows/ci.yml` runs the seven checks above on pull requests and on pushes to the
default branch, with the unit tests on Node 22 and Node 24. It installs nothing, because there is nothing to
install.

If CI fails and you cannot reproduce it locally, check your Node version first.
