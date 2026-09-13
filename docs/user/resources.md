# Resources and assets

Everything in your project that is not an object in a scene is a **resource**: a scene, an
image, a sound, a component you wrote, a prefab, an animation, a tileset, a folder. The
**Project** panel is the list of them.

## The kinds of resource

| Kind | What it is | How you make one |
|---|---|---|
| **Folder** | A place to put the others | `+` ▸ General ▸ Folder |
| **Scene** | A place the game happens in | `+` ▸ Scenes ▸ Scene |
| **Component** (`.px`) | A behaviour you drew, usable as a component | `+` ▸ Components ▸ Component, or **Add Component ▸ New ▸ Custom Component** |
| **Prefab** | A reusable model of an object and its children | Drag an object from the Hierarchy into the Project panel |
| **Animation** | A strip of a picture, and how fast to walk it | `+` ▸ Graphics ▸ Animation… (pick an image) |
| **Tileset** | A sheet cut into tiles | `+` ▸ Graphics ▸ Tileset… (pick an image), or right-click an image ▸ *New Tileset from this* |
| **Image** | A picture you imported | `+` ▸ Graphics ▸ Image…, or drag a file in |
| **Sound** | A sound you imported | `+` ▸ Audio ▸ Sound…, or drag a file in |

Images and sounds are the same kind of thing under the hood — both are plain imported files.
What differs is what a browser offers you in its file picker, and which components will accept
them.

## Identity: why renaming is always safe

Every resource has an **id** that is minted once and never changes, and a **name** you can
edit whenever you like. Everything that points at a resource — a Sprite's `source`, a
Tilemap's `tileset`, a component on an object — points at the **id**.

So: rename a file, move it into a folder, move it back out. Nothing breaks. Two resources may
carry the same name. Nothing in your project is addressed by its name.

## Folders

A folder is just another resource with a name and a place. That means:

- renaming a folder is the same undoable action as renaming a scene;
- **deleting a folder deletes everything in it, as one undo entry**;
- dragging things between folders is a real move, recorded in history.

Navigate with the **breadcrumb** across the top of the panel. *More ▸ Go to top level* jumps
out; *More ▸ Show every resource* flattens the view so you can see everything at once.

## Importing files

Three ways, all equivalent:

1. **Drag files from your desktop** onto the Project panel.
2. `+` ▸ **Image…** / **Sound…**.
3. *More* ▸ **Import files…**.

The file's bytes are copied into your project. Pixel Creator does not keep a link to the file
on your disk, so moving or deleting the original afterwards changes nothing.

### Replacing an image

Select an image, then drag a new file onto its **content panel** in the Inspector. Everything
that referenced that image now shows the new picture — because the references are to the id,
and the id did not change.

## Drag and drop

Drag and drop is a first-class way to work in Pixel Creator, not a shortcut. The rule is:
**the editor tells you what a drop will do before you let go.** A label follows the pointer
saying, in words, what is about to happen — and if nothing can happen, it says why instead of
silently doing nothing.

What you can drop, and where:

| Drag this | Onto this | Result |
|---|---|---|
| An **image** | the scene | A new object with a **Sprite** pointed at it |
| An **image** | the Hierarchy | The same, placed at the origin |
| A **sound** | the scene or Hierarchy | A new object with an **Audio Source**, already playing |
| An **image** or **sound** | an object's components area | That component added to *that* object |
| A **`.px` component** | an object's components area | That component added to the object — same as picking it from Add Component |
| A **prefab** | the scene | An instance placed where you dropped it |
| A **resource** | a matching property field | Assigned to that property |
| A **resource** | a folder | Moved into it |
| An **object** | another object (Hierarchy) | Reparented |
| An **object** | the Project panel | **Saved as a prefab** |
| An **object** | an `objectref` property (such as Follow's `target`) | Assigned as a reference |
| **Files from the desktop** | almost anywhere above | Imported first, then whatever the drop meant |
| An **object**, **property** or **resource** | a `.px` graph canvas | A node that reads or writes it — the graph asks which, when the answer is ambiguous |

Two refusals worth recognising, because they are intentional:

- **Dropping an image onto a number** refuses. A property declares what it accepts; the
  editor never guesses.
- **Dropping an image onto an object that already shows one** refuses, and names the place
  that *would* take it. Two sprites on one object is legal but almost never what you meant.

## Animation

An animation is created **from a picture**, because a clip with no picture could not name a
single frame. Choose `+` ▸ **Animation…**, pick a sprite sheet, and Pixel Creator reads the
grid off the file. Then adjust its frames and speed in the Inspector.

Play it with the **Sprite Animator** component, or from a graph with **Play Animation**.

Ten enemies playing the same `Walk` clip all name one resource — retime the clip and all ten
retime. That is the point of it being a resource rather than a field.

## Tileset

Same principle: a tileset is a **cutting** of a sheet, and the cutting is the resource. Two
maps of one dungeon name one tileset; re-cut the sheet and both maps follow. See
[Tilemaps and tilesets](tilemaps.md).

## Deleting

Select and press **Delete** or **Backspace** (when you are not typing in a field). It is
undoable, including for a folder full of files.

## Next

- [Tilemaps and tilesets](tilemaps.md)
- [Prefabs](prefabs.md)
- [Visual scripting](visual-scripting.md)
