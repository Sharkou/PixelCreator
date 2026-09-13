# Keyboard shortcuts

This is the **complete** current keymap. Pixel Creator binds deliberately few keys, and
everything bound here also has a control you can reach with a finger — the editor must never
hit a wall on a tablet.

`Ctrl` below means `Cmd` on macOS. Both work everywhere, on every platform: you never have to
learn the other keyboard's habit.

## Everywhere

| Keys | Action |
|---|---|
| `Ctrl Z` | Undo |
| `Ctrl Shift Z` | Redo |
| `Ctrl Y` | Redo (the same thing — it is what half of everyone tries first) |
| `Ctrl S` | Save now |
| `Ctrl D` | Duplicate the selected object, with everything under it |

**Undo works while you are typing in a field.** If there is something of ours to take back,
`Ctrl Z` takes it back; if there is not, the browser's own text undo happens instead. Editing a
name is never the one place where undo lies.

`Ctrl S` and `Ctrl D` always claim the key, even when there is nothing to do with it. An
unclaimed `Ctrl S` makes the browser offer to save the *page*, and an unclaimed `Ctrl D` opens
the bookmark dialog over your scene. Neither is something anyone presses on purpose inside an
editor.

`Ctrl D` is the one exception to that: inside a **text field** on macOS it is forward-delete,
so there it belongs to the field.

## Scene and Hierarchy

Only when you are **not** typing in a field.

| Keys | Action |
|---|---|
| `Delete` / `Backspace` | Delete the selected object, or the selected resource, with everything under it |
| `F` | Frame the selected object in the viewport |
| `Escape` | Cancel the gesture in progress. With nothing to cancel, deselect |

`Escape` cancels **before** it deselects, and every window carrying something is asked — the
viewport, the Hierarchy, the Project panel, the graph. A drag in flight is what you meant by
pressing it.

## Graph canvas

| Keys / gesture | Action |
|---|---|
| `Delete` / `Backspace` | Remove the selected nodes and their wires |
| `Escape` | Cancel the gesture in progress |
| Right-click empty canvas | Node palette, placing where you clicked |
| Drag from a port onto empty canvas | Node palette, filtered to what that port can reach |

## Mouse and touch

| Gesture | Where | Action |
|---|---|---|
| Click | Viewport | Select |
| Drag an object | Viewport | Move it |
| Drag a handle | Viewport | Resize it |
| Middle-drag / right-drag | Viewport, graph | Pan |
| Drag on empty space | Viewport, **touch only** | Pan |
| Drag on empty canvas | Graph, left button | Marquee-select |
| Scroll / pinch | Viewport, graph | Zoom |
| Double-click a row | Hierarchy | Frame that object |
| Double-click a resource | Project | Open it |
| Click a selected row's name again | Hierarchy, Project | Rename |
| Right-click | Project, graph | Context menu |
| Drag sideways on a field's label | Inspector | Scrub the number |

## Text fields

| Keys | Action |
|---|---|
| `Enter` | Commit |
| `Escape` | Abandon the edit |
| `↑` / `↓` | Step a numeric field |

## Not bound

There is no tool-switching keymap (`Q`/`W`/`E`/`R`), no `Ctrl C` / `Ctrl V` for objects, no
`Ctrl N`, and no `Ctrl P` for Play. If a key is not on this page, it is not bound.
