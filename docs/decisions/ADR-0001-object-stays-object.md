# ADR-0001 — `Object` stays `Object`

- **Status:** accepted (a project constraint)

## Context

Modern engine terminology uses `Entity`. Legacy uses `Object`, everywhere: code, network
protocol, documentation, UI ("Add Object"), and the users' vocabulary.

## Decision

The term stays **`Object`**. No rename to `Entity`, now or later.

The product vocabulary is fixed:

```
Project → Scene → Object → Component → Property
```

## Rationale

- The term is visible to the end user. Renaming it changes the product, not just the code.
- It travels through the network protocol and through saved projects.
- It is more approachable than `Entity` for a beginner audience, which is the target.
- There is no technical benefit — only alignment with a convention from other engines.

## Practical consequence

`Object` shadows JavaScript's global `Object` in the modules that import it. Legacy already
lives with that, including where the two cross:

```js
// legacy/src/core/renderer.js — here Object is the global, not ours
for (let obj of Object.values(scene.objects).sort(...))
```

`renderer.js` does not import our `Object`, so `Object.values` works. But
`legacy/src/core/scene.js` **does import** ours — an `Object.values()` there would be a silent
bug.

**v2 rule:** a module that imports `Object` never uses the global's statics (`Object.values`,
`Object.keys`, `Object.assign`). Use dedicated helpers. A lint test checks the rule.
