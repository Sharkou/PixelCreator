# ADR-0061 — A prefab is a Resource, resolved **before** the simulation

- **Status:** **accepted** (2026-09-11)
- **Decides:** what a prefab **is**; Resource or special Scene; its format; how the Runtime resolves it synchronously; who loads it and when; the identities; the internal `objectref`s; the external `objectref`s; instantiation; the difference from duplicating a live Object; the deliberate absence of a live prefab ↔ instance link; compatibility with `Spawn`
- **Depends on:** ADR-0010 (an identity is never a name), ADR-0011 (the server is authoritative), ADR-0012 (isolation), ADR-0018 (structural order is data), ADR-0019 (structural Operations), ADR-0020 (Resource, an **asynchronous** `ResourceStore`), ADR-0021 (a definition's identity), ADR-0023 (the type says what a value means), ADR-0024 (undo/redo), ADR-0026 §6 (the drag-and-drop table) **and §7** (the prefab was deferred), ADR-0031 §3 (lists), ADR-0034 §3.2/§3.4/§3.5 and invariant 5 (the scope of a reference, two failure families, a node produces no Operation), ADR-0056 (a copy is the model), ADR-0057 §3 (identities come from the simulation), ADR-0042 (the bundle is the boundary)
- **Amends:** ADR-0026 §7 ("a prefab is not a format, it is a decision — **deferred**")
- **Does not decide:** overrides, revert, "apply to prefab", nested prefabs, a prefab rendered in the Project — see §12

---

## 1. Problem

`Spawn` instantiates an Object **already alive in the Scene** (ADR-0056). It is the right decision and
it has a cost every project ends up paying:

> To fire a bullet, you have to keep **a hidden bullet** in every scene.

That hidden model is an Object like any other: it appears in the Hierarchy, it is simulated on every
step, it collides, it is drawn if you forget to turn it off, it is saved into the scene, and it has to
be recreated identically in every scene that needs it. A creator who wants "an enemy" gets "an enemy,
plus an undead enemy parked off-screen".

What was missing is a **reusable model that belongs to no scene**.

ADR-0026 §7 had refused to invent it, and for a good reason: what a prefab contains, how an instance
stays linked to it, what an override means. This ADR answers all three — the third in the negative,
explicitly (§9).

---

## 2. What a prefab **is**

> **A prefab is a `Resource` whose payload is a serialized subtree.**

`kind: 'prefab'`, extension `.prefab`, an opaque `ResourceId`, a payload read by identity. Nothing
more. It is one more line in ADR-0020's enumeration, and the rest of the Resource system — renaming,
filing, moving, deleting, replicating, undoing, bundling — works with not one more line of code.

### A Resource, and not a special Scene

A Scene and a prefab **share a payload shape** — both are serialized Objects — and share nothing else:

| | Scene | Prefab |
|---|---|---|
| What it is | a place you play in | a description used to make a piece |
| Roots | several, ordered | **one** |
| Opens | in a tab, is played | never: it is instantiated |
| A camera, a name shown to the player | yes | no |

A flag on `kind: 'scene'` would force every reader to ask *which of the two* it is holding, and the
first one to forget opens a prefab as a level. Two kinds, two icons, two sentences in the drop table:
the distinction is visible everywhere, for free.

### Neither a class, nor a third Object

There is **no** third representation of an Object. There is the live Object, and there are the records
`serializeObject()` already writes. A prefab is an array of the latter — which is exactly what
`restoreSubtree()` knows how to put back, what an undone deletion replays, and what a duplication
produces along the way.

---

## 3. The format

```js
{
    version: 1,
    root: '<ObjectId of the root, at the moment the model was written>',
    objects: [ /* serializeObject() of the root, then of the descendants, in canonical order */ ]
}
```

- **`objects` is `serializeObject()`'s output, verbatim**: `id`, `name`, `tag`, `layer`, `active`,
  `lock`, `owner`, `parent`, `children`, `components`. Nothing is added, nothing is renamed. A field
  added to an Object arrives in prefabs the same day, with no migration.
- **The root's `parent` is `null`**: a prefab has no scene in which to have a parent, and keeping the
  original parent would name an Object absent from the payload — precisely what §6 refuses. Every
  other one keeps its link, which points inside the subtree by construction.
- **`root` is named, not assumed to be first.** It is first in everything this repository writes;
  naming it is what makes a payload survive an editor, a merge or a hand edit that reordered the list,
  for the price of one `find`.
- **`version` is refused if it is unknown.** Like a graph (ADR-0027) and like a bundle (ADR-0042):
  nothing beneath it can be believed in a shape never read. The answer is `null`, not an exception —
  a prefab you cannot instantiate is a **game state**, and the flow after a `Spawn Prefab` continues
  anyway (ADR-0034 §3.4).

---

## 4. The central constraint: **resolve before, never during**

It is the reason the prefab did not exist, and it remains entirely valid:

> A Resource is read through an **asynchronous** store (ADR-0020 §4).
> A `Runtime.step()` **cannot wait**.

The interpreter has not become `async` and will not: a simulation step that can suspend is no longer a
step, the game loop can no longer count it, and the server and the client stop running the same thing
(ADR-0011). Nothing in `core/prefab.js` touches storage and nothing in it is asynchronous.

**The resolution simply moved to another moment.**

```
Bullet.prefab                      a Resource: a serialized subtree
     │
     ▼   (asynchronous, BEFORE the match — project/prefabs.js)
project.read(id)
     │
     ▼
PrefabRegistry.set(id, payload)    an in-memory Map
     │
     ▼
new Runtime(scene, { prefabs })    the Runtime receives a VALUE, never an identifier
     │
     ▼   (synchronous, DURING the step)
ctx.prefabs.get(id)  ->  instantiatePrefab(scene, definition)
```

It is exactly the shape `loadComponentDefinitions()` already has for a `.px` (ADR-0016, ADR-0020 §5):
the Project layer reads, the Core transforms, the Runtime receives a resolved object.
`behaviors.bind(type, graph)` takes a **resolved** graph for that precise reason; here `prefabs` is a
**resolved registry**, for the same one.

**The Runtime never asks for anything but `get(id)`.** It has no `load`, no `fetch`, no promise and no
store. `runtime -> project` stays forbidden and checked (`tools/layers/rules.js`).

**`PrefabRegistry` lives in the Core**, because the node that reads it is Core code and because it
holds nothing but data. It is **not a cache**: a cache decides when to fill itself, and this one is
filled by whoever owns the project, never by itself — so there is no policy to get wrong.

### Who fills it, and when

| Application | When | Where |
|---|---|---|
| **Preview / a published game** | when the bundle opens, before the first frame | `preview/client.js` → `loadPrefabs()` |
| **Editor, the Play button** | on the press, before `transport.play()` | `editor/project/session.js` → `refresh()` |
| **A headless server** | when the project loads | `loadPrefabs()`, the same call |

`Transport.prepare()` is separate from `Transport.play()` on purpose: `play()` is the state machine, it
is synchronous, and each of its tests is (ADR-0029). Reading a project is asynchronous. The button
awaits the first before calling the second; a caller that skips `prepare()` gets a match with no
resolved prefabs, which is exactly what it had before.

The Editor's session re-reads **by `revision`** (ADR-0020 §7): what has not moved is not re-read, what
has been deleted is forgotten — otherwise a game would keep spawning a prefab the Project panel no
longer shows.

---

## 5. Instantiation: one machinery, two descriptions

`duplicateObject()` and `instantiatePrefab()` differ in **where the description comes from** and in
nothing else. Both:

1. draw a fresh identity for **the whole subtree at once**, before rebuilding anything;
2. rewrite `parent`, `children` and every **internal** `objectref` through that table;
3. pass the result to `restoreSubtree()`.

That machinery is therefore written **once**, in `core/instantiate.js`, and both functions are callers
of it. Writing it twice is precisely how the two would end up disagreeing about what an `objectref` is,
the day a third caller arrives.

The whole table is drawn **before** a single field is rewritten: a parent naming a child, a child
naming its parent, two siblings naming each other and a cycle between two Components are all the same
lookup in a table that is already complete. No pass can reach a reference before its target has an
identity, because no identity is drawn during the pass.

**Who mints the identities stays the caller's business** (ADR-0057 §3): the Editor draws from the
platform's CSPRNG as for any authoring act, the Runtime passes its own seeded source because a spawn
is a **consequence of a step** and a server and a client have to agree about what was created.

### `freshRecords()`: two endings, one remapping

The remapping is separate from the writing, because the two callers do not want the same ending:

| Caller | Ending | Why |
|---|---|---|
| Runtime (`Spawn`, `Spawn Prefab`) | writes **directly** into the Scene | a spawn is a **simulation output** and produces no Operation (ADR-0034 invariant 5) |
| Editor (placing a prefab) | submits an **`ADD_OBJECT`** carrying the same records | placing is an **authoring intent**: replicable and undoable (ADR-0019, ADR-0024) |

`ADD_OBJECT` already carries a whole subtree — that is what makes undoing a deletion put the children
back — so placing a prefab needs no new operation type, and `Ctrl Z` takes the whole instance back in
one entry.

---

## 6. References: the same rule, stated from both ends

`duplicateObject()` (ADR-0056 §6): *an identity is rewritten exactly when it is in the table this
duplication drew.* Duplicating a turret whose gun names its own base gives a gun naming **the copy's**
base; duplicating a bullet that names the player leaves the player, because the player was not copied.

A prefab asks the same question from the other end, because it **leaves the scene**:

> **A reference is kept exactly when the model contains its target.**

| Case | When the prefab is created | At instantiation |
|---|---|---|
| points **inside** the subtree | kept as it is | rewritten to the instance |
| points **outside** | **cleared** (`null`), and reported | nothing to rewrite |
| an `array<objectref>` list | keeps what points inside, drops the rest | rewritten element by element |
| `null`, absent, or dead | unchanged | unchanged |

### Why cleared, rather than refused or kept

Three honest answers existed:

| Answer | Why not / why yes |
|---|---|
| **Refuse the prefab** | It makes a commonplace arrangement unauthorable — a turret aiming at the player. A creator cannot "repair" a model that refuses to exist |
| **Keep the `ObjectId`** | It writes a **dependency on a scene** into a project-scoped Resource. In any other scene the identity resolves to nothing — or, far worse, resolves to **another** Object. That is exactly what ADR-0034 §3.5 forbids writing into a `.px`, one scope down |
| **Clear it, and say so** | ✔ The value becomes `null`, which is already what "points at nothing" means in the format (ADR-0023). What was cleared is **returned to the caller**, so the Editor says so — a creator who silently loses a wiring loses an afternoon |

The contract is therefore explicit both ways: nothing phantom, and nothing lost without a sentence.
`externalReferencesOf()` asks the same question **without writing**, so that a panel can warn before
acting.

**And the rule is asked of the schema, never of the value.** What is examined is a property whose
**declared** type is `objectref`, or a list whose declared element is. A string that *looks like* an
identifier is a string; scanning values would rewrite a player's name the day someone called their
level `abcdefghjkmnpq`.

A type the registry does not resolve declares nothing, and its values travel **verbatim** — the same
answer `MissingComponent` gives everywhere else (ADR-0021).

---

## 7. What distinguishes a prefab from a duplication

| | `Spawn` (duplication) | `Spawn Prefab` |
|---|---|---|
| The model is | an Object **alive in this scene** | a **Resource** of the project |
| It has to exist | in the scene, all the time | nowhere in the scene |
| Usable by | this scene | every scene, and as many times as you like |
| External references | **kept** (the same scene) | **cleared** at creation (§6) |
| The copy lands | beside its model, last among its siblings | at the root, or wherever the caller says |
| Resolution | immediate, it is a handle | a table resolved before the simulation |

Both produce ordinary Objects, with fresh identities and the same remapping rules.

---

## 8. Instantiating from the Editor

| Gesture | Effect |
|---|---|
| Drag a **Hierarchy** row into **Project** | creates `ObjectName.prefab` in the target folder |
| Right click a row → **Save as Prefab** | the same, at the project's top level |
| Drag a `.prefab` from **Project** into the **Scene** | places an instance at the release point |
| Drag a `.prefab` into the **Hierarchy** | places an instance at the origin — a list is not a place |

All four go through **the same rule** in `dnd/rules.js`: ADR-0026 §6's table gains two lines, no second
drag-and-drop infrastructure exists, and the menu entry calls `performDrop()` rather than
reimplementing the gesture.

The initial name is the Object's, with the extension its kind decides and the uniqueness counter every
Resource receives (ADR-0026 §4). **No popup**: a creator who wants another name renames the tile, which
is the gesture they already know.

The prefab is then an ordinary Resource: its own large icon (neither the image thumbnail nor the
Component cube — a `.px` is a **capability an Object has**, a prefab is a **description of Objects**),
renameable, deletable, movable between folders, bundled.

---

## 9. **No live prefab ↔ instance link** — and that is a decision, not a gap

> **A prefab is a creation model, not an inheritance system.**

Instantiating produces **ordinary Objects**. After that:

- the instance keeps **no memory** of where it came from;
- nothing in a saved scene names the prefab;
- modifying the prefab touches **no** existing instance;
- there is no override, no revert, no "apply to prefab", and no "broken" instance when the Resource is
  deleted.

That is deliberate and it is not a shortcut. Unity's override system is a good product and a **big**
one; what it requires first is a decision about what an override **is**: which properties may diverge,
what a child added to an instance becomes when the model adds one too, what reordering Components on
both sides means, how all of that replicates and undoes. Taking that decision **in passing**, in order
to ship a prefab, would be exactly what ADR-0026 §11 files among "the decisions a hasty implementation
takes in the architect's place".

The positive consequence, and it is a large one: **a saved scene depends on no Resource**. Deleting
`Bullet.prefab` breaks no scene; there is simply nothing left to spawn, and that is all.

The way back is open. The day an override is designed, what has to be added is a field on the instance
("I come from that prefab") and a delta; the **prefab's format** does not move, because it is already
an Object's format.

---

## 10. `Spawn` stays `Spawn` — two nodes, not a polymorphic socket

```
Spawn          Model   : a live Object (a handle, an `object` port)
Spawn Prefab   Prefab  : a Resource    (an identity, a `resource` port)
```

**Why two.** A live Object travels on a wire as a **handle** (ADR-0034 §3.2); a prefab is a
`ResourceId`, that is, a **string**. A single `Model` port would have to be typed `any`, and the node
would then have to **guess**, at run time, whether the string it was given names an Object of this
scene or a Resource of this project. It is the one thing this repository absolutely refuses to make a
Runtime do.

**And it costs no migration.** `Spawn` is untouched: every graph written before this slice means
exactly what it meant, and a creator who never makes a prefab never meets the second node. A union
socket, or a `Spawn` that changed shape, would have bought one menu line at the cost of migrating every
existing `.px`.

**No X or Y on the new node either.** `Set Position` already says "put this Object here" (ADR-0045
§11.2), and the `Spawned` output hands it to the next node immediately. A port would have a default
**value**, so an untouched `Spawn Prefab` would read `X 0  Y 0` and teleport every instance to the
origin.

---

## 11. The refusals this ADR lifts, and those it keeps

| Gesture | Before | Now |
|---|---|---|
| Object → Project | *"Prefabs are not designed yet"* (ADR-0026 §7) | creates a prefab |
| Prefab → Scene / Hierarchy | nothing — no rule | places an instance |
| Prefab → the Component list | nothing | **refused**: a prefab is not a capability an Object has |
| Prefab → a `resource` property | depending on the clause | accepted if the property declares `kind: 'prefab'` — ADR-0007's generic clause, with no new code |

---

## 12. What this ADR does not decide

| Open point | Why |
|---|---|
| **Overrides, revert, "apply to prefab"** | §9. Each requires a decision first about what an override *is* |
| **A prefab inside a prefab** | Nothing in the format forbids it — a subtree is a subtree — but "a nested instance" only means something with a live link, which does not exist |
| **Editing a prefab in a tab** | A prefab is edited today by placing an instance, modifying it and saving it again (`savePrefab`). A dedicated editor needs a working scene, a camera and an opening cycle: that is the window `Workspace` will learn to open, not a format |
| **Variants / presets** | A prefab inheriting from a prefab is the same problem as the override |
| **Cross-project import** | ADR-0020 §1 leaves it open for every Resource; a prefab changes nothing about the question |
| **A gizmo or a rendered preview in the Project** | It requires rendering a scene offscreen; the large kind icon is enough and honest |

---

## 13. Counter-tests

| What is checked | Where |
|---|---|
| A prefab is `serializeObject()`'s output, field for field | `core/prefab.test.js` |
| Components, values, children, order, local Transform, tag, layer | the same |
| The root's `parent` is `null`; an internal link is intact | the same |
| An unknown version, an empty payload, a missing root: refused | the same |
| The root is **named**, not assumed first | the same |
| An internal reference kept; an external one cleared **and reported** | the same |
| A list keeps the inside and drops the outside | the same |
| An unresolved type keeps its values verbatim | the same |
| An instance carries **no** identity from the model | the same |
| Two instances share **no** identity | the same |
| The internal `objectref` is remapped **per instance** | the same |
| Modifying the model afterwards does not touch the instance | the same |
| A prefab and a duplication give the same result, bar the landing place | the same |
| `.prefab`, renaming, folders, deletion: nothing specific | `project/prefabs.test.js` |
| `loadPrefabs()` fills a registry that answers **without waiting** | the same |
| An unreadable payload is reported and skipped | the same |
| A scene that has **never** held the model still spawns | `runtime/prefab-spawn.test.js` |
| `Spawned` feeds `Set Position` immediately (no `Spawn X/Y` needed) | the same |
| Three spawns, three independent instances | the same |
| An unresolved prefab, a Runtime with no registry: nothing, and no error | the same |
| The same seed → the same identities; a different seed → different ones | the same |
| Bundle → `openBundle` → `loadPrefabs` → a synchronous registry | the same |
| A scene full of instances saves and reloads **without** the prefab | the same |
| A scene's payload holds neither a `ResourceId` nor a model identity | the same |
| `Spawn` still copies a live Object — no existing graph changes | the same |
| The two nodes have two port types: nothing is `any` | the same |
| Hierarchy → Project creates the prefab; Project → Scene places the instance | `editor/dnd/dnd.test.js` |
| Placing = **one** history entry, and the undo takes back the whole subtree | the same |
| Two placements = two names a creator can tell apart | the same |
| The prefab rule comes before the generic rules, and says what it will do | the same |
| A prefab with no payload places nothing and does not throw | the same |
| Re-reading by `revision`, forgetting a deleted Resource | `editor/project/session.test.js` |

---

## 14. Consequences

### Positive

- **No more hidden models.** A scene holds what a player sees, and nothing else.
- One prefab serves several scenes, several times per scene, after saving and reloading, in the Preview
  as in the Editor.
- ADR-0020's asynchronous constraint is **honoured rather than worked around**: the interpreter stays
  synchronous, the Core still does not see storage, `runtime -> project` stays forbidden.
- Identity remapping exists in a single copy, shared with duplication.
- A saved scene depends on no Resource: deleting a prefab breaks nothing (§9).
- ADR-0026 §7 is closed, and the drop table gains two lines rather than a system.

### Negative

- `ResourceKind` gains a value: any code enumerating kinds has one more line (a test checked it and was
  updated).
- A prefab silently **loses** its external references if it had any — mitigated, not removed, by the
  report `createPrefab()` returns and the Editor displays.
- The Play button becomes asynchronous (`prepare()` before `play()`). The state machine itself stays
  synchronous.
- Two `Spawn` nodes in the menu: a creator has to choose. That is the price of never making a Runtime
  guess, and §10 says why it is the right one.
- No live link: modifying a prefab after placing ten instances means replacing the ten. That is §9's
  choice, not an oversight.
