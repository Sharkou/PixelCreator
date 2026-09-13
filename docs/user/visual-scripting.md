# Visual scripting — `.px` graphs

Behaviour in Pixel Creator is **drawn, not typed**. You place boxes ("nodes") and join them
with wires. The file you draw in is a `.px` resource, and a `.px` resource *is* a component
you can put on any number of objects.

There is no script editor and no text language. This page explains the model; the
[Node reference](node-reference.md) lists every node there is.

## The one sentence to remember

> A `.px` file is a **component type**: its graph is the behaviour, and the properties you
> declare on it are the fields you fill in on each object.

Put the same `.px` on twelve enemies and you have twelve enemies running that behaviour, each
with its own values in the Inspector.

## Creating one

| Route | What happens |
|---|---|
| **Inspector ▸ Add Component ▸ New ▸ Custom Component** | Creates the `.px`, attaches it to the selected object, and opens its graph |
| **Project panel ▸ + ▸ Components ▸ Component** | Creates the `.px`. Attach it later from Add Component |

The graph opens as a **document tab** above the viewport, beside the Scene. You can have
several open at once, and each keeps its own undo stack.

## Two kinds of wire

Look at a node and you will see two shapes of port.

| Port | What travels along it | Rule |
|---|---|---|
| **Flow** | *When* something happens — the order of acts | One flow output reaches at most **one** flow input |
| **Data** | A value — a number, a piece of text, an object | One data input is fed by at most **one** output; one output may feed **many** inputs |

The two never mix. You cannot wire a flow port to a data port; the editor refuses, and the
wire's colour tells you what it carries before you try.

The model underneath is simple: **flow is pushed, data is pulled.** When an event fires, the
interpreter walks the flow wires act by act; each act, as it runs, pulls the values it needs
back through its data wires.

## Events: where a graph starts

A graph does nothing until an **event** node fires. There are five:

| Node | Fires |
|---|---|
| **On Start** | Once, when the object begins |
| **On Update** | Every simulation step |
| **On Key** | When a key you name goes down or up |
| **On Pointer Button** | When a mouse button or finger goes down or up |
| **On Collision** | When this object starts or stops touching something |

A graph may hold several events, and each is an independent starting point.

## Working in the canvas

| Gesture | Result |
|---|---|
| **Right-click** empty canvas | Open the node palette, and place the node where you clicked |
| **Add node** button (corner controls) | Same palette, node lands in the middle of the view |
| **Drag from a port** and release on empty canvas | Palette, filtered to nodes that can accept what that port carries |
| **Drag from a port** to another port | Connect them |
| **Drag a node** | Move it; it snaps to the grid |
| **Drag on empty canvas** (left button) | Marquee-select |
| **Middle-drag or right-drag** | Pan |
| **Scroll** | Zoom |
| **Delete** / **Backspace** | Remove the selected nodes and their wires |
| **Escape** | Cancel the gesture in progress |

The palette is grouped by category and searchable, and it understands synonyms — type
`times` and you find **Multiply**, type `float` and you find **Number**.

Placing a node and joining it in one gesture is **one** undo entry.

## Declaring properties

A behaviour usually needs numbers a designer can tune: a speed, a jump height, how much
damage. Those are **properties of the component**, not constants in the graph.

With the `.px` open, use **Add property** in the Inspector. Give it a name and a type; a new
property starts as a **number**. It then appears:

- in the Inspector of every object carrying this component, as an editable field;
- in the graph, where **Get Property** and **Set Property** can read and write it.

Renaming a property is safe. A property has an id of its own, and the graph refers to the id
— so renaming `spd` to `speed` does not break a single wire.

Changing a property's **type** does not throw away values a creator already set, where the new
type can still hold them.

## Reaching other objects

A graph is attached to *an* object, and most of what it does is about that object. Four nodes
widen the circle:

| Node | Gives you |
|---|---|
| **Self** | The object this component is on |
| **Parent** | Its parent |
| **Get Object** | A specific object you pick in the Inspector, or drag in from the Hierarchy |
| **Find By Tag** | An object carrying a tag you name |

Objects travel along data wires as **handles**, never as scene positions. An object that has
been destroyed does not become a dangling reference: **Is Valid** answers the question, and
nodes that act on a missing object do nothing rather than failing.

## Making things happen

| To do this | Use |
|---|---|
| Move, turn, or resize something | **Translate**, **Rotate**, **Scale**, **Set Position** |
| Read or write any property | **Get Property**, **Set Property** |
| Take a decision | **Branch** |
| Wait | **Delay**, **Wait Until** |
| Repeat on a timer | **Every** |
| Animate a value smoothly | **Tween Number** |
| Do several things in order | **Sequence** |
| Create something | **Spawn**, **Spawn Prefab** |
| Remove something | **Destroy** |
| Change level | **Load Scene** |
| Remember across scenes | **Set Session Value**, **Get Session Value** |
| Play a clip or a sound | **Play Animation**, **Play Sound** |
| Check maths, text, comparisons | the **Math**, **Text**, **Compare** and **Logic** groups |
| See what a value actually is | **Log** |

## Frame rate: use Delta Time

`On Update` fires once per simulation step. A node that adds `5` to `x` every step moves at a
speed that depends on the step, which is not what you want.

Multiply by **Delta Time** and the number becomes "per second":

```
Number (200) ─┐
              ├─ Multiply ──► Translate.X
Delta Time   ─┘
```

Everything that should happen "at a speed" wants this. Anything that happens once — a jump
impulse, a spawn — does not.

## Waiting, and how it behaves

**Delay**, **Wait Until**, **Every** and **Tween Number** all pause a running chain and pick
it up later. The pause is real: the execution survives the step that started it, and resumes
where it left off.

Two things follow, and both are deliberate:

- **A component can only have so many suspended executions at once.** A graph that starts a
  new one-second delay every step would otherwise accumulate thousands. Past the limit, new
  executions are refused rather than the game slowing to a halt.
- **One event has a node budget.** A loop that never ends fails loudly — naming the node it
  was on — instead of freezing the tab. The budget is far above any real gameplay graph.

## When a graph is wrong

The editor checks a graph as you build it, and distinguishes two things:

- **An error** — a wire that cannot mean anything, a node type that does not exist, a
  property that has been deleted, values feeding each other in a circle. The graph will not
  run, and the editor says which node.
- **A warning** — something suspicious that is still runnable. A warning **never stops
  anything**; it is information.

Errors you may meet, in plain words:

| What the editor reports | What it means |
|---|---|
| Type mismatch | The value on that wire is not the kind the port takes |
| Port already connected | A data input, or a flow output, is being fed twice |
| Data cycle | Values feed each other in a circle, so there is no order to compute them in |
| Missing property | A node points at a property that no longer exists |
| Missing reference | A node needs you to pick something and nothing is picked |

At runtime, a component that throws does **not** stop the game: the error is reported and the
loop continues. A broken graph costs you that behaviour, not your session.

## Editing a graph while the game runs

Save a `.px` while a Preview window is open and the Preview rebinds the behaviour
immediately. You do not have to stop and restart to see a change to a graph.

## Next

- [Node reference](node-reference.md) — all 77 nodes
- [Prefabs](prefabs.md) — what **Spawn Prefab** spawns
- [Troubleshooting](troubleshooting.md)
