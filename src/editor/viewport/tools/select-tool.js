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
import {
    HANDLE_REACH,
    HANDLE_REACH_COARSE,
    handleAt,
    handleCursor,
    handles,
    handlesFit,
    outline
} from '../overlay.js';
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
     * @param {object} context - { scene, selection, subject, coarse }
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
     * Whether a press on this point would start a gesture on an object.
     *
     * The viewport asks before deciding what an empty-space press means: on a finger,
     * a press on nothing is how you pan, and there is no second button to reach for.
     *
     * @param {object} pointer - { device: [x, y], world: {x, y}, view, coarse }
     * @returns {boolean} True when a handle or an object is under the pointer
     */
    wouldGrab(pointer) {
        this.hover(pointer);
        return Boolean(this.#handle || this.#hovered);
    }

    /**
     * Track the pointer without any button held.
     * @param {object} pointer - { device: [x, y], world: {x, y}, view }
     */
    hover(pointer) {
        const selected = this.#context.selection.object;
        const reach = this.#reach(pointer);

        // Handles win over everything: they sit on the outline, half of them outside the
        // shape, and a press there must never be read as "select what is behind". That is
        // also why they have to disappear once the object is small on screen — eight
        // reaches of 9 device pixels around a shape 10 pixels wide leave nothing that
        // means "move me", which is exactly how a zoomed-out object became impossible to
        // drag.
        this.#handle = selected && isResizable(selected) && handlesFit(selected, pointer.view, reach)
            ? handleAt(selected, pointer.view, ...pointer.device, reach)
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

        // ANNOUNCED, NOT SET. A press on bare canvas means "I am working on nothing",
        // and that has to reach the Project panel too — writing straight into `Selection`
        // says nothing at all when it was already empty (ADR-0032).
        const hit = this.#hovered;
        if (this.#context.subject) this.#context.subject.object(hit);
        else selection.set(hit);
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

        // `scale` reaches every overlay, not just the handles: an outline, a pivot cross
        // and a handle are one instrument and have to be one size on screen, on a 1x
        // display and on a 2x one alike (../overlay.js).
        if (this.#hovered && this.#hovered !== selected && scene.has(this.#hovered)) {
            outline(renderer, view, this.#hovered, { alpha: 0.4, width: 1, scale });
        }

        if (!selected || !scene.has(selected)) return;

        outline(renderer, view, selected, { pivot: true, scale });
        // Drawn under exactly the condition that makes them grabbable, so a handle is
        // never shown where pressing it would do something else.
        if (isResizable(selected) && handlesFit(selected, view, this.#reach())) {
            handles(renderer, view, selected, { active: this.#drag?.handle ?? this.#handle, scale });
        }
    }

    #applyMove(drag, pointer) {
        const delta = { x: pointer.world.x - drag.origin.x, y: pointer.world.y - drag.origin.y };
        const local = drag.toParent
            ? subtract(drag.toParent.apply(delta.x, delta.y), drag.toParent.apply(0, 0))
            : delta;

        const x = Math.round(drag.startX + local.x);
        const y = Math.round(drag.startY + local.y);

        // A drag rounds to whole units, so most pointer moves land on the value already
        // written. Sending it anyway would mean an Operation per pointer event — up to a
        // thousand a second on a high-polling mouse — for a value that did not change.
        this.#write(drag, drag.transform, 'x', x);
        this.#write(drag, drag.transform, 'y', y);
    }

    #applyResize(drag, pointer) {
        const next = resizeTo(drag.state, pointer.world);

        this.#write(drag, drag.state.component, 'width', next.width);
        this.#write(drag, drag.state.component, 'height', next.height);
        this.#write(drag, drag.state.transform, 'x', next.x);
        this.#write(drag, drag.state.transform, 'y', next.y);
    }

    #write(drag, target, prop, value) {
        if (target[prop] === value) return;
        target.setProperty(prop, value, { batch: drag.batch });
    }

    #reach(pointer = null) {
        // The event knows better than the media query: a hybrid laptop reports a coarse
        // pointer for its screen while a mouse is being used on the very same surface.
        const coarse = pointer?.coarse ?? this.#context.coarse();
        return coarse ? HANDLE_REACH_COARSE : HANDLE_REACH;
    }
}

function subtract(a, b) {
    return { x: a.x - b.x, y: a.y - b.y };
}
