# Tilemaps and tilesets

A **level is painted, not assembled.** Placing three hundred rectangles by hand to build a
dungeon is not level design. A tilemap lets you draw the level with a brush, straight in the
viewport.

Two things are involved, and it is worth keeping them apart:

> A **Tileset** is a *cutting* of a picture: "this sheet is 16 by 16 tiles". It is a
> [resource](resources.md).
>
> A **Tilemap** is a *grid of painted cells* on an object. It is a
> [component](component-reference.md#tilemap--tilemap).

Two maps of one dungeon name the **same** tileset. Re-cut the sheet and both maps follow,
because each cell of a map holds a small tile index, not a copy of a rectangle.

## 1. Make a tileset

You need a tile sheet — one image holding all your tiles in a grid.

Either:

- **Project panel ▸ + ▸ Graphics ▸ Tileset…**, then choose the image; or
- **right-click an image** you have already imported ▸ **New Tileset from this**.

Pixel Creator imports the sheet and reads a grid off the file. That first guess is stated as a
guess — correct it in the Inspector:

| Field | Meaning |
|---|---|
| **Sheet** | The image this cutting is of (read-only here — point a tileset at another picture by dropping one on it) |
| **Tile width** | The width of one cell, in pixels of the sheet |
| **Tile height** | The height of one cell |
| **Columns** | How many cells fit across the sheet |
| **Tiles** | How many cells the sheet holds in total |

The default cell size is **16 × 16**, because that is what most tutorial sheets are. On a
32-pixel sheet it will look visibly wrong, which is the point — a wrong number you can see is
better than a map that silently draws nothing.

## 2. Put a Tilemap on an object

Create an object (an **Empty** is fine) and **Add Component ▸ Rendering ▸ Tilemap**.

Then set, in the Inspector:

| Field | Meaning |
|---|---|
| **Tileset** | Which cutting to draw from — drag your tileset in, or pick it |
| **Tile size** | How big one cell is **in the world**. It does not have to match the sheet's cell size |
| **Columns** / **Rows** | How big the grid is, in cells |
| **Tiles** | The painted cells. Written by the tile tool — you never type into this |

A fresh Tilemap has `0` columns and `0` rows, so give it a size before you try to paint.

## 3. Paint

**Select the Tilemap object.** That is all it takes — there is no mode to enter and no tool
button to arm.

While it is selected:

- a **tile picker** appears in the viewport, showing the real tiles cut out of your sheet;
- **pressing inside the map's grid paints**;
- **pressing outside it selects**, exactly as usual.

So there is always a way out: click away and you are selecting again. You cannot get stuck in
a mode you did not know you entered.

| Gesture | Result |
|---|---|
| Click a tile in the picker | Choose the brush |
| Choose **Empty** in the picker | The brush erases |
| Press inside the grid | Paint one cell |
| Drag inside the grid | Paint a stroke — cells between two pointer positions are filled in too, so a fast drag leaves no holes |
| The picker's arrows | Page through a large sheet |

**One stroke is one undo entry.** Drag across fifty cells and a single **Ctrl Z** takes the
whole stroke back. Painting a cell that already holds that tile writes nothing at all.

Changing what a tileset *contains* is the Inspector's job, not the picker's. The picker
chooses; it does not edit.

## 4. Make it solid

Add **Tilemap Collider** to the same object. It has no fields: it makes the painted cells of
that object's Tilemap solid, and empty cells stay empty.

Anything with a **Body** now collides with the level — which is the whole of a platformer's
floor.

```
Level object
├── Tilemap            (tileset, grid, painted cells)
└── Tilemap Collider   (those cells are walls)

Player object
├── Sprite
├── Velocity
├── Body               (gravity)
└── Box Collider
```

## Tips

- **Several tilemaps, several layers.** One object for the background, one for the walls, one
  for decoration, each with its own `layer`. Only the walls object needs a Tilemap Collider.
- **World size and sheet size are separate.** A 16-pixel sheet drawn at a world tile size of
  32 gives you chunky, doubled pixels on purpose.
- **The map's own Transform still applies.** Move, rotate or scale the object and the whole
  level follows.

## Next

- [Component reference](component-reference.md) — Tilemap and Tilemap Collider fields
- [Prefabs](prefabs.md) — for the things that are not part of the level
