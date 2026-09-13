# Objects and components

Two ideas carry the whole engine. Once they click, everything else in Pixel Creator is a
detail.

> **Object** — a thing in the scene. It has a name and a place, and that is nearly all.
>
> **Component** — a piece of behaviour or data attached to an object. A component is what
> makes an object *do* something.

An object with no components is an invisible, inert point in space. An object with a
**Rectangle** is a coloured box. Add a **Body** and it falls. Add a `.px` graph of your own
and it does whatever you drew.

This is deliberately not an "everything is a class you subclass" engine. You do not make a
*Player type*; you make an object called `Player` and hang the right components on it.

## What an object has of its own

Only four editable properties, plus its family:

| Property | Meaning |
|---|---|
| **Name** | What you call it. Free-form, and not unique — two objects may share a name |
| **Tag** | A free-form label you can search for from a graph (**Find By Tag**) |
| **Layer** | Draw order. Higher draws in front |
| **Active** | Off means the object stops drawing **and** stops running |

Plus an **id**, which you never see and never edit. The id is the object's real identity;
the name is just a label. That is why renaming never breaks anything.

**Active is one switch, not two.** An object that is off is skipped entirely: it does not
draw, its graphs do not run, its collisions do not happen. The Hierarchy's eye and the
Inspector's *Active* checkbox are the same value.

## Where is it? The Transform

An object's position is **not** a field on the object. It is a component: **Transform**.

The Inspector pairs its fields, so the section reads as three rows:

| Row | Halves | Meaning |
|---|---|---|
| **Position** | `X`, `Y` | Where the object is |
| **Rotation** | `X`, `Y` | `X` turns it in the plane of the screen, like a clock hand. `Y` turns it about the vertical axis — out of the plane, which under this renderer reads as a horizontal squash. Neither approximates the other |
| **Scale** | `X`, `Y` | Size multiplier, `1` being unchanged |

Rotations are typed in **degrees**.

Every object the editor creates already has a Transform. You will practically never remove
one.

## Parents and children

Any object can be the **child** of another. Drag a row onto another row in the Hierarchy to
make it so.

A child's Transform is **relative to its parent**. Move the parent and the child comes with
it; rotate the parent and the child swings around it; scale the parent and the child scales
too. In the starter scene, `Visor` is a child of `Player` for exactly this reason.

Reparenting in the editor **keeps the child where it is on screen**: the editor rewrites the
child's local Transform so that nothing visibly jumps. You will not have to fix up numbers
after a drag.

Sibling order matters and is saved: dragging rows to reorder them is a real, undoable change.

Deleting an object deletes everything under it, as **one** undo entry.

## Adding a component

Select an object, then **Add Component** at the bottom of the Inspector. The menu is
grouped, and searchable:

| Group | Holds |
|---|---|
| **Rendering** | Everything that draws: Rectangle, Sprite, Text, Particles, Tilemap, Sprite Animator, Screen Space |
| **Audio** | Audio Source |
| **Scene** | Transform, Velocity, Body, Follow, Box Collider, Tilemap Collider, Camera |
| **New** | **Custom Component** — makes a `.px` graph of your own and attaches it in one step |
| *your own groups* | A component you write can declare its own category |

Every field of every shipped component is listed in the
[Component reference](component-reference.md).

Three things about components that save confusion later:

- **An object may have several of the same kind.** Two renderers both draw. There is no
  "one renderer per object" rule.
- **Component order is real.** You can reorder components by dragging them in the Inspector,
  and the order is saved.
- **A component is data.** Its fields are plain values — numbers, text, colours, references
  to resources or to other objects. Nothing hidden, nothing that cannot be saved.

## Removing a component

Each component section in the Inspector has its own menu. Removing one is undoable.

## Making your own component

Two routes, and they produce the same thing:

1. **Inspector ▸ Add Component ▸ New ▸ Custom Component** — creates the `.px`, attaches it,
   and opens it.
2. **Project panel ▸ + ▸ Component** — creates the `.px`; attach it later from Add Component.

A `.px` file is simultaneously a **resource** in your project and a **component type** you
can put on any number of objects. Its graph is the behaviour; the properties you declare on
it become fields in the Inspector, exactly like a shipped component's.

See [Visual scripting](visual-scripting.md).

## Duplicating

**Ctrl D** duplicates the selected object, together with everything under it, and selects the
copy so you can immediately edit it.

## A worked example: something that falls onto the ground

1. Create a **Rectangle** for the ground. Make it wide and flat.
2. Give the ground a **Box Collider**. Set its `Width` and `Height` to match, and leave
   `Solid` on.
3. Create a second **Rectangle** above it — the player.
4. Give the player a **Velocity**, a **Body**, and a **Box Collider**.
5. On the **Body**, set `Gravity` to something like `900`.
6. Press **Play**.

The player falls and stops on the ground. `Body` reads `Velocity`, moves the object, and
resolves against every solid collider it meets; `grounded` on the Body turns true while a
solid is stopping it from below — a graph can read that to decide whether jumping is allowed.

For a top-down game, leave `Gravity` at `0` and write the velocity yourself from input.

## Next

- [Component reference](component-reference.md) — every field of every component
- [Visual scripting](visual-scripting.md) — behaviour without code
- [Concepts and glossary](concepts.md)
