# Pixel Creator – Copilot Rules

Pixel Creator is a **web-based, beginner-oriented 2D multiplayer game engine**.
Simplicity, clarity, and determinism always outweigh abstraction or cleverness.

Rules:
- JavaScript only (ES modules)
- No external libraries unless strictly justified
- One file = one class = one responsibility
- Objects are dumb containers; components hold all logic
- The editor never mutates engine state directly.
- All state changes go through the global event system
- Multiplayer-first, real-time, deterministic when possible
- Code must be readable and understandable by beginners

If a solution:
- adds abstraction
- hides behavior
- increases cognitive load
- assumes advanced knowledge

Then it is wrong.

Output expectations:
- Prefer simple, explicit code
- Avoid over-engineering
- Match existing style exactly