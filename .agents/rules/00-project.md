# Pixel Creator — Project Rules

## Mission

Pixel Creator is a web-based engine and editor for creating and publishing 2D multiplayer games without requiring users to write code.

The project prioritizes:
- working software and good UX;
- architectural simplicity;
- explicit contracts;
- fast iteration;
- maintainability;
- future extensibility without premature abstraction.

## Repository structure

- `src/core/` contains the platform-independent engine Core.
- Runtime code executes the game simulation and must support headless/server execution.
- `src/editor/` contains the editor.
- `docs/` contains architectural documentation and ADRs.
- Tests are part of the implementation contract.

Do not move responsibilities between these areas without understanding the existing architecture and its documented decisions.

## Source of truth

Before making architecture-sensitive changes:

1. Inspect the current implementation.
2. Inspect relevant tests.
3. Inspect relevant documentation in `docs/`.
4. Inspect relevant ADRs.
5. Only then propose or implement the change.

The current implementation is the source of truth for what the system actually does.

ADRs and documentation describe intended contracts and architectural rationale.

If implementation and documentation disagree, identify the discrepancy instead of silently changing one to match the other.

## Architectural decisions

Do not reverse, weaken, or replace an explicit architectural decision merely because another design appears more conventional.

If a change appears to require an architectural decision that is not already documented, stop and explain the trade-off before making the architectural change.

## Scope discipline

Prefer the smallest change that correctly solves the problem.

Do not introduce:
- unnecessary abstractions;
- unnecessary dependencies;
- frameworks;
- architectural patterns for their own sake;
- speculative extensibility.

"Could be useful later" is not sufficient justification for additional architecture.

## User experience

Pixel Creator ultimately exists for its users.

Do not optimize internal elegance at the expense of a simpler and more reliable user experience.

When there is a genuine conflict, explicitly identify it rather than hiding it behind an abstraction.