# Logging

## OBSERVED

There is no logger. There are `console.log` calls with inline CSS styles, scattered through the
code, following a consistent colour convention:

| Colour | Pattern | Meaning |
|---|---|---|
| `#11AB0D` green | `[SERVER] …` | network traffic |
| `#3b78ff` blue | `info: …` | engine information |
| `#F9F1A5` yellow | `warn: …` | a warning |

Real examples:

```js
console.log('%c[SERVER] Connection established!', 'color: #11AB0D');
console.log('%cinfo: File loaded: ' + file.id, 'color: #3b78ff');
console.log('%cwarn: ' + string, 'color: #F9F1A5');
```

`System.log()`, `System.debug()` and `System.warn()` partly codify those three styles — but
**most calls do not use them** and rewrite the style by hand. `System.getDate()` produces a
`[2026-08-12 14:03:22.041]` timestamp that is **never used**.

On the server side, the same helpers exist (`log`, `debug`, `error`) with the same colours — so
the convention is shared between client and server.

### What works

The visual identity. A developer immediately tells a network line from an engine line in the
console. **That is an asset worth keeping.**

### What does not work

- There is no way to filter by category or by level.
- There is no way to turn logs off in production.
- The categories are implicit, inside a string.
- Many raw `console.log` calls with no style and no prefix.
- The `try/catch` in `Object.update()` does `console.error(err)` **every frame and per
  component**: a systematic error produces thousands of identical lines. That is what made the
  offline single-player bug invisible.
- The timestamp is written and unused.

---

## V2 PROPOSAL

Keep the visual identity, put it behind a named API.

```js
logger.network('Connection established');
logger.scene('Object added: ' + id);
logger.runtime('Frame budget exceeded');
logger.editor('Inspector rebuilt');
logger.core('Property system initialized');
```

Each category keeps its historical colour:

| Category | Colour | Origin |
|---|---|---|
| `network` | `#11AB0D` | kept |
| `core` / `scene` | `#3b78ff` | kept (`info:`) |
| `runtime` | to be defined | |
| `editor` | to be defined | |
| `warn` | `#F9F1A5` | kept |
| `error` | red | |

### Additions

- **Levels**: `debug` < `info` < `warn` < `error`, with a configurable threshold.
- **Filtering by category**: `logger.enable('network', 'runtime')`.
- **Silent in production**, verbose in development.
- **Deduplication**: an identical repeated message is aggregated (`… ×1247`) instead of being
  repeated every frame. That is the direct fix for the noise produced by the `try/catch` in
  `Object.update()`.
- **Optional timestamp**, reusing the `System.getDate()` that already exists.
- **The same API on the server**: it is Core code, so it has no browser dependency; the colour
  formatting adapts (ANSI codes outside a browser).

### What we are not doing

- No external logging library.
- No telemetry, no remote reporting.
- No replacement of the colours: they are part of the project's identity.
