# Tests

## IMPLEMENTED — state as of 2026-09-12

```bash
tools/test.sh                  # 2300 tests (node --test, zero dependencies)
node tools/layers/run.js       # layer rules + dead imports
node tools/parity/run.js       # 39 scenarios captured from Legacy
node tools/check-css-literals.js
node tools/check-boot.js       # every module the entry points reach loads
node tools/check-exports.js    # every named import designates an export that exists
```

The test count is given to convey the order of magnitude, not as a target: what matters is what
they protect, and the list of contracts is below.

A unit test lives next to the module it covers (`x.js` / `x.test.js`), and needs neither a DOM
nor a browser: what requires a DOM is verified in the browser and noted in
`../migration/MIGRATION_STATUS.md`, and what can be made pure is — the geometry of a Hierarchy
drop lives in `editor/windows/drop.js` for exactly that reason.

**`tools/layers/run.js` checks two things as of 2026-08-17**: the direction of dependencies
between layers, and the fact that a static import designates a file that exists. The second was
added after an `export … from './windows/dock.js'` survived two commits past the file's deletion,
making `editor/mod.js` unloadable without any unit test being able to see it. Known dead imports
that cannot be fixed — `legacy/` has two, pointing at files that were never committed — are
declared in `rules.js` and reported without failing the check.

## OBSERVED (Phase 0 — Legacy)

**There are no tests at all.** No framework, no test file, no CI. `legacy/plugins/test.js` is an
example component, not a test.

The direct consequence: several bugs live in the code undetected — broken offline single-player,
`Collider` referencing a `Scene` it never imported, an example plugin calling an instance method
statically, a compiler that systematically throws a `ReferenceError`. See `../MIGRATION.md` §4.

It is also what makes the migration risky: **nothing will tell you that a property has stopped
being propagated.**

## V2 PROPOSAL

### Constraints

- Zero runtime dependencies. Test tooling is a development dependency, which is acceptable, but
  it must stay minimal.
- The Core must be testable **without a DOM** — that is also the guarantee that it runs on the
  server.
- The tests must also be runnable in a browser, for the Editor.

### Priorities — in this order

**1. Property System** (risk R1, the highest)

- `object.x = v` emits a `Change` `{ prop, value, previous, origin }` and **no Operation**
- `object.setProperty('x', v)` emits a `Change` **and** an Operation
- a property **added after construction** is reactive
  *(fails on Legacy — that is the regression being fixed)*
- an applied Operation with `origin: 'network'` produces no outgoing Operation
- hierarchical propagation does move the children
- **`_x` / `__x` are exposed by no public API**
- **a parity harness**: run the same sequence of writes on Legacy and on v2, and compare the
  sequence of emitted events, ordering included

> **The harness must encode the semantic mapping** (risk R14):
>
> | Legacy | v2 |
> |---|---|
> | `obj.x = v` | `obj.x = v` |
> | `obj.$x = v` / `obj.syncProperty('x', v)` | `obj.setProperty('x', v)` |
> | `obj.setProperty('x', v)` | *a Legacy-only probe* — no v2 equivalent |
> | a plain write on network receipt | `applyOperation({ origin: 'network' })` |
>
> **No v2 scenario uses `.$x`** — the syntax is gone. Without this mapping, the harness would
> report false regressions.

**1 bis. The write guard** (risk R15)

In development mode, a plain `=` write in an `editor` context emits a warning. Test that the
guard fires, and that it is **inert in production**.

**2. The layer dependency rule**

A static test: no file in `core/` imports `runtime/`, `editor/` or `network/`, nor references
`window` / `document`.
*(It fails today: `renderer.js` imports `editor/system/dnd.js`.)*

**3. Importing the Core outside a browser**

Load `core/mod.js` in Node or Deno, with no DOM. This is the test that protects the project's
most valuable asset: the Core shared between client and server (risk R3).

**4. Transform / façade identity** (risk R5)

`object.x === object.getComponent('Transform').x` after a write through the façade, through the
component, through the network, through the Inspector.

**5. Serialization**

- a `serialize` → `deserialize` round trip with no loss
- no `_`/`$` duplicates
- children referenced, **never nested twice**
- payload size under control (a guard against a regression of the factor of 3)

**6. Components**

- `update` / `draw` called only if `active`
- `draw` never called on the server
- an error in one component does not stop the loop (the Legacy behaviour is kept)
- a component with no `schema` displays correctly in the Inspector (the reflective fallback)

**7. Editor — the most important test for the user**

**Letter-by-letter editing**: typing `P`, `Pl`, `Pla`, `Play` in one field updates every other
view **except** the one that has focus. This is the test that covers risk R2.

**8. Network**

- a `Change` produces the expected `Operation`
- no echo back to the sender
- `previous` allows the earlier state to be reconstructed (the basis of undo)

### Regression tests against Legacy

`legacy/` stays runnable. For behaviours that are hard to specify, the reference is Legacy's
observed behaviour — hence the parity harness in point 1.

### Performance

The Property System benchmark already exists (`../migration/LEGACY_ANALYSIS.md` §2.4). It must
be replayed in CI with a threshold: reads ≤ the Legacy baseline, writes strictly better.

Add a rendering benchmark on a scene of ≥ 500 objects, before and after the introduction of the
`Transform` façade (risk R8).

### What we do not test

- Pixel-by-pixel rendering — too brittle for the value it brings.
- The UI's appearance.
- The private server, from the public repository.
