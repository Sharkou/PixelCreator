// The default tool: point at things, and move or resize what you pointed at.
//
// ONE TOOL, NOT THREE. `EDITOR.md` sketches `SelectTool`, `MoveTool` and `ResizeTool`,
// and building them as three would mean a creator has to choose a mode before they can
// drag something — which no 2D editor asks. What the sketch is really describing is three
// gestures, and they are distinguished by where the press lands: on a handle it resizes,
// on the shape it moves, on nothing it deselects. The split that earns its keep is the
// one below: the geometry is in `resize.js` and `picking.js`, tested without a canvas,
// and this file is the gesture.
//
// It writes through `setProperty()` with a shared `batch`, so a drag is one intent
// however many frames it spans (ADR-0008), and it rounds to whole units — a pixel-art
// editor placing a sprite at x = 137.4183 is not being precise, it is being unhelpful.

import { createId, worldMatrix } from '../../../core/mod.js';
import { pick } from '../picking.js';
import { HANDLE_REACH, HANDLE_REACH_COARSE, handleAt, handleCursor, handles, outline } from '../overlay.js';
import { beginResize, isResizable, resizeTo } from '../resize.js';

/** Device pixels the pointer must travel before a press becomes a drag. */
const DRAG_THRESHOLD = 3;

export class SelectTool {

    #context;
    #hovered = null;
    #handle = null;
    #drag = null;

    /**
     * Create the tool.
     * @param {object} context - { scene, selection, coarse }
     */
    constructor(context) {
        this.#context = context;
    }

    /** The object under the pointer, or null. */
    get hovered() {
        return this.#hovered;
    }

    /** True while a move or a resize is in progress. */
    get dragging() {
        return this.#drag !== null;
    }

    /**
     * The cursor the viewport should show.
     * @param {object} view - The view matrix in use
     * @returns {string} A CSS cursor
     */
    cursor(view) {
        if (this.#drag?.mode === 'resize') return handleCursor(this.#drag.handle, this.#drag.object, view);
        if (this.#drag) return 'grabbing';
        if (this.#handle) return handleCursor(this.#handle, this.#context.selection.object, view);
        return this.#hovered ? 'grab' : 'default';
    }

    /**
     * Track the pointer without any button held.
     * @param {object} pointer - { device: [x, y], world: {x, y}, view }
     */
    hover(pointer) {
        const selected = this.#context.selection.object;

        // Handles win over everything: they sit on the outline, half of them outside the
        // shape, and a press there must never be read as "select what is behind".
        this.#handle = selected && isResizable(selected)
            ? handleAt(selected, pointer.view, ...pointer.device, this.#reach())
            : null;

        this.#hovered = this.#handle
            ? selected
            : pick(this.#context.scene.objects(), pointer.view, ...pointer.device);
    }

    /**
     * Begin a gesture.
     * @param {object} pointer - { device: [x, y], world: {x, y}, view }
     */
    press(pointer) {
        this.hover(pointer);

        const selection = this.#context.selection;
        const selected = selection.object;

        if (this.#handle && selected) {
            const state = beginResize(selected, this.#handle, pointer.world);
            if (state) {
                this.#drag = { mode: 'resize', object: selected, handle: this.#handle, state, batch: createId(), started: false, from: pointer.device };
                return;
            }
        }

        const hit = this.#hovered;
        selection.set(hit);
        if (!hit) return;

        const transform = hit.getComponent('Transform');
        if (!transform) return;

        this.#drag = {
            mode: 'move',
            object: hit,
            transform,
            batch: createId(),
            started: false,
            from: pointer.device,
            origin: pointer.world,
            startX: transform.x,
            startY: transform.y,
            // Local values are relative to the parent, so a world-space drag has to be
            // brought back into the parent's frame before it is written. Captured now:
            // the parent does not move during the drag, and reading it per frame would
            // measure against a reference that could.
            toParent: hit.parent ? worldMatrix(hit.parent).invert() : null
        };
    }

    /**
     * Continue a gesture, or track the pointer when none is in progress.
     * @param {object} pointer - { device: [x, y], world: {x, y}, view }
     */
    move(pointer) {
        const drag = this.#drag;
        if (!drag) {
            this.hover(pointer);
            return;
        }

        // A click that wobbles by a pixel is a click, not a drag: without this every
        // selection would leave an Operation behind.
        if (!drag.started) {
            const travelled = Math.hypot(pointer.device[0] - drag.from[0], pointer.device[1] - drag.from[1]);
            if (travelled < DRAG_THRESHOLD) return;
            drag.started = true;
        }

        if (drag.mode === 'resize') this.#applyResize(drag, pointer);
        else this.#applyMove(drag, pointer);
    }

    /** End the gesture. */
    release() {
        this.#drag = null;
    }

    /**
     * Draw the selection, the hover hint and the handles.
     * @param {object} renderer - The renderer backend
     * @param {object} view - The view matrix in use
     * @param {object} [options] - Options
     * @param {number} [options.scale] - Device pixels per CSS pixel
     */
    draw(renderer, view, { scale = 1 } = {}) {
        const scene = this.#context.scene;
        const selected = this.#context.selection.object;

        if (this.#hovered && this.#hovered !== selected && scene.has(this.#hovered)) {
            outline(renderer, view, this.#hovered, { alpha: 0.4, width: 1 });
        }

        if (!selected || !scene.has(selected)) return;

        outline(renderer, view, selected, { pivot: true });
        if (isResizable(selected)) {
            handles(renderer, view, selected, { active: this.#drag?.handle ?? this.#handle, scale });
        }
    }

    #applyMove(drag, pointer) {
        const delta = { x: pointer.world.x - drag.origin.x, y: pointer.world.y - drag.origin.y };
        const local = drag.toParent
            ? subtract(drag.toParent.apply(delta.x, delta.y), drag.toParent.apply(0, 0))
            : delta;

        drag.transform.setProperty('x', Math.round(drag.startX + local.x), { batch: drag.batch });
        drag.transform.setProperty('y', Math.round(drag.startY + local.y), { batch: drag.batch });
    }

    #applyResize(drag, pointer) {
        const next = resizeTo(drag.state, pointer.world);

        drag.state.component.setProperty('width', next.width, { batch: drag.batch });
        drag.state.component.setProperty('height', next.height, { batch: drag.batch });
        drag.state.transform.setProperty('x', next.x, { batch: drag.batch });
        drag.state.transform.setProperty('y', next.y, { batch: drag.batch });
    }

    #reach() {
        return this.#context.coarse() ? HANDLE_REACH_COARSE : HANDLE_REACH;
    }
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
