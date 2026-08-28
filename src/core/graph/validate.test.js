// Is this graph runnable, and if not, exactly where is it wrong (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType } from '../properties/types.js';
import { GRAPH_VERSION } from './graph.js';
import { NodeRegistry } from './nodes.js';
import { registerStandardNodes } from './standard.js';
import { GraphIssueCode, GraphSeverity, firstError } from './errors.js';
import { runnable, validateGraph } from './validate.js';

const registry = registerStandardNodes(new NodeRegistry());

function graph({ nodes = [], connections = [] } = {}) {
    return { version: GRAPH_VERSION, nodes, connections };
}

function node(id, type, params = {}) {
    return { id, type, x: 0, y: 0, params };
}

function wire(id, from, to) {
    return { id, from: { node: from[0], port: from[1] }, to: { node: to[0], port: to[1] } };
}

function check(payload, properties = []) {
    return validateGraph(payload, { registry, properties });
}

// --- a graph that is fine ------------------------------------------------------------------

test('an empty graph has nothing wrong with it', () => {
    assert.deepEqual(check(graph()), []);
    assert.equal(runnable(check(graph())), true);
});

test('a wired graph reading a declared property passes', () => {
    const properties = [{ id: 'p1', name: 'speed', type: PropertyType.NUMBER, default: 1 }];
    const payload = graph({
        nodes: [
            node('n1', 'event.update'),
            node('n2', 'property.set', { property: 'p1' }),
            node('n3', 'value.number', { value: 4 })
        ],
        connections: [
            wire('c1', ['n1', 'out'], ['n2', 'in']),
            wire('c2', ['n3', 'value'], ['n2', 'value'])
        ]
    });

    assert.deepEqual(check(payload, properties), []);
});

// --- the payload itself --------------------------------------------------------------------

test('a version this build does not read is fatal on its own', () => {
    const issues = check({ version: 99, nodes: [], connections: [] });

    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, GraphIssueCode.UNKNOWN_VERSION);
    assert.equal(runnable(issues), false);
});

test('something that is not a graph is said to be so', () => {
    assert.equal(check(null)[0].code, GraphIssueCode.UNKNOWN_VERSION);
});

// --- nodes -----------------------------------------------------------------------------------

test('a node type nobody declares is reported by name', () => {
    const issues = check(graph({ nodes: [node('n1', 'magic.thing')] }));

    assert.equal(issues[0].code, GraphIssueCode.UNKNOWN_NODE_TYPE);
    assert.equal(issues[0].node, 'n1');
    assert.match(issues[0].message, /magic\.thing/);
});

test('two nodes claiming one identifier is reported', () => {
    const issues = check(graph({ nodes: [node('n1', 'event.start'), node('n1', 'event.update')] }));

    assert.equal(issues[0].code, GraphIssueCode.DUPLICATE_NODE_ID);
});

// --- references --------------------------------------------------------------------------------

test('a node naming a property the Component no longer declares is an error', () => {
    const issues = check(graph({ nodes: [node('n1', 'property.get', { property: 'gone' })] }));

    assert.equal(issues[0].code, GraphIssueCode.MISSING_PROPERTY);
    assert.equal(issues[0].severity, GraphSeverity.ERROR);
    assert.equal(issues[0].property, 'gone');
});

test('a node with no property selected is a warning: it runs, it just does nothing yet', () => {
    const issues = check(graph({ nodes: [node('n1', 'property.get')] }));

    assert.equal(issues[0].code, GraphIssueCode.MISSING_REFERENCE);
    assert.equal(issues[0].severity, GraphSeverity.WARNING);
    assert.equal(runnable(issues), true);
});

// --- an Object port with nothing in it (ADR-0034 §3.2) -------------------------------------

test('a node with nothing wired to its Object port says so, and still runs', () => {
    // The least readable state a graph can be in, and until now the silent one: the node
    // names a Component and a property, executes every frame, and writes to nobody.
    const issues = check(graph({ nodes: [node('n1', 'object.isValid')] }));

    assert.equal(issues.length, 1);
    assert.equal(issues[0].code, GraphIssueCode.MISSING_REFERENCE);
    assert.equal(issues[0].severity, GraphSeverity.WARNING);
    assert.equal(issues[0].node, 'n1');
    assert.equal(issues[0].port, 'object', 'and it names the port to aim at');
    assert.equal(runnable(issues), true, 'null is a legal thing for it to read (ADR-0034 §3.4)');
});

test('an Object port that is fed is not reported', () => {
    const payload = graph({
        nodes: [node('n1', 'scene.self'), node('n2', 'object.isValid')],
        connections: [wire('c1', ['n1', 'object'], ['n2', 'object'])]
    });

    assert.deepEqual(check(payload), []);
});

test('it is the port TYPE that is checked, not a list of node types', () => {
    // Every node carrying a handle port and no other way to answer for it says the same
    // thing when nothing feeds it, so one rule covers the two that exist and the third that
    // does not exist yet.
    for (const type of ['object.isValid', 'scene.parent']) {
        const issues = check(graph({ nodes: [node(type, type)] }));
        const found = issues.filter(issue => issue.port === 'object');

        assert.equal(found.length, 1, `${type} reports its empty Object port`);
        assert.equal(found[0].severity, GraphSeverity.WARNING);
    }
});

test('a node that can answer for itself is not asked: an empty target means Self', () => {
    // THE COMMONEST GRAPH THERE IS. `Set Property` with nothing on its Object port acts on
    // the Object the Component is attached to (ADR-0040 §3) — a creator saying *this* one,
    // not a creator forgetting. Warning there was warning about the default.
    const properties = [{ id: 'p1', name: 'speed', type: PropertyType.NUMBER, default: 1 }];

    for (const type of ['property.get', 'property.set']) {
        const issues = check(graph({ nodes: [node('n1', type, { property: 'p1' })] }), properties);

        assert.deepEqual(issues, [], `${type} reported something about acting on itself`);
    }
});

test('a node with no Object port is never asked about one', () => {
    const issues = check(graph({ nodes: [node('n1', 'value.number')] }));

    assert.deepEqual(issues, []);
});

// --- connections ---------------------------------------------------------------------------------

test('a connection naming a node the graph does not hold is reported', () => {
    const payload = graph({
        nodes: [node('n1', 'event.start')],
        connections: [wire('c1', ['n1', 'out'], ['ghost', 'in'])]
    });

    assert.equal(check(payload)[0].code, GraphIssueCode.UNKNOWN_NODE);
});

test('a connection naming a port the node does not have is reported', () => {
    const payload = graph({
        nodes: [node('n1', 'event.start'), node('n2', 'flow.branch')],
        connections: [wire('c1', ['n1', 'nope'], ['n2', 'in'])]
    });

    const issue = check(payload)[0];
    assert.equal(issue.code, GraphIssueCode.UNKNOWN_PORT);
    assert.equal(issue.port, 'nope');
});

test('a wire drawn backwards is told apart from a port that does not exist', () => {
    const payload = graph({
        nodes: [node('n1', 'flow.branch'), node('n2', 'flow.sequence')],
        connections: [wire('c1', ['n1', 'in'], ['n2', 'in'])]
    });

    assert.equal(check(payload)[0].code, GraphIssueCode.PORT_DIRECTION_MISMATCH);
});

test('flow and data do not mix', () => {
    const payload = graph({
        nodes: [node('n1', 'event.start'), node('n2', 'flow.branch')],
        connections: [wire('c1', ['n1', 'out'], ['n2', 'condition'])]
    });

    assert.equal(check(payload)[0].code, GraphIssueCode.PORT_KIND_MISMATCH);
});

test('a value of the wrong shape is reported, naming both types', () => {
    const payload = graph({
        nodes: [node('n1', 'value.string'), node('n2', 'math.add')],
        connections: [wire('c1', ['n1', 'value'], ['n2', 'a'])]
    });

    const issue = check(payload)[0];
    assert.equal(issue.code, GraphIssueCode.TYPE_MISMATCH);
    assert.match(issue.message, /string.*number/);
});

test('a data input fed twice is reported', () => {
    const payload = graph({
        nodes: [node('n1', 'value.number'), node('n2', 'value.number'), node('n3', 'math.add')],
        connections: [
            wire('c1', ['n1', 'value'], ['n3', 'a']),
            wire('c2', ['n2', 'value'], ['n3', 'a'])
        ]
    });

    const issue = check(payload)[0];
    assert.equal(issue.code, GraphIssueCode.PORT_ALREADY_CONNECTED);
    assert.equal(issue.connection, 'c2');
});

test('a flow output continuing twice is reported', () => {
    const payload = graph({
        nodes: [node('n1', 'event.start'), node('n2', 'flow.branch'), node('n3', 'flow.branch')],
        connections: [
            wire('c1', ['n1', 'out'], ['n2', 'in']),
            wire('c2', ['n1', 'out'], ['n3', 'in'])
        ]
    });

    assert.equal(check(payload)[0].code, GraphIssueCode.PORT_ALREADY_CONNECTED);
});

test('a node feeding itself is reported', () => {
    const payload = graph({
        nodes: [node('n1', 'flow.sequence')],
        connections: [wire('c1', ['n1', 'first'], ['n1', 'in'])]
    });

    assert.equal(check(payload)[0].code, GraphIssueCode.SELF_CONNECTION);
});

// --- cycles -----------------------------------------------------------------------------------------

test('values that depend on each other are refused', () => {
    const payload = graph({
        nodes: [node('n1', 'math.add'), node('n2', 'math.add')],
        connections: [
            wire('c1', ['n1', 'result'], ['n2', 'a']),
            wire('c2', ['n2', 'result'], ['n1', 'a'])
        ]
    });

    const issues = check(payload);

    assert.equal(issues.some(issue => issue.code === GraphIssueCode.DATA_CYCLE), true);
    assert.equal(runnable(issues), false);
});

test('a flow that loops back is NOT an error: that is how a loop is written', () => {
    const payload = graph({
        nodes: [node('n1', 'event.update'), node('n2', 'flow.branch'), node('n3', 'flow.sequence')],
        connections: [
            wire('c1', ['n1', 'out'], ['n2', 'in']),
            wire('c2', ['n2', 'true'], ['n3', 'in']),
            wire('c3', ['n3', 'first'], ['n2', 'in'])
        ]
    });

    assert.deepEqual(check(payload), []);
});

// --- reading the answer ----------------------------------------------------------------------------

test('firstError picks the finding that stops the graph, ignoring warnings', () => {
    const payload = graph({
        nodes: [node('n1', 'property.get'), node('n2', 'magic.thing')]
    });

    const issues = check(payload);

    assert.equal(issues.length, 2);
    assert.equal(firstError(issues).code, GraphIssueCode.UNKNOWN_NODE_TYPE);
    assert.equal(runnable(issues), false);
});
