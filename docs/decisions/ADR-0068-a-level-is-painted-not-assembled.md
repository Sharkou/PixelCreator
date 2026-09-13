# ADR-0068 — A level is painted, not assembled

- **Status:** **accepted** (2026-09-12)
- **Decides:** where a Tilemap's grid lives; what makes its cells solid; how a Body is stopped by them without manufacturing one box per cell; how you paint in the Scene; what resizing means; what a crossing too fast for a snapshot is
- **Depends on:** ADR-0003 (one Operation per intention), ADR-0004 (one Component, one `update`), ADR-0023 (the Property System), ADR-0024 (per-resource undo), ADR-0025 (the Project panel), ADR-0034 §3.1 (canonical order), ADR-0059 (touching is a fact of simulation), ADR-0064 (broad phase), ADR-0067 (Body, solid, sweep)
- **Amends:** ADR-0059 §5 — the contact cycle gains one more source, and that is §8 here
- **Does not decide:** autotiling, Wang tiles, rule tiles, procedural generation, pathfinding, per-tile lighting, slopes, one-way platforms, animated tiles, infinite worlds, tileset pipeline — see §10

---

## 1. The problem

`tools/demo/platform.js` builds its world out of four Objects carrying four Box Colliders. For
four, that is honest. For a level, it is an army: a twenty-cell wall is twenty Objects in the
hierarchy, twenty entries in the serialised scene, twenty things to select by mistake. And the
`Tilemap` that already existed — a grid that **draws** — could stop nothing.

Three things missing, one gesture: **paint the scenery, and let what is painted block.**

---

## 2. One truth, and it has moved

```
src/runtime/tilemap/tilemap.js     the grid: cells, size, palette, drawing
src/runtime/tilemap/collider.js    what makes its cells solid
```

`Tilemap` lived under `rendering/`. The day its cells stop something, physics would have had to
import the renderer's tree to find out where the floor is — a `physics → rendering` dependency no
`layers` run would have seen and nobody would have wanted. So the file moved **next to**
`collision/` and `physics/`, and it imports nothing from rendering: `draw()` calls a method on
whatever it is handed, like every Component.

> **The `tiles` array is the only truth. There is no graphics copy, no collision copy, and no
> Editor grid.**

The renderer reads the cells, the solver reads the cells, the paint tool writes the cells.
Painting a square makes it blocking **on the next step**, with no rebuild, because there is
nothing to rebuild — and that is verified by a test that paints while the game is running.

---

## 3. Two Components, because there are two sentences

```
Tilemap              this grid draws itself
Tilemap Collider     the non-empty cells of this grid are walls
```

A starry sky, a background, a floor pattern: a **decorative** Tilemap is a real thing, and it is
one by not adding the second Component. The demo shows one of each.

| Decision | Reason |
|---|---|
| **cell 0 = empty, everything else = solid** | A first model that can say "wall" and "not a wall" is a model a beginner uses. A material per tile is a decision about what a tile **is**, and it has not been taken yet (§10) |
| **no per-cell `solid` field** | It would be forty thousand booleans to say what a single checkbox already says |
| **the collider carries no grid** | A second structure to keep in step with the first is the bug this design does not have |
| **one entry in the broad phase, not forty thousand** | A Tilemap is **one** Object: the spatial hash partitions it the way it partitions an Object with two hitboxes (ADR-0064) |
| **cells are materialised for a CORRIDOR** | `tileBoxes()` receives the region the body can reach during this step and answers with the cells in it. The cost follows the character, not the size of the level (§7) |

ADR-0067's solver contract is **unchanged**: X then Y, the nearest solid, no tunnelling. A cell is
a box like any other — it simply arrives later and only if it can be touched.

**A Tilemap produces no `On Collision`.** Its cells block; they overlap with nothing. It is the
same sentence ADR-0067 §3 says about the floor: what **blocks** is asked with `grounded`, what
**detects** is asked with a non-solid collider.

---

## 4. The Transform, and the rotation we refuse to approximate

Position and scale are exact: they keep the grid axis-aligned, and display, picking, painting and
collision all go through the **same** matrix.

```
BLOCKED: collision for a rotated Tilemap
Reason: a cell is a square in local space; under a rotation its shape in the world is a rotated
        square, and the only thing the solver knows how to receive is an AABB — up to 41 % too
        large. ADR-0059 §3 accepted that approximation for ONE declared collider a creator sees
        and understands; accepting it for every cell would make a whole level subtly wrong, and
        "the player stops twenty centimetres short of the wall" is a bug nobody ever diagnoses.
        A rotated Tilemap DRAWS rotated and blocks nothing. The day the sweep can handle an OBB,
        this is where it plugs in.
```

---

## 5. Painting where the level is

> **The selected Tilemap is the Tilemap you paint. A click INSIDE its grid paints; a click
> elsewhere selects.**

One sentence, no mode, no button, no extra window — and always a way out: clicking beside it
selects again. The viewport routes the press to one tool or the other (`#toolFor`); there is no
second state machine to keep in step with the first.

| What you see | How |
|---|---|
| the grid | its outline always, its inner lines as long as a cell is more than five pixels |
| the targeted cell | filled with the active colour, outlined in orange |
| the active tile | a strip of swatches over the surface, the active one outlined |
| erasing | the first swatch is **Empty**: pick it and paint to erase |
| adding a colour | the last swatch is `+`; **editing** a colour is still the Inspector's list |

**The cells between two pointer events are painted too.** A pointer is sampled once per frame; a
fast drag skips squares, and a line full of gaps is not what someone drew.

**A drag is ONE undo** (ADR-0024): every write in a stroke shares a `batch`. A cell that already
holds the painted value **is not written** — going back over it produces nothing, which is what
stops "one stroke, one undo" from meaning "one stroke, fifty operations undoing toward the same
grid".

**`tiles` stays a grid, never hundreds of Inspector fields.** The Inspector says how many there
are; what edits them is the Scene.

---

## 6. Resizing, without shearing

A grid is addressed by `row * columns + column`. Writing `columns` on its own therefore does not
resize it: **it shears it** — every row after the first slides sideways, and a level painted over
ten minutes comes back diagonal.

| Rule | |
|---|---|
| growing | what was at (column, row) stays there; the new space is empty |
| shrinking | what no longer fits is cut |
| undo | **gives back the dimensions AND the contents** |

`Tilemap.remap()` is the rule, pure and tested. The Inspector writes `tiles` **and** the dimension
in a single `batch` (`editor/tilemap.js`): that is what gives the Operation the grid before and the
grid after. A dimension written alone could only undo toward "the same size, and emptiness where
your level was".

---

## 7. What it costs

`node tools/bench-tilemap.mjs` — the same character in the same corner, while the level grows ten
thousand times larger:

| map | cells | bodies | ms/step |
|---|---|---|---|
| 32 × 32 | 1,024 | 1 | 0.027 |
| 100 × 100 | 10,000 | 1 | 0.013 |
| 400 × 400 | 160,000 | 1 | 0.021 |
| 1000 × 1000 | **1,000,000** | 1 | **0.017** |
| 1000 × 1000 | 1,000,000 | 20 | 0.220 |

The millisecond column does not move. That is §3 in figures: the cells asked for are the ones the
body can reach.

---

## 8. A crossing is not an overlap (a counter-test for ADR-0067)

A body that travels a thousand units in one step and crosses a four-unit trigger overlaps it
**neither before nor after**. Two snapshots cannot see that crossing — and a bullet passing through
a hitbox at three thousand units per second is exactly that shape.

> **Three sets, three questions:**
>
> | set | question | who reads it |
> |---|---|---|
> | overlap | "do these two share any area, right now?" | `Is Overlapping` |
> | crossing | "did this body pass through that during this step?" | the movement pass |
> | **contact** = both | "what starts, continues, ends?" | `Enter` / `Stay` / `Exit` |

The movement pass already sweeps the path; it reports the crossings, and `Collisions.update()` adds
them to **contact** — never to overlap. `Is Overlapping` goes on answering "no" for a bullet that
has already gone through, because that is true.

The swept path is an **L** — X then Y — so each branch is an exact rectangle: nothing is
approximated. And a crossing is only reported if the body overlapped the target at neither end: an
overlap at the start has already been reported by the step that began there, and an overlap at the
end will be reported by the next one.

---

## 9. The demo

`tools/demo/tiles.js` — a floor, two walls, a ledge, a pit and the pit's floor, **painted into a
single Tilemap**, plus a second Tilemap of stars with no collider. The whole scene is **six
Objects**: a camera, the sky, the level, the player and two HUD nodes. There is no `Wall Left` to
find in it.

Verified in the browser: the character falls onto the painted floor, walks, jumps over the pit,
lands on the painted platform, bumps into its underside when jumping from below, and stops against
the column of cells that makes the wall. And in the Editor: add the Component, type 12 × 8, add a
colour in one click, paint a whole row in one drag.

---

## 10. What this ADR does not decide

| Refused | Why |
|---|---|
| **Autotiling, Wang tiles, rule tiles** | These are rules about what a tile becomes depending on its neighbours — a product, not a checkbox |
| **Procedural generation, infinite / chunked worlds** | They require deciding what "a part of the world" is, which nothing has asked for yet |
| **Animated tiles, per-tile lighting, pathfinding** | Three systems, three ADRs |
| **A tileset pipeline (a sheet instead of colours)** | The palette is a list of COLOURS and stays one for this batch. `Sprite` and `animation` already know how to cut up a sheet (ADR-0062): the day a palette carries frame `ResourceId`s, it is that list that changes type, not the rest |
| **Per-tile materials** | §3: "wall" and "not a wall" first |
| **Slopes, one-way platforms** | ADR-0067 §6, unchanged |
| **Dragging a selected Tilemap to move it** | Inside its grid, a drag **paints** (§5). You move it through its Position in the Inspector, or by deselecting it first. That is the price of a mode with no button |
| **A stroke on a huge map, memory-wise** | A cell write is a write of `tiles`, so one copy of the array per cell touched: fifty squares on a 200 × 200 map are fifty copies of forty thousand integers in the history. That is correct and it is expensive; making it sparse needs an Operation of a new kind (`setCell`), with its inverse and its replication — and nobody has yet painted a map that size |

---

## 11. Counter-tests

| Verified | Where |
|---|---|
| Reading and writing a cell; outside the grid nothing is read or written; empty is 0 | `runtime/tilemap/tilemap.test.js` |
| A local point names its cell; negative is outside, not zero | the same |
| Growing keeps everything in place; shrinking cuts; `remap` is pure | the same |
| Without a collider: you pass through. With one: you land, and do not sink over three hundred steps | the same |
| A column of cells = a wall, with sliding; the top row = a ceiling; a corner | the same |
| Crossing the whole map in one step stops at the first filled cell | the same |
| An empty cell in the middle of a wall is a door | the same |
| Beyond the edge of the map there is nothing | the same |
| Moving the map moves what it blocks; scaling it scales its cells | the same |
| **A rotated map draws and blocks nothing, and says so by answering with no boxes** | the same |
| Two Tilemaps block, a third without a collider does not | the same |
| Destroying the map, adding a body mid-run | the same |
| **Painting a cell makes it blocking on the next step: a single array** | the same |
| Headless, two identical Runtimes, insertion order irrelevant | the same |
| A map of 160,000 cells: the corridor, not the map | the same |
| The tool is only alive when a Tilemap is selected | `editor/viewport/tools/tile-tool.test.js` |
| Inside the grid it paints, outside it does not take the press | the same |
| A press paints one cell; a drag paints every cell it crosses | the same |
| Going over a cell twice writes it once; repainting the same value is not an edit | the same |
| Entry 0 erases; a swatch selects; `+` creates a palette that did not exist | the same |
| Nothing is ever written outside the grid | the same |
| The map is painted where it IS, through its Transform | the same |
| **A five-cell drag = ONE undo, and redo restores the whole stroke** | the same |
| **Two strokes = two undos** | the same |
| Growing/shrinking: undo restores the size AND the cut cells; a resize is one entry, not two | the same |
| A whole level in six Objects, played through a game client's door | `tools/demo/tiles.test.js` |
| The painted wall stops you, and there is no `Wall Left` Object | the same |
| The pit is a pit, and the cells at the bottom catch the fall | the same |
| The decorative map stops nothing | the same |
| A cell painted during play becomes a wall with nothing rebuilt | the same |
| **A trigger crossed entirely in one step is still a contact, and is NOT an overlap** | `runtime/physics/move.test.js` |

---

## 12. Consequences

### Positive

- A level is painted in the Scene, played in Preview, and weighs one Object.
- Rendering and collision stay two sentences: scenery stops nobody.
- The cost of collision follows the character, not the size of the world.
- Resizing no longer breaks anything, and undoes completely.
- A fast bullet no longer passes through a trigger unseen (§8).

### Negative

- A rotated Tilemap does not block (§4).
- A selected Tilemap can no longer be moved by dragging (§10).
- A stroke on a huge map is expensive in history (§10).
- The palette is still colours: no real drawn tiles yet.
