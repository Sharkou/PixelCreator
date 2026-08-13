// Moving the point of view.
//
// TRANSIENT, NOT SELECTABLE. `EDITOR.md` lists a `PanTool` beside `SelectTool`, and in
// practice nobody switches to a pan mode: they hold the middle or the right button, drag,
// and let go. So this tool is entered by a gesture and left when the button comes up,
// and the select tool never stops being the active one.
//
// Panning writes straight to the camera. Moving your own point of view is not an intent
// to record, replicate or undo, so it produces no Operation — the one place in the Editor
// where a plain assignment is the correct channel (docs/architecture/EDITOR.md).

export class PanTool {

    #camera;
    #from = null;

    /**
     * Create the tool.
     * @param {object} camera - The Object acting as the editor camera
     */
    constructor(camera) {
        this.#camera = camera;
    }

    /** True while the view is being dragged. */
    get dragging() {
        return this.#from !== null;
    }

    /** The cursor the viewport should show. */
    cursor() {
        return 'grabbing';
    }

    /**
     * Grab the world at a point.
     * @param {object} pointer - { world: {x, y} }
     */
    press(pointer) {
        this.#from = pointer.world;
    }

    /**
     * Keep the grabbed world point under the pointer.
     *
     * Expressed as "what I grabbed stays under my finger" rather than as a pixel delta
     * divided by the zoom, so it stays exact at any zoom and under a rotated camera.
     *
     * @param {object} pointer - { world: {x, y} }
     */
    move(pointer) {
        if (!this.#from) return;
        this.#camera.x += this.#from.x - pointer.world.x;
        this.#camera.y += this.#from.y - pointer.world.y;
    }

    /** End the gesture. */
    release() {
        this.#from = null;
    }
}
