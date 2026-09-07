// Copying an Object into the Scene that holds it — the primitive `Spawn` is made of.
//
// WHAT THESE TESTS ARE REALLY PROTECTING is that a copy is a NEW Object and not the same
// one listed twice: fresh identities all the way down the subtree, links rewritten through
// the same table, and values carried over untouched. Every one of those was a way Legacy's
// `copy()` failed, and each fails silently — a scene that looks right and has two objects
// sharing an id is a scene that breaks on its next save.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object as SceneObject,
    PropertyType,
    Scene,
    Transform,
    defineComponent,
    deserializeScene,
    duplicateObject,
    hierarchyOrder,
    serializeScene
} from './mod.js';

/** A scene with a `Model` carrying a Transform, and a `Barrel` under it. */
function staged() {
    const registry = new ComponentRegistry();
    registry.register(Transform);

    const scene = new Scene('Level', { registry });
    const model = scene.add(new SceneObject('Model', { tag: 'model' }));
    model.addComponent(new Transform(5, 7));

    const barrel = scene.add(new SceneObject('Barrel'));
    barrel.addComponent(new Transform(1, 2));
    model.addChild(barrel);

    return { scene, model, barrel };
}

test('a copy is a new Object, and everything under it is new too', () => {
    const { scene, model, barrel } = staged();

    const copy = duplicateObject(scene, model);

    assert.ok(copy, 'a model that is in the scene is copyable');
    assert.notEqual(copy.id, model.id, 'a copy is not the same Object listed twice');
    assert.equal(copy.name, 'Model');
    assert.equal(copy.tag, 'model');
    assert.equal(scene.size, 4, 'two objects became four');

    assert.equal(copy.children.length, 1, 'the subtree came with it');
    assert.notEqual(copy.children[0].id, barrel.id, 'and its identity is new as well');
    assert.equal(copy.children[0].name, 'Barrel');
});

test('a copy carries the values its model held, component by component', () => {
    const { scene, model } = staged();

    const copy = duplicateObject(scene, model);

    assert.equal(copy.getComponent('Transform').x, 5);
    assert.equal(copy.getComponent('Transform').y, 7);
    assert.equal(copy.children[0].getComponent('Transform').x, 1);

    copy.getComponent('Transform').x = 99;
    assert.equal(model.getComponent('Transform').x, 5, 'and the two do not share their state');
});

test('a copy lands beside its model, last among its siblings', () => {
    // BESIDE, BECAUSE `Transform` IS A POSITION IN THE PARENT'S SPACE (ADR-0002). A copy
    // that joined the roots would keep its numbers and change where they mean.
    const { scene, model } = staged();
    const holder = scene.add(new SceneObject('Spawner'));
    scene.reparent(model, holder);

    const copy = duplicateObject(scene, model);

    assert.equal(copy.parent?.id, holder.id);
    assert.deepEqual(holder.children.map(child => child.name), ['Model', 'Model'],
        'appended, which is the one rank that is a function of the state');
});

test('two copies of one model are two distinct Objects', () => {
    const { scene, model } = staged();

    const first = duplicateObject(scene, model);
    const second = duplicateObject(scene, model);

    assert.notEqual(first.id, second.id);
    assert.notEqual(first.children[0].id, second.children[0].id);
    assert.equal(new Set(hierarchyOrder(scene).map(object => object.id)).size, 6,
        'six objects, six identities');
});

test('a copy is reachable from the roots, like everything else in a scene', () => {
    // ADR-0034 invariant 7, asked of the path this file opens. An object the canonical walk
    // cannot reach is one `serializeScene()` does not write and `Runtime.step()` never runs.
    const { scene, model } = staged();

    const copy = duplicateObject(scene, model);
    const reached = hierarchyOrder(scene).map(object => object.id);

    assert.ok(reached.includes(copy.id));
    assert.ok(reached.includes(copy.children[0].id));
});

test('a copy survives serialization, which is what says its links are real', () => {
    const { scene, model } = staged();
    duplicateObject(scene, model);

    const written = serializeScene(scene);
    const ids = written.objects.map(entry => entry.id);

    assert.equal(ids.length, 4);
    assert.equal(new Set(ids).size, 4, 'no id is written twice');
    for (const entry of written.objects) {
        for (const child of entry.children) {
            assert.ok(ids.includes(child), 'every child named is an object of this payload');
        }
    }
});

test('copying produces no Operation', () => {
    // ADR-0034 invariant 5, at the level the node cannot reach around: the primitive itself
    // writes through the Scene's own methods, so a spawn is a simulation output and never
    // an authored intent (ADR-0019).
    const { scene, model } = staged();

    const submitted = [];
    scene.operations.on('operation', operation => submitted.push(operation));

    duplicateObject(scene, model);

    assert.deepEqual(submitted, [], 'nothing went through the pipeline');
});

test('there is nothing to copy from a model the scene does not hold', () => {
    const { scene, model } = staged();

    assert.equal(duplicateObject(scene, null), null, 'nothing at all');
    assert.equal(duplicateObject(scene, { id: 'nope' }), null, 'a stranger');

    scene.remove(model);
    assert.equal(duplicateObject(scene, model), null, 'a handle whose target has gone');
    assert.equal(scene.size, 0, 'and the scene is left exactly as it was');
});

// --- references that follow the copy, and references that do not (ADR-0056 §6) -------------
//
// THE DEFECT THESE CLOSE, IN ONE SENTENCE: duplicating a turret whose barrel names its own
// base gave a barrel naming the FIRST turret's base, so two turrets shared one base and the
// second one was quietly wired to the first. What makes it worth this many tests is that the
// wrong answer looks right — the copy is there, its components are there, and only the
// reference points somewhere nobody can see.

/** A hand-written type declaring the two shapes a declaration can carry an identity in. */
class Link {

    static type = 'Link';

    static schema = {
        target: { type: PropertyType.OBJECTREF, default: null },
        friends: { type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] },
        // DECLARED `string`, AND THAT IS THE WHOLE TEST IT EXISTS FOR. It holds a value that
        // is shaped exactly like an ObjectId, so anything scanning values rather than reading
        // declarations rewrites it.
        note: { type: PropertyType.STRING, default: '' }
    };

    constructor() {
        this.target = null;
        this.friends = [];
        this.note = '';
    }
}

/** The same two shapes, declared by a `.px` instead of by a class. */
const Wire = defineComponent({
    type: 'res_wire',
    label: 'Wire',
    properties: {
        target: { id: 'p_target', type: PropertyType.OBJECTREF, default: null },
        friends: { id: 'p_friends', type: PropertyType.ARRAY, of: PropertyType.OBJECTREF, default: [] }
    }
});

/**
 * `A` with `B` and `C` under it, plus an `Outsider` the subtree does not contain.
 *
 * Every object carries a `Link`, so any of them can point at any other and a test only has
 * to say which.
 *
 * @returns {object} The scene, its four objects, and a reader for a copy of `A`
 */
function wired() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Link);
    registry.register(Wire);

    const scene = new Scene('Level', { registry });
    const make = name => {
        const object = scene.add(new SceneObject(name));
        object.addComponent(new Transform());
        object.addComponent(new Link());
        return object;
    };

    const a = make('A');
    const b = make('B');
    const c = make('C');
    const outsider = make('Outsider');
    a.addChild(b);
    a.addChild(c);

    /** The copy of `A`, and the copies of `B` and `C` under it. */
    const copyOf = root => ({ a: root, b: root.children[0], c: root.children[1] });

    return { scene, a, b, c, outsider, copyOf };
}

test('a reference from a parent to its child follows the copy', () => {
    const { scene, a, b, copyOf } = wired();
    a.getComponent('Link').target = b.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.a.getComponent('Link').target, copy.b.id);
    assert.notEqual(copy.a.getComponent('Link').target, b.id, 'and not at the original child');
});

test('a reference from a child to its parent follows the copy', () => {
    const { scene, a, b, copyOf } = wired();
    b.getComponent('Link').target = a.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, copy.a.id);
});

test('a reference between two siblings follows the copy', () => {
    const { scene, a, b, c, copyOf } = wired();
    b.getComponent('Link').target = c.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, copy.c.id);
    assert.notEqual(copy.b.getComponent('Link').target, c.id);
});

test('a reference to an Object outside the subtree is left exactly as it was', () => {
    // THE OTHER HALF OF THE RULE, AND THE ONE THAT MAKES IT A RULE RATHER THAN A REWRITE.
    // The Outsider was not copied, so there is no copy of it to point at.
    const { scene, a, b, outsider, copyOf } = wired();
    b.getComponent('Link').target = outsider.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, outsider.id);
});

test('a reference that is null, or points at nothing, is left alone', () => {
    const { scene, a, b, c, copyOf } = wired();
    b.getComponent('Link').target = null;
    c.getComponent('Link').target = 'obj_that_never_existed';

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, null, 'nothing is not a reference to anything');
    assert.equal(copy.c.getComponent('Link').target, 'obj_that_never_existed',
        'a dead reference is a state of the scene, not a thing to repair (ADR-0034 §3.4)');
});

test('two Components naming each other both follow the copy', () => {
    // NO PASS CAN REACH A REFERENCE BEFORE ITS TARGET HAS AN IDENTITY, because the table is
    // complete before a single field is rewritten. A cycle is therefore not a special case —
    // it is two lookups.
    const { scene, a, b, c, copyOf } = wired();
    b.getComponent('Link').target = c.id;
    c.getComponent('Link').target = b.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, copy.c.id);
    assert.equal(copy.c.getComponent('Link').target, copy.b.id);
});

test('a list of references is remapped element by element, inside and outside together', () => {
    const { scene, a, b, c, outsider, copyOf } = wired();
    b.getComponent('Link').friends = [c.id, outsider.id, null, 'obj_gone'];

    const copy = copyOf(duplicateObject(scene, a));

    assert.deepEqual(copy.b.getComponent('Link').friends,
        [copy.c.id, outsider.id, null, 'obj_gone']);
    assert.deepEqual(b.getComponent('Link').friends, [c.id, outsider.id, null, 'obj_gone'],
        'and the list the model holds was not written through');
});

test('a value declared `string` is never remapped, however much it looks like an identity', () => {
    // INVARIANT 1: no arbitrary string is treated as a reference. The declaration is the only
    // thing consulted, so this holds by construction rather than by a filter on the value.
    const { scene, a, b, c, copyOf } = wired();
    b.getComponent('Link').note = c.id;
    b.name = c.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').note, c.id, 'a string stays the string it was');
    assert.equal(copy.b.name, c.id, 'and so does a name');
});

test('a `.px` declares references the same way, and they are remapped the same way', () => {
    // ONE READER FOR BOTH KINDS OF TYPE. `declaredProperties()` answers for a class through
    // `static schema` and for a `.px` through its definition, so nothing here is special-cased.
    const { scene, a, b, c, outsider, copyOf } = wired();
    b.addComponent(new Wire());
    b.getComponent('res_wire').target = c.id;
    b.getComponent('res_wire').friends = [a.id, outsider.id];

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('res_wire').target, copy.c.id);
    assert.deepEqual(copy.b.getComponent('res_wire').friends, [copy.a.id, outsider.id]);
});

test('two copies of one model point only inside themselves', () => {
    // INVARIANT 9. The failure this catches is the original one seen twice: a second copy
    // wired to the first is exactly as wrong as a copy wired to the model.
    const { scene, a, b, c, copyOf } = wired();
    b.getComponent('Link').target = c.id;
    c.getComponent('Link').target = a.id;

    const first = copyOf(duplicateObject(scene, a));
    const second = copyOf(duplicateObject(scene, a));

    assert.equal(first.b.getComponent('Link').target, first.c.id);
    assert.equal(first.c.getComponent('Link').target, first.a.id);
    assert.equal(second.b.getComponent('Link').target, second.c.id);
    assert.equal(second.c.getComponent('Link').target, second.a.id);

    const ids = [first, second].flatMap(copy => [copy.a.id, copy.b.id, copy.c.id]);
    assert.equal(new Set(ids).size, 6, 'six objects, six identities');
    assert.equal(second.b.getComponent('Link').target === first.c.id, false,
        'the second copy is not wired to the first');
});

test('the model is left exactly as it was found', () => {
    // INVARIANT 8, asked of the whole subtree rather than of one field: the four objects that
    // were there serialize to the same bytes before and after being copied.
    const { scene, a, b, c, outsider } = wired();
    b.getComponent('Link').target = c.id;
    c.getComponent('Link').friends = [b.id, outsider.id];

    const before = serializeScene(scene);
    duplicateObject(scene, a);
    const after = serializeScene(scene);

    assert.equal(
        JSON.stringify(after.objects.slice(0, before.objects.length)),
        JSON.stringify(before.objects)
    );
});

test('the remapped references survive serialization and a reload', () => {
    // WHAT MAKES IT A REAL FIX RATHER THAN A LIVE-OBJECT PATCH: the identities are rewritten
    // in the PAYLOAD, before anything is built, so what is written out is already right.
    const { scene, a, b, c, outsider } = wired();
    b.getComponent('Link').target = c.id;
    c.getComponent('Link').friends = [b.id, outsider.id];

    const copyRoot = duplicateObject(scene, a);
    const reloaded = deserializeScene(JSON.parse(JSON.stringify(serializeScene(scene))), {
        registry: scene.registry
    });

    const copy = reloaded.get(copyRoot.id);
    assert.ok(copy, 'the copy came back');
    const [copiedB, copiedC] = copy.children;

    assert.equal(copiedB.getComponent('Link').target, copiedC.id);
    assert.deepEqual(copiedC.getComponent('Link').friends, [copiedB.id, outsider.id]);

    // INVARIANT 7, asked of the payload rather than of the model: every value a component
    // carries is a thing a `.scene` can hold, never a live handle.
    for (const entry of serializeScene(reloaded).objects) {
        for (const component of entry.components) {
            for (const value of globalThis.Object.values(component.values)) {
                const shape = globalThis.Array.isArray(value) ? 'array' : typeof value;
                assert.notEqual(shape === 'object' && value !== null, true,
                    `${entry.name}: only persistable values, never a handle`);
            }
        }
    }
});

test('a Component type the registry cannot resolve keeps its values verbatim', () => {
    // THE ONE SHAPE THAT IS NOT REMAPPED, AND IT IS DECLARED RATHER THAN OVERLOOKED. A type
    // that declares nothing has nothing this rule can read, and guessing which of its values
    // are identities would be the heuristic the whole mechanism refuses (ADR-0056 §6).
    class Ghost {
        static type = 'Ghost';
        constructor() { this.target = null; }
    }

    const { scene, a, b, c, copyOf } = wired();
    scene.registry.register(Ghost);
    b.getComponent('Link').target = c.id;
    b.addComponent(new Ghost());
    b.getComponent('Ghost').target = c.id;

    const copy = copyOf(duplicateObject(scene, a));

    assert.equal(copy.b.getComponent('Link').target, copy.c.id, 'the declared one follows');
    assert.equal(copy.b.getComponent('Ghost').target, c.id,
        'and the undeclared one is carried as it was, which is the documented limit');
});
