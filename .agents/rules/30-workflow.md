# Pixel Creator — Development Workflow

## Before implementation

For non-trivial tasks:

1. Understand the requested behavior.
2. Locate the relevant implementation.
3. Inspect relevant tests.
4. Inspect relevant documentation/ADRs.
5. Identify the smallest correct change.
6. Implement it.
7. Run the relevant tests.
8. Report what changed and any remaining concern.

For architecture-sensitive work, use the `inspect-architecture` skill first.

## During implementation

Do not modify unrelated files.

Do not rewrite working code merely to make it stylistically different.

Do not create speculative abstractions.

Do not silently change architectural contracts.

If an existing implementation contradicts the requested behavior, explain the conflict before choosing a solution when the choice is architectural.

## Verification

After implementation:
- run targeted tests first;
- run the broader test suite when appropriate;
- inspect the resulting diff;
- verify that no unrelated behavior was changed.

Do not claim that a change works without verifying it.

## Git

Do not commit changes unless explicitly requested.

Do not push changes unless explicitly requested.

Do not create pull requests unless explicitly requested.

Do not reset, rebase, force-push, or otherwise rewrite user work without explicit authorization.

Preserve unrelated existing modifications.

## Communication

Be concise and concrete.

When something is uncertain:
- say what is known;
- say what is uncertain;
- inspect the repository rather than guessing when possible.

If the requested approach conflicts with an existing architectural contract, say so clearly.