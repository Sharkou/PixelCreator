import { test } from 'node:test';
import assert from 'node:assert/strict';
import { MAX_ZOOM, MIN_ZOOM, ZOOM_DETENT, clampZoom, notchZoom } from './zoom.js';

/** One notch of a typical mouse wheel. Negative deltaY zooms in. */
const OUT = 100;
const IN = -100;

test('a notch multiplies, so the same turn covers the same visual distance everywhere', () => {
    // The ratio of one notch is what must be constant, not its difference.
    const lowRatio = notchZoom(0.2, OUT) / 0.2;
    const highRatio = notchZoom(8, OUT) / 8;

    assert.ok(Math.abs(lowRatio - highRatio) < 1e-12, 'a notch is a factor, not a step');
    assert.ok(lowRatio < 1, 'a positive deltaY pulls back');
    assert.ok(notchZoom(1, IN) > 1, 'a negative deltaY moves closer');
});

test('the zoom stays inside its bounds from either direction', () => {
    let out = 1;
    for (let i = 0; i < 200; i++) out = notchZoom(out, OUT);
    assert.equal(out, MIN_ZOOM);

    let into = 1;
    for (let i = 0; i < 200; i++) into = notchZoom(into, IN);
    assert.equal(into, MAX_ZOOM);
});

// THE REGRESSION. Before the detent, a multiplicative wheel could not produce 1 from an
// arbitrary starting point: sweeping the whole range one notch at a time hit it exactly
// zero times, and the closest approach from a position reached by mixed scrolling was
// 0.990446 — which Math.round(zoom * 100) then printed as "100%".
test('100% is reachable from anywhere, in one notch, from either side', () => {
    const starts = [0.07, 0.2, 0.522255, 0.9, 1.4, 3, 12, 39];

    for (const start of starts) {
        let zoom = start;
        let notches = 0;

        while (zoom !== ZOOM_DETENT && notches < 200) {
            zoom = notchZoom(zoom, zoom > ZOOM_DETENT ? OUT : IN);
            notches++;
        }

        assert.equal(zoom, ZOOM_DETENT, `scrolling towards 100% from ${start} never lands on it`);
    }
});

test('sweeping the whole range one notch at a time passes through exactly 100%', () => {
    let zoom = MIN_ZOOM;
    let hits = 0;

    for (let i = 0; i < 500 && zoom < MAX_ZOOM; i++) {
        zoom = notchZoom(zoom, IN);
        if (zoom === ZOOM_DETENT) hits++;
    }

    assert.equal(hits, 1, 'the detent is passed once on the way through, and only once');
});

test('the detent is a detent and not a trap: the next notch leaves it', () => {
    assert.ok(notchZoom(ZOOM_DETENT, IN) > ZOOM_DETENT);
    assert.ok(notchZoom(ZOOM_DETENT, OUT) < ZOOM_DETENT);
});

test('a notch that does not cross 100% is left exactly alone', () => {
    // Well clear of the detent on both sides: nothing is snapped, nothing is quantised.
    const plain = 4 * Math.exp(-OUT * 0.0016);
    assert.equal(notchZoom(4, OUT), plain);

    const closer = 0.3 * Math.exp(OUT * 0.0016);
    assert.equal(notchZoom(0.3, IN), closer);
});

test('a wheel event that says nothing changes nothing', () => {
    assert.equal(notchZoom(2.5, 0), 2.5);
    assert.equal(notchZoom(2.5, Number.NaN), 2.5);
});

test('clampZoom holds the bounds and refuses a value that is not a number', () => {
    assert.equal(clampZoom(1000), MAX_ZOOM);
    assert.equal(clampZoom(0), MIN_ZOOM);
    assert.equal(clampZoom(-3), MIN_ZOOM);
    assert.equal(clampZoom(Number.NaN), ZOOM_DETENT);
    assert.equal(clampZoom(Number.POSITIVE_INFINITY), ZOOM_DETENT);
    assert.equal(clampZoom(2.5), 2.5);
});

test('a zoom already outside the bounds is brought back before the notch is applied', () => {
    // The viewport aims from the target it is easing towards, which is always clamped;
    // this is the belt to that pair of braces.
    assert.ok(notchZoom(1e9, OUT) <= MAX_ZOOM);
    assert.ok(notchZoom(-1, IN) >= MIN_ZOOM);
});
