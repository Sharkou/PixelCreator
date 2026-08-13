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
    assert.equal(resizeTo(state, { x: 57.4, y: 0 }).width, 107);
    assert.equal(resizeTo(state, { x: 57.4, y: 0 }, { round: false }).width, 107.4);
});
