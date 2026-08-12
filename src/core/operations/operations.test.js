import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Operations } from './operations.js';
import { setPropertyOperation, createOperation, OperationType } from './operation.js';
import { AllowAllAuthority, PredicateAuthority, allow, deny } from './authority.js';
import { makeReactive, observe } from '../properties/reactive.js';
import { Origin } from '../properties/origin.js';

function setup({ authority } = {}) {
    const target = makeReactive({ x: 0, name: 'Player' });
    const operations = new Operations({
        authority,
        resolve: reference => (reference.object === 'obj-1' ? target : null)
    });
    return { target, operations };
}

function write(prop, value, previous, origin = Origin.EDITOR) {
    return setPropertyOperation({
        target: { object: 'obj-1', component: null },
        prop,
        value,
        previous,
        origin
    });
}

test('a submitted operation is applied', () => {
    const { target, operations } = setup();

    const result = operations.submit(write('x', 100, 0));

    assert.equal(result.applied, true);
    assert.equal(target.x, 100);
});

test('a submitted operation is announced', () => {
    const { operations } = setup();
    const announced = [];
    operations.on('operation', operation => announced.push(operation));

    operations.submit(write('x', 100, 0));

    assert.equal(announced.length, 1);
    assert.equal(announced[0].prop, 'x');
});

test('applying an operation does not announce it', () => {
    // This is the anti-echo guarantee. A client applying what the server sent must not
    // re-emit it, or replication loops. No flag is involved: apply() simply is not the
    // entry point that announces.
    const { target, operations } = setup();
    const announced = [];
    operations.on('operation', operation => announced.push(operation));

    operations.apply(write('x', 100, 0, Origin.NETWORK));

    assert.equal(target.x, 100, 'the operation is applied');
    assert.equal(announced.length, 0, 'and nothing is sent back');
});

test('applying a network operation emits a Change with the network origin', () => {
    const { target, operations } = setup();
    const changes = [];
    observe(target, 'x', change => changes.push(change));

    operations.apply(write('x', 100, 0, Origin.NETWORK));

    assert.equal(changes.length, 1, 'views still react to a remote change');
    assert.equal(changes[0].origin, Origin.NETWORK);
});

test('applying an operation never produces another operation', () => {
    // The property write path cannot create operations at all, so a round trip is
    // structurally impossible rather than merely guarded against.
    const { operations } = setup();
    let announced = 0;
    operations.on('operation', () => { announced++; });

    for (let i = 1; i <= 10; i++) operations.apply(write('x', i, i - 1, Origin.NETWORK));

    assert.equal(announced, 0);
});

test('a denied operation is not applied', () => {
    const authority = new PredicateAuthority(() => deny('read-only scene'));
    const { target, operations } = setup({ authority });

    const result = operations.submit(write('x', 100, 0));

    assert.equal(result.applied, false);
    assert.equal(result.decision.reason, 'read-only scene');
    assert.equal(target.x, 0, 'the model is untouched');
});

test('a denied operation is announced as rejected', () => {
    const authority = new PredicateAuthority(() => deny('not permitted'));
    const { operations } = setup({ authority });
    const rejected = [];
    operations.on('rejected', payload => rejected.push(payload));

    operations.submit(write('x', 100, 0));

    assert.equal(rejected.length, 1);
    assert.equal(rejected[0].decision.reason, 'not permitted');
});

test('a denied operation is not announced as applied', () => {
    const authority = new PredicateAuthority(() => false);
    const { operations } = setup({ authority });
    let announced = 0;
    operations.on('operation', () => { announced++; });

    operations.submit(write('x', 100, 0));

    assert.equal(announced, 0);
});

test('authority decides per operation, not per side', () => {
    // Authority is never "server allowed, client denied": an Editor holding the right
    // permissions mutates an authoritative simulation, a player does not.
    const authority = new PredicateAuthority(operation =>
        operation.origin === Origin.EDITOR ? allow() : deny('players may not edit'));
    const { target, operations } = setup({ authority });

    operations.submit(write('x', 10, 0, Origin.PLAYER));
    assert.equal(target.x, 0);

    operations.submit(write('x', 20, 0, Origin.EDITOR));
    assert.equal(target.x, 20);
});

test('authority can be swapped without touching call sites', () => {
    const { target, operations } = setup();

    operations.submit(write('x', 1, 0));
    assert.equal(target.x, 1);

    operations.authority = new PredicateAuthority(() => deny('locked'));
    operations.submit(write('x', 2, 1));
    assert.equal(target.x, 1);
});

test('the default authority allows and is really traversed', () => {
    const authority = new AllowAllAuthority();
    let checked = 0;
    const spy = { check: operation => { checked++; return authority.check(operation); } };
    const { operations } = setup({ authority: spy });

    operations.submit(write('x', 1, 0));

    assert.equal(checked, 1, 'the insertion point exists and is crossed, it is not a bypass');
});

test('an operation targeting an unknown object is neither applied nor announced', () => {
    // A node must not broadcast a mutation it could not apply itself.
    const { operations } = setup();
    const announced = [];
    operations.on('operation', operation => announced.push(operation));

    const result = operations.submit(setPropertyOperation({
        target: { object: 'missing', component: null },
        prop: 'x',
        value: 1,
        previous: 0,
        origin: Origin.EDITOR
    }));

    assert.equal(result.applied, false);
    assert.equal(announced.length, 0);
    assert.equal(operations.apply(write('x', 1, 0)), true, 'a known target still resolves');
});

test('operations carry an increasing sequence number', () => {
    const first = write('x', 1, 0);
    const second = write('x', 2, 1);
    assert.ok(second.seq > first.seq);
});

test('an operation is frozen', () => {
    const operation = write('x', 1, 0);
    assert.throws(() => { operation.value = 2; }, TypeError);
    assert.throws(() => { operation.target.object = 'other'; }, TypeError);
});

test('an operation records the previous value, which is what makes undo possible', () => {
    const operation = write('x', 100, 42);
    assert.equal(operation.previous, 42);
    assert.equal(operation.value, 100);
});

test('createOperation requires type, target and origin', () => {
    assert.throws(() => createOperation({ target: { object: 'a' }, origin: Origin.EDITOR }), TypeError);
    assert.throws(() => createOperation({ type: 'X', origin: Origin.EDITOR }), TypeError);
    assert.throws(() => createOperation({ type: 'X', target: { object: 'a' } }), TypeError);
});

test('an unknown operation type throws rather than passing silently', () => {
    const { operations } = setup();
    const operation = createOperation({
        type: 'UNKNOWN',
        target: { object: 'obj-1', component: null },
        origin: Origin.EDITOR
    });

    assert.throws(() => operations.submit(operation), /no handler registered/);
});

test('a new operation type can be registered without touching the pipeline', () => {
    const { target, operations } = setup();
    operations.register('RENAME', (operation, resolved) => { resolved.name = operation.name; });

    operations.submit(createOperation({
        type: 'RENAME',
        target: { object: 'obj-1', component: null },
        origin: Origin.EDITOR,
        name: 'Hero'
    }));

    assert.equal(target.name, 'Hero');
});

test('OperationType exposes SET_PROPERTY', () => {
    assert.equal(OperationType.SET_PROPERTY, 'SET_PROPERTY');
});
