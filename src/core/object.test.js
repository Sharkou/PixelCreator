import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object } from './object.js';
import { Transform } from './components/transform.js';
import { Scene } from './scene.js';
import { Origin } from './properties/origin.js';
import { observe } from './properties/reactive.js';
import { PredicateAuthority, deny } from './operations/authority.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
    update() {}
}

class Health {
    static type = 'Health';
    static exposes = ['hitPoints'];
    constructor(hitPoints = 100) { this.hitPoints = hitPoints; }
}

class Spinner {
    static type = 'Spinner';
    static exposes = ['hitPoints'];
    constructor() { this.hitPoints = 0; }
}

test('an object gets an identity and a name', () => {
    const object = new Object('Player');
    assert.equal(object.name, 'Player');
    assert.equal(typeof object.id, 'string');
    assert.ok(object.id.length > 0);
});

test('the identity is read-only', () => {
    const object = new Object('Player');
    assert.throws(() => { object.id = 'forged'; }, TypeError);
});

test('an object is an instance of Object despite the proxy', () => {
    assert.ok(new Object('Player') instanceof Object);
});

test('object properties are observable', () => {
    const object = new Object('Player');
    const seen = [];
    object.observe('name', change => seen.push(change.value));

    object.name = 'Hero';

    assert.deepEqual(seen, ['Hero']);
});

test('Legacy oddities are gone', () => {
    const object = new Object('Player');
    assert.equal(object.childs, undefined, 'children is spelled correctly');
    assert.equal(object.uid, undefined, 'uid became owner');
    assert.equal(object.static, undefined, 'static was declared but never read');
    assert.deepEqual(object.children, []);
    assert.equal(object.owner, null);
});

test('a component is attached and read back', () => {
    const object = new Object('Player');
    const rotator = object.addComponent(new Rotator(5));

    assert.equal(object.getComponent('Rotator'), rotator);
    assert.equal(object.getComponent(Rotator), rotator);
    assert.equal(object.hasComponent('Rotator'), true);
    assert.equal(rotator.speed, 5);
});

test('an object holds at most one component of a type', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator(2));

    // Legacy replaced silently, discarding the previous component's state.
    assert.throws(() => object.addComponent(new Rotator(9)), /already attached/);
    assert.equal(object.getComponent('Rotator').speed, 2);
});

test('a component can be detached and re-attached', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator(2));

    assert.equal(object.removeComponent('Rotator'), true);
    assert.equal(object.hasComponent('Rotator'), false);
    assert.equal(object.removeComponent('Rotator'), false);

    assert.doesNotThrow(() => object.addComponent(new Rotator(3)));
});

test('component properties are observable', () => {
    const object = new Object('Player');
    const rotator = object.addComponent(new Rotator(2));
    const changes = [];
    observe(rotator, 'speed', change => changes.push(change));

    rotator.speed = 8;

    assert.equal(changes.length, 1);
    assert.equal(changes[0].value, 8);
    assert.equal(changes[0].component, rotator, 'the Change names the component');
    assert.equal(changes[0].object, object, 'and the object owning it');
});

test('onAttach and onDetach are called', () => {
    const calls = [];
    class Listener {
        static type = 'Listener';
        onAttach(self) { calls.push(['attach', self.id]); }
        onDetach(self) { calls.push(['detach', self.id]); }
    }

    const object = new Object('Player');
    object.addComponent(new Listener());
    object.removeComponent('Listener');

    assert.deepEqual(calls, [['attach', object.id], ['detach', object.id]]);
});

test('a component without lifecycle hooks is fine', () => {
    class Bare { static type = 'Bare'; }
    const object = new Object('Player');
    assert.doesNotThrow(() => object.addComponent(new Bare()));
});

// --- facade -------------------------------------------------------------------

test('object.x reads through to Transform', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10, 20));

    assert.equal(object.x, 10);
    assert.equal(object.y, 20);
    assert.equal(object.getComponent('Transform').x, 10);
});

test('object.x and Transform.x are one value, not two', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());

    object.x = 100;
    assert.equal(transform.x, 100, 'writing the facade writes the component');

    transform.x = 250;
    assert.equal(object.x, 250, 'writing the component is visible through the facade');

    assert.equal(object.components.Transform.x, 250);
});

test('the facade stores nothing of its own', () => {
    const object = new Object('Player');
    object.addComponent(new Transform());
    object.x = 100;

    assert.ok(!globalThis.Object.keys(object).includes('x'),
        'x must not become an own property of the object');
    assert.equal(object.getComponent('Transform').x, 100);
});

test('a facade property is observable from the object', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());
    const seen = [];
    object.observe('x', change => seen.push(change.value));

    transform.x = 42;

    assert.deepEqual(seen, [42], 'a view watching object.x need not know Transform provides it');
});

test('a facade property observed before the component is attached still works', () => {
    const object = new Object('Player');
    const seen = [];
    object.observe('x', change => seen.push(change.value));

    const transform = object.addComponent(new Transform());
    transform.x = 7;

    assert.deepEqual(seen, [7]);
});

test('detaching a component removes its facade', () => {
    const object = new Object('Player');
    object.addComponent(new Transform(10));
    object.removeComponent('Transform');

    assert.equal(object.x, undefined);
});

test('two components exposing the same property are refused', () => {
    const object = new Object('Player');
    object.addComponent(new Health());

    assert.throws(() => object.addComponent(new Spinner()), /both expose "hitPoints"/);
});

test('a component cannot shadow an existing object property', () => {
    class Named {
        static type = 'Named';
        static exposes = ['name'];
        constructor() { this.name = 'from component'; }
    }

    const object = new Object('Player');
    assert.throws(() => object.addComponent(new Named()), /two sources of truth/);
    assert.equal(object.name, 'Player');
});

// --- direct write versus setProperty -------------------------------------------

test('a direct write emits a Change and produces no Operation', () => {
    const object = new Object('Player');
    const changes = [];
    const operations = [];
    object.observe('name', change => changes.push(change));
    object.operations.on('operation', operation => operations.push(operation));

    object.name = 'Hero';

    assert.equal(object.name, 'Hero');
    assert.equal(changes.length, 1, 'views react');
    assert.equal(operations.length, 0, 'a simulation output does not replicate');
});

test('setProperty emits a Change and produces an Operation', () => {
    const object = new Object('Player');
    const changes = [];
    const operations = [];
    object.observe('name', change => changes.push(change));
    object.operations.on('operation', operation => operations.push(operation));

    const result = object.setProperty('name', 'Hero');

    assert.equal(result.applied, true);
    assert.equal(object.name, 'Hero');
    assert.equal(changes.length, 1);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].prop, 'name');
    assert.equal(operations[0].previous, 'Player');
});

test('setProperty targets the component providing a facade property', () => {
    const object = new Object('Player');
    const transform = object.addComponent(new Transform());
    const operations = [];
    object.operations.on('operation', operation => operations.push(operation));

    object.setProperty('x', 100);

    assert.equal(transform.x, 100);
    assert.equal(operations[0].target.component, 'Transform');
    assert.equal(operations[0].target.object, object.id);
});

test('setProperty on an unchanged value produces no Operation', () => {
    const object = new Object('Player');
    const operations = [];
    object.operations.on('operation', operation => operations.push(operation));

    const result = object.setProperty('name', 'Player');

    assert.equal(result.applied, false);
    assert.equal(operations.length, 0);
});

test('setProperty defaults to the editor origin', () => {
    const object = new Object('Player');
    let change = null;
    object.observe('name', received => { change = received; });

    object.setProperty('name', 'Hero');

    assert.equal(change.origin, Origin.EDITOR);
});

test('a component exposes setProperty once attached', () => {
    const object = new Object('Player');
    const rotator = object.addComponent(new Rotator(2));
    const operations = [];
    object.operations.on('operation', operation => operations.push(operation));

    rotator.setProperty('speed', 9);

    assert.equal(rotator.speed, 9);
    assert.equal(operations.length, 1);
    assert.equal(operations[0].target.component, 'Rotator');
});

test('setProperty on a component is not enumerable', () => {
    const object = new Object('Player');
    const rotator = object.addComponent(new Rotator(2));

    assert.deepEqual(globalThis.Object.keys(rotator), ['speed']);
});

test('setProperty goes through authority', () => {
    const scene = new Scene('Main', {
        authority: new PredicateAuthority(() => deny('locked'))
    });
    const object = scene.add(new Object('Player'));

    const result = object.setProperty('name', 'Hero');

    assert.equal(result.applied, false);
    assert.equal(result.decision.reason, 'locked');
    assert.equal(object.name, 'Player', 'a refused intent leaves the model untouched');
});

test('a direct write bypasses authority, as a simulation output must', () => {
    const scene = new Scene('Main', {
        authority: new PredicateAuthority(() => deny('locked'))
    });
    const object = scene.add(new Object('Player'));

    object.name = 'Hero';

    assert.equal(object.name, 'Hero');
});

// --- hierarchy ------------------------------------------------------------------

test('a child is attached both ways', () => {
    const parent = new Object('Parent');
    const child = new Object('Child');

    parent.addChild(child);

    assert.deepEqual(parent.children, [child]);
    assert.equal(child.parent, parent);
});

test('a child is detached both ways', () => {
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addChild(child);

    assert.equal(parent.removeChild(child), true);
    assert.deepEqual(parent.children, []);
    assert.equal(child.parent, null);
    assert.equal(parent.removeChild(child), false);
});

test('re-parenting detaches from the previous parent', () => {
    const first = new Object('First');
    const second = new Object('Second');
    const child = new Object('Child');

    first.addChild(child);
    second.addChild(child);

    assert.deepEqual(first.children, []);
    assert.deepEqual(second.children, [child]);
    assert.equal(child.parent, second);
});

test('children keep insertion order', () => {
    const parent = new Object('Parent');
    const a = new Object('A');
    const b = new Object('B');
    const c = new Object('C');

    parent.addChild(a);
    parent.addChild(b);
    parent.addChild(c);

    assert.deepEqual(parent.children.map(child => child.name), ['A', 'B', 'C']);
});

test('children is a snapshot, so mutating it cannot corrupt the object', () => {
    const parent = new Object('Parent');
    parent.addChild(new Object('Child'));

    parent.children.push(new Object('Intruder'));

    assert.equal(parent.children.length, 1);
});

test('an object cannot be its own child', () => {
    const object = new Object('Player');
    assert.throws(() => object.addChild(object), /cannot be its own child/);
});

test('a cycle is refused', () => {
    const grandparent = new Object('Grandparent');
    const parent = new Object('Parent');
    const child = new Object('Child');
    grandparent.addChild(parent);
    parent.addChild(child);

    assert.throws(() => child.addChild(grandparent), /would create a cycle/);
});

test('components is a frozen snapshot', () => {
    const object = new Object('Player');
    object.addComponent(new Rotator());

    const snapshot = object.components;
    assert.throws(() => { snapshot.Rotator = null; }, TypeError);
    assert.ok(object.getComponent('Rotator'));
});

