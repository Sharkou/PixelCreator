// Which component types this application knows about.
//
// Registration is an APPLICATION concern, not a library one. `core/component.js` ships
// the registry empty and nothing registers itself on import: a server, a headless test
// and the Editor do not need the same set, and a module with a registration side effect
// cannot be imported without accepting it.
//
// This is also the seam a project's own component definitions come through
// (ADR-0016): `components.register(defineComponent(definition))` puts a creator's
// Component in the very same registry, and from here on nothing can tell the two apart.

import { components as defaultRegistry, Transform } from '../core/mod.js';
import { Camera, ParticleSystem, RectangleRenderer, Sprite, Tilemap } from '../runtime/mod.js';

/** The component types shipped with the engine, in the order the Add menu lists them. */
export const BUILT_IN = [Transform, RectangleRenderer, Sprite, Camera, ParticleSystem, Tilemap];

/**
 * Register the engine's component types.
 * @param {object} [registry] - The registry to fill
 * @returns {object} The registry
 */
export function registerBuiltIns(registry = defaultRegistry) {
    for (const ComponentClass of BUILT_IN) registry.register(ComponentClass);
    return registry;
}
