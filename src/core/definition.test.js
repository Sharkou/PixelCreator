import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Object,
    Scene,
    ComponentRegistry,
    componentType,
    componentLabel,
    componentSchema,
    defineComponent,
    componentDefinition,
    componentGraphId,
    serializeComponent,
    serializeScene,
    deserializeScene
} from './mod.js';

/**
 * What the Editor saves when a creator makes their own Component.
 *
 * `type` is the ResourceId of the definition — opaque, minted once. `label` is the name
 * the creator typed, and the only one of the two they ever see (ADR-0021).
 */
function controllerDefinition() {
    return {
        type: 'res_c3',
        label: 'Controller',
        properties: {
            speed: { type: 'number', default: 120 },
            jumping: { type: 'boolean', default: false }
        },
        graph: 'res_d4'
    };
}

// --- a definition produces an ordinary component type ------------------------------

test('a definition produces a component class like any other', () => {
    const Controller = defineComponent(controllerDefinition());

    assert.equal(typeof Controller, 'function');
    assert.equal(componentType(Controller), 'res_c3');
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
        type: 'res_stats',
        properties: {
            hp: { type: 'number' },
            level: { type: 'int' },
            name: { type: 'string' },
            alive: { type: 'boolean' },
            tint: { type: 'color' },
            mode: { type: 'enum', values: ['idle', 'run'] },
            sprite: { type: 'resource' },
            tags: { type: 'array' }
        }
    });

    assert.deepEqual({ ...new Stats() }, {
        hp: 0,
        level: 0,
        name: '',
        alive: false,
        tint: '',
        mode: 'idle',
        sprite: null,
        tags: []
    });
});

test('two instances never share a container default', () => {
    const Inventory = defineComponent({
        type: 'res_inv',
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
    assert.throws(() => defineComponent({ type: 'A', label: '' }), TypeError);
});

test('a property type the core cannot answer for is refused', () => {
    // The core owes three answers per property: starting value, validity, serialized
    // shape. It has none for a type it does not know, and `object` was exactly that —
    // no schema, no validation, no editor, no meaning for replication (ADR-0023).
    assert.throws(
        () => defineComponent({ type: 'A', properties: { data: { type: 'object' } } }),
        /unknown property type "object"/
    );
    assert.throws(
        () => defineComponent({ type: 'A', properties: { x: { type: 'whatever' } } }),
        /unknown property type "whatever"/
    );
    // `range` and `readonly` are Editor vocabulary, not shapes of value.
    assert.throws(
        () => defineComponent({ type: 'A', properties: { v: { type: 'range' } } }),
        /unknown property type "range"/
    );
});

test('a definition needs neither properties nor a graph', () => {
    // A marker component is a legitimate component.
    const Tagged = defineComponent({ type: 'res_tag', label: 'Tagged' });

    assert.deepEqual({ ...new Tagged() }, {});
    assert.equal(componentGraphId(Tagged), null);
});

// --- identity is not a name (ADR-0021) ---------------------------------------------

test('the type is the identity and the label is what a creator reads', () => {
    const Controller = defineComponent(controllerDefinition());

    assert.equal(componentType(Controller), 'res_c3');
    assert.equal(componentLabel(Controller), 'Controller');
    assert.equal(componentLabel(new Controller()), 'Controller');
});

test('renaming a definition breaks no instance', () => {
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    const scene = new Scene('Main', { registry });
    const object = scene.add(new Object('Player'));
    object.addComponent(registry.create('res_c3')).speed = 240;

    const saved = JSON.parse(JSON.stringify(serializeScene(scene)));

    // The creator renames the component. Only the label moves.
    const renamed = { ...controllerDefinition(), label: 'Player Controller' };
    registry.register(defineComponent(renamed), { replace: true });

    const restored = deserializeScene(saved, { registry });
    const controller = restored.objects()[0].getComponent('res_c3');

    assert.equal(controller.speed, 240, 'the instance is untouched');
    assert.equal(componentLabel(controller), 'Player Controller', 'only the displayed name moved');
    assert.equal(saved.objects[0].components[0].type, 'res_c3',
        'the saved scene keys by identity, never by name');
});

test('a component with no label is shown under its type', () => {
    class Marker { static type = 'Marker'; }

    assert.equal(componentLabel(Marker), 'Marker');
    assert.equal(componentLabel('RectangleRenderer'), 'RectangleRenderer');
});

// --- the definition belongs to the type --------------------------------------------

test('the graph is referenced by ResourceId, never inlined', () => {
    const definition = controllerDefinition();
    const Controller = defineComponent(definition);

    const first = new Controller();
    const second = new Controller();

    assert.equal(componentGraphId(first), 'res_d4');
    assert.equal(componentGraphId(second), 'res_d4', 'one graph for the type');
    assert.deepEqual(globalThis.Object.keys(first), ['speed', 'jumping']);
    assert.deepEqual(serializeComponent(first), { speed: 120, jumping: false });

    // An inline graph would be a second copy of a resource that already exists on its
    // own, and would stop the Graph window from opening it alone (ADR-0016, ADR-0020).
    assert.throws(
        () => defineComponent({ type: 'A', graph: { version: 1, nodes: [] } }),
        /must be a ResourceId or null/
    );
    assert.throws(() => defineComponent({ type: 'A', graph: [] }), TypeError);
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

    const scene = new Scene('Main', { registry });
    const object = scene.add(new Object('Player'));
    const controller = object.addComponent(registry.create('res_c3'));
    controller.speed = 240;

    const restored = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))), { registry });
    const player = restored.objects()[0].getComponent('res_c3');

    assert.equal(player.speed, 240, 'the value travelled');
    assert.equal(player.jumping, false, 'and the untouched property came from the definition');
    assert.deepEqual(globalThis.Object.keys(player), ['speed', 'jumping'], 'no behavior rode along');
});

test('a type is not silently taken over, but can be deliberately replaced', () => {
    // Editing a custom component in the Editor is a deliberate act; a collision is a bug.
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    assert.throws(
        () => registry.register(defineComponent({ type: 'res_c3' })),
        /already registered by another class/
    );

    const edited = defineComponent({
        type: 'res_c3',
        label: 'Controller',
        properties: { speed: { type: 'number', default: 300 } }
    });
    registry.register(edited, { replace: true });

    assert.equal(registry.get('res_c3'), edited);
    assert.equal(registry.create('res_c3').speed, 300);
});

test('a defined component attaches like any other', () => {
    const Controller = defineComponent(controllerDefinition());
    const object = new Object('Player');

    const controller = object.addComponent(new Controller());
    controller.speed = 10;

    assert.equal(object.getComponent('res_c3'), controller);
    assert.equal(object.getComponent('res_c3').speed, 10, 'reactive like the others');
});

// --- structural reconciliation (S1, ADR-0021) ---------------------------------------

test('editing a definition reconciles the instances already saved', () => {
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    const scene = new Scene('Main', { registry });
    const object = scene.add(new Object('Player'));
    const controller = object.addComponent(registry.create('res_c3'));
    controller.speed = 240;
    controller.jumping = true;

    const saved = JSON.parse(JSON.stringify(serializeScene(scene)));

    // The creator drops `jumping` and adds `friction`. No migration is written.
    registry.register(defineComponent({
        ...controllerDefinition(),
        properties: {
            speed: { type: 'number', default: 120 },
            friction: { type: 'number', default: 0.9 }
        }
    }), { replace: true });

    const restored = deserializeScene(saved, { registry })
        .objects()[0].getComponent('res_c3');

    assert.deepEqual({ ...restored }, { speed: 240, friction: 0.9 });
    assert.equal(restored.jumping, undefined, 'a property the schema dropped is dropped');
});

test('a component whose definition is missing keeps its values instead of losing the scene', () => {
    const registry = new ComponentRegistry();
    registry.register(defineComponent(controllerDefinition()));

    const scene = new Scene('Main', { registry });
    const object = scene.add(new Object('Player'));
    object.addComponent(registry.create('res_c3')).speed = 240;

    const saved = JSON.parse(JSON.stringify(serializeScene(scene)));

    // The definition resource has not loaded — or has been deleted by accident.
    const restored = deserializeScene(saved, { registry: new ComponentRegistry() });
    const placeholder = restored.objects()[0].getComponent('res_c3');

    assert.ok(placeholder, 'the slot survives');
    assert.equal(placeholder.speed, 240, 'and so does every value');
    assert.deepEqual(
        JSON.parse(JSON.stringify(serializeScene(restored))).objects[0].components,
        saved.objects[0].components,
        'saving again writes exactly what was read, so nothing is lost on the way out'
    );
});

test('the core defines components without knowing what a graph is', async () => {
    // A definition carries a graph identifier as data. Resolving it belongs to the
    // Project layer, interpreting it to the runtime, and the core must never depend on
    // either of them.
    const source = await import('node:fs/promises')
        .then(fs => fs.readFile(new URL('./definition.js', import.meta.url), 'utf8'));

    assert.equal(/from '\.\.\/runtime/.test(source), false);
    assert.equal(/from '\.\.\/project/.test(source), false);
    assert.equal(typeof globalThis.document, 'undefined');
});
