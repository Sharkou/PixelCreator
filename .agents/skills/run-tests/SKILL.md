---
name: run-tests
description: Runs and interprets Pixel Creator tests after implementation or when diagnosing a regression. Use when verification, test failures, regression analysis, or test-suite status is the primary task.
---

# Run Pixel Creator Tests

## Procedure

1. Use the project's real commands. There is **no `package.json`** and no npm script:

   ```bash
   tools/test.sh                     # unit tests (node --test), optionally with a pattern
   node tools/layers/run.js          # layer rules + dead imports
   node tools/check-boot.js          # every module the entry points reach loads
   node tools/check-exports.js       # every named import resolves to an export
   node tools/check-css-literals.js  # no stray backtick in a CSS literal
   node tools/parity/run.js          # 39 scenarios captured from Legacy
   node tools/check-links.js         # every relative Markdown link resolves
   ```

   See `docs/developer/testing.md` for what each one protects.
2. Run the smallest relevant test set first — `tools/test.sh <path or glob>`.
3. If targeted tests pass, run the broader suite when appropriate.
4. Inspect failures rather than immediately modifying code.
5. Determine whether each failure is:
   - caused by the current change;
   - an existing failure;
   - an environment/tooling issue;
   - an unrelated test failure.
6. Report the result precisely.

## Rules

Do not weaken tests to make them pass.

Do not delete tests without explicit justification.

Do not change production behavior merely to satisfy an incorrect test.

When a test exposes a real contract change, determine whether the implementation or the test should change.

## Output

Report:

- command(s) executed;
- number of tests passed/failed when available;
- relevant failures;
- likely cause;
- whether the failure blocks the requested change.