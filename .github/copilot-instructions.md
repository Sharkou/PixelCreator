# Pixel Creator – Copilot Rules

Pixel Creator is a web-based, beginner-oriented 2D multiplayer game creation engine.

Priorities:
- Simplicity over abstraction.
- Clarity over cleverness.
- Maintainability over premature optimization.

## Technology

- JavaScript only (ES modules)
- HTML/CSS for user interfaces
- Canvas for game rendering
- No external libraries unless strictly justified

## Architecture

- Keep modules small and focused.
- Components contain behavior and logic.
- Objects are data containers.
- The editor must not directly mutate engine state.
- All engine state changes go through the event system.
- Do not change the architecture without explicit validation.

## Multiplayer

- Gameplay runtime is multiplayer-first.
- Prefer deterministic behavior when possible.
- Do not add networking complexity to unrelated systems.

## Code Style

- Match the existing code style exactly.
- Prefer simple and explicit code.
- Avoid unnecessary abstractions.
- Avoid over-engineering.
- Code must remain understandable by beginners.

## AI Workflow

Optimize token usage:

- Read only files required for the current task.
- Avoid global repository analysis unless requested.
- Prefer targeted modifications.
- Do not provide long explanations unless requested.
- Proceed directly when the objective is clear.

If a solution:
- hides behavior,
- increases cognitive load,
- adds unnecessary abstraction,
- assumes advanced knowledge,

then prefer a simpler alternative.