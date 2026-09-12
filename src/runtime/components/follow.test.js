// Staying where something else is (ADR-0069 §10).

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ComponentRegistry, Object as SceneObject, Scene, Transform } from '../../core/mod.js';
import { Clock } from '../clock/clock.js';
import { Runtime } from '../runtime.js';
import { Velocity } from './velocity.js';
import { Follow } from './follow.js';

function staged() {
    const registry = new ComponentRegistry();
    for (const Type of [Transform, Velocity, Follow]) registry.register(Type);

    const scene = new Scene('Level', { registry });
    const put = (name, x, y) => {
        const object = scene.add(new SceneObject(name, { id: `obj_${name}` }));
        object.addComponent(new Transform(x, y));
        return object;
    };

    return {
        scene,
        put,
        runtime: () => new Runtime(scene, { clock: new Clock({ fixedStep: 1 / 60 }) }),
        at: object => [object.getComponent('Transform').x, object.getComponent('Transform').y]
    };
}

test('a camera put on a player is where the player is', () => {
    const it = staged();
    const player = it.put('Player', 120, -40);
    const camera = it.put('Camera', 0, 0);
    camera.addComponent(new Follow(player));

    it.runtime().step();

    assert.deepEqual(it.at(camera), [120, -40]);
});

test('it keeps up while the player moves', () => {
    const it = staged();
    const player = it.put('Player', 0, 0);
    player.addComponent(new Velocity(240, 0));
    const camera = it.put('Camera', 0, 0);
    camera.addComponent(new Follow(player));

    const runtime = it.runtime();
    for (let step = 0; step < 60; step++) runtime.step();

    // EXACT, because the player is earlier in canonical order and had already moved when the
    // follower looked (ADR-0034 §3.1).
    assert.deepEqual(it.at(player), [240, 0]);
    assert.deepEqual(it.at(camera), [240, 0]);
});

test('a target that moves after it is followed one step later, and that is all', () => {
    const it = staged();
    // The camera first this time: it looks before the player has moved, every step.
    const camera = it.put('Camera', 0, 0);
    const player = it.put('Player', 0, 0);
    player.addComponent(new Velocity(240, 0));
    camera.addComponent(new Follow(player));

    const runtime = it.runtime();
    for (let step = 0; step < 60; step++) runtime.step();

    // ONE STEP OF THE TARGET'S SPEED — four units at 240 a second, and the same for a Body,
    // which is moved by the pass that ends a step (ADR-0067 §4). It is why no smoothing is
    // offered: there is nothing here a number could improve.
    assert.deepEqual(it.at(player), [240, 0]);
    assert.deepEqual(it.at(camera), [236, 0]);
});

test('an offset is where it sits relative to what it follows', () => {
    const it = staged();
    const player = it.put('Player', 50, 50);
    const camera = it.put('Camera', 0, 0);
    camera.addComponent(new Follow(player, 0, -80));

    it.runtime().step();

    assert.deepEqual(it.at(camera), [50, -30], 'above it, by eighty');
});

test('a reference stored as an identity resolves against the scene', () => {
    const it = staged();
    const player = it.put('Player', 7, 9);
    const camera = it.put('Camera', 0, 0);
    // What a scene read back from a file holds (ADR-0034 §3.5).
    camera.addComponent(new Follow(player.id));

    it.runtime().step();

    assert.deepEqual(it.at(camera), [7, 9]);
});

test('nothing to follow, and nothing happens', () => {
    const it = staged();
    const camera = it.put('Camera', 11, 22);
    camera.addComponent(new Follow(null));

    const runtime = it.runtime();
    runtime.step();
    assert.deepEqual(it.at(camera), [11, 22], 'no target');

    camera.getComponent('Follow').target = 'obj_gone';
    runtime.step();
    assert.deepEqual(it.at(camera), [11, 22], 'a target that is not there');
});

test('a target destroyed mid-game leaves the camera where it was', () => {
    const it = staged();
    const player = it.put('Player', 300, 0);
    const camera = it.put('Camera', 0, 0);
    camera.addComponent(new Follow(player));

    const runtime = it.runtime();
    runtime.step();
    assert.deepEqual(it.at(camera), [300, 0]);

    it.scene.remove(player);
    runtime.step();

    // A PLAYABLE FRAME IS THE ONLY HONEST ANSWER (ADR-0034 §3.4). Snapping to the origin
    // would throw the level off screen at the moment a creator most wants to see it.
    assert.deepEqual(it.at(camera), [300, 0]);
});

test('a follower under a moved parent lands on the target all the same', () => {
    const it = staged();
    const player = it.put('Player', 100, 40);
    const rig = it.put('Rig', 500, 500);
    const camera = it.put('Camera', 0, 0);
    rig.addChild(camera);
    camera.addComponent(new Follow(player));

    it.runtime().step();

    // Written in the parent's space, so the WORLD position is the target's.
    assert.deepEqual(it.at(camera), [-400, -460]);
});

test('two runtimes over two identical scenes agree', () => {
    const played = () => {
        const it = staged();
        const player = it.put('Player', 0, 0);
        player.addComponent(new Velocity(90, -30));
        const camera = it.put('Camera', 0, 0);
        camera.addComponent(new Follow(player, 10, 10));
        const runtime = it.runtime();
        for (let step = 0; step < 120; step++) runtime.step();
        return it.at(camera);
    };

    assert.deepEqual(played(), played());
});
