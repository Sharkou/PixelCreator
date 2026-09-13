# Troubleshooting

Common problems, and what actually causes them. Most of these are the editor being honest
about a limit rather than something broken.

## My project disappeared

Pixel Creator keeps your project in **this browser, on this machine**
([why](projects-and-scenes.md#where-your-project-is-kept)). Things that delete it:

- clearing browsing data / site data for the editor's address;
- a browser extension that clears storage;
- working in a **private/incognito window**, where the browser may keep nothing;
- using a different browser, or a different machine.

There is no server-side copy, because there is no server. **Export** is the backup:
*Share ▸ Export game…* ([how](preview-and-sharing.md#export)).

## "This browser is not keeping projects"

The Projects menu says this when the browser refused persistent storage. The editor still
works completely — for as long as the tab is open. Export before you close it.

Usual causes: a private window, storage disabled in the browser's settings, or a full storage
quota.

## Nothing draws / my object is invisible

Work down this list:

1. **Does it have a renderer?** An object with only a Transform is an invisible point. Add a
   **Rectangle** or a **Sprite**.
2. **Is it off?** Check the eye in the Hierarchy and *Active* in the Inspector. An object that
   is off does not draw *and* does not run.
3. **A Sprite with no `source`** draws nothing. Drag an image onto it.
4. **A Sprite with `width` and `height` at `0`** uses the image's own size — which is fine,
   unless the image has not loaded, in which case there is nothing to take a size from yet.
5. **Is it behind something?** `layer` decides draw order; higher is in front.
6. **Is it off camera?** Press `F` to frame the selection, or *Reset view*.
7. **A Tilemap with `0` columns and `0` rows** has no grid to paint into, so there is nothing
   to draw. Give it a size ([tilemaps](tilemaps.md)).
8. **A Tilemap with no `tileset`** cannot know what a cell looks like.

## My graph does nothing

1. **Is there an event node?** A graph with no **On Start**, **On Update**, **On Key**,
   **On Pointer Button** or **On Collision** has no starting point and will never run.
2. **Is the flow actually wired?** A node sitting next to another is not connected to it. Flow
   ports must be joined.
3. **Is the component on the object?** Editing a `.px` does not attach it. Use
   **Add Component**.
4. **Does the editor report an error on the graph?** A graph with an error does not run, and
   the editor names the node. See
   [when a graph is wrong](visual-scripting.md#when-a-graph-is-wrong).
5. **Put a `Log` node on the wire you are unsure about.** It is the fastest way to find out
   what a value really is.

## My object moves at a different speed on another computer

You are moving "per step" instead of "per second". Multiply your speed by **Delta Time**
([why](visual-scripting.md#frame-rate-use-delta-time)).

## My object falls through the floor

- The falling object needs **Velocity**, **Body** *and* a **Box Collider**.
- The floor needs a collider with **`solid` on** — a **Box Collider**, or a
  **Tilemap Collider** on a Tilemap object.
- Check the collider's `width`/`height` and its offsets: a collider is its own rectangle and
  does not automatically match the renderer's size.
- A very high speed can outrun a thin floor. Make the floor thicker, or the speed lower.

## Nothing collides

- **Both** objects need a collider.
- At least one of them needs a **Body** for anything to be *blocked*. Two colliders with no
  Body still *detect* — which is what **On Collision** and **Is Overlapping** read.
- `solid` **off** means detect-only. That is how you build a coin, a trigger or a damage zone.

## No sound

- Browsers refuse to play audio before the player has interacted with the page. A sound that
  only starts after the first click is the browser, not the engine.
- An **Audio Source** starts with `playing` **off** on purpose — adding a component must never
  make a noise nobody asked for. Turn it on, or use the **Play Sound** node.
- Check `volume`, and check that `clip` points at a sound.
- Dragging a sound *into the scene* creates an object with an Audio Source that **is** already
  playing — that is the difference between the two gestures.

## The Preview window did not open

A pop-up blocker. Allow pop-ups for the editor's address, or open the link the editor printed
to the browser console — the bundle is stored and the link is valid. More in
[Preview](preview-and-sharing.md#if-preview-does-not-open).

## The Preview shows an old version

It should not: every open document is saved before the bundle is built. If the editor could
*not* save — a full quota, storage refused — it says so and does not open a window, rather
than showing you yesterday's scene.

## A component section is titled with a meaningless string

Something like `ffs2qex9nw0v` in place of a name means the `.px` file that defined that
component **has been deleted**. The component is still on the object, but nothing can name its
type any more. Either restore the file, or remove the component.

## Undo took back the wrong thing

Undo is **per document**. The scene has one stack, and each `.px` graph has its own. With a
graph tab in front, `Ctrl Z` undoes in that graph.

Undo is also not recorded while the game is running — use **Stop** to put the scene back.

## Play changed my scene

It should not. **Stop** restores the scene exactly as Play found it. If you pressed Play,
edited things, and then pressed Stop, the snapshot Play took is what comes back — including
over your edits. Edit with the game stopped if you want the change to stick.

## The Timeline is empty

It is an empty shell today, and it says so. Sprite animations exist as
[resources](resources.md#animation) and are played by the **Sprite Animator** component; they
are simply not authored in a timeline yet.

## Something else

- Open your browser's developer console (`F12`): the editor reports what it refuses, and why.
- Search the [issue tracker](https://github.com/Sharkou/PixelCreator/issues).
- If it looks like a bug, open a
  [bug report](https://github.com/Sharkou/PixelCreator/issues/new?template=bug_report.md) —
  browser, operating system, and the steps that reproduce it.
