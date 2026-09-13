# Architectural audit — Phase 1

**Scope:** the foundations of the data model (user Components, the `.px` graph, Document /
Resource / Scene / Object / Component, structural order, the Undo/Redo groundwork).
**Date:** 2026-08-14
**No file in the repository was modified.**

---

## 0. Method, and what it does not cover

What was done:

- read the Git refs and reflog directly in `.git/`;
- read `src/core`, `src/runtime`, `src/editor`, `docs/`, the 17 ADRs, `tools/`;
- ran the test suite and the layer check on a **copy** of the repository;
- used a throwaway execution probe (outside the repository) to **measure** the behaviour of
  ordering and serialization, instead of inferring it from the code.

Limits, stated explicitly:

| Limit | Consequence |
|---|---|
| No shell is exposed on your machine in this session | **`git status` could not be run.** The cleanliness of the working tree is inferred, not verified |
| `legacy/` and `tools/parity/baseline/` were not copied | **`tools/parity/run.js` was not run.** The 39 parity scenarios are not revalidated here |
| Tests run on a copy, not in place | Node 22.22.2 in the sandbox. The Node version on your machine is unknown |

Nothing in this report is inferred from the UI.

---

## 1. The repository's real state

### References

```
HEAD                     -> refs/heads/master
refs/heads/master        =  19107304aabaeee5a29c340c3f4d81d7219de490
refs/remotes/origin/master = 19107304aabaeee5a29c340c3f4d81d7219de490
remote origin            =  https://github.com/Sharkou/PixelCreator.git
```

**Local and `origin/master` are exactly aligned**: 0 commits ahead, 0 behind.

### A correction to your starting point

> "Last commit: 'Refine editor interactions and viewport controls'"

**That is HEAD~1, not HEAD.** The last commit is:

```
19107304  docs: move reference documentation      2026-08-14 13:07:50 UTC   <- HEAD
70de6ba0  Refine editor interactions and viewport controls   12:55:47 UTC
85740f11  Converge editor UI to modern layout
```

That commit moved the reference documentation (`docs/reference/**`, 45 files). It is pushed to
`origin/master`.

### The reflog shows a history rewrite

```
85740f11 -> d71804c7   commit: Refine editor interactions and viewport controls   12:36:15
d71804c7 -> 85740f11   reset: moving to HEAD~1                                    12:37:50
85740f11 -> 70de6ba0   commit: Refine editor interactions and viewport controls   12:55:47
70de6ba0 -> 19107304   commit: docs: move reference documentation                 13:07:50
```

`d71804c7` is **orphaned**: the "Refine editor interactions" commit was undone and then redone
under another SHA. `ORIG_HEAD` still points at it. That is not a problem in itself —
`origin/master` is consistent with the local state — but it is worth knowing if you were
relying on that SHA anywhere.

A harmless detail: `packed-refs` still holds a stale `origin/master` (`a52633bc`), shadowed by
the loose ref. Normal after a `fetch`.

### Working tree

`git status` could not be run. Indirect evidence: **no file** in `src/`, `docs/`, `tools/` or
`design/` has a modification date later than the last commit (the most recent is at 12:45:45
UTC, the commit at 13:07:50 UTC). That is **consistent** with a clean working tree; it is not
proof — a `git status` on your side would settle it in a second.

---

## 2. Tests run before any analysis

```
tools/test.sh              497 tests, 497 passed, 0 failed   (4.5 s)
node tools/layers/run.js   v2 profile: 0 forbidden imports out of 325 imports scanned
                           legacy profile: skipped (legacy/ absent from the copy)
```

`MIGRATION_STATUS.md` announced 480 tests / 318 imports after step 3.5; we are at 497 / 325
after the last two commits. Consistent.

**Not run:** `tools/parity/run.js` (39 scenarios) — see §0.

---

## 3. What the model is today, fact by fact

### 3.1 Object — `src/core/object.js`

An `Object` is a reactive `Proxy` whose internal state lives under a `Symbol` (`STATE`), so it
is invisible to enumeration and to serialization.

**Internal state** (`object.js:54-69`):

```js
{
    components: new Map(),   // type -> instance     <- order = attachment order
    exposed:    new Map(),   // prop -> providing component (the façade, ADR-0002)
    children:   [],          // array                <- order = order of addition
    parent:     null,
    scene:      null,
    notify:     null,        // provided by the Scene
    detachedOperations: null
}
```

**Own properties** (and therefore serialized): `id` (non-writable), `name`, `tag`, `layer`,
`active`, `visible`, `lock`, `owner`.

**Structural API**: `addComponent`, `removeComponent`, `getComponent`, `hasComponent`,
`addChild`, `removeChild`, plus `setProperty` / `observe`.

- `addChild` does `children.push(child)` (`object.js:297`) — **always at the end**.
- `removeChild` does `indexOf` + `splice` (`object.js:313-316`).
- `get components` returns a **frozen snapshot**, whose key order is the `Map`'s insertion
  order.
- `get children` returns a **copy** of the array.

**No primitive for moving to an index exists.**

### 3.2 Component — `src/core/component.js`

No base class, a duck-typed contract (ADR-0004): `update`, `draw`, `bounds`, `onAttach`,
`onDetach`, `static type`, `static exposes`, `static schema`.

A `ComponentRegistry` resolves `type -> class` for deserialization, with a
`register(Class, { replace })` explicitly provided for re-editing a user component
(`component.js:157`).

**An Object carries at most one component per type** (Q4, settled). `addComponent` of a type
already present **throws** instead of silently replacing.

### 3.3 Scene — `src/core/scene.js`

A **flat** collection: `Map<id, Object>`. The hierarchy is a parent/child link between objects
of the scene, not a nesting of storage.

- `objects()` → the `Map`'s insertion order;
- `roots()` → `objects().filter(o => !o.parent)`, so **insertion order**, not an ordering that
  belongs to the roots;
- the Scene owns the `Operations` pipeline: it is the unit of replication;
- it emits six structural events: `added`, `removed`, `component:added`, `component:removed`,
  `child:added`, `child:removed`.

> A documentation slip: the comment at `scene.js:83` says "these five events" and lists six.
> Cosmetic.

**No primitive for reordering objects exists.** `Scene.add()` of an object already present
returns the object unchanged — so you cannot reinsert in order to reorder.

### 3.4 Serialization — `src/core/serialize.js`

`FORMAT_VERSION = 1`. Explicit, never by accidental enumeration.

- `serializeObject`: a fixed field list, `parent` = an id, `children` = an array of ids
  (**ordered**), `components` = an object;
- `serializeComponent`: the keys of the `static schema` if there is one, otherwise the own
  properties; `active` added outside the schema;
- `serializeComponents`: **sorts the types alphabetically** (`serialize.js:151-155`);
- `deserializeScene`: two passes, and the `children` links are restored **in the recorded
  order**.

### 3.5 Operations — `src/core/operations/`

```js
export const OperationType = { SET_PROPERTY: 'SET_PROPERTY' };
```

**Only one operation type exists.** An Operation is frozen and carries
`{ type, target: { object, component }, prop, value, previous, origin, actor, batch, seq }`.

The `Operations` pipeline has two entries, and that is the whole anti-echo design:

| | Authority | Emits `'operation'` |
|---|---|---|
| `submit(op)` | yes | yes |
| `apply(op)` | no | no |

`Operations.register(type, handler)` is **already** the extension seam: Scene and Object can
register their structural operations without the pipeline knowing the model. Nobody uses it
today.

### 3.6 Replication

`src/network/` **does not exist**. The attachment point is
`scene.operations.on('operation', …)`. Nothing else is written.

### 3.7 Runtime — `src/runtime/`

`Runtime.step()` (`runtime.js:135-165`):

```js
for (const object of this.#scene.objects()) {          // Scene insertion order
    const components = object.components;
    for (const type of Object.keys(components)) {      // ATTACHMENT order
        component.update(object, context);
        this.#behaviors?.behaviorFor(component)?.update?.(object, context);
    }
}
```

`SceneRenderer.#drawOrder()` sorts by `layer`; since the JS sort is stable, the scene's
insertion order breaks ties at equal `layer`.

`Behaviors` (`runtime/scripting/behaviors.js`) holds `type -> graph`, `graph -> factory` and
`component -> { graph, behavior }`. **It contains neither a graph model nor an interpreter**:
`interpret` is passed to it as a parameter.

### 3.8 Editor — `src/editor/`

Verdict: **the Editor really is a pure consumer of the Core.** Verified, not assumed.

- `hierarchy.js` reads `scene.roots()` and `object.children`; no parallel tree;
- `inspector.js` reads `object.components` and then `componentSchema()` or reflection; no
  `if (type === '…')`;
- `selection.js` is Editor state, not replicated, absent from the Core (ADR-0017);
- `commands.js` is thin and declares itself the insertion point for structural Operations and
  for undo;
- the layer check passes: 0 forbidden imports out of 325.

And above all, at the one place where the Editor met a missing Core capability, it **refused to
work around it** and wrote it down (`inspector.js:99`):

> *"it reserved room for a drag handle that does not exist (component order is a Core
> capability the model does not expose yet, see the report)"*

**No reordering drag and drop exists** in the Editor — neither in the Hierarchy nor in the
Inspector.

### 3.9 `px-tabs`

`src/editor/ui/tabs.js`, 118 lines, **zero consumers**, registered by `editor.js`. The file
already documents its future role and the list of what must **not** be built now (lifecycle,
closing, overflow, drag, detachment). In line with your instruction: nothing to do, nothing to
delete.

---

## 4. The critical point — structural order

### 4.1 What I measured, rather than inferred

A probe run outside the repository, against the real Core:

```
attachment order (= runtime execution order, = Inspector order) : [ Zeta, Alpha ]
serialized key order                                            : [ Alpha, Zeta ]
after a serialize -> deserialize round trip                     : [ Alpha, Zeta ]

child order                          : [ a, b ]
children after a round trip          : [ a, b ]        <- preserved

a component's value after remove + re-add : 42 -> 1    <- lost
```

### 4.2 A documented contradiction to settle before anything else

Two Core files state the opposite of each other:

| File | Claim |
|---|---|
| `serialize.js:151` | *"component type carries no ordering meaning"* → an alphabetical sort |
| `runtime.js:113` | *"Every component's `update(self, ctx)` runs […] in scene insertion order"* → attachment order **is** execution order |

The concrete consequence, today, with nothing changed: **saving and reloading a project changes
the execution order of an object's components.** Two components where one reads what the other
writes within the same step do not behave the same before and after a save.

That is a defect **prior** to the reordering question, and the first to fix: adding a
`moveComponent()` to a model whose order does not survive a round trip would give you a
primitive whose result vanishes at the next load.

Two coherent, mutually exclusive outcomes — **this is a decision that is yours to make**:

- **A.** Component order is meaningful → serialization must preserve it (the alphabetical sort
  goes away, or an explicit order field appears) and a move primitive makes sense.
- **B.** Component order is not meaningful → the runtime must not depend on it (execution order
  defined some other way: by type, by a declared priority…), and "reordering a Component"
  becomes a pure Inspector display preference, which then has no business in the Core.

I am not settling it: it is structural, and the answer changes what we write in the Core.

### 4.3 An exact inventory of what is missing

| Need | Exists? | What is there instead |
|---|---|---|
| Move a Component to an index | **no** | nothing |
| Move a child to an index | **no** | `addChild` = push to the end |
| Reorder a Scene's roots | **no** | the `Map`'s insertion order, not modifiable |
| A `MOVE` / `REORDER` operation | **no** | `OperationType` contains only `SET_PROPERTY` |
| The remove + re-add workaround | possible | **destroys the values and puts it at the end** — measured |

An important point for Phase 2: the operation list planned by ADR-0008 and `ARCHITECTURE.md`
§6.2 is `SET_PROPERTY`, `ADD_OBJECT`, `REMOVE_OBJECT`, `ADD_COMPONENT`, `REMOVE_COMPONENT`,
`ADD_CHILD`, `REMOVE_CHILD`, `ADD_RESOURCE`, `REMOVE_RESOURCE`. **No reordering operation is in
it.** Adding one is not a contradiction of an ADR, but it is an extension of a documented
decision: it needs your explicit agreement.

---

## 5. User Components

### 5.1 The four notions are already distinct in the code

No extra abstraction is needed — the existing model already separates them:

| Notion | Where it lives | Form |
|---|---|---|
| **A native Component** | `core/components/transform.js`, `runtime/rendering/components/*` | a hand-written JS class |
| **A user Component** | produced by `defineComponent()` | a **generated** JS class, indistinguishable downstream |
| **A Component definition** | `core/definition.js` | a JSON record `{ type, properties, graph }`, set on the class (`static definition`) |
| **A Component instance** | attached to an Object | a reactive `Proxy` carrying **values only** |

`defineComponent()` builds the class **without `eval` or `new Function`**, sets `static type`,
`static schema` and `static definition`, and initializes each schema key to its default
(containers copied per instance). It is clean and it is already tested.

### 5.2 What is actually missing

| Gap | Severity | Detail |
|---|---|---|
| **A definition's identity** | **structural** | A definition is identified by its `type` alone (a string). Renaming a user Component creates a different type: at load time, `registry.create(type)` **throws** and every existing instance is orphaned. ADR-0010 establishes that "names are not identities" for Objects; definitions violate that today |
| **Persistence** | blocking | Nothing writes or reads a definition. No `Resource`, no file, no loader |
| **Who calls `register` / `bind`** | blocking | An explicitly open point in ADR-0016 and ADR-0015 |
| **Validating `properties`** | real | `defineComponent` only checks that each entry is an object. Neither the declared `type`, nor `min`/`max`, nor `values` are validated |
| **Migrating instances** | known | An open point in ADR-0016, deferred to the Editor |

### 5.3 Two property-type vocabularies, in two layers, with no common source

This is the second real defect the audit surfaces, and it touches user Components directly:

| `core/definition.js` — `DEFAULTS` | `editor/inspector/schema.js` — `FieldKind` |
|---|---|
| `number`, `int`, `boolean`, `string`, `color`, `array`, `object` | `number`, `int`, `range`, `boolean`, `string`, `color`, `enum`, `readonly` |

- `array` and `object` have a default in the Core but **fall back to `READONLY`** in the
  Inspector: an array property of a user Component would not be editable.
- `enum` and `range` are editable but **have no default** on the Core side: an `enum` property
  with no explicit `default` starts at `null`.
- `resource` is listed in ADR-0007 as a contemplated type and **exists nowhere**.
- `vector2` and `action` are listed in ADR-0007 and are absent from both sides.

Until the type vocabulary has a single source, any user Component can declare a property the
Inspector refuses to edit or the Core initializes wrongly.

On your instruction "do not implement types just to complete a list": the only types whose need
is **demonstrated** by the work in progress are `enum` (already rendered by the Inspector, with
no Core default) and `resource` (indispensable as soon as a user Component references a graph,
an image or another Component). `array` and `object` are already half present and create an
inconsistency by their mere existence — closing them costs less than leaving them.

---

## 6. The `.px` graph

### 6.1 What the ADRs have already settled — do not reopen

| Question | Answer | Source |
|---|---|---|
| Is `.px` JavaScript? | **No.** A structured JSON resource, MIME `application/px`, never `import()`ed | ADR-0009 |
| Interpreted or compiled? | **Interpreted.** No `eval`, no `new Function` | ADR-0009, Q7 |
| Does a `.px` produce a Component type? | **No, never.** It is the *behaviour* of a type that already exists | ADR-0015, ADR-0016 |
| Where is the graph attached? | To the **type**, not to the instance | ADR-0015 §1, ADR-0016 §3 |
| Is the graph serialized with the instance? | **No.** A scene of a thousand `Controller`s carries a thousand `speed`s and one graph | ADR-0016 §3 |
| Is the graph mutable? | **No.** Editing = producing a new graph and `bind()`ing it | ADR-0016 §7 |
| Does the Core read the graph? | **No.** Opaque transported data; interpretation belongs to the Runtime | ADR-0016 §5 |
| The graph's shape | `{ version, nodes[], connections[], variables[], metadata }` | ADR-0009 |

### 6.2 What is not settled

| Open point | Status |
|---|---|
| **The graph model itself and its interpreter** | 0 lines of code. It is what `MIGRATION_STATUS.md` designates as "what is missing" for step 4 |
| What becomes of a graph's `variables` with respect to the Component's schema | open in ADR-0009 **and** ADR-0015 |
| Who loads and calls `bind()` | open in ADR-0009, ADR-0015, ADR-0016 |

### 6.3 Resource / Document / Asset — nothing exists

This is the widest gap in the audit, and it gates everything else:

- **`Resource` does not exist** in `src/`. `ARCHITECTURE.md` §9 describes it as a future (a
  stable id independent of the path, no more base64 DataURLs, Blob URL revocation, IndexedDB as
  a cache).
- **`Document` exists nowhere**, neither in the code, nor in the ADRs, nor in
  `ARCHITECTURE.md`. It is a word from your instruction, not a concept of the repository.
- **`Asset` appears only in a mockup** (`<px-assets>` in `ARCHITECTURE.md` §5.2) and in the text
  of the `px-project` shell.

In other words: the Document ↔ Resource ↔ Scene ↔ `.px` relations are not "to be found in the
ADRs" — **they are not there**. That is the point that will require a real architecture decision
in Phase 2, and it is also the prerequisite for `px-tabs`, for the `Graph`, for project loading
and for `behaviors.bind()`.

What the code already imposes as constraints on that future decision:

1. The Scene is the unit of replication (it owns the `Operations` pipeline).
2. The Core must learn nothing about the graph (ADR-0016 §5) — so a graph `Resource` is
   transport, not interpretation.
3. A definition is pure JSON, so it is storable as a resource, versionable and diffable.
4. The Core depends on nothing: `Resource` cannot bring the DOM, `fetch` or IndexedDB into
   `core/`.

---

## 7. Undo / Redo

### 7.1 Nothing exists

No history module, no stack, no `undo()` in `src/`. The only occurrences of the word are
comments of intent.

### 7.2 What is already in place

- Every `SET_PROPERTY` carries **`previous`** — which is precisely what makes inversion
  possible;
- **`batch`** exists on every operation: one drag = one history entry;
- `scene.operations.on('operation', …)` is the recording seam, already tested
  (`core.test.js:145`, *"operations carry what undo will need"*);
- the `submit` / `apply` separation means an undo replayed through `apply()` **re-emits
  nothing** — so no loop, local or network;
- `Operations.register(type, handler)` allows types to be added without touching the pipeline.

### 7.3 What blocks your list of mutations

| Mutation | Representable today? |
|---|---|
| Modify Property | **yes** |
| Rename | yes (it is a `SET_PROPERTY` on `name`) |
| Create / Delete | **no** — no operation type, and a `Delete` must carry the serialized subtree to be invertible |
| Add Component / Remove Component | **no** — a `Remove` must carry the component's values |
| Move (reparenting) | **no** |
| Reorder | **no** — and see §4.2: you have to decide first whether order is meaningful |

### 7.4 A detail to know before it hardens

`seq` is a **module-level** counter (`operation.js:14`), global to the process and shared by
every scene. That has no consequence today. It will the day `seq` becomes a network sequence
number or a history ordering key.

---

## 8. List of inconsistencies found

Ranked by severity, all verified in the code:

1. **Component order** — meaningful at runtime, alphabetical at serialization. It changes a
   project's behaviour after a round trip. *(§4.2)*
2. **Two property-type vocabularies** — the Core's `DEFAULTS` and the Editor's `FieldKind`
   diverge, with no common source. *(§5.3)*
3. **A Component definition's identity** — the name acts as the identity, which ADR-0010 refuses
   elsewhere. *(§5.2)*
4. `scene.js:83` announces "five events" and lists six. Cosmetic.
5. `inspector.js:99` refers to "the report" — an audit document that is not in `docs/`.
   Traceability.

---

## 9. Decided / not decided — summary table

| Subject | Status | Source |
|---|---|---|
| Object stays `Object`, `children`, `owner` | **decided** | ADR-0001 |
| Transform is a Component, `object.x` a façade | **decided** | ADR-0002 |
| `x =` direct vs `setProperty()` controlled | **decided** | ADR-0003 |
| One Component per type, duck-typing | **decided** | ADR-0004, Q4 |
| A schema-driven Inspector, reflective fallback | **decided** | ADR-0007 |
| Every mutation representable as an Operation | **decided** | ADR-0008 |
| `.px` = an interpreted JSON graph | **decided** | ADR-0009, Q7 |
| A graph is the behaviour of a **type** | **decided** | ADR-0015 |
| A definition = `type` + properties + graph | **decided** | ADR-0016 |
| Selection = an Editor concern only | **decided** | ADR-0017 |
| **Component order: meaningful or not** | **NOT DECIDED** | the contradiction in §4.2 |
| **Reordering operations** | **NOT DECIDED** | absent from the ADR-0008 list |
| **A definition's identity** | **NOT DECIDED** | — |
| **A single property-type vocabulary** | **NOT DECIDED** | ADR-0007 lists intentions |
| **`Resource`: shape, identity, loading** | **NOT DECIDED** | `ARCHITECTURE.md` §9, intent only |
| **`Document`: the concept does not exist** | **NOT DECIDED** | absent from the repository |
| **The `.px` graph model and interpreter** | **NOT DECIDED** | 0 lines |
| **Who calls `register` / `bind`** | **NOT DECIDED** | an open point in 3 ADRs |
| Migrating instances when a definition changes | **NOT DECIDED** | ADR-0016, deferred to the Editor |
| Q8 — a single `Renderer [ Type ▼ ]` | **open** | `MIGRATION_STATUS.md` |

---

## 10. The decisions I am not taking

Per the instruction, I stop here. Four decisions are structural and gate everything Phase 2
could propose. None of them can be invented from the code or from the ADRs:

1. **Is the order of an Object's Components meaningful?** (§4.2, outcome A or B). All the rest
   of the "reordering" work follows from it.
2. **Does reordering become a first-class Operation** (`MOVE_COMPONENT`, `MOVE_CHILD`,
   `MOVE_OBJECT`), and therefore replicable and undoable — or does it stay outside the protocol?
   ADR-0008 did not anticipate it.
3. **What is a `Resource`, and is there a `Document`?** It is the prerequisite for `.px`, for the
   `Graph`, for project loading and for `px-tabs`. Nothing in the repository lets you infer it.
4. **Does a Component definition have a stable identity distinct from its name?** Without an
   answer, renaming a user Component breaks the projects that use it.

Tell me how you want to settle these — or ask for a Phase 2 that lays out the options with
figures, and for each one: impact on Core / Runtime / Editor / serialization / replication /
Undo-Redo, risks, and rejected alternatives.

**No file modified. No commit. No push.**
