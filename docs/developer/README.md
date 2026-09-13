# Pixel Creator — Developer documentation

For anyone who wants to read, modify or contribute to Pixel Creator itself.

Pixel Creator is plain JavaScript — ES modules, no build step, no framework, no runtime
dependencies. You serve the directory and open a page. Tests run on Node's built-in runner.

## Start here

1. **[Local setup](setup.md)** — serve the editor, run the tests, debug it.
2. **[Repository structure](repository-structure.md)** — what lives where, and why.
3. **[Architecture overview](architecture.md)** — the layers, their responsibilities, and
   where each subject is specified.

Then, when you are about to change something:

| Page | Subject |
|---|---|
| [Extending Pixel Creator](extending.md) | Add a component, a graph node, a resource kind, an editor panel |
| [Testing and verification](testing.md) | Every check the repository runs, and what each one protects |
| [Architecture decisions](decisions.md) | What an ADR is, when you need one, how to write one |
| [Releases](releases.md) | Versions, tags, and what ships where |
| [Documentation website](documentation-website.md) | Publishing `docs/` through GitHub Pages |

The contribution workflow — branches, commits, pull requests — is in
[CONTRIBUTING.md](../../CONTRIBUTING.md).

## The authoritative specifications

The pages above are **navigation and how-to**. The architecture itself is specified in the
project's own documents, and those are authoritative. Like everything else in this
repository, they are written in English.

| Document | Subject |
|---|---|
| [PROJECT.md](../PROJECT.md) | What Pixel Creator is, its vocabulary, its non-negotiable constraints |
| [ARCHITECTURE.md](../ARCHITECTURE.md) | The v2 architecture specification, section by section |
| [CONVENTIONS.md](../CONVENTIONS.md) | Code and documentation rules. **Read this before your first pull request** |
| [architecture/CORE.md](../architecture/CORE.md) | The shared layer, the Property System, events |
| [architecture/OBJECT.md](../architecture/OBJECT.md) | `Object` and its hierarchy |
| [architecture/COMPONENTS.md](../architecture/COMPONENTS.md) | The component contract and inventory |
| [architecture/RUNTIME.md](../architecture/RUNTIME.md) | The loop, rendering, domain modules |
| [architecture/EDITOR.md](../architecture/EDITOR.md) | Editor modularity and UI |
| [architecture/NETWORK.md](../architecture/NETWORK.md) | Protocol and server analysis — **describes the private Legacy server, not v2 code** |
| [decisions/](../decisions/) | ADR-0001 … ADR-0072. Each records a decision that was *taken* |
| [PROJECT_MEMORY.md](../PROJECT_MEMORY.md) | The index of all of the above, including the complete ADR register |

## Historical material — do not read as current

| Path | What it is |
|---|---|
| [reference/](../reference/README.md) | API reference pages from the Legacy engine. **Not the v2 API** |
| [archive/](../archive/README.md) | Pre-v2 documents, with the list of claims the code contradicts |
| [migration/](../migration/) | Legacy analysis, data-model audits, and the migration status log |
| [audit/](../audit/UX_AUDIT_LEGACY_DESIGN.md) | The UX audit of the Legacy design |
| `legacy/` (in the repo) | The Legacy engine itself — **read-only**, kept as a behavioural reference |

## The rules that will bite you first

Four constraints are not stylistic preferences. They are checked, and a pull request that
breaks one will fail:

1. **Layer direction.** `editor/` and `preview/` are the two tops of the graph; they may both
   reach `project/`, `runtime/` and `core/`, and **neither may reach the other**. `core/`
   imports nothing — no DOM, no runtime, no editor, not even the project layer.
   `node tools/layers/run.js` enforces the whole table. See
   [Architecture overview](architecture.md#the-layers).
2. **No dependencies, no build step.** No npm packages, no `package.json`, no transpilation,
   no framework. Native ES modules, Web Components, DOM, classes.
3. **`Object` shadows the global.** A module that imports our `Object` reaches the real global
   through `globalThis.Object`. The same applies to `Element`, `Window` and `Viewport` in the
   editor. See [CONVENTIONS.md](../CONVENTIONS.md).
4. **Two ways of writing a property, and they are not interchangeable.** `object.x = v` is a
   simulation result; `object.setProperty('x', v)` is an intention that produces an
   **Operation**. A component never calls `setProperty()`; the editor never writes without it.
   [CONVENTIONS.md](../CONVENTIONS.md) explains the failure mode in detail — getting this
   wrong produces a change that does not replicate and does not undo, silently.

And one about documentation: **the code is the source of truth.** Where a document and the
implementation disagree, report the discrepancy rather than quietly changing one to match the
other.

## `legacy/` is read-only

`legacy/` is the previous engine, kept because it answers *"how did Pixel Creator actually
behave?"*. You may read it, search it, and compare against it. Do not refactor it, tidy it,
modernise it or delete from it. Its behaviour is captured by the
[parity harness](testing.md#parity) instead.

It does not define how v2 should be implemented.
