# Archived documents

These documents predate Phase 0. They are **kept as sources of intent**, not as descriptions of
what the code does.

Several of their claims are **contradicted by the code** — which is what motivated the labelling
rule OBSERVED / HISTORICAL DECISION / V2 PROPOSAL / OPEN QUESTION (see `../CONVENTIONS.md`).

| Claim | Verified reality |
|---|---|
| "The editor never mutates engine state directly" | The Editor writes `scene.current.$x = …` directly (`editor/system/handler.js`) |
| "Local update: `obj.setProperty('x', 100)` / Network: `obj.syncProperty(...)`" | Those methods exist, but the Editor actually uses the `$prop` accessor |
| "No component-to-component coupling" | `Animator` drives `Animation`; `Controller` calls `self.translate()`, which calls `components.collider.update()` |
| "If something is visible, it owns a renderer component" | `Object.select()` and `Object.preview()` draw from the Core, outside any component |

| File | Replaced by |
|---|---|
| `project-vision.md` | `../PROJECT.md` |
| `architecture.md` | `../ARCHITECTURE.md` + `../architecture/*.md` |
| `coding-guidelines.md` | `../CONVENTIONS.md` |
| `documentation.md` | split between `../PROJECT.md` and `../CONVENTIONS.md` |

Nothing has been lost: these files stay readable here and in the git history.
