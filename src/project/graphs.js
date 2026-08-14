// Loading Component definitions, and resolving the graphs they reference.
//
// THIS IS THE ANSWER TO "WHO CALLS bind()" — a question ADR-0009, ADR-0015 and ADR-0016
// each left open. The Project layer does, because it is the only layer that can: the Core
// never reaches storage, and the Runtime must not either.
//
//   definition.graph = 'res_d4'        a ResourceId, and nothing more (ADR-0016)
//        │
//        ▼
//   project.read('res_d4')             the Project resolves it
//        │
//        ▼
//   behaviors.bind(Type, graph)        the Runtime receives a value, never an identifier
//
// `behaviors` is PASSED IN, never imported. That is what keeps `project/ -> runtime/` from
// existing while still letting the Project drive the binding: the caller — the Editor, a
// server's start-up, a test — owns both objects and hands one to the other.
//
// The graph is not duplicated anywhere: one GraphResource, read once per load, bound by
// object identity. Editing it means writing a new payload and binding again, which is
// exactly the invalidation `Behaviors` already implements (ADR-0016 §7).

import { componentGraphId, defineComponent } from '../core/mod.js';
import { ResourceKind } from './resource.js';

/**
 * Turn the project's component resources into registered types, graphs bound.
 *
 * @param {object} project - The project to load from
 * @param {object} options - Options
 * @param {object} options.registry - The ComponentRegistry to fill
 * @param {object} [options.behaviors] - The runtime's Behaviors host, when there is one
 * @param {Function} [options.onError] - Called with { resource, error } instead of throwing
 * @returns {Promise<Function[]>} The component classes that were registered
 */
export async function loadComponentDefinitions(project, { registry, behaviors, onError } = {}) {
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

            if (behaviors) await bindGraph(project, Component, behaviors);
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
 * Resolve the graph a component type references, and bind it.
 *
 * @param {object} project - The project to read from
 * @param {Function|object} component - A component class or instance
 * @param {object} behaviors - The runtime's Behaviors host
 * @returns {Promise<object|null>} The graph that was bound, or null when there is none
 */
export async function bindGraph(project, component, behaviors) {
    const graphId = componentGraphId(component);
    if (!graphId) return null;

    const graph = await project.read(graphId);
    if (!graph) return null;

    behaviors.bind(component, graph);
    return graph;
}

/**
 * Read a graph payload by identifier.
 * @param {object} project - The project to read from
 * @param {string} graphId - The GraphResource's identifier
 * @returns {Promise<object|null>|object|null} The graph, or null
 */
export function readGraph(project, graphId) {
    return graphId ? project.read(graphId) : null;
}
