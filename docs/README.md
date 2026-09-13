# Pixel Creator — Documentation

Pixel Creator is a 2D game editor that runs in a web browser. This folder is the
**canonical documentation** for the project: everything here is versioned with the code, so
a page and the implementation it describes always travel together.

There are two entry paths. Pick the one that matches what you want to do.

---

## 🎮 I want to make a game

**→ [User documentation](user/README.md)**

No programming required. Start with
[Getting started](user/getting-started.md), then the
[Editor layout](user/editor-layout.md).

| | |
|---|---|
| [Getting started](user/getting-started.md) | Open the editor and make something move |
| [Editor layout](user/editor-layout.md) | What every panel and button does |
| [Projects and scenes](user/projects-and-scenes.md) | Where your work is kept |
| [Objects and components](user/objects-and-components.md) | The two ideas everything is built from |
| [Component reference](user/component-reference.md) | Every component the editor ships |
| [Resources and assets](user/resources.md) | Images, sounds, folders, drag and drop |
| [Visual scripting](user/visual-scripting.md) | Behaviour without code, with `.px` graphs |
| [Node reference](user/node-reference.md) | Every node in the graph palette |
| [Tilemaps and tilesets](user/tilemaps.md) | Painting a level |
| [Prefabs](user/prefabs.md) | Reusable objects |
| [Preview and sharing](user/preview-and-sharing.md) | Playing and exporting your game |
| [Keyboard shortcuts](user/shortcuts.md) | The current keymap |
| [Troubleshooting](user/troubleshooting.md) | When something does not work |
| [Concepts and glossary](user/concepts.md) | The vocabulary, in one place |

## 🛠 I want to work on Pixel Creator itself

**→ [Developer documentation](developer/README.md)**

| | |
|---|---|
| [Local setup](developer/setup.md) | Serve the editor, run the tests |
| [Repository structure](developer/repository-structure.md) | What lives where, and why |
| [Architecture overview](developer/architecture.md) | Layers, responsibilities, and where each subject is specified |
| [Extending Pixel Creator](developer/extending.md) | Add a component, a graph node, an editor panel |
| [Testing and verification](developer/testing.md) | The real commands, and what each one protects |
| [Architecture decisions](developer/decisions.md) | What an ADR is, and when you need one |
| [Releases](developer/releases.md) | Versions, tags, and what ships where |
| [Documentation website](developer/documentation-website.md) | How to publish this folder through GitHub Pages |

Contribution workflow lives in [CONTRIBUTING.md](../CONTRIBUTING.md).

---

## Project memory (internal, French)

The project keeps a second, deeper layer of documentation: the architecture specification,
the **72 Architecture Decision Records**, the Legacy analysis and the migration history.
It is written in French, it is addressed to whoever is implementing the engine, and it is
authoritative on design intent.

**→ [Project memory index](PROJECT_MEMORY.md)**

| Document | Subject |
|---|---|
| [PROJECT.md](PROJECT.md) | What Pixel Creator is, its vocabulary, its scope |
| [ARCHITECTURE.md](ARCHITECTURE.md) | The v2 architecture specification |
| [CONVENTIONS.md](CONVENTIONS.md) | Code and documentation rules |
| [decisions/](decisions/) | ADR-0001 … ADR-0072 |
| [architecture/](architecture/) | Per-system detail: Core, Object, Components, Runtime, Editor, Network |
| [development/](development/) | Development, testing and logging notes |
| [migration/](migration/) | Legacy analysis, data-model audits, migration status |
| [archive/](archive/README.md) | Pre-v2 documents, kept for the record |
| [audit/](audit/UX_AUDIT_LEGACY_DESIGN.md) | The UX audit of the Legacy design |
| [reference/](reference/README.md) | **Historical** Legacy API reference — not the v2 API |

## How to read this documentation

- **The code is the source of truth.** Where a document and the implementation disagree,
  the implementation wins and the document is the bug.
- **Current is separated from historical.** `reference/`, `archive/`, `migration/` and
  `audit/` describe the past; they are labelled as such and are never presented as the
  current API.
- **Nothing here is duplicated on purpose.** If a subject is specified in an architecture
  document or an ADR, the pages above link to it instead of restating it.

## Project status

Pixel Creator v2 is **in active development** — an alpha. The editor works and games run,
but interfaces still move between commits, and some panels are deliberately empty shells
that say so rather than faking a feature.
