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
//
// WHAT THIS FILE DOES AND DOES NOT DO. It owns the surfaces, the view matrix and the
// frame; it routes pointers to a tool and draws what the tool asks for. Every gesture
// lives in `tools/`, and every piece of geometry in `picking.js`, `resize.js` and
// `grid.js` — which is what stopped this from becoming Legacy's 27 kB `handler.js`.

import { Matrix, worldMatrix, worldPosition } from '../../core/mod.js';
// The runtime's Viewport — the screen rectangle — is aliased, because this element is
// also called Viewport. Two different things with one good name: the runtime's is the
// surface being drawn into, this one is the window a creator looks through.
import {
    Canvas2DRenderer,
    Runtime,
    Viewport as Surface,
    screenToWorld,
    viewMatrix
} from '../../runtime/mod.js';
import { Element, el } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon } from '../ui/icons.js';
import { drawGrid, matrixScale } from './grid.js';
import { editorBounds } from './picking.js';
import { GUIDE_STYLES, Guides } from './guides.js';
import { SelectTool } from './tools/select-tool.js';
import { PanTool } from './tools/pan-tool.js';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 40;

/** How much of the remaining zoom distance is covered each frame. */
const ZOOM_EASING = 0.28;

/** Below this relative difference the ease is over; without it, it never quite ends. */
const ZOOM_SETTLED = 0.001;

export class Viewport extends Element {

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

        canvas {
            position: absolute;
            inset: 0;
            width: 100%;
            height: 100%;
            display: block;
        }

        .readout {
            position: absolute;
            left: 10px;
            bottom: 8px;
            display: flex;
            gap: 12px;
            pointer-events: none;
            font-family: var(--px-mono);
            font-size: 10px;
            color: var(--px-text-dim);
            text-shadow: 0 1px 2px rgba(0, 0, 0, 0.75);
        }

        .actions {
            position: absolute;
            right: 8px;
            bottom: 8px;
            display: flex;
            gap: 2px;
        }

        .actions .ghost {
            background: rgba(20, 20, 23, 0.72);
            backdrop-filter: blur(3px);
        }

        ${GUIDE_STYLES}
    `);

    #scene = null;
    #camera = null;
    #selection = null;
    #onError = null;

    #surface = null;
    #gridRenderer = null;
    #sceneRenderer = null;
    #viewport = new Surface(1, 1);
    #runtime = null;
    #guides = null;

    #tool = null;
    #pan = null;
    #panning = false;

    #dpr = 1;
    #frame = 0;
    #gridSignature = '';
    #zoomTarget = null;
    #zoomAnchor = null;
    #zoomReadout = null;

    /**
     * Point the viewport at what it should show.
     *
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene to draw
     * @param {object} context.camera - The Object acting as the editor camera
     * @param {object} context.selection - The Editor selection
     * @param {Function} [context.onError] - Receives runtime ComponentFailure reports
     * @returns {Viewport} This element
     */
    bind({ scene, camera, selection, onError }) {
        this.#scene = scene;
        this.#camera = camera;
        this.#selection = selection;
        this.#onError = onError ?? null;

        this.#tool = new SelectTool({
            scene,
            selection,
            coarse: () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false
        });
        this.#pan = new PanTool(camera);
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
     * Whether a page coordinate falls on the scene.
     * @param {number} clientX - Horizontal page coordinate
     * @param {number} clientY - Vertical page coordinate
     * @returns {boolean} True when inside
     */
    containsClient(clientX, clientY) {
        const rect = this.#surface.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right
            && clientY >= rect.top && clientY <= rect.bottom;
    }

    /**
     * The world point under a page coordinate.
     *
     * This is what makes "dropped here" mean here: the toolbar hands over where the
     * pointer let go and gets back where that is in the scene.
     *
     * @param {number} clientX - Horizontal page coordinate
     * @param {number} clientY - Vertical page coordinate
     * @returns {{x: number, y: number}} The world point
     */
    worldAt(clientX, clientY) {
        const rect = this.#surface.getBoundingClientRect();
        return screenToWorld(
            this.view,
            (clientX - rect.left) * this.#dpr,
            (clientY - rect.top) * this.#dpr
        );
    }

    /**
     * The world point at the middle of the view.
     * @returns {{x: number, y: number}} The world point
     */
    worldCentre() {
        return screenToWorld(this.view, this.#gridRenderer.width / 2, this.#gridRenderer.height / 2);
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

        // Eased rather than snapped, and without an anchor: the object was just centred,
        // so the zoom settles around it.
        if (globalThis.Number.isFinite(fit) && fit > 0) this.#aimZoom(fit, null);
    }

    /** Put the camera back at the world origin, at 1:1. */
    resetView() {
        this.#camera.x = 0;
        this.#camera.y = 0;
        this.#aimZoom(1, null);
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

        this.#guides = new Guides(this.#surface);
        this.#zoomReadout = el('span', { textContent: '100%' });

        this.shadowRoot.append(
            this.#surface,
            el('div', { class: 'readout' }, this.#zoomReadout),
            el('div', { class: 'actions' },
                el('button', {
                    class: 'ghost',
                    type: 'button',
                    title: 'Frame selection',
                    'aria-label': 'Frame selection',
                    onclick: () => this.focusOn(this.#selection.object)
                }, icon('focus', 14)),
                el('button', {
                    class: 'ghost',
                    type: 'button',
                    title: 'Reset view',
                    'aria-label': 'Reset view',
                    onclick: () => this.resetView()
                }, icon('grid', 14))
            )
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
        this.#easeZoom();
        this.#draw();
    };

    #draw() {
        const view = this.view;

        // The grid only changes when the point of view does, so it is not redrawn sixty
        // times a second for nothing.
        const signature = `${this.#camera.x}|${this.#camera.y}|${this.#camera.rotation}`
            + `|${this.#zoom()}|${this.#gridRenderer.width}x${this.#gridRenderer.height}`;
        if (signature !== this.#gridSignature) {
            drawGrid(this.#gridRenderer, view);
            this.#gridSignature = signature;
        }

        this.#runtime.render({ view });
        this.#tool.draw(this.#sceneRenderer, view, { scale: this.#dpr });

        this.#zoomReadout.textContent = `${Math.round(this.#zoom() * 100)}%`;
    }

    #onPointerDown(event) {
        this.#surface.setPointerCapture(event.pointerId);

        // Middle or right: move the point of view. Both, because a trackpad has no middle
        // button and a mouse user reaches for it out of habit.
        if (event.button === 1 || event.button === 2) {
            event.preventDefault();
            this.#panning = true;
            this.#pan.press(this.#pointer(event));
            this.#refreshCursor();
            return;
        }

        if (event.button !== 0) return;

        this.#tool.press(this.#pointer(event));
        this.#refreshCursor();
    }

    #onPointerMove(event) {
        const pointer = this.#pointer(event);

        if (this.#panning) this.#pan.move(pointer);
        else this.#tool.move(pointer);

        const rect = this.#surface.getBoundingClientRect();
        this.#guides.update(event.clientX - rect.left, event.clientY - rect.top, pointer.world);
        this.#refreshCursor();
    }

    #onPointerUp(event) {
        if (this.#surface.hasPointerCapture(event.pointerId)) {
            this.#surface.releasePointerCapture(event.pointerId);
        }
        if (this.#panning) {
            this.#panning = false;
            this.#pan.release();
        }
        this.#tool.release();
        this.#refreshCursor();
    }

    #onPointerLeave() {
        this.#guides.hide();
    }

    #onWheel(event) {
        event.preventDefault();

        const device = this.#toDevice(event);
        // Aimed from where the zoom is going, not from where it is: turning the wheel
        // three notches quickly must add up rather than fight the ease already running.
        const from = this.#zoomTarget ?? this.#zoom();

        // The anchor is captured in world coordinates and held until the ease is over.
        // Re-reading it each frame would chase the very value the ease is changing.
        this.#aimZoom(from * Math.exp(-event.deltaY * 0.0016), {
            device,
            world: screenToWorld(this.view, ...device)
        });
    }

    #aimZoom(zoom, anchor) {
        this.#zoomTarget = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));
        this.#zoomAnchor = anchor;
    }

    #easeZoom() {
        if (this.#zoomTarget === null) return;

        const camera = this.#camera.getComponent('Camera');
        if (!camera) return;

        const remaining = this.#zoomTarget - camera.zoom;
        if (Math.abs(remaining) <= this.#zoomTarget * ZOOM_SETTLED) {
            camera.zoom = this.#zoomTarget;
            this.#zoomTarget = null;
        } else {
            camera.zoom += remaining * ZOOM_EASING;
        }

        // Whatever was under the pointer stays under the pointer, on every frame of the
        // ease and not only at its end.
        const anchor = this.#zoomAnchor;
        if (!anchor) return;

        const now = screenToWorld(this.view, ...anchor.device);
        this.#camera.x += anchor.world.x - now.x;
        this.#camera.y += anchor.world.y - now.y;

        if (this.#zoomTarget === null) this.#zoomAnchor = null;
    }

    #zoom() {
        return this.#camera.getComponent('Camera')?.zoom ?? 1;
    }

    #pointer(event) {
        const device = this.#toDevice(event);
        const view = this.view;
        return { device, view, world: screenToWorld(view, ...device) };
    }

    #toDevice(event) {
        const rect = this.#surface.getBoundingClientRect();
        return [(event.clientX - rect.left) * this.#dpr, (event.clientY - rect.top) * this.#dpr];
    }

    #refreshCursor() {
        this.#surface.style.cursor = this.#panning
            ? this.#pan.cursor()
            : this.#tool.cursor(this.view);
    }
}

customElements.define('px-viewport', Viewport);
