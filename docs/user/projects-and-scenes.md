# Projects and scenes

## What a project is

A **project** is one game: its scenes, its images and sounds, its components, and the
identity that ties them together. In the editor, a project is what the **Project** panel
shows you.

A project has an **id** that never changes and a **name** you can edit freely. Two projects
may have the same name — the name is a label, not an identity. Nothing in a project is
addressed by name, so renaming anything is always safe.

## Where your project is kept

**In your browser, on this machine.** Pixel Creator writes your project into your browser's
own database (IndexedDB). There is no server, no cloud and no account.

That has consequences worth knowing on day one:

| | |
|---|---|
| ✅ | It works offline, and it survives closing the tab and restarting the browser |
| ✅ | It opens fast, however many images the project holds |
| ⚠ | **Clearing browsing data for this site deletes your project** |
| ⚠ | It is not on your other computer, or your phone |
| ⚠ | A private/incognito window, or a browser with storage switched off, may keep nothing |

If the browser refuses to keep anything, the editor **still works** for as long as the tab is
open, and the Projects menu says so: *"This browser is not keeping projects"*. That is not an
error you need to fix — but export your work before you close the tab.

**Export is your backup.** *Share ▸ Export game…* writes the whole project to a
`.pxgame.json` file you can keep anywhere. See
[Preview and sharing](preview-and-sharing.md).

## Saving

Saving is automatic. A short moment after you stop making changes, the editor writes what you
changed. Two signals tell you where you stand:

- the **dot** beside the project name in the title bar — something is not written yet;
- the same dot on a document tab or a Project panel tile — *that* document is not written
  yet.

**Ctrl S** (**Cmd S** on macOS) saves immediately. You never have to press it; it is there
for the moment before you close the laptop.

## New, and open

The **Projects** button in the title bar (the folder icon) is the whole project management
there is today:

- **New Project** — starts a fresh project on the starter scene.
- **Open** — the list of projects this browser holds; pick one.

Choosing either reloads the page with that project open. There is no dashboard, no
thumbnails and no folders of projects yet.

## What a scene is

A **scene** is a place the game happens in: a set of objects, arranged. A project can hold
many scenes — a menu, a level, a boss room — and only one is open in the editor at a time.

Make one with the Project panel's `+` ▸ **Scene**. Double-click a scene to open it.

A scene is a resource like any other: it lives in the Project panel, it can be renamed,
moved into a folder, and deleted.

### Moving between scenes while the game runs

The **Load Scene** node changes which scene the game is playing. It is the node you use for
"the player walked through the door" and for "Play again".

Two things about it are worth knowing:

- The change happens **between frames**, never in the middle of one. Everything in the
  current step finishes against the scene it started on.
- **Session values survive a scene change.** Anything you wrote with **Set Session Value**
  (a score, a life count, which door you came through) is still readable with
  **Get Session Value** in the next scene. Nothing else survives — the objects are new.

## Undo and redo

**Ctrl Z** undoes; **Ctrl Shift Z** or **Ctrl Y** redoes.

Undo history is **per document**. The scene has its own stack, and every `.px` graph has its
own. Undoing while a graph tab is in front takes back the last thing you did *in that graph*,
not in the scene. This is deliberate: it means opening another document never throws away
what you could still take back.

One gesture is one undo entry, even when it changes a lot: dragging an object across the
screen, painting a stroke of fifty tiles, typing a whole name, deleting a folder full of
files — each is a single **Ctrl Z**.

Undo is **not** recorded while the game is running. Play, Pause and Stop are a door the
history stops at; Stop restores the scene as Play found it.

## Importing and exporting

| Direction | How |
|---|---|
| **Bring assets in** | Drag files onto the Project panel, or use `+` / *More ▸ Import files…* |
| **Take the game out** | *Share ▸ Export game…* → a `.pxgame.json` bundle |

There is currently **no "import project" button**: a `.pxgame.json` file is played by the
game client, not opened back into the editor. If you need the file to survive, keep the file.

## Next

- [Objects and components](objects-and-components.md)
- [Resources and assets](resources.md)
- [Preview and sharing](preview-and-sharing.md)
