// A HUD that stays where it was put, whatever the camera does (ADR-0060 §2, §3).

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
    ComponentRegistry,
    Matrix,
    Object as SceneObject,
    Scene,
    Transform,
    deserializeScene,
    serializeScene
} from '../../core/mod.js';
import { SceneRenderer } from './scene-renderer.js';
import { RectangleRenderer } from './components/rectangle-renderer.js';
import { TextRenderer } from './components/text-renderer.js';
import { registerBuiltIns } from '../builtins.js';
import { DrawSpace, ScreenSpace, drawSpaceOf } from './space.js';

function recordingRenderer() {
    const calls = [];
    const record = name => (...args) => calls.push({ name, args });

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
        drawImage: record('drawImage'),
        imageSize: () => null,
        fillText: record('fillText')
    };
}

function labelAt(x, y, { screen = false, name = 'Label' } = {}) {
    const object = new SceneObject(name);
    object.addComponent(new Transform(x, y));
    object.addComponent(new TextRenderer('Score: 0'));
    if (screen) object.addComponent(new ScreenSpace());
    return object;
}

/** A camera that has moved a long way from the origin. */
const MOVED_CAMERA = Matrix.compose(-900, -400);

// --- the question ---------------------------------------------------------------------

test('an Object with nothing on it is in the world, which is the default', () => {
    assert.equal(drawSpaceOf(labelAt(20, 20)), DrawSpace.WORLD);
});

test('a Screen Space Component puts it on the surface', () => {
    assert.equal(drawSpaceOf(labelAt(20, 20, { screen: true })), DrawSpace.SCREEN);
});

test('switching the Component off puts it back in the world', () => {
    const object = labelAt(20, 20, { screen: true });
    object.getComponent('ScreenSpace').active = false;

    assert.equal(drawSpaceOf(object), DrawSpace.WORLD);
});

test('the space is inherited, because a transform is', () => {
    const scene = new Scene('Main');
    const hud = scene.add(labelAt(0, 0, { screen: true, name: 'HUD' }));
    const child = scene.add(labelAt(20, 20, { name: 'Score' }));
    const grandchild = scene.add(labelAt(0, 24, { name: 'Lives' }));
    hud.addChild(child);
    child.addChild(grandchild);

    assert.equal(drawSpaceOf(child), DrawSpace.SCREEN);
    assert.equal(drawSpaceOf(grandchild), DrawSpace.SCREEN);
});

// --- the drawing -----------------------------------------------------------------------

test('the camera moves the world and leaves the HUD where it was put', () => {
    const scene = new Scene('Main');
    const world = scene.add(labelAt(0, 0, { name: 'Ground' }));
    const hud = scene.add(labelAt(20, 20, { screen: true, name: 'Score' }));

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene, { view: MOVED_CAMERA });

    const [worldMatrix, hudMatrix] = renderer.of('setTransform').map(call => call.args[0]);
    assert.deepEqual([worldMatrix.e, worldMatrix.f], [-900, -400]);
    assert.deepEqual([hudMatrix.e, hudMatrix.f], [20, 20]);
});

test('the screen transform is applied above a HUD, so a 2x display does not halve it', () => {
    const scene = new Scene('Main');
    scene.add(labelAt(20, 20, { screen: true }));

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene, {
        view: MOVED_CAMERA,
        screen: Matrix.compose(0, 0, 0, 2, 2)
    });

    const [matrix] = renderer.of('setTransform').map(call => call.args[0]);
    assert.deepEqual([matrix.e, matrix.f, matrix.a], [40, 40, 2]);
});

test('with no screen matrix given, a HUD is drawn in surface units unchanged', () => {
    const scene = new Scene('Main');
    scene.add(labelAt(20, 20, { screen: true }));

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene, { view: MOVED_CAMERA });

    const [matrix] = renderer.of('setTransform').map(call => call.args[0]);
    assert.deepEqual([matrix.e, matrix.f], [20, 20]);
});

test('every renderer honours it, because the decision belongs to the Object', () => {
    const scene = new Scene('Main');
    const panel = new SceneObject('Panel');
    panel.addComponent(new Transform(8, 8));
    panel.addComponent(new RectangleRenderer(120, 40, '#000000'));
    panel.addComponent(new ScreenSpace());
    scene.add(panel);

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene, { view: MOVED_CAMERA });

    const [matrix] = renderer.of('setTransform').map(call => call.args[0]);
    assert.deepEqual([matrix.e, matrix.f], [8, 8]);
    assert.equal(renderer.of('fillRect').length, 1);
});

test('there is no second draw order: layer still decides what covers what', () => {
    const scene = new Scene('Main');
    const hud = scene.add(labelAt(20, 20, { screen: true, name: 'HUD' }));
    const world = scene.add(labelAt(0, 0, { name: 'Ground' }));
    hud.layer = -5;
    world.layer = 5;

    const renderer = recordingRenderer();
    new SceneRenderer(renderer).render(scene, { view: MOVED_CAMERA });

    // The HUD is on the lower layer, so it is drawn FIRST and the world covers it.
    const [first] = renderer.of('setTransform').map(call => call.args[0]);
    assert.deepEqual([first.e, first.f], [20, 20]);
});

// --- the format -------------------------------------------------------------------------

test('Screen Space survives a save and a load, and carries no values of its own', () => {
    const registry = registerBuiltIns(new ComponentRegistry());
    const scene = new Scene('Main', { registry });
    scene.add(labelAt(20, 20, { screen: true }));

    const reloaded = deserializeScene(serializeScene(scene), { registry });
    const object = reloaded.objects()[0];

    assert.ok(object.hasComponent('ScreenSpace'));
    assert.equal(drawSpaceOf(object), DrawSpace.SCREEN);
    assert.deepEqual(globalThis.Object.keys(ScreenSpace.schema), []);
});
