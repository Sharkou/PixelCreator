# Pixel Creator — instructions for AI coding assistants

Pixel Creator is a **browser-based 2D game editor and engine**, written in plain JavaScript.
Version 2 is a full rewrite living in `src/`; the previous engine is kept **read-only** in
`legacy/`.

`.agents/rules/` holds the same guidance in a tool-neutral form. Keep the two in step.

## Read before changing anything

| Document | Why |
|---|---|
| [`docs/developer/README.md`](../docs/developer/README.md) | The developer index, and the four rules that catch newcomers |
| [`docs/CONVENTIONS.md`](../docs/CONVENTIONS.md) | Code and documentation rules. Several are checked automatically |
| [`docs/developer/architecture.md`](../docs/developer/architecture.md) | Which ADR settles which subject |
| [`docs/PROJECT_MEMORY.md`](../docs/PROJECT_MEMORY.md) | The register of all 72 ADRs |
| [`CONTRIBUTING.md`](../CONTRIBUTING.md) | Branches, commits, verification |

## The source of truth

**The current implementation is the source of truth for what the system does.** ADRs and
`docs/` describe intended contracts and the reasoning behind them.

If the implementation and the documentation disagree, **say so**. Do not silently change one to
match the other.

`docs/reference/`, `docs/archive/`, `docs/migration/` and `docs/audit/` are **historical**.
`docs/reference/` in particular documents the *Legacy* API and is not the v2 API — never cite it
as current.

## Constraints that are not negotiable

1. **No dependencies, no build step.** No npm packages, no `package.json`, no transpiler, no
   framework, no TypeScript. Native ES modules, Web Components, DOM, classes.
2. **Layer direction.** `editor/` and `preview/` are the two tops of the graph; each may reach
   `project/`, `runtime/` and `core/`, and **neither may reach the other**. `core/` imports
   nothing — no DOM, no runtime, no editor, not even `project/`. `node tools/layers/run.js`
   enforces it.
3. **`Object` shadows the global.** A module importing our `Object` reaches the real global
   through `globalThis.Object`. Same for `Element`, `Window` and `Viewport` in the editor.
4. **Two ways of writing a property.** `object.x = v` is a simulation result; `setProperty()` is
   an intention and produces an Operation. A component never calls `setProperty()`; the editor
   never writes without it. Getting it wrong yields a change that does not replicate and does
   not undo, silently.
5. **`legacy/` is read-only.** Read it, search it, compare against it. Never refactor, tidy,
   modernise, delete from, or commit into it.
6. **The server is private and not in this repository.** Never add networking code speculatively.
7. **Never invent a feature.** No fake panel, no placeholder that pretends to work, no menu
   entry that creates nothing. An empty panel stating what is missing is correct; a fake ruler
   with fake keyframes is not. This is a documented principle
   ([ADR-0054](../docs/decisions/ADR-0054-say-what-is-true.md)), and the codebase is consistent
   about it.

## Technology

- JavaScript, ES modules, 4-space indent, single quotes, semicolons.
- HTML and CSS for the editor UI; styles are template literals inside modules.
- Canvas 2D for game rendering; SVG for the visual-scripting graph canvas.
- Web Components for panels: classes carry no prefix, custom elements keep `px-`.
- JSDoc on constructors and public methods, never at class level.
- One file = one class = one responsibility. A test lives beside its module: `x.js` /
  `x.test.js`.

## Working method

```
inspect → locate → read the relevant tests and ADRs → smallest correct change → verify → stop
```

- Prefer the smallest change that correctly solves the problem.
- Do not refactor unrelated code. Do not create speculative abstractions. Do not rewrite working
  subsystems for theoretical cleanliness.
- Adapt existing systems rather than building parallel ones.
- **Do not reverse, weaken or replace a documented architectural decision** because another
  design looks more conventional. If a change appears to need a decision that is not already
  recorded, stop and explain the trade-off.

## Verification

Run all seven before claiming a change works:

```bash
tools/test.sh
node tools/layers/run.js
node tools/check-boot.js
node tools/check-exports.js
node tools/check-css-literals.js
node tools/parity/run.js
node tools/check-links.js
```

There is **no `package.json`** — do not look for npm scripts.

### Browser validation

For UI, interaction, rendering or runtime changes, validate in the browser, proportionally:

1. `tools/dev-server.sh 8080 .`
2. open `http://localhost:8080/src/editor/index.html`
3. attach `console` and `pageerror` listeners
4. exercise **the behaviour directly concerned**
5. if it works with no relevant errors, stop
6. if it fails, fix the smallest directly related issue and retest

Never expand a local problem into an architectural refactor.

## Git

- Do not commit, push, or open a pull request unless explicitly asked.
- Never reset, rebase or force-push without explicit authorisation.
- Preserve unrelated existing modifications.
- Commit style: `feat(scope): …`, `fix(scope): …`, `refactor:`, `docs:`, `test:` — English,
  imperative.

## Reporting

Be concise and concrete. Say what you changed, which checks you ran and what they reported, what
you validated in the browser, and what remains uncertain. Never claim a change works without
having verified it.
