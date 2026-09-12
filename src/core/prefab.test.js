// A prefab: the format, the identities, and the references that may and may not travel.
//
// The counter-proofs are the point. A prefab that instantiated with the MODEL's identities
// would work perfectly until the second instance; one that kept a reference to an Object of
// the scene it was authored in would work perfectly until the second scene.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry } from './component.js';
import { defineComponent } from './definition.js';
import { Object as SceneObject } from './object.js';
import { Scene, hierarchyOrder } from './scene.js';
import { Transform } from './components/transform.js';
import { duplicateObject } from './duplicate.js';
import {
    PREFAB_FORMAT,
    createPrefab,
    externalReferencesOf,
    instantiatePrefab,
    recordsOf
} from './prefab.js';
import { ResourceRegistry } from './resources.js';

/** A `.px` with one reference socket and one ordinary value, like a creator's own. */
const Linked = defineComponent({
    type: 'res_link',
    label: 'Linked',
    properties: {
        target: { id: 'p_target', name: 'target', type: 'objectref', default: null },
        allies: { id: 'p_allies', name: 'allies', type: 'array', element: { type: 'objectref' }, default: [] },
        speed: { id: 'p_speed', name: 'speed', type: 'number', default: 4 }
    }
});

function world() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Linked);

    return new Scene('Level', { id: 'scene_a', registry });
}

/** A turret with a barrel under it; the barrel names its own base. */
function turretIn(scene, { name = 'Turret' } = {}) {
    const base = scene.add(new SceneObject(name, { tag: 'enemy', layer: 3 }));
    base.addComponent(new Transform(40, 20));

    const barrel = scene.add(new SceneObject(`${name} Barrel`));
    barrel.addComponent(new Transform(0, -12));
    barrel.addComponent(new Linked());
    barrel.getComponent('res_link').target = base.id;
    barrel.getComponent('res_link').speed = 9;
    base.addChild(barrel);

    return { base, barrel };
}

// --- the format -------------------------------------------------------------------------

test('a prefab is a serialized subtree, and not a third shape of Object', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);

    const { definition } = createPrefab(base, { scene });

    assert.equal(definition.version, PREFAB_FORMAT);
    assert.equal(definition.root, base.id);
    assert.equal(definition.objects.length, 2);
    // The very fields `serializeObject()` writes — nothing added, nothing renamed.
    assert.deepEqual(
        globalThis.Object.keys(definition.objects[0]).sort(),
        ['active', 'children', 'components', 'id', 'layer', 'lock', 'name', 'owner', 'parent', 'tag']
    );
    assert.deepEqual(definition.objects.map(record => record.id), [base.id, barrel.id]);
});

test('it keeps components, values, children, order, the local Transform and the tag', () => {
    const scene = world();
    const { base } = turretIn(scene);

    const { definition } = createPrefab(base, { scene });
    const [root, child] = definition.objects;

    assert.equal(root.tag, 'enemy');
    assert.equal(root.layer, 3);
    assert.deepEqual(root.children, [child.id]);
    assert.deepEqual(root.components.map(entry => entry.type), ['Transform']);
    assert.deepEqual(child.components.map(entry => entry.type), ['Transform', 'res_link']);
    assert.equal(child.components[0].values.x, 0);
    assert.equal(child.components[0].values.y, -12);
    assert.equal(child.components[1].values.speed, 9, 'a custom property travels');
});

test('the root of a prefab has no parent, because a prefab has no scene', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);
    const holder = scene.add(new SceneObject('Enemies'));
    holder.addChild(base);

    const { definition } = createPrefab(base, { scene });

    assert.equal(definition.objects[0].parent, null, 'it would name an Object not in the payload');
    assert.equal(definition.objects[1].parent, barrel.parent.id, 'an internal link is untouched');
});

test('a payload from a version this build does not know is refused, not guessed at', () => {
    assert.equal(recordsOf({ version: 99, root: 'a', objects: [{ id: 'a' }] }), null);
    assert.equal(recordsOf(null), null);
    assert.equal(recordsOf({ version: PREFAB_FORMAT, root: 'a', objects: [] }), null);
    assert.equal(recordsOf({ version: PREFAB_FORMAT, root: 'missing', objects: [{ id: 'a' }] }), null);
});

test('the root is named rather than assumed to be first', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });

    const shuffled = { ...definition, objects: [...definition.objects].reverse() };
    assert.equal(recordsOf(shuffled)[0].id, definition.root);
});

// --- references ---------------------------------------------------------------------------

test('a reference INSIDE the subtree travels with it', () => {
    const scene = world();
    const { base } = turretIn(scene);

    const { definition, cleared } = createPrefab(base, { scene });
    const link = definition.objects[1].components.find(entry => entry.type === 'res_link');

    assert.equal(link.values.target, base.id, 'kept as it was; it is rewritten at instantiation');
    assert.deepEqual(cleared, []);
});

test('a reference OUTSIDE the subtree is emptied, and the caller is told which', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);
    const player = scene.add(new SceneObject('Player'));
    barrel.getComponent('res_link').target = player.id;

    const { definition, cleared } = createPrefab(base, { scene });
    const link = definition.objects[1].components.find(entry => entry.type === 'res_link');

    assert.equal(link.values.target, null, 'a scene identity cannot live in a project resource');
    assert.equal(cleared.length, 1);
    assert.equal(cleared[0].component, 'res_link');
    assert.equal(cleared[0].object, 'Turret Barrel');
});

test('a list keeps what points inside and drops what points out', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);
    const player = scene.add(new SceneObject('Player'));
    barrel.getComponent('res_link').allies = [base.id, player.id, barrel.id];

    const { definition, cleared } = createPrefab(base, { scene });
    const link = definition.objects[1].components.find(entry => entry.type === 'res_link');

    assert.deepEqual(link.values.allies, [base.id, barrel.id]);
    assert.equal(cleared.length, 1);
});

test('the same question can be asked without producing a payload', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);
    barrel.getComponent('res_link').target = scene.add(new SceneObject('Player')).id;

    assert.equal(externalReferencesOf(base, { scene }).length, 1);
    assert.deepEqual(externalReferencesOf(null), []);
});

test('a Component type nothing can resolve keeps its values byte for byte', () => {
    const scene = world();
    const object = scene.add(new SceneObject('Mystery'));
    object.addComponent(new Transform());
    // Attached through the format, because the registry cannot build a type it has never
    // heard of — which is exactly the state a `.px` deleted from the project leaves behind.
    const { definition } = createPrefab(object, { scene });
    definition.objects[0].components.push({ type: 'res_gone', values: { target: 'obj_elsewhere' } });

    const reloaded = recordsOf(definition);
    assert.equal(reloaded[0].components[1].values.target, 'obj_elsewhere');
});

// --- instantiation ---------------------------------------------------------------------------

test('an instance carries none of the model identities', () => {
    const scene = world();
    const { base, barrel } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });

    // The model leaves the scene entirely: this is the whole point of a prefab.
    scene.remove(base);

    const instance = instantiatePrefab(scene, definition);

    assert.ok(instance);
    assert.notEqual(instance.id, base.id);
    assert.equal(scene.has(base.id), false, 'no identity of the model is in the scene');
    assert.equal(scene.has(barrel.id), false);
    assert.equal(instance.children.length, 1);
});

test('two instances share no identity with each other', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });
    scene.remove(base);

    const first = instantiatePrefab(scene, definition);
    const second = instantiatePrefab(scene, definition);

    const ids = hierarchyOrder(scene).map(object => object.id);
    assert.equal(new globalThis.Set(ids).size, ids.length, 'every identity in the scene is unique');
    assert.notEqual(first.id, second.id);
    assert.notEqual(first.children[0].id, second.children[0].id);
});

test('an internal reference is remapped per instance, so two turrets are not wired together', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });
    scene.remove(base);

    const first = instantiatePrefab(scene, definition);
    const second = instantiatePrefab(scene, definition);

    assert.equal(first.children[0].getComponent('res_link').target, first.id);
    assert.equal(second.children[0].getComponent('res_link').target, second.id);
    assert.notEqual(first.children[0].getComponent('res_link').target,
        second.children[0].getComponent('res_link').target);
});

test('an instance is an ordinary Object: editing the prefab afterwards leaves it alone', () => {
    // ADR-0061 §9, stated as a test because it is the thing most likely to be assumed away.
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });
    scene.remove(base);

    const instance = instantiatePrefab(scene, definition);
    definition.objects[0].name = 'Renamed In The Model';
    definition.objects[0].components[0].values.x = 999;

    assert.equal(instance.name, 'Turret');
    assert.equal(instance.getComponent('Transform').x, 40);
});

test('the instance lands where the caller says, and at the root by default', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });
    scene.remove(base);

    const holder = scene.add(new SceneObject('Enemies'));
    const loose = instantiatePrefab(scene, definition);
    const held = instantiatePrefab(scene, definition, { parent: holder.id });

    assert.equal(loose.parent, null);
    assert.equal(held.parent.id, holder.id);
});

test('the identities come from whoever asked, so a simulation can agree with itself', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });
    scene.remove(base);

    let next = 0;
    const counted = () => `obj_fixed_${++next}`;
    const instance = instantiatePrefab(scene, definition, { createId: counted });

    assert.equal(instance.id, 'obj_fixed_1');
    assert.equal(instance.children[0].id, 'obj_fixed_2');
});

test('nothing to instantiate answers nothing, and is not a fault', () => {
    const scene = world();

    assert.equal(instantiatePrefab(scene, null), null);
    assert.equal(instantiatePrefab(scene, { version: 99 }), null);
    assert.equal(instantiatePrefab(null, { version: PREFAB_FORMAT, root: 'a', objects: [{ id: 'a' }] }), null);
});

test('a prefab and a duplication are the same machinery, reached from two descriptions', () => {
    const scene = world();
    const { base } = turretIn(scene);
    const { definition } = createPrefab(base, { scene });

    const copied = duplicateObject(scene, base);
    const built = instantiatePrefab(scene, definition);

    // The one difference: a duplication lands beside its model, an instance at the root.
    assert.equal(copied.parent, base.parent);
    assert.equal(built.parent, null);

    // Everything else agrees, including the internal reference following the copy.
    assert.equal(copied.children[0].getComponent('res_link').target, copied.id);
    assert.equal(built.children[0].getComponent('res_link').target, built.id);
    assert.equal(copied.getComponent('Transform').x, built.getComponent('Transform').x);
});

// --- the registry -----------------------------------------------------------------------------

test('the registry answers now, which is the whole of why prefabs are possible (ADR-0062 §1)', () => {
    const prefabs = new ResourceRegistry();
    const definition = { version: PREFAB_FORMAT, root: 'a', objects: [{ id: 'a' }] };

    assert.equal(prefabs.get('res_1'), null);
    assert.equal(prefabs.has('res_1'), false);

    prefabs.set('res_1', definition);

    assert.equal(prefabs.get('res_1'), definition);
    assert.equal(prefabs.has('res_1'), true);
    assert.deepEqual(prefabs.ids(), ['res_1']);
    assert.equal(prefabs.size, 1);

    assert.equal(prefabs.delete('res_1'), true);
    assert.equal(prefabs.size, 0);
});
