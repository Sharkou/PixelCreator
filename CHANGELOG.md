# Changelog

All notable changes to Pixel Creator are recorded here.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions use
semantic-style tags (`vMAJOR.MINOR.PATCH`, with `-alpha.N` / `-beta.N` prereleases while v2 is
still evolving). The release process is documented in
[`docs/developer/releases.md`](docs/developer/releases.md).

> **This file starts here, deliberately.** Pixel Creator v2 has had no tagged release yet, and
> the 263 commits that built it are not being retro-fitted into invented release notes. The
> implementation history is recorded where it actually happened: in the git log, in
> [`docs/migration/MIGRATION_STATUS.md`](docs/migration/MIGRATION_STATUS.md), and in the 72
> [Architecture Decision Records](docs/PROJECT_MEMORY.md).

---

## [Unreleased]

Current development. Everything below is on `master` and has **not** been tagged.

### Notes

Pixel Creator v2 is a full rewrite of the engine and editor, replacing the Legacy codebase that
is kept read-only in `legacy/`. It is an **alpha**: the editor works and games run, interfaces
still move between commits, and some panels are deliberate shells that say what is missing.

What exists today is listed in the [README](README.md#what-it-can-do-today) and documented in
the [user guide](docs/user/README.md). In brief: the editor shell and its panels, the
Object/Component model with hierarchical transforms, 15 shipped component types, `.px` visual
scripting with 77 nodes, custom components, resources (scenes, images, sounds, prefabs,
animations, tilesets, folders), tilemap painting and collision, Canvas 2D rendering, physics,
audio, per-document undo/redo, browser persistence with autosave, Play mode, Preview windows
kept live, and export to a `.pxgame.json` bundle.

### Documentation

- `docs/` is now the canonical documentation, with two entry paths: a
  [user guide](docs/user/README.md) and
  [developer documentation](docs/developer/README.md). The GitHub Wiki is no longer the source
  of truth.
- `docs/reference/` is marked as **historical Legacy API reference** and is no longer presented
  as the current API.
- Added `SECURITY.md`, this changelog, a pull-request template, `CODEOWNERS` and a CI workflow.
- `CONTRIBUTING.md` rewritten: contributions now target `master` through a topic branch and a
  pull request. The obsolete `sandbox`-branch workflow is gone.

### Removed from public documentation

Claims that the previous README and contribution guide made, which the current implementation
does not support, and which have been removed rather than softened:

- **multiplayer and built-in networking** — there is no networking code in this repository;
- **real-time collaboration**;
- **automatic state synchronisation**, and the `syncProperty()` / `$x` API it was described
  through — both removed from the engine;
- **MMO / MOBA / `.io` game support** as a current capability;
- **a marketplace**, and marketplace submissions as a contribution route;
- **accounts and publishing to a URL** — the editor says plainly that neither is built.

The architecture is designed so that replication remains possible — every change is an
operation with an authority check, and the simulation is deterministic from a seed — but none of
it is implemented, and the documentation no longer implies otherwise.

---

## How to add to this file

While a change is unreleased, add a bullet under `[Unreleased]` in the right section:

`Added` · `Changed` · `Deprecated` · `Removed` · `Fixed` · `Security`

Write for someone who **uses** Pixel Creator, not for someone reading the diff:

- ✅ "An object turned off in the Hierarchy now also stops running"
- ❌ "Refactored `visibility` out of `hierarchy.js`"

Always record anything that changes a **saved format** — `FORMAT_VERSION`,
`MANIFEST_VERSION`, `GRAPH_VERSION`, `BUNDLE_FORMAT`, `PREFAB_FORMAT`, `TILESET_FORMAT`,
`ANIMATION_FORMAT` — because that is what decides whether an existing project still opens.

Purely internal refactors, test-only changes and documentation typos do not need an entry.
