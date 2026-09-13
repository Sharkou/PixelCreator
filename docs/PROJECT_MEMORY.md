# Project memory — Pixel Creator

The project's persistent memory. Concise, structured, and always explicit about the nature
of what it asserts.

> **This document is the internal memory, not the front door.** The public documentation —
> user guide and developer documentation — starts from [`README.md`](README.md), which also
> links back here. This file was called `docs/README.md` until `docs/` grew its two entry
> paths; **the ADR table below remains the complete, authoritative list.**

## Read first

| Order | Document | Contents |
|---|---|---|
| 1 | [PROJECT.md](PROJECT.md) | What Pixel Creator is, vocabulary, scope |
| 2 | [ARCHITECTURE.md](ARCHITECTURE.md) | The v2 architecture + **the decision register** |
| 3 | [MIGRATION.md](MIGRATION.md) | Legacy/v2 comparison, risks, sequence |
| 4 | [CONVENTIONS.md](CONVENTIONS.md) | Code and documentation rules |

## Understanding what exists

- [migration/LEGACY_ANALYSIS.md](migration/LEGACY_ANALYSIS.md) — **the reference document**:
  Legacy's real behaviour, verified by running it
- [migration/MIGRATION_STATUS.md](migration/MIGRATION_STATUS.md) — where the project stands

## By system

| Document | Subject |
|---|---|
| [architecture/CORE.md](architecture/CORE.md) | Shared layer, Property System, events |
| [architecture/OBJECT.md](architecture/OBJECT.md) | `Object` and its hierarchy |
| [architecture/COMPONENTS.md](architecture/COMPONENTS.md) | Contract, inventory, client/server |
| [architecture/RUNTIME.md](architecture/RUNTIME.md) | Loop, rendering, domain modules |
| [architecture/EDITOR.md](architecture/EDITOR.md) | Real-time synchronization, UI modularity |
| [architecture/NETWORK.md](architecture/NETWORK.md) | Protocol, server, shared Core |

## Decisions

**ADR = Architecture Decision Record.** An ADR records a decision that has been **made**,
dated and accepted: it is authoritative. A proposal that has not been settled is never an
ADR — the audit documents further down are proposals, and what they proposed has since been
settled here.

| ADR | Decision |
|---|---|
| [0001](decisions/ADR-0001-object-stays-object.md) | `Object` stays `Object` |
| [0002](decisions/ADR-0002-transform-component.md) | Transform becomes a Component, `object.x` stays a façade |
| [0003](decisions/ADR-0003-property-system.md) | Property System: a Proxy, and two replicated-mutation APIs |
| [0004](decisions/ADR-0004-component-lifecycle.md) | `update()` / `draw()` are kept |
| [0005](decisions/ADR-0005-runtime-modules-not-systems.md) | The Runtime is organized by domain modules, not by "Systems" |
| [0006](decisions/ADR-0006-editor-web-components.md) | A modular Editor built on native Web Components |
| [0007](decisions/ADR-0007-inspector-schema.md) | A schema-driven Inspector, reflective as a fallback |
| [0008](decisions/ADR-0008-operations.md) | Formalize mutations as Operations |
| [0009](decisions/ADR-0009-px-and-js.md) | `.px` is a graph, `.js` is JavaScript |
| [0010](decisions/ADR-0010-game-identity.md) | A game's identity is an ID, not its name |
| [0011](decisions/ADR-0011-authority.md) | The server is the authority, the Editor emits authorized operations |
| [0012](decisions/ADR-0012-runtime-error-isolation.md) | The Runtime isolates and reports errors, it does not modify the model |
| [0013](decisions/ADR-0013-camera-and-viewport.md) | The camera is an Object, the viewport is the screen |
| [0014](decisions/ADR-0014-input-passed-in.md) | Input is abstract, indexed by owner, and passed into the runtime |
| [0015](decisions/ADR-0015-component-graph-behavior.md) | A Component may have a `.px` graph that defines its behaviour |
| [0016](decisions/ADR-0016-component-definition.md) | A definition describes a Component type: properties + graph |
| [0017](decisions/ADR-0017-editor-selection.md) | Selection and picking belong to the Editor |
| [0018](decisions/ADR-0018-structural-order.md) | Structural order is meaningful, persistent, and serialized as such |
| [0019](decisions/ADR-0019-structural-operations.md) | Structural Operations, `invert()`, and a unified `REPARENT` |
| [0020](decisions/ADR-0020-resources.md) | `Resource`, `ResourceId`, `ResourceStore`, and the `src/project/` layer |
| [0021](decisions/ADR-0021-component-identity.md) | A Component definition's identity is distinct from its display name |
| [0022](decisions/ADR-0022-reparent-transform.md) | Reparenting preserves the world, and that policy belongs to the Editor |
| [0023](decisions/ADR-0023-property-types.md) | `PropertyType` belongs to the Core, `FieldKind` is derived from it in the Editor |
| [0024](decisions/ADR-0024-undo-redo.md) | Undo/Redo: `invert()` in the Core, `History` in the Editor, one stack per resource |
| [0025](decisions/ADR-0025-folders-and-resource-inspection.md) | A folder is a `Resource`, the hierarchy is a `parent` link, and the Inspector inspects resources |
| [0026](decisions/ADR-0026-drag-and-drop-and-px.md) | Drag and drop is a cross-cutting capability, `.px` is a single resource, and `active` is the only liveness state |
| [0027](decisions/ADR-0027-graph-model-and-interpreter.md) | The `.px` graph model, its user properties, and its interpreter |
| [0028](decisions/ADR-0028-drag-feedback-and-editor-surfaces.md) | Live reflow belongs to flat lists, never to the tree; the Graph stays inside the stage |
| [0029](decisions/ADR-0029-transport-and-play-mode.md) | Play works on the live scene, Stop restores a snapshot, and history stops at the door |
| [0030](decisions/ADR-0030-references-ranks-and-relevance.md) | A reference is chosen, a rank is two operations, a search is scored, and a palette answers two questions |
| [0031](decisions/ADR-0031-authored-values-and-schema-change.md) | An authored value lives on the instance, a declaration lives on the type, and changing the type does not destroy what a creator wrote |
| [0032](decisions/ADR-0032-selection-intent.md) | There is a single subject, and a selection intent is announced instead of propagated |
| [0033](decisions/ADR-0033-node-rows-and-wire-gestures.md) | A node is a sequence of rows, a wire is drawn without being aimed at, and a colour says what flows |
| [0034](decisions/ADR-0034-object-references-in-the-graph.md) | A graph reaches other Objects through a handle, never through a scene identity |
| [0035](decisions/ADR-0035-runtime-step-order.md) | The execution order of `Runtime.step()` |
| [0036](decisions/ADR-0036-objectref-boundary.md) | The `objectref` ↔ `object` boundary translates the value, not just the type |
| [0037](decisions/ADR-0037-a-drop-declares-and-configures.md) | A drop declares, configures, and never guesses |
| [0038](decisions/ADR-0038-pointer-in-two-spaces.md) | The pointer exists in two spaces, and it is the viewport that fills in the second |
| [0039](decisions/ADR-0039-taxonomy-and-the-scope-of-a-reference.md) | A target you designate is a parameter; a category says what a node IS; an identity enters according to its SCOPE |
| [0040](decisions/ADR-0040-one-node-per-intention.md) | One node per intention: the Component is filed, the target is designated, the name does not move |
| [0041](decisions/ADR-0041-events-are-moments-and-a-property-carries-its-path.md) | An event is a moment, a state is a question, and a property carries its path |
| [0042](decisions/ADR-0042-preview-is-a-runtime-client-addressed-by-id.md) | A Preview is a runtime client, addressed by an identifier |
| [0043](decisions/ADR-0043-the-object-answers-for-itself-and-a-drop-finishes-its-sentence.md) | The Object answers for itself, a drop finishes its sentence, and one intention is worth one node |
| [0044](decisions/ADR-0044-one-folder-one-identity-and-a-live-channel.md) | One folder, one identity, and a live channel |
| [0045](decisions/ADR-0045-two-questions-two-rows-and-a-shelf-for-moving.md) | Two questions, two rows, and a shelf for moving |
| [0046](decisions/ADR-0046-one-gesture-one-model-and-two-widths.md) | One gesture, one model, and two widths |
| [0047](decisions/ADR-0047-one-question-and-a-facing.md) | One question, and a facing |
| [0048](decisions/ADR-0048-a-property-is-named-the-way-it-is-read.md) | A property is named the way it is read |
| [0049](decisions/ADR-0049-an-identifier-is-read-aloud.md) | An identifier is read aloud |
| [0050](decisions/ADR-0050-turning-out-of-the-plane.md) | Turning out of the plane |
| [0051](decisions/ADR-0051-rotation-is-a-pair.md) | Rotation is a pair |
| [0052](decisions/ADR-0052-a-drop-may-ask-a-question.md) | A drop may ask a question |
| [0053](decisions/ADR-0053-one-path-one-decoder.md) | One path, one decoder |
| [0054](decisions/ADR-0054-say-what-is-true.md) | Say what is true |
| [0055](decisions/ADR-0055-two-widths-and-one-grid.md) | Two widths, one grid |
| [0056](decisions/ADR-0056-a-copy-is-the-model.md) | A copy is the model, and a simulation step decides when |
| [0057](decisions/ADR-0057-one-seed-and-two-streams.md) | One seed, two streams, and an editing identity is not a simulation identity |
| [0058](decisions/ADR-0058-an-execution-may-outlive-a-step.md) | An execution may outlive the step that began it |
| [0059](decisions/ADR-0059-touching-is-simulation-not-drawing.md) | Touching is a fact of simulation, not a picture |
| [0060](decisions/ADR-0060-a-second-space-and-a-second-output.md) | A second drawing space, and a second output |
| [0061](decisions/ADR-0061-a-prefab-is-a-resource-resolved-before-the-simulation.md) | A prefab is a Resource, resolved **before** the simulation |
| [0062](decisions/ADR-0062-one-table-of-resolved-resources.md) | One table of resolved resources, and the backend answers for pixels |
| [0063](decisions/ADR-0063-a-step-asks-and-the-application-answers.md) | A step asks, the application answers |
| [0064](decisions/ADR-0064-measure-before-optimising-refuse-before-running.md) | Measure before optimising, refuse before running |
| [0065](decisions/ADR-0065-a-project-outlives-the-tab.md) | A project outlives the tab |
| [0066](decisions/ADR-0066-a-game-is-a-file-before-it-is-a-url.md) | A game is a file before it is a URL |
| [0067](decisions/ADR-0067-a-wall-that-stops-you.md) | A wall that really stops you |
| [0068](decisions/ADR-0068-a-level-is-painted-not-assembled.md) | A level is painted, not assembled |
| [0069](decisions/ADR-0069-a-save-is-not-an-intention.md) | A save is not an intention |
| [0070](decisions/ADR-0070-a-cutting-is-a-resource.md) | A cutting is a resource |
| [0071](decisions/ADR-0071-un-apercu-suit-les-trois-modeles.md) | A preview follows all three models |
| [0072](decisions/ADR-0072-un-avertissement-n-arrete-rien.md) | A warning stops nothing, and a wait has a ceiling |

ADR-0001 to 0015 accepted on 2026-08-12, including the `.px` execution mode (ADR-0009, Q7:
interpreted); ADR-0016 and ADR-0017 on 2026-08-13; ADR-0018 to ADR-0024 on 2026-08-14;
ADR-0025 on 2026-08-17; ADR-0026 and ADR-0027 on 2026-08-18; the rest as implementation
proceeded, each dated in its own header. ADR-0015 was revised on 2026-08-12: the
"`Script` Component with `kind` + `source`" seam is replaced by "a graph is the behaviour of
a Component type".

**This table is the complete list.** An ADR that is not in it does not exist; a file in
`decisions/` that is not in it is a line to add here.

## Audit documents

The three passes of the "data-model foundations" effort are kept for what they explain — why
structural order is data, why a `Resource` has an opaque identity, why undo keeps one stack
per resource. **They are historical documents:** what they proposed was settled by the ADRs
above and implemented.

- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md)
  — **audit**: what the model was, and what it was missing
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md)
  — **proposal**: structural order, structural Operations, `Resource` / `ResourceId`, user
  Components, Undo/Redo, `.px` and the `Graph` window
- [migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md](migration/ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_3.md)
  — **consolidation**: implementation sequence, dependencies, risks

The seven decisions Phase 3 was waiting on have been taken: ADR-0018 to ADR-0027.

## Development

- [development/DEVELOPMENT.md](development/DEVELOPMENT.md) — running the project
- [development/TESTING.md](development/TESTING.md) — test strategy
- [development/LOGGING.md](development/LOGGING.md) — logging

## Writing rule

Every claim is labelled:

**OBSERVED IN LEGACY** · **HISTORICAL DECISION** · **V2 PROPOSAL** · **OPEN QUESTION**

A proposal is never presented as existing behaviour.
Documents predating Phase 0 live in [archive/](archive/README.md), together with the list of
their claims that the code contradicts.
