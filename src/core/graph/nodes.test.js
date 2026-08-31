// The node catalogue: identity, ports, type compatibility, grouping (ADR-0027).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PropertyType, propertyTypes } from '../properties/types.js';
import { ComponentRegistry } from '../component.js';
import { declaredProperties, defineComponent } from '../definition.js';
import { OBJECT_COMPONENT, Object as SceneObject, objectProperties } from '../object.js';
import { Scene } from '../scene.js';
import { Transform } from '../components/transform.js';
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
    baseTypeOf,
    portTypeOf,
    portsOf,
    shapeDependsOnNode,
    typesCompatible
} from './nodes.js';
import {
    STANDARD_NODES,
    portValueOf,
    referencedProperty,
    registerStandardNodes,
    storedValueOf,
    targetSocket
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
    assert.equal(value.label, 'Value',
        'the port is what it IS; the picker above says which property (ADR-0047 §1)');
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

// --- what kind of thing each node is (the taxonomy) -----------------------------------------

test('a node that hands over a reference is not a node that reads a property', () => {
    // THE SPLIT THIS ASSERTS. Everything reaching outside the Component used to be `Scene`,
    // so `Self` — which produces an Object handle and takes part in no execution — was
    // classified with `Get Property`, which is a property access aimed elsewhere. They
    // are different acts and the canvas colours them apart (editor/graph/palette.js).
    const registry = registerStandardNodes(new NodeRegistry());
    const categoryOf = type => registry.get(type).category;

    for (const type of ['scene.self', 'scene.parent', 'scene.findByTag', 'object.isValid']) {
        assert.equal(categoryOf(type), 'References', type);
    }
    for (const type of ['property.get', 'property.set', 'property.get', 'property.set']) {
        assert.equal(categoryOf(type), 'Properties', type);
    }
});

test('the two On nodes sit with the property nodes whose semantics they share', () => {
    // ADR-0034 §3.3: `Get Property` IS `Get Property` aimed somewhere else — a property
    // named by identity, a plain write, no Operation. Classifying it by WHERE it points
    // rather than by WHAT it does is what put it beside `Find By Tag`.
    const registry = registerStandardNodes(new NodeRegistry());

    assert.equal(registry.get('property.get').category, registry.get('property.get').category);
    assert.equal(registry.get('property.set').category, registry.get('property.set').category);
});

test('what STARTS a flow is an Event; what ANSWERS a question is an Input', () => {
    // THE LINE IS THE MODEL'S, AND IT IS THE ONE A CREATOR ALREADY READS (ADR-0046 §6).
    // Filing every device node under `Input` put "when the player presses jump" somewhere
    // other than where every other "when" lives; the split that survives is between a node
    // that hands on a flow and a node that hands on a value.
    const registry = registerStandardNodes(new NodeRegistry());

    for (const type of ['event.start', 'event.update', 'input.onKey', 'input.onPointerButton']) {
        assert.equal(registry.get(type).category, 'Events', type);
    }

    for (const type of ['input.key', 'input.pointer', 'input.pointerButton']) {
        assert.equal(registry.get(type).category, 'Input', type);
    }
});

test('the three moments of a key are three ports of one node', () => {
    // THEY WERE THREE NODE TYPES, AND THAT WAS THE MISTAKE. `On Key` and `Key Down` asked
    // the same question of the same key, so a creator had to know the difference BEFORE
    // they could pick the card that would have told them. One card puts the three side by
    // side, which also settles ADR-0041 §3.2 outright: two cards that look alike is a
    // problem one card does not have (ADR-0046 §6).
    const registry = registerStandardNodes(new NodeRegistry());
    const portsFor = type => portsOf(registry.get(type), { id: 'n', type, params: {} }, {});
    const flowsOf = type => portsFor(type).outputs
        .filter(port => port.kind === PortKind.FLOW).map(port => port.label);

    assert.deepEqual(flowsOf('input.onKey'), ['Pressed', 'Released', 'Down']);
    assert.deepEqual(flowsOf('input.onPointerButton'), ['Pressed', 'Released', 'Down'],
        'a button splits exactly as a key does, and into the same three words');
    assert.deepEqual(flowsOf('input.key'), [], 'a question has no flow at all');

    assert.equal(registry.get('input.key').label, 'Key Is Down');
    assert.equal(registry.get('input.onKey').label, 'On Key');

    // The port that repeats says so, because it is the one a creator can wire by accident.
    const down = portsFor('input.onKey').outputs.find(port => port.id === 'down');
    assert.match(down.tooltip, /every step/i);

    // AND THE TWO REMOVED TYPES ARE GONE, not left as aliases: a second way to say one
    // thing is the duplication this recomposition exists to remove.
    assert.equal(registry.has('input.keyDown'), false);
    assert.equal(registry.has('input.pointerButtonDown'), false);
});

// --- a node is named for what it does, never for what it is set to -------------------------

test('no node in the catalogue renames itself after what it is configured with', () => {
    // THE RULE, AND IT IS NOW ABSOLUTE. A node used to read `Middle Button`, `Get Ground`,
    // `Set Sprite.height` once it was pointed somewhere — every one of those is a VALUE
    // standing where the TYPE's name belongs. A tutorial has to be able to say "add a Set
    // Property" and still find that node an hour later; a creator has to be able to match
    // the header on the canvas to the entry in the menu.
    //
    // WHAT IT IS CONFIGURED WITH IS DRAWN INSIDE IT, on rows that can be changed — which is
    // where a value belongs and where it can be edited (ADR-0040 §5).
    const registry = registerStandardNodes(new NodeRegistry());

    for (const definition of registry.definitions()) {
        assert.equal(definition.title, undefined,
            `${definition.type} carries a title(), so its header can change with its params`);
    }
});

test('a node still redraws when a param changes its shape', () => {
    // Removing the dynamic titles must not cost the redraw: a param that changes the PORTS
    // still has to repaint, and `shapeDependsOnNode` is what the window asks.
    const registry = registerStandardNodes(new NodeRegistry());

    for (const type of ['property.get', 'property.set', 'property.get', 'property.set']) {
        assert.equal(shapeDependsOnNode(registry.get(type)), true, type);
    }
});

// --- the menu ------------------------------------------------------------------------------------

test('node types group by category, in the declared order, with nothing empty', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    const groups = groupNodes(registry);

    // THE ORDER A BEHAVIOUR IS WRITTEN IN (ADR-0045 §3): something happens, something
    // arrives from outside, something is decided, something is pointed at, something is read
    // or written, and something moves. `Transform` is its own family because of the question
    // a beginner asks — "I want to move my object, where do I look?" — which is not the
    // question `Properties` answers.
    assert.deepEqual(groups.map(group => group.category).slice(0, 6),
        ['Events', 'Input', 'Flow', 'References', 'Properties', 'Transform']);
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

test('a key is an EVENT and a STATE, and they are two nodes', () => {
    // THE SPLIT THIS TRANCHE MADE (ADR-0041 §3). One node answered three booleans, so
    // "when I press Space, jump" came out as `On Update → Branch → Jump`: three nodes and
    // two wires for one sentence. A moment and a state are different things, and each now
    // has exactly one execution semantic.
    const registry = registerStandardNodes(new NodeRegistry());

    const event = registry.get('input.onKey');
    const { outputs: fired } = portsOf(event, { type: 'input.onKey', params: {} }, {});
    assert.deepEqual(fired.map(port => port.id), ['pressed', 'released', 'down']);
    for (const port of fired) assert.equal(port.kind, PortKind.FLOW, port.id);
    assert.deepEqual(fired.map(port => port.label), ['Pressed', 'Released', 'Down']);
    assert.equal(event.event, 'update', 'an entry node, run every step');
    assert.equal(typeof event.execute, 'function', 'and it says which of its flows fired');
    assert.equal(event.evaluate, undefined, 'a moment produces no value');

    const state = registry.get('input.key');
    const { outputs: read } = portsOf(state, { type: 'input.key', params: {} }, {});
    assert.deepEqual(read.map(port => port.id), ['held'], 'the port id is untouched: graphs keep reading it');
    assert.equal(read[0].kind, PortKind.DATA);
    assert.equal(read[0].type, PropertyType.BOOLEAN);
    assert.equal(read[0].label, 'Is Down');
    assert.equal(state.event, undefined, 'a state starts nothing');
    assert.equal(state.execute, undefined);
});

test('On Key fires exactly the moments that happened, and can fire more than one', () => {
    const definition = registerStandardNodes(new NodeRegistry()).get('input.onKey');
    const firing = (pressed, released, down) => definition.execute({
        node: { params: { key: 'Space' } },
        param: () => 'Space',
        self: null,
        ctx: {
            input: {
                of: () => ({
                    pressed: () => pressed,
                    released: () => released,
                    isDown: () => down
                })
            }
        }
    });

    assert.deepEqual(firing(false, false, false), [], 'a key nobody touched starts nothing');
    // THE STEP A KEY GOES DOWN IS BOTH, and that is not a quirk to hide: "on the press, and
    // every step after" is what holding a key IS. Declared order, like `Sequence`.
    assert.deepEqual(firing(true, false, true), ['pressed', 'down']);
    assert.deepEqual(firing(false, false, true), ['down'], 'and every step after it, alone');
    assert.deepEqual(firing(false, true, false), ['released'], 'the step it comes up is only that');
    // A tap inside one frame is a press and a release, and the key is no longer down.
    assert.deepEqual(firing(true, true, false), ['pressed', 'released']);
});

test('On Key with no input on the context fires nothing rather than throwing', () => {
    const definition = registerStandardNodes(new NodeRegistry()).get('input.onKey');

    assert.deepEqual(definition.execute({ node: { params: {} }, param: () => 'Space', self: null, ctx: {} }), []);
});

test('both key nodes keep their names whatever key they watch', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    // Their PORTS never depend on the key, so nothing about them moves — but the param does
    // change what they do, and the field showing it is inside the node (ADR-0040 §5).
    assert.equal(registry.get('input.key').label, 'Key Is Down');
    assert.equal(registry.get('input.onKey').label, 'On Key');
    for (const type of ['input.key', 'input.onKey']) {
        assert.equal(registry.get(type).title, undefined, type);
        assert.equal(registry.get(type).params.key.default, 'Space', type);
    }
});

test('the Key node reads the input it is handed and never looks for one', () => {
    // The guard above forbids `window` and `document` by name; this states the positive
    // half. The state arrives on the step context, indexed by the owner of the Object the
    // Component sits on (ADR-0014 §3, §4) — there is no global to reach for.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.key');
    const asked = [];
    const state = { isDown: () => true, pressed: () => false, released: () => false };

    const read = definition.evaluate({
        param: () => 'Space',
        self: { owner: 'alice' },
        ctx: { input: { of: owner => (asked.push(owner), state) } }
    });

    assert.deepEqual(asked, ['alice'], 'it asked for the owner of its own Object');
    assert.deepEqual(read, { held: true });
});

test('the key a Key node shows is the key it reads before anyone types one', () => {
    // The field draws `params.key ?? descriptor.default`; `evaluate` reads `params.key ??`
    // its own fallback. Two values, one meaning — so the test is that they are one value.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.key');
    const shown = definition.params.key.default;
    const asked = [];

    definition.evaluate({
        param: () => undefined,
        self: null,
        ctx: { input: { of: () => ({ isDown: key => (asked.push(key), false), pressed: () => false, released: () => false }) } }
    });

    assert.equal(shown, 'Space');
    assert.deepEqual(asked, [shown], 'an untouched node reads the key its field shows');
});

test('a Key node with no input on the context is inert rather than broken', () => {
    // A runtime always holds an Input, so this is the headless check and the honest answer
    // for a node evaluated outside a step: nothing is held.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.key');

    assert.deepEqual(definition.evaluate({ param: () => 'Space', self: null, ctx: {} }), { held: false });
});

test('the Pointer node yields two numbers, and nothing that needs a camera', () => {
    // A graph has no viewport and must never be given one (ADR-0038): what leaves this node
    // is a place in the scene, already resolved.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.pointer');

    const { inputs, outputs } = portsOf(definition, { type: 'input.pointer', params: {} }, {});

    assert.deepEqual(inputs, [], 'nothing is fed in, and no camera is asked for');
    assert.deepEqual(outputs.map(port => port.id), ['x', 'y']);
    for (const port of outputs) {
        assert.equal(port.kind, PortKind.DATA, port.id);
        assert.equal(port.type, PropertyType.NUMBER, port.id);
    }
    assert.equal(shapeDependsOnNode(definition), false, 'it has nothing to be pointed at');
});

test('the Pointer node reads the world position of its own Object\'s owner', () => {
    const definition = registerStandardNodes(new NodeRegistry()).get('input.pointer');
    const asked = [];
    const state = { pointerWorldX: 12, pointerWorldY: -34, pointerX: 400, pointerY: 300 };

    const read = definition.evaluate({
        self: { owner: 'alice' },
        ctx: { input: { of: owner => (asked.push(owner), state) } }
    });

    assert.deepEqual(asked, ['alice']);
    assert.deepEqual(read, { x: 12, y: -34 }, 'the world point, never the screen one');
});

test('a pointer button splits the same way a key does, and into the same three words', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    const { outputs: fired } = portsOf(registry.get('input.onPointerButton'),
        { type: 'input.onPointerButton', params: {} }, {});
    assert.deepEqual(fired.map(port => port.id), ['pressed', 'released', 'down']);
    for (const port of fired) assert.equal(port.kind, PortKind.FLOW, port.id);

    const { outputs: read } = portsOf(registry.get('input.pointerButton'),
        { type: 'input.pointerButton', params: {} }, {});
    assert.deepEqual(read.map(port => port.id), ['held']);
    assert.equal(read[0].type, PropertyType.BOOLEAN);
    assert.equal(read[0].label, 'Is Down');
});

test('a button is stored as a name, and read as the index the input state uses', () => {
    // ONE LIST READ FROM BOTH ENDS. The payload carries `"right"`, which outlives whatever
    // number a platform gives that button; the position in the list is the index the input
    // state is asked with. `labels` is only what a creator reads.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.pointerButton');
    const descriptor = definition.params.button;

    assert.equal(descriptor.type, PropertyType.ENUM);
    assert.deepEqual(descriptor.values, ['left', 'middle', 'right']);
    assert.deepEqual(descriptor.labels, ['Left', 'Middle', 'Right']);
    assert.equal(descriptor.default, 'left');

    // `Right Button` USED TO BE THE WHOLE HEADING, and it dropped the word `Pointer` — the
    // one word saying which node this is. There is no heading but the type's name now.
    assert.equal(definition.label, 'Pointer Button Is Down');
    assert.equal(definition.title, undefined);
});

test('a button a payload names that does not exist falls back rather than reading nothing', () => {
    // A hand-written or migrated payload is the only way to get here, and answering for a
    // button nobody has is worse than answering for the primary one.
    const definition = registerStandardNodes(new NodeRegistry()).get('input.pointerButton');
    const asked = [];
    const state = {
        isButtonDown: button => (asked.push(button), false),
        buttonPressed: () => false,
        buttonReleased: () => false
    };
    const ctx = { input: { of: () => state } };

    definition.evaluate({ node: { params: { button: 'thumb' } }, self: null, ctx });
    definition.evaluate({ node: { params: {} }, self: null, ctx });

    assert.deepEqual(asked, [0, 0]);
    // The event node reads the very same list, so a payload naming a button nobody has
    // falls back on both rather than on one.
    const event = registerStandardNodes(new NodeRegistry()).get('input.onPointerButton');
    const fired = [];
    event.execute({
        node: { params: { button: 'thumb' } },
        self: null,
        ctx: {
            input: {
                of: () => ({
                    buttonPressed: b => (fired.push(b), false),
                    buttonReleased: () => false,
                    isButtonDown: () => false
                })
            }
        }
    });
    assert.deepEqual(fired, [0]);
});

test('each named button asks for its own index', () => {
    const definition = registerStandardNodes(new NodeRegistry()).get('input.pointerButton');
    const asked = [];
    const ctx = {
        input: {
            of: () => ({
                isButtonDown: button => (asked.push(button), false),
                buttonPressed: () => false,
                buttonReleased: () => false
            })
        }
    };

    for (const button of ['left', 'middle', 'right']) {
        definition.evaluate({ node: { params: { button } }, self: null, ctx });
    }

    assert.deepEqual(asked, [0, 1, 2]);
});

test('the pointer nodes are inert without an input on the context, not broken', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    assert.deepEqual(
        registry.get('input.pointer').evaluate({ self: null, ctx: {} }), { x: 0, y: 0 });
    assert.deepEqual(
        registry.get('input.pointerButton').evaluate({ node: { params: {} }, self: null, ctx: {} }),
        { held: false });
    assert.deepEqual(
        registry.get('input.onPointerButton').execute({ node: { params: {} }, self: null, ctx: {} }), []);
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

    // Everything that takes no parameter is its own port type, unchanged.
    assert.equal(portTypeOf({ type: PropertyType.RESOURCE }), PropertyType.RESOURCE);
    assert.equal(portTypeOf({ type: PropertyType.STRING }), PropertyType.STRING);
    assert.equal(portTypeOf({ type: PropertyType.NUMBER }), PropertyType.NUMBER);
    assert.equal(portTypeOf({ type: PropertyType.BOOLEAN }), PropertyType.BOOLEAN);

    // A LIST AND A CHOICE CARRY THEIR PARAMETER, and that is the whole of why they are types
    // on a wire rather than labels on one: `typesCompatible()` compares names, so a port
    // called `array` for both a list of numbers and a list of text would let a creator wire
    // one into the other. Read off the declaration alone — no instance, no scene.
    assert.equal(portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER }), 'array<number>');
    assert.equal(portTypeOf({ type: PropertyType.ENUM, values: ['idle', 'run'] }), 'enum<idle|run>');

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

// --- a List of references crosses the same boundary, element by element ------------------

test('a stored list of references becomes a list of handles', () => {
    const list = { type: PropertyType.ARRAY, of: PropertyType.OBJECTREF };
    const player = { id: 'obj_1', name: 'Player' };
    const enemy = { id: 'obj_2', name: 'Enemy' };
    const scene = { get: id => ({ obj_1: player, obj_2: enemy })[id] };

    // The port is typed `array<object>` for exactly this declaration, so handing it a list of
    // ObjectIds would be the defect `portValueOf()` exists for, one level down: `Is Valid`
    // would answer on a string and `Parent` would read nothing.
    assert.deepEqual(portValueOf(list, ['obj_1', 'obj_2'], scene), [player, enemy]);
});

test('an element that resolves to nothing becomes null, and keeps its place', () => {
    const list = { type: PropertyType.ARRAY, of: PropertyType.OBJECTREF };
    const player = { id: 'obj_1' };
    const scene = { get: id => (id === 'obj_1' ? player : undefined) };

    assert.deepEqual(portValueOf(list, ['obj_1', 'obj_gone', null], scene), [player, null, null],
        'a dead reference is a hole in the list, not a shorter list');
    assert.deepEqual(portValueOf(list, 'not a list', scene), [],
        'a value that is not a list reads as an empty one — `[]` is what a list\'s absence looks like');
});

test('a list of handles is stored as a list of identities, and a handle is never stored', () => {
    const list = { type: PropertyType.ARRAY, of: PropertyType.OBJECTREF };

    assert.deepEqual(storedValueOf(list, [{ id: 'obj_1', name: 'Player' }, { id: 'obj_2' }]),
        ['obj_1', 'obj_2']);

    // The other half of §3.6, one level down: nothing here promotes an arbitrary string into
    // a stored reference, and no Object record can reach `serializeScene()` through a list.
    assert.deepEqual(storedValueOf(list, ['obj_7f3a91c2', 42, null]), [null, null, null]);
    assert.deepEqual(storedValueOf(list, null), []);
});

test('a list of anything else crosses the boundary untouched', () => {
    const numbers = { type: PropertyType.ARRAY, of: PropertyType.NUMBER };
    const scene = { get: () => { throw new Error('a plain value must not be resolved'); } };

    assert.deepEqual(portValueOf(numbers, [1, 2, 3], scene), [1, 2, 3]);
    assert.deepEqual(storedValueOf(numbers, [1, 2, 3]), [1, 2, 3]);
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
    //
    // A TYPE THAT TAKES A PARAMETER IS STILL ITSELF. `array<number>` is an `array`, and
    // `baseTypeOf()` is the Core's own way of saying so — which is what a hue, an icon and a
    // control are chosen from, none of them being a function of what a list holds.
    for (const type of propertyTypes()) {
        const carried = portTypeOf({ type });

        if (type === PropertyType.OBJECTREF) {
            assert.equal(carried, OBJECT_TYPE, 'objectref is carried as an object handle');
            continue;
        }
        assert.equal(baseTypeOf(carried), type, `${type} is carried under another name`);
    }

    // Nothing declared at all is honestly unconstrained rather than wrongly typed.
    assert.equal(portTypeOf(null), ANY_TYPE);
    assert.equal(portTypeOf({}), ANY_TYPE);
});

test('Get Property and Set Property take the shape of the property they name', () => {
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
        // The parameter travels with the type, on this node as on every other: the shape a
        // remote property has is the shape `portTypeOf()` gives it, and there is one of those.
        p_mood: 'enum<calm>',
        p_tags: 'array<any>',
        p_target: OBJECT_TYPE
    };

    for (const [property, expected] of globalThis.Object.entries(shapes)) {
        const params = { component: 'res_health', property };

        const read = portsOf(registry.get('property.get'), { id: 'g', type: 'property.get', params },
            { components }).outputs.find(port => port.id === 'value');
        const write = portsOf(registry.get('property.set'), { id: 's', type: 'property.set', params },
            { components }).inputs.find(port => port.id === 'value');

        assert.equal(read.type, expected, `Get Property mistypes ${property}`);
        assert.equal(write.type, expected, `Set Property mistypes ${property}`);
        // READ AND WRITE AGREE, which is what lets a creator wire one into the other.
        assert.equal(read.type, write.type);
    }
});

test('a property nobody has named yet is honestly untyped, and says so on both nodes', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const bare = { id: 'n', type: 'property.get', params: {} };

    assert.equal(portsOf(registry.get('property.get'), bare, { components: [] })
        .outputs.find(port => port.id === 'value').type, ANY_TYPE);
    assert.equal(portsOf(registry.get('property.set'), { ...bare, type: 'property.set' }, { components: [] })
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

// --- Choice and List are real types on a wire (ADR-0031 §2, §3) -------------------------
//
// A port type is a NAME, and `typesCompatible()` compares names — so a type that takes a
// parameter has to carry it, or two lists of different things become one type and the
// Editor allows a wire that can only ever deliver the wrong value.

test('two Choices offering the same options are the same type, however they are ordered', () => {
    // An option IS its value and has no identity of its own (ADR-0031 §2), so what
    // identifies a Choice is the SET of its options. Reordering is a display gesture that
    // ADR-0031 §2 lists beside adding and removing; one that silently broke every wire in
    // the graph would be a gesture no creator could afford to make.
    const up = portTypeOf({ type: PropertyType.ENUM, values: ['up', 'down'] });
    const down = portTypeOf({ type: PropertyType.ENUM, values: ['down', 'up'] });

    assert.equal(up, down);
    assert.equal(typesCompatible(up, down), true);

    // A duplicate is not a second option either.
    assert.equal(portTypeOf({ type: PropertyType.ENUM, values: ['up', 'up', 'down'] }), up);
});

test('two Choices offering different options are different types, and refuse each other', () => {
    const mood = portTypeOf({ type: PropertyType.ENUM, values: ['calm', 'angry'] });
    const heading = portTypeOf({ type: PropertyType.ENUM, values: ['up', 'down'] });

    assert.notEqual(mood, heading);
    assert.equal(typesCompatible(mood, heading), false, 'the value could never be one of the options');
    assert.equal(typesCompatible(heading, mood), false);

    // Removing an option changes what the Choice IS, and the type says so.
    assert.notEqual(mood, portTypeOf({ type: PropertyType.ENUM, values: ['calm'] }));
});

test('the name of an option set is injective, so two Choices cannot collide', () => {
    // Without escaping, `['a|b']` and `['a', 'b']` would produce one name — two Choices that
    // accept different values, silently interchangeable.
    assert.notEqual(portTypeOf({ type: PropertyType.ENUM, values: ['a|b'] }),
        portTypeOf({ type: PropertyType.ENUM, values: ['a', 'b'] }));
});

test('a Choice reads as Text and is never written from one', () => {
    const mood = portTypeOf({ type: PropertyType.ENUM, values: ['calm', 'angry'] });

    // Every value a Choice can hold is one of its options, and an option is a string in a
    // `.px` payload (ADR-0031 §2) — so reading one as text loses nothing.
    assert.equal(typesCompatible(mood, PropertyType.STRING), true);

    // The reverse is where a Choice would stop being a Choice: an arbitrary string is not one
    // of the options, and `isValidValue()` says so. That asymmetry is the whole reason a
    // Choice is not a Text with extra rendering.
    assert.equal(typesCompatible(PropertyType.STRING, mood), false);

    // And it is not quietly numeric, or an object, or a list.
    assert.equal(typesCompatible(mood, PropertyType.NUMBER), false);
    assert.equal(typesCompatible(mood, OBJECT_TYPE), false);
    assert.equal(typesCompatible(mood, portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.STRING })), false);
});

test('a List carries what it is a list OF, and lists of different things are different types', () => {
    const numbers = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER });
    const text = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.STRING });

    assert.notEqual(numbers, text);
    assert.equal(typesCompatible(numbers, text), false);
    assert.equal(typesCompatible(text, numbers), false);
});

test('a List is not the thing it holds', () => {
    const numbers = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER });

    assert.equal(typesCompatible(numbers, PropertyType.NUMBER), false);
    assert.equal(typesCompatible(PropertyType.NUMBER, numbers), false);
});

test('two Lists agree exactly when their elements do, by the same rule', () => {
    // The rule for a list IS the rule for what it holds, asked one level down. A second rule
    // about lists would be a second opinion about `int`.
    const numbers = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER });
    const integers = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.INT });

    assert.equal(typesCompatible(integers, numbers), true, 'an Integer feeds a Number, so a list of them does');
    assert.equal(typesCompatible(numbers, integers), true);

    const moods = portTypeOf({ type: PropertyType.ARRAY, element: { type: PropertyType.ENUM, values: ['calm'] } });
    const strings = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.STRING });

    assert.equal(typesCompatible(moods, strings), true, 'a Choice reads as Text, so a list of them does');
    assert.equal(typesCompatible(strings, moods), false, 'and is not written from one, at either level');
});

test('a List of Choices is not a List of Text, and the declaration says so', () => {
    const moods = portTypeOf({ type: PropertyType.ARRAY, element: { type: PropertyType.ENUM, values: ['calm', 'angry'] } });

    assert.equal(moods, 'array<enum<angry|calm>>');
    assert.notEqual(moods, portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.STRING }));
});

test('a List that declares nothing is a list of anything, and takes anything', () => {
    // ADR-0031 §3: an undeclared element type is `any`, which is already the absence of a
    // constraint. `Tilemap.tiles` keeps taking and giving whatever it did.
    const anything = portTypeOf({ type: PropertyType.ARRAY });

    assert.equal(anything, 'array<any>');
    assert.equal(typesCompatible(anything, portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER })), true);
    assert.equal(typesCompatible(portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.COLOR }), anything), true);

    // Still a list, though: it is not compatible with what it holds.
    assert.equal(typesCompatible(anything, PropertyType.NUMBER), false);
});

test('a List of references travels as a list of handles, by the rule one level up', () => {
    // `objectref` is an identity where it is stored and a handle where it travels
    // (ADR-0034 §3.5). A list of them is the same sentence, and stating it twice is how the
    // two would come to disagree.
    const references = portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.OBJECTREF });

    assert.equal(references, `array<${OBJECT_TYPE}>`);
    assert.equal(references.includes(PropertyType.OBJECTREF), false, 'no port is ever typed objectref');
});

test('a parameterised type is still its base type, which is what a hue and an icon read', () => {
    assert.equal(baseTypeOf(portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER })), PropertyType.ARRAY);
    assert.equal(baseTypeOf(portTypeOf({ type: PropertyType.ENUM, values: ['a'] })), PropertyType.ENUM);
    assert.equal(baseTypeOf('array<enum<a|b>>'), PropertyType.ARRAY, 'however deep the parameter goes');
    assert.equal(baseTypeOf(PropertyType.NUMBER), PropertyType.NUMBER, 'a type that takes none is itself');
    assert.equal(baseTypeOf(ANY_TYPE), ANY_TYPE);
    assert.equal(baseTypeOf(null), ANY_TYPE, 'nothing is no constraint');
});

test('`any` stays universal, whatever the parameter', () => {
    for (const type of [
        portTypeOf({ type: PropertyType.ARRAY, of: PropertyType.NUMBER }),
        portTypeOf({ type: PropertyType.ENUM, values: ['a', 'b'] })
    ]) {
        assert.equal(typesCompatible(ANY_TYPE, type), true);
        assert.equal(typesCompatible(type, ANY_TYPE), true);
    }
});

// --- what a change to a node can change ------------------------------------------------------

test('a node type says for itself whether its shape depends on the node', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    // Dynamic: the port is typed by the property the node names, so picking one retypes it.
    for (const type of ['property.get', 'property.set', 'property.get', 'property.set']) {
        assert.equal(shapeDependsOnNode(registry.get(type)), true, type);
    }

    // Fixed: a literal declares its ports as arrays, so the value it holds moves nothing.
    for (const type of ['value.number', 'value.string', 'value.boolean', 'math.add', 'flow.branch']) {
        assert.equal(shapeDependsOnNode(registry.get(type)), false, type);
    }
});

test('a fixed port list depends on nothing, and neither does a name', () => {
    assert.equal(shapeDependsOnNode({ inputs: [], outputs: [] }), false);
    assert.equal(shapeDependsOnNode(null), false, 'a type nothing resolves reshapes nothing');
});

// --- a node is named for what it IS (ADR-0040 §5) ------------------------------------------

test('no node type in the catalogue can rename itself', () => {
    // THE RULE IS ABSOLUTE, so it is checked as a rule and not node by node. A definition
    // has a `label` and no other way to say what it is called: the mechanism that let one
    // compute a name from its params is gone, so `Get Ground` cannot come back by being
    // added rather than by being argued for.
    const registry = registerStandardNodes(new NodeRegistry());

    for (const definition of registry.definitions()) {
        assert.equal(typeof definition.label, 'string', `${definition.type} has no name`);
        assert.ok(definition.label.length > 0, `${definition.type} is named with nothing`);
        assert.equal('title' in definition, false,
            `${definition.type} declares a title, which is a name that moves`);
    }
});

// --- the Object's own properties are a namespace, not a Component (ADR-0043) --------------

test('the Object declares exactly the four fields a creator meets in the Inspector', () => {
    const declared = objectProperties();

    assert.deepEqual(declared.map(property => property.name), ['name', 'tag', 'layer', 'active']);
    // The id IS the name: these are fixed by the engine, so there is no rename to survive.
    assert.ok(declared.every(property => property.id === property.name));
    assert.ok(declared.every(property => propertyTypes().includes(property.type)),
        'every one of them is a shape the Core already knows how to store and validate');
});

test('a port may carry a sentence, and one that declares none carries null', () => {
    // `Pressed`, `Released` and `Is Down` are three words a beginner has to tell apart, and
    // no shortening of the labels teaches the difference (ADR-0041 §3).
    const explained = createPort({ id: 'pressed', kind: PortKind.FLOW, label: 'Pressed', tooltip: 'Once, on the way down' });
    const plain = createPort({ id: 'value', type: PropertyType.NUMBER });

    assert.equal(explained.tooltip, 'Once, on the way down');
    assert.equal(plain.tooltip, null);
});

test('the input nodes say what each of their ports means', () => {
    const registry = registerStandardNodes(new NodeRegistry());

    for (const [type, portId] of [
        ['input.onKey', 'pressed'], ['input.onKey', 'released'],
        ['input.onPointerButton', 'pressed'], ['input.onPointerButton', 'released'],
        ['input.key', 'held'], ['input.pointerButton', 'held']
    ]) {
        const definition = registry.get(type);
        const port = portsOf(definition, { id: 'n', type, params: {} }, {})
            .outputs.find(entry => entry.id === portId);
        assert.ok(port?.tooltip, `${type} ▸ ${portId} explains itself nowhere`);
    }
});

test('the arithmetic a creator expects to find is there, and answers', () => {
    // A CATALOGUE WITH HOLES IN IT IS A CATALOGUE A CREATOR STOPS TRUSTING (ADR-0048 §4).
    // `Min` and `Max` next to `Add` cost nothing and were simply missing.
    const registry = registerStandardNodes(new NodeRegistry());
    const answer = (type, a, b) => registry.get(type).evaluate({
        input: port => (port === 'a' ? a : port === 'b' ? b : undefined)
    }).result;

    assert.equal(answer('math.min', 3, 7), 3);
    assert.equal(answer('math.max', 3, 7), 7);
    assert.equal(answer('math.modulo', 7, 3), 1);
    // THE SAME DECISION `Divide` MADE, FOR THE SAME REASON: a NaN entering a Transform
    // spreads silently through every frame after it.
    assert.equal(answer('math.modulo', 7, 0), 0);
});

test('one number in, one out — and it is the same shape with a port fewer', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const answer = (type, value) => registry.get(type).evaluate({ input: () => value }).result;

    assert.equal(answer('math.absolute', -4.5), 4.5);
    assert.equal(answer('math.absolute', 4.5), 4.5);
    assert.equal(answer('math.round', 2.4), 2);
    assert.equal(answer('math.round', 2.6), 3);

    for (const type of ['math.absolute', 'math.round']) {
        const ports = portsOf(registry.get(type), { id: 'n', type, params: {} }, {});
        assert.deepEqual(ports.inputs.map(port => port.id), ['value']);
        assert.deepEqual(ports.outputs.map(port => port.id), ['result']);
        assert.equal(registry.get(type).category, 'Math');
    }
});

test('every comparison has its opposite, and Equal has its negation', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const answer = (type, a, b) => registry.get(type).evaluate({
        input: port => (port === 'a' ? a : b)
    }).result;

    assert.equal(answer('compare.greaterOrEqual', 3, 3), true);
    assert.equal(answer('compare.greaterOrEqual', 2, 3), false);
    assert.equal(answer('compare.lessOrEqual', 3, 3), true);
    assert.equal(answer('compare.lessOrEqual', 4, 3), false);

    // NOT EQUAL IS THE EXACT NEGATION, and it reads the same comparison: writing it as
    // `!==` beside an `Equal` written as `===` is how two rules that were one drift apart.
    for (const [a, b] of [[1, 1], [1, 2], ['x', 'x'], [true, false]]) {
        assert.equal(answer('compare.notEqual', a, b), !answer('compare.equal', a, b), `${a} vs ${b}`);
    }
});

test('trigonometry speaks the unit the Editor speaks', () => {
    // A CREATOR WHO HAS TYPED `90` INTO A ROTATION FIELD EXPECTS TO TYPE `90` HERE
    // (ADR-0049 §2). The conversion lives in the node, exactly as it does in `Rotate`; the
    // Core still thinks in radians and nothing about the property model moves.
    const registry = registerStandardNodes(new NodeRegistry());
    const answer = (type, value) => registry.get(type).evaluate({ input: () => value }).result;

    assert.ok(Math.abs(answer('math.sin', 0) - 0) < 1e-9);
    assert.ok(Math.abs(answer('math.sin', 90) - 1) < 1e-9);
    assert.ok(Math.abs(answer('math.cos', 0) - 1) < 1e-9);
    assert.ok(Math.abs(answer('math.cos', 180) + 1) < 1e-9);

    // And the port says which unit, because `Angle` would have two answers.
    const ports = portsOf(registry.get('math.sin'), { id: 'n', type: 'math.sin', params: {} }, {});
    assert.equal(ports.inputs[0].label, 'Degrees');
});

test('Distance takes Objects, because that is the question a creator asks', () => {
    const registry = registerStandardNodes(new NodeRegistry());
    const definition = registry.get('math.distance');

    const at = (x, y) => {
        const object = new SceneObject('o');
        object.addComponent(new Transform(x, y));
        return object;
    };
    const between = (from, to) => definition.evaluate({
        input: port => (port === 'a' ? from : to)
    }).result;

    assert.equal(between(at(0, 0), at(3, 4)), 5);
    assert.equal(between(at(10, 10), at(10, 10)), 0);

    // AN OBJECT WITH NO TRANSFORM IS A STATE OF THE SCENE, NOT A FAULT (ADR-0034 §3.4): it
    // has no position, so there is no distance to give.
    assert.equal(between(at(0, 0), new SceneObject('nowhere')), 0);
    assert.equal(between(null, at(1, 1)), 0);

    // Four coordinate ports would make a creator assemble the question before asking it.
    const ports = portsOf(definition, { id: 'n', type: 'math.distance', params: {} }, {});
    assert.deepEqual(ports.inputs.map(port => port.label), ['From', 'To']);
});
