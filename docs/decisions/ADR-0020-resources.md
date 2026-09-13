# ADR-0020 — `Resource`, `ResourceId`, `ResourceStore`, and the `src/project/` layer

- **Status:** **accepted** (2026-08-14)
- **Depends on:** ADR-0010 (identity by ID), ADR-0011 (an authoritative server), ADR-0017 (IDE state does not enter the model)
- **Completed by:** ADR-0021 (a definition's identity), ADR-0024 (Undo/Redo)

## Observed context

Legacy derived a resource's identity from its location: `id = path + name`
(`ARCHITECTURE.md` §9). Renaming a file therefore changed **what it was**, and broke every
reference to it. Binary payloads travelled as base64 **inside** a scene's JSON, which made images
travel with every replicated snapshot.

v2 had no notion of a resource: `Store` (IndexedDB) was written and unused, and nothing loaded a
project.

## Decision

### 1. One unit: `Resource`

`kind ∈ { folder, scene, component, graph, asset }` — **`folder` added by ADR-0025**.

| | |
|---|---|
| **Identity** | an opaque `ResourceId`, **immutable**, independent of the name and of the filing |
| **Holds** | `id`, `kind`, `name` (displayed), `parent` (filing), `revision`, `created`, `modified`, `mime` for an asset |
| **Does not hold** | a reference by path; execution state; Editor state |
| **Owner** | the **Project** layer |

- `id` — identity. Never derived from the name or the filing, never reused.
- `name` — display. Editable, non-unique, **referenced by nothing**.
- `parent` — filing, **by identity**. Moving it breaks nothing.

> **Amended on 2026-08-17 (ADR-0025).** This section used to say `path` — an indicative string. A
> string made the hierarchy a naming convention: renaming a folder forced a rewrite of every entry
> mentioning it, and nothing said a folder existed. `parent` names a `Resource` of
> `kind: 'folder'`, as `Object.parent` names an object; the displayed path is **derived**.
> `MANIFEST_VERSION` goes to 2.

Moving a project: the paths change, the ids do not. Copying a project: identical ids, internal
coherence preserved. Renaming: a display field moves, nothing else.

**Importing a resource from another project** is the only conceivable collision case; the honest
treatment is a remapping pass at import time. **It is not built.**

### 2. `Asset` does not exist as a concept

An image is a `Resource` of `kind: 'asset'` whose payload lives outside the JSON. Making it a peer
of `Resource` would create two identity schemes, two forms of reference in a property, two loading
and replication paths — and would leave unanswered: why would an image be an `Asset` and a `.px` a
`Resource`, when a property references them the same way?

"Asset" stays an interface word. Not a model concept.

### 3. `Document` does not exist

| What `Document` would bring | Who already holds it |
|---|---|
| identity | `Resource.id` |
| content | the payload |
| persistence | `ResourceStore` |
| a "modified" state | derivable from the resource pipeline's `'operation'` event |
| an undo stack | the history, **per resource**, therefore already indexed by `ResourceId` |
| view state (scroll, zoom, collapse) | **Editor state, which never enters the project** |

`Document` would therefore be either an alias for `Resource`, or a mixture of model and IDE state —
the exact mistake `scene.current` was in Legacy, and that **ADR-0017** forbids.

**What a tab opens is called an `OpenEditor`**: `{ resourceId, kind, viewState, history }`, an
Editor-layer object, **never serialized into the project**. Its possible persistence ("which tabs
were open") belongs to a *workspace*, a disposable artefact whose loss costs nothing.

### 4. `ResourceStore` is the only point of contact with storage

```
list()            manifest entries
read(id)          payload
write(res, data)  persists
delete(id)
```

One interface, several implementations, none in the Core: memory (tests, startup), IndexedDB
(local / offline), HTTP (later — only the implementation changes).

The contract is **asynchronous**: every method may return a promise, and callers wait. A store
talking to IndexedDB or to a server cannot be synchronous, and pretending otherwise would force a
rewrite of every caller the day it arrives.

**Lazy loading, by identifier:** opening a project reads the manifest, not the payloads. **A binary
payload is never base64 inside a scene's JSON.**

### 5. A new `src/project/` layer

```
editor/  ──►  project/  ──►  core/
runtime/ ──►  core/
core/    ──►  (nothing)
```

`project/` imports neither the DOM, nor `runtime/`, nor `editor/`. A headless server must be able
to load a project — which is what **ADR-0011** requires.

`runtime/ → project/` is forbidden too: it would put storage behind a runtime API, which is exactly
what `behaviors.bind(type, graph)` — which takes an **already-resolved** graph — exists to avoid.

**The rules are declared in `tools/layers/rules.js` and checked on every run**, not merely written
here.

### 6. A second `Operations` pipeline, not a second system

A Scene pipeline's `resolve` resolves `Object` identifiers; it cannot resolve a resource. The
Project therefore instantiates its own `Operations`: the same class, the same contract, the same
anti-echo, a different `resolve` — exactly as a detached `Object` already instantiates its own.

`ADD_RESOURCE` / `REMOVE_RESOURCE` follow from it, and are invertible like the rest (ADR-0019).

### 7. `revision` serves two purposes, and only two

Telling `Behaviors` that a graph has changed, and telling the Editor that a panel must be rebuilt.
**Instances do not store a `revision`** — that is what keeps structural reconciliation simple
(ADR-0021).

## What this ADR does not decide

| Open point | Where it will be settled |
|---|---|
| The IndexedDB implementation and the HTTP cache policy | with offline mode |
| Identifier remapping on cross-project import | when import exists |
| The undo scope of an action touching two resources | when the `Graph` window exists (see ADR-0024) |
| The binary format of asset payloads | with the asset pipeline |

## Consequences

### Positive

- Renaming, moving and copying become free — Legacy's defect disappears by construction.
- A replicated scene no longer carries images.
- A headless server loads the same project a browser does.
- Creating and deleting a resource is replicable and undoable, with no dedicated code.

### Negative

- One more layer, and one more dependency rule to enforce.
- The store's asynchronous contract propagates to the callers (`loadComponentDefinitions` is
  `async`) even when the implementation is synchronous.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **`Document` as the editing unit** | Either an alias for `Resource`, or a mixture of model and IDE state. That is `scene.current` coming back. |
| **`Asset` as a peer of `Resource`** | Two identities, two references, two loadings, two replications, for no reason. |
| **Putting loading in `editor/`** | A server cannot depend on an IDE (ADR-0011). |
| **Identity = path + name** | That is exactly Legacy's defect: renaming changes what a thing is. |
| **A base64 binary payload inside the scene** | It makes images travel with every snapshot. |
