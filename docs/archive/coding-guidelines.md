# Pixel Creator Coding Guidelines

## Language & Style

- Language: JavaScript (ES modules)
- Code, comments, and identifiers in English
- camelCase for variables and functions
- PascalCase for classes
- lowercase filenames

---

## File Structure

- One file = one class
- One class = one responsibility
- Avoid deep folder hierarchies

---

## JSDoc Rules

- No class-level JSDoc comments
- Document constructors only
- Keep comments minimal and factual

```js
export class Vector {
    /**
     * Create a new vector for physics and transformations
     * @param {number} x
     * @param {number} y
     * @param {number} z
     */
    constructor(x = 0, y = 0, z = 0) {
        this.x = x;
        this.y = y;
        this.z = z;
    }
}
```

---

## Rendering Rules

- Canvas: game visuals only
- DOM: UI only
- Never mix rendering responsibilities

---

## Editor Rules

The editor:
- Emits events only
- Never mutates engine state
- Reflects authoritative engine state

If logic affects gameplay, it belongs in the engine.

---

## General Principles

- Prefer explicit code
- Avoid abstractions unless strictly necessary
- Match existing patterns
- Optimize for readability over cleverness

If a change makes the system harder to understand, it must be rejected.