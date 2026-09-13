# ADR-0071 — A preview follows all three models

- **Status:** **accepted** (2026-09-12)
- **Decides:** what crosses the live channel; under what name the manifest travels; where a game
  client reads its images and sounds from; by what path a resource's contents are replaced
- **Depends on:** ADR-0020 (`Resource`, `ResourceStore`, an asynchronous store), ADR-0042
  (the preview is a runtime client), ADR-0044 (the live channel, two kinds of message),
  ADR-0062 (one table of resolved resources), ADR-0069 (a save is not an
  intention), ADR-0070 (`SET_PAYLOAD`)
- **Does not decide:** multi-user collaboration, a network transport, the ordering of two editors
  on one project — see §6

---

## 1. The defect

A creator opens a preview, goes back to the Editor, **recuts their tileset** — and the window next
to it goes on playing the old cutting. The same for a retimed clip, a replaced prefab, an imported
image: none of it ever reached a window that was already open.

This is not an announced limitation. ADR-0044 §3 says a preview follows the Editor, and the
Editor's own viewport does update itself on **exactly those operations**: `editor.js` asks
`session.refresh()` again as soon as an operation touches a resolved resource. Half the sentence
had been written.

The cause is narrow. `broadcastEdits()` follows "every attached model" — the scene, each `.px` —
and the manifest is attached to nothing: it is one more model, with its own pipeline
(`project/project.js`), that nobody was following.

---

## 2. The decision

**The manifest crosses the same channel, as an Operation, under the project's identity.**

```
px.live.<projectId>
   ├── resource = <sceneId>       a scene operation      — a state you live in
   ├── resource = <pxId>          a whole definition     — a file you read
   └── resource = <projectId>     a manifest operation   — what the project DECLARES
```

No kind of message is invented: ADR-0044 says "no protocol is invented here, what crosses is an
Operation", and a manifest operation is one. The follower tells the three apart **by the name they
arrive under**, which it was already doing.

### 2.1 Only intentions cross

`forwardOperations()` now relays nothing but `Origin.EDITOR`. That is the rule ADR-0069 §2 laid
down for the history and for "which document is being edited", applied to the wire: a save's
bookkeeping — `revision`, `modified` — carries no payload, so a follower that applies it learns
nothing and re-resolves a definition it already holds, twice per autosave.

### 2.2 What a follower does with a manifest operation

`apply()`, never `submit()` — ADR-0011's unchanged rule. Writing the entry also writes its payload
into the store the page queries; what remains to be done is to **forget what had been resolved from
the old one**:

| What moved | What is forgotten |
|---|---|
| an image | `ImageCache.invalidate(id)` — the next frame decodes the new one |
| a prefab, a clip, a tileset | the `ResourceRegistry` entry, read again from the store |
| a deleted resource | both, so that a game stops spawning what the project no longer declares |

It is the pair of tables `editor/project/session.js` already keeps, and the same rule
(ADR-0062 §1).

---

## 3. The client reads its store, not the bundle

`openBundle()` writes each payload into a `MemoryResourceStore` — and then `client.js` went back to
read the **frozen bundle** for images and sounds. A resource that arrived after the window opened
was not in it, by construction.

Both resolvers now read `opened.store`. Nothing else changes: that store answers immediately, so
`draw()` still waits for nothing (ADR-0062 §2).

---

## 4. Replacing contents is an intention

`Replace…`, and dropping a file on a *Content* section, wrote through `project.save()` — the
bookkeeping path. ADR-0070 §5 draws the line itself, though: `save()` writes what a live model has
already decided; **changing the contents of a resource that has no live model is an intention**, so
`SET_PAYLOAD`.

A creator gains the two things the pipeline gives, and both were missing:

- **replacing the wrong file can be undone** — the old bytes travelled nowhere, so they were lost;
- the replacement **crosses over**, which is this ADR's subject.

The `mime` and the payload share a `batch`: a single `Ctrl Z`.

---

## 5. What this does not change

- A preview still cannot create anything: it applies, it never emits (ADR-0042 §5).
- The scene is still kept up to date by the operations that changed it, never replaced wholesale.
- A `.px` still crosses whole, at most once per frame (ADR-0044).
- `preview/` still imports nothing from `editor/`, and `tools/layers` checks it.

---

## 6. What this ADR does not decide

- **Multi-user collaboration.** Two editors on one project, the ordering of their operations,
  conflict resolution: none of that is decided here. What is settled is more modest and enough:
  the format that crosses is the one a server will relay (ADR-0011).
- **A preview that would answer the Editor.** The wire stays one-way.
- **Reloading a scene open in a preview.** A `Load Scene` operation is still what ADR-0063 says it
  is.
