# ADR-0069 — A save is not an intention

- **Status:** **accepted** (2026-09-12)
- **Decides:** what a History records; what says which document is being edited; what a shortcut owns; what a brush stroke costs the history; what "New project" means
- **Depends on:** ADR-0003 (one Operation per intention), ADR-0008 (`previous` makes the inverse possible), ADR-0019 (Operations), ADR-0024 (one stack per resource), ADR-0044 (the Editor is the authority), ADR-0065 (a project outlives the tab), ADR-0068 (painting a Tilemap)
- **Does not decide:** real-time collaboration, a global cross-document undo, a network Operation format — see §7

---

## 1. The defect

`Ctrl Z` did **nothing** in the Editor. Not "nothing for painting": nothing for an Inspector
property, nothing for a resize, nothing for moving an object — in any project old enough to have
saved itself once, which is all of them.

What was already established and was true: the keydown reached the handler, `History` passed its
tests, Operations and batches worked. **The stack the shell was consulting was empty.**

---

## 2. The cause: a write was passing itself off as an intention

```js
// project.js, save()
this.#store.write(snapshot(resource), payload);
this.setProperty(id, 'revision', resource.revision + 1);   // ← Origin.EDITOR
this.setProperty(id, 'modified', Date.now());              // ← Origin.EDITOR
```

`revision` and `modified` are facts **about** a write. Stamped as an Editor intention, they did two
things, and the second was fatal:

1. they piled up in the manifest's history — "undo the fact that this was saved" is not a sentence;
2. they **moved the context**: `Workspace.#context` was "the pipeline that emitted last", so six
   hundred milliseconds after every edit the autosave announced that the creator was now working in
   the manifest.

`activeHistory` then returned the manifest's stack, where the only thing to take back was the
bookkeeping of the save itself. Invisible, silent, and every single time.

> **The fix is one sentence: only what someone wanted enters a history.**

| Where | What |
|---|---|
| `project.js` | `save()` stamps its bookkeeping `Origin.LOCAL` — "nobody asked for this" |
| `history.js` | a History only records `Origin.EDITOR` |
| `workspace.js` | only an `Origin.EDITOR` says which document is being worked on |

And the origin filter closes ADR-0044's question in the same gesture: an operation arriving from the
network, already decided elsewhere, does not enter the local stack. `Ctrl Z` does not mean "undo the
last thing done by any tab" — there is now a counter-test that says so.

---

## 3. The keyboard asks, it does not own

```
shortcutFor(event)   →  'undo' | 'redo' | 'save' | null      a function, testable without a DOM
applyShortcut(action, { workspace })                          asks the Workspace, at that instant
```

No History is captured anywhere: not at boot, not in the handler, not in the session object — which
now exposes a **getter** rather than a snapshot. Changing document, closing an editor, opening
another project rewires nothing.

| Key | |
|---|---|
| `Ctrl Z` / `Cmd Z` | undo |
| `Ctrl Shift Z` / `Cmd Shift Z` | redo |
| `Ctrl Y` | redo as well — what half of all creators try first, and nothing else uses it |
| `Ctrl S` / `Cmd S` | save what is being worked on |

**The text-field rule, stated and tested.** `applyShortcut` answers whether it **did** anything, and
`editor.js` only calls `preventDefault()` in that case. A creator typing a name has a stack of their
own: `Ctrl Z` takes back the rename. When there is nothing of ours to take back, the key is left to
the browser and its text undo happens. Stealing the key in both cases would make editing a name the
one place in the Editor where undo lies.

**Between projects.** Two projects are two Workspaces: an undo in one never reaches the other. And
**one scene at a time** — the rule the Workspace already had: opening the second closes the first and
**takes its stack with it**, listeners included.

---

## 4. A brush stroke costs the brush stroke

`SET_PROPERTY` carries the whole value: fine for a number, a colour or a name, ruinous for a grid.
Painting a hundred cells of a 1000 × 1000 map wrote a hundred operations each carrying **two copies
of a million numbers**.

```
map = 1,000,000 cells, stroke = 100 cells
before:  100 operations × 2 × 1,000,000  =  200,000,000 values retained
after:     1 entry, 100 cells × 2         =            200 values retained
```

> **`SET_CELLS`: INDICES, with the value they had and the value they take.**

| Decision | Reason |
|---|---|
| one operation, not a generic framework | it says what it does: "set these squares of this array to these values". General enough for the next large array, and not an abstraction invented for a single use |
| **it is not a second truth** | `Tilemap.tiles` is still the real array; a patch is the *description* of a mutation. Applying it reads the array, copies it, changes the named indices and writes it back **through the same property write** as `SET_PROPERTY` — so the same Change, the same observers, the same file |
| the inverse swaps each cell's two values | exactly what `SET_PROPERTY` does, cell by cell |
| a cell that already matches does not enter the patch | and an index never appears in it twice |
| a resize keeps a full snapshot | changing 1000 × 1000 to 500 × 500 structurally changes the whole grid: one entry, one array, and undo gives back dimensions **and** contents (ADR-0068 §6). Optimising it would complicate a contract that is correct |

**Persistence has not moved.** The project file contains `tiles`, an array of numbers, and nothing of
the history leaks into it — which is also why a grid declared `n × m` is now **dense from
construction**: a patch filling index 6 of an empty array left five holes, and a hole becomes `null`
in a file where a creator expects a zero.

---

## 5. What it costs, measured

`node tools/bench-tilemap.mjs`

| map | cells | stroke | history entries | values retained |
|---|---|---|---|---|
| 100 × 100 | 10,000 | 100 | 1 | **200** |
| 1000 × 1000 | 1,000,000 | 100 | 1 | **200** |

The map grows a hundredfold; the cost does not move. Counted in **values** rather than milliseconds
because that is the number that is the same on every machine.

---

## 6. "New project" asked to forget, not to create

The menu wrote `localStorage.removeItem(LAST_OPENED)`, then reloaded. But *remembering nothing* means
"open the most recently modified project" (ADR-0065 §4) — which is precisely the one just left.
**The button reopened the project it had been pressed in.**

Forgetting is not asking: the intention is written (`NEW_PROJECT`), and `resume()` honours it before
going to look for anything. With nothing remembered, falling back to the most recent project is still
the right behaviour — that is a browser that has lost a convenience, not a creator who asked for a
blank page.

---

## 7. What this ADR does not decide

| Open point | Why |
|---|---|
| **Real-time collaboration** | The origin filter says what a local undo is not; what a *shared* undo would be — undoing someone else's operation, or your own in a document two people are writing — is a product decision with no product yet |
| **A global cross-document undo** | ADR-0024 settled the opposite, and the reason still holds: `Ctrl Z` in the Graph window must not take back a move in the scene |
| **Reopening a scene resurrecting its stack** | A stack lives with its editor: reopening gives an empty stack. Keeping the stacks of closed scenes would require deciding for how long, and at what memory cost |
| **A `SET_CELLS` for other arrays** | The operation is general; the second use does not exist yet, and we will not generalise before it does |

---

## 8. Counter-tests

| Verified | Where |
|---|---|
| Saving does not move undo out of the document being edited | `editor/project/workspace.test.js` |
| A save's bookkeeping enters no history, and the revision still moves | the same |
| An operation nobody wanted is not undoable | the same |
| `Ctrl` and `Cmd`, `Shift Z` and `Y`, and what is not a shortcut | `editor/shortcuts.test.js` |
| Undo targets the document being worked on, asked for at the moment of the keystroke | the same |
| An autosave in between changes nothing | the same |
| **With nothing of ours to take back, the key is left to the browser** | the same |
| An undo in one project never reaches the other | the same |
| Opening another scene closes the first and takes its stack with it | the same |
| Closing an editor leaves no listener behind | the same |
| A stroke costs the cells painted, not the cells of the map | `editor/viewport/tools/tile-tool.test.js` |
| **Counter-test**: writing the whole array cost a million times more | the same |
| A patch names each cell once, whatever the pointer did | the same |
| What a patch leaves is an ordinary array, exactly as it is saved | the same |
| One stroke = one undo; two strokes = two undos; redo restores everything | the same |
| The last project opened comes back; **New project creates one**; forgetting reopens the most recent | `editor/project/library.test.js` |

---

## 9. Consequences

### Positive

- `Ctrl Z` works, for everything, including in a project restored from IndexedDB.
- A history now contains nothing but intentions: no bookkeeping, no simulation, no network.
- A stroke on a million-cell map costs two hundred values.
- "New project" creates a project.
- No shortcut, no window and no test holds a stack: everyone asks.

### Negative

- One more origin to respect: code producing Operations without stamping them `EDITOR` would end up
  silently non-undoable. That is the price of the filter, and `createOperation` already requires an
  origin, so forgetting one is impossible — only a *wrong* value is.
- `SET_CELLS` is one more operation type to know about for anyone writing a transport.
- Reopening a closed scene does not give its history back.
