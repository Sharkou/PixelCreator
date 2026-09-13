# Node reference

Every node in the `.px` graph palette — **77** of them, in the 15 groups the palette shows.
The descriptions are the editor's own: what you read here is what you get on hover.

The palette is searchable and knows synonyms, so you rarely need this page to *find* a node.
It is here so you can check what one actually does.

New to graphs? Read [Visual scripting](visual-scripting.md) first.

---

## Events

Where a graph starts. Each of these is an independent entry point, and a graph may hold
several.

| Node | What it does |
|---|---|
| **On Start** | Runs once, on this component's first simulation step |
| **On Update** | Runs every simulation step, at the fixed rate the clock sets |
| **On Key** | Runs when this key goes down, when it comes back up, and while it is held |
| **On Pointer Button** | Runs when this pointer button goes down, when it comes back up, and while it is held |
| **On Collision** | Runs when this object starts touching another, while it does, and when it stops |

## Input

Questions about the here and now, rather than moments. Use these inside `On Update` when you
want "while held" behaviour.

| Node | What it does |
|---|---|
| **Key Is Down** | Whether this key is being held right now |
| **Pointer** | Where the pointer is in the scene, in world coordinates |
| **Pointer Button Is Down** | Whether this pointer button is being held right now |

Keys are picked from a grouped list — Common, Arrows, Letters, Digits, Modifiers,
Navigation, Function, Numpad, Punctuation — so you never have to guess a key name.

## Flow

Order, decisions and time.

| Node | What it does |
|---|---|
| **Branch** | Takes the *True* or the *False* path, depending on a condition |
| **Delay** | Waits, then carries on down *Then* |
| **Wait Until** | Holds here until something becomes true, then carries on |
| **Every** | Sends a pulse down *Then*, over and over, on a fixed interval |
| **Tween Number** | Carries a number from one value to another, over a length of time |
| **Sequence** | Runs *First*, then *Second* — in that order, always |

**Delay**, **Wait Until**, **Every** and **Tween Number** suspend the chain and resume it
later — the execution outlives the step that began it.

## Time

| Node | What it does |
|---|---|
| **Delta Time** | How long one step of the game lasts, in seconds |
| **Time** | How long this game has been running, in seconds |

Multiply a speed by **Delta Time** to make it "per second" instead of "per step".

## Object

Reaching, checking, creating and destroying objects.

| Node | What it does |
|---|---|
| **Self** | The object this component is attached to |
| **Get Object** | Hands on one of the objects this component was given |
| **Parent** | The object above this one in the hierarchy, or nothing |
| **Find By Tag** | The first object carrying this tag, in hierarchy order |
| **Is Overlapping** | Whether two objects are touching right now |
| **Is Valid** | Whether there is an object here at all |
| **Spawn** | Creates a copy of an object in the scene, beside the one it copies |
| **Spawn Prefab** | Creates an instance of a prefab, without the prefab existing in the scene |
| **Destroy** | Removes an object from the scene, along with everything under it |
| **Load Scene** | Asks for a different scene. The current one keeps running until it arrives |

## Properties

| Node | What it does |
|---|---|
| **Get Property** | Reads a property of an object |
| **Set Property** | Changes a property of an object |

These two reach *any* property — the object's own (`name`, `tag`, `layer`, `active`), or one
belonging to any component on it, including a property you declared on your own `.px`.

## Transform

Moving things. These are their own group because "I want to move my object" is the first
question anyone asks, and the answer is not under *Properties*.

| Node | What it does |
|---|---|
| **Translate** | Moves an object, relative to where it already is |
| **Rotate** | Turns an object, relative to the way it is already facing |
| **Scale** | Grows or shrinks an object, relative to the size it already is |
| **Set Position** | Puts an object at a position, whatever it was before |

## Animation

| Node | What it does |
|---|---|
| **Play Animation** | Plays an animation on this object, from its first frame |
| **Animation Finished** | Whether the animation on this object has reached its last frame |

## Audio

| Node | What it does |
|---|---|
| **Play Sound** | Plays a sound once. For music that keeps going, use an Audio Source |

## Values

Constants you type, and the two nodes that remember something across a scene change.

| Node | What it does |
|---|---|
| **Number** | A number you type |
| **Boolean** | A yes/no you set |
| **Text** | A piece of text you type |
| **Resource** | A resource of this project, as a value a property can take |
| **Get Session Value** | Reads a value that survives a change of scene |
| **Set Session Value** | Keeps a value across a change of scene |

## Text

| Node | What it does |
|---|---|
| **To Text** | Turns a value into text, so a Text Renderer can show it |
| **Join Text** | Puts two pieces of text end to end |

A score display is **To Text** into **Join Text** into **Set Property** on a
[Text](component-reference.md#text--textrenderer) component.

## Math

| Node | What it does |
|---|---|
| **Add** | `a + b` |
| **Subtract** | `a − b` |
| **Multiply** | `a × b` |
| **Divide** | `a ÷ b`. Dividing by zero answers `0` rather than failing |
| **Modulo** | The remainder of `a ÷ b`. By zero, `0` |
| **Min** | The smaller of two numbers |
| **Max** | The larger of two numbers |
| **Sin** | The sine of an angle, between −1 and 1 — how a wave is written |
| **Cos** | The cosine of an angle, between −1 and 1 |
| **Distance** | How far apart two objects are, in world units |
| **Direction** | Which way one object lies from another, as a step of length 1 |
| **Length** | How long a pair of numbers is, taken as a step |
| **Normalize** | Shortens or lengthens a pair of numbers to a step of length 1 |
| **Move Towards** | Steps a number towards another without ever passing it |
| **Angle** | Which way a pair of numbers points, in degrees |
| **Absolute** | The number without its sign |
| **Round** | The nearest whole number |
| **Floor** | The whole number at or below this one |
| **Ceil** | The whole number at or above this one |
| **Sign** | Which way a number points: −1, 0 or 1 |
| **Square Root** | The number that, multiplied by itself, gives this one |
| **Clamp** | Keeps a number between two bounds |
| **Lerp** | A number part way between two others |
| **Random** | A different number every time, between two bounds. *Max* is the number it stops just short of |

**Sin** and **Cos** take **degrees**, like everything else you type in the editor.

**Random** draws from the simulation's own stream, not from the browser's — which is what
makes a recorded game reproducible.

## Compare

All six answer yes or no.

| Node | What it does |
|---|---|
| **Greater Than** | `a > b` |
| **Greater Or Equal** | `a ≥ b` |
| **Less Than** | `a < b` |
| **Less Or Equal** | `a ≤ b` |
| **Equal** | Whether two values are the same |
| **Not Equal** | Whether two values are different |

## Logic

| Node | What it does |
|---|---|
| **Not** | Turns yes into no, and no into yes |
| **And** | Yes when both are yes |
| **Or** | Yes when either is yes |

## Debug

| Node | What it does |
|---|---|
| **Log** | Writes a value out where you can read it, without changing anything |

**Log** is the node to reach for when a graph is not doing what you expect — put it on the
wire you are unsure about.

---

## Not in the palette

Nodes exist for what the engine can actually do. There is no node for networking, no node for
saving a file, no node for reading the system clock or the URL, and no way to call JavaScript
from a graph. A graph reaches only what the simulation hands it — which is exactly what makes
the same graph runnable on a server.
