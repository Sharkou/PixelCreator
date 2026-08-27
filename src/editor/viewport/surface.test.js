import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Object as SceneObject, Transform } from '../../core/mod.js';
import { Camera, Viewport as Surface, viewMatrix } from '../../runtime/mod.js';
import { devicePoint, locatePointer, measureSurface, quantiseCamera, sameSurface } from './surface.js';

/** A ResizeObserverEntry as the browser reports one. */
function entry({ css, device }) {
    return {
        contentBoxSize: css ? [{ inlineSize: css[0], blockSize: css[1] }] : undefined,
        devicePixelContentBoxSize: device ? [{ inlineSize: device[0], blockSize: device[1] }] : undefined
    };
}

test('device pixels are taken from the browser when it reports them', () => {
    const metrics = measureSurface(entry({ css: [450.6, 300.2], device: [563, 375] }), null, 1.25);

    assert.equal(metrics.deviceWidth, 563, 'not round(450.6 x 1.25) = 563 by luck, but the reported value');
    assert.equal(metrics.deviceHeight, 375);
    assert.equal(metrics.cssWidth, 450.6, 'the CSS size stays fractional');
});

test('without the device box, the fractional CSS size is used — never a rounded one', () => {
    const metrics = measureSurface(entry({ css: [450.6, 300.2] }), null, 1.25);

    assert.equal(metrics.cssWidth, 450.6);
    assert.equal(metrics.deviceWidth, Math.round(450.6 * 1.25));
    assert.notEqual(metrics.deviceWidth, Math.round(451 * 1.25),
        'rounding the CSS size first is the bug this replaces');
});

test('the element rectangle is the last resort', () => {
    const metrics = measureSurface(null, { width: 800, height: 600 }, 2);

    assert.equal(metrics.cssWidth, 800);
    assert.equal(metrics.deviceWidth, 1600);
    assert.equal(metrics.scaleX, 2);
});

test('a surface is never zero, so a matrix built from it stays invertible', () => {
    const metrics = measureSurface(null, { width: 0, height: 0 }, 1);

    assert.equal(metrics.deviceWidth, 1);
    assert.equal(metrics.deviceHeight, 1);
    assert.ok(globalThis.Number.isFinite(metrics.scaleX));
});

test('the scale is the true device/CSS ratio, not devicePixelRatio', () => {
    // 451 device pixels for 450.6 CSS pixels is not 1.25, and using 1.25 is what put the
    // centre of the view half a pixel away from the centre of the backing store.
    const metrics = measureSurface(entry({ css: [450.6, 300], device: [563, 375] }), null, 1.25);

    assert.notEqual(metrics.scaleX, 1.25);
    assert.equal(metrics.scaleX, 563 / 450.6);
});

test('the centre of the view lands exactly on half the backing store', () => {
    for (const [css, device] of [[450.6, 563], [451, 564], [800, 800], [1279.5, 2559]]) {
        const metrics = measureSurface(entry({ css: [css, css], device: [device, device] }), null, 1.25);
        const surface = new Surface(metrics.cssWidth, metrics.cssHeight);

        const view = Matrix.compose(0, 0, 0, metrics.scaleX, metrics.scaleY)
            .multiply(viewMatrix(null, surface));

        assert.equal(view.e, device / 2, `css ${css}: horizontal centre is off the raster grid`);
        assert.equal(view.f, device / 2, `css ${css}: vertical centre is off the raster grid`);
    }
});

test('two measurements of the same surface compare equal', () => {
    const a = measureSurface(entry({ css: [800, 600], device: [1600, 1200] }), null, 2);
    const b = measureSurface(entry({ css: [800, 600], device: [1600, 1200] }), null, 2);
    const c = measureSurface(entry({ css: [800, 601], device: [1600, 1202] }), null, 2);

    assert.equal(sameSurface(a, b), true, 'resizing a canvas clears it; an equal resize is a lost frame');
    assert.equal(sameSurface(a, c), false);
    assert.equal(sameSurface(a, null), false);
});

test('the camera snaps to whole device pixels once a unit is worth one', () => {
    assert.deepEqual(quantiseCamera(137.4183, -20.6, 1), { x: 137, y: -21 });
    // At four device pixels per world unit the step is a quarter of a unit, which is
    // what keeps a zoomed-in view crisp without the camera visibly jumping.
    assert.deepEqual(quantiseCamera(137.4183, 0, 4), { x: 137.5, y: 0 });
    assert.deepEqual(quantiseCamera(137.1, 0, 4), { x: 137, y: 0 });
});

test('snapping is idempotent, so it cannot drift a camera it already fixed', () => {
    const once = quantiseCamera(137.4183, -20.6, 4);
    const twice = quantiseCamera(once.x, once.y, 4);

    assert.deepEqual(twice, once);
});

test('the camera is left alone below one device pixel per world unit', () => {
    // At zoom 0.05 a step would be twenty world units, so snapping would be a visible
    // stutter — and nothing is crisp at that scale anyway.
    assert.deepEqual(quantiseCamera(137.4183, -20.6, 0.05), { x: 137.4183, y: -20.6 });
    assert.deepEqual(quantiseCamera(137.4183, -20.6, NaN), { x: 137.4183, y: -20.6 });
});

// --- where a pointer actually is (ADR-0038) ---------------------------------------------
//
// THE PART OF THE POINTER PATH THAT NO SCREENSHOT CHECKS. An adapter that shipped
// `clientX/clientY` straight to the Runtime would look perfectly fine on a viewport that
// happened to sit at the top left of an unzoomed, uncentred window — and would be wrong by
// hundreds of units the moment anyone panned. So the conversion is checked here against the
// very matrices the renderer draws with.

/** A camera Object at a place, with a lens, as the Editor holds one. */
function camera({ x = 0, y = 0, zoom = 1 } = {}) {
    const object = new SceneObject('Editor Camera');
    object.addComponent(new Transform(x, y));
    if (zoom !== 1) object.addComponent(new Camera(zoom));
    return object;
}

/** The three things the Viewport hands `locatePointer()`. */
function viewport({ rect, css = [800, 600], device = null, eye = camera() } = {}) {
    const metrics = measureSurface(entry({ css, device: device ?? css }), null, 1);
    const surface = new Surface(metrics.cssWidth, metrics.cssHeight);
    const view = Matrix.compose(0, 0, 0, metrics.scaleX, metrics.scaleY)
        .multiply(viewMatrix(eye, surface));
    return { rect, metrics, view };
}

test('the centre of an unmoved viewport is the world origin', () => {
    const context = viewport({ rect: { left: 0, top: 0 } });

    const at = locatePointer(400, 300, context);

    assert.deepEqual([at.screenX, at.screenY], [400, 300]);
    assert.ok(Math.abs(at.worldX) < 1e-9);
    assert.ok(Math.abs(at.worldY) < 1e-9);
});

test('a page coordinate is not a world coordinate, and the surface offset is why', () => {
    // THE TEST THE WHOLE FILE IS FOR. The viewport starts 240 px into the page because the
    // Hierarchy is to its left; shipping clientX would put every click 240 units off.
    const context = viewport({ rect: { left: 240, top: 56 } });

    const at = locatePointer(640, 356, context);

    assert.deepEqual([at.screenX, at.screenY], [400, 300], 'screen is measured from the surface');
    assert.ok(Math.abs(at.worldX) < 1e-9, 'the centre of the surface is still the origin');
    assert.ok(Math.abs(at.worldY) < 1e-9);
    assert.notEqual(at.worldX, 640, 'clientX is not a world coordinate');
});

test('panning the camera moves what a fixed pointer is over', () => {
    const context = viewport({ rect: { left: 240, top: 56 }, eye: camera({ x: 100, y: -50 }) });

    const at = locatePointer(640, 356, context);

    assert.ok(Math.abs(at.worldX - 100) < 1e-9, 'the centre now looks at the camera');
    assert.ok(Math.abs(at.worldY + 50) < 1e-9);
    assert.deepEqual([at.screenX, at.screenY], [400, 300], 'and the screen point did not move');
});

test('zooming in makes a pointer travel fewer world units', () => {
    const plain = viewport({ rect: { left: 0, top: 0 } });
    const close = viewport({ rect: { left: 0, top: 0 }, eye: camera({ zoom: 2 }) });

    const far = locatePointer(600, 300, plain);
    const near = locatePointer(600, 300, close);

    assert.ok(Math.abs(far.worldX - 200) < 1e-9, '200 CSS px right of centre is 200 units');
    assert.ok(Math.abs(near.worldX - 100) < 1e-9, 'at zoom 2 the same pixels are half the world');
    assert.equal(far.screenX, near.screenX, 'the screen point is the same either way');
});

test('a pan and a zoom together compose, rather than one winning', () => {
    const context = viewport({
        rect: { left: 240, top: 56 },
        eye: camera({ x: 100, y: -50, zoom: 2 })
    });

    const at = locatePointer(640 + 200, 356 + 100, context);

    assert.ok(Math.abs(at.worldX - 200) < 1e-9, '100 + 200/2');
    assert.ok(Math.abs(at.worldY - 0) < 1e-9, '-50 + 100/2');
});

test('a retina backing store changes no world coordinate, and no screen one', () => {
    // The device ratio is a fact about the canvas, not about the game: the same click must
    // read the same numbers on both displays, or a `.px` would behave differently per screen.
    const plain = viewport({ rect: { left: 240, top: 56 }, css: [800, 600] });
    const retina = viewport({ rect: { left: 240, top: 56 }, css: [800, 600], device: [1600, 1200] });

    const one = locatePointer(840, 256, plain);
    const two = locatePointer(840, 256, retina);

    assert.equal(retina.metrics.scaleX, 2, 'the surfaces really do differ');
    assert.deepEqual([one.screenX, one.screenY], [two.screenX, two.screenY]);
    assert.ok(Math.abs(one.worldX - two.worldX) < 1e-9);
    assert.ok(Math.abs(one.worldY - two.worldY) < 1e-9);
});

test('the device point is the one the canvas is drawn in, and it does follow the ratio', () => {
    // The other half of the statement above: the device step exists, it is just not what
    // leaves this file for the Runtime.
    const rect = { left: 240, top: 56 };

    assert.deepEqual(devicePoint(840, 256, rect, { scaleX: 1, scaleY: 1 }), [600, 200]);
    assert.deepEqual(devicePoint(840, 256, rect, { scaleX: 2, scaleY: 2 }), [1200, 400]);
    assert.deepEqual(devicePoint(840, 256, rect, null), [600, 200], 'unmeasured is one to one');
});
