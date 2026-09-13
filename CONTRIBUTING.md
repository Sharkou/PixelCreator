# Contributing to Pixel Creator

Thank you for wanting to help. Bug fixes, editor UX, new components, new graph nodes,
documentation and demos are all welcome.

**Before your first pull request, read two things:**

1. [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md) — the code and documentation rules. They are
   short, specific, and a few of them are checked automatically.
2. [`docs/developer/README.md`](docs/developer/README.md) — the developer documentation index,
   including the four rules that catch newcomers first.

> **A note on licensing.** Pixel Creator uses a **custom licence**
> ([LICENSE.md](LICENSE.md)), not an OSI open-source licence. By contributing you agree that
> your contribution is licensed under those same terms. The server is private and is not in
> this repository; contributions must not attempt to reproduce or replace it.

---

## Getting set up

```bash
git clone https://github.com/Sharkou/PixelCreator.git
cd PixelCreator
```

There is **nothing to install**. No `package.json`, no dependencies, no build step.

```bash
tools/dev-server.sh 8080 .
# then open http://localhost:8080/src/editor/index.html
```

You need **Node 22 or newer** to run the tests, and **Python 3** for that development server.
Full detail: [`docs/developer/setup.md`](docs/developer/setup.md).

## Verification — run this before every pull request

```bash
tools/test.sh                     # ~2300 unit tests (Node's built-in runner)
node tools/layers/run.js          # layer rules + dead imports
node tools/check-boot.js          # every module the entry points reach loads
node tools/check-exports.js       # every named import designates a real export
node tools/check-css-literals.js  # no stray backtick in a CSS literal
node tools/parity/run.js          # 39 scenarios captured from the Legacy engine
node tools/check-links.js         # every relative Markdown link resolves
```

The whole set runs in well under a minute. CI runs exactly these seven.

A subset while you work:

```bash
tools/test.sh src/core/scene.test.js
tools/test.sh "src/editor/**/*.test.js"
```

What each check protects, and why it exists:
[`docs/developer/testing.md`](docs/developer/testing.md).

### If your change is visible

Anything touching UI, interaction, rendering or the runtime also needs **browser validation**,
proportional to the change: serve the repository, open the editor, attach `console` and
`pageerror` listeners, exercise the behaviour directly concerned, and stop when it works.

Say in your pull request what you checked in the browser. That is the part a reviewer cannot
re-derive from the diff.

---

## The workflow

The default branch is **`master`**. Everything starts from it and everything comes back to it
through a pull request.

```
master  ──►  topic branch  ──►  verification  ──►  Pull Request  ──►  master
```

### If you are an external contributor

1. **Fork** the repository on GitHub.
2. **Branch** from `master`:
   ```bash
   git switch master
   git pull
   git switch -c feat/particle-burst-node
   ```
3. Make your change, with focused commits.
4. **Run the verification suite** above.
5. **Push** to your fork and open a **pull request against `Sharkou/PixelCreator:master`**.

### If you have write access

The same, without the fork: branch from `master`, push the branch to `origin`, open a pull
request into `master`. Do not commit directly to `master`.

### Branch names

| Prefix | For |
|---|---|
| `feat/…` | A new capability |
| `fix/…` | A defect |
| `docs/…` | Documentation only |
| `refactor/…` | Structure, with no behaviour change |
| `test/…` | Tests or tooling only |

Then a short kebab-case description: `fix/inspector-slider-rounding`.

> **Do not target `sandbox`.** An earlier version of this guide asked contributors to base
> their work on a permanent `sandbox` branch. That branch is **obsolete**: it is 145 commits
> behind `master`, holds nothing `master` does not, and was last touched in March 2026. Work
> from `master`. The old `reference` branch is historical too, and the documentation that lived
> on it now lives in [`docs/`](docs/README.md).

### Commits

Match the existing history, which is conventional-commit style with an optional scope:

```
feat(tilemap): add paintable levels and collision-aware tiles
fix(editor): restore reliable undo and compact tilemap history
refactor(editor): consolidate workflows, duplication and legacy cleanup
docs: document the resource inspector
```

| Prefix | For |
|---|---|
| `feat:` | New behaviour |
| `fix:` | A defect |
| `refactor:` | No behaviour change |
| `docs:` | Documentation |
| `test:` | Tests and tooling |

- **English**, imperative, lower case after the colon, no trailing full stop.
- A scope in parentheses when one is obvious: `core`, `runtime`, `editor`, `graph`, `inspector`,
  `tilemap`, `transform`, `physics`, `project`.
- Prefer a handful of meaningful commits over either one giant commit or forty
  "wip" ones. Nothing is squashed automatically, so what you push is what the history keeps.

That is the whole convention. No commit-message linter, no sign-off requirement, no ticket
prefix.

### Pull requests

Smaller and focused reviews faster. [The template](.github/PULL_REQUEST_TEMPLATE.md) asks for
what a reviewer actually needs:

- what changed and why;
- which checks you ran;
- what you validated in the browser, if anything;
- whether an ADR is involved.

A pull request that fails CI will not be reviewed until it is green.

---

## Conventions that will be checked

The full list is in [`docs/CONVENTIONS.md`](docs/CONVENTIONS.md). The four that trip people up:

1. **Layer direction.** `editor/` and `preview/` are the two tops of the graph, they may each
   reach `project/`, `runtime/` and `core/`, and **neither may reach the other**. `core/` imports
   nothing at all — no DOM, no runtime, no editor, not even `project/`.
   `node tools/layers/run.js` enforces it.
2. **No dependencies, no build step.** No npm packages, no `package.json`, no transpilation, no
   framework. Native ES modules, Web Components, DOM, classes. This is a project constraint, not
   an accident ([`docs/PROJECT.md`](docs/PROJECT.md) §7).
3. **`Object` shadows the global.** A module that imports our `Object` reaches the real global
   through `globalThis.Object`. Same for `Element`, `Window` and `Viewport` in the editor.
4. **Two ways of writing a property, and they are not interchangeable.** `object.x = v` is a
   simulation result; `object.setProperty('x', v)` is an intention and produces an Operation. A
   component never calls `setProperty()`; the editor never writes without it. Getting this wrong
   produces a change that does not replicate and does not undo — silently.

Style, briefly: 4-space indent, single quotes, semicolons, `camelCase` / `PascalCase`, lowercase
filenames, one file = one class = one responsibility, JSDoc on constructors and public methods
(not on classes), English throughout the code.

A unit test lives beside the module it covers: `x.js` / `x.test.js`.

## Architectural changes need an ADR

Pixel Creator keeps [72 Architecture Decision Records](docs/PROJECT_MEMORY.md). They are why the
codebase is coherent, and they are authoritative.

**Do not reverse, weaken or replace a documented decision because another design looks more
conventional.** If your change would do that — or would introduce a new structural concept, or
change a contract other code relies on — it needs an ADR. Open an issue and discuss it *before*
writing the code.

How to write one: [`docs/developer/decisions.md`](docs/developer/decisions.md).

Most contributions need no ADR at all. A new component, a new graph node, a new editor panel or a
bug fix all sit comfortably inside the existing decisions.

## Two areas that are off limits

- **`legacy/` is read-only.** It is the previous engine, kept because it answers *"how did Pixel
  Creator actually behave?"*. Read it, search it, compare against it — never refactor, tidy,
  modernise or delete from it. Never commit into it.
- **The server is private.** It is not in this repository and must never be copied into it.
  Contributions must not reverse-engineer it or replicate its functionality outside the official
  hosted system.

## What to work on

- **Bugs**: [open issues](https://github.com/Sharkou/PixelCreator/issues).
- **Components and graph nodes**: the recipes are in
  [`docs/developer/extending.md`](docs/developer/extending.md) — this is the easiest place to
  make a real difference.
- **Editor UX**: plenty of rough edges. Read
  [`docs/architecture/EDITOR.md`](docs/architecture/EDITOR.md) first.
- **Documentation**: [`docs/user/`](docs/user/README.md) especially. If something confused you,
  that is the thing to fix.
- **Demos**: `tools/demo/` holds small hand-written games that use the engine without the editor.

One principle across all of it: **never document or ship a feature that does not exist.** An
empty panel that says what is missing is better than a fake one; a refusal that explains itself
is better than a silent no-op. The codebase is consistent about this and pull requests are
reviewed for it.

## Reporting problems

| | |
|---|---|
| 🐛 [Bug report](https://github.com/Sharkou/PixelCreator/issues/new?template=bug_report.md) | Include browser, OS, and steps to reproduce |
| 💡 [Feature request](https://github.com/Sharkou/PixelCreator/issues/new?template=feature_request.md) | The problem first, then your proposed solution |
| 📝 [Documentation](https://github.com/Sharkou/PixelCreator/issues/new?template=documentation.md) | Which page, and what was wrong |
| 🔒 **Security** | **Do not open a public issue.** See [SECURITY.md](SECURITY.md) |

Search existing issues first.

## Community

Be respectful and constructive. Keep discussion on the project. Anyone acting otherwise may have
their contributions or access revoked, at the maintainer's discretion.

Questions: [Discord](https://discord.gg/X8scDNX), or an issue labelled `help wanted`.
For licensing or commercial enquiries: <contact@pixelcreator.io>.

---

## Repository settings (maintainers)

These cannot be configured from files in the repository, and are listed here so they are not
forgotten:

- **Branch protection / ruleset on `master`** — require a pull request, require the `ci` checks
  to pass, and disallow force pushes.
- **Required status checks** — select the CI jobs once the workflow has run at least once.
- **About panel** — description, website (`https://editor.pixelcreator.io`), and topics.
- **GitHub Pages** — see
  [`docs/developer/documentation-website.md`](docs/developer/documentation-website.md).
- **Wiki** — point its front page at [`docs/`](docs/README.md); it is no longer the source of
  truth.
- **Stale branches** — `sandbox`, `reference` and `copilot/add-editor-documentation` are all
  superseded by `master` and can be archived or deleted.
- **Releases** — see [`docs/developer/releases.md`](docs/developer/releases.md).

Thank you, and enjoy taking part in this adventure.
