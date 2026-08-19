# Pixel Creator — Architecture Rules

## Core / Runtime boundary

`src/core/` must remain platform-independent.

Core code must not depend on:
- the DOM;
- browser globals;
- Canvas APIs;
- browser-only rendering APIs;
- editor-specific code.

The Runtime is responsible for executing the simulation and must be capable of running headlessly.

Do not leak browser/editor concerns into Core.

## JavaScript

The project uses JavaScript ES modules.

Do not introduce TypeScript.

Do not introduce an ECS framework or another architectural framework unless explicitly requested.

Prefer native language/platform features and existing project abstractions.

## Object

Pixel Creator has its own `Object` concept/class.

Do not confuse Pixel Creator's `Object` with JavaScript's native `Object`.

Do not modify, shadow, monkey-patch, or replace the native JavaScript `Object` globally.

When discussing or changing Pixel Creator's `Object`, inspect its actual implementation and relationships with the rest of the engine.

## Identity

Do not casually introduce, remove, merge, or repurpose identity systems.

In particular, distinguish:
- Core object identity such as `scene.id`;
- resource identity such as `ResourceId`;
- runtime/editor representations.

Before changing identity behavior, inspect all consumers and relevant tests.

Identity is an architectural concern, not an implementation detail.

## Scene and composition

Respect the existing Scene model and object/component relationships.

Do not introduce a second competing source of truth for scene state.

Transforms are local to their objects and composed through the existing hierarchy.

Do not replace the current transform model with a global-coordinate design without an explicit architectural decision.

## Reactive Property System

The Property System uses reactive Proxy-based behavior.

Preserve its existing observable/reactive contracts.

Do not bypass the Property System with parallel state mechanisms unless the existing architecture explicitly requires it.

## Components

Components are part of the existing object/component model.

Do not add lifecycle or state-management behavior to components merely for convenience.

In particular, Runtime execution must not silently mutate component state to recover from execution errors.

## Runtime error handling

ADR-0012 is an explicit architectural contract.

When a component or runtime operation fails:

- isolate the error;
- report structured error information;
- preserve the original error object;
- identify the relevant object/component/type/phase/time where applicable;
- do not automatically mutate the model to recover;
- do not automatically set `component.active = false`.

Runtime error handling must not silently alter user-authored game state.

The Runtime exposes structured error reporting through the established `onError` mechanism.

Do not reintroduce a runtime error emitter or automatic component disabling without an explicit architectural decision.

## Rendering

Canvas 2D is the current rendering backend.

The architecture may remain prepared for future WebGL/WebGPU backends.

Do not prematurely implement renderer abstractions solely because WebGL/WebGPU may be used later.

Keep backend-independent responsibilities separated from backend-specific rendering code.

## Editor

The editor is a consumer of the engine, not the definition of the engine.

Do not move editor-specific assumptions into Core merely to make editor implementation easier.

Respect the current editor architecture and naming conventions.

## Architecture changes

Before changing any of the following, use the `inspect-architecture` skill:

- Core/Runtime boundaries;
- identity;
- Scene;
- Object;
- ResourceId;
- component lifecycle;
- Property System;
- transforms;
- rendering architecture;
- Runtime error handling;
- serialization contracts;
- editor/runtime boundaries.

Architecture should be changed deliberately, not incidentally.