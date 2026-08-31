// The whole chain, end to end: Object -> Components -> Runtime -> renderer backend.
//
// Each layer is exercised through its public entry point only, which is also a check
// that no layer needs a private door into the one below it.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform, Origin, worldPosition } from '../core/mod.js';
import { Runtime, Clock, Canvas2DRenderer, RectangleRenderer, ParticleSystem } from './mod.js';

function fakeContext() {
    const calls = [];
    const record = name => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        canvas: { width: 320, height: 180 },
        imageSmoothingEnabled: true,
        globalAlpha: 1,
        globalCompositeOperation: 'source-over',
        fillStyle: '',
        strokeStyle: '',
        lineWidth: 1,
        setTransform: record('setTransform'),
        clearRect: record('clearRect'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        beginPath: record('beginPath'),
        arc: record('arc'),
        fill: record('fill'),
        stroke: record('stroke'),
        drawImage: record('drawImage'),
        save: record('save'),
        restore: record('restore')
    };
}

class Orbit {
    static type = 'Orbit';
    constructor(speed = 1) { this.speed = speed; }
    update(self, ctx) { self.rotationX += this.speed * ctx.deltaTime; }
}

test('a scene runs and draws through the Canvas 2D backend', () => {
    const context = fakeContext();
    const scene = new Scene('Main');

    const parent = scene.add(new Object('Parent'));
    parent.addComponent(new Transform(160, 90));
    parent.addComponent(new Orbit(Math.PI));

    const child = scene.add(new Object('Child'));
    child.addComponent(new Transform(40, 0));
    child.addComponent(new RectangleRenderer(8, 8, '#ff0000'));
    parent.addChild(child);

    const runtime = new Runtime(scene, {
        clock: new Clock({ fixedStep: 1 / 60 }),
        renderer: new Canvas2DRenderer(context)
    });

    for (let frame = 0; frame < 30; frame++) {
        runtime.advance(1 / 60);
        runtime.render({ clear: '#101010' });
    }

    // 30 steps at 1/60 s is half a second; at pi rad/s that is a quarter turn. The child
    // sat 40 to the right of its parent, so it has swung to 40 below it.
    const position = worldPosition(child);
    assert.ok(Math.abs(position.x - 160) < 1e-6, `expected x near 160, got ${position.x}`);
    assert.ok(Math.abs(position.y - 130) < 1e-6, `expected y near 130, got ${position.y}`);

    assert.equal(child.x, 40, 'the child never had its local values rewritten');
    assert.equal(child.rotationX, 0);

    assert.equal(context.of('fillRect').length, 60, 'one clear and one rectangle per frame');
    assert.equal(context.of('save').length, context.of('restore').length);
});

test('the same simulation runs headless and reaches the same state', () => {
    // This is the server: no renderer, no context, no DOM, same result.
    const build = () => {
        const scene = new Scene('Main');
        const object = scene.add(new Object('Spinner'));
        object.addComponent(new Transform());
        object.addComponent(new Orbit(1));
        object.addComponent(new ParticleSystem({ rate: 30, lifetime: 1, max: 50 }));
        return { scene, object };
    };

    const server = build();
    const client = build();

    const serverRuntime = new Runtime(server.scene);
    const clientRuntime = new Runtime(client.scene, { renderer: new Canvas2DRenderer(fakeContext()) });

    for (let frame = 0; frame < 60; frame++) {
        serverRuntime.advance(1 / 60);
        clientRuntime.advance(1 / 60);
        clientRuntime.render();
    }

    assert.equal(serverRuntime.renders, false);
    assert.equal(clientRuntime.renders, true);
    assert.equal(server.object.rotationX, client.object.rotationX);
    assert.deepEqual(
        server.object.getComponent('ParticleSystem').particles,
        client.object.getComponent('ParticleSystem').particles,
        'rendering changed nothing about the simulation'
    );
});

test('an Editor edit reaches the next rendered frame', () => {
    const context = fakeContext();
    const scene = new Scene('Main');
    const object = scene.add(new Object('Box'));
    object.addComponent(new Transform(0, 0));
    object.addComponent(new RectangleRenderer(4, 4));

    const runtime = new Runtime(scene, { renderer: new Canvas2DRenderer(context) });
    runtime.render();
    assert.equal(context.of('setTransform').at(-1).args[4], 0);

    object.setProperty('x', 100, { origin: Origin.EDITOR });

    runtime.render();
    assert.equal(context.of('setTransform').at(-1).args[4], 100);
});

test('the runtime never reaches into the DOM', () => {
    assert.equal(typeof globalThis.document, 'undefined');
    assert.equal(typeof globalThis.window, 'undefined');

    const scene = new Scene('Main');
    const object = scene.add(new Object('Box'));
    object.addComponent(new Transform());
    object.addComponent(new RectangleRenderer());

    const runtime = new Runtime(scene, { renderer: new Canvas2DRenderer(fakeContext()) });
    runtime.advance(1 / 60);

    assert.equal(runtime.render(), 1);
});
