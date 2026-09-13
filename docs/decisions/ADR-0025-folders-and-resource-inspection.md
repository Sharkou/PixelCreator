# ADR-0025 — A folder is a `Resource`, the hierarchy is a `parent` link, and the Inspector inspects resources

- **Status:** **accepted** (2026-08-17)
- **Depends on:** ADR-0010 (an opaque identity), ADR-0017 (IDE state does not enter the model), ADR-0019 (structural Operations), ADR-0020 (`Resource`, `ResourceStore`, the `project/` layer), ADR-0024 (Undo/Redo)
- **Amends:** ADR-0020 §"One unit: `Resource`" — `path` is replaced by `parent`

## Observed context

The Project panel listed the manifest flat and nothing else. Six defects, all of the same kind —
the panel knew things the model did not, or the other way round:

| Finding | Cause |
|---|---|
| No way to create a resource | Creation existed only in `editor.js`, for the starter scene |
| No way to organize | `path` was an indicative string, never read by anyone |
| `Untitled Scene` carried the `Hierarchy` window's icon | One icon table, keyed by a word that designated two things |
| Renaming stopped at the first letter | One operation per keystroke; every operation rebuilt the list, which took the field being edited with it |
| No way to deselect | Selection lived in the panel, with nothing to clear it |
| A selected resource displayed nothing | The Inspector knew only an `Object` |

## Decision

### 1. A folder is a `Resource` of `kind: 'folder'`

**SETTLED.** Not a concept beside `Resource`: an opaque identity, a name, a place in the manifest,
like everything else. What a folder does not have is a payload.

As a consequence, and without a single dedicated line of code: renaming a folder is the
`SET_PROPERTY` that renames a scene; deleting it is the `REMOVE_RESOURCE` that deletes a graph;
both are replicated, arbitrated and undoable (ADR-0019, ADR-0024).

> A second concept — a `Folder` as a peer of `Resource` — would have produced two identity schemes,
> two sets of Operations, two undo stacks and two serialization paths, to represent "a thing that
> carries a name and contains other things". That is exactly the argument ADR-0020 already makes
> against `Asset` and `Document`.

### 2. `parent` replaces `path`

**SETTLED, and it is an amendment to ADR-0020.** `path` was a string: the hierarchy was therefore a
naming convention.

| With `path` | With `parent` |
|---|---|
| Renaming a folder = rewriting every entry that mentions it | Nothing to rewrite: the name is elsewhere |
| Two entries can disagree about `assets/` | There is only one `assets`, designated by its id |
| Nothing says whether `assets/` exists | A parent names a resource that exists, or the operation is refused |
| Moving = rewriting a string | Moving = `SET_PROPERTY parent`, invertible |

It is the same idea as `Object.parent` in the Core: **structure is a link, never a path**. The
displayed path (`Assets/Images`) is **derived** (`folderPath()`), and therefore always right.

`MANIFEST_VERSION` goes to **2**. No migration is written: there is no format-1 project
(ARCHITECTURE.md §10).

### 3. No new Operation

Moving is `SET_PROPERTY parent`. Creating is `ADD_RESOURCE`. Deleting is `REMOVE_RESOURCE`.
**ADR-0019's list does not move** — that is the honest test of whether folders fit the model: if a
`MOVE_RESOURCE` had been needed, the model would not have been representing them.

What is added is a **guard**, not a type: a `parent` that names an unknown resource, a
non-folder resource, the entry itself or one of its descendants is **refused**
(`applied: false`). The guard lives in the handler, so it applies to a replicated operation too
(ADR-0019 §5).

### 4. Deleting a folder deletes its contents — and what a resource owns

**SETTLED.** A folder takes what it contains with it, in **one `batch`**, so a single `Ctrl Z` gives
it back whole, payloads included (ADR-0024).

The alternatives were rejected: moving the children up one level silently rearranges a project
somebody was tidying; leaving them under a vanished folder loses them without saying so.

~~**A resource can also own another.**~~ **Obsolete since ADR-0026:** a Component and its graph are
now **one** `.px` resource, so there is no ownership to track inside a payload. Deleting a `.px`
deletes the graph because it was the same file.

### 5. What the manifest additionally carries

`created` and `modified`, in epoch milliseconds, **stamped by the author** like the identifier and
for the same reason (ADR-0019 §7). `modified` advances with `revision`, in the same `batch` as a
payload write.

**Size** does not go into the manifest: it belongs to storage, which either measures it
(`ResourceStore.size(id)`) or **admits it cannot** by answering `null`. A panel that displayed
"0 B" for a file that was never measured is lying; a panel that displays "—" tells the truth.

### 6. Renaming is **one** intent, not one per keystroke — AMENDED (ADR-0026)

> **Amendment of 2026-08-18.** The conclusion "write on commit" is reversed: the model moves on
> **every keystroke**, as everywhere else in the Editor, and it is the `batch` minted for the typing
> session that keeps **one** history entry. The reasoning below remains right in substance — a
> rename is an intent — and it is the means that was wrong: committing cost reactivity for a
> problem the format already knew how to solve (ADR-0024 §4).

**SETTLED, and it is a deliberate exception to the letter-by-letter rule.**

The Property System propagates on every keystroke, and that is the product's ergonomics: typing in
the Inspector retitles the Hierarchy row immediately (ADR-0003, EDITOR.md). That rule applies to
**the scene model**, where a write is a value that lives.

A resource's name is a one-off authoring act: one operation per character produces eleven history
entries for "New Folder", and eleven replicated operations for one word. Renaming a resource **is
therefore committed** (Enter, or losing focus), and abandoned by Esc with nothing emitted.

`<px-field>` receives two options for this — `write` (the arbitrating pipeline is not a Component's)
and `commit: 'change'`. Two options, not a second control.

### 7. Resource selection belongs to the `Workspace`

Two windows need the same answer — the panel highlights a row, the Inspector displays fields — so it
cannot belong to either. It lives in the `Workspace`, as a `ResourceId` and not as the entry: a
retained entry would survive the resource's deletion.

**An `Object` and a `Resource` are mutually exclusive**, because there is one Inspector. The
exclusion is wired in `editor.js` — neither window needs to know the other exists.

What stays with the panel: **which folder is open**, and the search text. Window state, never
project state (ADR-0017).

### 8. `Ctrl Z` follows the last intent emitted

One stack per resource (ADR-0024) forces the shortcut to designate **which**. Selection cannot
answer that: deleting a resource clears it, and the undo that would restore it would then target
the scene.

The `Workspace` therefore remembers the **context** — `'scene'` or `'project'` — from the pipeline
on which an operation was just announced. It is "what the creator was doing", and it survives the
disappearance of the selection.

### 9. The Inspector routes, it does not branch

A `Resource` panel beside the `Object` panel, built from the same primitives: the same identity
header, the same sections, the same rows, the same `<px-field>`.

**What differs from one `kind` to another is one table row**, in `editor/inspector/resource.js`:
extra fields, and possibly a way to show its content. Adding a kind is two lines; nothing in the
window learns its name. The chain of `if (kind === 'image')` that every asset browser ends up
producing is what this table exists to prevent.

`describeResource()` is **pure** — a manifest entry and a context in, descriptors out — exactly like
`describeComponent()` (ADR-0007), and for the same reason: the hard part of the panel is testable
under Node.

### 10. A `kind` may declare that it needs a file

The creation table (`editor/project/commands.js`) carries an optional `pick`. The panel reads **the
flag**, never the kind: it asks for a file, reads it, and passes it to `create`. That is what lets
image import exist without the window learning what an image is.

The encoding adopted today — a data URL in the in-memory store — is **named nowhere in the model**:
an IndexedDB store will keep the Blob, and only the store and the reading function will change.
Nothing enters a scene's JSON as base64 (ADR-0020).

## What this ADR does not decide

- ~~**Ordering inside a folder.**~~ **Decided on 2026-08-18 (ADR-0026):** `MOVE_RESOURCE` carries
  the folder AND the rank, like `REPARENT` for objects.
- **Closing an editor.** Until it exists, the open resource — and any folder containing it — cannot
  be deleted: the command is disabled and says why.
- **Importing resources from another project.** Unchanged since ADR-0020: a remapping pass at
  import time, not built.
- **Thumbnails, search by type, tags.** Nothing asks for them yet.

## Consequences

### Positive

- Project becomes a real resource manager: create, file, rename, move, delete, inspect — all through
  existing Operations.
- Renaming a folder breaks nothing, because nothing references its name.
- A new `kind` appears in the menu, the list, the icons and the Inspector by adding two table lines.
- Undo/Redo covers resources with no dedicated history code.

### Negative

- `MANIFEST_VERSION` goes to 2; format-1 projects are not read (there are none).
- An exception to letter-by-letter propagation now exists, and it has to be stated where it applies
  — which is done in `<px-field>` and here.
- A Component's ownership of a graph is read from a payload, and therefore invisible in the
  manifest. That is the price of not having invented a second link.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Keeping `path` and deriving the tree from strings** | Renaming a folder rewrites every entry; two entries can contradict each other; nothing guarantees a folder exists |
| **A `Folder` type beside `Resource`** | Two identities, two sets of Operations, two undo stacks — ADR-0020's argument against `Asset` |
| **`MOVE_RESOURCE` as an Operation** | Moving changes a field. `SET_PROPERTY` already does that, and already inverts |
| **Moving the children of a deleted folder up** | It silently rearranges a project someone was tidying |
| **Renaming letter by letter as in the scene** | Eleven replicated operations and eleven undo entries for one word |
| **Resource selection inside `<px-project>`** | The Inspector would have to read from another window; two sources of truth |
| **One Inspector per kind** | Two panels to keep in step, and the chain of `if`s comes back through the back door |
