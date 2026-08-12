import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    ComponentRegistry,
    componentType,
    componentExposes,
    componentSchema
} from './component.js';

class Rotator {
    static type = 'Rotator';
    constructor(speed = 2) { this.speed = speed; }
}

class Unnamed {
    constructor() { this.value = 1; }
}

test('the declared type wins over the constructor name', () => {
    // static type survives minification, which rewrites constructor names.
    assert.equal(componentType(Rotator), 'Rotator');
    assert.equal(componentType(new Rotator()), 'Rotator');
});

test('the constructor name is the fallback', () => {
    assert.equal(componentType(Unnamed), 'Unnamed');
    assert.equal(componentType(new Unnamed()), 'Unnamed');
});

test('a type name passes through', () => {
    assert.equal(componentType('Transform'), 'Transform');
});

test('componentType rejects a value that is not a component', () => {
    assert.throws(() => componentType(null), TypeError);
    assert.throws(() => componentType(42), TypeError);
});

test('exposes defaults to nothing', () => {
    assert.equal(componentExposes(Rotator).size, 0);
});

test('exposes is read from the class', () => {
    class Positioned {
        static exposes = ['x', 'y'];
    }
    assert.deepEqual([...componentExposes(Positioned)], ['x', 'y']);
});

test('a malformed exposes declaration is refused', () => {
    class Bad {
        static type = 'Bad';
        static exposes = 'x';
    }
    assert.throws(() => componentExposes(Bad), /must be an array/);
});

test('schema is optional', () => {
    assert.equal(componentSchema(Rotator), null);

    class Described {
        static schema = { speed: { type: 'number' } };
    }
    assert.deepEqual(componentSchema(Described), { speed: { type: 'number' } });
});

test('a registered class is retrieved and instantiated', () => {
    const registry = new ComponentRegistry();
    registry.register(Rotator);

    assert.equal(registry.has('Rotator'), true);
    assert.equal(registry.get('Rotator'), Rotator);
    assert.ok(registry.create('Rotator') instanceof Rotator);
});

test('register returns the class, so it can wrap a declaration', () => {
    const registry = new ComponentRegistry();
    assert.equal(registry.register(Rotator), Rotator);
});

test('registering the same class twice is idempotent', () => {
    const registry = new ComponentRegistry();
    registry.register(Rotator);
    assert.doesNotThrow(() => registry.register(Rotator));
});

test('two classes cannot claim the same type name', () => {
    const registry = new ComponentRegistry();
    class OtherRotator { static type = 'Rotator'; }
    registry.register(Rotator);

    assert.throws(() => registry.register(OtherRotator), /already registered/);
});

test('an unknown type fails loudly', () => {
    const registry = new ComponentRegistry();
    assert.equal(registry.get('Missing'), undefined);
    assert.equal(registry.has('Missing'), false);
    assert.throws(() => registry.create('Missing'), /unknown component type "Missing"/);
});

test('register rejects a value that is not a class', () => {
    const registry = new ComponentRegistry();
    assert.throws(() => registry.register({}), TypeError);
});

test('types are listed sorted', () => {
    const registry = new ComponentRegistry();
    class Zeta { static type = 'Zeta'; }
    class Alpha { static type = 'Alpha'; }
    registry.register(Zeta);
    registry.register(Alpha);

    assert.deepEqual(registry.types(), ['Alpha', 'Zeta']);
});
