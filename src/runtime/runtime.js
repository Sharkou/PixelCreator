// The runtime: it advances a scene, and draws it when there is something to draw with.
//
// ONE runtime, not a client one and a server one. The simulation is the same code
// reaching the same result on both sides — that is the whole point of a fixed step and
// of a Core that needs no browser. The only difference is that a server constructs it
// without a renderer, so `render()` does nothing and `draw()` is never called. There is
// no server variant to keep in sync with a client variant, because there is no variant.
//
// The application owns the loop. The runtime exposes `advance()` and `render()` and
// never reaches for requestAnimationFrame or setInterval, which are environment
// concerns and would drag the DOM into the runtime.

import { Clock } from './clock/clock.js';
import { SceneRenderer } from './rendering/scene-renderer.js';

export class Runtime {

    #scene;
    #clock;
    #sceneRenderer;
    #onError;
    #maxFailures;
    #failures = new WeakMap();
    #running = true;

    /**
     * Create a runtime.
     * @param {object} scene - The scene to run
     * @param {object} [options] - Options
     * @param {Clock} [options.clock] - Simulation clock
     * @param {object} [options.renderer] - Renderer backend; omit it to run headless
     * @param {Function} [options.onError] - Called with (error, component, object, phase)
     * @param {number} [options.maxFailures] - Consecutive failures before a component is disabled
     */
    constructor(scene, { clock, renderer, onError, maxFailures = 3 } = {}) {
        if (!scene) throw new TypeError('Runtime: a scene is required');

        this.#scene = scene;
        this.#clock = clock ?? new Clock();
        this.#onError = onError ?? rethrowLater;
        this.#maxFailures = maxFailures;
        this.#sceneRenderer = renderer
            ? new SceneRenderer(renderer, {
                onError: (error, component, object) => this.#handleFailure(error, component, object, 'draw')
            })
            : null;
    }

    get scene() {
        return this.#scene;
    }

    get clock() {
        return this.#clock;
    }

    /** True when the runtime draws; false on a server. */
    get renders() {
        return this.#sceneRenderer !== null;
    }

    /** Whether the simulation advances. Rendering continues while paused. */
    get running() {
        return this.#running;
    }

    set running(running) {
        this.#running = Boolean(running);
    }

    /**
     * Feed real time in and run the simulation steps it owes.
     * @param {number} elapsedSeconds - Real time since the previous call
     * @returns {number} How many steps ran
     */
    advance(elapsedSeconds) {
        if (!this.#running) return 0;

        const steps = this.#clock.advance(elapsedSeconds);
        for (let i = 0; i < steps; i++) this.step();
        return steps;
    }

    /**
     * Run exactly one simulation step.
     *
     * Every component's `update(self, ctx)` runs with the same fixed delta, in scene
     * insertion order. Update is fully separated from draw: the whole scene is
     * simulated, then the whole scene is drawn. Legacy interleaved them per object, so
     * what a component observed depended on the draw order of the objects around it.
     *
     * @returns {number} The simulated time after the step
     */
    step() {
        const context = {
            time: this.#clock.time,
            deltaTime: this.#clock.fixedStep,
            scene: this.#scene,
            runtime: this
        };

        for (const object of this.#scene.objects()) {
            if (!object.active) continue;

            const components = object.components;
            for (const type of globalThis.Object.keys(components)) {
                const component = components[type];
                if (typeof component.update !== 'function') continue;
                if (component.active === false) continue;

                try {
                    component.update(object, context);
                    this.#failures.delete(component);
                } catch (error) {
                    this.#handleFailure(error, component, object, 'update');
                }
            }
        }

        return this.#clock.tick();
    }

    /**
     * Draw the scene. Does nothing when the runtime has no renderer.
     * @param {object} [options] - Passed through to the scene renderer: { view, clear }
     * @returns {number} How many objects were drawn
     */
    render(options) {
        if (!this.#sceneRenderer) return 0;
        return this.#sceneRenderer.render(this.#scene, options);
    }

    #handleFailure(error, component, object, phase) {
        // A broken user script must not take the frame down with it — that isolation is
        // worth keeping from Legacy. What is not worth keeping is Legacy's habit of
        // logging the same failure sixty times a second forever, which is how a
        // systematically broken component stayed invisible. After a few consecutive
        // failures the component is switched off and stops being asked.
        const count = (this.#failures.get(component) ?? 0) + 1;
        this.#failures.set(component, count);

        this.#onError(error, component, object, phase);

        if (count >= this.#maxFailures) {
            component.active = false;
            this.#failures.delete(component);
        }
    }
}

function rethrowLater(error, component, object, phase) {
    queueMicrotask(() => {
        error.message = `${phase}() failed on ${component?.name ?? 'component'} of object ${object?.id}: ${error.message}`;
        throw error;
    });
}
