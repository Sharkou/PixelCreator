// Is this graph runnable, and if not, exactly where is it wrong (ADR-0027).
//
// PURE, AND OUTSIDE THE UI. It takes a payload — the plain `{ version, nodes, connections }`
// a `.px` carries — plus the catalogue and the properties it is meant to run against, and
// it returns findings. It draws nothing, throws nothing, and reads no storage, which is
// what lets the Graph window mark bad nodes, the interpreter refuse to run, and a headless
// build check a project, all from one answer.
//
// IT TAKES A PAYLOAD, NOT THE LIVE MODEL, deliberately: what a server loads and what an
// editor holds have to be judged by the same rules, and the payload is the only form both
// have. The live `Graph` serializes into it for free.
//
// WHAT IS AN ERROR AND WHAT IS A WARNING. An error means the graph cannot be run as it
// stands — a node type nobody declares, a wire between ports that do not exist. A warning
// means it runs but something is missing that a creator meant to fill in: a `Set Property`
// with nothing selected still executes, it just has nothing to write to. Errors stop the
// interpreter; warnings reach the panel.
//
// CYCLES ARE NOT UNIFORMLY BANNED. A flow that loops back is how a creator writes a loop,
// and refusing it would be refusing the feature; the interpreter bounds it with a budget
// instead. A DATA cycle is different: a value that depends on itself has no order it could
// be evaluated in, so it is an error and it is found here rather than at frame 1.

import { GraphIssueCode, GraphSeverity, graphIssue } from './errors.js';
import { GRAPH_VERSION } from './graph.js';
import { PortDirection, PortKind, nodes as defaultNodes, portsOf, typesCompatible } from './nodes.js';
import {
    COMPONENT_PROPERTY_REFERENCE,
    COMPONENT_REFERENCE,
    PROPERTY_REFERENCE,
    referencedComponent,
    referencedComponentProperty
} from './standard.js';

/**
 * What each kind of reference resolves against, and what to say when it resolves to nothing.
 *
 * ONE TABLE RATHER THAN A CHAIN OF `if`. A node type declares WHICH kind of thing a param
 * names (ADR-0027 §4, extended by ADR-0034 §3.3), and adding a kind is a row here — the same
 * shape the drag rules and the node catalogue already have.
 *
 * `resolve` answers a falsy value for "this names something that is not there", and `true`
 * for "there is nothing to check it against". The second is not a pass by charity: a
 * headless check has no catalogue of Component types, and a reference that cannot be checked
 * is not a reference that is wrong.
 */
const REFERENCES = {
    [PROPERTY_REFERENCE]: {
        empty: 'No property is selected on this node.',
        missing: 'This node refers to a property the Component no longer declares.',
        resolve: (node, context) =>
            (context.properties ?? []).some(property => property.id === node.params?.property)
    },
    [COMPONENT_REFERENCE]: {
        empty: 'No Component is selected on this node.',
        missing: 'This node names a Component type this project does not declare.',
        resolve: (node, context) => (context.components ? referencedComponent(node, context) : true)
    },
    [COMPONENT_PROPERTY_REFERENCE]: {
        empty: 'No property is selected on this node.',
        missing: 'This node names a property that Component does not declare.',
        resolve: (node, context) => (context.components ? referencedComponentProperty(node, context) : true)
    }
};

/**
 * Check a graph payload.
 *
 * @param {object} graph - A serialized graph, `{ version, nodes, connections }`
 * @param {object} [options] - Options
 * @param {object} [options.registry] - The NodeRegistry node types are resolved in
 * @param {object[]} [options.properties] - The Component's declared properties
 * @param {object[]} [options.components] - The project's Component types, when they are known
 * @returns {object[]} Findings, in the order they were discovered
 */
export function validateGraph(graph, { registry = defaultNodes, properties = [], components = null } = {}) {
    const issues = [];

    if (!graph || typeof graph !== 'object') {
        return [graphIssue({
            code: GraphIssueCode.UNKNOWN_VERSION,
            message: 'This is not a graph.'
        })];
    }

    if (graph.version !== undefined && graph.version !== GRAPH_VERSION) {
        // Fatal on its own: nothing below can be trusted to mean what it says in a shape
        // this build has never seen.
        return [graphIssue({
            code: GraphIssueCode.UNKNOWN_VERSION,
            message: `This graph is version ${graph.version}; this build reads version ${GRAPH_VERSION}.`
        })];
    }

    const context = { properties, components };
    const byId = new Map();

    for (const node of graph.nodes ?? []) {
        if (byId.has(node.id)) {
            issues.push(graphIssue({
                code: GraphIssueCode.DUPLICATE_NODE_ID,
                message: 'Two nodes claim one identifier.',
                node: node.id
            }));
            continue;
        }
        byId.set(node.id, node);

        const definition = registry.get(node.type);
        if (!definition) {
            issues.push(graphIssue({
                code: GraphIssueCode.UNKNOWN_NODE_TYPE,
                message: `No node type called "${node.type}".`,
                node: node.id
            }));
            continue;
        }

        issues.push(...checkReferences(node, definition, context));
    }

    const filled = new Map();

    for (const connection of graph.connections ?? []) {
        const issue = checkConnection(connection, { byId, registry, context, filled });
        if (issue) issues.push(issue);
    }

    issues.push(...findDataCycles(graph, { byId, registry, context }));

    return issues;
}

/**
 * Whether a graph may be run as it stands.
 * @param {object[]} issues - Findings, as validateGraph() produces them
 * @returns {boolean} True when nothing of error severity was found
 */
export function runnable(issues) {
    return !issues.some(issue => issue.severity === GraphSeverity.ERROR);
}

/**
 * A node's params that name something, checked against what exists.
 *
 * THIS IS WHERE A DELETED PROPERTY SURFACES. ADR-0027 refuses a silent dangling reference:
 * a node pointing at a property that is gone is reported here, marked in the window, and
 * refused at run time — three views of one finding, never three rules.
 */
function checkReferences(node, definition, context) {
    const issues = [];

    for (const [name, descriptor] of globalThis.Object.entries(definition.params ?? {})) {
        const kind = REFERENCES[descriptor?.reference];
        if (!kind) continue;

        const id = node.params?.[name] ?? null;
        if (!id) {
            issues.push(graphIssue({
                code: GraphIssueCode.MISSING_REFERENCE,
                severity: GraphSeverity.WARNING,
                message: kind.empty,
                node: node.id
            }));
            continue;
        }

        if (!kind.resolve(node, context)) {
            issues.push(graphIssue({
                code: GraphIssueCode.MISSING_PROPERTY,
                message: kind.missing,
                node: node.id,
                property: id
            }));
        }
    }

    return issues;
}

function checkConnection(connection, { byId, registry, context, filled }) {
    const source = byId.get(connection.from?.node);
    const target = byId.get(connection.to?.node);

    if (!source || !target) {
        return graphIssue({
            code: GraphIssueCode.UNKNOWN_NODE,
            message: 'A connection names a node this graph does not hold.',
            connection: connection.id
        });
    }

    if (source === target) {
        return graphIssue({
            code: GraphIssueCode.SELF_CONNECTION,
            message: 'A node cannot feed itself.',
            connection: connection.id,
            node: source.id
        });
    }

    const output = find(registry, source, context, PortDirection.OUTPUT, connection.from.port);
    const input = find(registry, target, context, PortDirection.INPUT, connection.to.port);

    // A port that does not exist and a port on the wrong side are told apart, because they
    // are different mistakes: one is a stale graph, the other is a wire drawn backwards.
    if (!output) {
        const asInput = find(registry, source, context, PortDirection.INPUT, connection.from.port);
        return graphIssue({
            code: asInput ? GraphIssueCode.PORT_DIRECTION_MISMATCH : GraphIssueCode.UNKNOWN_PORT,
            message: asInput
                ? `"${connection.from.port}" is an input, and a connection leaves an output.`
                : `"${connection.from.port}" is not a port of "${source.type}".`,
            connection: connection.id,
            node: source.id,
            port: connection.from.port
        });
    }

    if (!input) {
        const asOutput = find(registry, target, context, PortDirection.OUTPUT, connection.to.port);
        return graphIssue({
            code: asOutput ? GraphIssueCode.PORT_DIRECTION_MISMATCH : GraphIssueCode.UNKNOWN_PORT,
            message: asOutput
                ? `"${connection.to.port}" is an output, and a connection arrives at an input.`
                : `"${connection.to.port}" is not a port of "${target.type}".`,
            connection: connection.id,
            node: target.id,
            port: connection.to.port
        });
    }

    if (output.kind !== input.kind) {
        return graphIssue({
            code: GraphIssueCode.PORT_KIND_MISMATCH,
            message: 'Execution and values do not mix: a flow port only connects to a flow port.',
            connection: connection.id
        });
    }

    if (output.kind === PortKind.DATA && !typesCompatible(output.type, input.type)) {
        return graphIssue({
            code: GraphIssueCode.TYPE_MISMATCH,
            message: `A ${output.type} cannot be read as a ${input.type}.`,
            connection: connection.id
        });
    }

    // A data input has one source and a flow output has one target: both are functions, and
    // a second wire is an ambiguity nothing downstream could resolve.
    const key = output.kind === PortKind.FLOW
        ? `out:${connection.from.node}:${connection.from.port}`
        : `in:${connection.to.node}:${connection.to.port}`;

    if (filled.has(key)) {
        return graphIssue({
            code: GraphIssueCode.PORT_ALREADY_CONNECTED,
            message: output.kind === PortKind.FLOW
                ? 'This output already continues somewhere else.'
                : 'This input already has a source.',
            connection: connection.id,
            node: output.kind === PortKind.FLOW ? connection.from.node : connection.to.node,
            port: output.kind === PortKind.FLOW ? connection.from.port : connection.to.port
        });
    }
    filled.set(key, connection.id);

    return null;
}

/**
 * Values that depend on themselves.
 *
 * Depth-first over DATA edges only. Flow edges are skipped on purpose — a flow that loops
 * back is a loop a creator wrote, and it is bounded at run time rather than forbidden here.
 */
function findDataCycles(graph, { byId, registry, context }) {
    const edges = new Map();
    for (const connection of graph.connections ?? []) {
        const source = byId.get(connection.from?.node);
        const target = byId.get(connection.to?.node);
        if (!source || !target) continue;

        // DATA EDGES ONLY. A flow edge that loops back is a loop a creator wrote, and the
        // walk below must not mistake it for a value defined in terms of itself.
        const output = find(registry, source, context, PortDirection.OUTPUT, connection.from.port);
        if (output?.kind !== PortKind.DATA) continue;

        // Reversed: a node depends on whatever feeds its inputs, so evaluation walks
        // upstream and a cycle is a node reachable from itself that way.
        const from = connection.to.node;
        const to = connection.from.node;
        if (!edges.has(from)) edges.set(from, []);
        edges.get(from).push({ node: to, connection: connection.id });
    }

    const issues = [];
    const state = new Map();

    const walk = (id, stack) => {
        if (state.get(id) === 'done') return;
        if (state.get(id) === 'open') {
            issues.push(graphIssue({
                code: GraphIssueCode.DATA_CYCLE,
                message: 'These values depend on each other, so there is no order to evaluate them in.',
                node: id,
                connection: stack.at(-1) ?? null
            }));
            return;
        }

        state.set(id, 'open');
        for (const edge of edges.get(id) ?? []) walk(edge.node, [...stack, edge.connection]);
        state.set(id, 'done');
    };

    for (const id of byId.keys()) walk(id, []);
    return issues;
}

function find(registry, node, context, direction, portId) {
    const ports = portsOf(registry.get(node.type), node, context);
    const side = direction === PortDirection.INPUT ? ports.inputs : ports.outputs;
    return side.find(port => port.id === portId) ?? null;
}
