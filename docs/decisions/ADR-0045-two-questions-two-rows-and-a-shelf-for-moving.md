# ADR-0045 — Two questions, two rows, and a shelf for moving

- **Status:** **accepted** (2026-08-29)
- **Amended by:** ADR-0047 (2026-08-29) — §1: the `Component` field disappears in favour of a grouped picker, the question still being asked by the model. §2: `Set Property`'s `Value` input gets the same treatment as `Get Property`'s output.
- **Decides:** the shape of the property nodes; what a continuous input event is called; the catalogue's categories; what an Inspector field measures; what a property can carry through to the graph
- **Depends on:** ADR-0002 (spaces), ADR-0016 (a `.px` is a type), ADR-0023 §2 (no vector type), ADR-0026 (a typing session is one history entry), ADR-0031 (declared properties), ADR-0034 (the scope of identities), ADR-0036 (the `objectref` boundary), ADR-0039 (taxonomy), ADR-0043 (the Object answers for itself)
- **Amended by:** ADR-0046 (2026-08-29) — §4: a key's three moments become three PORTS of one node, which settles ADR-0041 §3.2's objection better than three names. §9: a colour becomes a short control again. §10: a property's handle is the reordering one, and there are no longer two.
- **Amends:** ADR-0040 §2 and §4 (the Component becomes a question again), ADR-0041 §3.2 (a continuous event exists, under another name), §6.1 (a Component can be dropped on a node), §2 (the merged path becomes two rows again)
- **Completed by:** ADR-0058 (2026-09-11) — §11.5's `Delay` is written: the waiting state lives on the Component instance, beside `started`
- **Completed by:** ADR-0057 (2026-09-11) — §11.5's `Random` is written: the seed lives on the Runtime, which assigns it and says it
- **Completed by:** ADR-0056 (2026-09-07) — §11.5's `Destroy` and `Spawn` are written: the missing concept is "a copy of an Object of the Scene", and the question of the pipeline iterating is settled by `Runtime.step()`
- **Does not decide:** a port's unit in general — see §11.4.

---

## 1. The Component becomes a question again, but one that is already answered

ADR-0040 §2 merged "which Component" and "which property" into **one** row, because two dropdowns for
one thing were two gestures where the creator thinks one. The decision was right about the gesture
and paid a price it measured itself: ADR-0040 §8 notes that "the property list is longer: it holds
every Component in the project".

That price grew with the project. A real project offers eighty rows to reach `X`, and the merged row
does not group them — it concatenates them.

> **`Component` is one row, `Property` is another, and `Component` is already answered: "This
> Component".**

That is what distinguishes this decision from the one ADR-0040 ruled out. The Component is **never
empty** and never blocks: a freshly placed node reads `This Component ▸ …`, which is true and what a
creator wanted nine times out of ten. Answering the question is optional; asking it makes the list
below readable.

| | ADR-0040 | here |
|---|---|---|
| Rows | 1 | 2 |
| The Component is | inferred from the property choice | chosen, with a default answer |
| The property list | the whole project | one Component's |
| A new node | configured | configured |
| Changing Component | impossible without changing property | one gesture; a property the new type does not declare is removed **in the same batch** |

---

## 2. `Property`, not the property's name

`Get Property`'s output is called **`Property`**. The picker two rows above already says which;
repeating `Position X` on the port said it twice on a 176 px card without teaching a beginner what the
port **is**. The name and the type stay one hover away.

That output is **alone on the last row**. A row carrying both a control and a port that has to speak
for itself lets you read neither.

---

## 3. `Object`, `Component`, `Property`: a column of questions

A property node's three pickers read top to bottom as a sentence:

```
  Object      Self              ← which one
  Component   This Component    ← of what
  Property    Health            ← which value
```

Each has a default answer on display, none is empty, and the order is the one a creator thinks in. It
is the shape ADR-0039 §0.2 requires: a placed node is a finished node.

---

## 4. A continuous event exists, and carries another name

ADR-0041 §3.2 refused a continuous keyboard event, and the objection was **readability**: such a node
would have looked like the one-shot node, and two identical cards that behave differently are worse
than the second one's absence.

The objection was about the name, not the need. Three distinct names lift it:

| Node | What it does | What you write with it |
|---|---|---|
| `On Key` | fires **at the moment** the key goes down, and at the moment it comes up | jump, shoot, open |
| `Key Down` | fires **on every frame** the key is held | walk, aim, charge |
| `Key Is Down` | **answers** true or false, firing nothing | a condition inside a branch |

`Pointer Button` has exactly the same three, in the same words. "Walking" used to cost `On Update` +
`Key Is Down` + `Branch` — three nodes for the first thing every beginner tries.

---

## 5. `Self` is a picker row, where there is a fallback

A Transform or property node's `Object` field displayed `Self` as an **empty state**. A creator who
picked `Player` by mistake got no way back: an enum offers what it lists, and `Self` was not listed.

`Self` is therefore a row — **and only where the parameter declares a fallback**. `Get Object` uses the
same kind of reference and has none: with no named socket it carries nothing, and offering `Self`
there would describe a node that already exists (`Self`) rather than this one.

`Parent` is **not** a row. The `Parent` node composes — it plugs into any Object, not only this one —
and a sentinel value in the picker would be a second vocabulary for the same idea.

---

## 6. A property name reads the same everywhere

The Inspector writes `Scale X`; the graph picker wrote `scaleX` for the same property. A beginner
moving from one to the other has no reason to believe they are the same thing. The picker now writes
what the Inspector writes — and a property the creator declared themselves goes through the same rule,
one line further on, so the two still agree.

---

## 7. A numeric field refuses what it will not be able to read

A letter went in, and vanished on the way out: `Number('12a')` is `NaN`, `format(NaN)` is `''`, so
**one keystroke emptied a field whose model was still 12**.

Two rules replace that:

1. An entry that would not leave something **on its way to** a number is refused at the moment it is
   typed. `-`, `1.`, `1e-` stay: they are the beginnings of a value. `12a` does not.
2. What survives is normalized **against the last good value**, never against `NaN`. The box therefore
   cannot end up empty, nor display what the model does not hold.

The refusal happens on `beforeinput`, where the browser **asks**: every way text arrives goes through
it — typing, pasting, dragging, dictation, IME — so a paste is filtered by the same rule as a
keystroke, and selection, arrow keys and the browser's undo are never touched, because nothing is
rewritten behind the caret.

One trap is worth naming: `Number('')` is **zero**. A box emptied to be retyped means "nothing for
now"; the language reads the value 0 there, and a control that believed it announced 0 to a panel for
an object the scene held at 200.

---

## 8. A Component that is a file opens from the Inspector

A `.px` placed on an Object is a document you will want to edit, and the only path was to leave the
panel, find the resource in Project and double-click — three steps to reach the thing already named on
screen. Shipped Components have no file: they therefore have no button, rather than a disabled one.

A Custom Component **created** from the Inspector opens by itself. "Add a Custom Component" is never
the complete intention: an empty `.px` does nothing, so the next thing you want is its canvas.

The panel **announces**, it does not open: which surface opens a `.px` is a shell decision (ADR-0006),
and `px-open-resource` is the event the Project panel already emits for the same intention.

---

## 9. An Inspector field measures one or two cells, never anything else

A control was as wide as what it held: a Sprite field holding `hero.png` had one width, the same one
holding `a.png` another, and an empty field was a stub. Twelve rows of that make twelve right-hand
edges and nothing to read top to bottom.

> **The number gives the measure. The value column is two equal cells: a number takes one, everything
> else takes both.**

That is already why `Rotation` ends where `Position`'s `X` ends. The rule is declared **once**, in the
row primitive: every control already stretches what it holds inside, but nothing told it what share of
the row it owned, and the answer cannot be per control without eight files having to agree.

A switch is the only exception, and it is **outside** the rule rather than a breach of it: a two-state
button has no magnitude, so stretching it would only make a bigger target to miss.

---

## 10. A paired row carries two handles, because it is two properties

The Core has no vector type and ADR-0023 §2 removed the idea deliberately. `Position` therefore names
no property a node could read, whereas `x` and `y` each name one. One handle per half is the only
correspondence the model can honour — and the alternative, a row you cannot drag, left **the three
most-used properties in the editor** as the three you could not build a graph from.

The handle column is declared for the simple row **as** for the paired one, even when empty: as soon as
only one reserved it, the two stopped lining up.

---

## 11. A shelf for moving

### 11.1 `Translate`, `Rotate`, `Scale` and `Set Position` are a family

`Properties` is where you look to **read** a property. "I want to move my object" is not answered
there. The four nodes therefore share a category, `Transform`, and keep the properties' hue: it is
another family, not another idea.

A shelf holding one node teaches nothing; `Translate` alone additionally said, falsely, that moving
was the only thing the engine had an opinion about.

### 11.2 Relative, except when the name says otherwise

`Translate`, `Rotate` and `Scale` are **relative**, as their names say. `Set Position` is absolute, as
its own does. The absolute form already existed as `Set Property ▸ X` + `Set Property ▸ Y`: two trips
through the picker to say one thing, which is exactly the count ADR-0040 decided to stop charging.

`Scale` **multiplies** — the one reading of "scale" that composes — so its neutral value is `1`, and a
card reading `X 1  Y 1` makes its relative character readable without explaining it.

### 11.3 `Rotate`'s port is called `Degrees`

`Transform.rotation` is stored in radians and the Inspector displays it in degrees. A port called
`Angle` would therefore be a question with two answers. Naming it `Degrees` costs one word and removes
the question — the technique `Pressed` / `Released` / `Is Down` already use (ADR-0041 §3).

### 11.4 What this does not decide

The conversion lives **in that node** and nowhere else: the Core still stores radians. `Get Property ▸
Rotation` therefore still answers in radians, and that is a seam this catalogue does not close today.
Closing it means ports that declare a unit and an Editor that converts at the port: that deserves its
own ADR, not a side effect of adding a node.

### 11.5 What is not written, and what is missing for it to be

| Node | Frequency | Complexity | What is missing |
|---|---|---|---|
| `Clamp` | high | one line | nothing — **done** |
| `Lerp` | high | one line | nothing — **done** |
| `Move` | — | — | nothing to do: it is `Translate`, and it is already one of its keywords |
| `Random` | high | one line | nothing — **done** (ADR-0057). The seed lives on the Runtime, which assigns it, draws one when nobody gives one, and says it; the node reads `ctx.random` as it reads `ctx.input`. |
| `Delay` | high | medium | nothing — **done** (ADR-0058). What waits is an EXECUTION, and it lives on the Component instance: a `bind` replaces it along with the behaviour, nothing is serialized, and history stops at Play mode's door (ADR-0029 §5). |
| `Destroy` | high | medium | **a decision.** Removing an object while the pipeline is iterating it; and is it an authoring `Operation` or a simulation output (ADR-0003)? |
| `Spawn` | high | high | **a concept.** There is no prefab. Instantiate what, from what? |

The last four are left aside **deliberately**: a node placed to hide an unresolved question is a node
you will have to remove.

---

## 12. A Component can be dropped on a node that names one

ADR-0040 §4 and ADR-0041 §6.1 withdrew this gesture twice, and for the same reason: the property
picker wrote **both halves**, so a drop that set `component` was undone by the next click — "nothing
that survives the next click".

That premise is gone (§1). `Component` is a separate control: the drop writes a row the creator sees,
the property picker below narrows to that Component, and nothing overwrites anything. Revising a
node's target is now a drag rather than a rebuild, and the property the new type does not declare
leaves in the same batch — one `Ctrl Z` puts both back.

Bare canvas stays refused: a Component dropped on empty space does not say what you want to read from
it, and would produce an unfinished node (ADR-0039 §0.2).

---

## 13. A number drag is not bounded by the screen

The value came from `clientX - start`, so a drag that reached the edge of the display stopped producing
numbers. Pointer Lock is the platform's answer: the cursor leaves the screen and the mouse reports
**relative motion**, so the gesture lasts as long as the arm does.

The total is accumulated from deltas rather than measured from an anchor, because the lock arrives
**late** and can be refused — a browser without it, a page that has just released one, an `Esc`
mid-gesture. The cursor freezes wherever the lock caught it, so the fallback re-anchors itself and
nothing jumps.

**Nothing teleports the cursor.** Putting it back at the centre of the screen is the other way of doing
this, and it is a hack: it fights the system, breaks accessibility settings that watch the pointer, and
abandons the cursor somewhere other than where you left it if the gesture ends badly.

---

## 14. Leaving a category is coming back to it

Coming out of `Transform` and finding the cursor on the first row loses your place every time you look
inside a category and change your mind. The category you are leaving is the only thing you are still
thinking about: `→` `←` comes back exactly to where `→` was pressed. The three exits — the
`All categories` row, `Escape` and `←` — share the same path, because it is one intention.

---

## 15. Observable contracts

| Contract | Verifiable by |
|---|---|
| A property node has three rows, in the order Object / Component / Property | `inspector/node.test.js` |
| None of the three is ever empty | the same |
| The property list is the named Component's | the same |
| Property names read as they do in the Inspector | the same |
| Changing Component removes the absent property, in the same batch | the same |
| `Key Down` runs on every held frame, `On Key` once | `runtime/pipeline.test.js` |
| `Rotate` turns in degrees and the Transform keeps radians | the same |
| `Scale` multiplies; `Set Position` does not add | the same |
| A Transform node on an Object with no Transform says nothing | the same |
| `Clamp` bounds both ways; `Lerp` reaches both ends | `scripting/interpreter.test.js` |
| A letter does not enter a numeric field | `ui/number.test.js` |
| An empty box is not the value zero | the same |
| A drag continues past the edge of the screen | `ui/scrub.test.js` |
| Every control measures one or two cells | by eye, and by `getBoundingClientRect()` |
| `←` from a category reselects it | by eye |
