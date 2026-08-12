// End-to-end invariants of the core, exercised through the public entry point only.
//
// These are the properties the rest of Pixel Creator is allowed to rely on. They cut
// across modules, which is why they live here rather than in a single module's tests.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
    Object,
    Scene,
    Transform,
    Origin,
    ComponentRegistry,
    PredicateAuthority,
    allow,
    deny,
    serializeScene,
    deserializeScene,
    observe
} from './mod.js';

class Velocity {
    static type = 'Velocity';
    constructor(vx = 0, vy = 0) { this.vx = vx; this.vy = vy; }

    update(self) {
        // A simulation output: a plain write, never setProperty(). Turning this into an
        // Operation would put one network message per object per frame on the wire.
        self.x += this.vx;
        self.y += this.vy;
    }
}

test('two nodes replicate without echoing', () => {
    // The scenario Legacy fought with dispatch flags. Here nothing guards it: the
    // client applies with apply(), which is simply not the entry point that announces.
    const server = new Scene('Main');
    const client = new Scene('Main', { id: 'shared' });

    const serverObject = server.add(new Object('Player', { id: 'obj-1' }));
    const clientObject = client.add(new Object('Player', { id: 'obj-1' }));

    const wire = [];
    server.operations.on('operation', operation => wire.push(operation));

    const clientEmissions = [];
    client.operations.on('operation', operation => clientEmissions.push(operation));

    // The Editor edits on the server side.
    serverObject.setProperty('name', 'Hero', { origin: Origin.EDITOR });

    assert.equal(wire.length, 1, 'the intent travels once');

    // The client applies what arrived.
    for (const operation of wire) client.operations.apply(operation);

    assert.equal(clientObject.name, 'Hero', 'the client is up to date');
    assert.equal(clientEmissions.length, 0, 'and sends nothing back');
});

test('a simulation frame produces no network traffic', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    const velocity = object.addComponent(new Velocity(2, 3));

    const wire = [];
    scene.operations.on('operation', operation => wire.push(operation));

    for (let frame = 0; frame < 60; frame++) velocity.update(object);

    assert.equal(object.x, 120);
    assert.equal(object.y, 180);
    assert.equal(wire.length, 0, 'sixty frames, zero operations');
});

test('an Editor edit reaches every view immediately, letter by letter', () => {
    // The behaviour Pixel Creator must keep: typing in the Inspector updates the
    // Hierarchy as each character lands, from one source of truth.
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));

    const inspector = [];
    const hierarchy = [];
    object.observe('name', change => inspector.push(change.value));
    object.observe('name', change => hierarchy.push(change.value));

    for (const value of ['P', 'Pl', 'Pla', 'Play']) {
        object.setProperty('name', value, { origin: Origin.EDITOR });
    }

    assert.deepEqual(inspector, ['P', 'Pl', 'Pla', 'Play']);
    assert.deepEqual(hierarchy, ['P', 'Pl', 'Pla', 'Play']);
    assert.equal(object.name, 'Play');
});

test('a view watching a facade property does not know which component provides it', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());

    const viewport = [];
    object.observe('x', change => viewport.push(change.value));

    object.setProperty('x', 64, { origin: Origin.EDITOR });                 // through the facade
    object.getComponent('Transform').setProperty('x', 128);                 // through the component
    object.getComponent('Transform').x = 256;                               // direct write

    assert.deepEqual(viewport, [64, 128, 256]);
    assert.equal(object.x, 256);
});

test('an Editor with permission may mutate an authoritative simulation', () => {
    // Authority is decided per operation, never "server allowed, client denied".
    const scene = new Scene('Main', {
        authority: new PredicateAuthority(operation =>
            operation.origin === Origin.EDITOR && operation.actor === 'owner'
                ? allow()
                : deny('only the project owner may edit a running game'))
    });
    const object = scene.add(new Object('Player'));

    const refused = object.setProperty('name', 'Hacked', { origin: Origin.PLAYER, actor: 'guest' });
    assert.equal(refused.applied, false);
    assert.equal(object.name, 'Player');

    const accepted = object.setProperty('name', 'Hero', { origin: Origin.EDITOR, actor: 'owner' });
    assert.equal(accepted.applied, true);
    assert.equal(object.name, 'Hero');
});

test('a refused intent is announced so a view can reconcile', () => {
    const scene = new Scene('Main', {
        authority: new PredicateAuthority(() => deny('locked'))
    });
    const object = scene.add(new Object('Player'));
    const rejected = [];
    scene.operations.on('rejected', payload => rejected.push(payload.decision.reason));

    object.setProperty('name', 'Hero');

    assert.deepEqual(rejected, ['locked']);
});

test('operations carry what undo will need', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform(10));
    const history = [];
    scene.operations.on('operation', operation => history.push(operation));

    object.setProperty('x', 100);

    const [operation] = history;
    assert.equal(operation.previous, 10);
    assert.equal(operation.value, 100);

    // Replaying the operation backwards restores the previous state.
    scene.operations.apply({ ...operation, value: operation.previous, previous: operation.value });
    assert.equal(object.x, 10);
});

test('a scene survives a save and reload with its behaviour intact', () => {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(Velocity);

    const scene = new Scene('Main');
    const parent = scene.add(new Object('Parent'));
    const child = scene.add(new Object('Child'));
    parent.addComponent(new Transform(10, 20));
    parent.addComponent(new Velocity(1, 1));
    parent.addChild(child);

    const saved = JSON.parse(JSON.stringify(serializeScene(scene)));
    const reloaded = deserializeScene(saved, { registry });
    const reloadedParent = reloaded.get(parent.id);

    assert.equal(reloadedParent.x, 10);
    assert.deepEqual(reloadedParent.children.map(object => object.id), [child.id]);

    reloadedParent.getComponent('Velocity').update(reloadedParent);
    assert.equal(reloadedParent.x, 11, 'components run after a reload');

    const operations = [];
    reloaded.operations.on('operation', operation => operations.push(operation));
    reloadedParent.setProperty('name', 'Renamed');
    assert.equal(operations.length, 1, 'and the pipeline is wired');
});

test('the core carries no DOM dependency', () => {
    // Running these tests under Node at all is the real proof; this states the intent.
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());
    object.setProperty('x', 1);

    assert.equal(object.x, 1);
});

test('the v2 write syntaxes removed from Legacy are absent', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    object.addComponent(new Transform());

    assert.equal(object.$x, undefined, '$property is gone for good');
    assert.equal(object._x, undefined, '_x was a Legacy implementation detail');
    assert.equal(object.__x, undefined, '__x likewise');
    assert.equal(object.syncProperty, undefined, 'replaced by setProperty()');

    // Writing $x creates an ordinary ad-hoc property and nothing more: no magic.
    const operations = [];
    scene.operations.on('operation', operation => operations.push(operation));
    object.$x = 5;
    assert.equal(object.x, 0, 'it does not reach Transform');
    assert.equal(operations.length, 0, 'and it replicates nothing');
});

test('observe can be used directly on a component', () => {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player'));
    const transform = object.addComponent(new Transform());
    const seen = [];

    const off = observe(transform, 'y', change => seen.push(change.value));
    transform.y = 5;
    off();
    transform.y = 9;

    assert.deepEqual(seen, [5]);
});
