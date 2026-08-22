import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform, Matrix } from '../../core/mod.js';
import { SceneRenderer } from './scene-renderer.js';
import { Canvas2DRenderer } from './canvas2d.js';
import { missingOperations, assertRenderer, BlendMode } from './renderer.js';
import { RectangleRenderer } from './components/rectangle-renderer.js';
import { Sprite } from './components/sprite.js';
import { ParticleSystem } from './components/particle-system.js';
import { Tilemap } from './components/tilemap.js';

/** A backend that records calls instead of producing pixels. */
function recordingRenderer() {
    const calls = [];
    const record = name => (...args) => { calls.push({ name, args }); };
    return {
        calls,
        of: name => calls.filter(call => call.name === name),
        clear: record('clear'),
        save: record('save'),
        restore: record('restore'),
        setTransform: record('setTransform'),
        setBlendMode: record('setBlendMode'),
        fillRect: record('fillRect'),
        strokeRect: record('strokeRect'),
        fillCircle: record('fillCircle'),
        drawImage: record('drawImage')
    };
}

/** A stand-in for CanvasRenderingContext2D that records the calls it receives. */
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

function sceneWith(...objects) {
    const scene = new Scene('Main');
    for (const object of objects) scene.add(object);
    return scene;
}

// --- the contract ---------------------------------------------------------------

test('a complete backend satisfies the contract', () => {
    assert.deepEqual(missingOperations(recordingRenderer()), []);
    assert.doesNotThrow(() => assertRenderer(recordingRenderer()));
});

test('an incomplete backend is rejected with the missing names', () => {
    const partial = { clear() {}, save() {}, restore() {} };

    assert.deepEqual(missingOperations(partial).sort(), [
        'drawImage', 'fillCircle', 'fillRect', 'setBlendMode', 'setTransform', 'strokeRect'
    ]);
    assert.throws(() => assertRenderer(partial), /missing required operations/);
    assert.throws(() => new SceneRenderer(partial), /missing required operations/);
});

// --- scene rendering ------------------------------------------------------------

test('a component draws through the renderer', () => {
    const renderer = recordingRenderer();
    const object = new Object('Box');
    object.addComponent(new Transform(10, 20));
    object.addComponent(new RectangleRenderer(4, 6, '#ff0000'));

    new SceneRenderer(renderer).render(sceneWith(object));

    assert.deepEqual(renderer.of('fillRect')[0].args.slice(0, 4), [-2, -3, 4, 6]);
    assert.equal(renderer.of('fillRect')[0].args[4].color, '#ff0000');
});

test('the world transform is established before drawing', () => {
    const renderer = recordingRenderer();
    const parent = new Object('Parent');
    const child = new Object('Child');
    parent.addComponent(new Transform(100, 50));
    child.addComponent(new Transform(10, 5));
    child.addComponent(new RectangleRenderer());
    parent.addChild(child);

    new SceneRenderer(renderer).render(sceneWith(parent, child));

    const matrix = renderer.of('setTransform')[0].args[0];
    assert.equal(matrix.e, 110);
    assert.equal(matrix.f, 55);
});

test('the view transform applies above every object', () => {
    const renderer = recordingRenderer();
    const object = new Object('Box');
    object.addComponent(new Transform(10, 0));
    object.addComponent(new RectangleRenderer());

    new SceneRenderer(renderer).render(sceneWith(object), { view: Matrix.compose(-5, 0) });

    assert.equal(renderer.of('setTransform')[0].args[0].e, 5);
});

test('objects draw in layer order', () => {
    const renderer = recordingRenderer();
    const back = new Object('Back', { layer: 0 });
    const front = new Object('Front', { layer: 10 });
    for (const object of [back, front]) {
        object.addComponent(new Transform());
        object.addComponent(new RectangleRenderer());
    }

    new SceneRenderer(renderer).render(sceneWith(front, back));

    assert.deepEqual(
        renderer.of('setTransform').map(call => call.args[0].e),
        [0, 0],
        'both drew'
    );
    assert.equal(renderer.of('fillRect').length, 2);
});

test('inactive objects are skipped', () => {
    const renderer = recordingRenderer();
    const hidden = new Object('Hidden');
    const inactive = new Object('Inactive');
    for (const object of [hidden, inactive]) {
        object.addComponent(new Transform());
        object.addComponent(new RectangleRenderer());
    }
    hidden.active = false;
    inactive.active = false;

    const drawn = new SceneRenderer(renderer).render(sceneWith(hidden, inactive));

    assert.equal(drawn, 0);
    assert.equal(renderer.of('fillRect').length, 0);
});

test('an object with no drawing component costs no transform', () => {
    const renderer = recordingRenderer();
    const logic = new Object('Logic');
    logic.addComponent(new Transform(10, 10));

    const drawn = new SceneRenderer(renderer).render(sceneWith(logic));

    assert.equal(drawn, 0);
    assert.equal(renderer.of('setTransform').length, 0);
    assert.equal(renderer.of('save').length, 0);
});

test('a disabled component does not draw', () => {
    const renderer = recordingRenderer();
    const object = new Object('Box');
    object.addComponent(new Transform());
    const rectangle = object.addComponent(new RectangleRenderer());
    rectangle.active = false;

    new SceneRenderer(renderer).render(sceneWith(object));

    assert.equal(renderer.of('fillRect').length, 0);
});

test('the renderer knows nothing about component types', () => {
    // Four different components, one uniform call. No instanceof anywhere.
    const renderer = recordingRenderer();
    const objects = [
        [new RectangleRenderer(2, 2)],
        [new Tilemap(8, 1, 1, [1], [null, '#fff'])],
        [new ParticleSystem({ rate: 0 })]
    ].map(([component], index) => {
        const object = new Object(`Object${index}`);
        object.addComponent(new Transform());
        object.addComponent(component);
        return object;
    });

    const drawn = new SceneRenderer(renderer).render(sceneWith(...objects));

    assert.equal(drawn, 3);
    assert.equal(renderer.of('fillRect').length, 2, 'rectangle and tilemap both filled');
});

test('a failing draw is isolated and reported', () => {
    const renderer = recordingRenderer();
    const reports = [];
    const thrown = new Error('bad draw');
    class Broken {
        static type = 'Broken';
        draw() { throw thrown; }
    }
    const broken = new Object('Broken');
    broken.addComponent(new Transform());
    const component = broken.addComponent(new Broken());
    const healthy = new Object('Healthy');
    healthy.addComponent(new Transform());
    healthy.addComponent(new RectangleRenderer());

    new SceneRenderer(renderer, { onError: report => reports.push(report) })
        .render(sceneWith(broken, healthy));

    assert.equal(reports.length, 1);
    assert.equal(reports[0].error, thrown, 'the original Error, untouched');
    assert.equal(reports[0].object, broken);
    assert.equal(reports[0].component, component);
    assert.equal(reports[0].type, 'Broken');
    assert.equal(reports[0].phase, 'draw');
    assert.equal(renderer.of('fillRect').length, 1, 'the healthy object still drew');
});

test('a scene renderer with no clock reports an unknown time', () => {
    // Drawing has no clock of its own; a runtime lends it one (ADR-0012).
    const reports = [];
    class Broken {
        static type = 'Broken';
        draw() { throw new Error('bad draw'); }
    }
    const object = new Object('Broken');
    object.addComponent(new Transform());
    object.addComponent(new Broken());

    new SceneRenderer(recordingRenderer(), { onError: report => reports.push(report) })
        .render(sceneWith(object));
    assert.equal(reports[0].time, null);

    reports.length = 0;
    new SceneRenderer(recordingRenderer(), {
        onError: report => reports.push(report),
        time: () => 1.5
    }).render(sceneWith(object));
    assert.equal(reports[0].time, 1.5);
});

test('transform state is balanced', () => {
    const renderer = recordingRenderer();
    const objects = [0, 1, 2].map(index => {
        const object = new Object(`Object${index}`);
        object.addComponent(new Transform());
        object.addComponent(new RectangleRenderer());
        return object;
    });

    new SceneRenderer(renderer).render(sceneWith(...objects));

    assert.equal(renderer.of('save').length, renderer.of('restore').length);
});

// --- components -----------------------------------------------------------------

test('RectangleRenderer draws centred and reports bounds', () => {
    const renderer = recordingRenderer();
    const rectangle = new RectangleRenderer(10, 4);
    rectangle.draw(null, renderer);

    assert.deepEqual(renderer.of('fillRect')[0].args.slice(0, 4), [-5, -2, 10, 4]);
    assert.deepEqual(rectangle.bounds(null), { x: -5, y: -2, width: 10, height: 4 });
});

test('RectangleRenderer can stroke instead of filling', () => {
    const renderer = recordingRenderer();
    new RectangleRenderer(10, 4, '#fff', 1, false).draw(null, renderer);

    assert.equal(renderer.of('fillRect').length, 0);
    assert.equal(renderer.of('strokeRect').length, 1);
});

test('Sprite draws nothing until its image is resolved', () => {
    const renderer = recordingRenderer();
    const sprite = new Sprite('hero.png', 16, 16);

    sprite.draw(null, renderer);
    assert.equal(renderer.of('drawImage').length, 0);

    sprite.image = { width: 16, height: 16 };
    sprite.draw(null, renderer);
    assert.deepEqual(renderer.of('drawImage')[0].args.slice(1, 5), [-8, -8, 16, 16]);
});

test('Tilemap uses the uniform draw signature', () => {
    // Legacy declared draw(ctx, camera) while the caller passed (self, renderer).
    const renderer = recordingRenderer();
    const tilemap = new Tilemap(8, 2, 2, [1, 0, 0, 2], [null, '#f00', '#0f0']);

    tilemap.draw(null, renderer);

    const fills = renderer.of('fillRect');
    assert.equal(fills.length, 2, 'only the two non-empty cells');
    assert.deepEqual(fills[0].args.slice(0, 4), [0, 0, 8, 8]);
    assert.deepEqual(fills[1].args.slice(0, 4), [8, 8, 8, 8]);
    assert.deepEqual(tilemap.bounds(null), { x: 0, y: 0, width: 16, height: 16 });
});

test('Tilemap reads and writes cells within bounds', () => {
    const tilemap = new Tilemap(8, 2, 2, [0, 0, 0, 0], [null, '#f00']);

    tilemap.set(1, 0, 1);
    assert.equal(tilemap.get(1, 0), 1);
    assert.equal(tilemap.get(5, 5), 0, 'out of bounds reads as empty');
    assert.doesNotThrow(() => tilemap.set(5, 5, 1), 'out of bounds writes are ignored');
});

test('ParticleSystem simulates in update and draws in draw', () => {
    const renderer = recordingRenderer();
    const particles = new ParticleSystem({ rate: 60, lifetime: 1, max: 10 });
    const ctx = { deltaTime: 1 / 60, time: 0 };

    particles.draw(null, renderer);
    assert.equal(renderer.of('fillCircle').length, 0, 'nothing to draw before simulating');

    for (let i = 0; i < 5; i++) particles.update(null, ctx);
    assert.equal(particles.particles.length, 5);

    particles.draw(null, renderer);
    assert.equal(renderer.of('fillCircle').length, 5);
});

test('ParticleSystem respects its maximum', () => {
    const particles = new ParticleSystem({ rate: 1000, lifetime: 10, max: 7 });
    for (let i = 0; i < 50; i++) particles.update(null, { deltaTime: 1 / 60 });

    assert.equal(particles.particles.length, 7);
});

test('particles expire', () => {
    const particles = new ParticleSystem({ rate: 60, lifetime: 0.1, max: 100 });
    for (let i = 0; i < 6; i++) particles.update(null, { deltaTime: 1 / 60 });
    const alive = particles.particles.length;

    particles.emitting = false;
    for (let i = 0; i < 20; i++) particles.update(null, { deltaTime: 1 / 60 });

    assert.ok(alive > 0);
    assert.equal(particles.particles.length, 0);
});

test('particle simulation is deterministic', () => {
    // A replicated runtime cannot use Math.random: the server and every client must
    // reach the same state from the same steps.
    const run = () => {
        const particles = new ParticleSystem({ rate: 60, lifetime: 1, max: 20 });
        for (let i = 0; i < 30; i++) particles.update(null, { deltaTime: 1 / 60 });
        return particles.particles.map(particle => [particle.x, particle.y]);
    };

    assert.deepEqual(run(), run());
});

test('ParticleSystem restores the blend mode it changed', () => {
    const renderer = recordingRenderer();
    const particles = new ParticleSystem({ rate: 60, additive: true });
    particles.update(null, { deltaTime: 1 / 60 });

    particles.draw(null, renderer);

    const modes = renderer.of('setBlendMode').map(call => call.args[0]);
    assert.deepEqual(modes, [BlendMode.ADDITIVE, BlendMode.NORMAL]);
});

// --- Canvas 2D backend -----------------------------------------------------------

test('the Canvas 2D backend satisfies the contract', () => {
    assert.deepEqual(missingOperations(new Canvas2DRenderer(fakeContext())), []);
});

test('the backend disables image smoothing', () => {
    const context = fakeContext();
    new Canvas2DRenderer(context);

    assert.equal(context.imageSmoothingEnabled, false, 'pixel art must stay crisp');
});

test('clear fills when given a colour and erases otherwise', () => {
    const context = fakeContext();
    const renderer = new Canvas2DRenderer(context);

    renderer.clear('#101010');
    assert.equal(context.of('fillRect').length, 1);
    assert.equal(context.of('clearRect').length, 0);

    renderer.clear();
    assert.equal(context.of('clearRect').length, 1);
});

test('setTransform forwards the six matrix components', () => {
    const context = fakeContext();
    new Canvas2DRenderer(context).setTransform(Matrix.compose(3, 4, 0, 2, 5));

    assert.deepEqual(context.of('setTransform').at(-1).args, [2, 0, 0, 5, 3, 4]);
});

test('blend modes map onto composite operations', () => {
    const context = fakeContext();
    const renderer = new Canvas2DRenderer(context);

    renderer.setBlendMode(BlendMode.ADDITIVE);
    assert.equal(context.globalCompositeOperation, 'lighter');

    renderer.setBlendMode(BlendMode.NORMAL);
    assert.equal(context.globalCompositeOperation, 'source-over');

    renderer.setBlendMode('nonsense');
    assert.equal(context.globalCompositeOperation, 'source-over', 'unknown falls back');
});

test('alpha is restored after each primitive', () => {
    const context = fakeContext();
    const renderer = new Canvas2DRenderer(context);

    renderer.fillRect(0, 0, 1, 1, { alpha: 0.25 });
    assert.equal(context.globalAlpha, 1, 'a leaked alpha would tint everything after it');

    renderer.fillCircle(0, 0, 1, { alpha: 0.5 });
    assert.equal(context.globalAlpha, 1);
});

test('drawing a missing image is a no-op', () => {
    const context = fakeContext();
    new Canvas2DRenderer(context).drawImage(null, 0, 0, 10, 10);

    assert.equal(context.of('drawImage').length, 0);
});

test('a negative radius does not reach the context', () => {
    const context = fakeContext();
    new Canvas2DRenderer(context).fillCircle(0, 0, -5);

    assert.equal(context.of('arc')[0].args[2], 0);
});

test('resizing updates the surface', () => {
    const context = fakeContext();
    const renderer = new Canvas2DRenderer(context);

    renderer.resize(640, 360);

    assert.equal(renderer.width, 640);
    assert.equal(context.canvas.width, 640);
    assert.equal(context.imageSmoothingEnabled, false);
});

test('the backend requires a context', () => {
    assert.throws(() => new Canvas2DRenderer(null), TypeError);
});

test('objects sharing a layer draw in canonical order, not in the order they joined', () => {
    // ADR-0035 §3. "What covers what" used to be a fact about a scene's history: the child
    // joined first, so it drew first, and a save-and-reload silently swapped the pair.
    const renderer = recordingRenderer();
    const parent = new Object('Parent');
    const child = new Object('Child');
    for (const object of [parent, child]) {
        object.addComponent(new Transform());
        object.addComponent(new RectangleRenderer());
    }
    parent.getComponent('Transform').x = 10;
    child.getComponent('Transform').x = 5;

    // The child joins FIRST, so the storage disagrees with the tree.
    const scene = sceneWith(child, parent);
    parent.addChild(child);

    new SceneRenderer(renderer).render(scene);

    assert.deepEqual(
        renderer.of('setTransform').map(call => call.args[0].e),
        [10, 15],
        'the parent drew, then the child on top of it at its composed position'
    );
});

test('layer still decides, whatever the tree says', () => {
    // The canonical order is only the tie-break: a child on a lower layer still draws under
    // the parent it hangs from.
    const renderer = recordingRenderer();
    const parent = new Object('Parent', { layer: 10 });
    const child = new Object('Child', { layer: 0 });
    for (const object of [parent, child]) {
        object.addComponent(new Transform());
        object.addComponent(new RectangleRenderer());
    }
    parent.getComponent('Transform').x = 10;
    child.getComponent('Transform').x = 5;

    const scene = sceneWith(parent, child);
    parent.addChild(child);

    new SceneRenderer(renderer).render(scene);

    assert.deepEqual(
        renderer.of('setTransform').map(call => call.args[0].e),
        [15, 10],
        'the child is on layer 0, so it draws first however the tree is shaped'
    );
});
