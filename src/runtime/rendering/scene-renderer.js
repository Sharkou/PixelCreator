// Draws a scene through a renderer backend.
//
// The loop is uniform and stays uniform: for each visible object it establishes the
// world transform, then calls `draw(self, renderer)` on every component that has one.
// There is no `instanceof` and no per-type branch anywhere, which is what lets a
// Sprite, a Tilemap and a ParticleSystem coexist without the renderer knowing any of
// them exists.
//
// Legacy's `Tilemap.draw(ctx, camera)` is exactly what this prevents: a signature that
// disagreed with the caller, so attaching the component threw an error that the
// per-component try/catch then swallowed forever.

import { worldMatrix } from '../../core/components/transform.js';
import { Matrix } from '../../core/math/matrix.js';
import { assertRenderer, BlendMode } from './renderer.js';
import { componentFailure, rethrowLater } from '../errors.js';

export class SceneRenderer {

    #renderer;
    #onError;
    #time;

    /**
     * Create a scene renderer.
     * @param {object} renderer - A backend satisfying the renderer contract
     * @param {object} [options] - Options
     * @param {Function} [options.onError] - Called with a ComponentFailure report (ADR-0012)
     * @param {Function} [options.time] - Returns the current simulation time, to stamp reports
     */
    constructor(renderer, { onError, time } = {}) {
        this.#renderer = assertRenderer(renderer);
        this.#onError = onError ?? rethrowLater;
        // Drawing has no clock of its own. A runtime lends it one; a scene renderer used
        // on its own honestly reports that it does not know the time.
        this.#time = time ?? (() => null);
    }

    get renderer() {
        return this.#renderer;
    }

    /**
     * Draw a scene.
     * @param {object} scene - The scene to draw
     * @param {object} [options] - Options
     * @param {Matrix} [options.view] - View transform applied above every object
     * @param {string} [options.clear] - Background colour; the surface is cleared transparent when omitted
     * @returns {number} How many objects were drawn
     */
    render(scene, { view = Matrix.identity(), clear } = {}) {
        const renderer = this.#renderer;

        renderer.clear(clear);
        renderer.setBlendMode(BlendMode.NORMAL);

        let drawn = 0;
        for (const object of this.#drawOrder(scene)) {
            if (!object.active) continue;

            const components = object.components;
            const types = globalThis.Object.keys(components);
            if (types.length === 0) continue;

            let established = false;

            for (const type of types) {
                const component = components[type];
                if (typeof component.draw !== 'function') continue;
                if (component.active === false) continue;

                // The transform is only established once a component actually draws, so
                // an object made purely of logic costs nothing.
                if (!established) {
                    renderer.save();
                    renderer.setTransform(view.multiply(worldMatrix(object)));
                    established = true;
                    drawn++;
                }

                try {
                    component.draw(object, renderer);
                } catch (error) {
                    // Isolated and reported; the remaining components of this object,
                    // and every other object, still draw. Nothing is disabled (ADR-0012).
                    this.#onError(componentFailure({
                        error,
                        object,
                        component,
                        phase: 'draw',
                        time: this.#time()
                    }));
                }
            }

            if (established) {
                renderer.setBlendMode(BlendMode.NORMAL);
                renderer.restore();
            }
        }

        return drawn;
    }

    #drawOrder(scene) {
        // Sorted per frame, deliberately. `layer` is free to change at any time, and
        // sorting a few hundred objects is negligible next to drawing them. A cache
        // invalidated on every `layer` write would be a speculative optimisation, and
        // one more piece of state to keep correct; it goes in when a measurement asks
        // for it and not before.
        return scene.objects().sort((first, second) => first.layer - second.layer);
    }
}
