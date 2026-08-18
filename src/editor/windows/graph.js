// <px-graph> — the canvas a `.px` is wired on (ADR-0027).
//
// THE RENDERER, AND ONLY THE RENDERER. The graph is `core/graph/`, the arithmetic is
// `editor/graph/view.js`, and what is left here is: draw what the model says, turn pointer
// events into intents, and ask the model whether an intent is legal. There is no node list,
// no connection list and no position held in this file — Legacy's graph WAS the DOM, and
// that is precisely why closing its tab lost the work (ADR-0009).
//
// SVG, AND THE REASON IS NOT NOSTALGIA. Legacy drew nodes as `<div>`s and wires as SVG
// paths in a second element, so every wire position came from `getBoundingClientRect()` on
// a live node and had to be recomputed on every mouse move — a port could only be located
// while it was on screen. One SVG means one coordinate space: a port's position is
// arithmetic (`view.js`), the same arithmetic that hit-tests it, and zooming is one
// attribute rather than a transform to keep two DOM trees agreeing about.
//
// EVERY EDIT IS AN OPERATION. Dragging a node submits SET_PROPERTY under one batch, so a
// drag across the canvas is one `Ctrl Z`; wiring, unwiring, adding and deleting each go
// through the pipeline the `.px` owns, which is the same pipeline its properties travel
// (ADR-0024). Nothing in this file writes to the model directly.
//
// WHAT IS DELIBERATELY ABSENT. No marquee selection, no multi-select, no copy and paste, no
// node comments, no minimap. Each is a real feature and each is a gesture with its own
// questions; shipping half of one is how a canvas becomes unpredictable. What is here is
// the loop a creator needs to write a behaviour: place, wire, move, inspect, delete.

import { GraphSeverity, groupNodes } from '../../core/mod.js';
import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { icon } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import {
    GRID,
    HEADER_HEIGHT,
    NODE_WIDTH,
    PORT_RADIUS,
    connectionPath,
    fitView,
    hitTest,
    nodeSize,
    placePorts,
    portPosition,
    snap,
    toGraph,
    zoomAt
} from '../graph/view.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** How far a pointer travels before a press on a node becomes a drag. */
const DRAG_THRESHOLD = 3;

export class GraphWindow extends Element {

    static styles = sheet(`
        :host {
            display: block;
            position: relative;
            min-width: 0;
            min-height: 0;
            background: var(--px-background);
        }

        :host([hidden]) { display: none; }

        svg {
            display: block;
            width: 100%;
            height: 100%;
            touch-action: none;
            -webkit-user-select: none;
            user-select: none;
            cursor: default;
        }

        svg.panning { cursor: grabbing; }

        /* ── nodes ─────────────────────────────────────────────────────── */

        .node .box {
            fill: var(--px-surface-raised);
            stroke: var(--px-border);
            stroke-width: 1;
        }

        .node .header { fill: var(--px-surface-active); }
        .node.selected .box { stroke: var(--px-accent); stroke-width: 2; }
        .node.invalid .box { stroke: var(--px-danger); }

        .node .title {
            fill: var(--px-text-strong);
            font-family: var(--px-font-sans);
            font-size: 11px;
            font-weight: var(--px-weight-bold);
            pointer-events: none;
        }

        .node .port-label {
            fill: var(--px-text-muted);
            font-family: var(--px-font-sans);
            font-size: 10px;
            pointer-events: none;
        }

        /* ── ports ─────────────────────────────────────────────────────── */

        /* A FLOW PORT IS A TRIANGLE, A DATA PORT IS A DISC, and the difference is visible
           before a creator has read a word: execution has a direction, a value does not.
           It is also the one rule the canvas enforces, so showing it is not decoration. */
        .port { stroke: var(--px-border); stroke-width: 1; }
        .port.flow { fill: var(--px-text-muted); }
        .port.data { fill: var(--px-surface); }
        .port.connected { fill: var(--px-accent); stroke: var(--px-accent); }
        .port:hover { stroke: var(--px-accent); stroke-width: 2; }

        /* The generous invisible target every port carries, so a 5 px disc is still a
           comfortable thing to aim at with a finger. */
        .port-hit { fill: transparent; cursor: crosshair; }

        /* ── wires ─────────────────────────────────────────────────────── */

        .wire {
            fill: none;
            stroke: var(--px-text-dim);
            stroke-width: 2;
            cursor: pointer;
        }

        .wire.flow { stroke: var(--px-text-muted); }
        .wire:hover { stroke: var(--px-danger); }
        .wire.pending { stroke: var(--px-accent); stroke-dasharray: 4 3; pointer-events: none; }

        /* A wide invisible copy under each wire: two pixels of stroke is not a target. */
        .wire-hit { fill: none; stroke: transparent; stroke-width: 14; cursor: pointer; }

        /* ── chrome ────────────────────────────────────────────────────── */

        .controls {
            position: absolute;
            left: var(--px-space-2);
            top: var(--px-space-2);
            display: flex;
            gap: var(--px-space-0);
            padding: var(--px-space-0);
            border-radius: var(--px-radius);
            background: var(--px-surface-overlay);
            border: 1px solid var(--px-border);
        }

        .status {
            position: absolute;
            right: var(--px-space-2);
            bottom: var(--px-space-2);
            display: flex;
            align-items: center;
            gap: var(--px-space-2);
            max-width: 60%;
            padding: var(--px-space-1) var(--px-space-2);
            border-radius: var(--px-radius);
            background: var(--px-surface-overlay);
            border: 1px solid var(--px-border);
            font-size: var(--px-text-2xs);
            color: var(--px-text-muted);
        }

        .status.problem { color: var(--px-danger); border-color: var(--px-danger); }
        .status[hidden] { display: none; }

        .empty {
            position: absolute;
            inset: 0;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: var(--px-space-2);
            color: var(--px-text-dim);
            font-size: var(--px-text-xs);
            pointer-events: none;
        }

        /* display:flex above beats the browser default for [hidden], so the hint stayed
           on screen over the very nodes it was telling the creator to make. */
        .empty[hidden] { display: none; }
    `);

    #definition = null;
    #framed = null;
    #svg = null;
    #content = null;
    #wires = null;
    #nodesLayer = null;
    #pending = null;
    #status = null;
    #empty = null;
    #grid = null;
    #controls = null;

    #view = { x: 0, y: 0, zoom: 1 };
    #selected = null;
    #drag = null;
    #issues = [];

    /**
     * Point the canvas at a `.px`.
     *
     * @param {object|null} definition - The live ComponentDefinition, or null for nothing
     * @returns {GraphWindow} This element
     */
    bind(definition) {
        if (this.#definition === definition) return this;

        this.release('graph');
        this.#definition = definition;
        this.#selected = null;
        this.#drag = null;

        if (definition) {
            // ONE SUBSCRIPTION, NOT ONE PER NODE. Every edit of this `.px` — a node moving,
            // a wire appearing, a property being renamed under a Set Property — travels the
            // one pipeline it owns, so one listener is the whole of the reactivity here.
            this.track(definition.operations.on('operation', () => this.#draw()), 'graph');
        }

        if (this.isConnected) {
            this.#frame();
            this.#draw();
        }
        return this;
    }

    /** The `.px` this canvas is showing, or null. */
    get definition() {
        return this.#definition;
    }

    /** The node the creator has selected, or null. */
    get selected() {
        return this.#selected ? this.#definition?.graph.node(this.#selected) ?? null : null;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#build();

        globalThis.addEventListener('keydown', this.#onKeyDown);
        this.track(() => globalThis.removeEventListener('keydown', this.#onKeyDown));

        this.#frame();
        this.#draw();
    }

    #build() {
        this.#wires = svg('g');
        this.#nodesLayer = svg('g');
        this.#pending = svg('path', { class: 'wire pending' });
        this.#content = svg('g', {}, this.#wires, this.#pending, this.#nodesLayer);

        // The grid is a pattern rather than a thousand lines: it tiles for free, it scales
        // with the view, and it costs one rect however far a creator pans.
        this.#grid = svg('pattern', {
            id: 'px-graph-grid',
            width: GRID * 4,
            height: GRID * 4,
            patternUnits: 'userSpaceOnUse'
        }, svg('path', {
            d: `M ${GRID * 4} 0 L 0 0 0 ${GRID * 4}`,
            fill: 'none',
            stroke: 'var(--px-border-subtle)',
            'stroke-width': 1
        }));

        const background = svg('rect', {
            width: '100%',
            height: '100%',
            fill: 'url(#px-graph-grid)'
        });

        this.#svg = svg('svg', {}, svg('defs', {}, this.#grid), background, this.#content);

        this.#svg.addEventListener('pointerdown', event => this.#onPointerDown(event));
        this.#svg.addEventListener('pointermove', event => this.#onPointerMove(event));
        this.#svg.addEventListener('pointerup', event => this.#onPointerUp(event));
        this.#svg.addEventListener('pointercancel', () => this.#cancelDrag());
        this.#svg.addEventListener('wheel', event => this.#onWheel(event), { passive: false });
        this.#svg.addEventListener('contextmenu', event => event.preventDefault());

        const add = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Add node',
            'aria-label': 'Add node',
            onclick: () => this.#openNodeMenu(null, add)
        }, icon('plus'));

        const frame = el('button', {
            class: 'ghost',
            type: 'button',
            title: 'Frame all',
            'aria-label': 'Frame all nodes',
            onclick: () => {
                this.#frame(true);
                this.#draw();
            }
        }, icon('focus'));

        this.#controls = el('div', { class: 'controls' }, add, frame);
        this.#status = el('div', { class: 'status', hidden: true });
        this.#empty = el('div', { class: 'empty' },
            el('span', {}, icon('graph', 20)),
            el('span', { textContent: 'Right-click the canvas to add a node.' })
        );

        this.shadowRoot.append(this.#svg, this.#controls, this.#status, this.#empty);
    }

    // --- drawing ---------------------------------------------------------------------

    /**
     * The nodes with the ports they currently have, in model order.
     *
     * Resolved once per draw and passed to the geometry: ports may depend on the node's
     * params (a Set Property takes the shape of the property it names), so nothing may hold
     * a port list across an edit.
     */
    #layout() {
        const graph = this.#definition?.graph;
        if (!graph) return [];
        return graph.nodes().map(node => ({ node, ports: graph.portsOf(node) }));
    }

    #draw() {
        if (!this.#svg) return;

        const graph = this.#definition?.graph;
        this.#controls.hidden = !graph;
        if (!graph) {
            fill(this.#wires);
            fill(this.#nodesLayer);
            this.#empty.hidden = false;
            this.#status.hidden = true;
            return;
        }

        this.#issues = this.#definition.validate();
        const layout = this.#layout();
        const byId = new Map(layout.map(entry => [entry.node.id, entry]));

        const transform = `translate(${this.#view.x} ${this.#view.y}) scale(${this.#view.zoom})`;
        this.#content.setAttribute('transform', transform);
        // THE GRID BELONGS TO THE GRAPH, NOT TO THE SCREEN. The background rect is in
        // screen space — it has to be, it covers the viewport whatever the view — so the
        // pattern carries the view itself. Without this the squares stayed nailed to the
        // panel while the nodes slid over them, which reads as the nodes drifting rather
        // than the canvas moving.
        this.#grid.setAttribute('patternTransform', transform);

        fill(this.#wires, graph.connections().map(connection => this.#drawWire(connection, byId)).filter(Boolean));
        fill(this.#nodesLayer, layout.map(entry => this.#drawNode(entry)));

        this.#empty.hidden = layout.length > 0;
        this.#showStatus();
    }

    #drawWire(connection, byId) {
        const source = byId.get(connection.from.node);
        const target = byId.get(connection.to.node);
        if (!source || !target) return null;

        const from = portPosition(source.node, source.ports, 'out', connection.from.port);
        const to = portPosition(target.node, target.ports, 'in', connection.to.port);
        if (!from || !to) return null;

        const kind = source.ports.outputs.find(port => port.id === connection.from.port)?.kind ?? 'data';
        const d = connectionPath(from, to);

        // The visible wire and its target are two paths, because two pixels of stroke is not
        // something a finger can hit, and a fourteen-pixel visible wire is not a wire.
        const hit = svg('path', { class: 'wire-hit', d });
        hit.addEventListener('pointerdown', event => {
            event.stopPropagation();
            if (event.button !== 0) return;
            this.#definition.graph.disconnect(connection.id);
        });
        hit.append(svg('title', {}, document.createTextNode('Click to disconnect')));

        return svg('g', {}, svg('path', { class: `wire ${kind}`, d }), hit);
    }

    #drawNode({ node, ports }) {
        const size = nodeSize(ports);
        const broken = this.#issues.some(
            issue => issue.node === node.id && issue.severity === GraphSeverity.ERROR
        );
        const label = this.#definition.registry.get(node.type)?.label ?? node.type;

        const classes = ['node'];
        if (node.id === this.#selected) classes.push('selected');
        if (broken) classes.push('invalid');

        const group = svg('g', {
            class: classes.join(' '),
            transform: `translate(${node.x} ${node.y})`,
            'data-node': node.id
        },
            svg('rect', { class: 'box', width: size.width, height: size.height, rx: 6 }),
            svg('path', {
                class: 'header',
                d: `M 0 6 A 6 6 0 0 1 6 0 L ${size.width - 6} 0 A 6 6 0 0 1 ${size.width} 6 `
                    + `L ${size.width} ${HEADER_HEIGHT} L 0 ${HEADER_HEIGHT} Z`
            }),
            svg('text', { class: 'title', x: 10, y: 17 }, document.createTextNode(label))
        );

        for (const placed of placePorts(node, ports)) {
            group.append(...this.#drawPort(node, placed, size));
        }

        return group;
    }

    #drawPort(node, placed, size) {
        const local = { x: placed.x - node.x, y: placed.y - node.y };
        const connected = placed.direction === 'in'
            ? Boolean(this.#definition.graph.incoming(node.id, placed.port.id))
            : this.#definition.graph.outgoing(node.id, placed.port.id).length > 0;

        const classes = `port ${placed.port.kind}${connected ? ' connected' : ''}`;
        const shape = placed.port.kind === 'flow'
            ? svg('path', {
                class: classes,
                d: `M ${local.x - 4} ${local.y - 5} L ${local.x + 5} ${local.y} `
                    + `L ${local.x - 4} ${local.y + 5} Z`
            })
            : svg('circle', { class: classes, cx: local.x, cy: local.y, r: PORT_RADIUS });

        shape.append(svg('title', {}, document.createTextNode(
            `${placed.port.label}${placed.port.kind === 'flow' ? '' : ` (${placed.port.type})`}`
        )));

        const text = svg('text', {
            class: 'port-label',
            x: placed.direction === 'in' ? local.x + 12 : local.x - 12,
            y: local.y + 3,
            'text-anchor': placed.direction === 'in' ? 'start' : 'end'
        }, document.createTextNode(placed.port.label ?? ''));

        const hit = svg('circle', {
            class: 'port-hit',
            cx: local.x,
            cy: local.y,
            r: 11,
            'data-port': placed.port.id,
            'data-direction': placed.direction
        });

        return [shape, text, hit];
    }

    #showStatus() {
        const errors = this.#issues.filter(issue => issue.severity === GraphSeverity.ERROR);
        const shown = errors[0] ?? this.#issues[0] ?? null;

        this.#status.hidden = !shown;
        if (!shown) return;

        // ONE LINE, THE MOST SEVERE, AND THE COUNT. A panel that lists every finding is a
        // console; what a creator needs on the canvas is "something is wrong, here is the
        // first thing" — the node itself is already outlined in red.
        this.#status.classList.toggle('problem', errors.length > 0);
        fill(this.#status,
            el('span', { textContent: shown.message }),
            this.#issues.length > 1
                ? el('span', { textContent: `+${this.#issues.length - 1}` })
                : null
        );
    }

    // --- pointer -----------------------------------------------------------------------

    #onPointerDown(event) {
        if (!this.#definition) return;

        // Middle button, or right button, pans. Left is reserved for the model: a creator
        // must never have to choose a tool to move a node.
        //
        // RIGHT-PRESS IS TWO GESTURES, AND THE POINTER DECIDES WHICH. Held and dragged it
        // pans; pressed and released without travelling it opens the create menu where the
        // pointer is. Deciding on travel rather than on a modifier is what lets one button
        // carry both without either shadowing the other, and it is why the panning cursor
        // only appears once the gesture has actually become a pan.
        if (event.button === 1 || event.button === 2) {
            this.#drag = {
                kind: 'pan',
                x: event.clientX - this.#view.x,
                y: event.clientY - this.#view.y,
                from: { x: event.clientX, y: event.clientY },
                moved: false,
                menu: event.button === 2
            };
            if (!this.#drag.menu) this.#svg.classList.add('panning');
            capture(this.#svg, event.pointerId);
            event.preventDefault();
            return;
        }

        if (event.button !== 0) return;

        const point = this.#pointerAt(event);
        const hit = hitTest(this.#layout(), point);

        if (hit.kind === 'port') {
            this.#drag = {
                kind: 'wire',
                from: { node: hit.node.id, port: hit.port.id },
                direction: hit.direction,
                origin: portPosition(hit.node, this.#definition.graph.portsOf(hit.node), hit.direction, hit.port.id)
            };
            capture(this.#svg, event.pointerId);
            return;
        }

        if (hit.kind === 'node') {
            this.#select(hit.node.id);
            this.#drag = {
                kind: 'node',
                node: hit.node.id,
                offsetX: point.x - hit.node.x,
                offsetY: point.y - hit.node.y,
                start: point,
                moved: false,
                // ONE BATCH FOR THE WHOLE GESTURE, minted here rather than per step: a drag
                // across the canvas is one thing a creator did, so it is one Ctrl Z
                // (ADR-0024 §4).
                batch: `${hit.node.id}:${event.pointerId}:${event.timeStamp}`
            };
            capture(this.#svg, event.pointerId);
            return;
        }

        this.#select(null);
    }

    #onPointerMove(event) {
        const drag = this.#drag;
        if (!drag) return;

        if (drag.kind === 'pan') {
            if (!drag.moved) {
                const travelled = Math.hypot(event.clientX - drag.from.x, event.clientY - drag.from.y);
                // Short enough to still be a click: leave the view alone, so a hand that
                // shakes by a pixel opens the menu instead of nudging the canvas.
                if (travelled < DRAG_THRESHOLD) return;
                drag.moved = true;
                this.#svg.classList.add('panning');
            }
            this.#view = { ...this.#view, x: event.clientX - drag.x, y: event.clientY - drag.y };
            this.#draw();
            return;
        }

        const point = this.#pointerAt(event);

        if (drag.kind === 'wire') {
            // A wire in flight bows the way it will bow once it lands, so the gesture looks
            // like what it produces.
            const d = drag.direction === 'out'
                ? connectionPath(drag.origin, point)
                : connectionPath(point, drag.origin);
            this.#pending.setAttribute('d', d);
            return;
        }

        if (drag.kind === 'node') {
            const travelled = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
            if (!drag.moved && travelled < DRAG_THRESHOLD) return;
            drag.moved = true;

            this.#definition.graph.moveNode(
                drag.node,
                snap(point.x - drag.offsetX),
                snap(point.y - drag.offsetY),
                { batch: drag.batch }
            );
        }
    }

    #onPointerUp(event) {
        const drag = this.#drag;
        if (!drag) return;

        if (drag.kind === 'pan') {
            const opensMenu = drag.menu && !drag.moved;
            this.#cancelDrag(event.pointerId);
            if (opensMenu) this.#openNodeMenu(event);
            return;
        }

        if (drag.kind === 'wire') {
            const hit = hitTest(this.#layout(), this.#pointerAt(event));
            if (hit.kind === 'port' && hit.direction !== drag.direction) {
                const ends = drag.direction === 'out'
                    ? [drag.from, { node: hit.node.id, port: hit.port.id }]
                    : [{ node: hit.node.id, port: hit.port.id }, drag.from];

                const verdict = this.#definition.graph.canConnect(ends[0], ends[1]);
                if (verdict.allowed) this.#definition.graph.connect(ends[0], ends[1]);
                else this.#report(verdict.reason);
            }
        }

        this.#cancelDrag(event.pointerId);
    }

    #cancelDrag(pointerId) {
        this.#pending.removeAttribute('d');
        this.#svg.classList.remove('panning');
        if (pointerId !== undefined && this.#svg.hasPointerCapture?.(pointerId)) {
            this.#svg.releasePointerCapture(pointerId);
        }
        this.#drag = null;
    }

    #onWheel(event) {
        if (!this.#definition) return;
        event.preventDefault();

        const box = this.#svg.getBoundingClientRect();
        const anchor = { x: event.clientX - box.left, y: event.clientY - box.top };
        this.#view = zoomAt(this.#view, event.deltaY < 0 ? 1.1 : 1 / 1.1, anchor);
        this.#draw();
    }

    #onKeyDown = event => {
        if (!this.isConnected || this.hidden || !this.#definition || !this.#selected) return;
        if (event.key !== 'Delete' && event.key !== 'Backspace') return;
        if (isEditing()) return;

        event.preventDefault();
        const removed = this.#selected;
        this.#select(null);
        this.#definition.graph.removeNode(removed);
    };

    #pointerAt(event) {
        const box = this.#svg.getBoundingClientRect();
        return toGraph({ x: event.clientX - box.left, y: event.clientY - box.top }, this.#view);
    }

    // --- selection and creation -----------------------------------------------------------

    #select(id) {
        if (this.#selected === id) return;
        this.#selected = id;
        this.#draw();

        // ANNOUNCED, NOT REACHED FOR. The Inspector shows what is selected, and it learns
        // about it the way it learns about everything else: an event the shell routes. This
        // element holds no reference to a panel (ADR-0006).
        this.dispatchEvent(new CustomEvent('px-node-selected', {
            detail: { node: this.selected, definition: this.#definition },
            bubbles: true,
            composed: true
        }));
    }

    /**
     * The Add-node menu.
     *
     * The same categorised dropdown the Add Object, Add Component and Project `+` menus use
     * (ADR-0026 §10): a creator who has learned one has learned all four, and a node type
     * that declares a new category takes its place without a line here.
     */
    #openNodeMenu(event, anchor) {
        if (!this.#definition) return;

        // A right-click lands the node where the pointer is; the button has no pointer, so
        // it uses the middle of what the creator is looking at. Either way the spot is
        // nudged until it is free — two nodes at the same coordinates look like one, and a
        // creator who pressed the button twice would think the second press did nothing.
        const box = this.getBoundingClientRect();
        const at = this.#freeSpot(event
            ? this.#pointerAt(event)
            : toGraph({ x: box.width / 2, y: box.height / 2 }, this.#view));

        const items = [];
        for (const group of groupNodes(this.#definition.registry)) {
            items.push({ heading: group.category });
            for (const entry of group.entries) items.push({ id: entry.type, label: entry.label, icon: 'graph' });
        }

        // A double-click opens the menu WHERE THE POINTER IS, so the node lands where the
        // creator was looking. `openMenu` positions from a rectangle, and a point is a
        // rectangle with no size — no second positioning API for one caller.
        const from = anchor ?? (event ? pointAnchor(event.clientX, event.clientY) : this);

        openMenu(from, items, type => {
            const node = this.#definition.graph.addNode({ type, x: at.x, y: at.y });
            if (node) this.#select(node.id);
        }, { label: 'nodes', search: true });
    }

    /**
     * A spot no node already occupies, cascading down and right from the one asked for.
     *
     * @param {{x: number, y: number}} at - Where the node would go, in graph space
     * @returns {{x: number, y: number}} Where it goes instead
     */
    #freeSpot(at) {
        const taken = point => this.#definition.graph.nodes().some(
            node => Math.abs(node.x - point.x) < GRID && Math.abs(node.y - point.y) < GRID
        );

        let spot = { x: snap(at.x - NODE_WIDTH / 2), y: snap(at.y - HEADER_HEIGHT) };
        // Bounded, so a graph that somehow fills every slot still places the node rather
        // than looping: after a dozen steps the cascade has said what it had to say.
        for (let step = 0; step < 12 && taken(spot); step++) {
            spot = { x: spot.x + GRID * 3, y: spot.y + GRID * 3 };
        }
        return spot;
    }

    /** Put the whole graph in view, once, when there is nothing else to look at. */
    #frame(force = false) {
        if (!this.#definition) return;

        const layout = this.#layout();
        if (layout.length === 0 || (!force && this.#framed === this.#definition)) return;

        const box = this.getBoundingClientRect();
        this.#view = fitView(layout, { width: box.width, height: box.height });
        this.#framed = this.#definition;
    }

    #report(reason) {
        if (!reason) return;
        this.#status.hidden = false;
        this.#status.classList.add('problem');
        fill(this.#status, el('span', { textContent: reason }));
    }
}

/**
 * Build an SVG element.
 *
 * `el()` builds HTML, and an SVG node created with `document.createElement` is an unknown
 * HTML element that renders as nothing. So this is the same helper in the other namespace,
 * with attributes rather than properties — SVG has no `className` to assign.
 *
 * @param {string} tag - The SVG tag
 * @param {object} [attributes] - Attributes to set
 * @param {...any} children - Nodes to append
 * @returns {SVGElement} The element
 */
function svg(tag, attributes = {}, ...children) {
    const node = document.createElementNS(SVG_NS, tag);
    for (const [name, value] of globalThis.Object.entries(attributes)) {
        if (value === null || value === undefined) continue;
        node.setAttribute(name, globalThis.String(value));
    }
    for (const child of children.flat(Infinity)) {
        if (child === null || child === undefined || child === false) continue;
        node.append(child);
    }
    return node;
}

/** Whether the creator is typing, in which case Delete belongs to the field. */
function isEditing() {
    let element = document.activeElement;
    while (element?.shadowRoot?.activeElement) element = element.shadowRoot.activeElement;
    if (!element) return false;
    if (element.isContentEditable) return true;
    return element.tagName === 'INPUT' || element.tagName === 'SELECT' || element.tagName === 'TEXTAREA';
}

/**
 * Take pointer capture, tolerating a pointer the platform no longer knows about.
 *
 * Capture is a convenience — it keeps the moves coming when the pointer leaves the canvas —
 * not what makes the gesture work. So a pointer that has already gone must not throw its
 * way out of the handler and abandon the drag. The same guard `windows/inspector.js` uses.
 *
 * @param {Element} element - The element to capture on
 * @param {number} pointerId - The pointer
 */
function capture(element, pointerId) {
    try {
        element.setPointerCapture(pointerId);
    } catch {
        // Nothing to capture. The drag still resolves from the events it does receive.
    }
}

/** A zero-sized rectangle at a point, so a menu can open where a pointer is. */
function pointAnchor(x, y) {
    return {
        getBoundingClientRect: () => ({ x, y, left: x, top: y, right: x, bottom: y, width: 0, height: 0 })
    };
}

customElements.define('px-graph', GraphWindow);
