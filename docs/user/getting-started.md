# Getting started

This page takes you from an empty browser tab to an object you can move with the keyboard.
It should take about ten minutes, and you will not write a line of code.

## 1. Open the editor

**[▶ editor.pixelcreator.io](https://editor.pixelcreator.io)**

That is the whole installation. Pixel Creator is a web application: it runs in the browser
tab, it needs no download, and it needs no account.

Use a recent desktop browser (Chrome, Edge, Firefox or Safari). The editor also works under
a touch pointer, and every keyboard shortcut it binds also has a control you can tap — but
a real keyboard and a mouse make the first hour much easier.

## 2. What you are looking at

A brand-new project opens on a small **starter scene** so that the viewport is not a blank
grey square. It contains:

| Object | What it is |
|---|---|
| `Main Camera` | Decides what part of the world a player sees |
| `Ground` | A wide dark rectangle |
| `Player` | A purple square |
| `Visor` | A small dark rectangle, attached **to** the Player |
| `Crate`, `Crate 2` | Two brown squares, one of them rotated |

Nothing in that scene is special. Every object in it was made with the same buttons you are
about to use, and you can delete all of it.

The main areas of the window are covered in detail in
[Editor layout](editor-layout.md); the short version is:

- **Hierarchy** (top left) — the list of objects in the scene.
- **Project** (bottom left) — the files of your project.
- **Inspector** (right) — everything about whatever is selected.
- **Viewport** (middle) — the scene itself.
- **Title bar** (top) — the project menu, the Play/Pause/Stop transport, Preview, and the
  buttons that show or hide panels.

## 3. Select and move something

Click the purple `Player` square in the viewport. Three things happen:

1. An outline and eight square handles appear around it.
2. `Player` highlights in the Hierarchy.
3. The Inspector fills with the Player's properties.

Now:

- **Drag the square** to move it.
- **Drag a handle** to resize it.
- **Drag with the middle or right mouse button** to pan the view. (On a touch screen, a
  drag on empty space pans.)
- **Scroll** to zoom. The current zoom is printed in the corner of the viewport.
- Press **F** to frame the selection, or use the *Frame selection* button in the viewport's
  corner controls.
- Click empty space, or press **Escape**, to deselect.

Notice that the small `Visor` rectangle follows the Player when you drag it. That is because
`Visor` is a **child** of `Player` in the Hierarchy: children move, rotate and scale with
their parent. See [Objects and components](objects-and-components.md#parents-and-children).

## 4. Change a value precisely

With `Player` selected, look at the **Transform** section in the Inspector. It holds
`X`, `Y`, `Rotation X`, `Rotation Y`, `Scale X` and `Scale Y`.

You can:

- **type** a number into a field and press Enter;
- **drag sideways on the field's label** to scrub the value up and down;
- **use the small arrows** at the right of a numeric field to step it.

Set `X` to `0` and `Y` to `40` and the Player jumps back to where it started.

Every edit you make is undoable with **Ctrl Z** (**Cmd Z** on macOS), and redoable with
**Ctrl Shift Z** or **Ctrl Y**.

## 5. Create an object

Use the **create tools** in the viewport's corner control group. They offer three kinds:

| Kind | What you get |
|---|---|
| **Empty** | An object with a Transform and nothing else |
| **Rectangle** | An object with a Transform and a Rectangle renderer — a coloured box |
| **Camera** | An object with a Camera component |

Either **drag** a tool into the scene to place it where you drop it, or **tap** it to place
it at the centre of the view.

Create a Rectangle. It appears in the Hierarchy, selected, with its Rectangle section in the
Inspector — change its `Color`, `Width` and `Height` there.

## 6. Make it move — without code

Behaviour in Pixel Creator is a **graph**: boxes ("nodes") joined by wires. A graph lives in
a `.px` file, and a `.px` file *is* a component you can add to an object.

1. Select an object and press **Add Component** in the Inspector.
2. At the bottom of the menu, under **New**, choose **Custom Component**. Pixel Creator
   creates a `.px` file, attaches it to the object, and opens its graph in a tab above the
   viewport — all in one gesture.
3. The graph canvas is empty. **Right-click it** (or use the *Add node* button in the
   graph's corner controls) to open the node palette, and add an **On Update** node.
   `On Update` fires once per simulation step.
4. Add a **Translate** node. Drag from `On Update`'s flow output onto `Translate`'s flow
   input to wire them together.
5. `Translate` takes an `X` and a `Y`. Give `X` a small number — try `1`.
6. Go back to the **Scene** tab and press **Play** in the title bar.

The object drifts to the right. Press **Stop** and the scene snaps back exactly to how Play
found it — Play never destroys your work.

To move it *only when a key is held*, replace the constant with input:

1. Add a **Key Is Down** node and pick a key (for example `ArrowRight`).
2. Add a **Branch** node: `On Update` → `Branch`, and wire `Key Is Down` into `Branch`'s
   condition. `Branch`'s *true* output goes to `Translate`.

That is the whole idea. [Visual scripting](visual-scripting.md) explains the model properly,
and [Node reference](node-reference.md) lists every node there is.

## 7. Speed and frame rate

Moving by `1` every step means "1 unit per step", which runs at a different speed on
different machines. The fix is the **Delta Time** node: multiply your speed by it and the
movement becomes "per second" instead of "per step".

```
Number (200)  ─┐
               ├─ Multiply ──► Translate.X
Delta Time    ─┘
```

## 8. Play it for real

The **Play** button runs the simulation *inside the editor*, so you can keep editing while
it runs. **Preview** (the button beside it) bundles the whole project and opens it in its own
window, with no editor around it — that is what your game actually looks like to a player.

**Share ▸ Export game…** writes the bundle to a `.pxgame.json` file you can keep or host
yourself. See [Preview and sharing](preview-and-sharing.md).

## 9. Your work is saved automatically

Pixel Creator saves into your browser's own storage a moment after you stop making changes,
and the dot beside the project name in the title bar tells you when something is not written
yet. **Ctrl S** saves immediately.

Two things worth knowing straight away:

- **The project lives in this browser, on this machine.** It is not in the cloud, and there
  are no accounts yet. Clearing site data deletes it.
- **A private/incognito window may keep nothing.** If so, the Projects menu says
  *"This browser is not keeping projects"*. Export before you close the tab.

Details in [Projects and scenes](projects-and-scenes.md).

## Where to go next

- [Editor layout](editor-layout.md) — the full tour.
- [Component reference](component-reference.md) — sprites, text, particles, physics, audio.
- [Resources and assets](resources.md) — get your own images and sounds in.
- [Tilemaps and tilesets](tilemaps.md) — paint a level instead of placing rectangles.
- [Concepts and glossary](concepts.md) — if a word on these pages is unfamiliar.
