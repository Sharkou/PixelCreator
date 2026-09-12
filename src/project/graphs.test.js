// A graph that cannot run does not run (ADR-0064 §6).
//
// THE BUG THIS CLOSES, EXACTLY. `validateGraph()` could always say that a wire named a port
// no node has. Nothing asked it before a game started, so the interpreter met the connection
// at run time, found no such port, and quietly used the input's default — for ever. A player
// that would not move had no message, no warning and nothing in the console: the graph looked
// right, the node was there, and the wire was drawn on the canvas.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    NodeRegistry,
    defineComponent,
    registerStandardNodes,
    runnable
} from '../core/mod.js';
import { Project } from './project.js';
import { ResourceKind } from './resource.js';
import { bindGraph, checkGraph, loadComponentDefinitions } from './graphs.js';

const nodes = registerStandardNodes(new NodeRegistry());

const node = (id, type, params = {}) => ({ id, type, params, x: 0, y: 0 });
const wire = (a, ap, b, bp) => ({ from: { node: a, port: ap }, to: { node: b, port: bp } });

/** `On Update → Translate`, with the X fed from a real port. */
const GOOD = {
    version: 1,
    nodes: [node('n1', 'event.update'), node('n2', 'transform.translate'), node('n3', 'time.delta')],
    connections: [wire('n1', 'out', 'n2', 'in'), wire('n3', 'seconds', 'n2', 'x')]
};

/** The same graph with the port `Delta Time` does NOT have — the real bug, verbatim. */
const TYPO = {
    version: 1,
    nodes: [node('n1', 'event.update'), node('n2', 'transform.translate'), node('n3', 'time.delta')],
    connections: [wire('n1', 'out', 'n2', 'in'), wire('n3', 'delta', 'n2', 'x')]
};

/** A node type nobody declares. */
const UNKNOWN = {
    version: 1,
    nodes: [node('n1', 'event.update'), node('n2', 'physics.explode')],
    connections: [wire('n1', 'out', 'n2', 'in')]
};

/** A `Set Property` with nothing chosen: in progress, not broken. */
const UNFINISHED = {
    version: 1,
    nodes: [node('n1', 'event.update'), node('n2', 'property.set')],
    connections: [wire('n1', 'out', 'n2', 'in')]
};

function behaviorsSpy() {
    const bound = new globalThis.Map();
    return { bound, bind: (type, graph) => bound.set(type?.type ?? type, graph) };
}

function projectWith(graph) {
    const project = new Project('Game');
    const component = project.add({ kind: ResourceKind.COMPONENT, name: 'Controller.px' }, null);
    project.save(component.id, { type: component.id, label: 'Controller', properties: {}, graph });
    return { project, component };
}

// --- the check ------------------------------------------------------------------------------

test('a wire to a port no node has is an error, and it was always findable', () => {
    assert.equal(runnable(checkGraph(GOOD, { nodes })), true);

    const issues = checkGraph(TYPO, { nodes });
    assert.equal(runnable(issues), false);
    assert.ok(issues.some(issue => /port/i.test(issue.message)), issues.map(issue => issue.message).join(' | '));
});

test('a node type nobody declares is an error too', () => {
    assert.equal(runnable(checkGraph(UNKNOWN, { nodes })), false);
});

test('a graph still being built is a WARNING, and warnings still run', () => {
    // Refusing to run a `Set Property` with nothing chosen would make the Editor unusable
    // while a creator is halfway through wiring one (core/graph/validate.js).
    const issues = checkGraph(UNFINISHED, { nodes });

    assert.ok(issues.length > 0);
    assert.equal(runnable(issues), true);
});

test('no graph is not a broken graph', () => {
    assert.deepEqual(checkGraph(null, { nodes }), []);
});

// --- the gate -------------------------------------------------------------------------------

test('a runnable graph is bound', async () => {
    const { project, component } = projectWith(GOOD);
    const behaviors = behaviorsSpy();
    const registry = new globalThis.Map();

    const loaded = await loadComponentDefinitions(project, {
        registry: { register: type => registry.set(type.type, type), get: id => registry.get(id) },
        behaviors,
        nodes
    });

    assert.equal(loaded.length, 1);
    assert.deepEqual(behaviors.bound.get(component.id), GOOD);
});

test('a graph that cannot run is NOT bound, and the reason is reported', async () => {
    const { project, component } = projectWith(TYPO);
    const behaviors = behaviorsSpy();
    const registry = new globalThis.Map();
    const refused = [];

    const loaded = await loadComponentDefinitions(project, {
        registry: { register: type => registry.set(type.type, type), get: id => registry.get(id) },
        behaviors,
        nodes,
        onInvalid: entry => refused.push(entry)
    });

    assert.equal(loaded.length, 1, 'the TYPE is still registered: its properties are real');
    assert.equal(behaviors.bound.has(component.id), false, 'only the behaviour is withheld');
    assert.equal(refused.length, 1);
    assert.ok(refused[0].issues.length > 0);
});

test('one broken `.px` does not stop the others from loading', async () => {
    const project = new Project('Game');
    const good = project.add({ kind: ResourceKind.COMPONENT, name: 'Good.px' }, null);
    const bad = project.add({ kind: ResourceKind.COMPONENT, name: 'Bad.px' }, null);
    project.save(good.id, { type: good.id, properties: {}, graph: GOOD });
    project.save(bad.id, { type: bad.id, properties: {}, graph: TYPO });

    const behaviors = behaviorsSpy();
    const registry = new globalThis.Map();
    const refused = [];

    await loadComponentDefinitions(project, {
        registry: { register: type => registry.set(type.type, type), get: id => registry.get(id) },
        behaviors,
        nodes,
        onInvalid: entry => refused.push(entry)
    });

    assert.equal(behaviors.bound.has(good.id), true);
    assert.equal(behaviors.bound.has(bad.id), false);
    assert.equal(refused.length, 1, 'a project opens, and says which one is not running');
});

test('binding directly goes through the same gate', async () => {
    const Component = defineComponent({ type: 'res_x', properties: {}, graph: TYPO });
    const behaviors = behaviorsSpy();
    const refused = [];

    const bound = await bindGraph(new Project('Game'), Component, behaviors, {
        nodes,
        onInvalid: entry => refused.push(entry)
    });

    assert.equal(bound, null);
    assert.equal(behaviors.bound.size, 0);
    assert.equal(refused.length, 1);
});

test('COUNTER-PROOF: without the gate, the wire is simply ignored and nothing is said', () => {
    // What the old behaviour WAS, shown rather than described: the connection names a port
    // the node does not have, so the interpreter finds nothing to read it from and the input
    // falls back to its declared default. Every node still runs; the object just never moves.
    const definition = nodes.get('time.delta');
    const ports = definition.outputs.map(port => port.id);

    assert.deepEqual(ports, ['seconds']);
    assert.equal(ports.includes('delta'), false,
        'the port a wire can name and the port a node has are two different things, '
        + 'and nothing but validation compares them');
});
