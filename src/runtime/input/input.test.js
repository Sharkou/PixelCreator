import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../../core/mod.js';
import { Input, InputState, LOCAL } from './input.js';
import { Runtime } from '../runtime.js';
import { Clock } from '../clock/clock.js';

/** Moves along x while a key is held, so a simulation result reflects the input. */
class Walker {
    static type = 'Walker';
    constructor(key = 'ArrowRight', speed = 60) {
        this.key = key;
        this.speed = speed;
        this.jumps = 0;
    }
    update(self, ctx) {
        const input = ctx.input.of(self.owner);
        if (input.isDown(this.key)) self.x += this.speed * ctx.deltaTime;
        if (input.pressed('Space')) this.jumps++;
    }
}

function walkingScene({ owner = null } = {}) {
    const scene = new Scene('Main');
    const object = scene.add(new Object('Player', { owner }));
    object.addComponent(new Transform());
    const walker = object.addComponent(new Walker());
    return { scene, object, walker };
}

// --- input state ------------------------------------------------------------------

test('a fresh state has nothing pressed and a pointer at the origin', () => {
    const state = new InputState();

    assert.equal(state.isDown('KeyW'), false);
    assert.equal(state.isButtonDown(0), false);
    assert.deepEqual(state.keys(), []);
    assert.deepEqual(state.buttons(), []);
    assert.deepEqual(state.axes(), []);
    assert.equal(state.pointerX, 0);
    assert.equal(state.pointerY, 0);
    assert.equal(state.axis('throttle'), 0, 'an unset axis reads as zero, not undefined');
});

test('a key is held until it is released', () => {
    const state = new InputState();

    state.press('KeyW');
    assert.equal(state.isDown('KeyW'), true);
    assert.deepEqual(state.keys(), ['KeyW']);

    state.release('KeyW');
    assert.equal(state.isDown('KeyW'), false);
    assert.deepEqual(state.keys(), []);
});

test('releasing a key that was never pressed changes nothing', () => {
    const state = new InputState();

    state.release('KeyW');

    assert.deepEqual(state.keys(), []);
});

test('pressed and released fire on one step only', () => {
    const state = new InputState();

    state.press('Space');
    assert.equal(state.pressed('Space'), true);
    assert.equal(state.isDown('Space'), true);

    state.commit();
    assert.equal(state.pressed('Space'), false, 'held, no longer newly pressed');
    assert.equal(state.isDown('Space'), true);

    state.release('Space');
    assert.equal(state.released('Space'), true);

    state.commit();
    assert.equal(state.released('Space'), false);
    assert.equal(state.isDown('Space'), false);
});

test('buttons behave like keys', () => {
    const state = new InputState();

    state.pressButton(0);
    state.pressButton(2);

    assert.equal(state.isButtonDown(0), true);
    assert.equal(state.isButtonDown(1), false);
    assert.equal(state.buttonPressed(0), true);
    assert.deepEqual(state.buttons(), [0, 2]);

    state.commit();
    assert.equal(state.buttonPressed(0), false);

    state.releaseButton(0);
    assert.equal(state.buttonReleased(0), true);
    assert.deepEqual(state.buttons(), [2]);
});

test('the pointer position is stored in screen space', () => {
    const state = new InputState();

    state.movePointer(120, 45);

    assert.equal(state.pointerX, 120);
    assert.equal(state.pointerY, 45);
});

test('axes hold their value', () => {
    const state = new InputState();

    state.setAxis('throttle', 0.5);
    state.setAxis('steer', -1);

    assert.equal(state.axis('throttle'), 0.5);
    assert.equal(state.axis('steer'), -1);
    assert.deepEqual(state.axes(), ['steer', 'throttle']);
});

test('clear releases everything', () => {
    const state = new InputState();
    state.press('KeyW');
    state.pressButton(0);
    state.setAxis('throttle', 1);
    state.movePointer(10, 10);

    state.clear();

    assert.deepEqual(state.keys(), []);
    assert.deepEqual(state.buttons(), []);
    assert.deepEqual(state.axes(), []);
    assert.equal(state.pointerX, 0);
    assert.equal(state.pointerY, 0);
});

// --- owners -----------------------------------------------------------------------

test('the local owner always exists', () => {
    const input = new Input();

    assert.deepEqual(input.owners(), [LOCAL]);
    assert.ok(input.local instanceof InputState);
});

test('an object with no owner reads the local input', () => {
    // This is what makes offline single-player work with no special case.
    const input = new Input();
    input.local.press('KeyW');

    assert.equal(input.of(null).isDown('KeyW'), true);
    assert.equal(input.of(undefined).isDown('KeyW'), true);
    assert.equal(input.of(LOCAL).isDown('KeyW'), true);
});

test('owners hold independent state', () => {
    const input = new Input();

    input.of('alice').press('KeyW');
    input.of('bob').press('KeyS');

    assert.equal(input.of('alice').isDown('KeyW'), true);
    assert.equal(input.of('alice').isDown('KeyS'), false);
    assert.equal(input.of('bob').isDown('KeyS'), true);
    assert.deepEqual(input.owners(), ['alice', 'bob', LOCAL]);
});

test('an unknown owner reads as empty without disturbing the others', () => {
    const input = new Input();
    input.of('alice').press('KeyW');

    assert.deepEqual(input.of('stranger').keys(), []);
    assert.equal(input.of('alice').isDown('KeyW'), true);
});

test('an owner state can be replaced wholesale', () => {
    // The path the network layer takes: a snapshot arrives and takes the place of what
    // was there, rather than being merged key by key.
    const input = new Input();
    input.of('alice').press('KeyW');

    const replacement = new InputState();
    replacement.press('KeyS');
    input.set('alice', replacement);

    assert.equal(input.of('alice').isDown('KeyW'), false, 'the old state is gone entirely');
    assert.equal(input.of('alice').isDown('KeyS'), true);
    assert.equal(input.of('alice'), replacement);
});

test('replacing an owner state rejects anything that is not one', () => {
    const input = new Input();

    assert.throws(() => input.set('alice', { isDown: () => true }), TypeError);
});

test('an owner can be forgotten, except the local one', () => {
    const input = new Input();
    input.of('alice').press('KeyW');

    assert.equal(input.remove('alice'), true);
    assert.deepEqual(input.owners(), [LOCAL]);

    assert.equal(input.remove(LOCAL), false, 'the local owner always exists');
    assert.equal(input.remove(null), false);
    assert.deepEqual(input.owners(), [LOCAL]);
});

test('commit and clear reach every owner', () => {
    const input = new Input();
    input.of('alice').press('KeyW');
    input.of('bob').press('KeyS');

    input.commit();
    assert.equal(input.of('alice').pressed('KeyW'), false);
    assert.equal(input.of('bob').pressed('KeyS'), false);

    input.clear();
    assert.deepEqual(input.of('alice').keys(), []);
    assert.deepEqual(input.of('bob').keys(), []);
});

// --- no DOM -----------------------------------------------------------------------

test('input carries no DOM dependency', () => {
    // Running this under Node at all is the real proof; this states the intent. Nothing
    // here has ever seen a KeyboardEvent — a browser adapter will produce these calls,
    // and the network layer will produce the same ones on a server.
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');
    assert.equal(typeof globalThis.KeyboardEvent, 'undefined');

    const state = new InputState();
    state.press('ArrowLeft');
    state.movePointer(5, 5);

    assert.equal(state.isDown('ArrowLeft'), true);
});

// --- the runtime ------------------------------------------------------------------

test('a step with no input runs on empty input rather than failing', () => {
    // Legacy's single-player was broken precisely here: the keyboard reached for
    // Network.users, which is undefined offline, and threw on every frame.
    const { scene, object } = walkingScene();

    const runtime = new Runtime(scene);
    runtime.step();

    assert.equal(object.x, 0);
    assert.ok(runtime.input instanceof Input);
});

test('update receives the input passed to the step', () => {
    const { scene, object } = walkingScene();
    const input = new Input();
    input.local.press('ArrowRight');

    new Runtime(scene, { clock: new Clock({ fixedStep: 0.1 }) }).step(input);

    assert.ok(Math.abs(object.x - 6) < 1e-9, 'the walker moved for one fixed step');
});

test('input reaches components through the owner of their object', () => {
    const { scene, object } = walkingScene({ owner: 'alice' });
    const input = new Input();
    input.of('bob').press('ArrowRight');

    const runtime = new Runtime(scene, { clock: new Clock({ fixedStep: 0.1 }) });
    runtime.step(input);
    assert.equal(object.x, 0, "another player's input does not move this object");

    input.of('alice').press('ArrowRight');
    runtime.step(input);
    assert.ok(Math.abs(object.x - 6) < 1e-9);
});

test('a press is observed by exactly one step, whatever the frame owes', () => {
    const { scene, walker } = walkingScene();
    const input = new Input();
    input.local.press('Space');

    // Four fixed steps in a single advance: the press must still count once.
    new Runtime(scene, { clock: new Clock({ fixedStep: 1 / 60 }) }).advance(4 / 60, input);

    assert.equal(walker.jumps, 1);
});

test('the runtime default input is used when advance is given none', () => {
    const { scene, object } = walkingScene();
    const input = new Input();
    input.local.press('ArrowRight');

    const runtime = new Runtime(scene, { input, clock: new Clock({ fixedStep: 0.1 }) });
    runtime.advance(0.1);

    assert.ok(Math.abs(object.x - 6) < 1e-9);
});

test('the same input and the same initial state reach the same result', () => {
    // Determinism is what lets a server replay what a client sent and get the same
    // answer. Two runtimes, two identical scenes, the same key sequence.
    const script = [
        ['ArrowRight', true], ['ArrowRight', true], ['ArrowRight', false],
        ['ArrowRight', true], ['ArrowRight', false]
    ];

    const run = () => {
        const { scene, object, walker } = walkingScene();
        const input = new Input();
        const runtime = new Runtime(scene, { clock: new Clock({ fixedStep: 1 / 60 }) });
        for (const [key, down] of script) {
            if (down) input.local.press(key); else input.local.release(key);
            runtime.advance(1 / 60, input);
        }
        return { x: object.x, jumps: walker.jumps };
    };

    const first = run();
    const second = run();

    assert.deepEqual(first, second);
    assert.ok(first.x > 0, 'and the input actually did something');
});
