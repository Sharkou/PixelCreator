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
// ONE UNIT IN THE VIEW CHAIN: DEVICE PIXELS. The surface is measured in whole device
// pixels (`surface.js`), the pointer is converted with the true device/CSS ratio, and the
// view matrix is composed so that the centre of the view lands on exactly
// deviceWidth / 2. Composing a rounded CSS size with `devicePixelRatio` is what used to
// put the whole scene half a pixel off its own raster grid on any fractional-DPI display
// — which is most Windows machines.
//
// NOTHING IS DRAWN WHEN NOTHING CHANGED. The frame loop is driven by invalidation, not by
// the clock: the element subscribes to the scene's structure, to every property of every
// object in it, and to its own camera, and asks for a frame when one of them moves. At
// rest it schedules nothing at all. The loop restarts by itself for the one thing that
// genuinely animates without input — the zoom ease — and would run continuously again the
// day `Runtime.running` becomes true, because a simulation does not announce itself.
//
// WHAT THIS FILE DOES AND DOES NOT DO. It owns the surfaces, the view matrix and the
// frame; it routes pointers to a tool and draws what the tool asks for. Every gesture
// lives in `tools/`, and every piece of geometry in `picking.js`, `resize.js`,
// `surface.js` and `grid.js` — which is what stopped this from becoming Legacy's 27 kB
// `handler.js`.

import { Matrix, observe, worldMatrix, worldPosition } from '../../core/mod.js';
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
import { devicePoint, locatePointer, measureSurface, quantiseCamera, sameSurface } from './surface.js';
import { ZOOM_DETENT, clampZoom, notchZoom } from './zoom.js';
import { GUIDE_STYLES, Guides } from './guides.js';
import { frameDelta } from '../transport.js';
import { SelectTool } from './tools/select-tool.js';
import { PanTool } from './tools/pan-tool.js';

/** How much of the remaining zoom distance is covered each frame. */
const ZOOM_EASING = 0.28;

/** Below this relative difference the ease is over; without it, it never quite ends. */
const ZOOM_SETTLED = 0.001;

/** Device pixels a finger may wander and still be a tap rather than a pan. */
const TAP_SLOP = 6;

/**
 * The most simulated time one frame may account for.
 *
 * A quarter of a second: long enough that an ordinary stutter still catches up, short
 * enough that a tab left in the background does not hand back thirty seconds of gap for
 * the clock to run through in one tick (ADR-0029).
 */
const MAX_FRAME_SECONDS = 0.25;

/** The structural events that change what there is to draw, and what to watch. */
const STRUCTURE = ['added', 'removed', 'child:added', 'child:removed', 'component:added', 'component:removed'];

export class Viewport extends Element {

    static styles = sheet(`
        :host {
            display: block;
            position: relative;
            background: var(--px-background);
            overflow: hidden;
            touch-action: none;
        }

        .surface {
            position: absolute;
            inset: 0;
            cursor: default;
            touch-action: none;
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
            left: var(--px-space-3);
            bottom: var(--px-space-2);
            display: flex;
            gap: var(--px-space-3);
            pointer-events: none;
            font-family: var(--px-font-mono);
            font-variant-numeric: tabular-nums;
            font-size: var(--px-text-2xs);
            color: var(--px-text-muted);
        }

        /* THE TOOLS THAT ACT ON THE SCENE, IN THE SCENE. Framing, resetting the view and
           creating an object are all things you do TO the viewport, so they are all in the
           viewport's own group — a creation rail down the far left edge put a column of
           chrome around three buttons and separated them from the surface they act on
           (docs/architecture/EDITOR.md).
           Top right rather than the prototype's bottom right: the readout already sits at
           the foot of the viewport, and the cursor guides label the top and left edges, so
           this is the corner that is actually free. Same anatomy as the prototype's
           .vp-tools otherwise — a small pill of ghost buttons on the panel surface.

           The creation tools arrive through a slot rather than being built here: the drag
           that places an object exactly where it is dropped belongs to <px-toolbar>, and
           this element hosts it without knowing what it does. */
        .actions {
            position: absolute;
            right: var(--px-space-2);
            top: var(--px-space-2);
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
            padding: var(--px-space-0);
            background: var(--px-surface);
            border: 1px solid var(--px-border);
            border-radius: var(--px-radius);
        }

        /* Two kinds of control in one pill: what moves the camera, and what puts something
           in the scene. One hairline says so — the same rule the menu's group headings
           trail off into, at the height of a control rather than of the whole pill, so it
           reads as a join and not as two pills pushed together. */
        .actions .divide {
            width: 1px;
            height: var(--px-control);
            margin: 0 var(--px-space-0);
            background: var(--px-border-subtle);
            flex: 0 0 auto;
        }

        .actions slot[name='tools'] {
            display: flex;
            align-items: center;
            gap: var(--px-space-0);
        }

        ${GUIDE_STYLES}
    `);

    #scene = null;
    #camera = null;
    #selection = null;
    #subject = null;
    #onError = null;
    #behaviors = null;

    #surface = null;
    #gridRenderer = null;
    #sceneRenderer = null;
    #viewport = new Surface(1, 1);
    #runtime = null;
    /** When the last simulated frame was drawn, in `requestAnimationFrame` milliseconds. */
    #lastFrame = 0;
    #guides = null;

    #tool = null;
    #pan = null;

    // The surface, in both units, plus the exact ratio between them. Everything that
    // converts a pointer or places the view reads this and never the DOM.
    #metrics = null;
    #rect = null;
    #ratioQuery = null;

    #frame = 0;
    #dirty = true;
    #gridSignature = '';
    #zoomTarget = null;
    #zoomAnchor = null;
    #zoomReadout = null;
    #zoomShown = '';

    // Active pointers, by id, in client coordinates. Two of them on a touch screen is a
    // pinch; one on empty space is a pan.
    #pointers = new globalThis.Map();
    #gesture = null;
    #pinch = null;
    #tap = null;
    #pending = null;

    /**
     * Point the viewport at what it should show.
     *
     * @param {object} context - Editor context
     * @param {object} context.scene - The scene to draw
     * @param {object} context.camera - The Object acting as the editor camera
     * @param {object} context.selection - The Editor selection, read to draw the outline
     * @param {object} [context.subject] - Where a selection INTENT is announced (ADR-0032)
     * @param {Function} [context.onError] - Receives runtime ComponentFailure reports
     * @param {object} [context.behaviors] - The `.px` graphs bound to component types
     * @returns {Viewport} This element
     */
    bind({ scene, camera, selection, subject = null, onError, behaviors = null }) {
        this.#scene = scene;
        this.#camera = camera;
        this.#selection = selection;
        this.#subject = subject;
        this.#onError = onError ?? null;
        // THE RUNTIME THAT DRAWS IS THE RUNTIME THAT PLAYS (ADR-0029 §1), so the graphs
        // have to reach it here: there is no second engine to hand them to. It is bound
        // rather than constructed because the host owns the Project that resolves a graph
        // and this element owns the canvas a Runtime needs (ADR-0015, ADR-0020).
        this.#behaviors = behaviors;

        // TWO ROLES, AND THEY ARE NOT THE SAME OBJECT. `selection` is READ — the outline,
        // the handles and the cursor all ask it what is selected. `subject` is WRITTEN, and
        // it is the only way this surface says what the creator is now working on: a click
        // on bare canvas has to reach the Project panel's tile too, and only an announced
        // intention does that (ADR-0032).
        this.#tool = new SelectTool({
            scene,
            selection,
            subject,
            coarse: () => globalThis.matchMedia?.('(pointer: coarse)').matches ?? false
        });
        this.#pan = new PanTool(camera);
        return this;
    }

    /** The runtime drawing this viewport. */
    get runtime() {
        return this.#runtime;
    }

    /**
     * Ask for a frame.
     *
     * THE LOOP IS DEMAND-DRIVEN, and that is why this exists. A frame is scheduled when
     * something the Viewport WATCHES changes — a property, the camera, the structure of
     * the scene. `Runtime.running` is none of those: it is a flag on an object this
     * element owns but does not observe, so starting the simulation used to set it and
     * then wait for a frame nobody was going to ask for. The transport says "go" once,
     * and the running branch of the tick keeps asking from there (ADR-0029).
     *
     * @returns {void}
     */
    wake() {
        this.#invalidate();
    }

    /**
     * The matrix mapping world space to this surface, in device pixels.
     *
     * The scale is the measured device/CSS ratio, not `devicePixelRatio`: composed with
     * the runtime's view matrix it puts the centre of the view at exactly half the
     * backing store, whatever rounding the browser did on the way.
     */
    get view() {
        const metrics = this.#metrics;
        if (!metrics) return viewMatrix(this.#camera, this.#viewport);
        return Matrix.compose(0, 0, 0, metrics.scaleX, metrics.scaleY)
            .multiply(viewMatrix(this.#camera, this.#viewport));
    }

    connectedCallback() {
        if (!this.#surface) this.#build();

        this.track(this.#selection.observe(() => {
            this.#refreshCursor();
            this.#invalidate();
        }));

        // Whole device pixels when the browser can report them. The option throws where
        // it is unknown, so the plain observation is the fallback and `surface.js`
        // estimates from the fractional CSS box instead.
        const observer = new ResizeObserver(entries => this.#resize(entries[entries.length - 1]));
        try {
            observer.observe(this, { box: 'device-pixel-content-box' });
        } catch {
            observer.observe(this);
        }
        this.track(() => observer.disconnect());

        for (const event of STRUCTURE) {
            this.track(this.#scene.on(event, () => {
                this.#watch();
                this.#invalidate();
            }));
        }

        this.#watch();
        this.#watchRatio();
        this.#resize();
        this.#invalidate();
    }

    disconnectedCallback() {
        cancelAnimationFrame(this.#frame);
        this.#frame = 0;
        this.#ratioQuery?.();
        this.#ratioQuery = null;
        super.disconnectedCallback();
    }

    /**
     * Whether a page coordinate falls on the scene.
     * @param {number} clientX - Horizontal page coordinate
     * @param {number} clientY - Vertical page coordinate
     * @returns {boolean} True when inside
     */
    containsClient(clientX, clientY) {
        const rect = this.#bounds();
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
        return screenToWorld(this.view, ...this.#toDevice(clientX, clientY));
    }

    /**
     * Where a page coordinate is, in the two spaces a running game reads (ADR-0038).
     *
     * THE VIEWPORT ANSWERS THIS BECAUSE THE VIEWPORT IS WHAT KNOWS. Zoom, pan, the device
     * ratio and the camera are all here, and none of them may reach the Runtime — so the
     * pointer adapter asks this and writes the ANSWER into the input state, rather than
     * being handed a camera it would have to understand (`editor/input.js`).
     *
     * `worldAt()` answers the same question for a drop, in one space. This answers both,
     * because the input state holds both, and computing the screen half a second time in
     * the adapter is the duplication `locatePointer()` exists to prevent.
     *
     * @param {number} clientX - Horizontal page coordinate
     * @param {number} clientY - Vertical page coordinate
     * @returns {{screenX: number, screenY: number, worldX: number, worldY: number}} Both spaces
     */
    locate(clientX, clientY) {
        return locatePointer(clientX, clientY, {
            rect: this.#bounds(),
            metrics: this.#metrics,
            view: this.view
        });
    }

    /**
     * The world point at the middle of the view.
     * @returns {{x: number, y: number}} The world point
     */
    worldCentre() {
        // Two other windows call this to place a new object, and one of them can do it
        // before the first measurement has landed.
        const metrics = this.#metrics ?? { deviceWidth: 1, deviceHeight: 1 };
        return screenToWorld(this.view, metrics.deviceWidth / 2, metrics.deviceHeight / 2);
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
        this.#invalidate();
    }

    /** Put the camera back at the world origin, at 1:1. */
    resetView() {
        this.#camera.x = 0;
        this.#camera.y = 0;
        this.#aimZoom(ZOOM_DETENT, null);
        this.#invalidate();
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
                }, icon('focus', 16)),
                el('button', {
                    class: 'ghost',
                    type: 'button',
                    title: 'Reset view',
                    'aria-label': 'Reset view',
                    onclick: () => this.resetView()
                }, icon('grid', 16)),
                el('div', { class: 'divide' }),
                el('slot', { name: 'tools' })
            )
        );

        this.#gridRenderer = new Canvas2DRenderer(grid.getContext('2d'));
        this.#sceneRenderer = new Canvas2DRenderer(scene.getContext('2d', { alpha: true }));
        this.#runtime = new Runtime(this.#scene, {
            renderer: this.#sceneRenderer,
            onError: report => this.#onError?.(report),
            behaviors: this.#behaviors ?? undefined
        });
        // Edit mode: the scene is drawn every frame but never stepped.
        this.#runtime.running = false;
    }

    /* ── surface ─────────────────────────────────────────────────────────── */

    #resize(entry = null) {
        this.#rect = this.#surface.getBoundingClientRect();
        const metrics = measureSurface(entry, this.#rect, globalThis.devicePixelRatio || 1);

        // Resizing a canvas clears it, so a resize that changed nothing is a frame thrown
        // away — and ResizeObserver fires for changes that leave the device box alone.
        if (sameSurface(metrics, this.#metrics)) return;
        this.#metrics = metrics;

        // The runtime's Viewport keeps the CSS size, so `zoom` still means CSS pixels per
        // world unit and 100% still means 100%. The device scale is applied above it.
        this.#viewport.resize(metrics.cssWidth, metrics.cssHeight);
        this.#gridRenderer.resize(metrics.deviceWidth, metrics.deviceHeight);
        this.#sceneRenderer.resize(metrics.deviceWidth, metrics.deviceHeight);

        this.#gridSignature = '';
        this.#invalidate();
    }

    /**
     * Re-arm a listener for the next change of devicePixelRatio.
     *
     * There is no event for it. A media query on the current ratio stops matching the
     * moment it changes — moving the window to another monitor, or zooming the browser —
     * and has to be replaced with one for the new ratio.
     */
    #watchRatio() {
        this.#ratioQuery?.();
        this.#ratioQuery = null;

        const ratio = globalThis.devicePixelRatio || 1;
        const query = globalThis.matchMedia?.(`(resolution: ${ratio}dppx)`);
        if (!query?.addEventListener) return;

        const onChange = () => {
            this.#resize();
            this.#watchRatio();
        };
        query.addEventListener('change', onChange, { once: true });
        this.#ratioQuery = () => query.removeEventListener('change', onChange);
    }

    #bounds() {
        if (!this.#rect) this.#rect = this.#surface.getBoundingClientRect();
        return this.#rect;
    }

    #toDevice(clientX, clientY) {
        return devicePoint(clientX, clientY, this.#bounds(), this.#metrics);
    }

    /* ── frame loop ──────────────────────────────────────────────────────── */

    /** Ask for a frame. Cheap, idempotent, and the only way anything gets drawn. */
    #invalidate() {
        this.#dirty = true;
        if (!this.#frame) this.#frame = requestAnimationFrame(this.#tick);
    }

    /**
     * Subscribe to everything that changes what the viewport shows.
     *
     * Every property of every object and of every component, plus the camera. The
     * Property System already publishes a wildcard observer, so this is a subscription
     * and not a poll — and rebuilding it on a structural change is what keeps a newly
     * created object drawn without the Inspector having to tell anyone.
     */
    #watch() {
        this.release('watch');
        const invalidate = () => this.#invalidate();

        this.track(observe(this.#camera, invalidate), 'watch');
        const lens = this.#camera.getComponent('Camera');
        if (lens) this.track(observe(lens, invalidate), 'watch');

        for (const object of this.#scene.objects()) {
            this.track(observe(object, invalidate), 'watch');
            const components = object.components;
            for (const type of globalThis.Object.keys(components)) {
                this.track(observe(components[type], invalidate), 'watch');
            }
        }
    }

    #tick = timestamp => {
        this.#frame = 0;

        this.#flushPointer();
        if (this.#easeZoom()) this.#invalidate();

        // THE LOOP LIVES HERE, AND THAT IS WHY THE TRANSPORT DOES NOT NEED ONE (ADR-0029).
        // This element already owns the only `requestAnimationFrame` in the Editor, so a
        // running simulation is one call added to a tick that was happening anyway — not a
        // second loop to keep in step with this one.
        //
        // The elapsed time is CLAMPED. A tab in the background stops getting frames, and
        // returning to it hands over a gap of several seconds; `Clock.advance()` would
        // faithfully catch every fixed step up, which is a scene lurching forward half a
        // minute the moment a creator looks back at it. Its own step cap covers the same
        // ground, and this makes the intent visible at the call site.
        if (this.#runtime?.running) {
            const now = typeof timestamp === 'number' ? timestamp : performance.now();
            const elapsed = frameDelta(now, this.#lastFrame, MAX_FRAME_SECONDS);
            this.#lastFrame = now;
            this.#runtime.advance(elapsed);
            this.#invalidate();
        } else {
            this.#lastFrame = 0;
        }

        if (!this.#dirty) return;
        this.#dirty = false;
        this.#draw();
    };

    #draw() {
        const view = this.view;
        const metrics = this.#metrics;
        const density = metrics?.scaleX ?? 1;

        // The grid only changes when the point of view does, so it is not rebuilt for
        // nothing on a frame that only moved an object.
        const signature = `${this.#camera.x}|${this.#camera.y}|${this.#camera.rotationX}`
            + `|${this.#zoom()}|${this.#gridRenderer.width}x${this.#gridRenderer.height}`;
        if (signature !== this.#gridSignature) {
            // THE COLOURS COME FROM THE TOKENS, so the scene's grid and the graph's are
            // the same three values rather than two sets that happen to look alike
            // (ui/styles.js). Read here rather than in `drawGrid()`, which draws through
            // the renderer contract and must stay free of the DOM.
            drawGrid(this.#gridRenderer, view, { density, ...gridColours(this) });
            this.#gridSignature = signature;
        }

        this.#runtime.render({ view });
        this.#tool.draw(this.#sceneRenderer, view, { scale: density });

        const zoom = `${Math.round(this.#zoom() * 100)}%`;
        if (zoom !== this.#zoomShown) {
            this.#zoomReadout.textContent = zoom;
            this.#zoomShown = zoom;
        }
    }

    /* ── pointers ────────────────────────────────────────────────────────── */

    #onPointerDown(event) {
        this.#surface.setPointerCapture(event.pointerId);
        // A gesture is the one moment the cached rectangle is worth re-reading: a splitter
        // drag or a hidden panel moves the viewport without resizing it.
        this.#rect = this.#surface.getBoundingClientRect();

        this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });

        const touch = event.pointerType === 'touch';

        // Two fingers is a pinch, whatever the first one had started.
        if (touch && this.#pointers.size === 2) {
            event.preventDefault();
            this.#abandonGesture();
            this.#beginPinch();
            this.#refreshCursor();
            return;
        }
        if (this.#pointers.size > 2) return;

        // Middle or right: move the point of view. Both, because a trackpad has no middle
        // button and a mouse user reaches for it out of habit.
        if (!touch && (event.button === 1 || event.button === 2)) {
            event.preventDefault();
            this.#gesture = 'pan';
            this.#pan.press(this.#pointer(event));
            this.#refreshCursor();
            return;
        }

        if (event.button !== 0) return;

        const pointer = this.#pointer(event);

        // A finger has no second button, so a press on empty space is how you pan. It is
        // still one tool and three gestures: what is under the pointer decides, and a
        // press that did not travel is still a tap that deselects.
        if (touch && !this.#tool.wouldGrab(pointer)) {
            event.preventDefault();
            this.#gesture = 'pan';
            this.#tap = { x: event.clientX, y: event.clientY };
            this.#pan.press(pointer);
            this.#refreshCursor();
            return;
        }

        this.#gesture = 'tool';
        this.#tool.press(pointer);
        this.#refreshCursor();
        this.#invalidate();
    }

    #onPointerMove(event) {
        if (this.#pointers.has(event.pointerId)) {
            this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
        }

        // Kept, not processed. A high-polling mouse fires several hundred times a second
        // and every one of them would invert a matrix, hit-test the scene and write two
        // properties; there is no point doing that more than once per frame, and doing it
        // once per frame is also what makes a drag one Operation per frame as documented.
        this.#pending = { clientX: event.clientX, clientY: event.clientY, pointerType: event.pointerType };
        this.#invalidate();
    }

    #flushPointer() {
        const pending = this.#pending;
        if (!pending) return;
        this.#pending = null;

        if (this.#gesture === 'pinch') {
            this.#movePinch();
        } else if (this.#gesture === 'pan') {
            this.#pan.move(this.#pointerAt(pending.clientX, pending.clientY, pending.pointerType));
            this.#snapCamera();
        } else {
            this.#tool.move(this.#pointerAt(pending.clientX, pending.clientY, pending.pointerType));
        }

        const rect = this.#bounds();
        this.#guides.update(
            pending.clientX - rect.left,
            pending.clientY - rect.top,
            screenToWorld(this.view, ...this.#toDevice(pending.clientX, pending.clientY))
        );
        this.#refreshCursor();
    }

    #onPointerUp(event) {
        // Whatever was still pending belongs to this gesture, not to the next frame.
        this.#flushPointer();

        if (this.#surface.hasPointerCapture(event.pointerId)) {
            this.#surface.releasePointerCapture(event.pointerId);
        }
        this.#pointers.delete(event.pointerId);

        if (this.#gesture === 'pinch') {
            // The surviving finger keeps panning rather than jumping the view.
            this.#pinch = null;
            this.#gesture = this.#pointers.size === 1 ? 'pan' : null;
            if (this.#gesture === 'pan') {
                const [remaining] = [...this.#pointers.values()];
                this.#pan.press(this.#pointerAt(remaining.x, remaining.y, 'touch'));
            }
            this.#refreshCursor();
            this.#invalidate();
            return;
        }

        if (this.#gesture === 'pan') {
            this.#pan.release();
            this.#snapCamera();
            // A finger that pressed empty space and did not travel meant "deselect".
            if (this.#tap && Math.hypot(event.clientX - this.#tap.x, event.clientY - this.#tap.y) <= TAP_SLOP) {
                this.#clearSubject();
            }
        }

        this.#tap = null;
        this.#gesture = null;
        this.#tool.release();
        this.#refreshCursor();
        this.#invalidate();
    }

    /** Announce "working on nothing", so every panel drops its subject (ADR-0032). */
    #clearSubject() {
        if (this.#subject) this.#subject.clear();
        else this.#selection.clear();
    }

    #onPointerLeave() {
        this.#guides.hide();
        this.#invalidate();
    }

    #abandonGesture() {
        if (this.#gesture === 'pan') this.#pan.release();
        if (this.#gesture === 'tool') this.#tool.release();
        this.#tap = null;
        this.#gesture = null;
    }

    /* ── zoom ────────────────────────────────────────────────────────────── */

    #onWheel(event) {
        event.preventDefault();

        const device = this.#toDevice(event.clientX, event.clientY);
        // Aimed from where the zoom is going, not from where it is: turning the wheel
        // three notches quickly must add up rather than fight the ease already running.
        const from = this.#zoomTarget ?? this.#zoom();

        // The anchor is captured in world coordinates and held until the ease is over.
        // Re-reading it each frame would chase the very value the ease is changing.
        this.#aimZoom(notchZoom(from, event.deltaY), {
            device,
            world: screenToWorld(this.view, ...device)
        });
        this.#invalidate();
    }

    #beginPinch() {
        const [a, b] = [...this.#pointers.values()];
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;

        // A pinch is already continuous, so it drives the zoom directly and cancels any
        // ease that was running — easing a gesture that is itself the animation is what
        // makes a pinch feel like it is fighting back.
        this.#zoomTarget = null;
        this.#zoomAnchor = null;

        this.#gesture = 'pinch';
        this.#pinch = {
            distance: Math.hypot(a.x - b.x, a.y - b.y),
            zoom: this.#zoom(),
            world: this.worldAt(midX, midY)
        };
    }

    #movePinch() {
        const pinch = this.#pinch;
        if (!pinch || this.#pointers.size < 2 || !(pinch.distance > 0)) return;

        const [a, b] = [...this.#pointers.values()];
        const distance = Math.hypot(a.x - b.x, a.y - b.y);
        if (!(distance > 0)) return;

        const lens = this.#camera.getComponent('Camera');
        if (!lens) return;

        lens.zoom = clampZoom(pinch.zoom * (distance / pinch.distance));

        // Exactly the anchoring the wheel uses: whatever was between the fingers stays
        // between the fingers, which is also what makes the pinch pan for free.
        const midX = (a.x + b.x) / 2;
        const midY = (a.y + b.y) / 2;
        const now = screenToWorld(this.view, ...this.#toDevice(midX, midY));
        this.#camera.x += pinch.world.x - now.x;
        this.#camera.y += pinch.world.y - now.y;
    }

    #aimZoom(zoom, anchor) {
        this.#zoomTarget = clampZoom(zoom);
        this.#zoomAnchor = anchor;
    }

    /**
     * Advance the zoom ease by one frame.
     * @returns {boolean} True while the ease still owes another frame
     */
    #easeZoom() {
        if (this.#zoomTarget === null) return false;

        const camera = this.#camera.getComponent('Camera');
        if (!camera) {
            this.#zoomTarget = null;
            return false;
        }

        const remaining = this.#zoomTarget - camera.zoom;
        let settled = false;
        if (Math.abs(remaining) <= this.#zoomTarget * ZOOM_SETTLED) {
            camera.zoom = this.#zoomTarget;
            this.#zoomTarget = null;
            settled = true;
        } else {
            camera.zoom += remaining * ZOOM_EASING;
        }

        // Whatever was under the pointer stays under the pointer, on every frame of the
        // ease and not only at its end.
        const anchor = this.#zoomAnchor;
        if (anchor) {
            const now = screenToWorld(this.view, ...anchor.device);
            this.#camera.x += anchor.world.x - now.x;
            this.#camera.y += anchor.world.y - now.y;
        }

        if (settled) {
            this.#zoomAnchor = null;
            // Snapped once the motion is over, never during it: a step is one device
            // pixel, which is invisible at rest and would be a stutter mid-ease.
            this.#snapCamera();
            return false;
        }
        return true;
    }

    #zoom() {
        return this.#camera.getComponent('Camera')?.zoom ?? 1;
    }

    /**
     * Put the point of view back on the device pixel grid.
     *
     * The camera is the Editor's own Object, never serialized and never replicated, so
     * this changes nothing the Runtime owns and no object moves (ADR-0013).
     */
    #snapCamera() {
        const snapped = quantiseCamera(this.#camera.x, this.#camera.y, matrixScale(this.view));
        if (snapped.x !== this.#camera.x) this.#camera.x = snapped.x;
        if (snapped.y !== this.#camera.y) this.#camera.y = snapped.y;
    }

    /* ── plumbing ────────────────────────────────────────────────────────── */

    #pointer(event) {
        return this.#pointerAt(event.clientX, event.clientY, event.pointerType);
    }

    #pointerAt(clientX, clientY, pointerType) {
        const device = this.#toDevice(clientX, clientY);
        const view = this.view;
        return {
            device,
            view,
            world: screenToWorld(view, ...device),
            coarse: pointerType === 'touch'
        };
    }

    #refreshCursor() {
        const cursor = this.#gesture === 'pan' || this.#gesture === 'pinch'
            ? this.#pan.cursor()
            : this.#tool.cursor(this.view);
        if (this.#surface.style.cursor !== cursor) this.#surface.style.cursor = cursor;
    }
}

customElements.define('px-viewport', Viewport);

/**
 * The grid's three roles, as the theme currently defines them.
 *
 * @param {HTMLElement} element - Anything inside the shell, for the cascade
 * @returns {{background: string, minor: string, major: string, axis: string}} The colours
 */
function gridColours(element) {
    const style = getComputedStyle(element);
    const token = (name, fallback) => style.getPropertyValue(name).trim() || fallback;

    return {
        background: token('--px-grid-background', '#131418'),
        minor: token('--px-grid-minor', '#1c1e24'),
        major: token('--px-grid-major', '#24272f'),
        axis: token('--px-grid-axis', '#343945')
    };
}

