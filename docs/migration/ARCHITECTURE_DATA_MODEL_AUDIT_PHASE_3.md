# Consolidation before implementation — data model foundations

> **Nature:** a consolidation of [Phase 2](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md).
> This document **decides nothing**. It verifies, separates what is locked from what is not,
> and proposes a sequence.
> **Date:** 2026-08-14 · **Verified against:** `HEAD = 38039a3`, aligned with `origin/master`.
> **Implementation status: NONE.** No file in `src/` was created or modified.

This document is the third of a three-pass effort:

| Pass | Document | Role |
|---|---|---|
| 1 | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md) | **audit** — what the model is, and what it is missing |
| 2 | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md) | **proposal** — the target architecture, alternatives included |
| 3 | this document | **consolidation** — sequence, dependencies, risks, remaining arbitrations |

> **A vocabulary reminder.** Two "phase" numberings coexist. This is phase 3 **of the "data
> model" effort**, inside **step 4 of the migration** described by
> [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md). It is not a migration phase.

Labelling, per [`../CONVENTIONS.md`](../CONVENTIONS.md), plus one transitory label:

| Label | Meaning |
|---|---|
| **OBSERVED** | verified in the code, at the stated revision |
| **DECIDED (ADR-XXXX)** | settled by an accepted ADR — authoritative |
| **DECISION ACCEPTED** | settled by the maintainer, **not yet recorded in an ADR** |
| **PROPOSAL** / **RECOMMENDATION** | not decided, not implemented |
| **TO DECIDE** | requires explicit arbitration before implementation |

---

## 1. The repository's verified state

### 1.1 Revision

**OBSERVED.** `HEAD` = `refs/heads/master` = `refs/remotes/origin/master` = `38039a3`. Phase 2
had been verified against `19107304`.

**`src/` is byte-for-byte identical between the two revisions** — all 94 `.js` files were
compared (size and modification date), with no difference. The intervening commit touches only
`docs/`. **Every code claim from Phases 1 and 2 therefore remains valid.**

*A methodological limit:* no shell is exposed on the maintainer's machine in the session that
produced this document. `git status` and `git diff` could not be run; the repository's state is
established by reading `.git/refs` directly and by comparing the tree.

### 1.2 Tooling

**OBSERVED**, on `19107304`, not replayed on `38039a3` since `src/` is identical:

```
tools/test.sh              497 tests, 497 passed, 0 failed
node tools/layers/run.js   v2 profile: 0 forbidden imports out of 325
```

`tools/parity/run.js` (39 scenarios) **was not run** — it needs `legacy/`, absent from the
analysis copy.

### 1.3 Five code facts Phase 3 adds to the audit

Established by re-examining the arbitration points specifically. They are not in Phase 2 and
they change the cost of some options.

| # | Fact — **OBSERVED** | Location | Scope |
|---|---|---|---|
| **N1** | `defineComponent` **rejects** a `graph` that is not an object: `typeof graph !== 'object'` → `TypeError` | `core/definition.js:75-77` | A reference by identifier (a string) is refused **today**. It prices arbitration A |
| **N2** | `SceneRenderer.render()` also iterates `Object.keys(components)` and calls `draw()` on **every** component that declares one | `runtime/rendering/scene-renderer.js:60-82` | Component order also governs **the draw order inside an object**, not only `update` order. A second consumer of the ordering |
| **N3** | A test asserts that two objects whose Components were attached in a **different** order produce the **same** serialized key order | `core/serialize.test.js:175-186` | That test **encodes** the current decision. It will not break by accident: it must be **inverted**, not deleted |
| **N4** | `type: 'object'` appears in **no** shipped component — its only occurrence is a test fixture | `core/definition.test.js:59` | Arbitration C has a real impact of two lines |
| **N5** | **ADR-0004 states, as SETTLED:** "The key in `object.components` stays **the type name**, as in Legacy" | `decisions/ADR-0004-component-lifecycle.md:100-102` | Arbitration D touches the letter of an accepted ADR |

### 1.4 A distinction Phase 2 closed without saying so

Phase 2 writes "`components` becomes an ordered collection serialized as an array". That phrase
**conflates two independent changes**:

| | What changes | What breaks |
|---|---|---|
| **(a) the serialized form** — `"components": { … }` → `"components": [ … ]` | `core/serialize.js` alone | `serialize.test.js:80`, `:175-186`; `behaviors.test.js:466` |
| **(b) the in-memory getter's form** — `object.components` | `core/object.js` **and all of its readers** | `runtime.js`, `scene-renderer.js`, `inspector.js`, `object.test.js:183` |

**(a) is enough to make the order persistent.** (b) is needed only for index access in memory —
and `moveComponent()` can operate on the internal storage without changing the getter's form,
which can go on producing a frozen object whose key order is the collection's.

**Not decided.** This point divides the first step's scope by three. It heads the list of
required decisions (§8).

---

## 2. Decisions already locked

### 2.1 Normative by ADR — they take precedence over any audit proposal

**ADR = Architecture Decision Record.**

| Decision | ADR |
|---|---|
| `Object` stays `Object`, never `Entity` | ADR-0001 |
| `Transform` is a Component; `object.x` is a façade; values are **local**, the world is **derived** | ADR-0002 |
| `x =` direct / `setProperty()` controlled; `$x` removed | ADR-0003 |
| One Component per type; duck-typing, no base class; **the key in `object.components` is the type name** | ADR-0004 |
| No `systems/` directory | ADR-0005 |
| An Editor in native Web Components | ADR-0006 |
| A schema-driven Inspector, reflective as a fallback — the fallback is a **requirement**, not a tolerance | ADR-0007 |
| Every mutation of the model is representable as an Operation; `previous`, `seq`, `actor`, `batch` | ADR-0008 |
| `.px` = an **interpreted** JSON graph; no `eval`, no `new Function` | ADR-0009 |
| Identity is an opaque id, never a name | ADR-0010 |
| An authoritative server; `authority.check()` mandatory | ADR-0011 |
| The Runtime isolates and reports; it does not modify the model | ADR-0012 |
| Camera / Viewport; abstract Input passed into the step | ADR-0013, ADR-0014 |
| A graph is the **behaviour of a Component type**; no `Script` Component | ADR-0015 |
| A definition = `type` + properties + graph; it belongs to the type | ADR-0016 |
| Selection and picking belong to the Editor | ADR-0017 |

### 2.2 Accepted by the maintainer, not yet recorded in an ADR

**DECISION ACCEPTED (2026-08-14).**

1. **Component order is meaningful and persistent** — it is part of the project's state.
2. **Reordering** Components, children and root objects is a **Core mutation**, representable
   as an Operation, and therefore compatible with replication and Undo/Redo.
3. **A Component definition has a stable identity distinct from its displayed name.** Renaming
   must not break existing instances.
4. **`.px`** stays a JSON resource interpreted by the Runtime; the Core does not interpret it;
   the graph belongs to the type and is shared by its instances; **each instance keeps its own
   execution state**.
5. **Terminology: `Graph`** designates the visual programming system. **`Composer` is forbidden
   in that sense** and reserved for a possible future music composition window.
6. **The `Graph` as a resource is conceptually distinct from the view/editor that modifies
   it.** `GraphResource` designates the persisted resource; `Graph` designates the product
   notion and the window that edits it.
7. **`Object` is not a Component.** `name`, `tag` and the other native properties stay intrinsic
   properties of `Object`, never a Component stored in `object.components`.
8. **`Object` stays an intrinsic section of the Inspector**, alongside the Components, and
   `name` / `tag` stay editable there.
9. **ADRs take precedence over audit proposals.**

### 2.3 Checking points 7 and 8 against the code

**OBSERVED — they describe already-implemented behaviour; nothing is to be built.**

- `editor/inspector/schema.js` exports `objectFields()` — a **hand-written** list (`name`,
  `tag`, `layer`, `active`), distinct from `describeComponent()`, which reads a schema or
  reflects over an instance;
- `editor/windows/inspector.js` renders an `Object` section above the Components, fed by
  `objectFields()`;
- `visible` and `lock` are deliberately absent from it: the Hierarchy row carries them; `id` is
  absent because a creator has no use for it;
- editing goes through `Object.setProperty()`, which produces an Operation whose target is
  `{ object: id, component: null }` (`core/object.js:160-168`). **The `component: null` is how
  the format expresses "an intrinsic property of the Object".** Editing `name` is therefore
  already a replicable, undoable mutation.

**Consequence for step 1:** moving `components` to an ordered collection does **not** touch the
`Object` section — it is not in that collection.

**No ADR documents that Inspector section today.** It exists only in the code. See §7.

---

## 3. Arbitrations still open

**Nothing in this section is decided.** The recommendations are flagged as such and commit
nobody.

### A. A definition's graph: referenced by `ResourceId` or stored inline? — **TO DECIDE**

**Current state — OBSERVED.** ADR-0016 shows the graph **inline** in its JSON example, and the
code follows: `defineComponent` refuses a string (`definition.js:75-77`, fact N1);
`Behaviors.bind(type, graph = componentDefinition(type)?.graph)` reads the graph from the
definition (`behaviors.js:112`); invalidation compares graphs **by object identity**
(`behaviors.js:165`).

| | Option 1 — inline (status quo) | Option 2 — `ResourceId` |
|---|---|---|
| Advantages | no code change; a self-sufficient definition; readable JSON | a graph is a resource like any other; openable on its own in a `Graph` tab; a single copy; separate diffs |
| Disadvantages | opening the `Graph` forces loading the definition; the risk of two diverging copies; a large graph weighs down every definition read | breaks the current validation; `bind()` loses its default parameter; a resolver is needed before `bind()`; less readable JSON |
| Code impact | none | `definition.js:75-77` and `behaviors.js:112`. Identity-based invalidation **keeps working**: what is bound stays the resolved graph object, not the identifier |
| ADR impact | none | ADR-0016 §1 and its open point "the file format and storage of a definition" |

**RECOMMENDATION, not a decision:** option 2, because the `Graph` window must be able to open a
graph on its own, and because two copies of the same graph are a class of bug you find out
about late.

### B. `ADD_CHILD` / `REMOVE_CHILD` merged into `REPARENT`? — **TO DECIDE**

**Current state — OBSERVED.** ADR-0008 and `ARCHITECTURE.md` §6.2 list both. **Neither is
implemented**: `OperationType` contains only `SET_PROPERTY`. `Object.addChild()` already
detaches from the previous parent (`object.js:295`) — "adding a child" *already is* a reparent.

**A clarification Phase 2 does not state explicitly:** the **Operation types** and the Scene's
**structural events** are two independent layers. The `child:added` / `child:removed` events
have consumers (`hierarchy.js:212`, `viewport.js:77`). **Merging the Operations forces merging
neither the events nor `addChild`/`removeChild`.**

| | Option 1 — two Operations + a reorder one | Option 2 — a unified `REPARENT { object, parent, index }` |
|---|---|---|
| Advantages | faithful to the letter of ADR-0008; a 1-to-1 match with Legacy's messages | one Hierarchy drop = **one** atomic operation; one inverse; one cycle validation; covers reparent, unparent, sibling reorder and root reorder |
| Disadvantages | one drop produces two or three operations that must **always** travel and undo together, and whose order matters; three inversion rules | it departs from a list written in an accepted ADR |
| Code impact | three types, three handlers, three inverses | one type, one handler, one inverse. The `isAncestorOf` guard (`object.js:291`) moves into the handler |
| ADR impact | none | ADR-0008 §"Operations" and `ARCHITECTURE.md` §6.2 |

**RECOMMENDATION, not a decision:** option 2. The capability covered is identical — it is a
simplification, not a reversal. But it really is a modification of a list written in an accepted
ADR.

### C. Remove the `object` type from `DEFAULTS`? — **TO DECIDE**

**Current state — OBSERVED.** `core/definition.js:52` declares `object: () => ({})`. **No
shipped component declares `type: 'object'`**; the repository's only occurrence is
`core/definition.test.js:59`, a fixture (fact N4). On the Editor side, `object` is not in
`SCHEMA_KINDS` → it falls back to `READONLY`, displayed by `describeOpaque()`.

| | Option 1 — keep | Option 2 — remove |
|---|---|---|
| Advantages | no change; a user Component can store a structured object | it removes a type with no validation, no editor and no meaning for replication |
| Disadvantages | it invites declaring a property you can neither edit, nor validate, nor diff | it closes a door a use case might reopen |
| Code impact | — | `definition.js:52` and `definition.test.js:59`. **Two lines** |

**RECOMMENDATION, not a decision:** option 2, solely because the cost is nil. The honest
counter-argument: reopening later also costs one line — the stakes are low either way.

### D. A readable `type` for native Components, an opaque `ResourceId` for user Components? — **TO DECIDE**

**This is the heaviest arbitration.**

**ADR-0004 states, as SETTLED:** "The key in `object.components` stays **the type name**, as in
Legacy — this confirms the historical behaviour rather than changing it" (fact N5). An opaque
`type` honours its **letter** — the key stays `componentType(component)` — but strains its
**intent**, since "as in Legacy" presumes a readable name.

**Impact per consumer — OBSERVED:**

| Consumer | Effect of an opaque `type` |
|---|---|
| Serialization | `serialize.js` keys by `componentType()` → **unchanged**. The JSON carries the identifier instead of the name |
| `describeType()` | `registry.js:60` already reads `ComponentClass?.label ?? SHIPPED[type]?.label ?? type` → **the seam exists** |
| Icons | `iconForComponent()` (`icons.js:156-160`) reads `ComponentClass.icon` **before** the name table → a definition that declares `icon` keeps its icon |
| Inspector search | `inspector.js:340` filters on `humanise(type)`. **Broken** — must move to `label` |
| Runtime | the type is only a key → **unchanged** |
| Error reports | `componentFailure({ … })` reports the type → a message would say the identifier. Must move to `label` |
| Resources | this is the point: `type` = the definition's identity makes renaming free, without touching an instance |

| | Option 1 — `type` always readable | Option 2 — opaque for user components | Option 3 — a readable slug fixed at creation |
|---|---|---|---|
| Renaming | **breaks every instance** | free | free |
| Cross-project collision | possible | impossible | possible |
| Readable JSON | yes | no (the manifest gives the mapping) | yes |
| Slug / label divergence | — | — | yes, eventually |
| Code impact | none | `inspector.js:340`, the error reporting channel | same as option 2, plus slug generation |

**RECOMMENDATION, not a decision:** option 2 — the only one that satisfies accepted decision
§2.2-3 without exception. But the "native readable / user opaque" asymmetry is a mental-model
choice that belongs to the maintainer.

### E. Should the `Renderer [ Type ▼ ]` selector be unique? — **TO DECIDE**

**The question has changed nature since Q8 on 2026-08-13.**

**OBSERVED (fact N2).** `SceneRenderer.render()` iterates `Object.keys(components)` — the
attachment order — and calls `draw()` on **every** component that declares one. Concretely: an
Object carrying `RectangleRenderer` **and** `Sprite` draws both, and **the Component order
decides which one goes on top**.

Making the order meaningful and persistent therefore does more than add a capability: it turns
"several renderers on one Object" from a tolerated accident into a **legitimate, saved
composition technique**.

The cost of a remove/re-add, measured in Phase 1: the value is lost (`42 → 1`) **and** the
component goes back to the end of the collection — so, from now on, above everything else when
drawing.

| | Option 1 — no selector (status quo) | Option 2 — a single `Type ▼` selector | Option 3 — a selector that preserves |
|---|---|---|---|
| The model asserted | several renderers, stacked in Component order | one renderer per Object | one per Object, but changing type ≠ destroying |
| Changing type | remove + add, explicitly, through two Operations | an **implicit** remove + add → loss of the values **and** of the rank | `REMOVE_COMPONENT` + `ADD_COMPONENT { index }` in a `batch`, shared values carried over |
| Code impact | none | the Inspector alone | the Inspector + a value carry-over rule to define |
| Undo | natural | the entry must be a `batch`, otherwise undoing leaves an object with no renderer | natural |
| Contradicts the model? | no | **yes** — `editor/registry.js:18-19` explicitly documents that several renderers coexist and all draw |  no |

**An observation, not a recommendation:** meaningful order makes option 2 more expensive; it
would assert in the UI the opposite of what the model allows, and its central gesture now
destroys two things instead of one. Option 3 is the compromise if the selector's ergonomics are
wanted. It is a product UX question.

---

## 4. Proposed implementation sequence

**PROPOSAL.** Phase 2's sequence is technically consistent with the current code. Three
adjustments are proposed, each justified.

**Adjustment 1 — split the first step.** `PropertyType` and ordered collections have no mutual
dependency: one touches `definition.js` + `schema.js`, the other `object.js` + `scene.js` +
`serialize.js`. Separated, they are two smaller green steps — and `PropertyType` is blocked by
arbitration C alone, while the collections are blocked by nothing.

**Adjustment 2 — move `Matrix.decompose()` earlier.** It is a pure function with no dependency
on Operations: it can be written and tested immediately. Only the **reparenting policy** in the
Editor depends on Operations. Separating the function from the policy takes `decompose()` off
the critical path.

**Adjustment 3 — name step 6's dependency on step 4.** `type = ResourceId` only makes sense if
`ResourceId` exists. The order is already correct; the dependency deserves to be written down
so it is not lost.

### 4.1 Steps, dependencies, blockers

| # | Step | Depends on | Blocked by | Main files |
|---|---|---|---|---|
| **1a** | Ordered collections: ordered internal storage, an ordered root list in `Scene`, `moveComponent`, array serialization, `FORMAT_VERSION` → 2 | — | §8-1 (the getter's form) | `core/object.js`, `core/scene.js`, `core/serialize.js` + `serialize.test.js`, `object.test.js`, `runtime/scripting/behaviors.test.js` |
| **1b** | `PropertyType` in the Core; `FieldKind` derived in the Editor; `resource` and `array` stop being dead ends | — | **arbitration C** | `core/definition.js`, `editor/inspector/schema.js` + their tests |
| **2** | `invert()` + structural Operations + validation (cycles, indices, no-ops) + per-pipeline `seq` | 1a | **arbitration B** | `core/operations/operation.js`, `core/operations/operations.js`, `core/object.js`, `core/scene.js`, `core/mod.js` |
| **3a** | `Matrix.decompose()` | — | — | `core/math/matrix.js`, `matrix.test.js` |
| **3b** | The Editor's reparenting policy: `batch` = `REPARENT` + five `SET_PROPERTY`s | 2, 3a | arbitration B | `editor/commands.js`, `editor/windows/hierarchy.js` |
| **4** | `src/project/`: manifest, `ResourceId`, an in-memory `ResourceStore`; the layer declaration | 1a | — | `src/project/**` *(new)*, `tools/layers/rules.js` |
| **5** | `History` on the Editor side, one stack per resource, undo through `submit(invert(op))` | 2, 4 | — | `editor/history.js` *(new)*, `editor/editor.js` |
| **6** | Component Definitions: `type` / `label`, structural reconciliation, a preserved missing component | 1b, 4 | **arbitrations C + D** | `core/definition.js`, `core/component.js`, `core/serialize.js`, `editor/registry.js`, `editor/windows/inspector.js` |
| **7** | `GraphResource` + `bind()` called by the Project layer | 4, 6 | **arbitration A** | `src/project/**`, `runtime/scripting/behaviors.js` |

**The exit rule for each step:** `tools/test.sh` and `node tools/layers/run.js` green.

### 4.2 Dependency graph

```
1a ──┬── 2 ──┬── 3b
     │       └── 5
     ├── 4 ──┴── 6 ── 7
1b ──────────────┘
3a ── 3b
```

### 4.3 What breaks at step 1a, by name

This is not accidental breakage: these tests **encode** the decision being reversed.

- `core/serialize.test.js:175-186` — asserts that the serialized key order is **independent** of
  the attachment order. **To invert**, not to delete: it must now assert that the order is
  **preserved**.
- `core/serialize.test.js:80` — `data.components.Transform.x`. To rewrite if the serialized form
  becomes an array.
- `runtime/scripting/behaviors.test.js:466` — `data.objects[0].components.Controller`. Same.
- `core/object.test.js:183` — `object.components.Transform.x`. **Breaks only if the getter's
  form changes too** (§1.4).

---

## 5. Risks

| Domain | Risk | Severity | Mitigation |
|---|---|---|---|
| **Serialization** | A test **encodes** the alphabetical order (`serialize.test.js:175-186`). Reversing it without noticing would leave a green test that lies | **high** | Name it in step 1a and invert it explicitly |
| **Format compatibility** | `FORMAT_VERSION` 1 → 2; `deserializeScene` **throws** on an unknown version (`serialize.js:125`) | low | No v1 project exists (Q6). Before the step, find any fixture hard-coded in format 1 |
| **Collection order** | Two consumers, not one: `update` (`runtime.js:137`) **and** `draw` (`scene-renderer.js:60`). Treating the order as "update order" would miss the second | **high** | Fact N2. The written rule must say *update **and** draw* |
| **Collection order** | Conflating the serialized form with the getter's form triples step 1a's scope | medium | §1.4 — settle it before starting |
| **Undo/Redo** | Undoing through `apply()` instead of `submit()` would desynchronize silently: no arbitration, no replication | **high** | The rule written in the module, plus a test checking that an undo does emit `'operation'` |
| **Undo/Redo** | A `REMOVE_OBJECT` without the subtree **or** the index gives back a stripped object, placed at the end of the list | **high** | A dedicated test: delete a subtree in the middle, undo, compare the full serialization |
| **Replication** | An identifier generated by the receiver instead of the author makes scenes diverge | **high** | An explicit rule in the format of the addition Operations |
| **Replication** | An Operation handler that called back a public API (`addChild`) instead of mutating the internal storage would resubmit an Operation → an echo | **high** | The anti-echo property holds because `apply()` does a direct write. To preserve in **every** new handler |
| **Transform / reparenting** | An inexact decomposition under shear — not representable as `(x, y, rotation, scaleX, scaleY)` | medium | A rare case: a non-uniform scale on an ancestor **and** an intermediate rotation. Policy to decide at step 3a |
| **Transform / reparenting** | A recomputation done in the Core handler rather than as an Editor `batch` would make every node recompute its own floats → an undiagnosable divergence | **high** | That is why Phase 2 puts the policy in the Editor |
| **Resources** | A badly scoped new layer can import the DOM and break server execution | medium | `tools/layers/rules.js` must declare `project` **in the same step**, not later |
| **Graph** | Binding a graph by identifier with no resolver would make `bind()` fail silently at load time | medium | Depends on arbitration A; to be covered by a project-loading test |
| **Terminology** | "Composer" survives in `src/editor/ui/tabs.js:10` | low but lasting | To fix with whichever step touches `editor/ui/`; a future reader would take that comment as normative |

---

## 6. Target architectural boundaries

**PROPOSAL**, taken from Phase 2 §13 and unchanged.

| Responsibility | Core | Runtime | Editor | Project |
|---|---|---|---|---|
| `Object` — structure, order, identity, `name` / `tag` | **owns** | reads | reads, mutates through Operations | serializes through the Core |
| `Scene` — objects, ordered roots, pipeline | **owns** | reads, runs | reads, mutates through Operations | loads / saves |
| Component Definition — shape | **owns the shape** | reads the graph through `Behaviors` | edits through Operations | **owns the storage** |
| Component Instance — values | **owns** | reads, runs | displays, mutates through Operations | serializes through the Core |
| `Resource` | — | — | consumes | **owns** |
| `.px` / `GraphResource` | transports it, **never interprets it** | **interprets** | edits (the `Graph` window) | **stores** |
| Operations — format, pipeline, `invert()` | **owns** | — | emits | emits (project scope) |
| Undo/Redo — stack, shortcuts | provides `invert()` | — | **owns** | — |
| Scene / Object / Component serialization | **owns** | — | — | calls |
| Manifest / resource serialization | — | — | — | **owns** |
| Loading | — | — | triggers | **owns** |
| UI, selection, `viewState`, tabs | — | — | **owns** (ADR-0017) | — |

**The target dependency rule:** `editor/ → project/ → core/`, `runtime/ → core/`,
`core/ → (nothing)`.

---

## 7. ADRs to update or create

**No ADR was modified or created.** An ADR is written only after explicit arbitration.

### 7.1 Existing ADRs to update — after arbitration only

| ADR | Decision concerned | Change needed | Blocking |
|---|---|---|---|
| **ADR-0004** | "The key in `object.components` stays the type name" | If arbitration D adopts the opaque `type`: state that the key stays the type, and that a user Component's type is its resource identity, not its displayed name | **yes** (arbitration D) |
| **ADR-0008** | The Operation list: `ADD_CHILD`, `REMOVE_CHILD`, no reordering operation | If arbitration B adopts the merge: replace the two with `REPARENT { object, parent, index }`, add `MOVE_COMPONENT` | **yes** (arbitration B) |
| **ADR-0016** | A JSON example with an inline graph | If arbitration A adopts the reference: close the open point "the file format and storage of a definition" | **yes** (arbitration A) |
| **ADR-0007** | The contemplated property types | `PropertyType` (Core) / `FieldKind` (Editor); `vector2` and `action` rejected with reasons; `range` derived. **And** record the Inspector's `Object` section, undocumented today | no |
| **ADR-0009 / 0015 / 0016** | "Who calls `bind()`" — an open point in **all three** | Record that the Project layer calls it | no (step 7) |
| **ADR-0002** | Local Transform values, a derived world | **None.** The reparenting policy honours it: the world stays derived, the writes stay local | — |
| **ADR-0017** | Selection = Editor | **None.** `OpenEditor` and `viewState` follow the same rule | — |

### 7.2 ADRs to create — none must be written before arbitration

The numbering is **indicative**; it will depend on the real order of acceptance.

| Provisional | Subject | Unblocked by |
|---|---|---|
| ADR-0018 | Meaningful, persistent structural order; ordered collections; `FORMAT_VERSION` 2 | §8-1 |
| ADR-0019 | Structural Operations, `invert()`, a unified `REPARENT` | arbitration B |
| ADR-0020 | `Resource` / `ResourceId` / `ResourceStore`; neither `Document` nor `Asset`; the `src/project/` layer | — |
| ADR-0021 | A definition's identity: a stable `type` / a displayed `label` | arbitration D |
| ADR-0022 | Transform on reparenting: the world preserved, composed in the Editor | — |
| ADR-0023 | `PropertyType` (Core) / `FieldKind` (Editor) | arbitration C |
| ADR-0024 | Undo/Redo: `invert()` in the Core, `History` in the Editor, one stack per resource | — |

### 7.3 Architecture documentation that would become obsolete

`ARCHITECTURE.md` §6.2 (the Operation list) and §9 (Resources, described as intent).
`MIGRATION_STATUS.md`, the "Deliberately left for later" section, would lose three lines.

### 7.4 Decisions that probably need no ADR

- **The `Graph` / `Composer` terminology** is a matter of product vocabulary: `PROJECT.md` §2 is
  the natural place. **A proposal, not applied.**
- **`Object` as an intrinsic Inspector section** confirms the existing code and the direction of
  ADR-0001, ADR-0002 and ADR-0007. A note in ADR-0007 would be enough — but it has to be made:
  **no ADR documents that section today**.

---

## 8. Decisions required before implementation

**Nothing starts before these arbitrations.** In order of how much they block.

1. **The in-memory form of the `object.components` getter** — does it stay a frozen object with
   ordered keys, or become an indexed collection? *(blocks step 1a; a factor of three on its
   scope — see §1.4)*
2. **Arbitration B** — `ADD_CHILD` / `REMOVE_CHILD` merged into
   `REPARENT { object, parent, index }`? *(blocks step 2; updates ADR-0008)*
3. **Arbitration C** — remove the `object` type from `DEFAULTS`? *(blocks step 1b; two lines of
   code)*
4. **Arbitration D** — an opaque `type` for user Components, `label` for display? *(blocks
   step 6; updates ADR-0004)*
5. **Arbitration A** — a definition's graph referenced by `ResourceId`, or inline? *(blocks
   step 7; updates ADR-0016)*
6. **Arbitration E** — should the `Renderer [ Type ▼ ]` selector be unique? *(blocks nothing,
   but meaningful order changes its cost: to settle before the Inspector is touched again at
   step 6)*
7. **Validating the sequence** — are the three adjustments in §4 adopted?

---

## 9. Cross-references

| Subject | Document |
|---|---|
| The audit of the existing model | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_1.md) |
| The architecture proposal, rejected alternatives | [`ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md`](ARCHITECTURE_DATA_MODEL_AUDIT_PHASE_2.md) |
| Migration progress, open questions | [`MIGRATION_STATUS.md`](MIGRATION_STATUS.md) |
| Legacy's real behaviour | [`LEGACY_ANALYSIS.md`](LEGACY_ANALYSIS.md) |
| Product vocabulary, scope | [`../PROJECT.md`](../PROJECT.md) |
| The v2 architecture, the decision register | [`../ARCHITECTURE.md`](../ARCHITECTURE.md) |
| Writing and labelling rules | [`../CONVENTIONS.md`](../CONVENTIONS.md) |
| Accepted decisions | [`../decisions/`](../decisions/) — ADR-0001 to ADR-0017 |
