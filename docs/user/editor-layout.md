# Editor layout

A tour of the Pixel Creator window. Every name used here is the name the editor itself uses,
so you can go looking for the thing you just read about.

```
┌──────────────────────────────────────────────────────────────────────────────┐
│ ▪ Pixel Creator / Untitled Scene ●     ▶ ⏸ ⏹      ▤ ▤ ▤ ▤   📁 ▷ ⇪ ◯       │  Title bar
├──────────────────┬───────────────────────────────────────┬───────────────────┤
│                  │  Scene ×  Counter.px ×                │                   │  Document tabs
│    Hierarchy     │                                       │                   │
│                  │                                       │    Inspector      │
│                  │              Viewport                 │                   │
├──────────────────┤                                       │                   │
│                  │                                       │                   │
│     Project      │                            100%  ⊙ ⊞  │                   │
│                  │                            ▫ ▭ 🎥      │                   │
├──────────────────┴───────────────────────────────────────┤                   │
│                    Timeline (hidden by default)          │                   │
└──────────────────────────────────────────────────────────┴───────────────────┘
```

Every seam between panels can be dragged to resize, and the sizes are remembered in this
browser. This is **not** a docking system: panels cannot be moved to another zone, torn off
or stacked.

---

## Title bar

From left to right:

| Control | Where | What it does |
|---|---|---|
| The square mark + **Pixel Creator** | left | The product mark |
| Scene name | left | The document currently open — a new project starts on `Untitled Scene` |
| A small dot beside it | left | Something is not saved yet |
| **Play** ▶ | centre | Start the simulation, in the editor |
| **Pause** ⏸ | centre | Freeze the clock; the scene keeps drawing and stays editable |
| **Stop** ⏹ | centre | Restore the scene exactly as Play found it |
| Panel toggles | right | Show or hide **Hierarchy**, **Project**, **Timeline**, **Inspector** |
| **Projects** (folder icon) | right | *New Project*, and the list of projects this browser holds |
| **Preview** | right | Bundle the project and open it in its own window, with no editor around it |
| **Share** | right | *Export game…* — writes a `.pxgame.json` file |
| **Profile** | right | Reserved. It currently says *"Accounts are not built yet"* |

The four toggles are in the order the panels sit on screen: left column top, left column
bottom, the band across the scene, right column.

> **Play, Pause and Stop act on the live scene.** Play does not copy anything: the objects
> that run are the objects you were editing, which is why you can keep editing while the game
> runs. Stop puts back the snapshot Play took. Undo history is deliberately *not* recorded
> while the game is running.

---

## Hierarchy

The list of objects in the open scene, as a tree.

- **Click** a row to select it. **Click a selected row's name again** to rename it.
- **Double-click** a row to frame that object in the viewport.
- **The twisty** (chevron) on the left opens and closes an object's children.
- **Drag** a row onto another to make it a child; drag it between rows to reorder. The
  reordering is real data — sibling order is saved with the scene.
- Each row carries three controls on the right:
  - **Lock** — clicks in the scene pass through the object. Useful for backgrounds.
  - **Eye** — turns the object *off*. An object that is off stops drawing **and** stops
    running: its graph, its movement and its collisions all stop. It is the same value the
    Inspector calls **Active**.
  - **Trash** — delete the object, and everything under it.
- The window's own header has **search**, **Create object** (`+`) and **More**.
- **Delete** or **Backspace** deletes the selected object when you are not typing in a field.

## Project

The files of your project — the **resources**. See
[Resources and assets](resources.md) for what each kind is.

- **Breadcrumb navigation** across the top; folders open in place.
- `+` **Create resource** — a categorised menu: **General ▸** Folder; **Scenes ▸** Scene;
  **Graphics ▸** Image…, Animation…, Tileset…; **Audio ▸** Sound…; **Components ▸**
  Component. An entry ending in `…` asks you for a file first. *(Prefabs are not made from
  this menu — you make one by dragging an object from the Hierarchy into the Project panel.
  See [Prefabs](prefabs.md).)*
- **More** — *Import files…*, *Go to top level*, *Show every resource*.
- **Drag** a resource onto a folder to move it into it; drag files from your desktop straight
  into the panel to import them.
- **Click a selected resource's name again** to rename it — the same gesture as the
  Hierarchy.
- A resource with unsaved changes carries the same small dot the title bar uses.
- **Double-click** (or Enter) opens a resource that can be opened: a scene, or a `.px`.
- **Right-click** a resource for what can be made *from* it — right-clicking an image
  offers *New Tileset from this*. Right-clicking the background offers what can be created
  *here*.

## Inspector

Everything about whatever is selected — an **object**, or a **resource**.

For an object it shows:

- its **name**, **Tag**, **Layer** and **Active** flag;
- a **Transform** section, whose fields are paired into **Position**, **Rotation** and
  **Scale** rows;
- one section per **component**, with that component's own fields;
- **Add Component** at the bottom.

For a resource it shows what that kind of resource has: an image's dimensions and size, an
animation's frames and speed, a tileset's grid, a `.px`'s declared properties.

Numeric fields can be **typed into**, **stepped** with the small arrows, or **scrubbed** by
dragging sideways on the field's label. Sections can be collapsed, and the window's **More**
menu has *Expand all sections* / *Collapse all sections*.

## Viewport

The scene, drawn by the real engine — the same renderer a player's browser uses.

| Gesture | Result |
|---|---|
| Click an object | Select it |
| Drag an object | Move it |
| Drag a handle | Resize it |
| Middle-drag or right-drag | Pan the view |
| Scroll / pinch | Zoom |
| Click empty space | Deselect |
| `F` | Frame the selection |
| `Escape` | Cancel a gesture in progress; otherwise deselect |

In the corner controls:

- the **zoom readout** (`100%`);
- **Frame selection** and **Reset view**;
- the **create tools** — **Empty**, **Rectangle**, **Camera**. Drag one into the scene to
  place it where you drop it, or tap it to place it at the centre of the view.

When a **Tilemap** object is selected, the viewport also shows a tile picker and painting
takes over inside that map's grid — see [Tilemaps and tilesets](tilemaps.md).

## Document tabs

Above the viewport. The **Scene** is one document; every `.px` graph you open is another.
Tabs can be reordered by dragging, and closed with their `×`. A tab with unsaved changes
carries a dot.

## Timeline

Hidden by default, and **currently an empty shell**. It says so when you open it:
*"Keyframes and tracks arrive with the animation system."*

Sprite animations do exist today — they are [resources](resources.md), edited in the
Inspector and played by the **Sprite Animator** component. They are simply not authored in a
timeline yet.

---

## What is not there

Being explicit about this saves you looking for it:

- **No account system.** The Profile button says so.
- **No publishing to a URL.** *Share* exports a file; hosting it is up to you
  ([Preview and sharing](preview-and-sharing.md)).
- **No multiplayer and no real-time collaboration** in the current build. The engine's
  architecture is designed around them — every edit is an *operation* with an authority
  check — but there is no server and no networking code in this repository.
- **No docking, no floating windows, no custom layouts** beyond resizing and hiding.
- **No script editor.** Behaviour is authored as [graphs](visual-scripting.md).

## Next

- [Objects and components](objects-and-components.md)
- [Keyboard shortcuts](shortcuts.md)
