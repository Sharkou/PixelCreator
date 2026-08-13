import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../../core/mod.js';
import { Viewport as Surface, viewMatrix } from '../../runtime/mod.js';
import { Camera, RectangleRenderer } from '../../runtime/mod.js';
import {
    HANDLE_MIN_REACHES,
    HANDLE_REACH,
    HANDLE_REACH_COARSE,
    handleAt,
    handlePoints,
    handlesFit,
    screenSpan
} from './overlay.js';

const surface = new Surface(800, 600);

function scene() {
    return new Scene('Main');
}

function box(target, { x = 0, y = 0, rotation = 0, width = 100, height = 100, scale = 1 } = {}) {
    const object = new Object('Box');
    object.addComponent(new Transform(x, y, rotation, scale, scale));
    object.addComponent(new RectangleRenderer(width, height));
    return target.add(object);
}

/** A view at a given zoom, exactly as the viewport composes one. */
function viewAt(zoom) {
    const eye = new Object('Editor Camera');
    eye.addComponent(new Transform());
    eye.addComponent(new Camera(zoom));
    return viewMatrix(eye, surface);
}

test('the screen span is the object as the creator sees it, zoom included', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 40 });

    assert.deepEqual(screenSpan(object, viewAt(1)), { x: 100, y: 40 });
    assert.deepEqual(screenSpan(object, viewAt(0.5)), { x: 50, y: 20 });
    assert.deepEqual(screenSpan(object, viewAt(2)), { x: 200, y: 80 });
});

test('the screen span follows rotation and the object own scale', () => {
    const world = scene();
    const turned = box(world, { rotation: Math.PI / 2, width: 100, height: 40 });
    const span = screenSpan(turned, viewAt(1));

    // A quarter turn swaps which screen direction each side runs along, but the two
    // lengths are what they were: a rotated object is not a smaller one.
    assert.ok(Math.abs(span.x - 100) < 1e-9);
    assert.ok(Math.abs(span.y - 40) < 1e-9);

    const doubled = box(world, { width: 100, height: 40, scale: 2 });
    assert.deepEqual(screenSpan(doubled, viewAt(1)), { x: 200, y: 80 });
});

test('handles are offered while the shorter side spans four reaches', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });

    // 100 world units at zoom 1 is 100 device pixels, and four reaches is 36.
    assert.equal(handlesFit(object, viewAt(1), HANDLE_REACH), true);
    assert.equal(handlesFit(object, viewAt(HANDLE_REACH * HANDLE_MIN_REACHES / 100), HANDLE_REACH), true,
        'exactly at the threshold the handles still fit');
});

test('handles are withdrawn once the object is too small to hold them', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });

    // Zoomed far out, eight reaches of nine pixels would cover a shape ten pixels wide
    // and there would be nothing left that means "move me".
    assert.equal(handlesFit(object, viewAt(0.1), HANDLE_REACH), false);
    assert.equal(handlesFit(object, viewAt(0.05), HANDLE_REACH), false);
});

test('a finger needs a bigger object before handles appear', () => {
    const world = scene();
    const object = box(world, { width: 50, height: 50 });

    // 50 device pixels clears four mouse reaches (36) and not four finger reaches (64).
    assert.equal(handlesFit(object, viewAt(1), HANDLE_REACH), true);
    assert.equal(handlesFit(object, viewAt(1), HANDLE_REACH_COARSE), false);
});

test('a thin object is judged on its shorter side', () => {
    const world = scene();
    const sliver = box(world, { width: 400, height: 12 });

    assert.equal(handlesFit(sliver, viewAt(1), HANDLE_REACH), false,
        'a long thin shape cannot carry handles on its short axis');
});

test('at the threshold, no two handle hit zones overlap', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });
    const zoom = (HANDLE_REACH * HANDLE_MIN_REACHES) / 100;
    const view = viewAt(zoom);

    assert.equal(handlesFit(object, view, HANDLE_REACH), true);

    const points = handlePoints(object, view);
    for (let i = 0; i < points.length; i++) {
        for (let j = i + 1; j < points.length; j++) {
            const distance = Math.hypot(points[i].x - points[j].x, points[i].y - points[j].y);
            assert.ok(distance >= HANDLE_REACH * 2 - 1e-9,
                `${points[i].handle.id} and ${points[j].handle.id} overlap at the threshold`);
        }
    }
});

test('the centre of the object is never claimed by a handle', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });
    const view = viewAt((HANDLE_REACH * HANDLE_MIN_REACHES) / 100);

    // The middle of the shape has to keep meaning "move me", at every size that still
    // shows handles at all.
    assert.equal(handleAt(object, view, 400, 300, HANDLE_REACH), null);
});
