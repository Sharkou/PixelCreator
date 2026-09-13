# ADR-0011 — The server is the authority, the Editor emits authorized operations

- **Status:** **accepted** (2026-08-12)
- **Decides:** who is authoritative over the state, and how the Editor can modify a running game
- **Related to:** ADR-0003 (Property System), ADR-0008 (Operations)

---

## Observed context

Legacy has **no notion of authority**.

```
client → 'update' {id, prop, value} → the server applies → rebroadcasts to the others
```

The server checks nothing. Consequences:

- any client can modify any object;
- the Editor is **in practice** the authoritative client, only because `Network.sync()` is
  enabled when `inspector === true` — a convention, not a guarantee;
- the server nevertheless really simulates (`obj.update()` at 60 Hz) and broadcasts a heartbeat,
  which creates two claimants to the truth with no arbitration.

That is acceptable for a cooperative prototype, **blocking for the product's stated target**:
competitive .io games, MOBAs, MMOs.

---

## Decision

**The server is the simulation authority in competitive multiplayer.**

The creator must nevertheless be able to observe, modify and synchronize the game's state in real
time from the Editor, **when they have the permissions**.

### Two natures of mutation

| Nature | Emitter | Handling |
|---|---|---|
| **Player / client mutation** | a player in game | an intent submitted to the server; the client may predict, the server decides |
| **Authorized editor mutation** | the creator, with permissions | an authorized Operation → **validated server-side** → applied to the authoritative state → propagated to every client |

The path is identical in both cases. Only the **source** and the **check** differ:

```
Operation
   │
   ▼
authority.check(op, actor)      ← accepted | rejected | transformed
   │
   ▼
authoritative state (server)
   │
   ▼
propagation to the clients
```

### What is implemented now

**The insertion point, not the policy.**

- Every Operation carries an `actor` (who) and an `origin` (`player` | `editor`).
- The server owns an `authority` that receives **every** Operation before application.
- The initial implementation of `authority.check()` may be permissive — but it **exists and is
  traversed**, with no exception.

### What is not implemented now

The full permission system: roles, project ownership, granularity per scene or per object,
invitations, revocation. The architecture must not prevent it; it does not have to anticipate it
in detail.

---

## Consequences

### Positive

- Competitive games become possible — they were not.
- The Editor's privileged role becomes **explicit and checkable**, instead of resting on a
  client-side `inspector` boolean.
- A single point for logging, auditing and, later, moderation.
- An AI acting on the project goes through the same check as a human — it has no privileged path.

### Negative

- **Latency on live editing.** Today the Editor applies locally and then informs. With
  server-side validation, a change can be rejected after the fact.
  → The Editor applies optimistically and **reconciles** if the server refuses.
  Letter-by-letter synchronization stays local and immediate; only the confirmation is
  asynchronous.
- **The server becomes a mandatory checkpoint**, therefore a bottleneck and a point of failure.
  Single-player / offline mode must short-circuit the authority with a local implementation that
  accepts everything.
- The private server has to evolve at the same time as the client (risk R4).

### A point to watch

`authority.check()` must not become a second place where business logic is duplicated. It
**validates** (rights, coherence, bounds); it does not **compute**.

---

## Rejected alternatives

| Alternative | Why not |
|---|---|
| **The status quo — no authority** | It makes the product target (competitive games) impossible, and lets any client modify anything. |
| **Client authority (the Editor decides alone)** | It is the current de facto behaviour; indefensible as soon as an untrusted player is present. |
| **Strict authority with no optimistic mode** | It would destroy letter-by-letter editing, which is an explicitly preserved asset. |
| **Full permissions right now** | Out of v2 scope; costly and premature while no account model exists. |
