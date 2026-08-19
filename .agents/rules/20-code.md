# Pixel Creator — Code Rules

## General

Read existing code before introducing a new abstraction.

Prefer:
- simple code;
- explicit control flow;
- small APIs;
- existing utilities;
- standard JavaScript features.

Avoid cleverness when straightforward code is sufficient.

## Dependencies

Do not add a dependency unless it provides substantial value that cannot reasonably be provided by the existing codebase or platform.

Before adding a dependency, verify whether the project already solves the problem.

## APIs and contracts

Preserve existing public APIs unless the task explicitly requires a breaking change.

When changing an API:
- inspect all consumers;
- update relevant tests;
- update relevant documentation;
- identify compatibility implications.

Do not silently rename concepts that have architectural meaning.

## Tests

Tests are part of the implementation contract.

Do not delete or weaken tests merely to make a change pass.

When behavior changes intentionally, update the tests to express the new intended behavior.

## Comments

Do not comment obvious code.

Comments should explain:
- why a non-obvious decision exists;
- an important invariant;
- a compatibility constraint;
- a subtle technical limitation.

Prefer code that explains itself.

## Refactoring

Do not combine unrelated refactoring with feature implementation.

Keep the diff focused on the requested change unless a necessary refactoring is required for correctness.