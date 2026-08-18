// The graph model: nodes, ports, connections, and the operations that mutate them
// (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType } from '../properties/types.js';
import { invert } from '../operations/invert.js';
import { GRAPH_VERSION, Graph, createConnection, createNode } from './graph.js';
import { NodeRegistry, PortDirection, PortKind } from './nodes.js';
import { GraphIssueCode } from './errors.js';
import { registerStandardNodes } from './standard.js';

function catalogue() {
    return registerStandardNodes(new NodeRegistry());
}

function graph(options = {}) {
    return new Graph({ registry: catalogue(), ...options });
}

// --- identity ----------------------------------------------------------------------------

test('a node and a connection each get an identity that is not a position', () => {
    const model = graph();
    const first = model.addNode({ type: 'event.update', x: 10, y: 20 });
    const second = model.addNode({ type: 'flow.branch', x: 200, y: 20 });

    assert.notEqual(first.id, second.id);
    assert.equal(model.node(first.id), first);
    assert.equal(model.indexOf(second.id), 1);

    const wire = model.connect({ node: first.id, port: 'out' }, { node: second.id, port: 'in' });
    assert.equal(typeof wire.id, 'string');
    assert.equal(model.connection(wire.id), wire);
});

test('createNode refuses a node with no type', () => {
    assert.throws(() => createNode({}), TypeError);
});

// --- adding and removing -----------------------------------------------------------------

test('adding a node is an operation, and the pipeline announces it', () => {
    const model = graph();
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation.type));

    model.addNode({ type: 'event.start' });

    assert.deepEqual(seen, ['ADD_NODE']);
});

test('removing a node takes its connections with it, and undo puts both back', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });
    const branch = model.addNode({ type: 'flow.branch' });
    const wire = model.connect({ node: start.id, port: 'out' }, { node: branch.id, port: 'in' });

    const removals = [];
    model.operations.on('operation', operation => {
        if (operation.type === 'REMOVE_NODE') removals.push(operation);
    });

    assert.equal(model.removeNode(branch.id), true);
    assert.equal(model.node(branch.id), null);
    assert.equal(model.connection(wire.id), null, 'a wire cannot outlive the node it reached');

    model.operations.submit(invert(removals[0]));

    assert.equal(model.node(branch.id).type, 'flow.branch');
    assert.equal(model.connection(wire.id).to.node, branch.id, 'undo restores the wiring, not just the node');
});

test('a removed node comes back at the rank it held', () => {
    const model = graph();
    const first = model.addNode({ type: 'event.start' });
    const middle = model.addNode({ type: 'flow.branch' });
    model.addNode({ type: 'flow.sequence' });

    const removals = [];
    model.operations.on('operation', operation => {
        if (operation.type === 'REMOVE_NODE') removals.push(operation);
    });

    model.removeNode(middle.id);
    model.operations.submit(invert(removals[0]));

    assert.equal(model.indexOf(first.id), 0);
    assert.equal(model.indexOf(middle.id), 1);
});

test('removing a node the graph does not hold changes nothing', () => {
    const model = graph();
    assert.equal(model.removeNode('nothing'), false);
});

// --- moving ------------------------------------------------------------------------------

test('moving a node is SET_PROPERTY, batched, so a drag is one history entry', () => {
    const model = graph();
    const node = model.addNode({ type: 'event.start', x: 0, y: 0 });
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    model.moveNode(node.id, 120, 64);

    assert.equal(node.x, 120);
    assert.equal(node.y, 64);
    assert.deepEqual(seen.map(operation => operation.type), ['SET_PROPERTY', 'SET_PROPERTY']);
    assert.equal(seen[0].batch, seen[1].batch, 'both writes belong to one gesture');
    assert.notEqual(seen[0].batch, null);
});

test('a move to where the node already is produces nothing', () => {
    const model = graph();
    const node = model.addNode({ type: 'event.start', x: 8, y: 8 });
    let count = 0;
    model.operations.on('operation', () => count++);

    assert.equal(model.moveNode(node.id, 8, 8), false);
    assert.equal(count, 0);
});

test('a move inverts into the move back, because a position is an ordinary property', () => {
    const model = graph();
    const node = model.addNode({ type: 'event.start', x: 0, y: 0 });
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    model.moveNode(node.id, 50, 60);
    for (const operation of [...seen].reverse()) model.operations.submit(invert(operation));

    assert.equal(node.x, 0);
    assert.equal(node.y, 0);
});

// --- params ------------------------------------------------------------------------------

test('a param change replaces the record, so it is observable and invertible', () => {
    const model = graph();
    const node = model.addNode({ type: 'value.number', params: { value: 1 } });
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    assert.equal(model.setParam(node.id, 'value', 42), true);
    assert.equal(node.params.value, 42);
    assert.equal(seen[0].type, 'SET_PROPERTY');

    model.operations.submit(invert(seen[0]));
    assert.equal(node.params.value, 1);
});

test('setting a param to what it already is produces nothing', () => {
    const model = graph();
    const node = model.addNode({ type: 'value.number', params: { value: 3 } });

    assert.equal(model.setParam(node.id, 'value', 3), false);
});

// --- connecting --------------------------------------------------------------------------

test('flow reaches flow and data reaches data, and the refusal says which', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });
    const branch = model.addNode({ type: 'flow.branch' });

    const verdict = model.canConnect({ node: start.id, port: 'out' }, { node: branch.id, port: 'condition' });

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.code, GraphIssueCode.PORT_KIND_MISMATCH);
    assert.match(verdict.reason, /flow/);
    assert.equal(model.connect({ node: start.id, port: 'out' }, { node: branch.id, port: 'condition' }), null);
});

test('a value of the wrong shape is refused, naming both types', () => {
    const model = graph();
    const text = model.addNode({ type: 'value.string' });
    const add = model.addNode({ type: 'math.add' });

    const verdict = model.canConnect({ node: text.id, port: 'value' }, { node: add.id, port: 'a' });

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.code, GraphIssueCode.TYPE_MISMATCH);
    assert.match(verdict.reason, /string/);
});

test('int and number are compatible in both directions', () => {
    const registry = catalogue();
    registry.register({
        type: 'test.int',
        label: 'Int',
        outputs: [{ id: 'value', kind: PortKind.DATA, type: PropertyType.INT }],
        inputs: [{ id: 'value', kind: PortKind.DATA, type: PropertyType.INT }]
    });

    const model = new Graph({ registry });
    const source = model.addNode({ type: 'test.int' });
    const add = model.addNode({ type: 'math.add' });

    assert.equal(model.canConnect({ node: source.id, port: 'value' }, { node: add.id, port: 'a' }).allowed, true);
    assert.equal(model.canConnect({ node: add.id, port: 'result' }, { node: source.id, port: 'value' }).allowed, true);
});

test('a node cannot feed itself', () => {
    const model = graph();
    const sequence = model.addNode({ type: 'flow.sequence' });

    const verdict = model.canConnect({ node: sequence.id, port: 'first' }, { node: sequence.id, port: 'in' });

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.code, GraphIssueCode.SELF_CONNECTION);
});

test('a port that does not exist is refused by name', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });
    const branch = model.addNode({ type: 'flow.branch' });

    assert.equal(
        model.canConnect({ node: start.id, port: 'nope' }, { node: branch.id, port: 'in' }).code,
        GraphIssueCode.UNKNOWN_PORT
    );
});

test('wiring a second source onto a data input replaces the first, as one batch', () => {
    const model = graph();
    const first = model.addNode({ type: 'value.number' });
    const second = model.addNode({ type: 'value.number' });
    const add = model.addNode({ type: 'math.add' });

    const original = model.connect({ node: first.id, port: 'value' }, { node: add.id, port: 'a' });
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    const replacement = model.connect({ node: second.id, port: 'value' }, { node: add.id, port: 'a' });

    assert.equal(model.connection(original.id), null);
    assert.equal(model.incoming(add.id, 'a').id, replacement.id);
    assert.deepEqual(seen.map(operation => operation.type), ['DISCONNECT', 'CONNECT']);
    assert.equal(seen[0].batch, seen[1].batch, 'replacing a wire is one gesture');
});

test('a flow output reaches one target, and a second wire replaces it', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });
    const first = model.addNode({ type: 'flow.branch' });
    const second = model.addNode({ type: 'flow.branch' });

    model.connect({ node: start.id, port: 'out' }, { node: first.id, port: 'in' });
    model.connect({ node: start.id, port: 'out' }, { node: second.id, port: 'in' });

    assert.equal(model.outgoing(start.id, 'out').length, 1);
    assert.equal(model.outgoing(start.id, 'out')[0].to.node, second.id);
});

test('one value may feed several inputs', () => {
    const model = graph();
    const number = model.addNode({ type: 'value.number' });
    const add = model.addNode({ type: 'math.add' });

    model.connect({ node: number.id, port: 'value' }, { node: add.id, port: 'a' });
    model.connect({ node: number.id, port: 'value' }, { node: add.id, port: 'b' });

    assert.equal(model.outgoing(number.id, 'value').length, 2);
});

test('the same wire twice is refused rather than duplicated', () => {
    const model = graph();
    const number = model.addNode({ type: 'value.number' });
    const add = model.addNode({ type: 'math.add' });

    model.connect({ node: number.id, port: 'value' }, { node: add.id, port: 'a' });
    const verdict = model.canConnect({ node: number.id, port: 'value' }, { node: add.id, port: 'a' });

    assert.equal(verdict.allowed, false);
    assert.equal(verdict.code, GraphIssueCode.PORT_ALREADY_CONNECTED);
});

test('disconnecting inverts into connecting the same wire back', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });
    const branch = model.addNode({ type: 'flow.branch' });
    const wire = model.connect({ node: start.id, port: 'out' }, { node: branch.id, port: 'in' });

    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    assert.equal(model.disconnect(wire.id), true);
    assert.equal(model.connection(wire.id), null);

    model.operations.submit(invert(seen[0]));
    assert.equal(model.connection(wire.id).id, wire.id);
});

// --- ports -------------------------------------------------------------------------------

test('ports carry a kind, a type and a label, and are addressed by id', () => {
    const model = graph();
    const branch = model.addNode({ type: 'flow.branch' });

    const ports = model.portsOf(branch);

    assert.deepEqual(ports.inputs.map(port => port.id), ['in', 'condition']);
    assert.deepEqual(ports.outputs.map(port => port.id), ['true', 'false']);
    assert.equal(ports.inputs[1].kind, PortKind.DATA);
    assert.equal(ports.inputs[1].type, PropertyType.BOOLEAN);
    assert.equal(model.portOf(branch, PortDirection.OUTPUT, 'true').label, 'True');
});

test('a property node takes the shape of the property it names', () => {
    const properties = [{ id: 'p1', name: 'speed', type: PropertyType.NUMBER, default: 5 }];
    const model = new Graph({ registry: catalogue(), context: () => ({ properties }) });
    const get = model.addNode({ type: 'property.get', params: { property: 'p1' } });

    const output = model.portOf(get, PortDirection.OUTPUT, 'value');

    assert.equal(output.type, PropertyType.NUMBER);
    assert.equal(output.label, 'speed');
});

// --- serialization -----------------------------------------------------------------------

test('a graph round-trips through its payload', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start', x: 4, y: 8 });
    const log = model.addNode({ type: 'debug.log', x: 200, y: 8 });
    model.connect({ node: start.id, port: 'out' }, { node: log.id, port: 'in' });

    const payload = model.serialize();
    const restored = Graph.deserialize(payload, { registry: catalogue() });

    assert.equal(payload.version, GRAPH_VERSION);
    assert.deepEqual(restored.serialize(), payload);
    assert.equal(restored.node(start.id).x, 4);
    assert.equal(restored.connections()[0].from.node, start.id);
});

test('rebuilding a graph submits nothing: it is construction, not intent', () => {
    const model = graph();
    model.addNode({ type: 'event.start' });

    const seen = [];
    const restored = Graph.deserialize(model.serialize(), { registry: catalogue() });
    restored.operations.on('operation', operation => seen.push(operation));

    assert.equal(seen.length, 0);
    assert.equal(restored.nodes().length, 1);
});

test('a payload from a version this build does not read is refused', () => {
    assert.throws(
        () => Graph.deserialize({ version: 99, nodes: [], connections: [] }, { registry: catalogue() }),
        /unsupported graph version/
    );
});

test('an empty payload deserializes into an empty graph', () => {
    const restored = Graph.deserialize(null, { registry: catalogue() });

    assert.deepEqual(restored.serialize(), { version: GRAPH_VERSION, nodes: [], connections: [] });
});

// --- replication -------------------------------------------------------------------------

test('an applied operation mutates the graph and announces nothing', () => {
    const model = graph();
    const seen = [];
    model.operations.on('operation', operation => seen.push(operation));

    const node = createNode({ type: 'event.start' });
    model.operations.apply({
        type: 'ADD_NODE',
        target: { object: node.id, component: null },
        node,
        index: null,
        connections: [],
        origin: 'network',
        actor: 'someone-else',
        batch: null,
        seq: 7
    });

    assert.equal(model.node(node.id).type, 'event.start');
    assert.equal(seen.length, 0, 'applying a replicated operation must not echo');
});

test('a connection naming a node that is not here is refused rather than stored', () => {
    const model = graph();
    const start = model.addNode({ type: 'event.start' });

    const result = model.operations.submit({
        type: 'CONNECT',
        target: { object: 'c1', component: null },
        connection: createConnection({
            id: 'c1',
            from: { node: start.id, port: 'out' },
            to: { node: 'ghost', port: 'in' }
        }),
        origin: 'editor',
        actor: null,
        batch: null,
        seq: null
    });

    assert.equal(result.applied, false);
    assert.equal(model.connections().length, 0);
});
