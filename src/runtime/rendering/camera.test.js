import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform, Matrix } from '../../core/mod.js';
import { Viewport } from './viewport.js';
import { Camera, viewMatrix, worldToScreen, screenToWorld } from './camera.js';
import { SceneRenderer } from './scene-renderer.js';
import { RectangleRenderer } from './components/rectangle-renderer.js';

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

function cameraObject({ x = 0, y = 0, rotation = 0, zoom = 1 } = {}) {
    const object = new Object('Camera');
    object.addComponent(new Transform(x, y, rotation));
    object.addComponent(new Camera(zoom));
    return object;
}

function near(actual, expected, message) {
    assert.ok(Math.abs(actual - expected) < 1e-9,
        `${message ?? 'value'}: expected ${expected}, got ${actual}`);
}

function nearPoint(actual, expected, message) {
    near(actual.x, expected.x, `${message ?? 'point'} x`);
    near(actual.y, expected.y, `${message ?? 'point'} y`);
}

// --- viewport ---------------------------------------------------------------------

test('a viewport is a screen rectangle with a centre', () => {
    const viewport = new Viewport(800, 600);

    assert.equal(viewport.width, 800);
    assert.equal(viewport.height, 600);
    assert.equal(viewport.centerX, 400);
    assert.equal(viewport.centerY, 300);
});

test('a viewport resizes', () => {
    const viewport = new Viewport(800, 600).resize(320, 180);

    assert.equal(viewport.centerX, 160);
    assert.equal(viewport.centerY, 90);
});

test('a viewport refuses a nonsensical size', () => {
    assert.throws(() => new Viewport(-1, 100), RangeError);
    assert.throws(() => new Viewport(100, NaN), RangeError);
    assert.throws(() => new Viewport(100, Infinity), RangeError);
    assert.throws(() => new Viewport('800', 600), RangeError);
});

test('a viewport tells whether a screen point falls inside it', () => {
    const viewport = new Viewport(800, 600);

    assert.equal(viewport.contains(0, 0), true);
    assert.equal(viewport.contains(800, 600), true);
    assert.equal(viewport.contains(801, 300), false);
    assert.equal(viewport.contains(-1, 300), false);
});

// --- the view matrix --------------------------------------------------------------

test('no camera puts the world origin at the centre of the screen', () => {
    const view = viewMatrix(null, new Viewport(800, 600));

    nearPoint(worldToScreen(view, 0, 0), { x: 400, y: 300 });
    nearPoint(worldToScreen(view, 10, 20), { x: 410, y: 320 });
});

test('a neutral camera sees the world one to one', () => {
    const view = viewMatrix(cameraObject(), new Viewport(800, 600));

    nearPoint(worldToScreen(view, 0, 0), { x: 400, y: 300 }, 'the camera looks at itself');
    nearPoint(worldToScreen(view, 100, -50), { x: 500, y: 250 });
});

test('a camera always sees its own position at the centre of the screen', () => {
    const viewport = new Viewport(800, 600);

    for (const [x, y] of [[0, 0], [100, 50], [-320, 75.5]]) {
        const view = viewMatrix(cameraObject({ x, y }), viewport);
        nearPoint(worldToScreen(view, x, y), { x: 400, y: 300 }, `camera at ${x},${y}`);
    }
});

test('moving the camera moves the world the other way', () => {
    const view = viewMatrix(cameraObject({ x: 100, y: 50 }), new Viewport(800, 600));

    nearPoint(worldToScreen(view, 100, 50), { x: 400, y: 300 });
    nearPoint(worldToScreen(view, 0, 0), { x: 300, y: 250 });
});

test('zoom magnifies about the centre of the screen', () => {
    const viewport = new Viewport(800, 600);

    const zoomedIn = viewMatrix(cameraObject({ zoom: 2 }), viewport);
    nearPoint(worldToScreen(zoomedIn, 0, 0), { x: 400, y: 300 }, 'the centre holds');
    nearPoint(worldToScreen(zoomedIn, 100, 0), { x: 600, y: 300 }, '100 world units read as 200');

    const zoomedOut = viewMatrix(cameraObject({ zoom: 0.5 }), viewport);
    nearPoint(worldToScreen(zoomedOut, 100, 0), { x: 450, y: 300 });
});

test('zoom composes with a moved camera', () => {
    const view = viewMatrix(cameraObject({ x: 100, y: 50, zoom: 2 }), new Viewport(800, 600));

    nearPoint(worldToScreen(view, 100, 50), { x: 400, y: 300 });
    nearPoint(worldToScreen(view, 150, 50), { x: 500, y: 300 });
});

test('an object with no Camera component is a camera with no zoom', () => {
    const plain = new Object('Eye');
    plain.addComponent(new Transform(100, 50));

    const view = viewMatrix(plain, new Viewport(800, 600));

    nearPoint(worldToScreen(view, 100, 50), { x: 400, y: 300 });
    nearPoint(worldToScreen(view, 200, 50), { x: 500, y: 300 }, 'zoom defaults to 1');
});

test('rotating the camera turns the world the other way', () => {
    // A quarter turn: what was to the camera's right appears above the centre.
    const view = viewMatrix(cameraObject({ rotation: Math.PI / 2 }), new Viewport(800, 600));

    nearPoint(worldToScreen(view, 100, 0), { x: 400, y: 200 });
    nearPoint(worldToScreen(view, 0, 100), { x: 500, y: 300 });
});

test('a camera parented to another object follows it', () => {
    // The camera is an ordinary Object, so parenting already means what it should — no
    // follow logic, no second position.
    const player = new Object('Player');
    player.addComponent(new Transform(200, 100));
    const camera = cameraObject({ x: 0, y: -30 });
    player.addChild(camera);

    const view = viewMatrix(camera, new Viewport(800, 600));

    nearPoint(worldToScreen(view, 200, 70), { x: 400, y: 300 }, 'the camera sits at 200,70');
});

test('changing the viewport moves the centre, not the camera', () => {
    const camera = cameraObject({ x: 100, y: 50 });

    const wide = viewMatrix(camera, new Viewport(800, 600));
    const narrow = viewMatrix(camera, new Viewport(320, 180));

    nearPoint(worldToScreen(wide, 100, 50), { x: 400, y: 300 });
    nearPoint(worldToScreen(narrow, 100, 50), { x: 160, y: 90 });
});

// --- screen to world --------------------------------------------------------------

test('the centre of the screen is the camera position', () => {
    const view = viewMatrix(cameraObject({ x: 100, y: 50 }), new Viewport(800, 600));

    nearPoint(screenToWorld(view, 400, 300), { x: 100, y: 50 });
});

test('screen to world undoes zoom', () => {
    const view = viewMatrix(cameraObject({ zoom: 2 }), new Viewport(800, 600));

    nearPoint(screenToWorld(view, 600, 300), { x: 100, y: 0 });
});

test('screen to world undoes rotation', () => {
    const view = viewMatrix(cameraObject({ rotation: Math.PI / 2 }), new Viewport(800, 600));

    nearPoint(screenToWorld(view, 400, 200), { x: 100, y: 0 });
});

test('world to screen and back is the identity', () => {
    // The property the Editor's picking will stand on.
    const viewport = new Viewport(1024, 768);
    const cameras = [
        cameraObject(),
        cameraObject({ x: 137, y: -42 }),
        cameraObject({ zoom: 3.5 }),
        cameraObject({ x: -80, y: 220, rotation: 0.7, zoom: 0.25 })
    ];
    const points = [[0, 0], [10, 10], [-333.25, 187.5], [1e4, -1e4]];

    for (const camera of cameras) {
        const view = viewMatrix(camera, viewport);
        for (const [x, y] of points) {
            const screen = worldToScreen(view, x, y);
            const back = screenToWorld(view, screen.x, screen.y);
            assert.ok(Math.abs(back.x - x) < 1e-6 && Math.abs(back.y - y) < 1e-6,
                `round trip of ${x},${y} came back as ${back.x},${back.y}`);
        }
    }
});

test('a degenerate zoom is rejected where it is written, not where it breaks', () => {
    // A zoom of zero leaves the camera matrix perfectly invertible, so nothing would
    // throw on its own: the view would collapse the scene onto a point and only surface
    // later, inside screenToWorld, naming a matrix nobody wrote.
    const viewport = new Viewport(800, 600);

    for (const zoom of [0, -1, NaN, Infinity]) {
        assert.throws(
            () => viewMatrix(cameraObject({ zoom }), viewport),
            RangeError,
            `zoom ${zoom} should be refused`
        );
    }
});

// --- rendering through a camera ---------------------------------------------------

test('the renderer draws through the camera without knowing what one is', () => {
    const renderer = recordingRenderer();
    const scene = new Scene('Main');
    const box = scene.add(new Object('Box'));
    box.addComponent(new Transform(100, 50));
    box.addComponent(new RectangleRenderer(10, 10));
    const camera = cameraObject({ x: 100, y: 50, zoom: 2 });

    const view = viewMatrix(camera, new Viewport(800, 600));
    new SceneRenderer(renderer).render(scene, { view });

    // The object sits exactly where the camera looks, so it lands on the screen centre.
    const matrix = renderer.of('setTransform')[0].args[0];
    assert.ok(matrix instanceof Matrix);
    near(matrix.e, 400, 'screen x');
    near(matrix.f, 300, 'screen y');
    near(matrix.a, 2, 'zoom reached the backend');
});

test('the camera object is not itself drawn', () => {
    // It carries no drawing component, so the uniform loop simply passes over it.
    const renderer = recordingRenderer();
    const scene = new Scene('Main');
    const camera = scene.add(cameraObject());
    const box = scene.add(new Object('Box'));
    box.addComponent(new Transform());
    box.addComponent(new RectangleRenderer());

    const drawn = new SceneRenderer(renderer).render(scene, {
        view: viewMatrix(camera, new Viewport(800, 600))
    });

    assert.equal(drawn, 1);
});

test('a camera has no position of its own', () => {
    // The whole point of ADR-0013: one position API, the same as every other object.
    const camera = cameraObject({ x: 100, y: 50 });
    const lens = camera.getComponent('Camera');

    assert.equal(camera.x, 100);
    assert.equal(lens.x, undefined);
    assert.equal(lens.y, undefined);
    assert.deepEqual(globalThis.Object.keys(lens), ['zoom']);
});
