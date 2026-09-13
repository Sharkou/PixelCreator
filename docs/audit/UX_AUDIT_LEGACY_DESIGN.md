# UX/UI audit — `legacy/` + `design/` → recommendations for v2

- **Date:** 2026-08-18
- **Nature:** a **non-normative** analysis document. It modifies no ADR, no architecture and no
  code. It prepares decisions.
- **Sources read:** `legacy/` (the complete editor), `design/` (the UX-2.5 prototype), `src/`
  (the real state of the v2 code), `docs/architecture/`, ADR-0001 → ADR-0027, the tests.
- **Addressed to:** the implementing agent. Section **K** is the only one to read if time is
  short.

> **A methodological warning.** This report was written by reading the v2 code, not
> `MIGRATION_STATUS.md`. When this report says "absent", it means: no caller in `src/`. Every
> finding carries its file.

---

## A. Executive summary — the 10 most important improvements

Ranked by benefit/risk ratio, not by difficulty.

| # | Improvement | Why it is at the top | Priority |
|---|---|---|---|
| 1 | **The Graph's grid does not move.** The background `<rect>` is a sibling of `#content`, not a child: it receives neither the view's `translate` nor its `scale` (`src/editor/windows/graph.js`, `#build`). Nodes slide over a fixed grid. | It is the only canvas defect that breaks the perception of panning. Legacy handled it explicitly (`updateGridBounds()`). The fix: `patternTransform`, one line. | **P0** |
| 2 | **A cross-window drag is blind.** `px-drag-start` remembers the payload, and **nothing happens** until `px-drag-end` (`src/editor/editor.js:548-569`): no ghost, no highlighted target, no cursor, no visible refusal. | The product's central gesture — dragging an asset into the scene — gets no feedback while in flight. Legacy had some (a `setDragImage` ghost, `.drop_hover`). | **P0** |
| 3 | **`describe()` and `refuses()` are never displayed.** `dnd/rules.js` produces the sentence; no window reads it. | ADR-0026 §6 says "nothing happened is the worst answer" — and that is exactly what the creator sees today. The prefab refusal is literally unreachable. | **P0** |
| 4 | **`PropertyType.RESOURCE` renders read-only.** `inspector/schema.js:81` → `FieldKind.READONLY`. The only way to assign `Sprite.source` is a drag; no button, no thumbnail, no way to clear it. | A property assignable only by a gesture with no affordance is an invisible property. The code documents it as a gap itself. | **P0** |
| 5 | **Node search is an `includes()` on the label** (`ui/menu.js`, `#renderList`), and the menu opens with **every** node expanded. | The explicit request: categories first, immediate typing, relevant results. None of that exists. The categories, however, already exist in the Core and are exactly the right ones. | **P0** |
| 6 | **No Play / Pause / Stop transport.** Deliberate and documented (`editor.js`, the comment "THERE IS NO TRANSPORT HERE"). But the `Runtime` already exists in the Viewport, with `running = false`. | The missing mechanism is a scene snapshot — and `serializeScene()` / `deserializeScene()` exist. The real cost is far lower than the comment assumes. | **P1** |
| 7 | **Two CSS tokens do not exist**: `--px-surface-sunken` (`inspector.js:328`, `project.js:131`) and `--px-radius-md` (`project.js:110`). The declarations are invalid and are dropped. | The Project's transparency chequerboard therefore has no background colour, and the tiles have no radius. Two lines in `ui/styles.js`. | **P1** |
| 8 | **Reparenting by horizontal movement does not exist.** Legacy had it (`sorter.js`, `drag`, a 20 px threshold on `clientX`) — it is the WordPress gesture. | It is the one Legacy DnD idea strictly better than v2's, and it plugs into `dropTarget()` without changing its contract. | **P1** |
| 9 | **You cannot reorder a `.px`'s properties.** `addProperty` accepts an `index`, but no operation moves an existing property (`core/graph/definition.js`). | Explicitly requested. It is a Core addition (`MOVE_PROPERTY`, or an `index` on a `SET_PROPERTY`) and therefore an amendment to ADR-0027 §5. | **P1** |
| 10 | **`DragKind.OBJECT` and `DragKind.COMPONENT` are dead.** `objectPayload` / `componentPayload` are built nowhere in `src/`. | The rule table describes four sources; two have no emitter. Either wire them up, or say so in the code. | **P2** |

---

## B. Drag and drop

### B.1 What Legacy does, mechanism by mechanism

#### Reordering inside a list — `legacy/editor/misc/sorter.js`

This is the most interesting piece of Legacy, and it really is the "WordPress" behaviour.

| Step | What happens |
|---|---|
| `dragstart` | remembers the element, **and the starting `clientX`** (`x_t0`), and whether the element was already a child |
| `dragenter` on another `<li>` | **an immediate `insertBefore`**: the DOM reorganizes under the pointer, the neighbours shift in real time |
| `dragover` | adds `.hidden` to the hovered row |
| `drag` (continuous) | compares `clientX` to the start: **`> x_t0 + 20` → `wrap()`** (the element becomes a child of the previous one), **`< x_t0` → `unwrap()`** |
| `dragend` | clears every `.hidden` class |

How `.hidden` renders (`legacy/css/world.css`): `color: transparent`, `border: 2px dashed var(--main)`, a darkened background, hidden icons. In other words **the row becomes a dashed hole** — that is the position indicator, and it is in the right place by construction since the DOM has already moved.

Indentation was rendered by `data-position` plus a hard-coded `padding-left` table from 1 to 5 (`world.css`). Beyond 5 levels, nothing.

**What is good in this mechanism:**
- the **horizontal** axis carries the depth level. It is the only gesture that lets you say "I want to insert here, but at that level" without aiming at a third of a row;
- the dashed hole is readable even on a dense list.

**What is bad:**
- the DOM **is** the model: `wrap()` calls `parentObj.addChild()` in the middle of `drag`, so **the model is mutated on every hover frame**, not on the drop. Cancelling a drag leaves the model in the state of the last hover;
- the list reorganizing under the pointer makes the gesture imprecise as soon as heights vary;
- `drop` is commented out; `dragEnd` does nothing but visual cleanup;
- the `isBefore()` computation has a badly indented `return` that only yields `false` in one branch.

#### External drop (Explorer / files)

- **Project** (`legacy/editor/windows/project.js`): `dragover` → `.drop_hover` on the container;
  `drop` → `Loader.uploadFiles(e.dataTransfer.files)`; **and** if `Sorter.draggedElement` is set,
  builds a prefab from the dragged object.
- **Scene** (`legacy/editor/system/handler.js`): a `drop` on the canvas builds an `Object` at the
  mouse position. The `switch` distinguishes the tools (`circle`, `rectangle`, `light`, `camera`,
  `particle`) from the `default` case = a resource. **Dropping an image from Windows Explorer was
  a `TODO` never done.**
- **Inspector** (`legacy/editor/windows/properties.js`): `drop` → instantiates
  `Loader.files[id].component` and adds it to the current object. A `.js` file dropped on the
  Inspector = adding a Component. No validation, no refusal.
- No window reads `dataTransfer.types`: the hover lights up for **any** drag, including a text
  selection.

#### Internal drop

| Source → target | Legacy | v2 |
|---|---|---|
| Project → Scene | yes (`handler.js`, image/prefab) | yes (`rules.js`, `resource-to-scene`) |
| Project → Hierarchy | no | yes (`resource-to-hierarchy`) |
| Project → Inspector | yes, but "dropping a `.js` = adding a Component" | yes, but **only** onto a `resource` property |
| Hierarchy → Project | yes — prefab creation | **refused with a reason** (ADR-0026 §7), and the refusal is unreachable for want of an emitter |
| Resource → property | no | yes (`resource-to-property`) |
| Property → elsewhere | a property's **label** was `draggable` and carried `input.className` in the `dataTransfer` (`properties.js:491`) — no target read it | no, and ADR-0027 §11 explicitly refuses it |
| Toolbar → Scene | yes, with `setDragImage(obj.image)` — **the ghost was the object's real rendering** | yes, `<px-toolbar>`, a ghost on `document.body`, Pointer Events |

### B.2 Visual feedback — Legacy's implicit rules

Pulling together `dnd.css`, `world.css`, `resources.css` and `overlay.css`, there are only
**four** rules, and they are coherent:

1. **A zone that accepts** → a `::before` pseudo-element with
   `position:absolute; inset:0; border: 2px dashed var(--main); pointer-events:none; transition: 200–300ms`.
   Always on the **container**, never on the element.
2. **A row hovered during a sort** → `.hidden`: transparent text, the same dashed border, a
   darkened background.
3. **Cursor** → `grab` when hovering something draggable, `grabbing` during. Handled by
   `Dnd.setCursor()`, which writes to `document.body.style`.
4. **Ghost** → `setDragImage` with the object's real image when it has one.

There is **no** animation, no opacity change, and no linear insertion indicator.

### B.3 What v2 already does — and it is better

- `dnd/payload.js` + `dnd/rules.js` + `dnd/files.js`: the vocabulary, the semantics and the
  transport, separated and tested under Node. No per-window `handleDropX()`. **This is much
  better than Legacy and there is nothing to take away from it.**
- `windows/drop.js`: the top-third / middle-third / bottom-third geometry → `BEFORE` / `INTO` /
  `AFTER`, plus `insertionIndex()`, which corrects the off-by-one of a downward move. Pure,
  tested.
- The marks: `.row.dragging { opacity: 0.4 }` (the row stays in place — an explicit and
  **correct** decision), `.row.into { inset 0 0 0 1px accent }`, `.row.before/after::after { 2px accent }`,
  `.tree.append`.
- Project: the same three states, but a **vertical rail** between two tiles (a grid has columns)
  — a good derivation.
- `2px dashed var(--px-accent)` for an external import, in **all four** places
  (`hierarchy.js:208`, `project.js:205`, `editor.js:129`, `inspector.js:316`). Legacy's rule
  survived, and that is good.
- `carriesFiles()` reads `dataTransfer.types`: the hover no longer lights up for a text drag. It
  fixes a real Legacy defect.

### B.4 The v2 DnD feedback system — a coherent proposal

The problem is not a lack of CSS, it is that **there is no notion of a "drag session"**. A native
drag (`DataTransfer`) and a pointer drag (`px-drag-start`) share no state, and the second has no
feedback at all.

**Proposal: a `DragSession`, at the shell, with no model.**

```
editor/dnd/session.js        (new — view only, no model)
    begin(payload, { ghost })   opens the session, mounts the ghost on document.body
    move(clientX, clientY)      asks each zone whether it accepts, marks ONE zone
    end()                       executes, or cancels, and cleans up
```

What the session carries, and nothing more:

| Element | Rule |
|---|---|
| **Ghost** | mounted on `document.body`, `pointer-events:none`, `z-index: var(--px-z-drag)` (the token exists already and has **no** use today). Content: the resource's thumbnail if it has one, otherwise its glyph + its name. Opacity 0.85, offset +12/+12 from the pointer. |
| **Accepting zone** | `2px dashed var(--px-accent)` as an `outline`, `outline-offset: -4px`. **One at a time.** That is the rule that already exists — it just has to apply to the pointer drag too, not only to the native one. |
| **Refusing zone** | `2px dashed var(--px-danger)` — **and nothing else**: no shake, no cross. Today a zone that refuses is identical to a zone that ignores. |
| **Insertion point** | unchanged: a 2px accent line in a list, a 2px vertical rail in a grid, a 1px outline for `INTO`. Do not touch. |
| **Sentence** | `canDrop().reason` shown in a discreet strip — the same primitive as `.status` in `windows/graph.js` (surface `--px-surface-overlay`, a border, `--px-text-2xs`), anchored to the bottom of the hovered window. It appears after ~250 ms of hovering, so that it does not flicker as you cross. |
| **Cursor** | through `dropEffect` for the native case; for the pointer case, `cursor: grabbing` on `document.body` **set once at the start and removed once at the end** — never inside a `mousemove`, which is Legacy's mistake. |

**Three rules to hold:**
- nothing moves during a drag except the ghost (against Legacy);
- one mark at a time, and it is always the mark of the rule that is about to run — that is
  already ADR-0026 §8's argument;
- a zone that refuses says so; a zone that ignores says nothing. They are not the same state.

**Horizontal reparenting (a Legacy idea worth taking back).** On `BEFORE`/`AFTER` only — the
middle third stays `INTO`: if `dx` from the starting point exceeds a multiple of `--indent`,
move the insertion **level** up or down among the target row's legal ancestors. `dropTarget()`
already returns `{ parent, index }`: it is the same contract, with a `parent` chosen higher in
the chain. No Core change.

**Traps:**
- **never** mutate the model during the hover (Legacy's sin); a cancelled drag must be a
  non-event;
- the ghost on `document.body` escapes the Shadow Roots — that is why `<px-toolbar>` already
  does exactly that; reuse its mechanics;
- `pointercancel` must cancel the session, otherwise a drag interrupted by the system leaves the
  ghost on screen.

---

## C. Graph

### C.1 Navigation

| Gesture | Legacy | v2 | Recommendation |
|---|---|---|---|
| Pan | right button held, **from the background only**; `contextmenu` blocked | **middle or right** button, from anywhere | Add **space + left drag** (the de facto standard) and free the right click — see below |
| Zoom | wheel, factor 1.1, anchored to the cursor, clamped to `[0.25, 2]` | the same, clamped to `[0.25, 2.5]`, a pure `zoomAt()` | Nothing to change. Add `Ctrl 0` = 100 %, `Ctrl 1` = frame everything (the button already exists) |
| Left click | selection / node drag / wire pull | the same, with a 3 px threshold | Nothing |
| Right click | **nothing** (reserved for panning) | pan | **A creation context menu** — that is the expected use in any node editor |
| Middle button held | no | pan | Keep |
| Keyboard | none | `Delete` / `Backspace` on the selected node | Add `F` (frame the selection), `Esc` (deselect), `Ctrl A` once multiple selection exists |

**The right-click conflict.** Today: right click = pan. That is unusual, and it burns the button
that everywhere else (Blueprints, Blender, n8n, Node-RED) opens the creation menu. The
double-click already opens that menu, but that is a discovery, not a convention.

**Recommendation:** right click on the **background** = a creation menu at the pointer; right
click on a **node** or a **wire** = that element's context menu (Delete, Duplicate later); pan =
the middle button **or** space + drag. The double-click stays as a shortcut. It is a move, not an
addition: `#openNodeMenu` already accepts an `event` and positions the menu at the pointer.

### C.2 Grid — **the defect to fix first**

**Legacy**: two nested `<pattern>`s (a 10 px minor inside a 50 px major), and a `#grid-rect`
whose `x/y/width/height` are **recomputed on every pan and every zoom** (`updateGridBounds()`) to
cover the viewport plus a viewport of margin. It is laborious but **it works**: the grid follows
the view and scales with it.

**v2**: a single `<pattern>` of `GRID * 4` (32 units), and a `<rect width="100%" height="100%">`
placed as a **sibling** of `#content`. `#content` carries `translate(...) scale(...)`; the
background does not.

**A measurable consequence: the grid is immobile and at scale 1.** Nodes slide over it. Panning
has no landmark left, and zoom lies about the scale.

**Recommended fix** (no restructuring):

```
// on every #draw(), on the <pattern>:
patternTransform = `translate(${view.x} ${view.y}) scale(${view.zoom})`
```

The `<rect>` stays in screen coordinates, the pattern follows the view. It is the inverse of
Legacy's method and it is one line instead of twenty.

**While we are at it**, two free improvements, both already validated elsewhere in the product:
- **two levels** (a minor `GRID`, a major `GRID * 4`), as in Legacy and as in the prototype's
  `.vp-grid` (16 / 64): that is what makes zoom readable;
- **fade the minor below ~0.5 zoom** — otherwise the grid becomes a flat wash.

The origin: `GRID = 8`, and `snap()` rounds node positions. The pattern must be anchored to **the
same origin as `snap()`**, otherwise a node snapped to the grid does not land on a line. With
`patternTransform` that is automatic.

### C.3 Nodes

| Aspect | Legacy | v2 | Verdict |
|---|---|---|---|
| Structure | a `contenteditable` `<div>`, ports derived from the **typed text** | an SVG `<g>`, ports declared by the type | v2, no contest |
| Size | a fixed `min-width: 81px; height: 31px` | `NODE_WIDTH = 168`, height computed from the ports | v2 |
| Title | the typed text itself | `definition.label`, 11 px, bold | v2 |
| **Icon** | a per-category icon in the *toolbox*, never on the node | **none** | **A gap.** The menu shows an icon and the node does not: that is a break. Add a 12 px glyph to the left of the title |
| Ports | `4×8 px`, rounded on one side, a numeric index | a triangle = flow, a disc = data, an invisible 11 px target | v2, and it is a real idea |
| Values | typed into the node | none — a free input yields the port's default | An open point in ADR-0027. See §C.6 |
| Selection | none | a 2 px accent outline | v2 |
| Hover | `cursor: grab` | nothing on the node, an accent `stroke` on the port | **A slight gap**: a hovered node should lighten by one step |
| Error | an `.error` connector as a 3rd port (red) | a `--px-danger` outline + the validator's sentence at the bottom | v2 |
| Active/inactive | no | no | Nothing to do — a disabled node has not been decided |

**Colour by category.** Legacy tinted the *toolbox* background: `event` red, `function` blue,
`structure` green. The `design/` prototype explicitly rejects multicoloured rails (README,
decision D7). **Recommendation: a header bar coloured by category on the node, and nothing else**
— it is the one place where the family genuinely helps (spotting Events in a dense graph), and it
does not reintroduce a rail. The four hues of direction B (`#45c8ff`, `#a98bff`, `#ffb648`,
`#4ade80`) are available but **not settled in Modern Pixel** (the `design/` README): that is a
decision to take, not to assume.

### C.4 Connections

- **Curve**: Legacy `max(50, distance × 0.4)`, v2 `max(40, distance × 0.4)`. ADR-0027 says "taken
  as is" — the 50/40 gap is benign, but **it is an undocumented divergence** between the ADR and
  the code. To align or to note.
- **While being created**: v2 draws a dashed accent `pending` wire, oriented the final way.
  Better than Legacy.
- **Deletion**: in v2 **one click on the wire deletes it**. That is fast and it is undoable, but
  it is destructive on the first click. Legacy required a mousedown on the connector.
  **Recommendation: keep it, but add the red hover (already there) and a `title`** (already
  there: "Click to disconnect"). Acceptable.
- **Selecting a wire**: does not exist. Not needed as long as there is nothing to do with a
  selected wire.
- **Colour**: v2 distinguishes flow (`--px-text-muted`) from data (`--px-text-dim`).
  **Recommendation: colour a data wire by its `PropertyType`** — the typing already exists
  (`typesCompatible`), so it is free information. A palette of 8 (as many as `PropertyType`) is
  too many; a palette of 4 families (number, text, boolean, other) is enough.

### C.5 Creation menu

See section **C.7 / search** below: it is the same subject.

### C.6 Open points of ADR-0027 that weigh on UX

- **An inline value on an unconnected input.** ADR-0027 leaves it open, and the consequence is
  declared "surprising" in the ADR itself (an unconnected `Set Property` writes the default on
  every step). It is the first thing a creator will want. **Recommendation:** a field on the node
  itself for `number` / `int` / `boolean` / `string` inputs — three types, one control each, all
  already existing (`px-field`). The format does not change: the value goes into `node.params`,
  like the rest.
- **Multiple selection, copy/paste**: fine to defer.

### C.7 The node search engine

**The real state:**
- the categories already exist, in the Core, and are **exactly** the ones requested:
  `['Events', 'Properties', 'Flow', 'Values', 'Math', 'Compare', 'Logic', 'Debug']`
  (`core/graph/nodes.js`, `NODE_CATEGORIES`). Nothing to invent;
- `groupNodes()` produces the non-empty groups in order;
- `ui/menu.js` receives a **flat list** of `{ heading }` and `{ id, label, icon }`, with **every
  category expanded**;
- the filter is `item.label.toLowerCase().includes(query)`. No fuzzy matching, no aliases, no
  keywords, no score, no filter by port type;
- keyboard navigation ↑ ↓ ↵ Esc exists and is correct;
- Legacy had **no** search at all: a toolbox of 14 fixed icons. There is nothing to take from it.

**Architecture recommendation (no code here, a shape):**

A pure module, testable under Node, next to `groupNodes()`:

```
searchNodes(registry, query, context) -> [{ definition, score, matched }]
```

**What the node table gains** — two fields, in the same table, which is exactly ADR-0027 §3's
argument (one table, not two):

| Field | Role | Example |
|---|---|---|
| `aliases: string[]` | the other names of the same node | `'Add'` → `['+', 'plus', 'sum', 'addition']` |
| `keywords: string[]` | what it is for, not what it is | `'property.set'` → `['health', 'variable', 'assign', 'write']` |

`keywords` must **not** hold the creator's property names — those are dynamic. See "contextual
search" below.

**The ranking (strict order, the first criterion that separates wins):**

1. an exact match of the `label` or of an `alias`;
2. a prefix of the `label` (`add` → `Add`);
3. a prefix of a word of the `label` (`prop` → `Set Property`);
4. a prefix of an `alias`;
5. a subsequence of the `label` (`stprp` → `Set Property`) — that is the "fuzzy", and it is
   enough;
6. a match in `keywords` or in the `category`;
7. at equal score: category order, then registration order.

**Do not** use a Levenshtein distance: it ranks short identifiers badly and it is slow when
typing fast.

**Contextual search — the real gain.** When the menu is opened **by dragging a wire from a port**
(a gesture that does not exist yet: releasing a wire into empty space should open the menu), pass
the origin port in `context`. Then:
- nodes with a compatible port (`typesCompatible`) rise;
- those with none sink, or disappear behind a "Show all".

That is what turns "search for a node" into "continue wiring". It is the behaviour that is missed
most, and it requires no format change.

**Search by property name** (`health`): when the menu is opened in the context of a `.px`, inject
**synthetic** entries `Get health` / `Set health` — a `property.get` with `params.property`
pre-filled. That answers the requested example directly, and it is one line of item generation,
not one more node type.

**The menu's initial state.** Requested: show the categories, not a huge list. Three options, in
order of preference:

1. **Collapsed categories** (recommended): `Events`, `Properties`, `Flow`… with a counter. `→` or
   a click expands, `←` collapses, ↑↓ traverse everything visible. As soon as a character is
   typed, everything expands and the ranking applies. Cost: an `expanded: Set` state in
   `ui/menu.js`, plus two keys. **It is the only option that literally answers the request.**
2. Keep everything expanded but **limit to 3 entries per category** with a "+7 more". Less good:
   arbitrary.
3. Change nothing and rely on search. Rejected: discovery counts as much as speed.

**An architectural constraint.** `ui/menu.js` is **shared** by Add Object, Add Component, the
Project's `+` and the nodes (ADR-0026 §10 makes it a principle). Collapsing and scoring must
therefore be **optional** (`{ collapsed: true, rank }`) and not imposed: a menu of 3 entries must
not gain a fold. Do not duplicate the component.

---

## D. Project

### D.1 What `design/` wants

Read in `design/prototype.js` (`ASSETS`, `project()`) and `prototype.css` (`.assets`, `.asset`,
`.thumb`, `.empty`):

- an **auto-filled grid**, tiles of at least 62 px, a 5 px gap, 8 px padding;
- a **square chequerboard thumbnail** (8 px, two tones) — present even when there is no image:
  the chequerboard says "this is where an image goes";
- a **real preview** for an image, a **glyph** otherwise;
- a centred name, one line, ellipsized; it goes to `--px-text-strong` on hover and on selection;
- hover = a `--s2` background + a `--line-soft` border; selection = an accent-soft background + an
  accent-line border;
- `cursor: grab` on the tile;
- **`Project` / `Prefabs` tabs** in the panel's header, not a breadcrumb;
- a search field **always visible** at the top, plus a magnifier in the tools that focuses it;
- a **centred empty state** when the search returns nothing, with the search term in the
  sentence.

The breadcrumb, in the prototype, is in the **titlebar** (`Medieval Arena / Arena 01`), not in
Project.

### D.2 What v2 does

Conformant, and often beyond: a 64 px grid, the chequerboard, `image-rendering: pixelated` (the
prototype does not do it, and it is **better** for pixel art), a per-folder breadcrumb, selection,
`F2`, a second click plus a 400 ms pause to rename, double-click to open, an "unsaved" dot,
reordering by dragging, file import, a categorized `+` menu, an empty state.

### D.3 Divergences

| Divergence | Finding | Recommendation |
|---|---|---|
| **`--px-surface-sunken` does not exist** (`project.js:131`) | the chequerboard's background colour is dropped; the chequerboard is therefore drawn on the tile's background | Define the token in `ui/styles.js` — it is clearly a darker surface than `--px-surface-input` or its alias |
| **`--px-radius-md` does not exist** (`project.js:110`) | the tiles have no radius | Use `--px-radius`, or define `md` |
| The **Prefabs** tab | drawn by `design/`, absent from v2 | **Correct to leave out.** ADR-0026 §7 defers the prefab, and an empty tab is the kind of lie this Editor refuses. Not to be added before the prefab decision |
| **A list view** | exists **nowhere**: not in Legacy, not in design, not in v2 | Do not invent it. A grid is the right default for assets. If a project exceeds ~200 resources it will be a real need — not before |
| **Sorting** | none | P2. Name / type / modification date, in the `…` menu |
| A **`.scene`** thumbnail | a glyph only | P2 — a scene could render a miniature; that requires offscreen rendering, so later |
| **Multiple selection** | none | P2, consistent with the rest (the graph has none either) |
| **A context menu** (right click) | none, neither in Project nor anywhere else in v2 | **P1.** Legacy had one (shaky). `+` and `…` cover creation, but "right click on a tile → Rename / Delete / Open" is expected. Reuse `openMenu` with an anchor point (the `pointAnchor` helper already exists in `windows/graph.js`) |

---

## E. Inspector

### E.1 Structure — conformant to the design, and well beyond

`design/prototype.css` `.sect-head`: grip · caret · glyph · label · tools. v2 does exactly that,
plus:
- the section label **is** typographically the dropdown's group header — an explicit decision, and
  the right one (it gives the panel a single scale of titles);
- the grip is **always present**, invisible when the section is not movable (the prototype does it
  too, `.grip.fixed`): without it, the carets do not line up from one section to the next;
- the reordering gesture is taken on the grip alone (ADR-0026 §8), the header staying a collapse
  button.

The fields: `px-field` + `px-number` implement **everything** the prototype asks for — an `X`/`Y`
prefix as a scrub handle (4 px = 1 step), stacked 11 px steppers revealed on hover, **auto-repeat
after 320 ms**, `↑`/`↓` = ±1, `Shift` ×10, a monospace font with tabular figures. The prototype
said "the behaviour `px-number` does not have"; it has it now.

### E.2 Divergences and generalizations

| Subject | Finding | Recommendation |
|---|---|---|
| **`PropertyType.RESOURCE` = `READONLY`** (`inspector/schema.js:81`) | a `resource` property displays but does not edit; only a drag assigns it, and nothing says so | **P0. A `<px-resource-field>`**, reusable everywhere: a 20 px thumbnail + the name + `…` (opens a picker filtered by the schema's `kind`/`mime`) + `×` (clears). It is **the** `PROPERTY` drop target, with the dashed outline. `acceptsResource()` already provides the filter — so the picker and the drop share the same rule |
| **`PropertyType.ARRAY` = `READONLY`** | displays a count | P2. A list control is a real piece of work |
| **Preview** | a resource's Inspector shows a preview (`.preview`), an Object's does not | Generalize: any assigned `resource` property shows its thumbnail. The same primitive as above |
| **Drop target** | `outline: 2px dashed` on `px-field.drop`, `.preview.drop`, `.none.drop`, `.add.drop` — four selectors | A single `.drop-target` class in the shared sheet, as `.line` and `.twisty` became. That is exactly the reasoning already followed in `ui/styles.js` |
| **`--px-surface-sunken`** (`inspector.js:328`) | the same bug as in Project | the same fix |
| **Resetting a property** | absent | P2. `descriptor.default` is known; a `↺` on row hover is enough |
| **Tooltip** | the descriptors carry `tooltip` (ADR-0027 fills them carefully) | Check that they are rendered. If they are not, that is information written and thrown away |

### E.3 What should be generalized across the Inspector

Three primitives, and they cover everything the panel will do in the next two passes:

1. **`.drop-target`** — one class, one rule, every field.
2. **`<px-resource-field>`** — thumbnail + name + pick + clear + drop. It serves: `Sprite.source`,
   a future `AudioSource.clip`, a future `Tilemap.atlas`, and the default of a `resource` property
   declared in a `.px`. Four uses before it even exists.
3. **`section()`** — grip/caret/glyph/label/tools is already written three times in
   `windows/inspector.js` (Object, Component, a `.px`'s Properties). Extract it when the fourth
   arrives, not before.

---

## F. Runtime — Play / Pause / Stop

### F.1 What the historical behaviour was

- **Legacy `play.js`**: `window.open('/build/', …)` — Play opens **another window**, sized to the
  camera, centred on screen, and passes it `{ host, port, online, objects }` through `app.data`.
  The game **never** runs inside the editor.
- **Legacy `pause.js`**: `Renderer.main.pause = !pause`, a `pause` event, an `.active` class on
  the button, a `title` toggling Pause/Resume. **The pause is the renderer's, not the
  simulation's.**
- **Stop**: **does not exist** in Legacy. Closing the window is the stop.
- **`design/`**: three buttons in a `.transport` group at the centre of the titlebar, Play in
  `--ok` (green), Pause and Stop **disabled** while nothing is running (`disabled`, opacity 0.32).
  Direction C makes it a big 34 px green disc, and the `design/` README says that borrowing is
  **adopted** ("the big green Play button").

### F.2 What the v2 code says

- `editor.js` (~line 420): "THERE IS NO TRANSPORT HERE, AND THAT IS DELIBERATE… Play needs a scene
  snapshot restored on stop, which does not exist yet". A deliberate decision, and the "no button
  that lies" rule is a good one.
- **But the mechanism is closer than announced:**
  - `viewport.js` already builds a `Runtime` with `running = false` ("Edit mode: the scene is drawn
    every frame but never stepped");
  - `Runtime.running` is a public setter; `advance()` does nothing when it is false;
  - `Input` exists (`runtime/input/input.js`) and is **passed**, never global;
  - `serializeScene()` / `deserializeScene()` exist (`core/serialize.js`);
  - `interpretGraph()` and `behaviors` are wired up (ADR-0027 §6, tested in
    `editor/project/graph-runtime.test.js`).

### F.3 Recommendation

**Do not design a runtime.** Assemble what is there:

| Button | What it does | What is needed first |
|---|---|---|
| **Play** | `snapshot = serializeScene(scene)`; wire up the viewport's `Input`; `runtime.running = true` | nothing new |
| **Pause** | `runtime.running = false`, rendering continues (that is already `running`'s documented contract) | nothing |
| **Stop** | `runtime.running = false`; restore the scene from `snapshot`; clear the history **of the play session** | the restoration |

**The questions to settle before writing a line**, and they are for the main agent:

1. **Where does the snapshot live?** Not in the `Workspace` (it is not project data), not in the
   `Scene` (it is the truth). Probably in the transport controller, in memory, discarded on Stop.
2. **What happens to undo during Play?** The simulation writes through the reactive Proxy, so **it
   produces Changes**. If those Changes enter the `Operations`, Play fills the undo stack with
   noise. ADR-0003 says a Component never calls `setProperty()` — so a simulation write is not an
   intent. **It must be verified that the pipeline actually honours that**, and it is the only
   real risk in this feature.
3. **Selection and the Inspector during Play?** Proposal: stay alive and read-only, with the panel
   greyed out. Editing a value while the simulation writes it is a conflict with no winner.
4. **Where does the game run?** Legacy opened a window; `design/` puts the transport in the
   titlebar, therefore **in the viewport**. Follow `design/`: opening a window breaks local
   multiplayer and makes the edit→test loop expensive.
5. **Keyboard focus.** During Play, keys go to the game, not to the editor's shortcuts — except
   `Esc` (= Stop) and `F5`/`Ctrl P` (= Play/Pause). To state explicitly, otherwise `Delete` will
   delete an object mid-game.

**The visual feedback requested**: an accent border around the viewport during Play, and the scene
tab marked. It is the Unity/Godot convention and it avoids the classic mistake "I edited during
Play and everything vanished at Stop".

---

## G. Docking / Tabs / Timeline

### G.1 The three organizations

- **Legacy**: two fixed zones. The Graph is a `tab-content` **in the centre zone**, in place of the
  canvas (`#overlay` vs `#wrapper`, `tabs.js`); Project and Timeline share the bottom zone
  (`#resources`). The Graph additionally has a 200 px `#toolbox` on its right.
- **`design/`**: L4 adopted. A **conditional** Timeline, in a strip covering the left column plus
  the centre, stopping before the Inspector, which keeps an unbroken column. The prototype **draws
  no Graph window at all**.
- **v2**: L4 implemented. The Graph **replaces** the viewport in the stage (`.stage`), selected by
  a tab strip that only appears once two editors are open (`editor.js`, `stageTabs`). The Timeline
  is a `<px-timeline>` under the stage, hidden by default, with an honest empty state.

### G.2 "Should the Graph go in the bottom zone, with the Timeline, open by default?"

**Recommendation: no.** The argument:

**Against.**
1. **A graph needs surface area.** A node is 168 × ~90 px; a 192 px-high strip shows **two** nodes
   stacked. The strip is dimensioned for 24 px tracks, not for a 2D canvas.
2. **The Timeline animates the scene; the Graph edits *another* resource.** In L4, the bottom
   strip is what is **subordinate to the displayed scene** — that is D8's very argument (the
   Inspector keeps its column because it comments on what is in the centre). A `.px` is not
   subordinate to the scene: it is an open document, with its own undo stack (ADR-0027 §10). It
   belongs to the document zone, that is, the stage.
3. **The mechanism already exists and is correct.** `Workspace` + `stageTabs` = a model of open
   documents. Moving it down would require either two tab systems, or putting the Timeline in the
   tabs — and a Timeline is not a document.
4. **"Open by default"** flatly contradicts D8: "when nothing is animated, the strip is not there
   at all". Opening an empty strip by default is chrome with no content.

**For (and what it reveals that is true).**
The need behind the question is real: **you cannot see the scene and the graph at the same time.**
Wiring a `.px` while watching the character move is an obvious use. But the answer to that need is
not "put the graph at the bottom", it is **a split view**.

**A concrete recommendation, in order of cost:**

1. **P1 — Make the Graph tab discoverable.** Today the tab strip only appears with two editors
   open, so opening your first `.px` makes **the scene disappear with no visible tab to go back**.
   That is the real ergonomic problem of the centre zone, and it is independent of the question
   asked. → the open scene must **always** count as a tab, or the strip must show as soon as a
   `.px` is open.
2. **P1 — A horizontal split of the stage**: `Viewport | Graph`, a movable seam, enabled by a
   "side by side" button on the tab. `<px-splitter>` exists, `.stage` is already a flex.
3. **P2 — Window detachment.** Already listed as not done in `EDITOR.md`. Not to be tackled now.

**What to do about the Timeline:** nothing, until the animation system exists. The current empty
state is correct and honest.

---

## H. Design system

### H.1 The central finding

**A coherent design system already exists**, in `src/editor/ui/styles.js`, and it is better than
anything this report could propose: tokens by **role** rather than by position in a ramp, measured
and annotated contrasts, density that switches under `pointer: coarse`, two sheets (document +
shadow) for a stated reason, shared primitives (`.ghost`, `.line`, `.twisty`, `.searchbar`,
`.empty-state`, scrollbars).

**So do not propose a design system. Close its gaps.**

### H.2 The system, summarized (for reference)

| Family | Tokens | Note |
|---|---|---|
| Surfaces | `background` `surface` `surface-raised` `surface-overlay` `surface-input`, + `surface-hover` `surface-active` | a ramp of 5 + 2 states. No shadow: depth is a step of surface, except for the menu and the drawer |
| Borders | `border` (near-black, structure) · `border-subtle` (internal) | **two, and there is no third** |
| Text | `text-strong` `text` `text-muted` `text-dim` | annotated contrasts, the weakest at 4.6:1 |
| Accent | `accent` `accent-hover` `accent-active` `accent-muted` `accent-border` | **one accent only**, coral `#ff7a45` |
| Status | `success` (Play) `danger` (destructive) `warning` (runtime) | meaning, never decoration |
| Type | `font-sans` + `font-mono` (values only, `tabular-nums`); `text-2xs` 10 → `text-md` 13 | **never a bitmap font**: the reason is given (fractional DPI) |
| Space | `space-0` 2 → `space-8` 32, multiples of 4 | `space-0` is the documented half-step |
| Density | `row` 26 · `control` 22 · `hit` 28 · `grip` 8 | the visual and the target are **separate** — that is what makes it compact and touch-friendly at once |
| Radius | `radius-sm` 3 · `radius` 4 · `radius-lg` 6 | "4 px reads as care, 8 px as a web app" |
| Motion | `duration-fast` 90 · `duration` 140 · `ease` | **on colour only**; nothing moves |
| Layers | `z-content` `z-splitter` `z-drawer` `z-overlay` `z-drag` | named |

### H.3 Gaps to close

| # | Gap | Fix |
|---|---|---|
| 1 | `--px-surface-sunken` used, not defined (2 sites) | Define it. It is the chequerboard's background: a value below `--px-background`, around `#111216` |
| 2 | `--px-radius-md` used, not defined (1 site) | Replace it with `--px-radius`, or define it |
| 3 | `--px-z-drag` defined, **never used** | It will serve the drag session's ghost (§B.4). Do not remove it |
| 4 | No token for the **drag-over state** | `--px-drop-line` and `--px-drop-outline` are not needed: `--px-accent` is enough. What is missing is **the shared class** `.drop-target`, not a token |
| 5 | No **family** token (Hierarchy/Inspector/Project/Timeline) | `design/README.md` says it itself: the hues exist only in direction B, which was rejected. **A decision to take, not to assume.** Recommendation: do not introduce a family for windows, but yes for **node categories** (§C.3), where the information is genuinely useful |
| 6 | No token for **data types** (ports, wires) | To introduce **if and only if** wires are coloured by type (§C.4). 4 values max |
| 7 | `focus` | `outline: 2px solid var(--px-accent); outline-offset: -1px` on `:focus-visible`, everywhere, already done. Nothing to do |
| 8 | `disabled` | `opacity: 0.35` on `.ghost[disabled]`. Consistent with the prototype (0.32). Nothing to do |
| 9 | Icons | 30 glyphs, two sizes (16, 20), a stroke weight **constant on screen** (computed from the size). Excellent. Missing ones: see §H.4 |

### H.4 Icons — inventory and decisions

**What v2 has (30)**: object, rectangle, circle, camera, sprite, particles, tilemap, component,
graph, scene, image, hierarchy, inspector, folder, timeline, chevron, plus, more, share, sound,
minus, grip, trash, close, search, focus, grid, eye, eye-off, lock, unlock.

**What `design/icons.js` adds (17, drawn to the same rules, so copyable as is)**: play, pause,
stop, step, light, audio, script, graph *(a different drawing)*, physics, layers, drag (= grip),
check, ruler, magnet, frame, more, share.

**To take, by real need:**

| Glyph | For what | Priority |
|---|---|---|
| `play` `pause` `stop` | the transport (§F) | P1 |
| `check` | validation, states | P2 |
| `magnet` `ruler` `frame` | viewport tools (snap, rulers, frame) | P2 |
| `light` `physics` `script` | upcoming Component types | when the Component arrives |
| `step` `layers` | no identified use | **do not add** |

**Common vs specific icons:**
- **common** (one definition, never duplicated): chevron, plus, minus, close, search, trash, more,
  grip, eye/eye-off, lock/unlock, check, focus, grid;
- **specific**: the Object types (object, rectangle, circle, sprite, camera, particles, tilemap),
  the resource types (folder, scene, component, image, sound), the windows (hierarchy, inspector,
  timeline);
- **a rule already in place and worth defending**: `hierarchy` (the window) and `scene` (the
  resource) are **two different glyphs** — that is an ADR-0025 finding and it is right.

**The `walk.px` case — an explicit disagreement between `design/` and ADR-0026.**

`design/prototype.js` (`ASSETS`) gives `walk.px` the **`graph`** glyph (nodes and wires). In v2,
`iconForResource()` maps `ResourceKind.COMPONENT` → `'component'` (the hexagon), and
`ResourceKind.GRAPH` → `'graph'` — but **nothing creates a `GRAPH` resource any more**
(ADR-0026 §1).

So today a `.px` in the Project shows **the hexagon**, not the graph. The prototype shows the
opposite.

**Recommendation: keep the hexagon, and treat `design/` as wrong here** — it predates ADR-0026's
unification. The argument: ADR-0026 says a creator who makes a Component gets **one** thing called
a Component. The icon must say "Component", not "graph" — the graph is *what is inside it*, and it
is discovered by opening it.

**Two consequences to handle:**
- the `graph` entry of `RESOURCE_ICONS` is dead as long as nothing creates that `kind` — leaving
  it is harmless, but it deserves a comment, otherwise someone will "fix" the `.px` mapping to
  point at it;
- the `graph` glyph **must** stay: it serves the scene tab of an open `.px`, the canvas's empty
  state, and the "Behavior Graph" entry of the Add Component menu. It is the **canvas**'s icon,
  not the resource's. That distinction is exactly the hierarchy/scene one, and it is sound.

**Not to copy from Legacy: anything.** Font Awesome (5 weights, 20 webfont files) and Material
Icons by ligature (`<i class="material-icons">description</i>`). ADR-0006 and `ui/icons.js` have
already settled it: an icon font crosses a Shadow Root badly and costs requests. `legacy/webfonts/`
must never be touched.

---

## I. `LEGACY ONLY` — what must not be copied over

The requested format: the behaviour → why it is interesting → why the implementation is to be
thrown away → the v2 architecture.

### I.1 `Sorter` — sorting by mutating the DOM

- **Interesting:** the horizontal axis giving the depth level; the dashed hole.
- **To throw away:** `dragEnter` does an `insertBefore` (the DOM becomes the model), `drag` calls
  `Scene.main.objects[...].addChild()` **during the hover** (the model is mutated before the
  drop), `data-position` carries depth in the DOM with a `padding-left` hard-coded for 1 to 5
  levels, `drop` is commented out.
- **v2:** `windows/drop.js` (pure geometry) + `REPARENT { parent, index }` (ADR-0019) on the
  **drop only**. Add the horizontal axis as a **reading**, never as a mutation.

### I.2 `Node` — the `contenteditable` node and ports by index

- **Interesting:** typing `move $x $y` and watching the ports appear is a seductive idea.
- **To throw away:** a node's type is not a typed string; `this.inputs[i]` / `this.outputs[i + 1]`
  address ports by **index** — a type that gains a port rewires every existing graph; the ports are
  recreated on every keystroke; the caret position is rebuilt by hand; `connector.other` is a
  DOM ↔ DOM reference that exists only on screen.
- **v2:** ADR-0027 §2 and §3 — a stable identity for node, port and connection; ports declared by
  the type; a single SVG.

### I.3 A static `Graph.main` and an `updateScript()` that `console.log`s

- **Interesting:** nothing.
- **To throw away:** no model, no serialization, no execution. Closing the tab lost the work.
- **v2:** `ComponentDefinition` + `Operations` + `validateGraph()` + `interpretGraph()`.

### I.4 `editor/graph/compiler.js` — the lexer for a textual language

- **To throw away:** already abandoned by ADR-0009. `.px` is **interpreted**, not compiled, and
  without `eval`.

### I.5 `Properties` — an Inspector by reflection on `typeof`, and binding by CSS class

- **Interesting:** the idea of an Inspector driven by data, not by per-type `if`s.
- **To throw away:** a control's type is guessed from `typeof value` (and a colour is detected by
  `value[0] === '#'`); the field ↔ model binding goes through
  `document.getElementsByClassName(obj.id + '-' + prop)`; a hard-coded blacklist
  (`case 'id': break; case 'uid': break; …`) decides what is shown; properties are prefixed `_`
  and `$` to signal reactivity.
- **v2:** `componentSchema()` (ADR-0007), `PropertyType` (ADR-0023), a `px-field` bound to its own
  property, no CSS class carrying identity.

### I.6 `Dnd` — static, global drag state

- **Interesting:** the cursor following the state (grab / grabbing / directional resize).
- **To throw away:** `Dnd.hovering`, `Dnd.drag` and `Dnd.resize` are statics read **by the renderer
  itself** — that is the architecture violation `tools/layers/run.js` still reports. `setCursor()`
  writes to `document.body.style` every frame. `applyDropEvents()` **clones the DOM node** and
  deletes the original: the model is never consulted.
- **v2:** `dnd/payload.js` (a value), `dnd/rules.js` (the semantics), the cursor through CSS and
  `dropEffect`.

### I.7 Renaming by `contenteditable`, everywhere

- **Interesting:** in-place editing, with no dialog.
- **To throw away:** a `div[contenteditable]` on every row, `input` → `scene.updateName(this)`,
  `keypress` → `System.validate`, `focusout` → `window.getSelection().removeAllRanges()`. No undo,
  no `batch`, and the DOM carries the text.
- **v2:** ADR-0026 §3 — a second click + a pause, or `F2`, `Enter` commits, `Esc` cancels, one
  `batch` opened at focus and therefore **one** undo entry.

### I.8 `filter.js` — filtering by `style.display = 'none'`

- **To throw away:** it hides one row at a time, so in a tree it hides a matching child whose
  parent does not match.
- **v2:** `windows/search.js`, `visibleObjects()` — **a match brings its ancestors along**, pure,
  tested.

### I.9 `select.js` — a `<select>` reimplemented as `<div>`s

- **To throw away:** copy-pasted from W3Schools, global `var x, i, j`, `arrNo.indexOf(i)` used as a
  boolean (a bug: index 0 is falsy).
- **v2:** a native `<select>`, `appearance: none` + a gradient arrow (`ui/styles.js`).

### I.10 Prefab creation on a Hierarchy → Project drop

- **Interesting:** the gesture is the right one.
- **To throw away:** `prefab.copy(instance)` + copying components with `new window[Name]()` —
  instantiation by global name.
- **v2:** **refused with its reason** (ADR-0026 §7), pending the prefab decision. Correct.

### I.11 `play.js` — Play opens another window

- **Interesting:** a game sized to the camera.
- **To throw away:** `window.open` + `app.data = { objects: scene.objects }` — passing live objects
  between contexts, no serialization, blocked by popup blockers.
- **v2:** see §F — the viewport's `Runtime`, with a snapshot.

---

## J. Priorities

### P0 — general ergonomics, to do before anything else

1. **The Graph's grid bound to the view** (`patternTransform`), plus two minor/major levels.
2. **A drag session at the shell**: ghost, marked zone, cursor, clean cancellation (§B.4).
3. **Display `describe()` / `refuses()`** — the sentence of the refusal and of the action.
4. **`<px-resource-field>`**: `PropertyType.RESOURCE` becomes editable (picker + thumbnail + clear
   + drop).
5. **Node search**: categories collapsed on open, scoring, `aliases` + `keywords` in the node
   table.
6. **The tab strip must appear as soon as a `.px` is open** — otherwise opening a `.px` makes the
   scene disappear with no way back in sight.

### P1 — significant improvements

7. A **Play / Pause / Stop** transport on the existing `Runtime`, with a snapshot (§F).
8. The **two missing tokens** (`--px-surface-sunken`, `--px-radius-md`).
9. **Right click on the canvas background = the creation menu**; pan on middle + space-drag.
10. **Reparenting by horizontal movement** in the Hierarchy (Legacy's idea).
11. A **context menu** in Project and Hierarchy (`openMenu` + `pointAnchor`).
12. **An icon on the node** + **a header bar coloured by category**.
13. **A split `Viewport | Graph` view** (`<px-splitter>` inside `.stage`).
14. **Reordering a `.px`'s properties** — needs a Core operation, therefore an amendment to
    ADR-0027 §5.
15. **An inline value** on an unconnected node input (`number`/`int`/`boolean`/`string`).

### P2 — polish

16. A shared `.drop-target` class, replacing the Inspector's four selectors.
17. Node hover (one step of lightening).
18. Wire colour by type family (4 families maximum).
19. **Contextual** node search: releasing a wire into empty space opens the menu filtered by port
    compatibility.
20. Project sorting (name / type / date), in the `…` menu.
21. Resetting a property to its default.
22. The `check`, `magnet`, `ruler` and `frame` icons.
23. A scene thumbnail, a list control for `PropertyType.ARRAY`, multiple selection.

**Explicitly not planned:** prefabs (an open decision), window detachment, a Project list view, a
Prefabs tab, a minimap, `Ctrl K`.

---

## K. Instructions for the implementing agent

Concrete, ordered, each one verifiable.

### K.1 — The Graph's grid (1 file, ~10 lines)

In `src/editor/windows/graph.js`:
- keep the background `<rect>` outside the transformed `<g>`, but set on the `<pattern>` (on every
  `#draw()`): `patternTransform = translate(view.x, view.y) scale(view.zoom)`;
- add a second minor `<pattern>` of `GRID` nested inside the major one of `GRID * 4`, as
  `legacy/index.html` did (`#smallGrid` inside `#grid`);
- fade the minor below `zoom < 0.5`.
- **Verification:** panning by 500 px must move the grid by 500 px; zooming to 200 % must double
  the line spacing.

### K.2 — The drag session (1 new module, 4 windows to wire)

Create `src/editor/dnd/session.js` — **view only, no model, no rules**. It only orchestrates what
exists:
- `begin(payload, ghost)`: mounts the ghost on `document.body`,
  `z-index: var(--px-z-drag)` (the token is waiting), `cursor: grabbing` on `document.body`;
- `move(x, y)`: asks each window `dropZoneAt(payload, x, y)` (the Inspector already exposes that
  shape), calls `canDrop()`, marks **a single** zone (`.drop-target` when accepted, or refused in
  `--px-danger`), shows the sentence after 250 ms;
- `end()` / `cancel()`: `performDrop()` or nothing, then a complete cleanup. **`pointercancel` must
  go through `cancel()`.**

Wiring: `windows/project.js` already emits `px-drag-start` / `px-drag-end` — replace the `carried`
of `editor.js:548-569` with the session. Add the emission in `windows/hierarchy.js` (with
`objectPayload`) so that the prefab refusal becomes reachable.

**Forbidden:** do not mutate the model during the hover; do not move anything but the ghost; do not
write the cursor inside a `move` handler.

### K.3 — The resource field

Create `src/editor/ui/resource-field.js`: a 20 px thumbnail (chequerboard + image, or a glyph) ·
the name · `…` · `×`. The `…` opens `openMenu` with the resources filtered by `acceptsResource()` —
**the same function as the drop rule**, not a second one. Then `inspector/schema.js`:
`[PropertyType.RESOURCE]: FieldKind.RESOURCE`. Do not leave it `READONLY` with a workaround.

### K.4 — Node search

- Add `aliases?: string[]` and `keywords?: string[]` to the `@typedef NodeDefinition` in
  `core/graph/nodes.js`, and fill them in `core/graph/standard.js`. It is **the same table** —
  ADR-0027 §3's argument applies as is, and no ADR needs amending.
- Create `searchNodes(registry, query, context)`, **pure**, tested under Node, with the 6-level
  ranking from §C.7. No Levenshtein.
- `ui/menu.js`: add `{ collapsed, rank }` options. **Do not duplicate the component** — it is
  shared by four callers (ADR-0026 §10). A menu without `collapsed` must behave exactly as it does
  today.
- Add `←` / `→` to collapse/expand a category; typing expands everything.

### K.5 — Transport

Before writing anything, **answer question 2 of §F.3**: does a simulation write enter the undo
stack? If it does, no Play button must be placed before that is fixed. Then: a snapshot through
`serializeScene()`, `runtime.running`, restoration on Stop, an accent border around the viewport
while running, `Esc` = Stop, the other editor shortcuts suspended.

### K.6 — Tabs

In `stageTabs` (`editor.js`), the condition `element.hidden = open.length < 2` makes the scene
disappear with no tab to come back to when a `.px` opens. Count the scene as a tab, or show the
strip as soon as a `.px` is open. **It is a P0 disguised as a detail.**

### K.7 — Tokens

`ui/styles.js`: define `--px-surface-sunken` (around `#111216`, below `--px-background`); replace
`--px-radius-md` with `--px-radius` at the call sites, or define it. Three sites:
`inspector.js:328`, `project.js:110`, `project.js:131`.

### K.8 — What NOT to do

- **Do not** reintroduce direction B's multicoloured rails or badges: `design/README.md` rejected
  them, only the header icon colour was kept, and even that has no settled value in Modern Pixel.
- **Do not** add a Prefabs tab, a list view, a minimap or `Ctrl K` — each is either deferred by an
  ADR, or drawn by a prototype that declares itself non-normative on density and features.
- **Do not** make the list reflow under the pointer during a drag. The comment in `hierarchy.js`
  ("a list that reflows under the pointer is a list you cannot aim at") is right; Legacy proves the
  converse by example.
- **Do not** follow `design/` on the `walk.px` icon: the prototype predates ADR-0026's `.px`
  unification (§H.4).
- **Do not** put the Graph in the bottom strip (§G.2). The real need is the **split view**.
- **Do not** touch `legacy/`. It is a source to read, not a source of code.

### K.9 — Three questions that are not mine to settle

1. **A family colour for node categories** — yes/no, and which hues. `design/README.md` leaves the
   question open for Modern Pixel.
2. **Right click = pan or = creation menu** in the canvas. I argue for the menu; it is a change of
   convention and it is decided, not deduced.
3. **`MOVE_PROPERTY`** to reorder a `.px`'s properties: it is a Core operation, therefore an
   amendment to ADR-0027 §5 — and that ADR argues explicitly against dedicated operations when
   `SET_PROPERTY` suffices. Here it does not (a rank is not a field), which is exactly the argument
   that justified `MOVE_RESOURCE` in ADR-0026 §5. The parallel is strong; the decision remains to
   be taken.

---

## Appendix — inventory of files read

**`design/`**: `README.md`, `index.html`, `prototype.css` (1483 l.), `prototype.js` (1124 l.),
`icons.js` (151 l.) — in full.

**`legacy/`**: `editor/system/dnd.js`, `editor/system/handler.js`, `editor/misc/sorter.js`,
`editor/misc/{grid,filter,tabs,select,shortcut,play,pause,context-menu}.js`,
`editor/windows/{hierarchy,project,properties,toolbar}.js`, `editor/graph/{graph,node,component}.js`,
`index.html`, `css/{variables,world,resources,overlay,code,dnd,context-menu}.css`.

**`src/`**: `editor/ui/{styles,icons,menu}.js`, `editor/dnd/{payload,rules,files}.js`,
`editor/windows/{drop,graph,hierarchy,project,inspector,timeline,toolbar,search}.js`,
`editor/inspector/{schema,definition,node}.js`, `editor/graph/view.js`, `editor/{editor,commands}.js`,
`editor/project/commands.js`, `editor/viewport/viewport.js`, `core/graph/{nodes,standard,definition}.js`,
`core/serialize.js`, `project/resource.js`, `runtime/runtime.js`,
`runtime/rendering/components/sprite.js`.

**`docs/`**: `ARCHITECTURE.md`, `architecture/EDITOR.md`, ADR-0026, ADR-0027 (in full), the index
of ADR-0001 → 0025.
