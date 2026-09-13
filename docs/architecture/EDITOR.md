# Editor

> See ADR-0006 (Web Components), ADR-0007 (schema-driven Inspector) and ADR-0017 (selection).

## IMPLEMENTED — state as of 2026-08-13 (phase UX-2)

`src/editor/` opens: `src/editor/index.html`, served from the repository root (see
`../development/DEVELOPMENT.md`). No dependencies, no build.

```
src/editor/
├── index.html            the mount point — one <script type="module">, nothing else
├── editor.js             the composition root: model, camera, selection, shell
├── layout.js             window sizes and visibility, persisted
├── selection.js          selection, local to the Editor (ADR-0017)
├── commands.js           create / delete an Object, add / remove a Component
├── registry.js           type registration + presentation of the Add menu
├── project/starter.js    the opening scene, pending project loading
├── ui/                   element · styles · icons · window · tabs · splitter
│                         menu · field · number-input · scrub · empty-state
├── inspector/schema.js   schema → descriptors, display units, pairing (pure)
├── viewport/             viewport · surface · picking · resize · grid · overlay · guides
│   └── tools/            select-tool · pan-tool
└── windows/              hierarchy · inspector · toolbar · project · timeline · graph
                          workbench (pure) · search · drop (pure)
```

### Naming convention

Editor classes **carry no prefix**: `Element`, `Window`, `Field`, `Viewport`, `Hierarchy`.
Custom elements keep their mandatory `px-` prefix.

Three of those names shadow something: `Element` and `Window` shadow DOM globals, `Viewport`
collides with the runtime export. The rule is the one `core/object.js` already applies to
`Object` (`CONVENTIONS.md`): **a module that imports ours reaches the global through
`globalThis`, or aliases at the import.**

> **A trap we hit.** `Element.prototype.prefix` is a read-only getter. Setting
> `this.prefix = …` on an element throws a `TypeError` — silently, because it originated in an
> `Emitter` listener. An element's internal state goes in a `#private` field, never in a public
> property whose name might exist on the DOM side.

### Layout

**L4** (`design/README.md`, D8): the bottom strip stops before the Inspector, which keeps an
unbroken column from the titlebar to the floor; when nothing is animated and no `.px` is open,
the strip is not there at all.

```
┌──────────────────────────────────────────────────────────────┐
│ titlebar                       [hier] [proj] [time] [insp]   │
├─────────────┬───────────────────────────┬───────────────────┤
│ Hierarchy   │                   [tools] │ Inspector         │
│  (search)   │        upper area         │                   │
├─────────────┤                           │                   │
│ Project     │                           │                   │
├─────────────┴───────────────────────────┤                   │
│ Timeline │ Player.px │ …                │                   │
├─────────────────────────────────────────┤                   │
│ bottom strip — collapsed when empty     │                   │
└─────────────────────────────────────────┴───────────────────┘
```

Nested flex, sizes as CSS variables written by `layout.js`, seams moved by `<px-splitter>`
(double-click = the default value). The Hierarchy takes what the Project leaves — a list grows
with the scene, a shelf is a shelf. Below 760 px wide, the Inspector switches to an overlay
instead of squeezing the scene — **the same Editor, not a mobile version**.

### The creation rail was removed — decision of 2026-08-14

This document used to defend the left rail like this: "it is kept because it carries a
capability the menu does not replace: the object is born exactly at the drop point". **That
argument was about dragging, not about position**, and that is where the reasoning stopped too
early: it concluded "so the rail stays" while it had only established "so dragging stays".

The three creation tools now live in the Viewport's control group, top right, alongside *Frame
selection* and *Reset view*:

- **dragging is unchanged** — `<px-toolbar>` keeps exactly its Pointer Events logic, its ghost
  on `document.body` and its call to `viewport.worldAt()`; the object is still born exactly at
  the drop point, and a tap still creates at the centre of the view;
- the element is **inserted into the Viewport's `<slot name="tools">`** rather than into the
  shell: the Viewport hosts the group, it learns nothing about what the tools do, and no import
  crosses `windows/` → `viewport/`;
- what disappears is **44 px of full-height chrome** for three buttons. Measured in the browser
  at 1440 px wide: the Viewport goes from 854 to 898 px — exactly the rail's 44 px — and its
  left edge from 281 to 237.

A control that acts on the scene belongs to the scene. That is the same rule that already put
framing and reset inside the Viewport rather than on a bar beside it.

### What works

| Capability | How |
|---|---|
| See a real Scene | `Runtime` + `SceneRenderer` + Canvas 2D — **the engine, not an IDE rendering** |
| Navigate | wheel (smoothed zoom, anchored to the pointer), right or middle drag, `F` or the framing button |
| Guides | cursor position along the edges, in the DOM — the renderer contract has no text |
| Select | a click in the Viewport or the Hierarchy, outline + pivot + eight handles |
| Move | drag the object, rounded to the unit, one `batch` per gesture |
| Resize | eight handles, the opposite edge stays anchored, rotation and parents included |
| Hierarchy | search behind the magnifier, keeping ancestors, collapse/expand, `lock` / `visible` / delete per row |
| Rename | a **second** click on the name of a row *already selected before the press*, followed by a `RENAME_DELAY` pause (400 ms) · `F2` does it immediately · `Enter` commits · `Esc` cancels |
| Frame | double-click on a row — **never a rename**, including on the name |
| Inspector | driven by `componentSchema()`: number, integer, slider, boolean, enum, colour |
| Create | drag a tool from the Viewport's group → the object is born **exactly at the drop point** |
| Components | a grouped menu (`Rendering ▸ Rectangle`), an `active` toggle, removal |

### The local decisions worth knowing

1. **The Editor's camera is an `Object` outside the scene.** Transform + Camera like any other
   camera (ADR-0013), simply never added: absent from the Hierarchy, never serialized,
   impossible to delete. Pan and zoom write it directly — no Operation.
2. **Two stacked canvases.** `SceneRenderer.render()` starts by clearing; the grid therefore
   lives on a surface underneath and the scene clears to transparent. Nothing is added to the
   renderer contract.
3. **The Viewport owns the `Runtime`.** `Runtime` receives its renderer at construction and the
   canvas belongs to the element. `running` stays `false`: nothing simulates while editing,
   `render()` draws anyway.
4. **One tool, three gestures.** This document once sketched `SelectTool` + `MoveTool` +
   `ResizeTool`; having three would force you to pick a mode before you could drag anything.
   `SelectTool` distinguishes by where you click: on a handle it resizes, on the shape it moves,
   on empty space it deselects. `PanTool` is **transient** — entered with the middle or right
   button, left on release. `ZoomTool` does not exist: the wheel is a gesture, not a mode.
5. **Computation lives outside the elements.** `picking.js`, `resize.js`, `grid.js`, `search.js`
   and `inspector/schema.js` are pure and tested under Node. That is what kept `viewport.js`
   from becoming the 27 kB of `handler.js` all over again.
6. **One drag = one Operation per frame, grouped by `batch`** (ADR-0008). Merging them into a
   single history entry will belong to the history.
7. **Move and resize round to the unit.** Legacy did it (`~~`) and it is right for a 2D tool:
   the UI does not round the display — it only ever writes integers, so there is nothing to
   hide.
8. **Pointer Events everywhere, never HTML5 Drag & Drop.** It is the only API that covers mouse,
   stylus and finger; Legacy relied on the other one and therefore never worked on touch.
9. **The world draws the object, the screen draws the tools.** A gizmo follows an object's
   position and geometry, never its scale. `overlay.js` therefore carries all of its geometry in
   screen pixels through `matrix.apply()` and then draws flat — as `handles()` already did, and
   as `outline()` did not. The old version divided a single scalar, `matrixScale()` =
   `sqrt(|det|)`, out of the stroke width: that is the *geometric mean* of the two axis scales,
   so it compensates a non-uniform transform in neither direction. Measured on an object at
   scale 1 × 4, for a 1.5 px target: horizontal edges at 3 px, vertical ones at 0.75 px, and a
   pivot cross 3.5 px wide by 14 px tall — **the cross was stretched by the object it marks**.
   Verified in the browser by image difference (selected render minus unselected render): arms
   of 8 × 28 px before, 14 × 14 px after, identical at scales 1, 3, 0.25, 1 × 4 and 4 × 1.

   Corollary: the sizes in `overlay.js` are in **CSS pixels multiplied by the density**, as
   `handles()` alone did until now. On a 2x screen the outline was otherwise drawn at half the
   visual weight of the handles sitting on it.

10. **Zoom has a detent at 100 %.** A wheel notch multiplies — the same gesture covers the same
   visual distance at 20 % as at 400 % — but the orbit of a multiplicative map does not contain
   1. Measured on the previous code: sweeping the whole range notch by notch, 42 notches from
   `MIN_ZOOM` to `MAX_ZOOM`, the zoom is **never** exactly 1, and from a position reached by
   mixed scrolling the closest approach while scrolling toward 100 % is 0.990446.
   `Math.round(zoom * 100)` then displayed "100 %" on a scene one percent off: fixing the
   display would have been fixing the wrong number. A notch that would *cross* 1 therefore stops
   there; the next notch resumes normally, since a step starting at 1 does not cross it. The
   bounds do not move and remain the only clamping. `viewport/zoom.js`, pure and tested
   (`zoom.test.js`): decision 5 applied to a number you could otherwise get stuck on.

11. **A list row has one highlight, and it is shared.** The `.line` primitive in `ui/styles.js`
   declares the hovered and the selected state together, in that order, so that **hovering an
   already-selected row does not lay a second background over the first**. This was not a
   specificity accident to patch at the call site: it is a fact about what those two states
   mean. A Hierarchy row and a dropdown entry both adopt it — full width, no rounding, the
   accent rail flush with the edge.

### Units and presentation, without touching the model

The Core keeps its units; the Inspector converts for display, in one place
(`inspector/schema.js`):

- `unit: 'rad'` → displayed in degrees, converted exactly both ways;
- a `number` bounded **on both sides** becomes a slider — ADR-0007's conclusion about the
  `range` type, reached from the constraints components already declare;
- `x`/`y`, `width`/`height`, `scaleX`/`scaleY` are paired onto one row, through a **table of
  property names** — so any component with `width` and `height` gets a Size row without the
  Inspector knowing its type.

### `Transform` is an ordinary Component, and the Inspector treats it as one

A question raised on 2026-08-14, settled by reading the model and verifying in the browser:
**`Transform` is removable, and its remove button stays.**

- `localMatrix()` explicitly returns the identity when the object has no `Transform`
  (`core/components/transform.js`) — absence is an anticipated case, not an invalid state.
- Picking goes through `worldMatrix()` and therefore keeps working.
- `SelectTool` tests `getComponent('Transform')` and **bails out** if there is none: an object
  with no placement does not move, and no phantom property is written for it.
- The registry offers it again in *Add Component*, category `Scene`.
- **Verified**: removal from the Inspector, no console error, the object stays selected and
  listed, dragging in the viewport has no effect, `Transform` put back.

This is also ADR-0002's intent: the Legacy defect it fixes is that "every `Object` carries a
position, even a purely logical object". A score manager has no place in the scene. Removing
the button to impose symmetry would contradict the decision that made `Transform` a Component.

What `createObject()` does — adding one on every creation — remains right: that is a tool
default, not a model constraint.

### What stays out of the Inspector, deliberately

The Object's `visible` and `lock` live on the Hierarchy row, where they are reachable for every
object at once; repeating them would mean two controls for one value. The technical `id` is
displayed nowhere. A Component exposes only `active`: the model has no per-Component `visible`,
and inventing one would show a control with no effect.

### Reordering and reparenting — IMPLEMENTED (2026-08-17)

Order is model state: it serializes, replicates and undoes (ADR-0018). The Core has exposed it
since the previous pass; the Editor manipulates it as of this one.

| Gesture | What is emitted | Where |
|---|---|---|
| Drag a row **between** two rows | `REPARENT { parent, index }` | Hierarchy |
| Drag a row **onto** a row | `REPARENT` into that parent, at the end of the list | Hierarchy |
| Drag below the last row | `REPARENT { parent: null }` — the only way to un-nest in one gesture | Hierarchy |
| Drag a Component header | `MOVE_COMPONENT { index, previousIndex }` | Inspector |

A Hierarchy drop is **one batch**: the `REPARENT` plus the five `SET_PROPERTY`s that preserve
the world placement (ADR-0022). One `Ctrl Z` takes the whole thing back.

**The drop geometry is a module of its own, `editor/windows/drop.js`, and it is pure.**
Rectangles and the scene in, `{ parent, index }` out: the rule that decides between "into" and
"after" is tested under Node instead of being discovered by dragging rows around. That is also
where the single subtlety lives: the displayed rank counts the object itself, while the Core
primitives remove before inserting — so a downward move within one collection lands one place
too far without `insertionIndex()`.

Two different marks, because these are two different answers: an accent line at the edge for
"between", an outline for "into". The middle third of a row nests, the top and bottom thirds
insert — nesting gets the largest zone because it is the one that costs most to miss.

The old "detach then reattach" workaround is ruled out for good: for a Component it **destroys
its values** (measured: a `Transform` came back as `0, 0`). A `MOVE_COMPONENT` is a splice on
the ordered collection — nothing is detached, no value is touched.

### The project, the resources and what is open — IMPLEMENTED (2026-08-17)

`Workspace` (`editor/project/workspace.js`) holds the `Project` from the `project/` layer, the
open resource, **the selected resource** and the undo stacks. It is **ADR-0020's `OpenEditor`**,
never serialized into the project.

- The starter scene is declared as a `Resource` of `kind: 'scene'`, so it is listed, renameable
  and saveable like any other.
- "There is unsaved work" is **derived** from the pipeline's `'operation'` event, never a flag
  set by hand. A plain write does not trigger it — it is not an intent (ADR-0003) — and neither
  does a replicated operation.
- `Ctrl S` writes the scene into the `ResourceStore`. The swap to IndexedDB has happened
  (ADR-0065): `PersistentResourceStore` holds the logic, `IndexedDbArea` the forty lines of
  database, and no caller changed — because they all expect a store that can make them wait
  (ADR-0020 §4).
- **A save writes only what changed.** `Workspace.save()` refuses an editor that has authored
  nothing since its last write: rewriting an untouched payload would bump a `revision` that
  every Editor cache invalidates, and would stamp `modified` with an hour at which nothing was
  modified.
- Two separate stacks: the scene's and the manifest's. `Ctrl Z` targets **the one where the last
  intent was emitted** — not the one the selection points at, because a deletion clears the
  selection and the undo that restores it would then target the scene (ADR-0024, ADR-0025).

### Project is a resource manager — IMPLEMENTED (2026-08-17)

A folder is a `Resource` of `kind: 'folder'`, and the hierarchy is a `parent` link, never a
string (ADR-0025). Everything the panel does goes through the existing Operations:

| Gesture | What is emitted |
|---|---|
| `+` ▸ Folder / Scene / Component / Image… | `ADD_RESOURCE` (two, in one `batch`, for a Component and its graph) |
| Rename (double-click, `F2`, or the Inspector) | **one** `SET_PROPERTY name`, on commit |
| Drag onto a folder, or onto a breadcrumb | `SET_PROPERTY parent` |
| Delete | `REMOVE_RESOURCE`, payload embedded; a folder takes its contents with it in one `batch` |

**The `+` menu is a table, not a chain of branches** (`editor/project/commands.js`). A kind
declares its label, its icon, its creation function, and optionally `pick` — "I need a file
first". The panel reads that flag; it never learns what an image is.

**Navigation:** one folder at a time, with a `Project / Assets / Images` breadcrumb. Not a
second tree beside the Hierarchy's: you **browse** a project and you **arrange** a scene, and
those are not the same gestures. The breadcrumb is also a drop target — that is how a resource
leaves a folder in one gesture.

**Search leaves the open folder**, deliberately: a filter that only looked at the current folder
would answer "no results" for a resource that exists.

**Deselecting** is a click in the empty part of the list, or `Esc`. The open resource — and any
folder containing it — cannot be deleted as long as closing an editor does not exist: the button
is disabled **and says why**.

### The Inspector inspects resources too — IMPLEMENTED (2026-08-17)

Selecting a resource shows a `Resource` panel built from the **same primitives** as the `Object`
panel: an identity header, sections, rows, `<px-field>`.

```
Resource ─── Name        [ Opening Level ]
Details  ─── Type        Scene
             Location    Scenes
             Objects     6
             Size        2.2 KB
             Revision    1
             Created     17 August 2026, 22:50
             Modified    17 August 2026, 22:50
             Identifier  w4389jnjrq9e
Content  ─── [ preview ]  [ Replace… ]       (only for a kind that has content)
```

What changes from one `kind` to another is **one table row** in
`editor/inspector/resource.js` — extra fields, and a way to show the content. A kind missing
from the table is still inspectable: the table adds, it does not authorize. There is therefore
**no** `if (kind === 'image')` in the window, and there must never be one.

`describeResource()` is pure and tested under Node, like `describeComponent()` (ADR-0007).

**One Inspector, therefore one subject:** selecting an object clears the resource selection and
vice versa. The exclusion is wired in `editor.js`, not in the windows — none of them needs to
know the other exists.

**A resource's name is committed, it does not propagate letter by letter.** That is the
exception to the product's rule, and it is stated: one operation per character means eleven
history entries and eleven network messages for one word (ADR-0025 §6).

### Drag and drop — one capability, not three hacks — IMPLEMENTED (2026-08-18)

`editor/dnd/` describes what a drop **means** (ADR-0026 §6):

| File | Role |
|---|---|
| `payload.js` | what is carried: `files`, `resource`, `object`, `component` |
| `rules.js` | what a drop does, **pure**, tested under Node |
| `files.js` | the only part that needs a browser (`DataTransfer`) |

| Gesture | Effect |
|---|---|
| File(s) from the desktop → Project | import into the open folder, select the last one |
| File(s) → the scene | import **then** instantiate at the drop point |
| File(s) → Hierarchy | import then instantiate at `(0, 0)` |
| File → the Content section | payload replacement, the same path as `Replace…` |
| Image from Project → the scene | `Object + Transform + Sprite(source)` at the drop point |
| Image from Project → Hierarchy | same, at `(0, 0)` |
| Image from Project → a `resource` property | assigns the reference |
| Resource → a folder / between two tiles | `MOVE_RESOURCE` (folder **and** rank) |
| Object → Project | **refused, with its reason**: the prefab is not designed (ADR-0026 §7) |

A property accepts a resource only if its schema declares `type: 'resource'`, and may restrict
by `kind` or by `mime`: dropping an image onto a number is a visible refusal, never a corrupted
value.

Two transports, one vocabulary: a file arrives through `DataTransfer`, a resource through a
pointer gesture (an HTML5 drag does not cross several Shadow Roots cleanly). The shell converts
both into a payload and asks the same rules the same question.

### Project is an asset browser — IMPLEMENTED (2026-08-18)

A tile grid at the prototype's density, a chequerboard thumbnail, a **real preview** for an
image, a type glyph otherwise. Breadcrumb, folder navigation, search and selection all kept.

The gestures are the Hierarchy's, deliberately (ADR-0026 §3): a click selects, a second click on
an already-selected tile renames after the same 400 ms pause, `F2` renames immediately,
**double-click opens** — a folder opens, and for everything else the intent is emitted and waits
for the corresponding editor.

Renaming edits the **base**: the extension is decided by the type and displayed next to the
field in the Inspector (ADR-0026 §4).

### One liveness state: `active` — IMPLEMENTED (2026-08-18)

The Hierarchy's eye and the Inspector's `Active` checkbox write **the same field**. `visible`
has been removed from the `Object` contract: the Runtime skipped an inactive object, the
renderer skipped an invisible one, no control exposed the difference, and the two views
disagreed (ADR-0026 §2).

**And the tooltip says so.** It used to read `Hide` / `Show`, which describes half of what the
field does: an object that is off also stops **running**, so hiding a piece of scenery to see
behind it cut off its graph, its movement and its collisions. It reads "Turn off — it stops
drawing and running" (ADR-0054).

### `+` and `…` in every window — IMPLEMENTED (2026-08-18)

The Project's creation menu is the **same** categorized dropdown as Add Object and Add
Component. `…` holds what a window can do beyond its main action, and nothing invented: import
and go up (Project), expand / collapse all and deselect (Hierarchy), expand / collapse all
(Inspector).

The titlebar carries `Share` and a profile button, in the place the mockup gives them. Neither
is wired up, and **both say so** — there is no publishing pipeline and no account system.

### Renaming waits, and it is the only thing that waits

Settled on 2026-08-14. The previous rule was right — only a row *already selected before the
press* can go into editing — and it still put a caret where nobody had asked for one, because
`click` also fires **on the first click of a double-click**. Framing an object you had just
selected therefore opened its name in passing, and the name had to swallow `dblclick` to prevent
framing — which cost the double-click its meaning over half the row.

Both symptoms are the same missing fact: **at the moment of the first click, you do not yet know
whether a second one is coming**. The only way to know is to wait. So we wait, once, briefly
(400 ms; the platform double-click threshold is 500 ms and is not readable from a browser), and
only on an already-selected row. Everything else is immediate, and `F2` renames with no wait at
all.

It is a **named timer, not a blur**: a pending rename is cancelled explicitly by anything that
means "something else happened" — a second click, another press, a selection change, a rebuild
of the tree. Nothing depends on the order in which focus leaves. The value itself is written on
every keystroke, as in the Inspector, so even a `blur` that never arrives leaves the model
correct.

Verified in the browser, all eight cases: click on an unselected object (selects, does not
edit) · second click after the pause (edits) · double-click on the name (frames, does not edit)
· click on another object (ends the edit) · `Enter` · `Esc` (name restored) · a valid rename ·
select then frame without the name changing. Plus `F2`.

### Hierarchy rows survive a render

`#renderTree()` reuses the existing rows, indexed by object id, and reconciles the container's
children instead of doing a `replaceChildren`. This is not an optimization: **a chevron that is
a brand-new element on every render cannot animate**, having no previous state to start from.
Keeping the row turns a class change into a real transition — measured 2 frames after the
click, the chevron is at an intermediate angle, between 90° and 0°. A `replaceChildren` would
detach the row, and a detached element's transition does not survive being put back;
reconciliation does not touch a row that is already in the right place.

A welcome side effect: a rebuild no longer throws away an in-progress rename, nor each row's
subscriptions, which are now released per row (`row:<id>`) at the moment it actually disappears.

### The Graph window — IMPLEMENTED (2026-08-18, ADR-0027)

Double-clicking a `.px` in Project **opens** its graph. The gesture had been reserved since
ADR-0026 (`px-open-resource`); it is now wired, and it is `editor.js` — not the panel — that
decides a `.px` opens a canvas. A `kind` with no editor is refused **out loud**, never ignored.

```
core/graph/              the model: nodes, ports, connections, Operations
     ↓
editor/graph/view.js     the arithmetic: boxes, ports, curves, hit-testing — tested under Node
     ↓
editor/windows/graph.js  the rendering: a single SVG, pointer events
```

**One SVG, and that is the lesson from Legacy.** Legacy drew nodes as `<div>`s and wires as SVG:
two DOM trees to keep in agreement, and a port's position read with `getBoundingClientRect()` on
every `mousemove` — so knowable only while the node was displayed. A single layer gives a single
coordinate space: a port's position is arithmetic, the same arithmetic that hit-tests it, and
zoom is an attribute. What is taken from Legacy is taken explicitly: the horizontal Bézier with
an offset of `max(50, distance × 0.4)`, and pan/zoom by view transform which never touches node
coordinates.

| Gesture | Effect |
|---|---|
| Double-click on the canvas, or the `+` | a categorized creation menu — **the same dropdown** as Add Object, Add Component and Project's `+` |
| Drag a node | `SET_PROPERTY x` + `SET_PROPERTY y` under **one** `batch`: a drag is **one** `Ctrl Z` |
| Drag from one port to another | a connection, if the rules allow it; otherwise a **refusal that says why** |
| Drop a wire on an occupied port | replaces it, in one gesture and one history entry |
| Click a wire | disconnects |
| `Delete` on a selected node | removes it **with its wires**; undo gives both back |
| Wheel, middle or right button | zoom around the cursor, pan |

A **flow** port is a triangle, a **data** port a disc: that is the only rule the canvas actually
enforces, so showing it is not decoration. A node in error is ringed, and the validator's
sentence appears at the bottom of the canvas.

### One tab bar, and the Timeline stays alone at the bottom — IMPLEMENTED (2026-08-26)

The window structure **does not move**: Hierarchy and Project stacked on the left, a full-height
Inspector on the right, and the bottom strip under Hierarchy + Project + the centre area,
stopping before the Inspector. That is L4 exactly (design/README.md, D8).

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│  HIERARCHY   │  Scene │ Player.px │ Enemy.px    │              │
│              ├──────────────────────────────────┤              │
├──────────────┤                                  │  INSPECTOR   │
│   PROJECT    │         ACTIVE DOCUMENT          │              │
│              │                                  │              │
├──────────────┴──────────────────────────────────┤              │
│                    TIMELINE                     │              │
└─────────────────────────────────────────────────┴──────────────┘
```

```
editor/windows/documents.js      which documents, and which one is shown — PURE
editor/editor.js documentArea()  the tab bar, the body, one surface per document
```

#### The model

**A document is a tab of the centre area.** The Scene is one, every open `.px` is one, Files will
be. Only one is displayed at a time.

| | Reorderable | Closeable |
|---|---|---|
| **Scene** | yes | **no** — permanent |
| **`.px`** (and Files later) | yes | yes |

There is **no second tab bar**, so no notion of a zone for a document, no transfer, no drop
target, no state to remember. **The bar IS `opened()`, rank for rank**: only kinds that have a
surface can be opened (the `Workspace`'s `EDITORS` table), so nothing is lost on the way and
reordering a tab is `Workspace.reorder(id, rank)` — with no translation, because there is no
second ordering. A test pins that correspondence down rather than trusting it.

**The Timeline is not a document** and therefore not a tab: no resource, no model, no undo
stack, nothing to close — and it wants a horizontal strip, not the document body. It keeps the
bottom area and the titlebar toggle it has always had.

- Timeline open → it occupies the strip; the Project stops at its seam.
- Timeline closed → the strip disappears; the centre area takes the full height and the Project
  runs down to the floor.

That is what replaces a "maximize" button: **closing the Timeline gives the graph the full
height**, and it is a control that already existed. **Measured**: Inspector 795 in both cases;
centre area 602 with the Timeline, 795 without; strip at x 0–1165, Inspector at 1166.

#### One surface per document, kept connected

A canvas holds its pan, its zoom and its selection: it is **hidden** when another tab is chosen,
never detached — detaching releases everything the element subscribed to (`ui/element.js`). It
is removed only when the resource is closed, that is, when the `Workspace` frees its model and
its stack. **Verified**: two canvases each keep their view across six tab switches.

A canvas that is not displayed has **no box**: it refuses to frame on nothing, and `wake()` asks
it again when it comes back on screen.

#### What two open documents force you to hold

- **`Ctrl S` saves the editor you are working in**, not the tab being shown — the answer `Ctrl Z`
  has always used (`activeHistory`, ADR-0024). Selecting a `.px` in Project **attaches** it
  without displaying it (ADR-0027 §10): without that rule, editing its properties and then
  saving targeted the wrong resource.
- **The "unsaved" dot is per tab** (`Workspace.dirtyOf()`), otherwise a modified `.px` goes
  silent as soon as another tab is shown.
- **`Play` brings the Scene tab to the front**, because that is what Play means: launching the
  scene behind a graph would hide what you just launched, and ADR-0029 §4 makes that a hazard.
  **`Stop` puts nothing back** — the graph is one tab away.

#### Two dragging traps, kept because they remain true

Reordering is the bar's only drag gesture. Two fixes found in use remain necessary and are
written down in `editor.js`:

1. **The threshold measured horizontal displacement alone**, so a press starting at an angle had
   to be pushed sideways before the bar responded. It is a distance (`Math.hypot`), as it has
   always been in `windows/project.js`.
2. **The `pointermove` / `pointerup` listeners lived on the tab.** A press released elsewhere
   left the gesture in place, and since a mouse always announces the same `pointerId`, **the
   next tab the pointer touched picked up the abandoned gesture**. The gesture owns
   window-level listeners, for exactly its duration.

### Opening and closing a resource — IMPLEMENTED (2026-08-18, ADR-0027)

`Workspace` holds a **map** of open editors, each with its model, its pipeline and its undo
stack (ADR-0024). A tab strip says what is open — **at the bottom of the shell since
2026-08-25**, no longer above the scene, and the scene no longer has a tab there at all (see the
previous section).

- **"Attached" is not "open".** Selecting a `.px` gives the Inspector a live model for editing
  its properties; only a double-click opens it, and **only an open resource refuses to be
  deleted**. Without that distinction, clicking a Component once would make it indestructible.
- **Closing frees the stack** and makes the resource deletable — which ADR-0025 refused for want
  of a way to close.
- **One scene at a time**, always: every window is bound to one `Scene`. Several `.px`s can be
  open together.
- A tab's close button is **always** present, including when the "unsaved" dot is showing: that
  is exactly the state where the creator most needs the choice.

### The Inspector declares a Component's properties — IMPLEMENTED (2026-08-18, ADR-0027)

When a `.px` is selected, a **Properties** section lets you create, rename, retype, redefine and
delete its properties.

- **the subject is the schema, not a value**: a property is therefore three fields — name, type,
  default value — and not one;
- the list of types is the Core's, its eight members (ADR-0023); the control that edits the
  default value is **derived** from the chosen type by the mapping that already exists;
- changing the type resets the default, **in a single `batch`**: a `number` default is not a
  legal `boolean`;
- renaming is reactive, letter by letter, and costs **one** history entry (ADR-0026 §3);
- a property carries an `id` minted once, and that is what a node stores: **renaming does not
  break the graph**. Deleting it never leaves a dangling reference — the validator reports it,
  the canvas rings the node, the interpreter throws a structured error.

When a **node** is selected, the same panel shows its params, its ports and its facts. There is
no chain of `if`s: `inspector/node.js` answers "which fields, of which type", exactly as
`describeResource()` and `describeComponent()` do for the other two subjects. A node type added
tomorrow is inspectable without `windows/inspector.js` changing.

**Dragging a property onto the canvas is refused, with its reason** (ADR-0027 §11): a drop could
mean `Get Property` **or** `Set Property`, and choosing on the creator's behalf is the magical
behaviour ADR-0026 asks us to avoid. The creation menu offers both, and the chosen node lists
the properties by name.

### What is not there yet

A `Ctrl K` command bar · a working Timeline · Console · Players · multiple selection (scene and
graph) · rotation by handle · window detachment · copy/paste in the graph.

Done since: undo/redo (ADR-0024), structural Operations (ADR-0019), reparenting and reordering
by drag and drop, saving, the Project as a real resource manager (ADR-0025), cross-cutting drag
and drop and ordering inside a folder (ADR-0026), **the `.px` graph: model, user properties,
validation, interpreter, window, opening and closing** (ADR-0027), and **the document tab bar:
the Scene and every open `.px` are tabs there, the Timeline keeps its own strip**.

The titlebar has carried the transport since ADR-0029 — Play takes a snapshot, Stop puts it back
— and **still no command bar**: `Ctrl K` needs a registry of commands to query, and a visible
button with nothing behind it is the one thing this Editor has always refused.

The shortcuts are a pure table (`editor/shortcuts.js`): `Ctrl Z` / `Ctrl Shift Z` / `Ctrl Y`,
`Ctrl S`, `Ctrl D` (duplicate), and outside the table `Delete`, `F` (frame), `Escape`. `Escape`
**abandons the gesture in progress** before deselecting: it puts the object back where the grab
found it, which is what a creator means by pressing it mid-drag. A tile stroke is handled the
same way — it writes as it goes, so abandoning it means putting the cells back, not doing
nothing — and both restorations belong to the gesture's `batch`. That `batch` then goes all the
way up to the stack (`History.forget()`): an abandoned gesture does not cost a `Ctrl Z` for
nothing. `Ctrl D` and `Ctrl S` always take the key, even when there is nothing to duplicate or
to write: what a browser would otherwise do with them is a bookmark or a download of the page.

## OBSERVED — real-time synchronization, in detail

It is the Editor's most important mechanism, and it is **simpler than you would think**. No
reactive framework, no virtual DOM, no duplicated state.

### The three mechanisms

1. **Binding by CSS class.** Every editable field carries `class="<objectId>-<prop>"`, or
   `class="<objectId>-<Component>.<prop>"`.

   ```html
   <input class="w4ubqjkgw-x">              <!-- Object.x -->
   <input class="w4ubqjkgw-Controller.speed"> <!-- Controller.speed -->
   ```

2. **Global resolution.** `document.getElementsByClassName(obj.id + '-' + prop)` returns **every**
   view of that property, wherever it is.

3. **Focus guard.** `if (el[i] !== document.activeElement)` — the field being typed into is never
   rewritten. That is what makes letter-by-letter editing possible without the caret jumping.

### The full cycle of one keystroke

```
typing "P" in the Inspector
  → Properties.updateCurrentObject(el)
    → object.$name = "P"
      ├─ this.name = "P"  → dispatch setProperty ──────────┐
      └─ dispatch syncProperty ───────────┐                │
                                          ▼                ▼
                              Network.sync()      Properties + Hierarchy
                              send('update', …)   getElementsByClassName('<id>-name')
                                                  writes into every view
                                                  except document.activeElement
```

**Verified** by running the editor: typing `P`, `Pl`, `Pla`, `Play` updates the Inspector field
**and** the Hierarchy's `contenteditable` at the same time, on every keystroke.

### There really is a single source of truth

It is the **`Object`**. The DOM is only a projection. There is no copy of the state anywhere in
the Editor. **That is correct, and a separate store must not be introduced.**

### Costs

- `getElementsByClassName` over the whole `document` on every property change;
- a global identifier namespace, which breaks if two panels want to display the same property
  differently;
- **incompatible with the Shadow DOM** — a critical point for v2 (risk R2).

---

## OBSERVED — the Inspector is already generic

`editor/windows/properties.js` contains **no** `if (component === 'Health')`. It reflects over
the object and derives the widget from `typeof value`. See ADR-0007 for the full table and the
limits (a hard-coded blacklist, `parseInt` truncating decimals, dead `TODO Range`/`TODO Array`
branches).

The only genuinely per-component place is the icon `switch` in `appendName()`.

---

## OBSERVED — the real modularity problem

It is not the use of the DOM. It is the structure:

- `index.html` is **700 lines** and holds the IDE's entire skeleton;
- the `editor/misc/*.js` modules run at load time and reach for fixed `id`s:

  ```js
  document.getElementById('play').addEventListener('click', …)
  ```

- `sync.js` targets `#sync`, **commented out in the HTML** — it would throw; it simply is not
  imported by `app.js`;
- windows receive a container id and assume their markup already exists;
- 30 CSS files in a global namespace;
- **`editor/windows/window.js` contains only `// TODO: Implement base window class`.**

**Adding a window requires editing `index.html`, `app.js`, a CSS file and the module.**

### Handler

`editor/system/handler.js`, 27 kB — the largest file in the repository. It concentrates drop,
selection, drag, 8-direction resize, pan and zoom. The 8-case `switch` is **duplicated in full**
between the "object" case and the "component" case (~120 duplicated lines). No notion of a tool
or of a command.

Viewport writes go through `$` (`scene.current.$x = …`) so they **replicate**, while the camera
pan goes through `camera.x = …` so it stays local. The distinction is right and intentional.

---

## V2 PROPOSAL

### Structure

```
editor/
├── ui/            Web Component primitives
├── windows/       windows built on the primitives
├── viewport/      tools: select, move, resize, pan, zoom
├── inspector/     schema-driven rendering (ADR-0007)
├── graph/         the node editor, driving a .px model (ADR-0009)
├── selection.js   formerly scene.current / currentComponent
└── layout.js      arrangement, layout persistence
```

### Primitives and windows

```
<px-window> <px-panel> <px-split> <px-tabs> <px-toolbar>
<px-tree>   <px-list>  <px-property> <px-viewport> <px-modal> <px-menu>

<px-hierarchy> <px-inspector> <px-assets> <px-scene>
<px-graph>     <px-players>   <px-console>
```

One window = one file, carrying its markup, its styles and its lifecycle. `index.html` shrinks
to a mount point.

### Binding becomes scoped

The Shadow DOM **breaks `getElementsByClassName`**. A replacement with identical observable
behaviour:

```js
connectedCallback() {
    this.unsubscribe = properties.observe(this.target, this.prop, change => {
        if (this.input !== this.shadowRoot.activeElement) {   // the guard is kept
            this.input.value = format(change.value, this.schema);
        }
    });
}
disconnectedCallback() { this.unsubscribe(); }
```

Preserved: letter-by-letter editing, a single source of truth, the focus guard. Added:
unsubscription (nonexistent today — listeners accumulate), an end to global DOM queries, correct
decimal formatting.

**Mandatory order: migrate the binding BEFORE encapsulating in Shadow DOM.** The other way round
breaks synchronization with no visible error at all.

### A viewport made of tools

`Handler` is split up: `SelectTool`, `MoveTool`, `ResizeTool`, `PanTool`, `ZoomTool`. One active
tool, a common interface. The 8-direction resize becomes a single function parameterized by the
side — the ~120 duplicated lines disappear.

Mouse picking and the handles, today inside `Renderer.render()`, move up here.

### A "Players" window

Anticipated by the vision ("see the players") and absent from Legacy, although the data already
exists: `Network.users[uid]` holds `keys` and `mouse` per player. The window is essentially a
view onto already-replicated state.

---

### The model is central, the views react — SETTLED

An explicit rule: **no Editor feature modifies the DOM arbitrarily.** The data stays in the Pixel
Creator model; the views subscribe to `Change`s and update themselves.

**OBSERVED:** Legacy already honours that spirit — the source of truth is the `Object` — but
implements it with a global DOM query from the module doing the writing. v2 reverses the
direction: it is no longer the writer that goes looking for the views, it is each view that
listens to its property.

What that does not change: **the historical behaviour where a property modified in the Inspector
is immediately reflected everywhere else — in particular letter by letter in the Hierarchy — is
explicitly preserved.** It is a requirement, not a side effect.

### Mutations and authority

The Editor emits **authorized Operations** (ADR-0011) through `object.setProperty('x', …)` — the
only controlled mutation API in v2; `object.$x` no longer exists. The application stays
**optimistic** — the value appears immediately in every view — and reconciles if the server
refuses. The camera pan remains a direct mutation (`camera.x = …`), with no Operation.

---

## What does not change

- The source of truth stays the `Object` — **no store**.
- Letter-by-letter editing.
- The `activeElement` guard.
- The generic Inspector, with a reflective fallback for components without a schema.
- The distinction between a controlled write from the viewport and a local camera pan — with
  `setProperty()` in place of the historical `$`.
- The DOM and the Canvas, without a framework.
