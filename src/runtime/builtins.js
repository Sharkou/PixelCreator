// The component types the engine ships, as a list — and the one call that installs them.
//
// THE LIST IS SHARED; CALLING IT IS NOT. Registration stays an application concern, for the
// reason `editor/registry.js` has always given: a module with a side effect on import cannot
// be imported without accepting it, and a headless test may want an empty catalogue. What
// moved here is only WHICH classes exist — because the Editor is no longer the only
// application that needs them. The game client (`src/play/`) opens the same projects and
// must build the same objects, and it may not import anything of the Editor's (ADR-0042 §2).
//
// IT LIVES IN `runtime/` BECAUSE THAT IS WHERE THE HALF OF THEM LIVE. `Transform` is the
// Core's; the five that draw are the Runtime's, and `runtime -> core` is the direction the
// layers already allow.

import { Transform, components as defaultRegistry } from '../core/mod.js';
import { Camera } from './rendering/camera.js';
import { ParticleSystem } from './rendering/components/particle-system.js';
import { RectangleRenderer } from './rendering/components/rectangle-renderer.js';
import { Sprite } from './rendering/components/sprite.js';
import { Tilemap } from './rendering/components/tilemap.js';

/** The component types the engine ships, in the order a menu should list them. */
export const BUILT_IN = [Transform, RectangleRenderer, Sprite, ParticleSystem, Tilemap, Camera];

/**
 * Fill a registry with the component types the engine ships.
 * @param {object} [registry] - The ComponentRegistry to fill
 * @returns {object} The registry
 */
export function registerBuiltIns(registry = defaultRegistry) {
    for (const ComponentClass of BUILT_IN) registry.register(ComponentClass);
    return registry;
}
