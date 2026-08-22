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
//
// The runtime advances the simulation; it never mutates the model on its own account.
// A component that throws is isolated so the frame survives, and reported through
// `onError` — never disabled, never repaired, never written to (ADR-0012).

import { hierarchyOrder } from '../core/scene.js';
import { Clock } from './clock/clock.js';
import { SceneRenderer } from './rendering/scene-renderer.js';
import { componentFailure, rethrowLater } from './errors.js';
import { Input } from './input/input.js';

export class Runtime {

    #scene;
    #clock;
    #sceneRenderer;
    #onError;
    #input;
    #behaviors;
    #running = true;

    /**
     * Create a runtime.
     * @param {object} scene - The scene to run
     * @param {object} [options] - Options
     * @param {Clock} [options.clock] - Simulation clock
     * @param {object} [options.renderer] - Renderer backend; omit it to run headless
     * @param {Function} [options.onError] - Called with a ComponentFailure report (ADR-0012)
     * @param {Input} [options.input] - Default input, used when a step is given none
     * @param {object} [options.behaviors] - Graph behaviors bound to component types (ADR-0015)
     */
    constructor(scene, { clock, renderer, onError, input, behaviors } = {}) {
        if (!scene) throw new TypeError('Runtime: a scene is required');

        this.#scene = scene;
        this.#clock = clock ?? new Clock();
        this.#onError = onError ?? rethrowLater;
        // Always present, never fetched from a global. A runtime with nobody feeding it
        // input runs on empty input rather than failing — which is the single-player
        // case Legacy broke by routing the keyboard through Network.users.
        this.#input = input ?? new Input();
        this.#behaviors = behaviors ?? null;
        this.#sceneRenderer = renderer
            ? new SceneRenderer(renderer, {
                onError: report => this.#onError(report),
                // The scene renderer has no clock of its own, so the runtime lends it
                // the simulation time a draw failure belongs to.
                time: () => this.#clock.time
            })
            : null;
    }

    get scene() {
        return this.#scene;
    }

    get clock() {
        return this.#clock;
    }

    /** The input the simulation reads when a step is given none. */
    get input() {
        return this.#input;
    }

    /** The graph behaviors, or null when no component type carries a graph. */
    get behaviors() {
        return this.#behaviors;
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
     * @param {Input} [input] - Input for these steps; the runtime's own when omitted
     * @returns {number} How many steps ran
     */
    advance(elapsedSeconds, input) {
        if (!this.#running) return 0;

        const steps = this.#clock.advance(elapsedSeconds);
        for (let i = 0; i < steps; i++) this.step(input);
        return steps;
    }

    /**
     * Run exactly one simulation step.
     *
     * Every component's `update(self, ctx)` runs with the same fixed delta, in the scene's
     * CANONICAL ORDER — the roots in their order, and depth first under each of them —
     * followed by the `.px` graph bound to its type when it has one (ADR-0015).
     *
     * THE ORDER IS A FUNCTION OF THE STATE, NEVER OF THE HISTORY (ADR-0035). It used to be
     * insertion order, which is a fact about how a scene was BUILT rather than about what it
     * IS: a reparent leaves it behind, a reload rewrites it from the payload, and a deletion
     * undone puts the object back at the end. Two machines holding the very same scene
     * therefore simulated it in two different orders. That is unobservable while a graph can
     * only reach its own Component, and it is the first thing to diverge the moment one can
     * reach a neighbour (ADR-0034 §3.3) — so the order became data before the feature that
     * reads it did. `roots` and `children` are both ordered, both replicated, both
     * serialized; insertion order is none of those.
     *
     * A PARENT RUNS BEFORE ITS CHILDREN, which is what a hierarchy of transforms means.
     *
     * Update is fully separated from draw: the whole scene is simulated, then the whole
     * scene is drawn. Legacy interleaved them per object, so what a component observed
     * depended on the draw order of the objects around it.
     *
     * Input is an argument, not a global. Give the same scene the same inputs and it
     * reaches the same state, whether it runs in a browser or on a server replaying what
     * players sent — the property reconciliation is built on.
     *
     * @param {Input} [input] - Input for this step; the runtime's own when omitted
     * @returns {number} The simulated time after the step
     */
    step(input) {
        const stepInput = input ?? this.#input;
        const context = {
            time: this.#clock.time,
            deltaTime: this.#clock.fixedStep,
            scene: this.#scene,
            runtime: this,
            input: stepInput
        };

        for (const object of hierarchyOrder(this.#scene)) {
            if (!object.active) continue;

            const components = object.components;
            for (const type of globalThis.Object.keys(components)) {
                const component = components[type];
                if (component.active === false) continue;

                try {
                    // A component runs its own code, then the graph bound to its type —
                    // one component, one unit of isolation, one place in the order. A
                    // graph is not a second execution path: it is this component's
                    // behavior, run where the component runs (ADR-0015).
                    if (typeof component.update === 'function') component.update(object, context);
                    this.#behaviors?.behaviorFor(component)?.update?.(object, context);
                } catch (error) {
                    // Isolated, reported, and nothing else. The next component still
                    // runs, and the model is left exactly as the failing component left
                    // it — see ADR-0012 for why the runtime must not "fix" anything here.
                    this.#onError(componentFailure({
                        error,
                        object,
                        component,
                        phase: 'update',
                        time: context.time
                    }));
                }
            }
        }

        // Closing the step is what makes `pressed()` and `released()` observable on
        // exactly one step, however many steps a frame owes.
        stepInput.commit();

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
}
