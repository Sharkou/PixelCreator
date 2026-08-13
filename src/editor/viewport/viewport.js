// <px-viewport> — the scene, drawn by the real runtime.
//
// THERE IS NO EDITOR RENDERER. What draws here is `Runtime`, through `SceneRenderer` and
// the Canvas 2D backend, exactly as a published game would; the Editor supplies a view
// matrix and adds overlays afterwards. A second renderer for the IDE would be a second
// thing to keep true, and the first time the two disagreed the creator would be looking
// at a lie.
//
// The runtime is held here rather than in `editor.js` because `Runtime` takes its
// renderer at construction and the renderer needs a canvas — which this element owns.
// `running` stays false: in edit mode nothing simulates, and `render()` draws all the
// same, so an Inspector edit is visible on the very next frame.
//
// TWO SURFACES. The grid is a canvas of its own, under the scene, because
// `SceneRenderer.render()` opens by clearing. The scene canvas clears transparent and
// the grid shows through, at the cost of one extra context and with nothing added to the
// renderer contract.
//
// THE EDITOR CAMERA IS NOT IN THE SCENE. It is an ordinary Object with a Transform and a
// Camera component (ADR-0013), simply never added — so it does not appear in the
// Hierarchy, is never serialized, and cannot be deleted by accident. Panning and zooming
// write to it directly: moving your own point of view is not an intent to record or to
// replicate, so it produces no Operation (docs/architecture/EDITOR.md).

import { Matrix, createId, worldMatrix, worldPosition } from '../../core/mod.js';
import { Canvas2DRenderer, Runtime, Viewport, screenToWorld, viewMatrix } from '../../runtime/mod.js';
import { PxElement, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { drawGrid, matrixScale } from './grid.js';
import { outline } from './overlay.js';
import { editorBounds, pick } from './picking.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;

/** Device pixels the pointer must travel before a click becomes a drag. */
const DRAG_THRESHOLD = 3;

export class PxViewport extends PxElement {

    static styles = sheet(`
        :host {
            display: block;
            position: relative;
            background: var(--px-bg-0);
            overflow: hidden;
            touch-action: none;
        }

        .surface {
            position: absolute;
            inset: 0;
            cursor: default;
        }

        .surface.panning { cursor: grabbing; }
        .surface.over { cursor: pointer; }
        .surface.moving { cursor: move; }

        canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            display: block;
        }

        .hud {
            position: absolute;
            left: 10px;
            bottom: 8px;
            display: flex;
            gap: 14px;
            pointer-events: none;
            font-family: var(--px-mono);
            font-size: 10px;
            color: var(--px-text-dim);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.7);
        }

        .hint {
            position: absolute;
            right: 10px;
            bottom: 8px;
            pointer-events: none;
            font-size: 10px;
            color: var(--px-text-dim);
            opacity: 0.75;
        }
    `);

    #scene = null;
    #camera = null;
    #selection = null;
    #onError = null;

    #surface = null;
    #gridRenderer = null;
    #sceneRenderer = null;
    #viewport = new Viewport(1, 1);
    #runtime = null;

    #dpr = 1;
    #frame = 0;
    #gridSignature = '';
    #hovered = null;
    #drag = null;
    #pointerWorld = { x: 0, y: 0 };
    #zoomReadout = null;
    #positionReadout = null;

    /**
     * Point the viewport at what it should show.
     *
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene to draw
     * @param {object} context.camera - The Object acting as the editor camera
     * @param {object} context.selection - The Editor selection
     * @param {Function} [context.onError] - Receives runtime ComponentFailure reports
     * @returns {PxViewport} This element
     */
    bind({ scene, camera, selection, onError }) {
        this.#scene = scene;
        this.#camera = camera;
        this.#selection = selection;
        this.#onError = onError ?? null;
        return this;
    }

    /** The runtime drawing this viewport. */
    get runtime() {
        return this.#runtime;
    }

    /** The matrix mapping world space to this surface, device pixels included. */
    get view() {
        return Matrix.compose(0, 0, 0, this.#dpr, this.#dpr)
            .multiply(viewMatrix(this.#camera, this.#viewport));
    }

    connectedCallback() {
        if (!this.#surface) this.#build();

        this.track(this.#selection.observe(() => this.#refreshCursor()));

        const observer = new ResizeObserver(() => this.#resize());
        observer.observe(this);
        this.track(() => observer.disconnect());

        this.#resize();
        this.#frame = requestAnimationFrame(this.#tick);
    }

    disconnectedCallback() {
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        super.disconnectedCallback();
    }

    /**
     * Bring an object into view, and zoom so it comfortably fits.
     * @param {object} object - The object to frame
     */
    focusOn(object) {
        if (!object) return;

        const position = worldPosition(object);
        this.#camera.x = position.x;
        this.#camera.y = position.y;

        const box = editorBounds(object);
        const scale = matrixScale(worldMatrix(object)) || 1;
        const margin = 3;
        const fit = Math.min(
            this.#viewport.width / (box.width * scale * margin),
            this.#viewport.height / (box.height * scale * margin)
        );

        if (globalThis.Number.isFinite(fit) && fit > 0) this.#setZoom(fit);
    }

    /** Put the camera back at the world origin, at 1:1. */
    resetView() {
        this.#camera.x = 0;
        this.#camera.y = 0;
        this.#setZoom(1);
    }

    #build() {
        const grid = el('canvas');
        const scene = el('canvas');

        this.#surface = el('div', {
            class: 'surface',
            onpointerdown: event => this.#onPointerDown(event),
            onpointermove: event => this.#onPointerMove(event),
            onpointerup: event => this.#onPointerUp(event),
            onpointercancel: event => this.#onPointerUp(event),
            onpointerleave: () => this.#onPointerLeave(),
            onwheel: event => this.#onWheel(event),
            oncontextmenu: event => event.preventDefault()
        }, grid, scene);

        this.#zoomReadout = el('span');
        this.#positionReadout = el('span');

        this.shadowRoot.append(
            this.#surface,
            el('div', { class: 'hud' }, this.#zoomReadout, this.#positionReadout),
            el('div', { class: 'hint', textContent: 'drag right or middle to pan · wheel to zoom · F to frame' })
        );

        this.#gridRenderer = new Canvas2DRenderer(grid.getContext('2d'));
        this.#sceneRenderer = new Canvas2DRenderer(scene.getContext('2d', { alpha: true }));
        this.#runtime = new Runtime(this.#scene, {
            renderer: this.#sceneRenderer,
            onError: report => this.#onError?.(report)
        });
        // Edit mode: the scene is drawn every frame but never stepped.
        this.#runtime.running = false;
    }

    #resize() {
        const width = Math.max(1, this.clientWidth);
        const height = Math.max(1, this.clientHeight);

        this.#dpr = globalThis.devicePixelRatio || 1;
        this.#viewport.resize(width, height);

        const deviceWidth = Math.round(width * this.#dpr);
        const deviceHeight = Math.round(height * this.#dpr);
        this.#gridRenderer.resize(deviceWidth, deviceHeight);
        this.#sceneRenderer.resize(deviceWidth, deviceHeight);

        this.#gridSignature = '';
        // Resizing a canvas clears it. Redrawing now rather than waiting for the next
        // animation frame keeps the surface correct even when frames are not running —
        // a background tab, or the instant a window is being dragged to a new size.
        this.#draw();
    }

    #tick = () => {
        this.#frame = requestAnimationFrame(this.#tick);
        this.#draw();
    };

    #draw() {
        const view = this.view;

        // The grid only changes when the point of view does, so it is not redrawn sixty
        // times a second for nothing.
        const signature = `${this.#camera.x}|${this.#camera.y}|${this.#camera.rotation}`
            + `|${this.#camera.getComponent('Camera')?.zoom}|${this.#gridRenderer.width}x${this.#gridRenderer.height}`;
        if (signature !== this.#gridSignature) {
            drawGrid(this.#gridRenderer, view);
            this.#gridSignature = signature;
        }

        this.#runtime.render({ view });

        const selected = this.#selection.object;
        if (this.#hovered && this.#hovered !== selected && this.#scene.has(this.#hovered)) {
            outline(this.#sceneRenderer, view, this.#hovered, { alpha: 0.4, width: 1 });
        }
        if (selected && this.#scene.has(selected)) {
            outline(this.#sceneRenderer, view, selected, { pivot: true });
        }

        this.#zoomReadout.textContent = `${Math.round(this.#zoom() * 100)}%`;
    }

    #onPointerDown(event) {
        this.#surface.setPointerCapture(event.pointerId);

        if (event.button === 1 || event.button === 2) {
            event.preventDefault();
            this.#drag = { mode: 'pan', from: this.#toWorld(event) };
            this.#refreshCursor();
            return;
        }

        if (event.button !== 0) return;

        const world = this.#toWorld(event);
        const hit = pick(this.#scene.objects(), this.view, ...this.#toDevice(event));

        this.#selection.set(hit);
        this.#drag = hit ? this.#beginMove(hit, world, event) : null;
        this.#refreshCursor();
    }

    #onPointerMove(event) {
        const world = this.#toWorld(event);
        this.#pointerWorld = world;
        this.#positionReadout.textContent = `${Math.round(world.x)}, ${Math.round(world.y)}`;

        const drag = this.#drag;

        if (drag?.mode === 'pan') {
            // Panning keeps the world point grabbed at pointerdown under the pointer, so
            // the scene follows the hand exactly at any zoom or rotation.
            this.#camera.x += drag.from.x - world.x;
            this.#camera.y += drag.from.y - world.y;
            this.#pointerWorld = this.#toWorld(event);
            return;
        }

        if (drag?.mode === 'move') {
            const [x, y] = this.#toDevice(event);
            if (!drag.started && Math.hypot(x - drag.fromDevice[0], y - drag.fromDevice[1]) < DRAG_THRESHOLD) return;
            drag.started = true;
            this.#moveTo(drag, world);
            return;
        }

        const hovered = pick(this.#scene.objects(), this.view, ...this.#toDevice(event));
        if (hovered !== this.#hovered) {
            this.#hovered = hovered;
            this.#refreshCursor();
        }
    }

    #onPointerUp(event) {
        if (this.#surface.hasPointerCapture(event.pointerId)) {
            this.#surface.releasePointerCapture(event.pointerId);
        }
        this.#drag = null;
        this.#refreshCursor();
    }

    #onPointerLeave() {
        if (this.#drag) return;
        this.#hovered = null;
        this.#refreshCursor();
    }

    #onWheel(event) {
        event.preventDefault();

        const before = this.#toWorld(event);
        this.#setZoom(this.#zoom() * Math.exp(-event.deltaY * 0.0015));
        const after = this.#toWorld(event);

        // Anchor the zoom on the pointer: whatever was under it stays under it.
        this.#camera.x += before.x - after.x;
        this.#camera.y += before.y - after.y;
    }

    #beginMove(object, world, event) {
        const transform = object.getComponent('Transform');
        if (!transform) return null;

        return {
            mode: 'move',
            started: false,
            transform,
            from: world,
            fromDevice: this.#toDevice(event),
            startX: transform.x,
            startY: transform.y,
            // A drag is one intent, however many frames it spans: every write carries the
            // same batch id, which is what ADR-0008 groups a history entry by.
            batch: createId(),
            // Local values are relative to the parent, so a world-space drag has to be
            // brought back into the parent's frame before it is written.
            toParent: object.parent ? worldMatrix(object.parent).invert() : Matrix.identity()
        };
    }

    #moveTo(drag, world) {
        const moved = drag.toParent.apply(world.x - drag.from.x, world.y - drag.from.y);
        const origin = drag.toParent.apply(0, 0);

        drag.transform.setProperty('x', drag.startX + moved.x - origin.x, { batch: drag.batch });
        drag.transform.setProperty('y', drag.startY + moved.y - origin.y, { batch: drag.batch });
    }

    #zoom() {
        return this.#camera.getComponent('Camera')?.zoom ?? 1;
    }

    #setZoom(zoom) {
        const camera = this.#camera.getComponent('Camera');
        if (camera) camera.zoom = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
    }

    #toDevice(event) {
        const rect = this.#surface.getBoundingClientRect();
        return [(event.clientX - rect.left) * this.#dpr, (event.clientY - rect.top) * this.#dpr];
    }

    #toWorld(event) {
        return screenToWorld(this.view, ...this.#toDevice(event));
    }

    #refreshCursor() {
        const classes = this.#surface.classList;
        classes.toggle('panning', this.#drag?.mode === 'pan');
        classes.toggle('moving', this.#drag?.mode === 'move');
        classes.toggle('over', !this.#drag && this.#hovered !== null);
    }
}

customElements.define('px-viewport', PxViewport);
