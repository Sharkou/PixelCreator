# ADR-0070 — A cutting is a resource

- **Status:** **accepted** (2026-09-12)
- **Decides:** where the cutting of a tile sheet lives; what a Tilemap cell holds; who computes a frame rectangle; how the contents of a Resource are edited; what a Tilemap draws when the camera sees only one corner
- **Depends on:** ADR-0020 (Resource, store, manifest), ADR-0023 (Property System), ADR-0059 §3 (the conservative AABB), ADR-0062 (one table of resolved resources, `ImageCache`, an animation's grid), ADR-0068 (a level is painted), ADR-0069 (a write is not an intention, `SET_CELLS`)
- **Amends:** ADR-0068 §10 — the tileset pipeline arrives, and the colour palette goes; ADR-0062 §4 — the `BLOCKED` on editing an animation's payload is lifted
- **Does not decide:** autotiling, Wang/rule tiles, terrains, animated tiles, per-tile properties, per-tile collision, object layers, TMX import, infinite or chunked maps — see §11

---

## 1. The model

```
Tileset  (Resource)          Tilemap  (Component)
  source      ResourceId       tileset   ResourceId  ──▶ the Tileset
  tileWidth   16               tileSize  32
  tileHeight  16               columns   60
  columns     4                rows      16
  count       16               tiles[]   [0, 0, 2, 2, 1, …]
```

A cell is **a small integer**: `0` empty, `n` the nth tile of the sheet.

| Decision | Reason |
|---|---|
| **the cutting is a Resource** | Two maps of the same dungeon name **one** `Tileset`; recutting it recuts both. It is ADR-0062 §4's argument for a clip and ADR-0061's for a prefab, applied to what a level is made of |
| **no `{source, frame}` repeated in a palette** | An eighty-entry palette would have been eighty copies of the same `ResourceId` in **every** map, and a recut sheet would have had to be recut in each one |
| **a cell stores nothing but an index** | A forty-thousand-cell level is forty thousand small integers — which is what makes `SET_CELLS` (ADR-0069 §4) possible and a project file readable |
| **1-based, because 0 was already taken** | `Tilemap` has always said that `0` is empty, and the Tilemap Collider reads nothing else (ADR-0068 §3). So tile `1` is the sheet's first cell, and the whole mapping is `tile - 1` |
| **`columns` and `count` are DECLARED** | Deriving them from the decoded sheet would make a tile rectangle depend on the end of a decode: the same cell would be two rectangles depending on the frame. That is the rule ADR-0062 §4 laid down for a clip, and it holds here word for word |

---

## 2. One rectangle, two readers

`core/frames.js` — `frameRect({ index, frameWidth, frameHeight, columns, first })`.

It was `animation.js`'s private loop until the day a second caller needed it: **that is the moment
a shared primitive earns its file**, and not before. An animation walks cells along a strip, a
tileset indexes cells on a page; both ask for "the nth cell of a regular grid, across then down",
and two pieces of arithmetic would have drifted by a pixel with nobody knowing which was right.

A counter-test compares the two across fifteen cells of the same grid: they differ only by the
offset of 1 that `0 = empty` imposes.

---

## 3. Invalid values

Everything is bounded **at construction**, once, never on every read:

| Input | Result |
|---|---|
| `tileWidth: -8`, `tileHeight: 0` | `0` — and `tilesetOf()` refuses the definition |
| `columns: 'four'` | `1` |
| `count: -3` | `0` — a tileset that can answer with no rectangle is not one |
| no `source` | refused |
| unknown `version` | refused, like a clip, a graph or a prefab of an unknown version |

A `NaN` rectangle reaches a canvas, draws nothing and reports nothing: that is the defect this
bounding exists to prevent.

---

## 4. Creating one from an image

`+ ▸ Graphics ▸ Tileset…` — the same gesture as `Animation…` (ADR-0062 §4): pick the sheet, which is
imported **and** cut up. The default is **sixteen pixels per cell**, with columns and count
following from the file's size.

This is not detection: it is what every tutorial sheet does, **stated as a guess** and fixable in one
line. A creator whose tiles are 32 has two numbers to change in the Inspector — which is better than
a detection that is right four times out of five and inexplicable the fifth.

---

## 5. Editing what a resource contains

Two structured resources wanted to be modified — an animation and a tileset — and neither has a
window of its own. That was the moment for the small generic primitive, not before:

```
Project.setPayload(id, payload)  →  SET_PAYLOAD  →  store.write + revision
```

| Decision | Reason |
|---|---|
| **an Operation, not `save()`** | `save()` writes what a live model has already decided and is **not** undoable: a save is not an intention (ADR-0069 §2). This is the other half — a creator editing the contents themselves — so it goes through the pipeline: arbitrated, replicated, undoable |
| **replaced whole** | These payloads are small and flat. The day one is not, `SET_CELLS` is the shape to copy |
| **the write goes through the kind's constructor** | `createTileset({ ...payload, tileWidth: -8 })`, never `{...payload, x}`: a resource edited in the Inspector and one created by the menu cannot have two shapes |
| **the revision moves with it** | Whatever is watching the resource rebuilds exactly as it does after a save |
| **drawing receives a context** | `component.draw(self, renderer, { resources })` — the same registry a simulation step uses, resolved **before** the frame (ADR-0062 §1). Never a store read while drawing |

---

## 6. Culling

The renderer answers `visibleBounds()`: the rectangle of **the space currently being drawn** that the
surface covers. A Tilemap derives a range of rows and columns from it.

`node tools/bench-tilemap.mjs`:

| map | cells | camera | cells inspected | drawn | ms/frame |
|---|---|---|---|---|---|
| 100 × 100 | 10,000 | 0,0 | 651 | 651 | 0.08 |
| 1000 × 1000 | 1,000,000 | 0,0 | 651 | 651 | **0.013** |
| 1000 × 1000 | 1,000,000 | 500,500 | 651 | 651 | 0.017 |
| 1000 × 1000 | 1,000,000 | 975,975 | 525 | 525 | 0.013 |

**Counter-test**: a backend that cannot say what it is showing draws the whole grid — 1,000,000
cells, 24.1 ms for **one** frame. That is what the Tilemap did before this line, and it is never
wrong, only slow.

Four corners, not two: under a rotated transformation, the screen's rectangle is a rotated
quadrilateral in the space being drawn, and its bounding box is the only honest answer for anyone
iterating rows and columns — conservative, never short (the same approximation ADR-0059 §3 accepts
for a rotated collider).

---

## 7. Changing Tileset

A map painted with eighty indices, pointed at a sheet that has twenty:

- `tiles` is **not touched** — the level is not corrupted, only undrawn;
- cells beyond the sheet **draw nothing**: no substitution, no replacement frame. Putting a wall
  where the creator painted a door, without saying so, would be worse than putting nothing;
- they stay **occupied**, so they still block (ADR-0068 §3);
- the creator can repaint them: they are cells like any others.

---

## 8. Picking a tile

The Scene's picker shows **the real tiles**, cut from the sheet the map draws: you pick a wall by
looking at a wall. It is a **picker**, not an editor — changing what a tileset **contains** is still
the Inspector's rows.

A fixed page of three rows, and two arrows when the sheet asks for more: five hundred thumbnails
would cover the scene being painted. **Picking a tile produces no Operation**: looking at a different
wall is not a change to the level.

---

## 9. What becomes of the colour palette

**Removed.** There is no colour model left beside a tile model: the project is under development, and
a permanent debt costs more than a clean migration. What the old palette was for — "this cell is
green" — is better said with a sheet, and the `tools/demo/tiles.js` demo went from three colours to
four drawn tiles.

The `<px-list>` tests that used it as their subject now use a list declared in the test itself: the
control is **generic**, and pinning it to whichever shipped component declared an item that day is
what made that file fail for a reason that had nothing to do with lists.

---

## 10. Persistence, Preview, export

Nothing special anywhere. A `Tileset` is a Resource: it is in the manifest, its payload is in the
store, it crosses the IndexedDB autosave, the live channel and the `.pxgame.json` bundle **like the
others**. The sheet travels because it is a resource the project declares — exactly like a `Sprite`'s
or an animation's sheet.

---

## 11. What this ADR does not decide

| Refused | Why |
|---|---|
| **Autotiling, Wang tiles, rule tiles, terrains** | Rules about what a tile becomes depending on its neighbours: a product, not a checkbox |
| **Animated tiles** | A clip per cell needs a playhead per cell; this batch's model is "a cell is an integer" |
| **Per-tile properties or collision** | ADR-0068 §3 settled it: empty or not empty. A ladder, a trap or a slope is each a decision about what a tile **is** |
| **Object layers, TMX import** | Formats, therefore pipelines |
| **Infinite / chunked maps, procedural generation** | Nothing asks for them: a million-cell map already costs 0.013 ms per frame (§6) |
| **A `SET_PAYLOAD` per field** | These payloads are four numbers. A patch per field would be `SET_CELLS`'s machinery for one Inspector row |

---

## 12. Counter-tests

| Verified | Where |
|---|---|
| A tileset is flat data that survives a JSON round trip | `core/tileset.test.js` |
| Its default values, and the bounding of everything that makes no sense | the same |
| No sheet, unknown version: refused | the same |
| Tile 0 is empty and is not the first one | the same |
| First, last, second row, single-tile column | the same |
| A count that is not a multiple of the columns stops where it says it does | the same |
| A tile beyond the sheet has no rectangle | the same |
| **A tileset and an animation cut the same grid into the same rectangles** | the same |
| The primitive itself: across then down, `first`, and nothing without a cell size | the same |
| An empty cell draws nothing; a tile draws its own rectangle of the sheet | `runtime/tilemap/tilemap.test.js` |
| A tile missing from the sheet draws nothing, and the level is not corrupted | the same |
| No tileset, an unknown one, a silent registry: nothing breaks | the same |
| A sheet still decoding is requested by identity, once | the same |
| **Only the visible cells are drawn**, and the range follows the camera | the same |
| **Counter-test**: without `visibleBounds`, the whole grid | the same |
| **The collider never learns that a tileset exists** | the same |
| A tileset created from a sheet, grid read from the file; silent header; refusing to invent | `editor/project/commands.test.js` |
| The Inspector names the sheet and lets you type the cutting | `editor/inspector/resource.test.js` |
| An edit goes through the kind's constructor, so nonsense is bounded | the same |
| **A payload edit is an undoable intention, and the revision moves with it** | the same |
| A thumbnail picks what is painted, **and picking is not an edit** | `editor/viewport/tools/tile-tool.test.js` |
| A thumbnail is the tile itself, cut from the map's sheet | the same |
| A sheet too big for one page is paginated | the same |
| With no tileset: Empty alone, and painting still works | the same |
| The level is one sheet, one cutting and two maps that name it | `tools/demo/tiles.test.js` |
| **The exported bundle carries the sheet, with no special path** | the same |

---

## 13. Consequences

### Positive

- A graphical level is painted in the Scene and played in Preview, without a line of code.
- A sheet's cutting exists **once**, and two maps share it.
- A million-cell map costs what one window shows.
- The contents of a structured Resource are finally editable — and undoable.
- One frame arithmetic for animation and for tiles.

### Negative

- The colour palette no longer exists: a project that had one loses its colours (§9).
- A rotated Tilemap still does not block (ADR-0068 §4) and its culling is conservative (§6).
- `SET_PAYLOAD` replaces the whole payload: two creators editing the same tileset at the same time
  overwrite each other, which collaboration has not decided anything about anyway.
