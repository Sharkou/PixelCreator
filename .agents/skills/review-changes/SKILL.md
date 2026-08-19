---
name: review-changes
description: Reviews existing Pixel Creator changes for correctness, architectural regressions, contract violations, unnecessary complexity, test coverage, and unintended side effects. Use when reviewing a diff, recent implementation, branch, or proposed change.
---

# Review Pixel Creator Changes

## Procedure

1. Inspect the complete diff.
2. Identify the intended behavior.
3. Trace affected code paths.
4. Inspect relevant tests.
5. Inspect relevant documentation and ADRs.
6. Check architectural boundaries.
7. Check API and identity contracts.
8. Check error handling and state mutation.
9. Check for unnecessary complexity or unrelated changes.
10. Run relevant tests when possible.

## Review priorities

Prioritize:

1. Incorrect behavior.
2. Architectural contract violations.
3. Regressions.
4. Incorrect state ownership.
5. Missing or misleading tests.
6. Unnecessary complexity.
7. Maintainability concerns.
8. Style issues.

Do not report stylistic preferences as critical issues.

## Pixel Creator-specific checks

Verify especially:

- Core remains platform-independent;
- Runtime remains headless-capable;
- Scene/Object/ResourceId identities are not conflated;
- Pixel Creator `Object` is not confused with native JavaScript `Object`;
- Property System reactivity is preserved;
- transform composition remains correct;
- Runtime errors do not automatically mutate component state;
- ADR-0012 remains respected;
- editor-specific concerns do not leak into Core;
- no unnecessary dependency or framework has been introduced.

## Output

Group findings by severity:

### Critical

Must be fixed.

### Important

Should be fixed before merging.

### Minor

Useful improvement but not blocking.

### Positive

Notable decisions that are correct or particularly clean.

Do not modify files unless explicitly requested.