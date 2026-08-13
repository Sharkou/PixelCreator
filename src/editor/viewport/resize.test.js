import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Object, Scene, Transform } from '../../core/mod.js';
import { ParticleSystem, RectangleRenderer } from '../../runtime/mod.js';
import { HANDLES, beginResize, isResizable, resizeTo, sizingComponent } from './resize.js';

const handle = id => HANDLES.find(entry => entry.id === id);

function box(scene, { x = 0, y = 0, rotation = 0, width = 100, height = 60 } = {}) {
    const object = new Object('Box');
    object.addComponent(new Transform(x, y, rotation));
    object.addComponent(new RectangleRenderer(width, height));
    return scene.add(object);
}

/** Drag a handle from the edge it sits on to a world point, and report the result. */
function drag(object, id, from, to) {
    const state = beginResize(object, handle(id), from);
    return resizeTo(state, to);
}

test('the sizing component is found by schema, never by name', () => {
    const scene = new Scene('Main');
    const object = box(scene);

    assert.equal(sizingComponent(object), object.getComponent('RectangleRenderer'));
    assert.equal(isResizable(object), true);
});

test('a component without width and height does not make an object resizable', () => {
    const scene = new Scene('Main');
    const object = new Object('Emitter');
    object.addComponent(new Transform());
    object.addComponent(new ParticleSystem());

    assert.equal(sizingComponent(object), null);
    assert.equal(isResizable(object), false);
    assert.equal(beginResize(object, handle('right'), { x: 0, y: 0 }), null);
});

test('dragging the right edge outwards widens and leaves the left edge alone', () => {
    const scene = new Scene('Main');
    const object = box(scene, { width: 100, height: 60 });

    const result = drag(object, 'right', { x: 50, y: 0 }, { x: 70, y: 0 });

    assert.equal(result.width, 120);
    assert.equal(result.height, 60, 'a horizontal handle leaves the other axis untouched');
    assert.equal(result.x, 10, 'centre moved by half the growth');
    assert.equal(result.x - result.width / 2, -50, 'the left edge did not move');
});

test('dragging the left edge outwards widens and leaves the right edge alone', () => {
    const scene = new Scene('Main');
    const object = box(scene, { width: 100, height: 60 });

    const result = drag(object, 'left', { x: -50, y: 0 }, { x: -80, y: 0 });

    assert.equal(result.width, 130);
    assert.equal(result.x, -15);
    assert.equal(result.x + result.width / 2, 50, 'the right edge did not move');
});

test('every handle anchors the edge opposite the one it drags', () => {
    const scene = new Scene('Main');

    for (const entry of HANDLES) {
        const object = box(scene, { width: 100, height: 60 });
        const start = { x: entry.x * 50, y: entry.y * 30 };
        const result = drag(object, entry.id, start, { x: start.x + entry.x * 20, y: start.y + entry.y * 14 });

        if (entry.x !== 0) {
            const anchorBefore = -entry.x * 50;
            assert.equal(result.x - entry.x * result.width / 2, anchorBefore,
                `${entry.id}: the opposite vertical edge moved`);
            assert.equal(result.width, 120, `${entry.id}: unexpected width`);
        } else {
            assert.equal(result.width, 100, `${entry.id}: width changed without a horizontal component`);
        }

        if (entry.y !== 0) {
            const anchorBefore = -entry.y * 30;
            assert.equal(result.y - entry.y * result.height / 2, anchorBefore,
                `${entry.id}: the opposite horizontal edge moved`);
            assert.equal(result.height, 74, `${entry.id}: unexpected height`);
        } else {
            assert.equal(result.height, 60, `${entry.id}: height changed without a vertical component`);
        }

        scene.remove(object);
    }
});

test('dragging an edge past the far side stops rather than inverting', () => {
    const scene = new Scene('Main');
    const object = box(scene, { width: 100, height: 60 });

    const result = drag(object, 'right', { x: 50, y: 0 }, { x: -400, y: 0 });

    assert.ok(result.width >= 1, 'width never goes negative');
    assert.equal(result.height, 60);
});

test('a rotated object resizes along its own axes', () => {
    const scene = new Scene('Main');
    const object = box(scene, { rotation: Math.PI / 2, width: 100, height: 60 });

    // Rotated a quarter turn, the object's local +X points along world +Y.
    const result = drag(object, 'right', { x: 0, y: 50 }, { x: 0, y: 70 });

    assert.equal(result.width, 120, 'the drag was measured in the object\'s frame');
    assert.equal(result.height, 60);
    // The centre shift comes back out in the parent frame, so it lands on y.
    assert.equal(result.x, 0);
    assert.equal(result.y, 10);
});

test('a child resizes in its own frame and writes a local position', () => {
    const scene = new Scene('Main');
    const parent = box(scene, { x: 200, y: 100 });
    const child = box(scene, { x: 30, y: 0, width: 40, height: 40 });
    parent.addChild(child);

    // The child's right edge sits at world x = 200 + 30 + 20.
    const result = drag(child, 'right', { x: 250, y: 100 }, { x: 260, y: 100 });

    assert.equal(result.width, 50);
    assert.equal(result.x, 35, 'written relative to the parent, not to the world');
});

test('a scaled parent does not distort the size written on the child', () => {
    const scene = new Scene('Main');
    const parent = box(scene);
    parent.getComponent('Transform').scaleX = 2;
    const child = box(scene, { width: 40, height: 40 });
    parent.addChild(child);

    // The parent doubles x, so the child's right edge is at world x = 40.
    const result = drag(child, 'right', { x: 40, y: 0 }, { x: 60, y: 0 });

    assert.equal(result.width, 50, '20 world units are 10 local units through a x2 parent');
    assert.equal(result.x, 5);
});

test('results are whole numbers unless asked otherwise', () => {
    const scene = new Scene('Main');
    const object = box(scene, { width: 100, height: 60 });

    const state = beginResize(object, handle('right'), { x: 50, y: 0 });
    // 7.4 units of travel round to an even 8, not to 7: half of the size change is what
    // moves the centre, and half of 7 cannot be written as a whole number.
    assert.equal(resizeTo(state, { x: 57.4, y: 0 }).width, 108);
    assert.equal(resizeTo(state, { x: 57.4, y: 0 }, { round: false }).width, 107.4);
});

test('the anchored edge is exact at every step of a drag, not merely close', () => {
    const scene = new Scene('Main');

    // Both parities, because an odd size puts the edges on half units and that is where
    // the independent rounding of x and width used to lose half a pixel.
    for (const width of [100, 101]) {
        const object = box(scene, { width, height: 60 });
        const edge = -width / 2;
        const state = beginResize(object, handle('right'), { x: width / 2, y: 0 });

        for (let travel = 0; travel <= 20; travel += 0.5) {
            const result = resizeTo(state, { x: width / 2 + travel, y: 0 });
            assert.equal(result.x - result.width / 2, edge,
                `width ${width}, travel ${travel}: the left edge moved`);
            assert.equal(result.width % 2, width % 2, 'the parity of the size is preserved');
            assert.ok(globalThis.Number.isInteger(result.x), 'the position stays whole');
            assert.ok(globalThis.Number.isInteger(result.width), 'the size stays whole');
        }

        scene.remove(object);
    }
});

test('every handle keeps its anchored edge exact for odd sizes too', () => {
    const scene = new Scene('Main');

    for (const entry of HANDLES) {
        const object = box(scene, { width: 101, height: 61 });
        const start = { x: entry.x * 50.5, y: entry.y * 30.5 };
        const result = drag(object, entry.id,
            start, { x: start.x + entry.x * 7.3, y: start.y + entry.y * 5.1 });

        if (entry.x !== 0) {
            assert.equal(result.x - entry.x * result.width / 2, -entry.x * 50.5,
                `${entry.id}: the opposite vertical edge moved`);
        }
        if (entry.y !== 0) {
            assert.equal(result.y - entry.y * result.height / 2, -entry.y * 30.5,
                `${entry.id}: the opposite horizontal edge moved`);
        }

        scene.remove(object);
    }
});

test('the smallest size a drag can reach keeps the parity it started with', () => {
    const scene = new Scene('Main');

    const even = box(scene, { width: 100, height: 60 });
    assert.equal(drag(even, 'right', { x: 50, y: 0 }, { x: -400, y: 0 }).width, 2,
        'an even size cannot collapse to an odd one');
    scene.remove(even);

    const odd = box(scene, { width: 101, height: 61 });
    assert.equal(drag(odd, 'right', { x: 50.5, y: 0 }, { x: -400, y: 0 }).width, 1,
        'an odd size reaches the true minimum');
});

test('a scaled parent keeps the anchored edge exact in world space', () => {
    const scene = new Scene('Main');
    const parent = box(scene);
    parent.getComponent('Transform').scaleX = 2;
    parent.getComponent('Transform').scaleY = 2;
    const child = box(scene, { width: 40, height: 40 });
    parent.addChild(child);

    const state = beginResize(child, handle('right'), { x: 40, y: 0 });
    for (let travel = 0; travel <= 24; travel += 2) {
        const result = resizeTo(state, { x: 40 + travel, y: 0 });
        assert.equal(result.x - result.width / 2, -20, `travel ${travel}: the left edge moved`);
    }
});

test('a rotated object holds its anchored edge to within the unit it is written in', () => {
    const scene = new Scene('Main');
    const object = box(scene, { rotation: Math.PI / 6, width: 100, height: 60 });

    // An integer offset in the object's frame is irrational in the parent's, so writing
    // whole numbers cannot be exact here. What matters is that the error is bounded by
    // the rounding itself and never accumulates.
    const cos = Math.cos(Math.PI / 6);
    const sin = Math.sin(Math.PI / 6);
    const state = beginResize(object, handle('right'), { x: 50 * cos, y: 50 * sin });

    // x and y are each rounded, so the anchored edge can be off by half a unit on both
    // axes at once — but never more, and never cumulatively, because every frame is
    // computed from the state captured when the drag began.
    const budget = Math.hypot(0.5, 0.5);

    for (let travel = 0; travel <= 20; travel += 1) {
        const result = resizeTo(state, { x: (50 + travel) * cos, y: (50 + travel) * sin });
        // The anchored edge sits half a width back along the object's own +X axis.
        const edgeX = result.x - (result.width / 2) * cos;
        const edgeY = result.y - (result.width / 2) * sin;
        const drift = Math.hypot(edgeX - -50 * cos, edgeY - -50 * sin);

        assert.ok(drift <= budget,
            `travel ${travel}: the anchored edge drifted ${drift.toFixed(4)}, past the rounding budget`);
    }
});
