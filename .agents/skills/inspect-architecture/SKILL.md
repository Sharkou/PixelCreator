---
name: inspect-architecture
description: Analyzes the existing Pixel Creator architecture before architecture-sensitive changes. Use when a task may affect Core, Runtime, Scene, Object, ResourceId, identity, components, transforms, the reactive Property System, rendering boundaries, serialization, editor/runtime boundaries, or Runtime error handling. This skill performs analysis and does not modify files.
---

# Inspect Pixel Creator Architecture

## Purpose

Determine how the requested change fits the existing architecture before implementation.

This skill is analysis-only.

Do not modify files.

## Procedure

1. Read the user's requested behavior carefully.
2. Identify the architectural areas potentially affected.
3. Locate the relevant source files.
4. Trace the relevant data flow and ownership.
5. Inspect relevant tests.
6. Inspect relevant documentation in `docs/`.
7. Inspect relevant ADRs.
8. Identify existing contracts and invariants.
9. Check whether the requested behavior conflicts with an existing architectural decision.
10. Identify the smallest viable implementation boundary.

## Pay particular attention to

- Core vs Runtime responsibilities;
- Scene identity and ResourceId identity;
- Pixel Creator's `Object` versus native JavaScript `Object`;
- object/component ownership;
- local and composed transforms;
- reactive Proxy-based properties;
- Runtime error isolation;
- component lifecycle and activation;
- renderer boundaries;
- headless execution;
- editor/runtime boundaries;
- serialization and persistence.

## Output

Report:

### Current architecture

What the relevant code currently does.

### Relevant contracts

Existing invariants, tests, and ADR decisions.

### Impact

Which files and subsystems would be affected.

### Risks

Concrete risks or contradictions.

### Recommended implementation boundary

The smallest architectural boundary in which the change should be implemented.

### Decision required

If an architectural decision is required, state it explicitly.

Do not implement the change as part of this skill.