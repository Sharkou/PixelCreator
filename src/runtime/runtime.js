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

import { createId } from '../core/id.js';
import { hierarchyOrder } from '../core/scene.js';
import { Clock } from './clock/clock.js';
import { SceneRenderer } from './rendering/scene-renderer.js';
import { componentFailure, rethrowLater } from './errors.js';
import { Input } from './input/input.js';
import { Random } from './random/random.js';
import { Collisions } from './collision/collisions.js';
import { moveBodies } from './physics/move.js';

export class Runtime {

    #scene;
    #clock;
    #sceneRenderer;
    #onError;
    #input;
    #behaviors;
    #audio;
    #resources;
    #session;
    #running = true;

    // WHAT THE SIMULATION ASKED FOR, AND WHAT THE APPLICATION WILL DO ABOUT IT (ADR-0063 §2).
    // A `Load Scene` cannot load a scene: reading one is asynchronous and a step may not
    // wait. So the node RECORDS a request, the step finishes, and `advance()` hands it to
    // whoever owns the loading — between frames, where waiting is allowed.
    #requested = null;
    #onSceneRequest;
    #unwatch = null;

    // THE ONE VALUE EVERY UNCERTAIN THING IN THIS SIMULATION IS DERIVED FROM (ADR-0057). A
    // server sends it, a replay quotes it, a bug report pastes it — and two runs of it are
    // the same run.
    #seed;

    // TWO STREAMS FROM ONE SEED, AND THEY ARE SEPARATE ON PURPOSE. Sharing one counter would
    // make "how many objects have been spawned" an input to every dice roll that follows:
    // adding a `Spawn` to a graph would silently change every `Random` after it, and a
    // creator would have no way to read that from the canvas. Derived by NAME rather than
    // split by turns, so a third stream later costs a line and shifts neither of these two.
    #random;
    #ids;

    // WHAT IS TOUCHING WHAT, DECIDED BEFORE ANY BEHAVIOUR RUNS (ADR-0059). It belongs to the
    // Runtime for the same reason the clock and the input do: it is a fact about the
    // simulation, identical on a server and on every client, and it is not a picture.
    #collisions = new Collisions();

    /**
     * What the last movement pass passed clean through (ADR-0067 §11).
     *
     * IT IS CARRIED ACROSS ONE STEP, because that is where it belongs: the crossing happened
     * at the end of the last step, and detection reads the world the last step left behind.
     */
    #crossings = [];

    /**
     * Create a runtime.
     * @param {object} scene - The scene to run
     * @param {object} [options] - Options
     * @param {Clock} [options.clock] - Simulation clock
     * @param {object} [options.renderer] - Renderer backend; omit it to run headless
     * @param {Function} [options.onError] - Called with a ComponentFailure report (ADR-0012)
     * @param {Input} [options.input] - Default input, used when a step is given none
     * @param {object} [options.behaviors] - Graph behaviors bound to component types (ADR-0015)
     * @param {object} [options.audio] - Audio output backend; omit it to run silent (ADR-0060 §5)
     * @param {object} [options.resources] - Resolved definitions — prefabs, animations —
     *   as one `ResourceRegistry` (ADR-0062 §1)
     * @param {object} [options.session] - Values carried across scene changes (ADR-0063 §5)
     * @param {Function} [options.onSceneRequest] - Called between frames with the ResourceId
     *   a graph asked to load. Absent, a request is recorded and nothing happens, which is
     *   what a headless caller and the Editor's Play mode both want
     * @param {string|number} [options.seed] - What every uncertain thing in this simulation is
     *   derived from (ADR-0057). Drawn when omitted, and readable back as `runtime.seed`, so
     *   a run is always reproducible even when nobody chose one.
     */
    constructor(scene, { clock, renderer, onError, input, behaviors, audio, resources, session, onSceneRequest, seed } = {}) {
        if (!scene) throw new TypeError('Runtime: a scene is required');

        // DRAWN, NEVER CONSTANT, AND ALWAYS READABLE BACK. A fixed default would make every
        // playthrough of a game identical, which is the opposite of what a creator reaching
        // for `Random` wants. What makes the draw HONEST is that it is stated: the seed is a
        // value on the runtime, so the difference between two runs is one string long.
        this.#seed = seed ?? createId();
        this.#random = new Random(`${this.#seed}:random`);
        this.#ids = new Random(`${this.#seed}:ids`);

        this.#scene = scene;
        this.#clock = clock ?? new Clock();
        this.#onError = onError ?? rethrowLater;
        // Always present, never fetched from a global. A runtime with nobody feeding it
        // input runs on empty input rather than failing — which is the single-player
        // case Legacy broke by routing the keyboard through Network.users.
        this.#input = input ?? new Input();
        this.#behaviors = behaviors ?? null;
        // A SECOND BACKEND, HANDED IN LIKE THE FIRST (ADR-0060 §5). A server constructs a
        // Runtime without one and the simulation is identical: `Play Sound` does nothing,
        // and `AudioSource` reconciles against nothing. Sound is an OUTPUT of the
        // simulation, never an input to it, so its absence cannot change a single value.
        this.#audio = audio ?? null;
        // RESOLVED BEFORE THE SIMULATION, NEVER DURING IT (ADR-0061 §4). What arrives here is
        // a map that is already in memory: the Project layer read the payloads, this layer
        // only ever asks it a question and gets an answer in the same turn. That is the whole
        // of how a prefab can be instantiated inside a step without the interpreter becoming
        // asynchronous and without the Runtime learning what storage is.
        this.#resources = resources ?? null;
        this.#session = session ?? null;
        this.#onSceneRequest = onSceneRequest ?? null;
        // AND WHAT LEAVES THE SCENE IS TOLD SO. The subscription is the Scene's own
        // 'removed' announcement, which `Scene.remove()` raises for the object and for
        // every descendant under it.
        this.#unwatch = this.#scene.on?.('removed', object => this.#detach(object)) ?? null;
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

    /** What every uncertain thing in this simulation is derived from (ADR-0057). */
    get seed() {
        return this.#seed;
    }

    /** The stream a graph draws from. Gameplay only: identities have their own. */
    get random() {
        return this.#random;
    }

    /** What is touching what, as of the last step (ADR-0059). */
    get collisions() {
        return this.#collisions;
    }

    /**
     * Mint one identity, from this simulation rather than from the machine.
     *
     * Bound once and handed to every step, so a node calls it without knowing which of the
     * two streams it came from — or that there are two (ADR-0057 §3).
     */
    #createObjectId = () => createId(undefined, { randomBytes: bytes => this.#ids.fill(bytes) });

    /** True when the runtime draws; false on a server. */
    get renders() {
        return this.#sceneRenderer !== null;
    }

    /** The audio output, or null when this runtime is silent. */
    get audio() {
        return this.#audio;
    }

    /** The resolved definitions this simulation may reach, or null when given none. */
    get resources() {
        return this.#resources;
    }

    /** The values carried across scene changes, or null when this runtime has none. */
    get session() {
        return this.#session;
    }

    /** The scene a graph has asked for and nobody has loaded yet, or null. */
    get requestedScene() {
        return this.#requested;
    }

    /**
     * Ask for a different scene.
     *
     * IT RECORDS AND RETURNS (ADR-0063 §2). Nothing is loaded, nothing is replaced and no
     * promise is made: the step it was called from finishes normally, on the scene it was
     * already running. That is what lets `Load Scene` be an ordinary synchronous node in an
     * interpreter that must never wait.
     *
     * THE LAST ASK IN A STEP WINS, deliberately. Two `Load Scene` nodes reached in one step
     * is a graph saying two things; loading both in turn would play a scene for zero frames,
     * and refusing would make the order of two flows into an error a creator cannot see.
     *
     * @param {string} id - The scene's ResourceId
     * @returns {string|null} What is now requested
     */
    requestScene(id) {
        this.#requested = id || null;
        return this.#requested;
    }

    /** Forget a pending request, without loading anything. */
    clearSceneRequest() {
        this.#requested = null;
    }

    /**
     * Let everything this runtime is driving go.
     *
     * WHAT A SCENE CHANGE THROWS AWAY (ADR-0063 §3). Removing the roots announces every
     * Object's departure, so each Component's `onRemoved` runs and an `AudioSource` stops —
     * a level's music must not outlive the level. The suspended executions of `Delay`,
     * `Tween` and `Every` need no cancelling: they live in closures reachable only from the
     * `Behaviors` WeakMap keyed by their Component, so they go when the Components do
     * (ADR-0058).
     *
     * IT IS NOT A `stop()`. Nothing here touches the loop, the renderer or the audio output:
     * those belong to the application, and the next Runtime is handed the very same ones.
     */
    dispose() {
        this.#running = false;
        this.#requested = null;

        for (const root of [...this.#scene.roots()]) this.#scene.remove(root);
        this.#unwatch?.();
        this.#unwatch = null;
    }

    /**
     * Let a Component go of whatever it was holding outside the simulation.
     *
     * `onRemoved(self, ctx)` IS THE OBJECT LEAVING THE SCENE; `onDetach(self)` IS THE
     * COMPONENT LEAVING THE OBJECT. Two different events, named apart on purpose: the
     * second already existed on `Object` (core/object.js) and says nothing about a Destroy,
     * because destroying an Object does not remove its components from it.
     *
     * WHY THE RUNTIME AND NOT THE SCENE. Like `update` and `draw`, this hook needs the step
     * context — the audio output, the scene, the time. The Scene is the Core's and holds
     * none of those; the Runtime holds all three and already isolates a component that
     * throws (ADR-0012), so the hook runs where every other component call runs.
     *
     * IT IS WHAT STOPS A DESTROYED ENEMY FROM GOING ON HUMMING. `AudioSource` is a
     * reconciler: it makes the sound agree with its values on every step, and an Object
     * that has left the scene gets no more steps — so without this the last thing it ever
     * asked for would keep sounding until the tab closed. `Scene.remove()` recurses into
     * the children and announces each of them, so a whole subtree is silenced.
     *
     * @param {object} object - The Object that has just left the scene
     */
    #detach(object) {
        const components = object?.components;
        if (!components) return;

        const context = {
            time: this.#clock.time,
            scene: this.#scene,
            runtime: this,
            audio: this.#audio
        };

        for (const type of object.componentTypes()) {
            const component = components[type];
            if (typeof component?.onRemoved !== 'function') continue;

            try {
                component.onRemoved(object, context);
            } catch (error) {
                this.#onError(componentFailure({
                    error,
                    object,
                    component,
                    phase: 'removed',
                    time: context.time
                }));
            }
        }
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

        // BETWEEN FRAMES, NEVER INSIDE ONE (ADR-0063 §2). Every step of this frame has run
        // on the scene it started on; only now is the application told that a graph wants a
        // different one. The handler may be asynchronous — it has to be, it reads a Resource
        // — and by the time it answers, this Runtime has been disposed and replaced.
        const requested = this.#requested;
        if (requested !== null) {
            this.#requested = null;
            this.#onSceneRequest?.(requested);
        }

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
     * THE SCENE MAY CHANGE SHAPE WHILE THE STEP RUNS, and both directions are decided rather
     * than left to the order the walk happens to take (ADR-0056 §5). The order is
     * materialised before the loop, so an object CREATED during this step is not in it and
     * runs from the next one — which is also what stops a graph that spawns on every update
     * from spawning without end inside one frame. An object DESTROYED during this step is
     * still in the list, and is skipped: it is asked of the scene before each of its
     * components, so a component that destroys its own Object is the last thing that runs on
     * it.
     *
     * Update is fully separated from draw: the whole scene is simulated, then the whole
     * scene is drawn. Legacy interleaved them per object, so what a component observed
     * depended on the draw order of the objects around it.
     *
     * Input is an argument, not a global. Give the same scene the same inputs and it
     * reaches the same state, whether it runs in a browser or on a server replaying what
     * players sent — the property reconciliation is built on.
     *
     * AND SO IS CHANCE (ADR-0057). The sentence above used to have an unstated exception: a
     * graph that drew a random number, or created an Object, reached a source the two
     * machines did not share. Both now come off this context, derived from the runtime's
     * seed, so "the same scene, the same inputs, the same seed" is the whole of the
     * hypothesis and the conclusion holds without a footnote.
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
            input: stepInput,
            // THE TWO SOURCES A GRAPH MAY REACH FOR, HANDED OVER LIKE THE INPUT BESIDE THEM
            // (ADR-0014, ADR-0057). A node that called `Math.random()` or minted its own
            // identity would desynchronise a replicated game on its first step; there is
            // nothing to forbid, because there is nothing global left to reach.
            random: this.#random,
            createObjectId: this.#createObjectId,
            // WHAT IS TOUCHING WHAT, AS ONE SNAPSHOT THE WHOLE STEP READS (ADR-0059 §4).
            // `On Collision` and `Is Overlapping` ask this rather than measuring geometry of
            // their own, so two nodes in one step can never disagree about a hit.
            collisions: this.#collisions,
            // THE OUTPUT A SOUND GOES TO, HANDED OVER LIKE THE INPUT AND THE RENDERER
            // (ADR-0014, ADR-0060 §5). A node never reaches for a global `Audio`, so a
            // server running the same graph is simply silent rather than broken.
            audio: this.#audio,
            // AND THE DEFINITIONS A `Spawn Prefab` OR A `SpriteAnimator` MAY REACH,
            // answering synchronously because they were resolved before this loop began
            // (ADR-0061 §4, ADR-0062 §1).
            resources: this.#resources,
            // WHAT SURVIVES A CHANGE OF SCENE, handed over like everything else a graph may
            // reach (ADR-0063 §5). Absent, `Set Session Value` writes nowhere and
            // `Get Session Value` reads nothing — which is what a headless step does.
            session: this.#session,
            // AND THE ONE THING A STEP MAY ASK OF THE APPLICATION (ADR-0063 §2). It records;
            // it does not load, and it does not wait.
            requestScene: id => this.requestScene(id)
        };

        // DETECT FIRST, THEN BEHAVE. The transitions this step raises are worked out against
        // the Transforms the previous step left behind, before a single graph runs — so a
        // `Destroy` inside a collision callback cannot retroactively change the set of events
        // the step had already decided, and the second bullet to hit an enemy sees the same
        // decision the first one did (ADR-0059 §4).
        this.#collisions.update(this.#scene, this.#crossings);

        for (const object of hierarchyOrder(this.#scene)) {
            if (!object.active) continue;

            const components = object.components;
            for (const type of globalThis.Object.keys(components)) {
                // A DESTROYED OBJECT STOPS RUNNING AT ONCE (ADR-0056 §5). The order is
                // materialised before the loop — it has to be, or removing an object would
                // shift the walk under itself — so an object a graph destroyed earlier in
                // THIS step is still in the list. Running it would simulate an object the
                // scene no longer holds, and running its remaining components after one of
                // them destroyed the object they sit on would be the same defect one level
                // down. Asked here rather than only at the top of the object loop, because
                // both cases are the same question: is this object still in the scene?
                if (!this.#scene.has(object)) break;

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

        // AND THEN THE BODIES MOVE (ADR-0067 §4). Last, on purpose: a graph that read a key
        // and set a velocity earlier in THIS step has already run, so the character answers
        // the key it was pressed on rather than one step later. It is also the only order in
        // which a body can be stopped at all — "how far did it get" cannot be answered
        // halfway through a walk that is still changing the speeds it depends on.
        //
        // DETECTION STAYS WHERE IT WAS, at the top, against the positions the previous step
        // left behind. `Enter`, `Stay`, `Exit` and `Is Overlapping` are untouched by this
        // line; what moved is what happens to a Transform, which those three never read.
        this.#crossings = [];
        moveBodies(this.#scene, {
            deltaTime: this.#clock.fixedStep,
            onCross: (body, other) => this.#crossings.push([body, other])
        });

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
        // The definitions a drawing component may name — a Tilemap's Tileset today — resolved
        // before the frame, exactly as a step's are (ADR-0062 §1, ADR-0070 §5).
        return this.#sceneRenderer.render(this.#scene, { resources: this.#resources, ...options });
    }
}
