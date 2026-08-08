# Pixel Creator – Copilot Rules

Pixel Creator is a web-based, beginner-oriented 2D multiplayer game creation engine currently being developed as a functional beta.

## Priorities

* Functionality and UX over architectural perfection.
* Simplicity over abstraction.
* Clarity over cleverness.
* Preserve existing working systems.
* Prefer small, targeted changes.

## Technology

* JavaScript only (ES modules).
* HTML/CSS for UI.
* Canvas for game rendering.
* HTML + SVG for the visual scripting graph.
* No external libraries unless strictly necessary.

## Existing Architecture

This is an old codebase. Some architectural inconsistencies are intentional and should NOT be "fixed" automatically.

* `Object` intentionally contains primitive properties and methods.
* Not all behavior belongs in components.
* Editor and engine are closely coupled in some areas.
* `app.js` contains integration/glue code.
* The graph uses HTML nodes + SVG connections.
* The existing networking system is working code and should not be rewritten unnecessarily.

Rules:

* Preserve the current architecture unless the task explicitly requires a change.
* Adapt existing systems instead of creating parallel systems.
* Do not refactor unrelated code.
* Do not rewrite working subsystems for theoretical cleanliness.
* Do not introduce frameworks or unnecessary abstractions.

## Code Style

* Match the existing code style.
* Prefer simple, explicit code.
* Avoid over-engineering.
* Keep code understandable.

## AI Workflow

* Inspect only files relevant to the current task.
* Do not perform global repository analysis unless requested.
* Modify only what is necessary.
* Do not investigate unrelated systems.
* If the first implementation fails, diagnose the concrete cause and make the smallest correction.
* Stop when the requested behavior works.

## Browser Validation

For UI, interaction, rendering, and runtime changes, perform **targeted browser validation by default**.

Workflow:

1. Start `tools/dev-server.sh`.
2. Open `http://localhost:8080/index.html`.
3. Attach `console` and `pageerror` listeners.
4. Test the behavior directly affected by the task.
5. If it works and there are no relevant errors, stop.
6. If it fails, fix the smallest directly related issue and retest.
7. Stop the server.

Validation must remain proportional to the task:

* Small change → minimal targeted test.
* Larger feature → test main interactions and relevant edge cases.
* Never perform exhaustive testing of unrelated systems.

The agent may autonomously diagnose and fix directly related issues discovered during validation.

Do not expand a local problem into an architectural refactor.

## Scope Control

Do not:

* rewrite `Graph` or `Node` unless explicitly requested;
* replace the existing graph, SVG, or Canvas systems;
* introduce a new architecture for a local problem;
* refactor unrelated code;
* modify working systems without a concrete reason.

Prefer:

```text
inspect → implement → targeted test → fix if needed → retest → stop
```

## Beta Philosophy

The goal is a functional, usable beta.

Prioritize:

1. Working features.
2. Good UX.
3. Beginner accessibility.
4. Stability.
5. Architectural cleanup only when it becomes necessary.
