---
name: implement-feature
description: Implements a requested Pixel Creator feature or behavior while respecting existing architecture, tests, documentation, and ADR contracts. Use for concrete implementation work after the relevant architecture has been understood.
---

# Implement Pixel Creator Feature

## Procedure

1. Understand the requested behavior and acceptance criteria.
2. Inspect the relevant implementation.
3. Inspect relevant tests.
4. Inspect relevant documentation and ADRs.
5. If architecture-sensitive, use the `inspect-architecture` skill first.
6. Identify the smallest correct implementation.
7. Implement the change without unrelated refactoring.
8. Add or update tests for the intended behavior.
9. Run targeted tests.
10. Run the broader test suite when appropriate.
11. Inspect the final diff.
12. Report the implementation and verification.

## Rules

Preserve existing architectural contracts.

Do not introduce TypeScript.

Do not add unnecessary dependencies.

Do not introduce speculative abstractions.

Do not modify unrelated files.

Do not silently change public APIs.

Do not silently change identity semantics.

Do not use runtime error handling as an excuse to mutate user-authored component state.

Do not automatically disable components after errors.

## If blocked

If the requested behavior conflicts with an existing architectural contract:

1. Explain the conflict.
2. Identify the relevant code/tests/ADR.
3. Present the smallest viable options.
4. Do not silently choose an architectural change.

## Completion criteria

A feature is not considered complete until:
- implementation is present;
- relevant tests exist or have been updated;
- relevant tests pass;
- the diff has been inspected.