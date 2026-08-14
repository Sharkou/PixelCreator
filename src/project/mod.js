// Public entry point of the project layer.
//
// It owns identity, storage and loading for everything a project is made of, and it sits
// between the Editor and the Core:
//
//   editor/  ──►  project/  ──►  core/
//   runtime/ ──►  core/
//   core/    ──►  (nothing)
//
// It imports no DOM, no Runtime and no Editor, because a headless server has to load the
// same project a browser does (ADR-0011). The rule is enforced, not merely written down:
// see `tools/layers/rules.js`.

export { ResourceKind, createResource, createResourceId, isResourceId } from './resource.js';
export { ResourceStore, MemoryResourceStore } from './store.js';
export { Project, MANIFEST_VERSION } from './project.js';
export { loadComponentDefinitions, bindGraph, readGraph } from './graphs.js';
