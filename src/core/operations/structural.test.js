// Structural Operations, and their inverses (ADR-0019, ADR-0024).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    Object,
    Origin,
    Scene,
    Transform,
    addComponentOperation,
    addObjectOperation,
    invert,
    invertible,
    moveComponentOperation,
    removeComponentOperation,
    removeObjectOperation,
    reparentOperation,
    serializeObject,
    serializeScene,
    setPropertyOperation
} from '../mod.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
    update() {}
}

function registry() {
    const known = new ComponentRegistry();
    known.register(Transform);
    known.register(Rotator);
    return known;
}

function scene() {
    return new Scene('Main', { registry: registry() });
}

// --- application ---------------------------------------------------------------------

test('ADD_OBJECT rebuilds an object, identifier included', () => {
    const source = new Object('Player');
    source.addComponent(new Transform(10, 20));

    const target = scene();
    const result = target.operations.submit(addObjectOperation({
        object: serializeObject(source),
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, true);
    // Minted by the author and carried in the payload: a receiver that generated its own
    // would make two machines disagree about which object is which.
    assert.equal(target.get(source.id).id, source.id);
    assert.equal(target.get(source.id).x, 10);
});

test('ADD_OBJECT restores a whole subtree at its rank', () => {
    const from = scene();
    const first = from.add(new Object('First'));
    const parent = from.add(new Object('Parent'));
    const child = from.add(new Object('Child'));
    const grandchild = from.add(new Object('Grandchild'));
    parent.addChild(child);
    child.addChild(grandchild);
    from.reparent(parent, null, 0);

    const payload = {
        object: serializeObject(parent),
        subtree: [serializeObject(child), serializeObject(grandchild)],
        parent: null,
        index: 0
    };

    const to = scene();
    to.add(new Object('First', { id: first.id }));
    to.operations.submit(addObjectOperation({ ...payload, origin: Origin.EDITOR }));

    assert.deepEqual(to.roots().map(object => object.name), ['Parent', 'First'],
        'and at the rank it held, not at the end of the list');
    assert.deepEqual(to.get(parent.id).children.map(object => object.name), ['Child']);
    assert.deepEqual(to.get(child.id).children.map(object => object.name), ['Grandchild']);
});

test('ADD_OBJECT on an identifier the scene already holds is refused', () => {
    const target = scene();
    const object = target.add(new Object('Player'));

    const result = target.operations.submit(addObjectOperation({
        object: serializeObject(object),
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, false);
});

test('REMOVE_OBJECT takes the subtree with it', () => {
    const target = scene();
    const parent = target.add(new Object('Parent'));
    const child = target.add(new Object('Child'));
    parent.addChild(child);

    target.operations.submit(removeObjectOperation({
        object: serializeObject(parent),
        subtree: [serializeObject(child)],
        origin: Origin.EDITOR
    }));

    assert.equal(target.size, 0);
});

test('ADD_COMPONENT and REMOVE_COMPONENT carry rank and values', () => {
    const target = scene();
    const object = target.add(new Object('Player'));
    object.addComponent(new Transform());

    target.operations.submit(addComponentOperation({
        object: object.id,
        component: 'Rotator',
        index: 0,
        values: { speed: 42 },
        origin: Origin.EDITOR
    }));

    assert.deepEqual(object.componentTypes(), ['Rotator', 'Transform']);
    assert.equal(object.getComponent('Rotator').speed, 42);

    target.operations.submit(removeComponentOperation({
        object: object.id,
        component: 'Rotator',
        index: 0,
        values: { speed: 42 },
        origin: Origin.EDITOR
    }));

    assert.deepEqual(object.componentTypes(), ['Transform']);
});

test('ADD_COMPONENT of a type already attached is refused', () => {
    const target = scene();
    const object = target.add(new Object('Player'));
    object.addComponent(new Transform());

    const result = target.operations.submit(addComponentOperation({
        object: object.id,
        component: 'Transform',
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, false);
});

test('MOVE_COMPONENT is a splice, not a detach', () => {
    const target = scene();
    const object = target.add(new Object('Player'));
    object.addComponent(new Transform(3, 4));
    object.addComponent(new Rotator(7));

    target.operations.submit(moveComponentOperation({
        object: object.id,
        component: 'Rotator',
        index: 0,
        previousIndex: 1,
        origin: Origin.EDITOR
    }));

    assert.deepEqual(object.componentTypes(), ['Rotator', 'Transform']);
    assert.equal(object.getComponent('Rotator').speed, 7);
    assert.equal(object.x, 3);
});

test('a REPARENT that changes nothing applies nothing and announces nothing', () => {
    const target = scene();
    const parent = target.add(new Object('Parent'));
    const child = target.add(new Object('Child'));
    parent.addChild(child);

    const announced = [];
    target.operations.on('operation', operation => announced.push(operation));

    const result = target.operations.submit(reparentOperation({
        object: child.id,
        parent: parent.id,
        index: 0,
        previousParent: parent.id,
        previousIndex: 0,
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, false);
    assert.deepEqual(announced, [], 'a server must not broadcast a mutation it did not make');
});

test('a REPARENT that would close a cycle is refused, not thrown', () => {
    const target = scene();
    const parent = target.add(new Object('Parent'));
    const child = target.add(new Object('Child'));
    parent.addChild(child);

    const result = target.operations.submit(reparentOperation({
        object: parent.id,
        parent: child.id,
        previousParent: null,
        previousIndex: 0,
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, false);
    assert.equal(parent.parent, null);
});

test('applying a structural operation submits nothing back', () => {
    // The anti-echo property, extended to the structural operations: every handler writes
    // through internal primitives, which produce no Operation of their own. The loop is
    // unrepresentable rather than guarded (ADR-0019).
    const target = scene();
    const source = new Object('Player');
    source.addComponent(new Transform());

    const announced = [];
    target.operations.on('operation', operation => announced.push(operation));

    target.operations.apply(addObjectOperation({
        object: serializeObject(source),
        origin: Origin.NETWORK
    }));
    target.operations.apply(addComponentOperation({
        object: source.id,
        component: 'Rotator',
        origin: Origin.NETWORK
    }));
    target.operations.apply(reparentOperation({
        object: source.id,
        parent: null,
        index: 0,
        origin: Origin.NETWORK
    }));

    assert.equal(target.get(source.id).hasComponent('Rotator'), true, 'it all applied');
    assert.deepEqual(announced, [], 'and nothing was re-emitted');
});

// --- inversion -----------------------------------------------------------------------

test('every structural type is invertible', () => {
    for (const type of [
        'SET_PROPERTY', 'ADD_OBJECT', 'REMOVE_OBJECT', 'ADD_COMPONENT',
        'REMOVE_COMPONENT', 'MOVE_COMPONENT', 'REPARENT', 'ADD_RESOURCE', 'REMOVE_RESOURCE'
    ]) {
        assert.equal(invertible(type), true, type);
    }
    assert.equal(invertible('SOMETHING_ELSE'), false);
    assert.throws(() => invert({ type: 'SOMETHING_ELSE' }), /no inversion rule/);
    assert.throws(() => invert(null), TypeError);
});

test('inverting twice gives back the original', () => {
    const operations = [
        setPropertyOperation({
            target: { object: 'a', component: null },
            prop: 'x', value: 2, previous: 1, origin: Origin.EDITOR
        }),
        reparentOperation({
            object: 'a', parent: 'b', index: 1,
            previousParent: null, previousIndex: 3, origin: Origin.EDITOR
        }),
        moveComponentOperation({
            object: 'a', component: 'Rotator', index: 0, previousIndex: 2, origin: Origin.EDITOR
        }),
        addComponentOperation({
            object: 'a', component: 'Rotator', index: 1, values: { speed: 5 }, origin: Origin.EDITOR
        })
    ];

    for (const operation of operations) {
        assert.deepEqual(invert(invert(operation)), operation, operation.type);
    }
});

test('an inverse is a new intent, so it carries no sequence number of its own', () => {
    const target = scene();
    const object = target.add(new Object('Player'));
    const applied = object.setProperty('name', 'Hero').operation;

    assert.equal(typeof applied.seq, 'number');
    assert.equal(invert(applied).seq, null, 'the pipeline numbers it when it accepts it');
    assert.equal(invert(applied).actor, applied.actor, 'attribution survives');
    assert.equal(invert(applied).batch, applied.batch, 'and so does the grouping');
});

test('the inverse of a REPARENT is a REPARENT', () => {
    // Two operations that undo one another are the same operation — which is the whole
    // argument for having merged unparent and reorder into REPARENT (ADR-0019).
    const operation = reparentOperation({
        object: 'a', parent: 'b', index: 1,
        previousParent: 'c', previousIndex: 0, origin: Origin.EDITOR
    });
    const inverse = invert(operation);

    assert.equal(inverse.type, 'REPARENT');
    assert.equal(inverse.parent, 'c');
    assert.equal(inverse.index, 0);
    assert.equal(inverse.previousParent, 'b');
    assert.equal(inverse.previousIndex, 1);
});

test('applying an inverse puts the model back exactly as it was', () => {
    const target = scene();
    const first = target.add(new Object('First'));
    const parent = target.add(new Object('Parent'));
    const child = target.add(new Object('Child'));
    parent.addChild(child);
    child.addComponent(new Transform(5, 6));

    const before = JSON.stringify(serializeScene(target));

    const operation = reparentOperation({
        object: child.id,
        parent: null,
        index: 0,
        previousParent: parent.id,
        previousIndex: 0,
        origin: Origin.EDITOR
    });

    assert.equal(target.operations.submit(operation).applied, true);
    assert.deepEqual(target.roots().map(object => object.name), ['Child', 'First', 'Parent']);

    assert.equal(target.operations.submit(invert(operation)).applied, true);
    assert.equal(JSON.stringify(serializeScene(target)), before);
});
