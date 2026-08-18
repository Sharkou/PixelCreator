// The graph interpreter — what makes a `.px` run (ADR-0009 Q7, ADR-0015, ADR-0027).
//
// INTERPRETED, NEVER COMPILED. No `eval`, no `new Function`, no generated source. ADR-0009
// settled this: a gameplay graph runs a few dozen nodes per step, and step-by-step
// debuggability plus the absence of arbitrary code execution are worth more than raw speed
// — it is what makes `.px` the format that is safe to share.
//
// THIS IS THE OTHER HALF OF THE CATALOGUE. `core/graph/standard.js` says what a node IS;
// this file says WHEN nodes run and in what order. It owns exactly the four things that
// are not a property of any single node:
//
//   flow          which node runs next, and depth-first when one node continues twice
//   data          pulling a value from upstream, memoised inside one step
//   protection    a budget, and a cycle guard, so a bad graph cannot hang a frame
//   failure       a structured GraphError, thrown, for the runtime to isolate and report
//
// TWO LEVELS, BECAUSE TWO DIFFERENT THINGS ARE SHARED (ADR-0015 §3). Reading a graph
// depends on the graph alone, so it happens once and every component of that type shares
// it. Running one depends on the instance, so each component gets its own execution state.
// A hundred Controllers share one reading and never share a state — which is why the seam
// `Behaviors` defines is a factory and not an object.
//
// HEADLESS BY CONSTRUCTION. Nothing here touches the DOM, a clock, a random source or
// storage: time comes from the step context, values come from the component, and the one
// node that talks to the outside — `Log` — is handed its sink. The same graph therefore
// reaches the same state on a client and on a server, which is what ADR-0011 requires of
// an authoritative server and what the whole product rests on.
//
// A GRAPH IS READ ONCE AND NEVER MUTATED (ADR-0016 §7). What arrives here is the plain
// payload a `.px` carries, not the Editor's live model: editing a Component means writing
// a new payload and binding it, and `Behaviors` swaps the running behaviour on the next
// step.

import {
    GRAPH_VERSION,
    GraphError,
    GraphIssueCode,
    PortKind,
    componentDefinition,
    componentSchema,
    nodes as defaultNodes,
    portsOf
} from '../../core/mod.js';

/**
 * How many nodes one event may run before the interpreter refuses to continue.
 *
 * A FLOW MAY LOOP — that is how a creator writes a loop, and forbidding it would be
 * forbidding the feature (ADR-0027). What must not happen is a frame that never ends, so a
 * budget bounds one event's execution and a graph that exceeds it fails loudly, with the
 * node it was on. Four thousand is far past any honest gameplay graph and far below a
 * hang a creator would notice as one.
 */
export const DEFAULT_BUDGET = 4096;

/**
 * Build the interpreter `Behaviors` is constructed with.
 *
 * @param {object} [options] - Options
 * @param {object} [options.registry] - The NodeRegistry node types are resolved in
 * @param {number} [options.budget] - Nodes one event may run
 * @param {Function} [options.log] - Sink for the `Log` node; the node is inert without one
 * @returns {Function} (graph) => (component) => Behavior
 */
export function createGraphInterpreter({ registry = defaultNodes, budget = DEFAULT_BUDGET, log = null } = {}) {
    return graph => interpretGraph(graph, { registry, budget, log });
}

/**
 * Read a graph, once, into a factory of behaviours.
 *
 * @param {object} graph - The graph payload a `.px` carries
 * @param {object} [options] - Options
 * @param {object} [options.registry] - The NodeRegistry node types are resolved in
 * @param {number} [options.budget] - Nodes one event may run
 * @param {Function} [options.log] - Sink for the `Log` node
 * @returns {Function} (component) => Behavior
 */
export function interpretGraph(graph, { registry = defaultNodes, budget = DEFAULT_BUDGET, log = null } = {}) {
    const compiled = compile(graph, registry);

    return function create(component) {
        // ONE EXECUTION STATE PER COMPONENT. `started` is the whole of it today, and it is
        // already enough to show why the seam is a factory: two Controllers must each get
        // their own first step (ADR-0015 §3).
        let started = false;

        return {
            /**
             * Advance this component's graph by one simulation step.
             * @param {object} self - The Object the component is attached to
             * @param {object} ctx - The step context: time, deltaTime, scene, input
             */
            update(self, ctx) {
                const state = {
                    self,
                    ctx,
                    component,
                    properties: propertiesOf(component),
                    log
                };

                // `start` before `update`, on the first step and only there: a graph that
                // initialises a property must have done so before anything reads it.
                if (!started) {
                    started = true;
                    runEvent(compiled, 'start', state, budget);
                }
                runEvent(compiled, 'update', state, budget);
            }
        };
    };
}

/**
 * Turn a payload into the indexes execution needs.
 *
 * STRUCTURAL CHECKS ONLY. What a node references — a property that may since have been
 * deleted — is checked when the node runs, because the properties belong to the component
 * and a graph is read before any component exists. The Editor runs the full
 * `validateGraph()` against both, and reports what this cannot see (ADR-0027).
 */
function compile(graph, registry) {
    if (!graph || typeof graph !== 'object') {
        throw new GraphError(GraphIssueCode.UNKNOWN_VERSION, 'This is not a graph.');
    }
    if (graph.version !== undefined && graph.version !== GRAPH_VERSION) {
        throw new GraphError(
            GraphIssueCode.UNKNOWN_VERSION,
            `This graph is version ${graph.version}; this build reads version ${GRAPH_VERSION}.`
        );
    }

    const byId = new Map();
    const definitions = new Map();
    const entries = new Map();

    for (const node of graph.nodes ?? []) {
        const definition = registry.get(node.type);
        if (!definition) {
            throw new GraphError(
                GraphIssueCode.UNKNOWN_NODE_TYPE,
                `No node type called "${node.type}".`,
                { node: node.id }
            );
        }
        byId.set(node.id, node);
        definitions.set(node.id, definition);

        if (definition.event) {
            if (!entries.has(definition.event)) entries.set(definition.event, []);
            entries.get(definition.event).push(node.id);
        }
    }

    // Two indexes, because flow is pushed and data is pulled. Flow is keyed by the OUTPUT
    // it leaves — one target, so a lookup answers "what runs next". Data is keyed by the
    // INPUT it feeds — one source, so a lookup answers "where does this value come from".
    const flow = new Map();
    const data = new Map();

    for (const connection of graph.connections ?? []) {
        const source = byId.get(connection.from?.node);
        const target = byId.get(connection.to?.node);
        if (!source || !target) continue;

        const ports = portsOf(definitions.get(source.id), source, {});
        const output = ports.outputs.find(port => port.id === connection.from.port);
        // A port a node no longer declares is skipped rather than fatal: the validator
        // reports it, and a graph with one stale wire still runs the rest.
        if (!output) continue;

        const index = output.kind === PortKind.FLOW ? flow : data;
        const key = output.kind === PortKind.FLOW
            ? portKey(connection.from.node, connection.from.port)
            : portKey(connection.to.node, connection.to.port);

        if (!index.has(key)) index.set(key, connection);
    }

    return { byId, definitions, entries, flow, data };
}

/**
 * Run every entry node of one event, in graph order.
 *
 * Graph order, not an arbitrary one: two `On Update` nodes in one graph run in the order
 * the payload lists them, on every machine. Determinism is not something added later, it is
 * this line (ADR-0011).
 */
function runEvent(compiled, event, state, budget) {
    for (const id of compiled.entries.get(event) ?? []) {
        const node = compiled.byId.get(id);
        const outputs = portsOf(compiled.definitions.get(id), node, {}).outputs;

        for (const port of outputs) {
            if (port.kind !== PortKind.FLOW) continue;
            runFlow(compiled, compiled.flow.get(portKey(id, port.id)), state, budget);
        }
    }
}

/**
 * Follow a flow, depth-first, until it runs out or runs over budget.
 *
 * DEPTH-FIRST IS NOT AN IMPLEMENTATION DETAIL. A `Sequence` continues twice, and a creator
 * means "everything the first branch does, then everything the second does" — not the two
 * interleaved. A stack fed in reverse gives exactly that, and gives it deterministically.
 */
function runFlow(compiled, start, state, budget) {
    if (!start) return;

    const stack = [start.to];
    let steps = 0;

    while (stack.length > 0) {
        if (++steps > budget) {
            throw new GraphError(
                GraphIssueCode.BUDGET_EXCEEDED,
                `This graph ran more than ${budget} nodes in one event; it is probably looping.`,
                { node: stack.at(-1)?.node ?? null }
            );
        }

        const reached = stack.pop();
        const node = compiled.byId.get(reached.node);
        if (!node) continue;

        const definition = compiled.definitions.get(node.id);
        // A NEW VALUE CACHE PER FLOW STEP. Memoising across a whole event would let a
        // `Get Property` read before a `Set Property` and keep serving the old value after
        // it — the graph would then disagree with the model it just wrote.
        const frame = { values: new Map() };
        const result = definition.execute ? definition.execute(io(compiled, node, state, frame, new Set())) : null;

        const continuations = result === null || result === undefined
            ? []
            : (globalThis.Array.isArray(result) ? result : [result]);

        // Reversed, so the first declared continuation is the first one popped.
        for (let index = continuations.length - 1; index >= 0; index--) {
            const next = compiled.flow.get(portKey(node.id, continuations[index]));
            if (next) stack.push(next.to);
        }
    }
}

/**
 * What a node is handed when it runs.
 *
 * Deliberately small: its own params, its inputs, the component it belongs to, the object
 * carrying it, and the step context. Nothing global, nothing injected from an environment,
 * and no way to reach storage — which is the whole reason a graph is safe to share.
 */
function io(compiled, node, state, frame, visiting) {
    return {
        node,
        self: state.self,
        ctx: state.ctx,
        component: state.component,
        properties: state.properties,
        log: state.log,
        param: name => node.params?.[name],
        input: portId => readInput(compiled, node, portId, state, frame, visiting)
    };
}

/** The value feeding one of a node's data inputs, or that input's declared default. */
function readInput(compiled, node, portId, state, frame, visiting) {
    const connection = compiled.data.get(portKey(node.id, portId));
    if (!connection) return defaultOf(compiled, node, portId, state);

    return evaluate(compiled, connection.from.node, connection.from.port, state, frame, visiting);
}

/**
 * Pull a value out of an output port, reading whatever it depends on first.
 *
 * Memoised within one flow step, so a value feeding three inputs is computed once and all
 * three see the same number — which matters the moment a node stops being pure.
 */
function evaluate(compiled, nodeId, portId, state, frame, visiting) {
    const key = portKey(nodeId, portId);
    if (frame.values.has(key)) return frame.values.get(key);

    if (visiting.has(nodeId)) {
        throw new GraphError(
            GraphIssueCode.DATA_CYCLE,
            'These values depend on each other, so there is no order to evaluate them in.',
            { node: nodeId, port: portId }
        );
    }

    const node = compiled.byId.get(nodeId);
    if (!node) return null;

    const definition = compiled.definitions.get(nodeId);
    visiting.add(nodeId);
    let produced = {};
    try {
        produced = definition.evaluate ? definition.evaluate(io(compiled, node, state, frame, visiting)) ?? {} : {};
    } finally {
        visiting.delete(nodeId);
    }

    for (const [port, value] of globalThis.Object.entries(produced)) {
        frame.values.set(portKey(nodeId, port), value);
    }

    return frame.values.has(key) ? frame.values.get(key) : null;
}

/** What an unconnected data input yields: the port's own declared default. */
function defaultOf(compiled, node, portId, state) {
    const ports = portsOf(compiled.definitions.get(node.id), node, { properties: state.properties });
    return ports.inputs.find(port => port.id === portId)?.default ?? null;
}

/**
 * The properties a component's type declares, as the graph addresses them.
 *
 * A `.px` carries an `id` inside every descriptor, minted once, and that is what a node
 * stores — so renaming a property leaves the graph wired (ADR-0027). A hand-written class
 * with a `static schema` has no such ids, so its property names stand in: a graph bound to
 * a shipped component still works, and nothing had to be added to that component.
 */
function propertiesOf(component) {
    const declared = componentDefinition(component)?.properties ?? componentSchema(component) ?? {};

    return globalThis.Object.entries(declared).map(([name, descriptor]) => ({
        ...descriptor,
        id: descriptor?.id ?? name,
        name
    }));
}

function portKey(nodeId, portId) {
    return `${nodeId} ${portId}`;
}
