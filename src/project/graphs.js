// Loading Component definitions, and binding the graphs they carry.
//
// THIS IS THE ANSWER TO "WHO CALLS bind()" — a question ADR-0009, ADR-0015 and ADR-0016
// each left open. The Project layer does, because it is the only layer that can: the Core
// never reaches storage, and the Runtime must not either.
//
//   MyComponent.px                     ONE resource: identity, properties, graph
//        │
//        ▼
//   project.read(id)                   the Project reads the payload, once
//        │
//        ▼
//   defineComponent(definition)        the Core turns data into an ordinary type
//        │
//        ▼
//   behaviors.bind(Type, graph)        the Runtime receives a value, never an identifier
//
// `behaviors` is PASSED IN, never imported. That is what keeps `project/ -> runtime/` from
// existing while still letting the Project drive the binding: the caller — the Editor, a
// server's start-up, a test — owns both objects and hands one to the other.
//
// ONE RESOURCE, SO ONE COPY (ADR-0026). The graph travels inside the definition it belongs
// to; editing it means writing that payload and binding again, which is exactly the
// invalidation `Behaviors` already implements (ADR-0016 §7). There is no second read, no
// second resource, and no way for the two halves of a `.px` to disagree.
//
// AND IT IS THE DOOR WHERE A BROKEN GRAPH IS STOPPED (ADR-0064 §6). `validateGraph()` has
// always been able to say that a wire names a port no node has; nothing asked it before a
// game started, so the interpreter met the connection at run time, found no such port, and
// carried on with the input's default — silently, for ever. A creator whose player would not
// move had no way to learn why.
//
// STOPPED HERE RATHER THAN IN THE INTERPRETER, for three reasons. It is the one door every
// `.px` passes through on its way into a running game; the check costs nothing per frame
// because it happens once per bind; and `Behaviors` is a duck-typed seam whose graphs need
// not be standard payloads at all (its own tests bind hand-made objects to hand-made
// interpreters), so a validator wired in there would be validating things it does not
// govern.
//
// A BAD `.px` IS SKIPPED, NEVER FATAL (ADR-0012). Its Component still exists, still attaches
// and still carries its properties; only the behaviour is withheld, and the reason is
// reported with the node and the port that caused it. One broken graph must not stop a
// project from opening — that is the same rule a broken definition already gets below.

import {
    componentGraph,
    declaredProperties,
    defineComponent,
    nodes as defaultNodes,
    runnable,
    validateGraph
} from '../core/mod.js';
import { ResourceKind } from './resource.js';

/**
 * Turn the project's component resources into registered types, graphs bound.
 *
 * @param {object} project - The project to load from
 * @param {object} options - Options
 * @param {object} options.registry - The ComponentRegistry to fill
 * @param {object} [options.behaviors] - The runtime's Behaviors host, when there is one
 * @param {object} [options.nodes] - The NodeRegistry graphs are judged against
 * @param {Function} [options.onError] - Called with { resource, error } instead of throwing
 * @param {Function} [options.onInvalid] - Called with { component, issues } for a graph that
 *   cannot be run. Its type is still registered; only its behaviour is withheld
 * @returns {Promise<Function[]>} The component classes that were registered
 */
export async function loadComponentDefinitions(project, { registry, behaviors, nodes, onError, onInvalid } = {}) {
    const loaded = [];

    for (const resource of project.resources(ResourceKind.COMPONENT)) {
        try {
            const definition = await project.read(resource.id);
            if (!definition) continue;

            const Component = defineComponent(definition);
            // `replace` because reloading a project, or re-reading an edited definition,
            // is a deliberate act — the collision guard is there to catch two unrelated
            // classes claiming one type, not a reload (ADR-0016 §6).
            registry.register(Component, { replace: true });

            if (behaviors) await bindGraph(project, Component, behaviors, { nodes, onInvalid });
            loaded.push(Component);
        } catch (error) {
            // One broken definition must not stop a project from opening. Reported and
            // skipped, in the spirit of ADR-0012.
            if (!onError) throw error;
            onError({ resource, error });
        }
    }

    return loaded;
}

/**
 * Bind the graph a component type carries, unless it cannot be run.
 *
 * `project` is still a parameter, and deliberately: reading a `.px` from storage is this
 * layer's job even when the graph turns out to be already in hand, and a caller should not
 * have to know which of the two it is.
 *
 * WHAT IS CHECKED AND WHAT IS NOT. Only ERROR findings withhold the binding: a wire to a
 * port no node has, a node type nobody declares, a value that depends on itself. A WARNING —
 * a `Set Property` with nothing chosen yet — is a graph in progress, and refusing to run one
 * would make the Editor unusable while a creator is building (core/graph/validate.js).
 *
 * @param {object} project - The project the type was loaded from
 * @param {Function|object} component - A component class or instance
 * @param {object} behaviors - The runtime's Behaviors host
 * @param {object} [options] - Options
 * @param {object} [options.nodes] - The NodeRegistry the graph is judged against
 * @param {Function} [options.onInvalid] - Called with `{ component, issues }` instead of binding
 * @returns {Promise<object|null>} The graph that was bound, or null when there is none to bind
 */
export async function bindGraph(project, component, behaviors, { nodes = defaultNodes, onInvalid } = {}) {
    const graph = componentGraph(component);
    if (!graph) return null;

    const issues = checkGraph(graph, { component, nodes });
    if (!runnable(issues)) {
        onInvalid?.({ component, issues });
        return null;
    }

    behaviors.bind(component, graph);
    return graph;
}

/**
 * Judge a graph against the catalogue and the properties it will run with.
 *
 * ONE CALL, SO THE THREE DOORS AGREE. A `.px` reaches a running game through a project load,
 * through the Editor installing an edited definition, and through the live channel a Preview
 * follows — and all three must judge it by the same rule, or a graph that the Editor refused
 * would start running the moment someone opened a Preview.
 *
 * @param {object} graph - The graph payload
 * @param {object} [options] - Options
 * @param {Function|object} [options.component] - The type it belongs to, for its properties
 * @param {object} [options.nodes] - The NodeRegistry the graph is judged against
 * @returns {object[]} The findings, empty when nothing is wrong
 */
export function checkGraph(graph, { component = null, nodes = defaultNodes } = {}) {
    if (!graph) return [];

    return validateGraph(graph, {
        registry: nodes,
        properties: component ? declaredProperties(component) : []
    });
}

/**
 * Read the graph held by a `.px` resource.
 *
 * @param {object} project - The project to read from
 * @param {string} id - The `.px` resource's identifier
 * @returns {Promise<object|null>} The graph, or null when there is none
 */
export async function readGraph(project, id) {
    if (!id) return null;

    const definition = await project.read(id);
    return definition?.graph ?? null;
}
