# Preview and sharing

There are three different ways to see your game move, and they answer three different
questions.

| | Answers | Where |
|---|---|---|
| **Play** | "Does this behave right?" | In the editor, on the live scene |
| **Preview** | "What does a player actually get?" | Its own window, no editor around it |
| **Export** | "Can I keep this, or put it online?" | A `.pxgame.json` file on your disk |

---

## Play, Pause, Stop

The three buttons in the middle of the title bar.

**Play** starts the simulation **on the scene you are editing**. It does not make a copy: the
objects that run are the objects you were just looking at. That is why you can keep selecting
things, changing values and watching the effect while the game runs — which is the whole point
of an editor that shares its model with its engine.

**Pause** freezes the clock. The scene keeps drawing and stays editable; nothing advances.

**Stop** restores the scene exactly as Play found it. Pixel Creator takes a snapshot when Play
starts and puts it back on Stop, so running your game never costs you your level.

Two consequences worth knowing:

- **Undo history stops at the door.** Changes the *game* makes while it runs are not undo
  entries — they are simulation, not intentions. Stop is what takes them back.
- **Play is not "the real thing".** The editor is drawing the scene with its own camera and
  its own overlays. For the real thing, use Preview.

## Preview

The **Preview** button bundles the whole project and opens it in a **new browser window**
running the game client — no panels, no grid, no selection outlines. This is what a player
sees.

What happens when you press it:

1. Every open document is **saved first**, so the Preview shows what is on screen and not what
   was last written.
2. The project — scenes, graphs, images, sounds, prefabs, tilesets — is bundled into one JSON
   payload.
3. The bundle is stored in the browser under the project's identity.
4. A window opens at that bundle.

### Several previews at once

Pressing Preview twice gives you **two windows on the same game**, not two different games.
They share the project's identity, so they are two clients of one thing. This is the shape
multiplayer will eventually slot into; today it is simply useful for looking at two views at
once.

### Live editing

While a Preview window is open, the editor keeps it in step:

- **Changes to the scene** arrive as the operations that made them, so the running game is
  updated in place and keeps everything it had — objects that have moved, timers that are
  running.
- **A saved `.px` graph** is sent whole, and the Preview rebinds that behaviour immediately.

So you can adjust a graph and watch a running Preview change, without restarting it.

### If Preview does not open

| What you see | What it means |
|---|---|
| "The browser blocked the preview window" | A pop-up blocker. Allow pop-ups for the editor, or open the link printed to the browser console — the bundle *is* stored and the link is good |
| "This browser would not store the preview" | A private window, or storage is full |
| "The latest changes could not be saved…" | Storage refused the write, so the Preview would have shown an older version. Nothing was opened, on purpose |

Only the **most recent few projects** keep a stored bundle — currently four. Older ones are
dropped, oldest first, because a project carries its images inside the bundle and keeping
every one would fill the browser's storage.

## Export

**Share ▸ Export game…** writes the same bundle to a file:

```
My Game.pxgame.json
```

It is a **JSON file first** — anything can read it, and you can look inside — and a Pixel
Creator game second.

This file is:

- your **backup**. It is the only copy of your project that is not inside one browser;
- your **distribution**. Put it on any static host and it is playable.

### Playing an exported file

The game client takes the bundle's location in the page's fragment:

```
.../preview/index.html#u/<url-encoded address of your .pxgame.json>
```

Host the file anywhere a browser can fetch it from, point that URL at it, and anyone with the
link can play — with no editor anywhere near it.

> **There is no import.** A `.pxgame.json` is played, not opened back into the editor. Keep
> the file if you need the project to survive; the editor cannot currently read one back in.

## What does not exist yet

Being plain about this saves you hunting for a button:

- **No publishing to a URL from the editor.** *Share* says so: hosting a game *for* you needs
  accounts and permissions, and that has not been built. What exists is the half that does not
  need a server — the bundle, and a client that can play one from any address.
- **No accounts.** The Profile button says *"Accounts are not built yet"*.
- **No multiplayer, no matchmaking, no server.** There is no networking code in this
  repository. The engine's model is built so that it can arrive — every change is an
  *operation* with an authority check, and the simulation is deterministic from a seed — but
  none of it is running today.
- **No desktop build.** Pixel Creator is a web application on purpose. There is no `.exe`, no
  Electron wrapper and no installer.

## Next

- [Projects and scenes](projects-and-scenes.md) — where your work is actually kept
- [Troubleshooting](troubleshooting.md)
