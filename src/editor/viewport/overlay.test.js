import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Matrix, Object, Scene, Transform } from '../../core/mod.js';
import { Viewport as Surface, viewMatrix } from '../../runtime/mod.js';
import { Camera, RectangleRenderer } from '../../runtime/mod.js';
import {
    HANDLE_MIN_REACHES,
    HANDLE_REACH,
    HANDLE_REACH_COARSE,
    handleAt,
    handlePoints,
    handlesFit,
    outline,
    outlinePoints,
    screenSpan
} from './overlay.js';

const surface = new Surface(800, 600);

function scene() {
    return new Scene('Main');
}

function box(target, { x = 0, y = 0, rotation = 0, width = 100, height = 100, scale = 1, scaleY = null } = {}) {
    const object = new Object('Box');
    object.addComponent(new Transform(x, y, rotation, scale, scaleY ?? scale));
    object.addComponent(new RectangleRenderer(width, height));
    return target.add(object);
}

/**
 * A renderer double that records the marks an overlay actually lays down, already
 * converted into the device-pixel rectangle each one covers.
 *
 * That conversion is the whole point of the assertions below: what a creator sees is the
 * mark AFTER the current transform, and the bug being pinned here was a mark whose size
 * came out right in local units and wrong on screen.
 */
function recorder() {
    let transform = Matrix.identity();
    const marks = [];

    return {
        marks,
        width: 800,
        height: 600,
        clear() {},
        save() {},
        restore() {},
        setBlendMode() {},
        setTransform(matrix) { transform = matrix; },
        fillCircle() {},
        drawImage() {},
        strokeRect() {},
        fillRect(x, y, width, height) {
            // The two side lengths of the drawn rectangle, in device pixels.
            const origin = transform.apply(x, y);
            const alongX = transform.apply(x + width, y);
            const alongY = transform.apply(x, y + height);
            marks.push({
                long: Math.hypot(alongX.x - origin.x, alongX.y - origin.y),
                thick: Math.hypot(alongY.x - origin.x, alongY.y - origin.y)
            });
        }
    };
}

/** The thickness of every mark drawn, rounded past floating-point noise. */
function thicknesses(renderer) {
    return renderer.marks.map(mark => Math.round(mark.thick * 1e6) / 1e6);
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


// ── the outline and the pivot are editor UI, not part of the object ─────────
//
// Before this was screen-space, `outline()` set the transform to view x worldMatrix and
// divided a single scalar — sqrt(|det|), the geometric mean of the two axis scales — back
// out of the stroke width. On an object scaled 1 x 4 that compensated by 2 in BOTH
// directions: measured against a 1.5 px target the edges came out 3 px and 0.75 px, and
// the pivot cross 3.5 px across by 14 px down. The cross was being stretched by the object
// it marks.

test('the outline follows the object exactly — shape is not what was wrong', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 40 });
    const corners = outlinePoints(object, viewAt(1));

    // 800 x 600 surface, so the centre of the view is 400, 300.
    assert.deepEqual(corners.map(point => [Math.round(point.x), Math.round(point.y)]), [
        [350, 280], [450, 280], [450, 320], [350, 320]
    ]);
});

test('the outline turns with a rotated object', () => {
    const world = scene();
    const turned = box(world, { rotation: Math.PI / 2, width: 100, height: 40 });
    const corners = outlinePoints(turned, viewAt(1));

    // A quarter turn: the box is 40 wide and 100 tall on screen now.
    const xs = corners.map(point => point.x);
    const ys = corners.map(point => point.y);
    assert.ok(Math.abs((Math.max(...xs) - Math.min(...xs)) - 40) < 1e-9);
    assert.ok(Math.abs((Math.max(...ys) - Math.min(...ys)) - 100) < 1e-9);
});

test('every outline mark is one constant thickness, whatever the object scale', () => {
    const world = scene();
    const view = viewAt(1);

    for (const spec of [{ scale: 1 }, { scale: 3 }, { scale: 0.25 }, { scale: 1, scaleY: 4 }, { scale: 4, scaleY: 1 }]) {
        const object = box(world, { width: 100, height: 100, ...spec });
        const renderer = recorder();
        outline(renderer, view, object, { width: 1.5, scale: 1 });

        assert.equal(renderer.marks.length, 4, 'four edges');
        for (const thick of thicknesses(renderer)) {
            assert.equal(thick, 1.5, `edge thickness under ${JSON.stringify(spec)}`);
        }
    }
});

test('a non-uniform scale no longer stretches the pivot cross', () => {
    const world = scene();
    const stretched = box(world, { width: 100, height: 100, scale: 1, scaleY: 4 });

    const renderer = recorder();
    outline(renderer, viewAt(1), stretched, { width: 1.5, pivot: true, scale: 1 });

    // Four edges, then the two arms of the cross. One arm runs across and the other down,
    // so each is measured as one long side and one thin one — what matters is that the
    // pair is the same for both, which is what "a cross, not a T" means.
    const arms = renderer.marks.slice(4);
    assert.equal(arms.length, 2);

    for (const arm of arms) {
        const [thin, long] = [arm.long, arm.thick].sort((a, b) => a - b);
        assert.equal(Math.round(long), 14, 'the arm spans 2 x PIVOT_ARM');
        assert.equal(Math.round(thin * 1e6) / 1e6, 1.5, 'the arm is one line thick');
    }
});

test('camera zoom moves the outline without thickening it', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });

    for (const zoom of [0.1, 1, 12]) {
        const renderer = recorder();
        outline(renderer, viewAt(zoom), object, { width: 1.5, scale: 1 });
        for (const thick of thicknesses(renderer)) assert.equal(thick, 1.5, `at zoom ${zoom}`);
    }
});

test('display density scales the marks, so a 2x screen is not drawn at half weight', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });

    const renderer = recorder();
    outline(renderer, viewAt(1), object, { width: 1.5, scale: 2 });
    for (const thick of thicknesses(renderer)) assert.equal(thick, 3);
});

test('a view that cannot produce a finite point is refused rather than drawn as NaN', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });
    const broken = new Matrix(Number.NaN, 0, 0, 1, 0, 0);

    assert.equal(outlinePoints(object, broken), null);

    const renderer = recorder();
    outline(renderer, broken, object, { scale: 1 });
    assert.equal(renderer.marks.length, 0, 'nothing is laid down at all');
});

test('a view that collapses the scene to a point draws nothing rather than a smear', () => {
    const world = scene();
    const object = box(world, { width: 100, height: 100 });

    // Every corner lands on the same pixel, so every edge has zero length. The viewport
    // cannot actually produce this — Camera refuses a zoom of zero (runtime/rendering/
    // camera.js) — but a zero-length mark must be skipped, not divided by.
    const collapsed = new Matrix(0, 0, 0, 0, 0, 0);
    assert.deepEqual(outlinePoints(object, collapsed), [
        { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }, { x: 0, y: 0 }
    ]);

    const renderer = recorder();
    outline(renderer, collapsed, object, { pivot: true, scale: 1 });
    assert.equal(renderer.marks.length, 2, 'the four zero-length edges are skipped; the pivot still marks the point');
});
