# ADR-0065 — A project outlives the tab

- **Status:** **accepted** (2026-09-12)
- **Decides:** which `ResourceStore` implementation persists; how it is testable without a browser; what an autosave writes and when; who lists the projects; what happens when the browser refuses
- **Depends on:** ADR-0010 (an identity is never a name), ADR-0017 (IDE state does not enter the model), ADR-0019 (Operations), ADR-0020 §3 and §4 (Resource, asynchronous store, lazy loading), ADR-0024 (per-resource undo), ADR-0026 §3 (the model moves on every keystroke), ADR-0054 (say what is true)
- **Does not decide:** remote synchronisation, accounts, sharing, schema migration, importing and exporting a project between browsers — see §5

---

## 1. Problem

ADR-0020 §4 described `ResourceStore` as "one interface, several implementations: memory,
IndexedDB, HTTP". **Only the first was ever written.** Every project Pixel Creator ever made
lived in a `Map` and died with the tab.

Nothing about the interface was wrong. What was missing was a second implementation — and the two
verbs that only make sense once it exists.

---

## 2. The store is cut in two, and only the thin half needs a browser

```
PersistentResourceStore        all the logic: keys, manifest order, deletion
        │  four operations
KeyValueArea                   get / put / remove / keys
   ├── MemoryArea              under Node, in the tests
   └── IndexedDbArea           in a browser, forty lines
```

It is the seam `ImageCache` draws around `createImageBitmap` and `HtmlAudioOutput` around
`new Audio()` (ADR-0062 §2): **what can be wrong is verified under Node**, and what is verified in
the browser is basic database plumbing.

**The manifest is ONE record; a payload is one each.** This is ADR-0020 §4 made concrete: opening
a project reads the manifest and nothing else, so a project of two hundred sprites opens as
quickly as a project of two. It is also what keeps the **order** correct — a manifest is an
ordered list and a key-value area has no order of its own, so the order is data rather than an
accident of writing.

**`write()` writes the entry at the same time as the payload.** A store whose manifest only caught
up at the next autosave would lose a resource created in the last second before a tab closes —
and "almost saved" is the one thing a save must never be.

**Mutations are serialised in a queue.** A store is asynchronous and its callers are not:
`Project.add()` writes and moves on without waiting — that is a synchronous model mutation, and it
is right to be one. Two writes and a manifest save can therefore be in flight at the same time,
and each is a read-modify-write of the same record: running them in parallel would let the **last
to arrive** win rather than the last one asked for. A chain, not a lock: operations run in call
order.

**IndexedDB and not `localStorage`.** A project carries images and sounds as data URLs;
`localStorage` is synchronous, limited to strings and capped at around five megabytes — one sprite
sheet exhausts it. IndexedDB is asynchronous, which is what `ResourceStore`'s contract was written
for from day one, stores structured values and is measured in hundreds of megabytes.

**The transaction is awaited, not the request.** A successful request is not a write that has
landed: the transaction can still abort, and a caller told "saved" on the request alone is told so
a fraction of a second too early.

---

## 3. The autosave writes two things, for two reasons

| What arrives | Why | Trigger |
|---|---|---|
| a **payload** | an edited scene or `.px`; `Workspace.save()` already knew how, it lacked a caller | the Workspace's `dirty` event |
| the **manifest** | a rename, a move, a reorder, a deletion, the project's name: **none** of these touches a payload | an operation on the Project's pipeline |

**The debounce is here and nowhere else.** A creator dragging a slider produces one operation per
pixel, and each one is a real, replicable intention the model is right to emit (ADR-0026 §3). What
must not happen is one database write per pixel — so the quiet period is applied **at the door to
persistence**, never in the model, never in the pipeline, and never near a simulation step.

**It also writes on the way out.** A tab closed during the quiet period would lose the last second
of work, which is precisely the second you remember. `visibilitychange` and `pagehide` are the two
events a browser really delivers when a tab goes away; `unload` is not one of them on mobile.

**One write at a time.** Two concurrent `flush`es would race two manifests toward one record, and
the winner would be the one that finishes last — which is not the most recent. **A failure marks
the model "dirty" again** rather than swallowing the error: a quota that was full a second ago may
not be in a minute, and a creator who is told nothing and whose work is saved nowhere has the worst
of both.

---

## 4. Two verbs, and nothing more

`New Project` and a list of what is already there. No dashboard, no thumbnails, no project folders,
no sharing: each one is a product nobody has designed.

**Opening a project means opening a document.** Rebuilding the shell in place would mean rebinding
every window, every history and every registry; reloading the page with the choice remembered is
what a browser is for, and it is the same path a creator takes tomorrow morning.

**Which project was open is not project data** (ADR-0020 §3). It is workspace state — an artefact
whose loss costs nothing — so it lives in `localStorage` beside no project at all, and a browser
that has none simply opens the most recently modified project.

**Degradation is stated, not hidden.** Private window, storage disabled, quota full: `available()`
answers no, the library falls back to an in-memory area, and the Editor behaves exactly as it did
before this file — for the lifetime of the tab. The menu **says so** (ADR-0054); a blank screen
with an error in the console is not a degradation.

---

## 5. What this ADR does not decide

| Open point | Why |
|---|---|
| **Remote synchronisation, accounts, sharing** | An HTTP implementation of `ResourceStore` is foreseen by ADR-0020; what is missing is not the store but identity and permissions |
| **IndexedDB schema migration** | There is one object store and it has never had another shape. The day it changes, `onupgradeneeded` is the place and `VERSION` is the trigger; inventing a migration framework before there is anything to migrate would be a framework nobody has read |
| **Importing / exporting a project between browsers** | **Game** export exists (ADR-0066); re-importing an editable project needs the identifier-remapping pass ADR-0020 §1 leaves open |
| **A full quota, product side** | The failure is reported and retried; what a creator should then do (delete a project, export) is an interface conversation |
| **Locking between two tabs** | Two tabs on one project each write their own manifest. The live channel exists (ADR-0044); turning it into a reconciliation is a collaboration decision |

---

## 6. Counter-tests

| Verified | Where |
|---|---|
| A written project comes back whole: scenes, `.px`, prefabs, images, sounds, folders | `project/persistence.test.js` |
| An image comes back byte for byte; a scene reloads and its Object is in the right place | the same |
| Renaming and moving reach the store through the manifest | the same |
| Deleting removes the entry **and** the payload | the same |
| A written resource is in the manifest immediately; rewriting keeps its rank | the same |
| A store is a view of **one** project and does not see the other | the same |
| Destroying a project leaves the others intact | the same |
| Listing projects reads no payload, and sorts newest to oldest | the same |
| This host says honestly whether it has IndexedDB | the same |
| Ten intentions, **one** write | `editor/project/autosave.test.js` |
| A rename reaches the store without touching a payload | the same |
| An edited scene is written, not just declared | the same |
| A failure leaves the model dirty so it can be retried | the same |
| `stop()` releases everything | the same |
| The whole project comes back after a reload, from what the autosave wrote | the same |
| **Counter-test**: without the manifest write, the project's name and its arrangement are lost | the same |

---

## 7. Consequences

### Positive

- A project outlives the tab, the reload and the machine being switched off.
- `ResourceStore` stops being a one-implementation interface.
- Order, names, folders and binary payloads come back unchanged.
- The persistence logic is tested without a browser; the browser part is tiny.

### Negative

- `start()` becomes asynchronous: the shell waits once, at the door.
- Two tabs on one project can overwrite each other (§5).
- An in-memory area is still possible, and a creator in a private window has to read the menu to
  know it.

---

## 8. A bug found along the way

`Project.deserialize()` **lost the manifest's order**. Every entry was declared through the
ordinary placement rule, which recomputes a position from its parent — and an entry whose folder
has no sibling yet lands at the end of the flat list rather than beside it. A project arranged
`Assets, hero.png, Level.scene` reopened as `Assets, Level.scene, …, hero.png`.

Invisible as long as nothing reopened. The manifest **is** the order (ADR-0026 §5); rebuilding is a
construction, and a construction copies instead of deciding again.
