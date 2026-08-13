import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Scene } from './scene.js';
import { Object } from './object.js';
import { Transform } from './components/transform.js';
import { ComponentRegistry } from './component.js';
import {
    FORMAT_VERSION,
    serializeObject,
    serializeComponent,
    serializeScene,
    deserializeScene
} from './serialize.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
    update() {}
}

class Cached {
    static type = 'Cached';
    static schema = { speed: { type: 'number', default: 1 } };
    constructor() {
        this.speed = 1;
        this.frameCache = { computed: true };   // runtime state, absent from the schema
    }
}

function registry() {
    const known = new ComponentRegistry();
    known.register(Transform);
    known.register(Rotator);
    known.register(Cached);
    return known;
}

test('an object serializes its contract fields in a fixed order', () => {
    const object = new Object('Player', { tag: 'hero', layer: 3, owner: 'player-1' });
    const data = serializeObject(object);

    assert.deepEqual(globalThis.Object.keys(data), [
        'id', 'name', 'tag', 'layer', 'active', 'visible', 'lock', 'owner',
        'parent', 'children', 'components'
    ]);
    assert.equal(data.name, 'Player');
    assert.equal(data.owner, 'player-1');
});

test('no internal detail leaks into the output', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20));

    const text = JSON.stringify(serializeObject(object));

    // Legacy shipped _prop shadows and $prop accessors in every payload.
    assert.ok(!text.includes('"_'), 'no underscore shadow');
    assert.ok(!text.includes('$'), 'no dollar accessor');
    assert.ok(!text.includes('setProperty'), 'no injected method');
    assert.ok(!text.includes('Symbol'), 'no symbol-keyed state');
});

test('a property is serialized exactly once', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20));
    const text = JSON.stringify(serializeObject(object));

    assert.equal(text.split('"x"').length - 1, 1);
    assert.equal(text.split('"name"').length - 1, 1);
});

test('a facade property belongs to its component, not to the object', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20));
    object.x = 55;

    const data = serializeObject(object);

    assert.equal(data.x, undefined, 'the facade stores nothing, so it serializes nothing');
    assert.equal(data.components.Transform.x, 55);
});

test('ad-hoc properties on an Object are not serialized', () => {
    // User data belongs in components; the object contract is explicit and closed.
    const object = new Object('Player');
    object.health = 100;

    assert.equal(serializeObject(object).health, undefined);
});

test('a component with a schema serializes its schema keys only', () => {
    const object = new Object('Player');
    object.addComponent(new Cached());

    const data = serializeComponent(object.getComponent('Cached'));

    assert.deepEqual(data, { speed: 1 }, 'runtime cache stays out');
});

test('a component that was switched off says so, schema or not', () => {
    const object = new Object('Player');
    const schemaDriven = object.addComponent(new Cached());
    const reflective = object.addComponent(new Rotator());

    schemaDriven.active = false;
    reflective.active = false;

    assert.deepEqual(serializeComponent(schemaDriven), { speed: 1, active: false },
        '`active` is part of the contract, not of the schema (ADR-0004, ADR-0012)');
    assert.deepEqual(serializeComponent(reflective), { speed: 2, active: false });
});

test('a component that never had `active` does not gain one', () => {
    const object = new Object('Player');
    object.addComponent(new Cached());

    assert.equal('active' in serializeComponent(object.getComponent('Cached')), false,
        'absent means active; the runtime must not be told otherwise');
});

test('a deactivated component comes back deactivated', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Cached()).active = false;

    const restored = deserializeScene(serializeScene(scene), { registry: registry() });

    assert.equal(restored.get(object.id).getComponent('Cached').active, false);
});

test('a component without a schema serializes its own data properties', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator(7));

    assert.deepEqual(serializeComponent(object.getComponent('Rotator')), { speed: 7 });
});

test('children are references, never nested', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    const data = serializeScene(scene);
    const parentData = data.objects.find(entry => entry.id === parent.id);

    // Legacy embedded each child inside its parent AND listed it at the scene root.
    assert.deepEqual(parentData.children, [child.id]);
    assert.equal(typeof parentData.children[0], 'string');
    assert.equal(data.objects.length, 2, 'each object appears once');
});

test('a child records its parent by id', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addChild(child);

    const data = serializeScene(scene);
    const childData = data.objects.find(entry => entry.id === child.id);

    assert.equal(childData.parent, parent.id);
});

test('serialization is deterministic', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Rotator(3));
    object.addComponent(new Transform(1, 2));

    assert.equal(JSON.stringify(serializeScene(scene)), JSON.stringify(serializeScene(scene)));
});

test('component keys are sorted, so key order carries no accident', () => {
    const first = new Object('A');
    first.addComponent(new Transform());
    first.addComponent(new Rotator());

    const second = new Object('B');
    second.addComponent(new Rotator());
    second.addComponent(new Transform());

    assert.deepEqual(
        globalThis.Object.keys(serializeObject(first).components),
        globalThis.Object.keys(serializeObject(second).components)
    );
});

test('a scene survives a round trip', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent', { tag: 'root', layer: 2 }));
    const child = scene.add(new Object('Child', { owner: 'player-1' }));
    parent.addComponent(new Transform(10, 20, 1.5, 2, 3));
    parent.addComponent(new Rotator(5));
    child.active = false;
    parent.addChild(child);

    const restored = deserializeScene(serializeScene(scene), { registry: registry() });

    assert.equal(restored.name, 'Main');
    assert.equal(restored.id, scene.id);
    assert.equal(restored.size, 2);

    const restoredParent = restored.get(parent.id);
    const restoredChild = restored.get(child.id);

    assert.equal(restoredParent.name, 'Parent');
    assert.equal(restoredParent.tag, 'root');
    assert.equal(restoredParent.layer, 2);
    assert.equal(restoredParent.x, 10, 'the facade works on the restored object');
    assert.equal(restoredParent.rotation, 1.5);
    assert.equal(restoredParent.getComponent('Transform').scaleX, 2);
    assert.equal(restoredParent.getComponent('Transform').scaleY, 3);
    assert.equal(restoredParent.getComponent('Rotator').speed, 5);
    assert.equal(restoredChild.active, false);
    assert.equal(restoredChild.owner, 'player-1');
    assert.deepEqual(restoredParent.children, [restoredChild]);
    assert.equal(restoredChild.parent, restoredParent);
});

test('a round trip is byte-identical', () => {
    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addComponent(new Transform(1, 2));
    parent.addChild(child);

    const first = serializeScene(scene);
    const second = serializeScene(deserializeScene(first, { registry: registry() }));

    assert.equal(JSON.stringify(second), JSON.stringify(first));
});

test('restored objects are reactive and observable', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());

    const restored = deserializeScene(serializeScene(scene), { registry: registry() });
    const restoredObject = restored.get(object.id);
    const seen = [];
    restoredObject.observe('x', change => seen.push(change.value));

    restoredObject.x = 42;

    assert.deepEqual(seen, [42]);
    assert.equal(restoredObject.getComponent('Transform').x, 42);
});

test('restored objects submit to the restored scene pipeline', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));

    const restored = deserializeScene(serializeScene(scene), { registry: registry() });
    const operations = [];
    restored.operations.on('operation', operation => operations.push(operation));

    restored.get(object.id).setProperty('name', 'Hero');

    assert.equal(operations.length, 1);
});

test('an unknown component type fails loudly', () => {
    const scene = new Scene('Main');
    scene.add(new Object('Player')).addComponent(new Rotator());

    // Legacy resolved components by name in a module namespace and failed silently.
    assert.throws(
        () => deserializeScene(serializeScene(scene), { registry: new ComponentRegistry() }),
        /unknown component type "Rotator"/
    );
});

test('an unsupported format version is refused', () => {
    assert.throws(() => deserializeScene({ version: 99, objects: [] }), /unsupported format version/);
    assert.throws(() => deserializeScene({}), /unsupported format version/);
});

test('the scene records the format version', () => {
    assert.equal(serializeScene(new Scene('Main')).version, FORMAT_VERSION);
});

test('a dangling child reference fails loudly', () => {
    const data = {
        version: FORMAT_VERSION,
        id: 'scene-1',
        name: 'Main',
        objects: [{
            id: 'a', name: 'A', tag: '', layer: 0, active: true, visible: true, lock: false,
            owner: null, parent: null, children: ['missing'], components: {}
        }]
    };

    assert.throws(() => deserializeScene(data, { registry: registry() }), /unknown child missing/);
});

test('an empty scene round trips', () => {
    const restored = deserializeScene(serializeScene(new Scene('Empty')), { registry: registry() });
    assert.equal(restored.size, 0);
    assert.equal(restored.name, 'Empty');
});
