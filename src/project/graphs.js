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

import { componentGraph, defineComponent } from '../core/mod.js';
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
 * Bind the graph a component type carries.
 *
 * `project` is still a parameter, and deliberately: reading a `.px` from storage is this
 * layer's job even when the graph turns out to be already in hand, and a caller should not
 * have to know which of the two it is.
 *
 * @param {object} project - The project the type was loaded from
 * @param {Function|object} component - A component class or instance
 * @param {object} behaviors - The runtime's Behaviors host
 * @returns {Promise<object|null>} The graph that was bound, or null when there is none
 */
export async function bindGraph(project, component, behaviors) {
    const graph = componentGraph(component);
    if (!graph) return null;

    behaviors.bind(component, graph);
    return graph;
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
