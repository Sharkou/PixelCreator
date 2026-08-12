# Behavioural parity harness

Captures Legacy's real behaviour as replayable scenarios, so that **exactly the same
ones** can later be run against the v2 Core to see what diverges.

This is step 1 of `docs/MIGRATION.md` §5. It comes before any migration: risk R1
(a property silently stops being propagated) has no other detector, and the reference
disappears the moment `core/` is rewritten.

**`legacy/` is never modified.** The harness imports it through an ESM resolution hook.

---

## Usage

```bash
node tools/parity/run.js
```

```bash
node tools/parity/run.js --update
```

```bash
node tools/parity/run.js --target=v2
```

```bash
node tools/parity/run.js --json
```

- no option: runs the scenarios against Legacy and compares them to the reference
- `--update`: records the current result as the reference (`baseline/legacy.json`);
  only valid for the `legacy` target
- `--target=v2`: once the v2 Core exists (today it fails with an explicit message)
- `--json`: raw output, for CI

Exit codes:

| Code | Meaning |
|---|---|
| `0` | no unexpected divergence (also used by `--update` and `--json`) |
| `1` | at least one unexpected divergence, execution error, or missing scenario |
| `2` | the target itself is unusable: unknown name, adapter failure, or `--update` on a non-legacy target |

---

## Reading the report

The run currently covers **39 scenarios**.

```
  Parity harness — target "legacy"
  reference: baseline/legacy.json

  ✓ Identical behaviour
    component/add [contract]
    component/private-fields-invisible [legacy bug]
    ...

  39 identical  0 intentional  0 problems
```

| Section | Meaning |
|---|---|
| ✓ **Identical behaviour** | The target reproduces the reference |
| ~ **Intentional divergence** | Expected and justified difference — never a failure |
| ✗ **UNEXPECTED divergence** | Regression: a contractual behaviour changed |
| ! **Execution error** | The scenario threw |
| + **New scenario (no reference)** | Not in the baseline yet |
| - **Scenario missing from the reference** | Present in the baseline, absent from this run |

A divergence only counts as intentional when it is **declared**: either the scenario
carries the `quirk`/`bug` status, or `mapping.js` gives the reason.

### A scenario's status

This is the mechanism that stops a Legacy defect from becoming a v2 contract.
It is printed next to each scenario id.

| Status | Printed tag | Meaning |
|---|---|---|
| `contract` | `[contract]` | v2 **must** reproduce this behaviour |
| `quirk` | `[quirk]` | Legacy-specific; v2 is free to differ |
| `bug` | `[legacy bug]` | Legacy is wrong; v2 must **not** reproduce it — matching would be the failure |

---

## Legacy → v2 mapping

The trickiest point: **`setProperty()` exists on both sides with a different meaning**,
and `$x` no longer exists in v2 (ADR-0003). Scenarios are therefore written in a neutral
vocabulary that each adapter translates.

| Neutral API | Legacy | v2 |
|---|---|---|
| `writeDirect` | `object.x = v` | `object.x = v` |
| `writeControlled` | `object.syncProperty("x", v)` | `object.setProperty("x", v)` |
| `applyRemote` | `object.x = v` (what `Network.update` does) | `applyOperation({ origin: "network" })` |
| `probe.dollarWrite` | `object.$x = v` | **none** — syntax removed |
| `probe.legacySetProperty` | `object.setProperty("x", v)` | **none** — opposite meaning |
| `probe.internal` | `object._x` / `object.__x` | **none** — internal layers |

**No v2 scenario uses `.$x`.** The probes exist to observe Legacy, never to define a
target. This table is also declared in code, in `mapping.js` (`API_MAPPING`).

---

## What is recorded

Three streams, kept separate because that distinction is precisely what v2 is about:

| Stream | Content |
|---|---|
| `notifications` | What an Editor view reacts to |
| `operations` | Controlled mutations — replicable, undoable |
| `network` | The payloads actually passed to `Network.send()` |

For Legacy, the `operations` stream is reconstructed from the events `Network.sync()`
actually subscribes to — that set **is** Legacy's implicit operation list
(`docs/migration/LEGACY_ANALYSIS.md` §8.2).

Random identifiers are replaced with stable labels (`Player`, `Child`, `internal`) so
that the reference does not change from one run to the next.

---

## Structure

```
tools/parity/
├── README.md            this file
├── run.js               single entry point
├── mapping.js           Legacy → v2 mapping + declared divergences
├── env/resolver.mjs     ESM hook: '/src/…' → legacy/src/…
├── env/globals.js       minimal window, without document
├── core/recorder.js     captures the three streams, normalizes ids
├── core/runner.js       runs a scenario, isolates System.events
├── core/compare.js      diff and classification
├── core/report.js       console report
├── adapters/legacy.js   drives the Legacy Core
├── adapters/v2.js       explicit stub
├── scenarios/index.js   scenario list
├── scenarios/*.js       scenarios, target-agnostic
└── baseline/legacy.json recorded reference
```

### How Legacy runs outside a browser

Most modules guard their top-level DOM code with `if (window.document)`. Providing a
`window` **without** a `document` therefore loads the Core cleanly and registers no
browser listener.

One exception found: `gamepad.js:211` tests `typeof window !== 'undefined'` instead of
`window.document`, and so calls `window.addEventListener`. Hence the empty functions in
`env/globals.js`. Two guards for the same intent — worth unifying in v2.

---

## Adding a scenario

```js
{
    id: 'domain/behaviour',
    title: 'Descriptive sentence',
    status: STATUS.CONTRACT,
    targets: ['legacy', 'v2'],      // optional, both by default
    needsProbe: false,              // true if the scenario uses api.probe
    volatile: [],                   // fields excluded from the comparison
    run(api, recorder) {
        const o = api.createObject({ name: 'Player', x: 0 });
        recorder.clear();           // observe only what follows
        api.writeControlled(o, 'x', 100);
        return { x: api.read(o, 'x') };
    }
}
```

Register it in `scenarios/index.js`, then run `node tools/parity/run.js --update` to
record the reference.

`recorder.clear()` after setup is almost always wanted: constructing an `Object` on its
own emits **19 notifications** (see `property/construction-emits-every-property`).

`volatile` is for genuinely time-dependent behaviour — the `Network.sync()` throttle
uses `delay = 0`, so the number of messages actually emitted depends on the millisecond.
The listed field is replaced with `<not compared: time-dependent>` in the result. The
operation stream, being synchronous and deterministic, is what the assertion rests on.

---

## What the harness has already revealed

Findings obtained by running Legacy, not by reading it:

| Finding | Scenario |
|---|---|
| `copy()` from a live `Object` sets `components`, `childs` and `image` to `undefined` | `scene/copy-from-live-object-wipes-containers` |
| `instantiate()` throws as soon as the source carries a component | `scene/instantiate-throws-with-components` |
| `copy()` from plain JSON works — hence a healthy network heartbeat | `scene/copy-from-plain-json-works` |
| Constructing an `Object` emits 19 notifications | `property/construction-emits-every-property` |
| 57 enumerable keys for 19 public properties | `property/enumerable-pollution` |
| Legacy's `setProperty()` produces **no** operation | `property/legacy-set-property-path` |
| 4 keystrokes → 4 operations, no batching | `network/no-batching` |
