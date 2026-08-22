// The node catalogue: identity, ports, type compatibility, grouping (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType, propertyTypes } from '../properties/types.js';
import { ComponentRegistry } from '../component.js';
import { declaredProperties, defineComponent } from '../definition.js';
import { Object as SceneObject } from '../object.js';
import { Scene } from '../scene.js';
import {
    ANY_TYPE,
    NodeRegistry,
    OBJECT_TYPE,
    PortDirection,
    PortKind,
    compatibleTargets,
    createPort,
    groupNodes,
    portOf,
    portTypeOf,
    portsOf,
    typesCompatible
} from './nodes.js';
import {
    STANDARD_NODES,
    portValueOf,
    referencedProperty,
    registerStandardNodes,
    storedValueOf
} from './standard.js';

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

    // `Scene` sits third, between what a Component knows about itself and what it does
    // with it: the nodes that reach other Objects (ADR-0034 §3.3).
    assert.deepEqual(groups.map(group => group.category).slice(0, 4),
        ['Events', 'Properties', 'Scene', 'Flow']);
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

// --- what a wire may reach (the picker that opens on a dropped link) --------------------

test('a number output offers the nodes that take a number', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'value', kind: PortKind.DATA, type: PropertyType.NUMBER });

    const found = compatibleTargets(registry, port, PortDirection.OUTPUT);

    assert.ok(found.has('math.add'), 'Add takes a number');
    assert.ok(found.has('compare.greater'), 'Greater Than takes a number');
    assert.ok(found.has('debug.log'), 'Log takes anything');
    assert.equal(found.has('event.start'), false, 'On Start has no inputs at all');
    assert.equal(found.has('value.number'), false, 'a literal takes nothing');
});

test('a boolean output does not offer arithmetic', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'result', kind: PortKind.DATA, type: PropertyType.BOOLEAN });

    const found = compatibleTargets(registry, port, PortDirection.OUTPUT);

    assert.ok(found.has('logic.not'));
    assert.ok(found.has('flow.branch'), 'a condition is a boolean');
    assert.equal(found.has('math.add'), false);
});

test('a flow output offers only nodes with a flow input', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'out', kind: PortKind.FLOW });

    const found = compatibleTargets(registry, port, PortDirection.OUTPUT);

    assert.ok(found.has('flow.branch'));
    assert.ok(found.has('property.set'));
    assert.equal(found.has('value.number'), false, 'a literal has no flow');
    assert.equal(found.has('math.add'), false);
});

test('a data input looks the other way, for outputs', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'a', kind: PortKind.DATA, type: PropertyType.NUMBER });

    const found = compatibleTargets(registry, port, PortDirection.INPUT);

    assert.ok(found.has('value.number'), 'a literal can feed it');
    assert.ok(found.has('math.add'), 'so can the result of a sum');
    assert.equal(found.has('debug.log'), false, 'Log produces no value');
});

test('int and number reach each other, as the compatibility rule says', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'value', kind: PortKind.DATA, type: PropertyType.INT });

    assert.ok(compatibleTargets(registry, port, PortDirection.OUTPUT).has('math.add'));
});

test('asking about nothing answers nothing rather than everything', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    assert.equal(compatibleTargets(registry, null, PortDirection.OUTPUT).size, 0);
});

// --- the object port (ADR-0034 §3.2) ---------------------------------------------------

test('an object port takes an object, and nothing else takes its place', () => {
    // A handle is not an identifier, so no type that CARRIES an identifier may reach it.
    // This is what keeps a scene identity out of a graph by the type system rather than by
    // a convention: there is no wire a creator can draw that turns a string into an Object.
    assert.equal(typesCompatible(OBJECT_TYPE, OBJECT_TYPE), true);

    assert.equal(typesCompatible(PropertyType.STRING, OBJECT_TYPE), false);
    assert.equal(typesCompatible(OBJECT_TYPE, PropertyType.STRING), false);
    assert.equal(typesCompatible(PropertyType.RESOURCE, OBJECT_TYPE), false);
    assert.equal(typesCompatible(OBJECT_TYPE, PropertyType.RESOURCE), false);
    assert.equal(typesCompatible(PropertyType.NUMBER, OBJECT_TYPE), false);
    assert.equal(typesCompatible(PropertyType.BOOLEAN, OBJECT_TYPE), false);

    // `any` stays universal, as it is for every other type: no port of that type in the
    // catalogue writes towards anything persisted.
    assert.equal(typesCompatible(ANY_TYPE, OBJECT_TYPE), true);
    assert.equal(typesCompatible(OBJECT_TYPE, ANY_TYPE), true);
});

test('an object port is not a PropertyType, and no component port exists', () => {
    // `object` is a shape a value can HAVE and not one it can be SAVED as, so it is
    // deliberately absent from the Core's list of property types (ADR-0034 §3.2).
    assert.equal(globalThis.Object.values(PropertyType).includes(OBJECT_TYPE), false);

    // And a Component is named by its type in a param, never carried as a handle: nothing
    // in the catalogue declares a port for one.
    const registry = registerStandardNodes(new NodeRegistry());
    const types = registry.definitions().flatMap(definition => {
        const sides = [definition.inputs, definition.outputs];
        return sides.flatMap(side => (globalThis.Array.isArray(side) ? side : []).map(port => port.type));
    });

    assert.equal(types.includes('component'), false);
});

test('a wire from an object output is only offered nodes that take an object', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const port = createPort({ id: 'object', kind: PortKind.DATA, type: OBJECT_TYPE });

    const found = compatibleTargets(registry, port, PortDirection.OUTPUT);

    assert.ok(found.has('scene.parent'), 'Parent takes an object');
    assert.ok(found.has('object.isValid'), 'Is Valid takes an object');
    assert.ok(found.has('debug.log'), 'Log takes anything');
    assert.equal(found.has('math.add'), false, 'arithmetic does not take an object');
    assert.equal(found.has('scene.findByTag'), false, 'Find By Tag takes a tag, not an object');
});

// --- objectref never becomes a port type (ADR-0034 §3.5) --------------------------------

test('a property is read through the port type it travels as, and objectref travels as object', () => {
    // An identity when it is STORED, a handle when it TRAVELS. A port typed `objectref`
    // would be a second name for the same idea, and `typesCompatible()` compares names — so
    // a `Self` node could not be wired into it. The translation removes the question.
    assert.equal(portTypeOf({ type: PropertyType.OBJECTREF }), OBJECT_TYPE);
    assert.equal(typesCompatible(portTypeOf({ type: PropertyType.OBJECTREF }), OBJECT_TYPE), true);

    // Everything else is its own port type, unchanged.
    assert.equal(portTypeOf({ type: PropertyType.RESOURCE }), PropertyType.RESOURCE);
    assert.equal(portTypeOf({ type: PropertyType.STRING }), PropertyType.STRING);
    assert.equal(portTypeOf({ type: PropertyType.NUMBER }), PropertyType.NUMBER);
    assert.equal(portTypeOf({ type: PropertyType.BOOLEAN }), PropertyType.BOOLEAN);

    // Nothing declared is no constraint, which is what an unselected reference means.
    assert.equal(portTypeOf(null), ANY_TYPE);
    assert.equal(portTypeOf({}), ANY_TYPE);
});

test('no node in the catalogue ever exposes a port typed objectref', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const properties = [{ id: 'p_target', name: 'target', type: PropertyType.OBJECTREF, default: null }];
    const components = [{ type: 'res_door', label: 'Door', properties }];

    const shapes = [];
    for (const definition of registry.definitions()) {
        // Every node, resolved against a Component whose only property IS an objectref: the
        // dynamic ports take its shape, and that is the one moment the type could leak.
        const node = { id: 'n', type: definition.type, params: { property: 'p_target', component: 'res_door' } };
        const ports = portsOf(definition, node, { properties, components });
        shapes.push(...ports.inputs.map(port => port.type), ...ports.outputs.map(port => port.type));
    }

    assert.equal(shapes.includes(PropertyType.OBJECTREF), false, 'objectref is persisted, never carried');
    assert.ok(shapes.includes(OBJECT_TYPE), 'and it is carried as an object');
});

test('a port may say what an empty control means, and says nothing by default', () => {
    // Presentation the Editor reads, like `label`: the interpreter never sees it. An empty
    // `Find By Tag` finds NOTHING rather than anything, which a blank box cannot say.
    assert.equal(createPort({ id: 'value', type: PropertyType.STRING }).placeholder, null);
    assert.equal(createPort({ id: 'tag', type: PropertyType.STRING, placeholder: 'None' }).placeholder, 'None');

    const findByTag = registerStandardNodes(new NodeRegistry()).get('scene.findByTag');
    const tag = portsOf(findByTag, { id: 'n', type: 'scene.findByTag', params: {} }).inputs[0];

    assert.equal(tag.id, 'tag');
    assert.ok(tag.placeholder, 'the one port whose empty state means something says so');
});

// --- the objectref boundary, as a pair of pure translations (ADR-0034 §3.5) --------------

const reference = { id: 'p_t', name: 'target', type: PropertyType.OBJECTREF, default: null };
const plain = { id: 'p_n', name: 'speed', type: PropertyType.NUMBER, default: 0 };

test('a stored reference becomes a handle on the port that carries it', () => {
    const player = { id: 'obj_1', name: 'Player' };
    const scene = { get: id => (id === 'obj_1' ? player : undefined) };

    assert.equal(portValueOf(reference, 'obj_1', scene), player, 'the identity resolved to the Object');
});

test('a reference that resolves to nothing becomes null, never the identity', () => {
    const scene = { get: () => undefined };

    // The three shapes of absence, and the one that matters: a port typed `object` must
    // never hand an ObjectId downstream, or `Is Valid` answers true on a dead reference.
    assert.equal(portValueOf(reference, 'obj_gone', scene), null, 'the target is gone');
    assert.equal(portValueOf(reference, null, scene), null, 'the reference is empty');
    assert.equal(portValueOf(reference, 'obj_1', undefined), null, 'there is no scene to resolve in');
});

test('a handle becomes the identity it is stored as, and a handle is never stored', () => {
    assert.equal(storedValueOf(reference, { id: 'obj_1', name: 'Player' }), 'obj_1');
    assert.equal(storedValueOf(reference, null), null);
});

test('nothing promotes an arbitrary value into a stored reference', () => {
    // The other half of §3.6: reading an identity off an Object is not the same as taking
    // a string at its word, and only the first one is done here.
    assert.equal(storedValueOf(reference, 'obj_7f3a91c2'), null);
    assert.equal(storedValueOf(reference, 42), null);
});

test('a property that is not a reference crosses the boundary untouched', () => {
    const scene = { get: () => { throw new Error('a plain value must not be resolved'); } };

    assert.equal(portValueOf(plain, 12, scene), 12);
    assert.equal(portValueOf(plain, 0, scene), 0);
    assert.equal(portValueOf(null, 'anything', scene), 'anything');
    assert.equal(storedValueOf(plain, 12), 12);
    assert.equal(storedValueOf(plain, false), false);
    assert.equal(storedValueOf(null, 'anything'), 'anything');
});

// --- Object → Component → Property → PropertyType ----------------------------------------
//
// THE ONE RESOLUTION PATH, ASSERTED END TO END. It is not a new API: the declaration comes
// from the registry and the value from the instance (ADR-0034 §3.3), and `portTypeOf()` is
// the single translation from a declared type to the type a port carries (§3.5). These
// pin that chain so a second one cannot quietly appear beside it.

test('a declared property resolves to its type through the registry, not through the instance', () => {
    const registry = new ComponentRegistry();
    const Health = defineComponent({
        type: 'res_health',
        label: 'Health',
        properties: {
            hp: { id: 'p_hp', type: PropertyType.INT, default: 3 },
            mood: { id: 'p_mood', type: PropertyType.ENUM, values: ['calm', 'angry'], default: 'calm' },
            tags: { id: 'p_tags', type: PropertyType.ARRAY, default: [] },
            target: { id: 'p_target', type: PropertyType.OBJECTREF, default: null }
        }
    });
    registry.register(Health);

    const scene = new Scene('Main', { registry });
    const object = scene.add(new SceneObject('Enemy'));
    object.addComponent(new Health());

    // Object → Component: the TYPE, resolved where every type is resolved.
    const Component = scene.registry.get(object.componentTypes()[0]);
    assert.equal(Component, Health);

    // Component → Property → type, by identity rather than by name.
    const byId = new globalThis.Map(declaredProperties(Component).map(entry => [entry.id, entry]));
    assert.equal(byId.get('p_hp').type, PropertyType.INT);
    assert.equal(byId.get('p_mood').type, PropertyType.ENUM);
    assert.equal(byId.get('p_tags').type, PropertyType.ARRAY);
    assert.equal(byId.get('p_target').type, PropertyType.OBJECTREF);

    // A Choice keeps what it may hold, so nothing downstream has to guess it.
    assert.deepEqual(byId.get('p_mood').values, ['calm', 'angry']);
});

test('the type a port carries is the declared type, translated in exactly one place', () => {
    // ONE TABLE, NOT TWO. Every declared type reaches a port through `portTypeOf()`, and
    // `objectref` is the single case where the two names differ — an identity where it is
    // stored, a handle where it travels (ADR-0034 §3.5, ADR-0036).
    for (const type of propertyTypes()) {
        const carried = portTypeOf({ type });

        if (type === PropertyType.OBJECTREF) {
            assert.equal(carried, OBJECT_TYPE, 'objectref is carried as an object handle');
            continue;
        }
        assert.equal(carried, type, `${type} is carried under another name`);
    }

    // Nothing declared at all is honestly unconstrained rather than wrongly typed.
    assert.equal(portTypeOf(null), ANY_TYPE);
    assert.equal(portTypeOf({}), ANY_TYPE);
});

test('Get Property On and Set Property On take the shape of the property they name', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const components = [{
        type: 'res_health',
        label: 'Health',
        properties: [
            { id: 'p_hp', name: 'hp', type: PropertyType.INT, default: 3 },
            { id: 'p_mood', name: 'mood', type: PropertyType.ENUM, values: ['calm'], default: 'calm' },
            { id: 'p_tags', name: 'tags', type: PropertyType.ARRAY, default: [] },
            { id: 'p_target', name: 'target', type: PropertyType.OBJECTREF, default: null }
        ]
    }];

    const shapes = {
        p_hp: PropertyType.INT,
        p_mood: PropertyType.ENUM,
        p_tags: PropertyType.ARRAY,
        p_target: OBJECT_TYPE
    };

    for (const [property, expected] of globalThis.Object.entries(shapes)) {
        const params = { component: 'res_health', property };

        const read = portsOf(registry.get('property.getOn'), { id: 'g', type: 'property.getOn', params },
            { components }).outputs.find(port => port.id === 'value');
        const write = portsOf(registry.get('property.setOn'), { id: 's', type: 'property.setOn', params },
            { components }).inputs.find(port => port.id === 'value');

        assert.equal(read.type, expected, `Get Property On mistypes ${property}`);
        assert.equal(write.type, expected, `Set Property On mistypes ${property}`);
        // READ AND WRITE AGREE, which is what lets a creator wire one into the other.
        assert.equal(read.type, write.type);
    }
});

test('a property nobody has named yet is honestly untyped, and says so on both nodes', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const bare = { id: 'n', type: 'property.getOn', params: {} };

    assert.equal(portsOf(registry.get('property.getOn'), bare, { components: [] })
        .outputs.find(port => port.id === 'value').type, ANY_TYPE);
    assert.equal(portsOf(registry.get('property.setOn'), { ...bare, type: 'property.setOn' }, { components: [] })
        .inputs.find(port => port.id === 'value').type, ANY_TYPE);
});

test('a literal node is drawn as the type it holds, like the property that holds one', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    for (const [type, expected] of [
        ['value.number', PropertyType.NUMBER],
        ['value.boolean', PropertyType.BOOLEAN],
        ['value.string', PropertyType.STRING]
    ]) {
        const definition = registry.get(type);
        const produced = portsOf(definition, { id: 'n', type, params: {} }).outputs[0];

        assert.equal(produced.type, expected, `${type} produces another shape`);
        // The glyph is DECLARED, so the Editor draws the same one the property badge does.
        assert.ok(definition.icon, `${type} falls back to its category's glyph`);
    }
});
