import { test } from 'node:test';
import assert from 'node:assert/strict';

import { Object as SceneObject, Scene, Transform, components } from '../core/mod.js';
import { Runtime } from '../runtime/mod.js';
import { registerBuiltIns } from './registry.js';
import { Histories } from './history.js';
import { Transport, TransportState, frameDelta } from './transport.js';

registerBuiltIns(components);

/** A scene with one object at a known place, and the transport that plays it. */
function setup() {
    const scene = new Scene('Test', { registry: components });

    const object = new SceneObject('Player');
    object.addComponent(new Transform());
    object.getComponent('Transform').setProperty('x', 10);
    scene.add(object);

    const runtime = new Runtime(scene, {});
    runtime.running = false;

    const histories = new Histories();
    histories.for(scene.id, scene.operations);

    const transport = new Transport({ scene, runtime, histories, registry: components });
    return { scene, object, runtime, histories, transport };
}

test('an editor starts in EDITING, with the runtime stopped', () => {
    const { transport, runtime } = setup();

    assert.equal(transport.state, TransportState.EDITING);
    assert.equal(runtime.running, false);
    assert.equal(transport.held, false, 'nothing to restore before anything was played');
});

test('Play starts the runtime and takes a snapshot', () => {
    const { transport, runtime } = setup();

    transport.play();
    assert.equal(transport.state, TransportState.PLAYING);
    assert.equal(runtime.running, true);
    assert.equal(transport.held, true);
});

test('Play empties the undo stack, because undo does not rewind a simulation', () => {
    const { transport, scene, object, histories } = setup();

    object.setProperty('name', 'Renamed');
    const history = histories.get(scene.id);
    assert.equal(history.canUndo, true, 'the edit was recorded while editing');

    transport.play();
    assert.equal(history.canUndo, false, 'ADR-0029 §5: the history stops at the door');
});

test('Pause holds time without leaving the session', () => {
    const { transport, runtime } = setup();

    transport.play();
    transport.pause();

    assert.equal(transport.state, TransportState.PAUSED);
    assert.equal(runtime.running, false);
    assert.equal(transport.held, true, 'the snapshot survives a pause');
});

test('Play after Pause resumes, and does not re-snapshot', () => {
    const { transport, scene, object } = setup();

    transport.play();
    transport.pause();

    // A change made while paused must NOT become the thing Stop restores to.
    object.getComponent('Transform').setProperty('x', 999);
    transport.play();
    transport.stop();

    assert.equal(scene.get(object.id).getComponent('Transform').x, 10,
        'Stop restores the snapshot Play took, not one taken on resume');
});

test('Stop restores the scene exactly as Play found it', () => {
    const { transport, scene, object } = setup();

    transport.play();

    // What a simulation would do: move things, add things, remove things.
    scene.get(object.id).getComponent('Transform').x = 500;
    const spawned = new SceneObject('Bullet');
    spawned.addComponent(new Transform());
    scene.add(spawned);

    transport.stop();

    assert.equal(transport.state, TransportState.EDITING);
    assert.equal(scene.objects().length, 1, 'what the simulation spawned is gone');
    assert.equal(scene.roots()[0].name, 'Player');
    assert.equal(scene.roots()[0].getComponent('Transform').x, 10);
});

test('Stop restores a hierarchy, in its order', () => {
    const { transport, scene } = setup();

    const parent = new SceneObject('Parent');
    parent.addComponent(new Transform());
    const child = new SceneObject('Child');
    child.addComponent(new Transform());
    scene.add(parent);
    scene.add(child);
    scene.reparent(child.id, parent.id);

    transport.play();
    for (const object of scene.roots()) scene.remove(object);
    assert.equal(scene.objects().length, 0, 'the simulation emptied the scene');

    transport.stop();

    assert.equal(scene.objects().length, 3);
    const restored = scene.roots().find(object => object.name === 'Parent');
    assert.equal(restored.children.length, 1);
    assert.equal(restored.children[0].name, 'Child');
});

test('Stop resets the simulation clock, so a second Play starts at zero', () => {
    const { transport, runtime } = setup();

    transport.play();
    runtime.advance(1);
    assert.ok(runtime.clock.time > 0, 'time moved while playing');

    transport.stop();
    assert.equal(runtime.clock.time, 0);
});

test('Stop leaves no undoable trace of the restore', () => {
    const { transport, scene, histories } = setup();

    transport.play();
    scene.roots()[0].getComponent('Transform').x = 77;
    transport.stop();

    assert.equal(histories.get(scene.id).canUndo, false,
        'a restore is not an authored intent');
});

test('the buttons are idempotent, in every direction', () => {
    const { transport, runtime } = setup();

    assert.equal(transport.stop(), TransportState.EDITING, 'Stop while editing does nothing');
    assert.equal(transport.pause(), TransportState.EDITING, 'Pause while editing does nothing');

    transport.play();
    assert.equal(transport.play(), TransportState.PLAYING, 'a second Play is not a restart');
    assert.equal(runtime.running, true);

    transport.pause();
    assert.equal(transport.pause(), TransportState.PAUSED);
    transport.stop();
    assert.equal(transport.stop(), TransportState.EDITING);
});

test('Stop from PAUSED restores just as it does from PLAYING', () => {
    const { transport, scene, object } = setup();

    transport.play();
    transport.pause();
    scene.get(object.id).getComponent('Transform').x = -1;
    transport.stop();

    assert.equal(transport.state, TransportState.EDITING);
    assert.equal(scene.roots()[0].getComponent('Transform').x, 10,
        'ADR-0029 §6: changes made while paused fall under §4 like any other');
});

test('the state is announced, and to a fresh listener immediately', () => {
    const { transport } = setup();
    const seen = [];

    const stop = transport.observe(state => seen.push(state));
    assert.deepEqual(seen, [TransportState.EDITING], 'a listener learns the current state at once');

    transport.play();
    transport.pause();
    transport.stop();
    assert.deepEqual(seen, [
        TransportState.EDITING,
        TransportState.PLAYING,
        TransportState.PAUSED,
        TransportState.EDITING
    ]);

    stop();
    transport.play();
    assert.equal(seen.length, 4, 'unsubscribing stops the announcements');
});

test('a transport without a scene or a runtime refuses to exist', () => {
    assert.throws(() => new Transport({ runtime: {} }), TypeError);
    assert.throws(() => new Transport({ scene: {} }), TypeError);
});

test('a transport with no histories still plays and stops', () => {
    const scene = new Scene('Bare', { registry: components });
    const runtime = new Runtime(scene, {});
    const transport = new Transport({ scene, runtime, registry: components });

    transport.play();
    transport.stop();
    assert.equal(transport.state, TransportState.EDITING);
});

// --- how much time one frame accounts for --------------------------------------------

test('the first frame of a session advances nothing', () => {
    assert.equal(frameDelta(1000, 0, 0.25), 0, 'there is no previous frame to measure against');
});

test('an ordinary frame advances by its own duration, in seconds', () => {
    assert.equal(frameDelta(1016, 1000, 0.25), 0.016);
    assert.equal(frameDelta(2000, 1000, 5), 1);
});

test('a frame that spans a backgrounded tab is clamped rather than caught up', () => {
    // A tab that stopped receiving frames for half a minute must not hand the clock half
    // a minute of simulation to run through the moment it is looked at again.
    assert.equal(frameDelta(31000, 1000, 0.25), 0.25);
});

test('time that did not move, or moved backwards, advances nothing', () => {
    assert.equal(frameDelta(1000, 1000, 0.25), 0);
    assert.equal(frameDelta(900, 1000, 0.25), 0, 'a clock that went backwards is not a rewind');
    assert.equal(frameDelta(Number.NaN, 1000, 0.25), 0);
    assert.equal(frameDelta(1000, Number.NaN, 0.25), 0);
});
