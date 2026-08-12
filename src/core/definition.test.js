import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Object,
    Scene,
    ComponentRegistry,
    componentType,
    componentSchema,
    defineComponent,
    componentDefinition,
    serializeComponent,
    serializeScene,
    deserializeScene
} from './mod.js';

/** What the Editor will save when a creator makes their own Component. */
function controllerDefinition() {
    return {
        type: 'Controller',
        properties: {
            speed: { type: 'number', default: 120 },
            jumping: { type: 'boolean', default: false }
        },
        graph: { version: 1, nodes: [], connections: [] }
    };
}

// --- a definition produces an ordinary component type ------------------------------

test('a definition produces a component class like any other', () => {
    const Controller = defineComponent(controllerDefinition());

    assert.equal(typeof Controller, 'function');
    assert.equal(componentType(Controller), 'Controller');
    assert.equal(Controller.name, 'Controller', 'named, so a stack trace says which one');
    assert.deepEqual(globalThis.Object.keys(componentSchema(Controller)), ['speed', 'jumping']);
});

test('a new instance carries exactly the declared properties', () => {
    // The drift ADR-0007 warns about cannot happen here: the schema *is* the constructor.
    const Controller = defineComponent(controllerDefinition());

    const controller = new Controller();

    assert.deepEqual(globalThis.Object.keys(controller), ['speed', 'jumping']);
    assert.equal(controller.speed, 120);
    assert.equal(controller.jumping, false);
});

test('a property with no declared default starts from its type', () => {
    const Stats = defineComponent({
        type: 'Stats',
        properties: {
            hp: { type: 'number' },
            name: { type: 'string' },
            alive: { type: 'boolean' },
            tint: { type: 'color' },
            tags: { type: 'array' },
            data: { type: 'object' },
            unknown: { type: 'whatever' }
        }
    });

    assert.deepEqual({ ...new Stats() }, {
        hp: 0,
        name: '',
        alive: false,
        tint: '',
        tags: [],
        data: {},
        unknown: null
    });
});

test('two instances never share a container default', () => {
    const Inventory = defineComponent({
        type: 'Inventory',
        properties: { slots: { type: 'array', default: [{ item: null }] } }
    });

    const first = new Inventory();
    const second = new Inventory();
    first.slots.push({ item: 'sword' });
    first.slots[0].item = 'shield';

    assert.deepEqual(second.slots, [{ item: null }], 'the default was copied, not shared');
});

test('a definition is refused when it describes nothing usable', () => {
    assert.throws(() => defineComponent(), TypeError);
    assert.throws(() => defineComponent({ type: '' }), TypeError);
    assert.throws(() => defineComponent({ type: 'A', properties: 'nope' }), TypeError);
    assert.throws(() => defineComponent({ type: 'A', properties: { x: 1 } }), TypeError);
    assert.throws(() => defineComponent({ type: 'A', graph: [] }), TypeError);
});

test('a definition needs neither properties nor a graph', () => {
    // A marker component is a legitimate component.
    const Tagged = defineComponent({ type: 'Tagged' });

    assert.deepEqual({ ...new Tagged() }, {});
    assert.equal(componentDefinition(Tagged).graph, undefined);
});

// --- the definition belongs to the type --------------------------------------------

test('the graph lives on the type, never on the instance', () => {
    const definition = controllerDefinition();
    const Controller = defineComponent(definition);

    const first = new Controller();
    const second = new Controller();

    assert.equal(componentDefinition(first).graph, definition.graph);
    assert.equal(componentDefinition(second).graph, definition.graph, 'one graph for the type');
    assert.deepEqual(globalThis.Object.keys(first), ['speed', 'jumping']);
    assert.deepEqual(serializeComponent(first), { speed: 120, jumping: false });
});

test('a hand-written component has no definition', () => {
    class Marker { static type = 'Marker'; }

    assert.equal(componentDefinition(Marker), null);
    assert.equal(componentDefinition(new Marker()), null);
});

// --- registry and serialization -----------------------------------------------------

test('a defined component round-trips through a scene', () => {
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const controller = object.addComponent(registry.create('Controller'));
    controller.speed = 240;

    const restored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))), { registry });
    const player = restored.objects()[0].getComponent('Controller');

    assert.equal(player.speed, 240, 'the value travelled');
    assert.equal(player.jumping, false, 'and the untouched property came from the definition');
    assert.deepEqual(globalThis.Object.keys(player), ['speed', 'jumping'], 'no behavior rode along');
});

test('a type name is not silently taken over, but can be deliberately replaced', () => {
    // Editing a custom component in the Editor is a deliberate act; a collision is a bug.
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    assert.throws(
        () => registry.register(defineComponent({ type: 'Controller' })),
        /already registered by another class/
    );

    const edited = defineComponent({
        type: 'Controller',
        properties: { speed: { type: 'number', default: 300 } }
    });
    registry.register(edited, { replace: true });

    assert.equal(registry.get('Controller'), edited);
    assert.equal(registry.create('Controller').speed, 300);
});

test('a defined component attaches like any other', () => {
    const Controller = defineComponent(controllerDefinition());
    const object = new Object('Player');

    const controller = object.addComponent(new Controller());
    controller.speed = 10;

    assert.equal(object.getComponent('Controller'), controller);
    assert.equal(object.getComponent('Controller').speed, 10, 'reactive like the others');
});

test('the core defines components without knowing what a graph is', async () => {
    // A definition carries a graph as data. Interpreting it belongs to the runtime, and
    // the core must never depend on it.
    const source = await import('node:fs/promises')
        .then(fs => fs.readFile(new URL('./definition.js', import.meta.url), 'utf8'));

    assert.equal(/from '\.\.\/runtime/.test(source), false);
    assert.equal(typeof globalThis.document, 'undefined');
});
