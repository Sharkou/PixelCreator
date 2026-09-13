# Extending Pixel Creator

The seams the architecture deliberately leaves open, and how to work through them. Each recipe
lists **every** file you have to touch — in this codebase that list is short on purpose, and a
recipe that grew long would be a design problem rather than a documentation problem.

Read [CONVENTIONS.md](../CONVENTIONS.md) first if you have not.

---

## Add a component (in JavaScript)

A component is a class. There is no base class to extend and no interface to declare.

### 1. Write it

`src/runtime/components/health.js`, or under the domain folder it belongs to:

```js
export class Health {

    /**
     * The schema drives the Inspector, validation and drag-and-drop (ADR-0007).
     * Optional — a component without one still renders, reflectively.
     */
    static schema = {
        current: { type: 'number', default: 100, min: 0 },
        max: { type: 'number', default: 100, min: 1 },
        invulnerable: {
            type: 'boolean',
            default: false,
            // Only where the name does not answer for itself.
            tooltip: 'Nothing can reduce Current while this is on'
        }
    };

    constructor(current = 100, max = 100) {
        this.current = current;
        this.max = max;
        this.invulnerable = false;
    }

    /**
     * @param {object} self - The Object this component is on. PASSED IN, never stored
     * @param {object} ctx - The step context: time, deltaTime, scene, input, random, …
     */
    update(self, ctx) {
        // …
    }
}
```

Non-negotiable rules:

- **`self` is passed in, never stored.** Storing it makes a cycle, and serialization and
  replication both break.
- **The component must be JSON-serializable.** No functions, no DOM references, no references
  to other objects — use ids.
- **Never read a global.** Input, the renderer, audio, randomness and resources all arrive on
  `ctx`. A component that reaches for a singleton cannot run on a server.
- **A component never calls `setProperty()`.** `self.x += vx` in an `update()` is a result of
  simulation, not an intention.

Available property types: `number`, `int`, `boolean`, `string`, `color`, `enum`, `resource`,
`objectref`, `array`. A `number` with both `min` and `max` renders as a slider; a `resource`
may narrow itself with `kind` and `mime`; an `objectref` holds an Object identity and is what
makes a drop from the Hierarchy legal.

### 2. Ship it

`src/runtime/builtins.js` — add the class to `BUILT_IN`, in the order a menu should list it.

### 3. Present it

`src/editor/registry.js` — add a row to `SHIPPED`:

```js
Health: { category: 'Scene', label: 'Health' },
```

`registry.test.js` **fails** if a type in `BUILT_IN` has no row here, so this is not optional.
Add a `note` only if the label does not answer for itself.

### 4. Give it a glyph

`src/editor/ui/icons.js` — add an entry to `COMPONENT_ICONS`. A test checks that every shipped
type has one. If no existing glyph fits, add a path to `PATHS`.

### 5. Test it

`src/runtime/components/health.test.js`, beside the module. No DOM.

Then run the [verification suite](testing.md).

---

## Add a graph node

A node type is **data**: a declaration, plus one function.

### 1. Declare it

`src/core/graph/standard.js` — add an entry to `STANDARD_NODES`:

```js
{
    type: 'math.wrap',            // stable identity, written into every graph that uses it
    label: 'Wrap',                // what a creator reads
    category: 'Math',             // one of NODE_CATEGORIES
    keywords: ['modulo', 'loop', 'cycle'],   // what else a creator might type
    tooltip: 'Keeps a number inside a range, coming back round at the ends',
    inputs: [
        data('value', PropertyType.NUMBER, 'Value', 0),
        data('min', PropertyType.NUMBER, 'Min', 0),
        data('max', PropertyType.NUMBER, 'Max', 1)
    ],
    outputs: [data('value', PropertyType.NUMBER, 'Value')],
    evaluate: io => ({ value: wrap(io.input('value'), io.input('min'), io.input('max')) })
}
```

- A **data** node declares `evaluate(io)` and returns `{ [portId]: value }`.
- A **flow** node declares `execute(io)` and returns the id of the next flow port, `null`, or
  an array of port ids to run in order.
- `inputs` and `outputs` may be a **function** `(node, context) => ports` when the shape
  depends on a parameter — that is how `Get Property` reshapes itself once you have chosen a
  component.
- `params` are values typed into the node itself, in the ADR-0007 property shape.

Nothing else registers it: `registerStandardNodes()` installs the whole catalogue, and the
editor and the runtime both read the same one.

### 2. Respect the two hard rules

- **Purity.** A node may reach **nothing** global. No `Math.random()`, no `Date.now()`, no
  `crypto.randomUUID()`. Everything a node may need is on `io.ctx`: `time`, `deltaTime`,
  `scene`, `input`, `random`, `createObjectId`, `collisions`, `audio`, `resources`, `session`,
  `requestScene`. A test enforces this — a node that read the clock would stop the game being
  replayable.
- **One node per intention** ([ADR-0040](../decisions/ADR-0040-one-node-per-intention.md)). If
  you find yourself adding a mode parameter that changes what a node *is*, that is two nodes.

### 3. Where it goes in the menu

`NODE_CATEGORIES` in `src/core/graph/nodes.js` is the reading order. A category you invent
takes its place after the known ones rather than being flattened into `Other` — but read the
long comment at the top of that array before inventing one: each existing shelf is justified by
a beginner's question, and "where would someone look for this?" is the only argument that
counts.

A category icon goes in `NODE_CATEGORY_ICONS` (`src/editor/ui/icons.js`); a node may override
it with its own `icon`.

### 4. Test it

`src/core/graph/nodes.test.js` and `src/core/graph/standard.js`'s neighbours already hold the
patterns. A node is testable headlessly through `interpretGraph()` — see
`src/runtime/scripting/interpreter.test.js`.

---

## Add a resource kind

1. `src/project/resource.js` — add to `ResourceKind`, with a comment saying why it is a kind
   rather than a flag on an existing one.
2. A payload format in `core/` if it has one — `core/tileset.js` and `core/animation.js` are the
   models to copy: a `createX()` that answers a plain JSON-safe object, an `xOf()` that refuses
   a payload from a version this build does not know, and a `FORMAT` constant.
3. `src/editor/project/commands.js` — a row in `RESOURCE_KINDS`: `id`, `kind`, `label`,
   `category`, `create()`, and `pick` when the gesture needs a file first.
4. `src/editor/inspector/resource.js` — what the Inspector shows: `fields` (read-only),
   `edits` (typed into), `write`, and `content` if there is something to look at.
5. `src/editor/ui/icons.js` — `RESOURCE_ICONS`.
6. `src/editor/dnd/rules.js` — only if dropping it somewhere should mean something.

Do not add a menu entry that creates something a creator cannot then use. A resource that
could only ever answer `null` is worse than a missing menu row.

---

## Add a drag-and-drop rule

`src/editor/dnd/rules.js`, `RULES` — an ordered list, first match wins.

```js
{
    id: 'thing-to-place',
    accepts: (payload, target) => payload.kind === DragKind.RESOURCE
        && target.zone === DropZone.SCENE,
    refuses: (payload, target) => (already(target) ? 'It is already there.' : null),
    describe: payload => `Place ${payload.resource.name} in the scene`,
    perform: (payload, target, context) => ({ /* what it did */ })
}
```

Four obligations:

- **`describe()` is not optional.** A drop says in words what it will do, before the release.
- **A refusal says why**, and names the place that *would* take it when there is one. A refusal
  a creator cannot act on is half a refusal.
- **Never guess.** A property declares what it accepts (`acceptsResource`, `acceptsObject`); a
  drop that infers intent from a type is the failure mode these rules were written against.
- **A drop may ask a question** when the gesture genuinely has two meanings — it opens the same
  menu every other creation in the editor opens
  ([ADR-0052](../decisions/ADR-0052-a-drop-may-ask-a-question.md)).

---

## Add or change an editor window

Windows are native Web Components. Classes carry no prefix; custom elements keep the mandatory
`px-` one.

`src/editor/windows/notes.js`:

```js
import { Element, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import '../ui/window.js';

export class Notes extends Element {

    static styles = sheet(`
        :host { display: block; }
        px-window { height: 100%; }
    `);

    connectedCallback() {
        if (this.shadowRoot.childElementCount > 0) return;
        this.shadowRoot.append(el('px-window', { label: 'Notes', icon: 'document' }, /* … */));
    }
}

customElements.define('px-notes', Notes);
```

To make it a panel a creator can show and hide:

| File | Change |
|---|---|
| `src/editor/layout.js` | Add it to `PANELS`, with whether it starts shown. Add a size to `SIZES` only if it owns a seam |
| `src/editor/editor.js` | Add it to `TOGGLES`, **in the order it sits on screen**, and `import './windows/notes.js'` |
| `src/editor/mod.js` | Export the class |
| `src/editor/ui/icons.js` | A glyph, if it needs a new one |

Rules that will catch you out:

- **Never put state on a public property of an element.** `Element.prototype` already owns
  `prefix`, `slot`, `id`, `title`, `part` — and some are read-only, so `this.prefix = 'X'`
  throws a `TypeError`. Element state goes in a `#private` field.
- **Styles are template literals**, so `check-css-literals.js` has an opinion about stray
  backticks.
- **Extract the arithmetic.** The geometry of a drop, the placement of a port, the hit test —
  those go in their own module with their own test. What is left in the window is the gesture.
  `editor/windows/drop.js` and `editor/graph/view.js` are the precedents.
- **Own your seam.** The line between two panels is the `<px-splitter>` between them. A
  `border-top` on the panel as well gives you two parallel lines.
- **A shell is allowed, if it says so.** The Timeline is an empty panel that states what is
  missing. Drawing a fake ruler with fake keyframes is the thing this project spends its time
  undoing.

## Add an Inspector field kind

`src/editor/inspector/schema.js` — `FieldKind`, `fieldKindFor()` and `fieldFor()`. A field kind
is **derived** from a `PropertyType`, never declared independently
([ADR-0023](../decisions/ADR-0023-property-types.md)): the core owns the type, the editor owns
how it is drawn. Adding a control without a type behind it means validation, the graph port and
the field can disagree.

---

## Write a component without touching the repository

This is the seam that matters most, and it needs no code at all: a creator makes a `.px`, the
project layer registers it with `components.register(defineComponent(definition))`, and from
there **nothing can tell it apart** from a shipped type. It appears in Add Component, its
declared properties become Inspector fields, its graph is its behaviour, and it can declare its
own menu category.

If a feature can be built that way instead of in `src/`, build it that way.

---

## Before you open a pull request

- Run the [six checks](testing.md).
- Validate in the browser if the change is visible, and say what you checked.
- If your change reverses, weakens or replaces a documented architectural decision, it needs an
  [ADR](decisions.md) — say so in the pull request rather than doing it quietly.
