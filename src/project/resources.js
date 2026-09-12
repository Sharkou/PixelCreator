// Reading every definition a simulation will name, before the simulation starts (ADR-0062 §1).
//
// ONE LOADER WHERE THERE WERE GOING TO BE FOUR. `loadPrefabs()` was written for prefabs
// (ADR-0061 §4); an animation needed exactly the same six lines with one word changed, and
// the next definition kind would have needed them again. What differs between the kinds is
// which `ResourceKind` is read and which reader interprets the payload — and the second of
// those belongs to whoever asks, not to whoever loads.
//
// THE BOUNDARY IS UNCHANGED AND IS THE WHOLE POINT. This is `async`, what it produces is
// not, and the Runtime only ever sees the registry. A `Runtime.step()` may not wait on
// storage; it does not have to, because everything it can name is already in memory.
//
//   Bullet.prefab / Walk.animation
//        │  asynchronous, BEFORE the game
//   project.read(id)  →  ResourceRegistry.set(id, payload)
//        │
//   new Runtime(scene, { resources })     ← a VALUE, never an identifier
//        │  synchronous, DURING the step
//   ctx.resources.get(id)
//
// A PAYLOAD IS NOT INTERPRETED HERE. `recordsOf()` decides whether something is a prefab and
// `animationOf()` decides whether it is a clip; both refuse a shape they do not recognise
// (ADR-0061 §3). That is what lets one table hold every kind without anyone guessing.

import { ResourceRegistry } from '../core/mod.js';
import { ResourceKind } from './resource.js';

/**
 * The kinds whose payload a running game reads by identity.
 *
 * A SCENE IS NOT ON THIS LIST, and the reason is that a scene is not a definition a step
 * names — it is what a step runs IN. Loading one replaces the world, which is a decision for
 * the application rather than a lookup (ADR-0063). An `asset` is not here either: a picture
 * and a sound are host objects that live behind their own backend, never in the Core.
 */
export const DEFINITION_KINDS = globalThis.Object.freeze([ResourceKind.PREFAB, ResourceKind.ANIMATION]);

/**
 * Resolve every definition of a project into a registry a simulation can read synchronously.
 *
 * A BROKEN PAYLOAD MUST NOT STOP A PROJECT FROM OPENING, in the spirit of ADR-0012 and of
 * `loadComponentDefinitions()` beside it: it is reported through `onError` and skipped, and
 * whatever named it answers nothing at run time — which is already how a node whose target
 * is gone behaves (ADR-0034 §3.4).
 *
 * @param {object} project - The project to load from
 * @param {object} [options] - Options
 * @param {ResourceRegistry} [options.resources] - The registry to fill; a fresh one by default
 * @param {string[]} [options.kinds] - Which kinds to read; every definition kind by default
 * @param {Function} [options.onError] - Called with { resource, error } instead of throwing
 * @returns {Promise<ResourceRegistry>} The registry
 */
export async function loadDefinitions(project, { resources = new ResourceRegistry(), kinds = DEFINITION_KINDS, onError } = {}) {
    for (const kind of kinds) {
        for (const resource of project.resources(kind)) {
            try {
                const definition = await project.read(resource.id);
                if (definition) resources.set(resource.id, definition);
            } catch (error) {
                if (!onError) throw error;
                onError({ resource, error });
            }
        }
    }

    return resources;
}

/**
 * The ResourceIds of every picture in a project.
 *
 * WHAT AN APPLICATION PRELOADS BEFORE THE FIRST FRAME (ADR-0062 §2). It is here rather than
 * in the Runtime because it reads a manifest, and reading a manifest is this layer's job —
 * the Runtime receives a list, never a project.
 *
 * @param {object} project - The project
 * @returns {string[]} The identifiers, in manifest order
 */
export function imageResources(project) {
    return project.resources(ResourceKind.ASSET)
        .filter(resource => (resource.mime ?? '').startsWith('image/'))
        .map(resource => resource.id);
}
