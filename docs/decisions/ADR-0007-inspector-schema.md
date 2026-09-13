# ADR-0007 — A schema-driven Inspector, reflective as a fallback

- **Status:** **accepted** (2026-08-12)

## Observed context

**Legacy's Inspector is already generic.** Contrary to what you might fear,
`editor/windows/properties.js` contains **no** `if (component === 'Health')`. It reflects over
the object and derives the widget from the value's type:

| Value | Widget produced |
|---|---|
| `number` | `<input type="text">` |
| `boolean` | `<input type="checkbox">` |
| a `string` starting with `#` | `<input type="color">` |
| a `string` | `<input type="text">` |
| a `Color` instance | `<input type="color">` |
| any other object | `<input type="text">` |

The schema is therefore **implicit, inferred from the value at that instant**. It is elegant and
it covers the common cases with no configuration.

### Measured limits

1. **A hard-coded blacklist**: `id`, `uid`, `scale`, `static`, `type`, `active`, `visible`,
   `lock`, `image`, `parent`, `components`, `childs` — a `switch` that every new field forces you
   to edit.
2. **Truncated decimals**: `parseInt(value, 10)` when displaying a `number`. A speed of `0.4`
   displays as `0`.
3. **Colour detection by value**: a colour initialized to `''` becomes a text field; a text
   starting with `#` becomes a colour picker.
4. **No constraints**: no min, no max, no step, no unit, no tooltip.
5. **Dead branches**: `case 'TODO Range'`, `'TODO Array'`, `'TODO Enumeration'`, `'TODO Image'`,
   `'TODO Button'` are compared against `value.constructor.name` and can never match.
6. `#private` fields are invisible (see ADR-0003).
7. The only genuinely per-component place is the icon `switch` in `appendName()`.

## Decision

A component **may** declare a static schema. The Inspector uses it if it exists and falls back on
the current inference otherwise.

```js
export class Health {
    static schema = {
        max:     { type: 'number', default: 100, min: 0 },
        current: { type: 'number', default: 100, min: 0, max: 'max' }
    };
    constructor(max = 100) { this.max = max; this.current = max; }
}
```

Contemplated types: `number`, `int`, `boolean`, `string`, `color`, `enum`, `range`, `vector2`,
`resource` (image, sound, script, graph), `object`, `array`, `action` (a button).

Attributes: `default`, `min`, `max`, `step`, `label`, `tooltip`, `unit`, `hidden`, `readonly`,
`group`.

> **Settled by ADR-0023 (2026-08-14).** That list asked two questions with one word. It is split:
> the Core owns **`PropertyType`** — eight members, the shape of the value: `number`, `int`,
> `boolean`, `string`, `color`, `enum`, `resource`, `array` — and the Editor **derives**
> `FieldKind` from it, the question of the control.
>
> `range` is **derived** from a `number` bounded at both ends, so no component needs to declare
> it. `readonly` is a display fallback, not a shape of value. `object` is **removed** (no
> consumer, no validation, no meaning for replication), `vector2` is unnecessary — the Inspector
> already pairs `x`/`y` — and `action` is not a property: a button is a command.

## The Inspector's `Object` section

**Recorded on 2026-08-14** — the behaviour existed in the code without any ADR documenting it.

The Inspector renders, **above the Components**, an intrinsic `Object` section, fed by a
hand-written list (`editor/inspector/schema.js`, `objectFields()`): `name`, `tag`, `layer`,
`active`.

> **`Object` is not a Component**, and `name` / `tag` never become Components stored in
> `object.components` (ADR-0001, ADR-0002). Making Components an ordered collection (ADR-0018)
> **does not touch** that section: it is not in that collection.

- `visible` and `lock` are absent by design: the Hierarchy row carries them, where they are one
  click away for every object at once rather than one at a time;
- `id` is absent because a creator has no use for it, and a panel that opens on a random string
  looks like a debugger;
- editing goes through `Object.setProperty()`, which produces an Operation whose target is
  `{ object: id, component: null }`. **That `component: null` is how the format expresses "an
  intrinsic property of the Object"**, and it is what makes editing `name` replicable and
  undoable like the rest.

### The reflective fallback is kept, not deprecated

A component written by a beginner, with no `schema`, must keep displaying correctly. **That is a
requirement, not a tolerance.** The schema is there to enrich (constraints, enumerations,
resources), never to authorize.

### What is fixed along the way

- `parseInt` → formatting that preserves decimals;
- the blacklist becomes `hidden: true` in the schema of the properties concerned, or an explicit
  convention for system fields;
- the `TODO *` branches are replaced by real types;
- the icon `switch` becomes `static icon = 'far fa-heart'` on the component.

## Consequences

### Positive

- A component describes its interface where it is defined — one place to read.
- The Inspector has no knowledge of concrete components any more.
- The schema also serves validation, default values, serialization, and later an AI trying to
  understand a component.

### Negative

- Two code paths to maintain (schema and reflection). Accepted: the fallback is short and it
  already exists.
- The schema can drift from the implementation (`static schema` declares `speed`, the constructor
  renamed it). Mitigation: a development test compares the schema's keys against a fresh
  instance's properties.

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **Stay with pure reflection** | It allows neither constraints, nor enumerations, nor resource fields. Legacy's `TODO`s show the need had already been identified. |
| **A mandatory schema** | It breaks every existing component and makes writing a simple component heavier — against the beginner goal. |
| **Decorators** | No stable native support; it would force a build. |
| **Inference from TypeScript types** | The project is plain JavaScript; types disappear at runtime, and the Inspector is a runtime tool. |
