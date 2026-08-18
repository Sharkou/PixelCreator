// The graph model — nodes, ports, connections, and the pipeline they mutate through.
//
// THE MODEL IS NOT THE VIEW, AND THIS FILE IS THE PROOF. Legacy's graph *was* the DOM: a
// node was a `<div>`, a connection was two elements pointing at each other through
// `connector.other`, and closing the tab lost the work because there was nothing else to
// save (ADR-0009). Here the graph is data with an identity, it serializes, it replicates,
// it undoes — and a renderer is something that reads it.
//
//   graph model        this file, and it imports no DOM
//        ↓
//   graph controller   editor/graph/, which turns pointers into intents
//        ↓
//   graph renderer     editor/windows/graph.js, which draws SVG
//
// EVERY MUTATION IS AN OPERATION (ADR-0008, ADR-0019). Adding a node, moving it, wiring
// two ports: each goes through a pipeline, so each is arbitrable, replicable and
// invertible with no code written for undo. Moving a node is the plainest case — a node is
// a reactive record, so a move is `SET_PROPERTY x` and `SET_PROPERTY y` in one batch, and
// its inverse already existed.
//
// IDENTITY IS NEVER A POSITION. A node has an id, a port has an id, a connection has an
// id, and a connection names `{ node, port }` by identity. Legacy addressed ports by their
// index in an array and shifted them as a creator typed; a graph written that way cannot
// survive a node type gaining a port.
//
// A DATA INPUT TAKES ONE SOURCE, A FLOW OUTPUT REACHES ONE TARGET. Both are functions:
// a value has one origin, and execution goes one way. The other side of each is free — one
// value may feed many inputs, and many flows may converge on one node. Wiring over an
// occupied port REPLACES what was there, in the same batch, because that is what a creator
// means by dropping a wire on a full socket.

import { Operations } from '../operations/operations.js';
import { OperationType, setPropertyOperation } from '../operations/operation.js';
import {
    addNodeOperation,
    connectOperation,
    disconnectOperation,
    removeNodeOperation
} from '../operations/graph-operations.js';
import { Origin } from '../properties/origin.js';
import { makeReactive } from '../properties/reactive.js';
import { createId } from '../id.js';
import { GraphIssueCode } from './errors.js';
import { PortDirection, PortKind, nodes as defaultNodes, portOf, portsOf, typesCompatible } from './nodes.js';

/**
 * Bumped when the graph payload's shape changes.
 *
 * Versioned from the first day because the format will change, and a payload that cannot
 * say which shape it is in is a migration nobody can write (ADR-0026).
 */
export const GRAPH_VERSION = 1;

/**
 * Build a node record.
 *
 * @param {object} spec - The node
 * @param {string} spec.type - The node type, as a NodeRegistry declares it
 * @param {string} [spec.id] - Existing identifier, used when loading
 * @param {number} [spec.x] - Position in graph space
 * @param {number} [spec.y] - Position in graph space
 * @param {object} [spec.params] - Values the node type declares params for
 * @returns {object} A plain node record
 */
export function createNode({ type, id, x = 0, y = 0, params = {} }) {
    if (typeof type !== 'string' || type === '') {
        throw new TypeError('createNode: a node needs a type');
    }

    return {
        id: id ?? createId(),
        type,
        x,
        y,
        params: { ...params }
    };
}

/**
 * Build a connection record.
 *
 * `from` is always the output side and `to` always the input side, whichever end the
 * creator started the drag from. One direction in the data means no code anywhere else has
 * to ask which way round a connection was stored.
 *
 * @param {object} spec - The connection
 * @param {object} spec.from - `{ node, port }` — an output port
 * @param {object} spec.to - `{ node, port }` — an input port
 * @param {string} [spec.id] - Existing identifier, used when loading
 * @returns {object} A frozen connection record
 */
export function createConnection({ from, to, id }) {
    return globalThis.Object.freeze({
        id: id ?? createId(),
        from: globalThis.Object.freeze({ node: from.node, port: from.port }),
        to: globalThis.Object.freeze({ node: to.node, port: to.port })
    });
}

export class Graph {

    #registry;
    #context;
    #operations;

    /** Node id -> the reactive node record, in insertion order. */
    #nodes = new Map();

    /** Connection id -> the frozen connection record, in insertion order. */
    #connections = new Map();

    /**
     * Create a graph.
     *
     * @param {object} [options] - Options
     * @param {object} [options.registry] - The NodeRegistry port shapes are read from
     * @param {Function} [options.context] - () => what dynamic ports depend on
     * @param {object} [options.operations] - The pipeline to mutate through; its own by default
     * @param {object} [options.authority] - Authority for the pipeline it creates
     */
    constructor({ registry = defaultNodes, context = () => ({}), operations, authority } = {}) {
        this.#registry = registry;
        this.#context = context;
        this.#operations = operations ?? new Operations({
            authority,
            resolve: target => this.#nodes.get(target.object) ?? null
        });

        this.registerHandlers(this.#operations);
    }

    /** The catalogue this graph's port shapes are read from. */
    get registry() {
        return this.#registry;
    }

    /** The pipeline every mutation of this graph travels through. */
    get operations() {
        return this.#operations;
    }

    /** The nodes, in insertion order. */
    nodes() {
        return [...this.#nodes.values()];
    }

    /**
     * Look a node up.
     * @param {string} id - The node's identifier
     * @returns {object|null} The reactive node, or null
     */
    node(id) {
        return this.#nodes.get(id) ?? null;
    }

    /** The connections, in insertion order. */
    connections() {
        return [...this.#connections.values()];
    }

    /**
     * Look a connection up.
     * @param {string} id - The connection's identifier
     * @returns {object|null} The connection, or null
     */
    connection(id) {
        return this.#connections.get(id) ?? null;
    }

    /**
     * The ports a node has right now.
     * @param {object|string} node - The node, or its identifier
     * @returns {{inputs: object[], outputs: object[]}} Its ports
     */
    portsOf(node) {
        const record = typeof node === 'string' ? this.node(node) : node;
        if (!record) return { inputs: [], outputs: [] };
        return portsOf(this.#registry.get(record.type), record, this.#context());
    }

    /**
     * One port of a node.
     * @param {object|string} node - The node, or its identifier
     * @param {string} direction - One of PortDirection
     * @param {string} portId - The port's identifier
     * @returns {object|null} The port, or null
     */
    portOf(node, direction, portId) {
        const record = typeof node === 'string' ? this.node(node) : node;
        if (!record) return null;
        return portOf(this.#registry.get(record.type), record, direction, portId, this.#context());
    }

    /**
     * Every connection touching a node.
     * @param {string} id - The node's identifier
     * @returns {object[]} The connections
     */
    connectionsOf(id) {
        return this.connections().filter(entry => entry.from.node === id || entry.to.node === id);
    }

    /**
     * The connection feeding an input port, or null.
     * @param {string} nodeId - The node's identifier
     * @param {string} portId - The input port's identifier
     * @returns {object|null} The connection
     */
    incoming(nodeId, portId) {
        return this.connections().find(entry => entry.to.node === nodeId && entry.to.port === portId) ?? null;
    }

    /**
     * The connections leaving an output port.
     * @param {string} nodeId - The node's identifier
     * @param {string} portId - The output port's identifier
     * @returns {object[]} The connections
     */
    outgoing(nodeId, portId) {
        return this.connections().filter(entry => entry.from.node === nodeId && entry.from.port === portId);
    }

    /**
     * Add a node, as one ADD_NODE operation.
     *
     * @param {object} spec - The node, as createNode() takes it
     * @param {object} [options] - Options
     * @param {number} [options.index] - Rank among the nodes
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object|null} The reactive node, or null when refused
     */
    addNode(spec, { index, actor, batch } = {}) {
        const node = spec.id && spec.type && spec.params ? spec : createNode(spec);

        const result = this.#operations.submit(addNodeOperation({
            node,
            index: index ?? null,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied ? this.node(node.id) : null;
    }

    /**
     * Remove a node and the connections that touched it, as one REMOVE_NODE operation.
     *
     * The connections travel WITH the operation rather than as separate ones, so undoing a
     * deletion puts the wiring back too. Removing them one by one would need an order to
     * be maintained between operations that must never be separated — the argument
     * ADR-0019 makes for `REMOVE_OBJECT.subtree`.
     *
     * @param {string} id - The node's identifier
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the node was removed
     */
    removeNode(id, { actor, batch } = {}) {
        const node = this.#nodes.get(id);
        if (!node) return false;

        const result = this.#operations.submit(removeNodeOperation({
            node: snapshot(node),
            index: this.indexOf(id),
            connections: this.connectionsOf(id),
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * Move a node, as one batch of two SET_PROPERTY operations.
     *
     * A position is two ordinary reactive fields, so moving needs no operation of its own:
     * it replicates, it inverts, and a drag across the canvas is ONE history entry because
     * the caller passes one `batch` for the whole gesture (ADR-0024 §4).
     *
     * @param {string} id - The node's identifier
     * @param {number} x - Destination, in graph space
     * @param {number} y - Destination, in graph space
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups this move with the rest of the gesture
     * @returns {boolean} True when anything moved
     */
    moveNode(id, x, y, { actor, batch } = {}) {
        const node = this.#nodes.get(id);
        if (!node) return false;
        if (node.x === x && node.y === y) return false;

        const group = batch ?? createId();
        let moved = false;

        for (const [prop, value] of [['x', x], ['y', y]]) {
            if (node[prop] === value) continue;
            const result = this.#operations.submit(setPropertyOperation({
                target: { object: id, component: null },
                prop,
                value,
                previous: node[prop],
                origin: Origin.EDITOR,
                actor,
                batch: group
            }));
            moved = moved || result.applied;
        }

        return moved;
    }

    /**
     * Change one of a node's params, as one SET_PROPERTY operation on `params`.
     *
     * THE WHOLE RECORD IS REPLACED, NOT MUTATED, and that is what makes this an ordinary
     * property write: `previous` is the record as it was, so the inversion rule
     * SET_PROPERTY has always had puts the old params back. A `SET_NODE_PARAM` of its own
     * would be a second way to say what the format already says (ADR-0027).
     *
     * @param {string} id - The node's identifier
     * @param {string} param - The param's name
     * @param {any} value - The new value
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when the param changed
     */
    setParam(id, param, value, { actor, batch } = {}) {
        const node = this.#nodes.get(id);
        if (!node) return false;
        if (node.params[param] === value) return false;

        const result = this.#operations.submit(setPropertyOperation({
            target: { object: id, component: null },
            prop: 'params',
            value: { ...node.params, [param]: value },
            previous: { ...node.params },
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * Whether two ports may be wired, and what it would mean.
     *
     * A REFUSAL CARRIES ITS REASON, because "nothing happened" is the worst answer to a
     * gesture — the rule `dnd/rules.js` already lives by (ADR-0026 §6).
     *
     * @param {object} from - `{ node, port }` — the output side
     * @param {object} to - `{ node, port }` — the input side
     * @returns {{allowed: boolean, code: string|null, reason: string|null, replaces: object|null}} The verdict
     */
    canConnect(from, to) {
        if (!from?.node || !from?.port || !to?.node || !to?.port) {
            return refuse(GraphIssueCode.UNKNOWN_PORT, 'A connection needs two ports.');
        }
        if (from.node === to.node) {
            return refuse(GraphIssueCode.SELF_CONNECTION, 'A node cannot feed itself.');
        }

        const source = this.node(from.node);
        const target = this.node(to.node);
        if (!source || !target) {
            return refuse(GraphIssueCode.UNKNOWN_NODE, 'One end is not in this graph.');
        }

        const output = this.portOf(source, PortDirection.OUTPUT, from.port);
        const input = this.portOf(target, PortDirection.INPUT, to.port);
        if (!output) return refuse(GraphIssueCode.UNKNOWN_PORT, `"${from.port}" is not an output of this node.`);
        if (!input) return refuse(GraphIssueCode.UNKNOWN_PORT, `"${to.port}" is not an input of this node.`);

        if (output.kind !== input.kind) {
            return refuse(
                GraphIssueCode.PORT_KIND_MISMATCH,
                'Execution and values do not mix: a flow port only connects to a flow port.'
            );
        }

        if (output.kind === PortKind.DATA && !typesCompatible(output.type, input.type)) {
            return refuse(
                GraphIssueCode.TYPE_MISMATCH,
                `A ${output.type} cannot be read as a ${input.type}.`
            );
        }

        // One source per data input, one target per flow output. Dropping on an occupied
        // port replaces rather than refuses, and the verdict says which wire goes.
        const replaced = output.kind === PortKind.FLOW
            ? this.outgoing(from.node, from.port)[0] ?? null
            : this.incoming(to.node, to.port);

        // The same wire again is not a change, so it is refused rather than duplicated.
        if (replaced && replaced.from.node === from.node && replaced.from.port === from.port
            && replaced.to.node === to.node && replaced.to.port === to.port) {
            return refuse(GraphIssueCode.PORT_ALREADY_CONNECTED, 'These ports are already connected.');
        }

        return { allowed: true, code: null, reason: null, replaces: replaced };
    }

    /**
     * Wire two ports, as one CONNECT operation — plus the DISCONNECT it replaces.
     *
     * @param {object} from - `{ node, port }` — the output side
     * @param {object} to - `{ node, port }` — the input side
     * @param {object} [options] - Options
     * @param {string} [options.id] - Existing identifier, used when replaying
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {object|null} The connection, or null when refused
     */
    connect(from, to, { id, actor, batch } = {}) {
        const verdict = this.canConnect(from, to);
        if (!verdict.allowed) return null;

        // One batch: replacing a wire is one gesture, so it is one entry in the history.
        const group = verdict.replaces ? batch ?? createId() : batch;
        if (verdict.replaces) this.disconnect(verdict.replaces.id, { actor, batch: group });

        const connection = createConnection({ from, to, id });
        const result = this.#operations.submit(connectOperation({
            connection,
            origin: Origin.EDITOR,
            actor,
            batch: group
        }));

        return result.applied ? this.connection(connection.id) : null;
    }

    /**
     * Remove a connection, as one DISCONNECT operation.
     * @param {string} id - The connection's identifier
     * @param {object} [options] - Options
     * @param {string} [options.actor] - Who authored the intent
     * @param {string} [options.batch] - Groups related operations into one history entry
     * @returns {boolean} True when a connection was removed
     */
    disconnect(id, { actor, batch } = {}) {
        const connection = this.#connections.get(id);
        if (!connection) return false;

        const result = this.#operations.submit(disconnectOperation({
            connection,
            origin: Origin.EDITOR,
            actor,
            batch
        }));

        return result.applied;
    }

    /**
     * The rank a node holds among the graph's nodes.
     * @param {string} id - The node's identifier
     * @returns {number} The rank, or -1
     */
    indexOf(id) {
        return this.nodes().findIndex(node => node.id === id);
    }

    /**
     * The graph, as it is persisted inside a `.px` payload.
     * @returns {object} A plain, JSON-safe structure
     */
    serialize() {
        return {
            version: GRAPH_VERSION,
            nodes: this.nodes().map(node => ({
                id: node.id,
                type: node.type,
                x: node.x,
                y: node.y,
                params: { ...node.params }
            })),
            connections: this.connections().map(entry => ({
                id: entry.id,
                from: { node: entry.from.node, port: entry.from.port },
                to: { node: entry.to.node, port: entry.to.port }
            }))
        };
    }

    /**
     * Rebuild a graph from a payload.
     *
     * Declared, not added: rebuilding is construction, not an intent. Going through
     * `addNode()` would submit an operation per node, numbering mutations nobody authored
     * — the argument `Project.deserialize()` and `Scene` already make.
     *
     * @param {object} data - Data produced by serialize()
     * @param {object} [options] - Options, as the constructor takes them
     * @returns {Graph} The graph
     */
    static deserialize(data, options = {}) {
        const graph = new Graph(options);
        if (!data) return graph;

        if (data.version !== undefined && data.version !== GRAPH_VERSION) {
            throw new Error(`Graph.deserialize: unsupported graph version ${data.version}`);
        }

        for (const node of data.nodes ?? []) graph.declare(node);
        for (const entry of data.connections ?? []) graph.declareConnection(entry);
        return graph;
    }

    /**
     * Put a node in the graph without submitting anything.
     *
     * Public because deserialization is the one legitimate caller outside this class, and
     * because `ComponentDefinition` rebuilds a graph the same way.
     *
     * @param {object} node - The node record, as plain data
     * @param {number} [index] - Rank among the nodes
     * @returns {object} The reactive node the graph now holds
     */
    declare(node, index) {
        const record = makeReactive(createNode(node));
        this.#insert(this.#nodes, record.id, record, index);
        return record;
    }

    /**
     * Put a connection in the graph without submitting anything.
     * @param {object} connection - The connection record, as plain data
     * @param {number} [index] - Rank among the connections
     * @returns {object} The connection
     */
    declareConnection(connection, index) {
        const record = createConnection(connection);
        this.#insert(this.#connections, record.id, record, index);
        return record;
    }

    /**
     * Teach a pipeline how to apply this graph's operations.
     *
     * Called on the pipeline the graph was given, so a `.px` whose properties and graph
     * share one pipeline — and therefore one undo stack — needs no second registration
     * path (ADR-0024 §4).
     *
     * @param {object} operations - The pipeline
     */
    registerHandlers(operations) {
        operations.register(OperationType.ADD_NODE, operation => {
            if (this.#nodes.has(operation.node.id)) return false;

            this.declare(operation.node, operation.index ?? undefined);
            // A node restored by an undo brings its wiring back with it.
            for (const connection of operation.connections ?? []) {
                if (!this.#connections.has(connection.id)) this.declareConnection(connection);
            }
            return true;
        }, { resolveTarget: false });

        operations.register(OperationType.REMOVE_NODE, operation => {
            const id = operation.target.object;
            if (!this.#nodes.has(id)) return false;

            for (const connection of this.connectionsOf(id)) this.#connections.delete(connection.id);
            this.#nodes.delete(id);
            return true;
        }, { resolveTarget: false });

        operations.register(OperationType.CONNECT, operation => {
            const connection = operation.connection;
            if (this.#connections.has(connection.id)) return false;
            if (!this.#nodes.has(connection.from.node) || !this.#nodes.has(connection.to.node)) return false;

            this.declareConnection(connection);
            return true;
        }, { resolveTarget: false });

        operations.register(OperationType.DISCONNECT, operation => {
            const id = operation.target.object;
            if (!this.#connections.has(id)) return false;

            this.#connections.delete(id);
            return true;
        }, { resolveTarget: false });
    }

    /**
     * Put an entry at a rank, rewriting the map's order.
     *
     * A Map has no splice, so a ranked insertion is a rewrite — exactly as it is for an
     * Object's components and for the manifest. It is O(n) on a list a creator can read.
     */
    #insert(map, id, value, index) {
        if (index === null || index === undefined || index >= map.size) {
            map.set(id, value);
            return;
        }

        const entries = [...map];
        entries.splice(Math.max(0, index), 0, [id, value]);
        map.clear();
        for (const [key, entry] of entries) map.set(key, entry);
    }
}

/** A node as plain data, with no reactive wrapper riding along. */
function snapshot(node) {
    return globalThis.Object.freeze({
        id: node.id,
        type: node.type,
        x: node.x,
        y: node.y,
        params: { ...node.params }
    });
}

function refuse(code, reason) {
    return { allowed: false, code, reason, replaces: null };
}
