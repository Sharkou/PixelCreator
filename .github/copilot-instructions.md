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

## Browser Validation Loop

`app.js` and `build/index.html` use absolute ES module imports (e.g. `/src/core/system.js`),
so the app must be served over HTTP, not opened as a `file://` path.

1. Start the local static server: `tools/dev-server.sh` (defaults to port 8080, uses the
   system's `python3`, no Node/npm involved).
2. Open `http://localhost:8080/index.html` in the browser tool.
3. Attach `console` and `pageerror` listeners on the page to capture runtime errors/warnings.
4. Reload the page after each change and re-check the captured messages.
5. Fix any reported error, then repeat steps 2-4 until the console is clean.

Stop the server (`Ctrl+C` / kill the terminal) once validation is done.