import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix } from '../../core/mod.js';
import { Viewport as Surface, viewMatrix } from '../../runtime/mod.js';
import { measureSurface, quantiseCamera, sameSurface } from './surface.js';

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
