// The node catalogue: identity, ports, type compatibility, grouping (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType } from '../properties/types.js';
import {
    ANY_TYPE,
    NodeRegistry,
    PortDirection,
    PortKind,
    createPort,
    groupNodes,
    portOf,
    portsOf,
    typesCompatible
} from './nodes.js';
import { STANDARD_NODES, referencedProperty, registerStandardNodes } from './standard.js';

// --- the registry ---------------------------------------------------------------------------

test('a node type needs an identity and a label', () => {
    const registry = new NodeRegistry();

    assert.throws(() => registry.register({ label: 'No type' }), TypeError);
    assert.throws(() => registry.register({ type: 'a.b' }), TypeError);
});

test('two different definitions claiming one type is the bug a registry catches', () => {
    const registry = new NodeRegistry();
    registry.register({ type: 'a.b', label: 'First' });

    assert.throws(() => registry.register({ type: 'a.b', label: 'Second' }), /already registered/);
    assert.doesNotThrow(() => registry.register({ type: 'a.b', label: 'Second' }, { replace: true }));
    assert.equal(registry.get('a.b').label, 'Second');
});

test('registering the same catalogue twice is not a collision', () => {
    const registry = new NodeRegistry();
    registerStandardNodes(registry);

    assert.doesNotThrow(() => registerStandardNodes(registry));
    assert.equal(registry.types().length, STANDARD_NODES.length);
});

test('an unknown type resolves to null rather than throwing', () => {
    assert.equal(new NodeRegistry().get('nothing'), null);
    assert.equal(new NodeRegistry().has('nothing'), false);
});

// --- ports ------------------------------------------------------------------------------------

test('a port fills in what it was not given, and a flow port carries no type', () => {
    const data = createPort({ id: 'deltaTime', kind: PortKind.DATA });
    const flow = createPort({ id: 'out', kind: PortKind.FLOW, type: PropertyType.NUMBER });

    assert.equal(data.type, ANY_TYPE);
    assert.equal(data.label, 'Delta Time');
    assert.equal(flow.type, null, 'execution has no shape');
});

test('a node with no ports declared has none', () => {
    assert.deepEqual(portsOf(null, {}), { inputs: [], outputs: [] });
    assert.deepEqual(portsOf({ type: 'a.b', label: 'A' }, {}), { inputs: [], outputs: [] });
});

test('ports may depend on the node, and are looked up by identity', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const definition = registry.get('property.set');
    const node = { id: 'n1', type: 'property.set', params: { property: 'p1' } };
    const context = { properties: [{ id: 'p1', name: 'speed', type: PropertyType.STRING, default: 'x' }] };

    const value = portOf(definition, node, PortDirection.INPUT, 'value', context);

    assert.equal(value.type, PropertyType.STRING);
    assert.equal(value.label, 'speed');
    assert.equal(value.default, 'x');
    assert.equal(portOf(definition, node, PortDirection.INPUT, 'nope', context), null);
});

test('a property node with nothing selected accepts anything, rather than nothing', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const node = { id: 'n1', type: 'property.get', params: {} };

    const ports = portsOf(registry.get('property.get'), node, { properties: [] });

    assert.equal(ports.outputs[0].type, ANY_TYPE);
    assert.equal(referencedProperty(node, { properties: [] }), null);
});

// --- type compatibility ---------------------------------------------------------------------------

test('a type accepts itself, anything accepts any, and int and number mix', () => {
    assert.equal(typesCompatible(PropertyType.NUMBER, PropertyType.NUMBER), true);
    assert.equal(typesCompatible(ANY_TYPE, PropertyType.COLOR), true);
    assert.equal(typesCompatible(PropertyType.COLOR, ANY_TYPE), true);
    assert.equal(typesCompatible(PropertyType.INT, PropertyType.NUMBER), true);
    assert.equal(typesCompatible(PropertyType.NUMBER, PropertyType.INT), true);
});

test('shapes that are not each other are refused', () => {
    assert.equal(typesCompatible(PropertyType.STRING, PropertyType.NUMBER), false);
    assert.equal(typesCompatible(PropertyType.BOOLEAN, PropertyType.COLOR), false);
});

// --- the menu ------------------------------------------------------------------------------------

test('node types group by category, in the declared order, with nothing empty', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    const groups = groupNodes(registry);

    assert.deepEqual(groups.map(group => group.category).slice(0, 4), ['Events', 'Properties', 'Flow', 'Values']);
    assert.equal(groups.every(group => group.entries.length > 0), true);
    assert.equal(groups.flatMap(group => group.entries).length, STANDARD_NODES.length);
});

test('a category a node invents takes its place rather than being flattened away', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    registry.register({ type: 'audio.play', label: 'Play Sound', category: 'Audio' });

    const groups = groupNodes(registry);

    assert.equal(groups.some(group => group.category === 'Audio'), true);
});

// --- the standard library itself --------------------------------------------------------------------

test('every shipped node declares a label, a category and something to do', () => {
    for (const definition of STANDARD_NODES) {
        assert.equal(typeof definition.label, 'string', definition.type);
        assert.equal(typeof definition.category, 'string', definition.type);

        const runnable = Boolean(definition.evaluate || definition.execute || definition.event);
        assert.equal(runnable, true, `${definition.type} does nothing`);
    }
});

test('no shipped node reaches for an environment', () => {
    // A cheap but real guard: the source of a node's behaviour must not name a browser or
    // a clock. A graph that could read `Date.now()` would stop being replayable, and this
    // is the property the whole client/server story rests on (ADR-0011).
    const forbidden = /\b(document|window|localStorage|Date\.now|Math\.random|fetch)\b/;

    for (const definition of STANDARD_NODES) {
        for (const hook of ['evaluate', 'execute']) {
            if (!definition[hook]) continue;
            assert.equal(forbidden.test(definition[hook].toString()), false, `${definition.type}.${hook}`);
        }
    }
});
