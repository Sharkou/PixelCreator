// Behaviors — how a Component's `.px` graph becomes something the simulation runs.
//
// THE MODEL, AS THE EDITOR SHOWS IT:
//
//   Object
//   ├── Transform
//   ├── Sprite
//   ├── Controller
//   │   └── Controller.px
//   └── Collider
//
// `Controller.px` is not a component and never becomes one. It is the *behavior* of the
// `Controller` component type: the graph that says what a Controller does. There is no
// generic `Script` component, and a graph never generates a component type — the type
// exists first, in the registry (core/component.js), and a graph may be bound to it.
//
// `.js` needs nothing from this file. A module whose default export is a component class
// is a component *type*, resolved by `import()` and registered like any other (ADR-0009).
// A graph is the other half of that sentence: the behavior of a type, not a type.
//
// A type comes either from a class — shipped with the engine or loaded from `.js` — or
// from a definition a creator wrote in the Editor (core/definition.js, ADR-0016). The
// seam below is identical for both: it binds a graph to a type name, and never asks where
// the type came from.
//
// WHAT THIS FILE IS NOT. It is not the `.px` language, not the graph model, and not the
// interpreter. Those are separate steps, and building one here would decide by accident
// what the graph looks like. What is fixed here is the seam:
//
//   graph ──(interpret)──► create(component) ──► behavior.update(self, ctx)
//            once per graph      once per component        every step
//
// WHY TWO LEVELS AND NOT ONE. Interpreting a graph depends on the graph alone, so it is
// done once and shared by every component of that type. *Running* one depends on the
// instance — a graph has variables, timers, a position in its own execution — so each
// component instance gets its own behavior. A hundred Controllers in a scene share one
// interpretation and never share an execution state. That independence is the whole
// reason the seam is a factory rather than a single object.
//
// THE BEHAVIOR IS NOT THE COMPONENT'S DATA. A component's own enumerable properties are
// its serialized state (core/serialize.js). A behavior is a live object with methods,
// derived from the graph; writing it onto the component would put functions into every
// snapshot and every replicated payload. It lives in a WeakMap keyed by the component,
// so what serializes is the component's data and nothing else.
//
// The component itself is handed to the factory, as the reactive Proxy the Object holds.
// A graph reads and writes the component's properties through it, so a write from a
// graph is an ordinary observable write — same Change, same replication, same Inspector
// update as a write from hand-written code.
//
// NO SECOND EXECUTION PATH. A graph runs because the runtime runs the component that
// owns it: same step, same order, same error isolation (ADR-0012). Client and server
// interpret the same graph through the same code — there is no ScriptSystem and no
// server variant (ADR-0005, ADR-0015).

import { componentType } from '../../core/component.js';
import { componentDefinition } from '../../core/definition.js';

/**
 * What an interpreted graph exposes for one component instance.
 *
 * Duck-typed, like components (ADR-0004): any object with these methods will do, and
 * `update` is optional — a graph that declares no simulation node is inert, not broken.
 *
 * Only `update` is part of the seam today. A graph that produces pixels needs its
 * component type to declare `draw`, which the scene renderer already knows how to run;
 * that arrives with the graph model, not before it.
 *
 * @typedef {object} Behavior
 * @property {(self: object, ctx: object) => void} [update] - Simulation, client and server
 */

export class Behaviors {

    #interpret;

    /** Component type name -> the graph bound to it. */
    #graphs = new Map();

    /** Graph -> the factory it was interpreted into, so a graph is read once. */
    #factories = new WeakMap();

    /** Component instance -> { graph, behavior }, so two instances never share a state. */
    #running = new WeakMap();

    /**
     * Create a behavior host.
     * @param {(graph: object) => (component: object) => Behavior} interpret - Graph interpreter
     */
    constructor(interpret) {
        if (typeof interpret !== 'function') {
            throw new TypeError('Behaviors: expected an interpreter function');
        }
        this.#interpret = interpret;
    }

    /**
     * Bind a graph to a component type.
     *
     * The graph may be left out for a type built from a definition, which already carries
     * one (ADR-0016) — the definition stays the single place the graph is written down.
     *
     * A GRAPH IS IMMUTABLE TO THE RUNTIME. It is read once and identified by its object
     * identity, so mutating one in place changes nothing. Editing `Controller.px` means
     * producing a new graph and binding it: the running behaviors are replaced on the
     * next step, on every Controller, with nothing to reload.
     *
     * @param {string|Function|object} type - Component type name, class or instance
     * @param {object} [graph] - The `.px` graph resource; the type's own when omitted
     * @returns {Behaviors} This host, so bindings can chain
     */
    bind(type, graph = componentDefinition(type)?.graph) {
        const name = componentType(type);
        if (!graph || typeof graph !== 'object') {
            throw new TypeError(`Behaviors.bind: "${name}" needs a graph`);
        }
        this.#graphs.set(name, graph);
        return this;
    }

    /**
     * Tell whether a component type has a graph.
     * @param {string|Function|object} type - Component type name, class or instance
     * @returns {boolean} True when a graph is bound
     */
    has(type) {
        return this.#graphs.has(componentType(type));
    }

    /**
     * Read the graph bound to a component type.
     * @param {string|Function|object} type - Component type name, class or instance
     * @returns {object|null} The graph, or null when the type has none
     */
    graphOf(type) {
        return this.#graphs.get(componentType(type)) ?? null;
    }

    /** The component type names that have a graph, sorted. */
    types() {
        return [...this.#graphs.keys()].sort();
    }

    /**
     * The behavior of a component instance, interpreting and instantiating on first use.
     *
     * Throws rather than returning null on a broken interpreter: a graph that cannot be
     * run is a failure its author has to see, and the runtime already reports a throw
     * without touching the model (ADR-0012). Swallowing it here would recreate the
     * Legacy silence.
     *
     * @param {object} component - The component, as the runtime holds it
     * @returns {Behavior|null} Its behavior, or null when its type has no graph
     */
    behaviorFor(component) {
        const type = componentType(component);
        const graph = this.#graphs.get(type);
        if (!graph) return null;

        // Compared, not just presence-checked: a rebound graph replaces the running
        // behavior instead of leaving the previous one in place.
        const running = this.#running.get(component);
        if (running && running.graph === graph) return running.behavior;

        const behavior = this.#factoryFor(graph, type)(component);
        if (!behavior || typeof behavior !== 'object') {
            throw new TypeError(`Behaviors: the graph of "${type}" produced no behavior`);
        }

        this.#running.set(component, { graph, behavior });
        return behavior;
    }

    /**
     * The factory a graph is interpreted into, read once per graph.
     * @param {object} graph - The graph resource
     * @param {string} type - The component type it is bound to, for error messages
     * @returns {(component: object) => Behavior} The factory
     */
    #factoryFor(graph, type) {
        const cached = this.#factories.get(graph);
        if (cached) return cached;

        const create = this.#interpret(graph);
        if (typeof create !== 'function') {
            throw new TypeError(
                `Behaviors: interpreting the graph of "${type}" did not produce a factory`
            );
        }

        this.#factories.set(graph, create);
        return create;
    }
}
