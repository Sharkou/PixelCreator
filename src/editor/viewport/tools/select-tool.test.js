// Pointing at things, moving them — and giving up halfway.
//
// NO CANVAS. The tool takes a pointer record and a view matrix and writes through
// `setProperty()`; the geometry it leans on (`picking.js`, `resize.js`) is already tested on
// its own. What is asserted here is the GESTURE: what a press starts, what a release commits,
// and what a cancellation puts back.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { ComponentRegistry, Matrix, Object as SceneObject, Scene, Transform } from '../../../core/mod.js';
import { RectangleRenderer } from '../../../runtime/mod.js';
import { Selection } from '../../selection.js';
import { SelectTool } from './select-tool.js';

const VIEW = Matrix.identity();

function staged() {
    const registry = new ComponentRegistry();
    registry.register(Transform);
    registry.register(RectangleRenderer);

    const scene = new Scene('Level', { registry });
    const object = scene.add(new SceneObject('Crate'));
    object.addComponent(new Transform(100, 50));
    object.addComponent(new RectangleRenderer(40, 40, '#fff'));

    const selection = new Selection();
    const tool = new SelectTool({ scene, selection, coarse: () => false });
    return { scene, object, selection, tool };
}

/** The record the viewport builds, at a world point that is also a device point here. */
const at = (x, y) => ({ device: [x, y], world: { x, y }, surface: { x, y }, view: VIEW, screen: VIEW, coarse: false });

test('a drag moves the object, and a release leaves it there', () => {
    const it = staged();
    const transform = it.object.getComponent('Transform');

    it.tool.press(at(100, 50));
    assert.equal(it.selection.object, it.object, 'the press selects what it grabbed');

    it.tool.move(at(160, 90));
    assert.equal(transform.x, 160);
    assert.equal(transform.y, 90);

    it.tool.release();
    assert.equal(it.tool.dragging, false);
    assert.equal(transform.x, 160, 'a release commits');
});

test('cancelling a move puts the object back where the press found it', () => {
    // ESCAPE MID-DRAG. `release()` was the only way out of a gesture, and it commits — so
    // Escape cleared the selection, the outline went with it, and the object went on
    // following the pointer until it was let go, move and all.
    const it = staged();
    const transform = it.object.getComponent('Transform');

    it.tool.press(at(100, 50));
    it.tool.move(at(160, 90));
    assert.equal(transform.x, 160);

    it.tool.cancel();

    assert.equal(it.tool.dragging, false);
    assert.equal(transform.x, 100, 'exactly where it started');
    assert.equal(transform.y, 50);
});

test('a cancelled drag is one batch, and it says which one', () => {
    // ONE ENTRY, AND THE SHELL IS TOLD WHICH. The putting back belongs to the gesture that
    // asked, so the history holds a single entry that nets to nothing — and the batch is
    // answered so the host can drop that entry rather than leave `Ctrl Z` to spend itself on
    // it (editor/history.js).
    const it = staged();
    const batches = new globalThis.Set();
    it.scene.operations.on('operation', operation => batches.add(operation.batch));

    it.tool.press(at(100, 50));
    it.tool.move(at(160, 90));
    const abandoned = it.tool.cancel();

    assert.equal(batches.size, 1, 'the putting back belongs to the gesture that asked');
    assert.equal(batches.has(abandoned), true, 'and that is the batch it reports');
});

test('cancelling a press that never travelled writes nothing at all', () => {
    const it = staged();
    const seen = [];
    it.scene.operations.on('operation', operation => seen.push(operation));

    it.tool.press(at(100, 50));
    assert.equal(it.tool.cancel(), null, 'nothing was written, so no entry to drop');

    assert.deepEqual(seen, [], 'a click is not a drag, and there is nothing to put back');
    assert.equal(it.selection.object, it.object, 'though it did select');
});

test('cancelling a resize puts back the size and the position together', () => {
    const it = staged();
    const transform = it.object.getComponent('Transform');
    const rectangle = it.object.getComponent('RectangleRenderer');

    it.selection.set(it.object);
    // Press on the bottom-right handle: the corner of a 40x40 rectangle centred on (100, 50).
    it.tool.press(at(120, 70));
    assert.equal(it.tool.dragging, true, 'a handle was grabbed');

    it.tool.move(at(160, 110));
    assert.notEqual(rectangle.width, 40, 'the drag resized it');

    it.tool.cancel();

    assert.equal(rectangle.width, 40);
    assert.equal(rectangle.height, 40);
    assert.equal(transform.x, 100);
    assert.equal(transform.y, 50);
});
