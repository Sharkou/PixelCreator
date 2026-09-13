# Conventions

## Language

- **Code, identifiers, comments, JSDoc: English.**
- **Repository documentation: English.** Every maintained Markdown document in this
  repository — user guide, developer guide, project memory, architecture specification,
  ADRs, migration and audit history, archive — is written so that an English-speaking
  contributor can read it without knowing any other language.
- **Commit messages: English.**
- **Technical identifiers are never translated.** `Object`, `Component`, `Transform`,
  `setProperty()`, `ResourceId` and the rest keep their exact spelling wherever they appear,
  including inside prose.

A literal string quoted *because it exists verbatim* in Legacy source or in recorded
behaviour is evidence, not prose: it stays exactly as it is, and the explanation around it
is in English.

**OBSERVED:** Legacy mixes two languages in its comments (« Si l'objet est sélectionné »,
« annule l'interdiction de drop »). In v2 the code is English without exception.

**`docs/developer/` does not duplicate the project memory.** It points into it: when a
subject is specified in `ARCHITECTURE.md` or in an ADR, the developer page links there
instead of restating it. That is what stops two copies of the same rule from drifting apart.

## Style

- JavaScript, ES modules. No TypeScript, no transpilation.
- `camelCase` for variables and functions, `PascalCase` for classes, lowercase filenames.
- One file = one class = one responsibility.
- Shallow directory hierarchies.
- Single quotes, 4-space indentation, semicolons — as in Legacy.

## JSDoc

Document constructors and public methods. No class-level JSDoc. Stay factual.

```js
/**
 * Move the object and resolve collisions
 * @param {number} x - Horizontal offset
 * @param {number} y - Vertical offset
 */
```

## Rules specific to Pixel Creator

### `Object` shadows the global

A module that imports `Object` **never** uses the statics of the global one:
`Object.keys`, `Object.values`, `Object.assign`, `Object.entries`.

**OBSERVED:** `legacy/src/core/renderer.js` calls `Object.values(scene.objects)` without
importing our `Object` — it works by luck. The same code in `scene.js`, which does import
it, would be a silent bug.

Use explicit helpers (`keysOf`, `valuesOf`) in the modules concerned.

### Writing a property: pick the right channel

```js
object.x = 100;                  // direct state mutation — no Operation
object.setProperty('x', 100);    // controlled mutation — Change + Operation
```

**`object.$x` does not exist in v2.** The Legacy sigil is gone.

`setProperty()` is not "the network method": it is the model's controlled path. The
Operation it produces can be validated, replicated, recorded in history, undone or shared —
depending on the context.

The distinction is not "replicated / not replicated" but **"simulation output" versus
"intent"**:

> **A Component never calls `setProperty()`. The Editor never writes without it.**

`self.x += vx` inside an `update()` is the result of a computation, not a decision: the
server is authoritative over its own simulation.

#### ⚠ `setProperty()` carries the same name in Legacy, with another meaning

| | Legacy | v2 |
|---|---|---|
| `object.x = v` | writes the state, emits `setProperty` | writes the state, emits a `Change` |
| `setProperty('x', v)` | writes `_x` directly, **does not replicate** | **controlled path** — `Change` + Operation |
| `$x` / `syncProperty('x', v)` | replicate | **do not exist** — replaced by `setProperty()` |
| Applying an incoming change | plain write on receipt | Operation with `origin: 'network'` |

Never reason by analogy with `legacy/` on this point.

#### The internal layers are not an API

Legacy stacks `object.x` → `_x` → `__x`. Those levels remain mere implementation
possibilities: **no user code, no component and no public v2 API may touch them or depend
on them.**

#### The failure mode to watch for

Calling `setProperty()` where `=` would have done costs traffic and one history entry.
Writing `=` where `setProperty()` was required produces a change that **neither replicates
nor undoes** — no error, no trace. The second case is the one that wastes time.

### Reading a transform in a hot loop

The `object.x` façade goes through two indirections (ADR-0002). In rendering and physics,
read the `Transform` once instead of the façade on every access:

```js
// no
self.x + other.x

// yes
const transform = self.getComponent('Transform');
transform.x + transform.y;
```

There is no `object.transform` accessor: `getComponent('Transform')` is the only form, as
for any other component.

### Naming in `editor/`

Editor classes **carry no prefix**: `Element`, `Window`, `Field`, `Viewport`, `Hierarchy`,
`Inspector`. Custom elements keep their mandatory `px-` prefix (`<px-field>`, `<px-window>`).
This is class naming, nothing more.

Three of those names shadow something else — `Element` and `Window` shadow DOM globals,
`Viewport` collides with the runtime export. **The `Object` rule applies verbatim:**

```js
globalThis.Object.keys(components)                      // never Object.keys
import { Viewport as Surface } from '../runtime/mod.js' // alias at import
```

**Never store state on a public property of an element.** `Element.prototype` already owns
`prefix`, `slot`, `id`, `title`, `part`… and some of them are read-only: `this.prefix = 'X'`
throws a `TypeError`. An element's state goes in a `#private` field.

### `#` private fields

Reserved for state that is **genuinely internal**, never for data the user has to see or
that has to be replicated.

**OBSERVED:** `Texture` declares `#scaleX`, `#scaleY`, `#scaleFromBox`; those properties
became invisible to the Property System, the Inspector and serialization, and the commit
that introduced them said nothing about it. See `migration/LEGACY_ANALYSIS.md` §2.3.

### Rendering

- Canvas: game visuals only.
- DOM: interface only.
- Never mix the two responsibilities in one module.

### Layer dependencies

```
editor/  ──►  runtime/  ──►  core/
network/ ──►  core/
core/    ──►  (nothing)
```

The Core never imports the DOM (`window`, `document`), nor `runtime/`, `editor/` or
`network/`. An automated test checks it.

## Components

```js
export class MyComponent {
    static schema = { speed: { type: 'number', default: 2, min: 0 } };  // optional
    static icon = 'fas fa-gamepad';                                     // optional
    static category = 'physics';                                        // optional

    constructor(speed = 2) { this.speed = speed; }

    update(self, ctx) { }
    draw(self, renderer) { }
}
```

- `self` is **passed as an argument, never stored** — otherwise it creates a cycle, and both
  serialization and replication break.
- Components are JSON-serializable: no functions, no DOM references, no references to other
  objects (use ids).
- A component never reads an input or rendering singleton: it receives `ctx` and `renderer`.

## Documentation

Always label the nature of a claim:

- **OBSERVED IN LEGACY** — verified in the code
- **HISTORICAL DECISION** — a deliberate choice made in the past
- **V2 PROPOSAL** — not implemented
- **OPEN QUESTION** — decision pending

Never present a proposal as existing behaviour.

**OBSERVED:** the earlier `docs/architecture.md` and `docs/documentation.md` describe
intentions the code contradicts ("The editor never mutates engine state directly" — the
Editor writes `scene.current.$x = …` directly). That is exactly the mistake this convention
exists to prevent.

## Git

- Messages in English, prefixed: `feat:`, `fix:`, `refactor:`, `docs:`, `test:`.
- Never commit inside `legacy/`: it is a read-only archive.
- Never commit the private server into the public repository.
