import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../../core/mod.js';
import { Camera, RectangleRenderer, Viewport, viewMatrix } from '../../runtime/mod.js';
import { HANDLE_SIZE, editorBounds, hitTest, pick } from './picking.js';

/** A component with an extent but nothing to do with collision or rendering. */
class Marker {
    static type = 'Marker';
    constructor(size = 10) { this.size = size; }
    bounds() { return { x: -this.size, y: -this.size, width: this.size * 2, height: this.size * 2 }; }
}

class Logic {
    static type = 'Logic';
    update() {}
}

function place(scene, name, { x = 0, y = 0, rotation = 0, layer = 0, components = [] } = {}) {
    const object = new Object(name, { layer });
    object.addComponent(new Transform(x, y, rotation));
    for (const component of components) object.addComponent(component);
    return scene.add(object);
}

/** The view a 200x100 viewport gives when nothing is looking through it. */
function centredView() {
    return viewMatrix(null, new Viewport(200, 100));
}

test('bounds come from the components that report one', () => {
    const object = new Object('Block');
    object.addComponent(new Transform());
    object.addComponent(new RectangleRenderer(40, 20));

    assert.deepEqual(editorBounds(object), { x: -20, y: -10, width: 40, height: 20 });
});

test('an object with no geometry still has a handle to click', () => {
    const object = new Object('Empty');
    object.addComponent(new Transform());
    object.addComponent(new Logic());

    const box = editorBounds(object);
    assert.equal(box.width, HANDLE_SIZE);
    assert.equal(box.height, HANDLE_SIZE);
    assert.equal(box.x, -HANDLE_SIZE / 2);
});

test('several extents are merged', () => {
    const object = new Object('Composite');
    object.addComponent(new Transform());
    object.addComponent(new RectangleRenderer(40, 20));
    object.addComponent(new Marker(30));

    assert.deepEqual(editorBounds(object), { x: -30, y: -30, width: 60, height: 60 });
});

test('a point on the object hits, a point beside it does not', () => {
    const scene = new Scene('Main');
    const object = place(scene, 'Block', { components: [new RectangleRenderer(40, 20)] });
    const view = centredView();

    assert.equal(hitTest(object, view, 100, 50), true, 'the centre of the screen is the origin');
    assert.equal(hitTest(object, view, 119, 55), true);
    assert.equal(hitTest(object, view, 121, 50), false);
});

test('a rotated object is hit along its own axes, not a screen-aligned box', () => {
    const scene = new Scene('Main');
    const object = place(scene, 'Block', {
        rotation: Math.PI / 4,
        components: [new RectangleRenderer(100, 10)]
    });
    const view = centredView();

    // 30px along the bar's own diagonal direction is inside it; the same distance
    // straight out to the side is not.
    const along = 30 / Math.SQRT2;
    assert.equal(hitTest(object, view, 100 + along, 50 + along), true);
    assert.equal(hitTest(object, view, 100 + along, 50 - along), false);
});

test('a child is hit where its parent puts it', () => {
    const scene = new Scene('Main');
    const parent = place(scene, 'Parent', { x: 50 });
    const child = place(scene, 'Child', { x: 10, components: [new RectangleRenderer(20, 20)] });
    parent.addChild(child);

    const view = centredView();

    assert.equal(hitTest(child, view, 160, 50), true, 'child sits at world x = 60');
    assert.equal(hitTest(child, view, 110, 50), false, 'not at its own local x');
});

test('the zoom is accounted for', () => {
    const scene = new Scene('Main');
    const object = place(scene, 'Block', { components: [new RectangleRenderer(20, 20)] });

    const camera = new Object('Editor Camera');
    camera.addComponent(new Transform());
    camera.addComponent(new Camera(4));
    const zoomed = viewMatrix(camera, new Viewport(200, 100));

    assert.equal(hitTest(object, zoomed, 100 + 39, 50), true, '10 local units become 40 screen pixels');
    assert.equal(hitTest(object, zoomed, 100 + 41, 50), false);
});

test('picking returns the topmost object', () => {
    const scene = new Scene('Main');
    const below = place(scene, 'Below', { layer: 0, components: [new RectangleRenderer(60, 60)] });
    const above = place(scene, 'Above', { layer: 5, components: [new RectangleRenderer(20, 20)] });
    const view = centredView();

    assert.equal(pick(scene.objects(), view, 100, 50), above);
    assert.equal(pick(scene.objects(), view, 125, 50), below, 'outside the top one, the one underneath');
    assert.equal(pick(scene.objects(), view, 180, 50), null);
});

test('hidden, inactive and locked objects are not picked', () => {
    const scene = new Scene('Main');
    const object = place(scene, 'Block', { components: [new RectangleRenderer(40, 40)] });
    const view = centredView();

    object.active = false;
    assert.equal(pick(scene.objects(), view, 100, 50), null);

    object.active = true;
    object.active = false;
    assert.equal(pick(scene.objects(), view, 100, 50), null);

    object.active = true;
    object.lock = true;
    assert.equal(pick(scene.objects(), view, 100, 50), null);

    object.lock = false;
    assert.equal(pick(scene.objects(), view, 100, 50), object);
});

test('selection never depends on a collider', () => {
    const scene = new Scene('Main');
    const object = place(scene, 'Pure logic', { components: [new Logic()] });
    const view = centredView();

    assert.equal(pick(scene.objects(), view, 100, 50), object,
        'an object with no geometry of any kind is still selectable');
});
