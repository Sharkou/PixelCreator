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

import {
    GraphSeverity,
    PropertyType,
    compatibleTargets,
    createId,
    groupNodes,
    makeReactive,
    observe,
    shapeDependsOnNode
} from '../../core/mod.js';
import { Element, el, fill } from '../ui/element.js';
import { sheet } from '../ui/styles.js';
import { ICON_GRID, icon, iconForNode, iconPaths } from '../ui/icons.js';
import { openMenu } from '../ui/menu.js';
import { isEditing } from '../ui/focus.js';
import { describeNode, inputFields, paramWrites } from '../inspector/node.js';
import { DropZone } from '../dnd/payload.js';
import { canDrop, performDrop } from '../dnd/rules.js';
import '../ui/field.js';
import {
    GRID,
    gridSpec,
    controlBoxes,
    silencedPorts,
    HEADER_HEIGHT,
    NODE_WIDTH,
    PORT_RADIUS,
    connectionPath,
    fitView,
    hitTest,
    toScreen,
    nodeRows,
    nodeSize,
    placePorts,
    portPosition,
    snap,
    toGraph,
    zoomAt
} from '../graph/view.js';
import { FLOW_HUE, nodeHue, typeHue } from '../graph/palette.js';
import { FieldKind } from '../inspector/schema.js';
import '../ui/resource-field.js';

const SVG_NS = 'http://www.w3.org/2000/svg';

/** The drags whose meaning on bare canvas is a choice only the creator can make. */
const CREATES_ON_CANVAS = new globalThis.Set(['property']);

/** How far a pointer travels before a press on a node becomes a drag. */
const DRAG_THRESHOLD = 3;

export class GraphWindow extends Element {

    static styles = sheet(`
        :host {
            display: block;
            position: relative;
            min-width: 0;
            min-height: 0;
            /* The same ground the scene is drawn on: two surfaces, one plane. */
            background: var(--px-grid-background);
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

        /* A GESTURE IN FLIGHT OWNS THE CURSOR OF THE WHOLE CANVAS, DESCENDANTS INCLUDED.
           What the pointer is OVER stops mattering the moment it is holding something: a
           node carried across the canvas passes over other nodes' fields, and an input element
           inside a foreignObject asserts a text cursor of its own — so the closed hand
           flickered back to a caret every time the node being dragged crossed another one,
           and outran it entirely on a fast drag. The state is on the SVG rather than on the
           node for that reason: the node is not where the pointer is.

           IT IS THE RULE ui/cursors.js ALREADY WRITES for the shell-wide drag, applied to
           the one surface that has its own gestures — hence the descendant selector and the
           important flag, which are what reach past a control's own opinion.

           AND THE CONTROLS STEP OUT OF THE WAY, because a selector cannot reach them. A
           field lives in px-field's OWN shadow root, which no rule written here — nor in the
           document — can select into, so the caret would survive any amount of important.
           What CAN be said from here is that the foreignObject holding it takes no pointer
           while a gesture is in flight, which is the truer statement anyway: a creator
           carrying a node is not pointing at a field, and a field that lit up under a node
           being dragged over it was answering a question nobody asked. With it inert, the
           pointer meets the node's own shapes, which these rules do reach. */
        svg.panning, svg.panning * { cursor: grabbing !important; }
        svg.moving, svg.moving * { cursor: grabbing !important; }
        svg.panning .param,
        svg.moving .param,
        svg.wiring .param { pointer-events: none; }

        /* ── nodes ─────────────────────────────────────────────────────── */

        /* A NODE IS A CARD, AND IT HAS A HIERARCHY. The body is the panel surface so a
           node reads as an object on the canvas rather than as a hole in it; the header
           carries the category tint, the glyph and the name, in that order of loudness.
           The tint is set per node in windows/graph.js, because the palette is a table
           and not eight rules. */
        .node { cursor: grab; }
        .node.dragging { cursor: grabbing; }

        .node .box {
            fill: var(--px-surface-raised);
            stroke-width: 1;
            stroke-opacity: 0.55;
        }

        .node:hover .box { stroke-opacity: 0.85; }

        /* The header takes the category's colour at a tenth of its strength: enough to
           group at a glance, never enough to compete with the wires. */
        .node .header { fill-opacity: 0.16; }
        .node .header-rule { stroke-width: 1; stroke-opacity: 0.5; }

        /* Selected: the same hue, at full strength and twice the weight. A creator can
           still tell what the node IS while they are working on it. */
        .node.selected .box { stroke-width: 2; stroke-opacity: 1; }
        .node.selected .header { fill-opacity: 0.26; }

        /* Broken beats family: something is wrong here, and that is the more urgent fact. */
        .node.invalid .box { stroke: var(--px-danger) !important; stroke-opacity: 1; }

        .node .glyph { fill: none; stroke-linecap: round; stroke-linejoin: round; }

        /* A param row, drawn inside the node through a foreignObject. It is HTML, so the
           Editor's own controls work here unchanged — and it inherits the content group's
           transform, so it pans and zooms with the node rather than floating over it. */
        .param { overflow: visible; }

        .param-row {
            display: flex;
            align-items: center;
            gap: var(--px-space-1);
            height: 100%;
            font-family: var(--px-font-sans);
            font-size: var(--px-text-2xs);
            color: var(--px-text-muted);
        }

        .param-row .param-label {
            flex: 0 0 auto;
            max-width: 45%;
            overflow: hidden;
            text-overflow: ellipsis;
            white-space: nowrap;
        }

        .param-row px-field { flex: 1; min-width: 0; }

        /* A FIELD BELONGS TO ITS NODE, SO IT ANSWERS IN ITS NODE'S COLOUR. The hue is the
           one the node already wears — computed once by nodeHue() from the six-hue table
           (ADR-0030 §4) and stamped on the row — so nothing about the palette is repeated
           here. The controls inside px-field live in their own shadow root and reach it the
           only way anything crosses that boundary: a custom property. Rebinding the accent
           tokens locally is what makes a hover border and a focus ring follow the node
           without px-field knowing a graph exists.

           THE STATES ARE THREE, AND THEY DIFFER. At rest the field is the same well every
           value in this Editor sits in; hovered it is outlined in the node's hue; focused it
           is ringed in it. A field that shows a value it is not producing — one masked by a
           wire — stays legible and visibly inert, and a read-only one never lights at all.

           THE TINT IS BOUND ONCE AND EVERY ACCENT TOKEN IS DERIVED FROM IT. Rebinding only
           two of them left the third — the muted wash a focused control lays under its
           border — reading the product coral, so a focused field on a blue Number node wore
           a blue border inside an orange halo: two palettes on one control, which is exactly
           what a per-node hue exists to prevent. The wash is a TRANSPARENCY OF the hue rather
           than a seventh colour, so it is mixed from it instead of being a second table to
           keep in step (every --px-hue token would otherwise need a muted twin). */
        .param-row {
            /* The one thing a row is told; everything below is a function of it. */
            --px-node-tint: var(--px-node-hue, var(--px-accent));
            --px-accent: var(--px-node-tint);
            --px-accent-border: var(--px-node-tint);
            --px-accent-muted: color-mix(in srgb, var(--px-node-tint) 16%, transparent);
        }

        .param-row:focus-within .param-label { color: var(--px-node-hue, var(--px-text)); }

        /* Masked by a wire: still readable, visibly not what is running — and never lit,
           because what it shows is not what runs. One token, so the wash goes quiet with
           the border rather than staying lit in a colour the row no longer wears. */
        .param-row.masked { opacity: 0.45; }
        .param-row.masked,
        .param-row:has(px-field[disabled]) {
            --px-node-tint: var(--px-border-subtle);
        }

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
           It is also the one rule the canvas enforces, so showing it is not decoration.
           The COLOUR is the second half of the same statement — what shape of value
           travels through it — and it is set per port, from the same six hues a property
           type wears in the Inspector. */
        .port { stroke-width: 1.5; pointer-events: none; }

        /* A PORT WITH NOTHING IN IT IS HOLLOW; a connected one is filled. That is the
           whole affordance, and it reads at any zoom. */
        .port.connected { stroke-width: 1.5; }

        /* The ring that appears when a port is worth aiming at. Drawn on the hit target
           rather than on the disc, so it shows while the pointer is still approaching. */
        .port-halo {
            fill: none;
            stroke-width: 2;
            opacity: 0;
            pointer-events: none;
            transition: opacity var(--px-duration-fast) var(--px-ease);
        }

        /* The generous invisible target every port carries, so a 5 px disc is still a
           comfortable thing to aim at with a finger. */
        .port-hit { fill: transparent; cursor: crosshair; }
        .port-hit:hover ~ .port-halo { opacity: 0.45; }

        /* WIRING IS A DIFFERENT QUESTION FROM POINTING. While a wire is in flight the
           creator is not asking "what is this port", they are asking "will it take this
           one" — so the answer is louder, and it is the verdict rather than the hue.
           The graph model already produces it (ADR-0027); this draws it. */
        .port-halo.candidate { opacity: 0.9; stroke: var(--px-success); }
        .port-halo.rejected { opacity: 0.9; stroke: var(--px-danger); }
        .port.candidate { stroke: var(--px-success); stroke-width: 2.5; }
        .port.rejected { stroke: var(--px-danger); stroke-width: 2.5; }

        /* Every other port dims, so the ones that could take the wire are what is left to
           look at. */
        svg.wiring .node .port:not(.candidate):not(.rejected) { opacity: 0.35; }
        /* Same rule as the two above, and for the same reason: a wire in flight is a
           gesture, so the crosshair survives crossing a field on its way to a port. */
        svg.wiring, svg.wiring * { cursor: crosshair !important; }

        /* ── wires ─────────────────────────────────────────────────────── */

        /* MEASURED ON SCREEN, NOT IN GRAPH UNITS. A 2 px wire inside a group scaled to
           0.25 is half a pixel of colour, and its 14 px target is three and a half - so
           the further a creator zoomed out, the harder the canvas was to use, exactly when
           they were looking at the most of it. A non-scaling stroke is the one SVG
           property that says "this width is a screen width". */
        .wire {
            fill: none;
            stroke-width: 2;
            stroke-opacity: 0.8;
            vector-effect: non-scaling-stroke;
            /* INERT, AND THIS IS THE BUG THAT MADE CUTTING A WIRE FEEL BROKEN. The visible
               line is drawn ON TOP of its own hit target, so it was the topmost element at
               the exact place a creator aims - the line itself. Its events went to the
               canvas, which read them as a click on empty space and deselected. Cutting
               only worked on the fringe of the band, to either side of the line you were
               trying to hit. A wire is drawn, not pointed at; the wide path under it is
               what the pointer meets. */
            pointer-events: none;
        }

        /* Execution is the spine of a graph, so it is drawn a shade heavier than the
           values hanging off it. */
        .wire.flow { stroke-width: 2.5; stroke-opacity: 1; }

        /* Being re-routed: the model still holds it, so it is drawn as what it is - a wire
           whose end is currently in the creator's hand (ADR-0028 2). */
        .wire.regrabbed { stroke-opacity: 0.2; stroke-dasharray: 4 3; }

        /* Hovering a wire offers to cut it, so it says so in the colour that means
           destructive everywhere else in the Editor. One selector, because the wire itself
           no longer takes the pointer. */
        .wire-hit:hover ~ .wire { stroke: var(--px-danger) !important; }
        /* THE PREVIEW WEARS THE TYPE IT CARRIES, not the product accent. A wire in flight
           is the one moment a creator most needs to know what is travelling - the colour is
           set per drag, from the same table the ports and the finished wires read. */
        .wire.pending { stroke-dasharray: 4 3; pointer-events: none; }

        /* A wide invisible copy under each wire: two pixels of stroke is not a target,
           and this one keeps its 14 screen pixels however far the canvas is zoomed out. */
        .wire-hit {
            fill: none;
            stroke: transparent;
            stroke-width: 14;
            cursor: pointer;
            vector-effect: non-scaling-stroke;
        }

        /* ── chrome ────────────────────────────────────────────────────── */

        /* TOP RIGHT, WHERE THE SCENE PUTS ITS OWN. Frame and Add are the same kind of
           control as Frame selection and Reset view, and a creator who has found one bank
           of buttons has found the other (design/, ADR-0028 4). */
        .controls {
            position: absolute;
            right: var(--px-space-2);
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

        /* A REPORT THAT LEADS SOMEWHERE. The banner named a fault and left the creator to
           find it; on a canvas they have panned away from, that is a fact with no address.
           It is a button when it knows which node is at fault, and it selects and frames
           it - which is the whole of what a console would have been asked for first. */
        .status.locatable { cursor: pointer; }
        .status.locatable:hover { border-color: var(--px-text-muted); color: var(--px-text); }
        .status.locatable.problem:hover { border-color: var(--px-danger); color: var(--px-danger); }

        .status .count {
            flex: 0 0 auto;
            padding: 0 var(--px-space-1);
            border-radius: var(--px-radius-sm);
            background: var(--px-surface-raised);
            color: var(--px-text-dim);
            font-variant-numeric: tabular-nums;
        }

        .status .count.errors { color: var(--px-danger); }

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
    #components = null;
    #project = null;
    #framed = null;
    #svg = null;
    #content = null;
    #wires = null;
    #nodesLayer = null;
    #pending = null;
    #status = null;
    #empty = null;
    #grid = null;
    #gridMinor = null;
    #controls = null;

    #view = { x: 0, y: 0, zoom: 1 };
    #watching = false;
    #selected = null;
    #drag = null;
    #issues = [];

    /**
     * Point the canvas at a `.px`.
     *
     * @param {object|null} definition - The live ComponentDefinition, or null for nothing
     * @param {object} [options] - Options
     * @param {Function} [options.components] - () => the project's Component types, read by
     *   the nodes that name one (ADR-0034 §3.3). Asked on every draw rather than held, so a
     *   `.px` installed while the canvas is open is offered without a subscription.
     * @param {object} [options.project] - The Project a `resource` param is picked from and
     *   resolved against. A ResourceId is of PROJECT scope like the `.px` itself (ADR-0020),
     *   so a node may hold one — but an identity is unreadable, and the control that shows
     *   what it points at needs the manifest to say so (`ui/resource-field.js`).
     * @returns {GraphWindow} This element
     */
    bind(definition, { components = null, project = null } = {}) {
        this.#components = components;
        this.#project = project;
        if (this.#definition === definition) return this;

        this.release('graph');
        this.#definition = definition;
        this.#selected = null;
        this.#drag = null;
        this.#watch();

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

    /**
     * The drop zone under a point, and the node it names when there is one.
     *
     * THE SAME SHAPE THE INSPECTOR ANSWERS IN (`zoneAt`), and for the same reason: the shell
     * resolves WHERE the pointer is, the rule table says what that MEANS, and neither one
     * has an opinion about the other (ADR-0026 §6). The canvas is always a zone — that is
     * what tranche 3 settled, so a drop here can never be met with silence — and the node
     * is what makes a drop onto one CONFIGURE rather than create.
     *
     * The hit test is the canvas's own (`graph/view.js`), so a node is found here by exactly
     * the arithmetic that selects it under a click.
     *
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object} A GRAPH target, carrying `node` and its type's params when over one
     */
    zoneAt(clientX, clientY) {
        // NOTHING IS BOUND, SO NOTHING CAN BE DECLARED — and a rule has to be able to say so
        // rather than accept and then do nothing. The canvas is still a zone, because a drop
        // must never meet silence (ADR-0026 §6); it is simply a zone that takes nothing.
        if (!this.#definition) return { zone: DropZone.GRAPH, bound: false };

        const box = this.#svg.getBoundingClientRect();
        const at = toGraph({ x: clientX - box.left, y: clientY - box.top }, this.#view);
        // WHERE IT LANDS TRAVELS WITH THE TARGET, so a node a drop creates appears under
        // the pointer rather than at a corner the creator was not looking at.
        const zone = { zone: DropZone.GRAPH, at, bound: true };

        const hit = hitTest(this.#layout(), at);
        if (hit.kind !== 'node') return zone;

        const definition = this.#definition.registry.get(hit.node.type);
        return {
            ...zone,
            node: hit.node,
            // WHAT THE RULE READS TO DECIDE, declared by the node type rather than derived
            // from its name: a param that says it references a Component (ADR-0027 §4).
            params: definition?.params ?? null,
            label: definition?.label ?? hit.node.type
        };
    }

    /**
     * Perform a drop that landed on this canvas.
     *
     * @param {object} payload - What is being dragged
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object|null} What the rule did, or null when it was refused
     */
    drop(payload, clientX, clientY) {
        const zone = this.zoneAt(clientX, clientY);

        // THE ONE GESTURE THAT NEEDS A CHOICE ASKS FOR IT, WHERE IT HAPPENED. Reading and
        // writing are two intents and a drop cannot tell them apart, so the creator says
        // which — in the menu every other creation in this Editor opens (ADR-0026 §10,
        // ADR-0027 §11 as amended by ADR-0037). Landing on a node needs no menu: placing
        // that node WAS the choice.
        //
        // ASKED ONLY WHEN THE ANSWER CAN BE HONOURED. The rule table decides whether the
        // drop is taken at all; opening a menu over a gesture it refuses would put a
        // question to the creator whose every answer is no.
        if (!zone.node && CREATES_ON_CANVAS.has(payload?.kind) && canDrop(payload, zone).allowed) {
            openMenu(pointAnchor(clientX, clientY), [
                {
                    id: 'property.get',
                    label: 'Get',
                    icon: iconForNode('Properties'),
                    tooltip: 'Read this property'
                },
                {
                    id: 'property.set',
                    label: 'Set',
                    icon: iconForNode('Properties'),
                    tooltip: 'Change this property'
                }
            ], create => performDrop(payload, { ...zone, create }, this.#dropContext()),
            { label: 'operations' });
            return null;
        }

        return performDrop(payload, zone, this.#dropContext());
    }

    /**
     * Whether a drop would be taken here, and what it would do.
     * @param {object} payload - What is being dragged
     * @param {number} clientX - Pointer position
     * @param {number} clientY - Pointer position
     * @returns {object} The verdict
     */
    accepts(payload, clientX, clientY) {
        return canDrop(payload, this.zoneAt(clientX, clientY));
    }

    /**
     * What a rule acting on this canvas is handed.
     *
     * A RULE ACTS THROUGH THE WINDOW, NEVER ON THE MODEL DIRECTLY — the seam every other
     * zone already uses (`addObject`, `addComponent`, `install`). Here it matters twice
     * over: `#writeParam` is where a param change drops the siblings it invalidates, under
     * one batch, so a drop and the picker beside it undo the same way (ADR-0024 §4).
     */
    #dropContext() {
        return {
            setNodeParam: (node, name, value, options) => this.#writeParam(node, name, value, options),
            setNodeParams: (node, params) => this.#writeParams(node, params),
            createNode: (type, params, at, options) => this.#createNode(type, params, at, options),
            declareReference: (payload, target) => this.#declareReference(payload, target),
            socketFor: (object, options) => this.#socketFor(object, options)
        };
    }

    /**
     * The `objectref` socket standing for an Object, declared if this `.px` has none.
     *
     * REUSED BY NAME, AND THAT IS THE DIFFERENCE FROM DROPPING THE OBJECT ITSELF. Dropping an
     * Object on the canvas IS the gesture "declare an input", so two of them declare two
     * (`Player`, `Player 2` — ADR-0037's contract). Dropping `Player.Transform.rotation` is
     * the gesture "aim at this property"; the socket is a means, not the request, so asking
     * for three properties of Player must not leave three sockets behind for a creator to
     * fill in three times.
     *
     * WHAT ENTERS THE `.px` IS A NAME. The `ObjectId` reaches this method and stops here — it
     * is what the Inspector was showing, not what the file records (ADR-0034 invariant 1).
     *
     * @param {{name: string}} object - The Object the socket stands for
     * @param {object} [options] - `{ batch }`, so the socket joins the gesture that asked
     * @returns {object|null} The socket's descriptor
     */
    #socketFor(object, { batch } = {}) {
        const definition = this.#definition;
        if (!definition) return null;

        const name = object?.name || 'Object';
        const existing = definition.properties()
            .find(property => property.type === PropertyType.OBJECTREF && property.name === name);
        if (existing) return existing;

        return definition.addProperty({ name, type: PropertyType.OBJECTREF }, { batch });
    }

    /**
     * Declare an Object input on this `.px`, and a node that reads it (ADR-0037).
     *
     * ONE BATCH, ON ONE STACK. The property, the node and the wire all travel this `.px`'s
     * single pipeline (ADR-0027 §5), so the whole gesture is one `Ctrl Z` — and nothing
     * outside the resource is touched, which is what makes the drop legal at all.
     *
     * THE NAME IS THE OBJECT'S, THE IDENTITY IS NOT. What enters the `.px` is a property
     * called `Player`, uniquified against the ones already declared. The `ObjectId` stays
     * where ADR-0034 §3.5 puts it: in a value each attached Object carries.
     *
     * @param {object} payload - The OBJECT payload, carrying a name
     * @param {object} target - The GRAPH target, carrying where it landed
     * @returns {object|null} The property and node that were declared
     */
    #declareReference(payload, target) {
        const definition = this.#definition;
        if (!definition) return null;

        const batch = createId();
        const property = definition.addProperty(
            { name: payload.name || 'Object', type: PropertyType.OBJECTREF },
            { batch }
        );
        if (!property) return null;

        // WHERE THE POINTER LET GO, NUDGED UNTIL IT IS FREE — the same `#freeSpot()` the
        // create menu uses: two nodes at one place look like one, and a creator who dropped
        // twice would think the second drop did nothing.
        const spot = this.#freeSpot(target.at ?? { x: 0, y: 0 });
        // `Get Object`, NOT `Get Property`. Reading an `objectref` input through the property
        // node was true and unreadable: a card headed `Get Property` handing out an Object
        // tells a creator nothing about what they just dragged. The reference node reads the
        // same socket through the same boundary and says what it is (ADR-0039 §5).
        const node = definition.graph.addNode({
            type: 'reference.object',
            params: { object: property.id },
            x: spot.x,
            y: spot.y
        }, { batch });

        if (node) this.#select(node.id);
        return { property, node };
    }

    /**
     * Add a node already configured, where the drop landed.
     *
     * @param {string} type - The node type to add
     * @param {object} params - The params it arrives with
     * @param {{x: number, y: number}} [at] - Where it landed, in graph space
     * @returns {object|null} The node
     */
    #createNode(type, params, at = { x: 0, y: 0 }, { batch } = {}) {
        if (!this.#definition) return null;

        const spot = this.#freeSpot(at);
        // THE BATCH TRAVELS, so a drop that declares a socket AND places a node aimed at it
        // is one entry in the history: a creator takes back the gesture they made, not the
        // half of it the Editor happened to perform last (ADR-0024 §4).
        const node = this.#definition.graph.addNode({ type, params, x: spot.x, y: spot.y }, { batch });

        if (node) this.#select(node.id);
        return node;
    }

    /**
     * Write several params of one node as one gesture.
     *
     * @param {object} node - The node record
     * @param {object} params - Name to value
     * @returns {object} The node
     */
    #writeParams(node, params) {
        const batch = createId();
        for (const [name, value] of globalThis.Object.entries(params)) {
            this.#writeParam(node, name, value, { batch });
        }
        return node;
    }

    /** The node the creator has selected, or null. */
    get selected() {
        return this.#selected ? this.#definition?.graph.node(this.#selected) ?? null : null;
    }

    connectedCallback() {
        if (this.shadowRoot.childElementCount === 0) this.#build();

        globalThis.addEventListener('keydown', this.#onKeyDown);
        this.track(() => globalThis.removeEventListener('keydown', this.#onKeyDown));

        // RE-ESTABLISHED HERE, NOT ONLY IN `bind()`. A disconnect releases everything the
        // element subscribed to (ui/element.js), and re-parenting an element is performed by
        // the browser as a disconnect followed by a reconnect — so a canvas that was moved
        // rather than rebuilt would come back looking correct and silently stop following
        // its model. Nothing moves one today; this is what makes that safe to do, and it
        // costs one idempotent call. The pan, the zoom and the selection are private fields
        // and are untouched either way.
        this.#watch();

        this.#frame();
        this.#draw();
    }

    /**
     * Follow this `.px`'s pipeline, once.
     *
     * ONE SUBSCRIPTION, NOT ONE PER NODE. Every edit of this `.px` — a node moving, a wire
     * appearing, a property being renamed under a Set Property — travels the one pipeline it
     * owns, so one listener is the whole of the reactivity here.
     *
     * EXCEPT A VALUE TYPED INTO A NODE, WHICH CHANGES NO SHAPE. Redrawing rebuilds the very
     * box being typed into and takes the caret with it, so a creator gets one character per
     * click. The field already follows the model on its own (`#drawControl`), so the redraw
     * buys nothing when nothing about the node can look different — see `#reshapes()`.
     *
     * The flag is cleared by the release itself, so "am I already watching" cannot drift
     * from whether the subscription is actually held.
     */
    #watch() {
        if (this.#watching || !this.#definition) return;

        const definition = this.#definition;
        this.#watching = true;
        this.track(() => { this.#watching = false; }, 'graph');
        this.track(definition.operations.on('operation', operation => {
            if (this.#reshapes(operation)) this.#draw();
        }), 'graph');
    }

    /**
     * Whether an edit can change what this canvas draws.
     *
     * THE QUESTION IS ASKED OF THE CATALOGUE, NOT OF A LIST KEPT HERE. `shapeDependsOnNode()`
     * answers it from the node type's own declarations: a port list or a title declared as a
     * FUNCTION reads the node, so picking a property under a `Set Property` retypes its port
     * and the node has to be drawn again; declared as an ARRAY it cannot, so the number a
     * creator is typing into a `Number` node changes nothing but the number. Adding a node
     * type therefore needs no line here (core/graph/nodes.js).
     *
     * `node.inputs` NEVER reshapes anything, whatever the type: it is what a port holds while
     * nothing is wired to it (ADR-0031 §1), and no port list in the catalogue reads it.
     *
     * ANYTHING THAT IS NOT A NODE'S OWN FIELD REDRAWS. A property of the `.px` being renamed
     * or retyped is a `SET_PROPERTY` too, and it retypes every port that names it — so the
     * default here is to draw, and only a node's own `params` and `inputs` are excused.
     *
     * @param {object} operation - The operation just applied
     * @returns {boolean} True when the canvas has to be drawn again
     */
    #reshapes(operation) {
        if (operation.type !== 'SET_PROPERTY') return true;
        if (operation.prop !== 'params' && operation.prop !== 'inputs') return true;

        const node = this.#definition.graph.node(operation.target?.object ?? null);
        if (!node) return true;
        if (operation.prop === 'inputs') return false;

        return shapeDependsOnNode(this.#definition.registry.get(node.type));
    }

    /**
     * Tell the canvas it is on screen.
     *
     * THE SAME WORD THE VIEWPORT USES, and for the same reason: neither draws because a
     * clock told it to, so something has to say when there is a reason (`viewport.js`).
     * The workbench says it when this canvas's tab becomes the shown one, or when the band
     * itself is opened — which is the first moment the element has a box, and therefore the
     * first moment framing the graph means anything.
     *
     * @returns {GraphWindow} This element
     */
    wake() {
        if (!this.isConnected || this.hidden) return this;
        this.#frame();
        this.#draw();
        return this;
    }

    #build() {
        this.#wires = svg('g');
        this.#nodesLayer = svg('g');
        this.#pending = svg('path', { class: 'wire pending' });
        this.#content = svg('g', {}, this.#wires, this.#pending, this.#nodesLayer);

        // THE SAME GRID THE SCENE DRAWS, in the language the scene draws it in: a fine
        // line every GRID units, an emphasised one every fourth, and an axis at the
        // origin (viewport/grid.js). It used to be one flat square, which read as graph
        // paper rather than as the same infinite plane — and the two surfaces a creator
        // pans across should not disagree about what a plane looks like.
        //
        // TWO SIBLING PATTERNS, NOT ONE NESTED IN THE OTHER, and that is the fix rather
        // than a preference: a nested pattern paints in the coordinate system of the tile
        // that references it, so carrying the view on both transformed the fine lines
        // TWICE — they panned at double speed and scaled quadratically against the lines
        // they subdivide. The arithmetic now lives in `gridSpec()` (graph/view.js), where
        // it is tested, and both patterns are measured in SCREEN pixels and translated by
        // the pan alone.
        this.#gridMinor = svg('pattern', {
            id: 'px-graph-grid-minor',
            patternUnits: 'userSpaceOnUse'
        }, svg('path', {
            class: 'grid-line minor',
            fill: 'none',
            stroke: 'var(--px-grid-minor)',
            'stroke-width': 1
        }));

        this.#grid = svg('pattern', {
            id: 'px-graph-grid',
            patternUnits: 'userSpaceOnUse'
        }, svg('path', {
            class: 'grid-line major',
            fill: 'none',
            stroke: 'var(--px-grid-major)',
            'stroke-width': 1
        }));

        const background = svg('g', {},
            svg('rect', { width: '100%', height: '100%', fill: 'url(#px-graph-grid-minor)' }),
            svg('rect', { width: '100%', height: '100%', fill: 'url(#px-graph-grid)' })
        );

        // NO AXES AT THE ORIGIN. They were drawn once rather than tiled, so a creator who
        // had panned a long way could find zero — but a graph has no meaningful origin the
        // way a scene does: nothing is placed relative to it, and two heavy lines crossing
        // the canvas read as structure where there is none. The grid is uniform, and Frame
        // all is what finds the work.

        this.#svg = svg('svg', {},
            svg('defs', {}, this.#gridMinor, this.#grid), background, this.#content);

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

        return graph.nodes().map(node => {
            const ports = graph.portsOf(node);
            // WHAT THE NODE DRAWS INSIDE ITSELF: the params its type declares, then the
            // input ports a creator may type a constant into (ADR-0031 1). Both are
            // CONTROLS, and a control is laid out on the row of the port it edits - which
            // is what puts a value and the socket it travels through on one line
            // (graph/view.js, ADR-0033).
            const controls = this.#controlsOf(node, ports);

            return { node, ports, controls, rows: nodeRows(ports, controls) };
        });
    }

    /**
     * What a node draws inside itself: the params its type declares, then the input ports a
     * creator may type a constant into (ADR-0031 §1).
     *
     * ASKED FOR BY THE GESTURES TOO, not only by the draw. The rows a node has decide where
     * its sockets are (`placePorts`), so a wire being taken from a port has to resolve them
     * the same way the drawing did — anything else puts the end of the wire somewhere the
     * socket is not.
     *
     * @param {object} node - The node record
     * @param {{inputs: object[], outputs: object[]}} ports - Its ports right now
     * @returns {object[]} Field descriptors, in the order they are laid out
     */
    /**
     * Where a port of a node sits right now, resolved exactly as the drawing resolves it.
     *
     * @param {object} node - The node record
     * @param {string} direction - 'in' or 'out'
     * @param {string} portId - The port
     * @returns {{x: number, y: number}|null} Its centre
     */
    #portAt(node, direction, portId) {
        const ports = this.#definition.graph.portsOf(node);
        return portPosition(node, ports, direction, portId, this.#controlsOf(node, ports));
    }

    #controlsOf(node, ports) {
        // A CONTROL THAT SITS ON A PORT IS GREYED WHEN THAT PORT IS FED, whether it edits the
        // port's value or a param beside it. That single fact is what lets the Object picker
        // and the Object socket be one question: connect something and the picker visibly
        // stops answering; disconnect and it answers again. Nobody is asked to pick a mode.
        const connected = field => (field.port
            ? { ...field, connected: Boolean(this.#definition.graph.incoming(node.id, field.port)) }
            : field);

        return [
            ...(describeNode(node, this.#nodeContext())?.fields ?? []).map(connected),
            ...this.#inputRows(node, ports)
        ];
    }

    /**
     * What a node's params and its reference pickers are resolved against.
     *
     * Asked for on every draw and never held: the Component catalogue is a function so a
     * `.px` installed while this canvas is open is offered without a subscription, and the
     * `.px`'s own properties change under a `Set Property` as they are declared
     * (ADR-0034 §3.3).
     *
     * @returns {object} `{ registry, properties, components }`
     */
    #nodeContext() {
        return {
            registry: this.#definition.registry,
            properties: this.#definition.properties(),
            components: this.#components?.() ?? []
        };
    }

    /**
     * The input ports a creator can type a value into, with the wire each one already has.
     *
     * WHICH PORTS GET A CONTROL is the Editor's rule and it is written down once, next to
     * the rest of what a node shows (`inputFields`, inspector/node.js) — a canvas that
     * decided it here would be a second opinion about whether an object port is typeable.
     * What this adds is the one fact only the graph knows: a connected port still shows the
     * value it would fall back to, greyed, because unwiring is meant to be an experiment a
     * creator can undo by hand (ADR-0031 §1).
     *
     * @param {object} node - The node record
     * @param {{inputs: object[], outputs: object[]}} ports - Its ports right now
     * @returns {object[]} Field descriptors, each carrying the port it edits
     */
    #inputRows(node, ports) {
        return inputFields(ports).map(field => ({
            ...field,
            connected: Boolean(this.#definition.graph.incoming(node.id, field.port))
        }));
    }

    #draw() {
        if (!this.#svg) return;

        // The grid depends on the VIEW and on nothing else, so it is drawn before the
        // early return: a canvas with no `.px` bound is still an empty plane, not a void.
        this.#drawGrid();

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

        fill(this.#wires, graph.connections().map(connection => this.#drawWire(connection, byId)).filter(Boolean));
        fill(this.#nodesLayer, layout.map(entry => this.#drawNode(entry)));

        this.#empty.hidden = layout.length > 0;
        this.#showStatus();
    }

    /**
     * Size and place the two grid patterns for the current view.
     *
     * THE GRID BELONGS TO THE GRAPH, NOT TO THE SCREEN — but the rectangle it covers is the
     * screen, whatever the view. So the tiles are measured in screen pixels and carry the
     * pan as a translation: nothing is scaled twice, and nothing stays nailed to the panel
     * while the nodes slide over it. `gridSpec()` decides how dense they are, by the same
     * law the Viewport obeys (editor/grid.js).
     */
    #drawGrid() {
        const spec = gridSpec(this.#view);

        for (const [pattern, size] of [[this.#gridMinor, spec.minor], [this.#grid, spec.major]]) {
            pattern.setAttribute('width', size);
            pattern.setAttribute('height', size);
            pattern.setAttribute('patternTransform', `translate(${spec.x} ${spec.y})`);
            pattern.firstElementChild.setAttribute('d', `M ${size} 0 L 0 0 0 ${size}`);
        }
    }

    #drawWire(connection, byId) {
        const source = byId.get(connection.from.node);
        const target = byId.get(connection.to.node);
        if (!source || !target) return null;

        const from = portPosition(source.node, source.ports, 'out', connection.from.port, source.controls);
        const to = portPosition(target.node, target.ports, 'in', connection.to.port, target.controls);
        if (!from || !to) return null;

        const port = source.ports.outputs.find(entry => entry.id === connection.from.port) ?? null;
        const kind = port?.kind ?? 'data';
        // A WIRE WEARS WHAT IT CARRIES. Same six hues as the ports it joins, so following a
        // value across a busy canvas is a matter of following a colour.
        const hue = kind === 'flow' ? FLOW_HUE : typeHue(port?.type);
        const d = connectionPath(from, to);

        // The visible wire and its target are two paths, because two pixels of stroke is not
        // something a finger can hit, and a fourteen-pixel visible wire is not a wire.
        // A CLICK, NOT A PRESS. Cutting on `pointerdown` meant a wire vanished under a
        // hand that had not finished deciding - and a press that was going to become a pan
        // took a connection with it. Down and up on the same wire is a click, which is what
        // a creator means by "this one".
        const hit = svg('path', { class: 'wire-hit', d });
        let pressed = false;
        hit.addEventListener('pointerdown', event => {
            if (event.button !== 0) return;
            event.stopPropagation();
            pressed = true;
        });
        hit.addEventListener('pointerup', event => {
            if (event.button !== 0 || !pressed) return;
            event.stopPropagation();
            pressed = false;
            this.#definition.graph.disconnect(connection.id);
        });
        hit.addEventListener('pointerleave', () => {
            pressed = false;
        });
        hit.append(svg('title', {}, document.createTextNode('Click to disconnect')));

        // Being re-routed right now: the model still holds it — nothing is written until
        // the drop — so it is drawn faint rather than removed (ADR-0028 2).
        const regrabbed = this.#drag?.kind === 'wire' && this.#drag.regrab === connection.id;

        // The target goes UNDER the visible wire so the hover rule can reach it: a sibling
        // combinator only looks forward, and the wide transparent path is what the pointer
        // actually meets.
        return svg('g', {}, hit, svg('path', {
            class: `wire ${kind}${regrabbed ? ' regrabbed' : ''}`,
            stroke: hue,
            d
        }));
    }

    #drawNode({ node, ports, controls, rows }) {
        const size = nodeSize(ports, controls);
        const broken = this.#issues.some(
            issue => issue.node === node.id && issue.severity === GraphSeverity.ERROR
        );
        const definition = this.#definition.registry.get(node.type);
        // THE HEADER IS THE NODE'S NAME, AND ONLY ITS NAME (ADR-0039 §5). A configured node
        // used to rename itself — `Middle Button`, `Get Ground`, `Set Sprite.height` — and
        // every one of those is a VALUE wearing the place a TYPE belongs. A tutorial has to
        // be able to say "add a Set Property" and have that node still be called that an hour
        // later; a creator has to be able to find it in the menu by the name they read on the
        // canvas. What it is configured with is drawn inside it, on rows that can be changed.
        const label = definition?.label || node.type;
        const category = definition?.category ?? 'Other';
        const hue = nodeHue(definition, this.#definition.graph.portsOf(node));

        const classes = ['node'];
        if (node.id === this.#selected) classes.push('selected');
        if (broken) classes.push('invalid');
        // GRABBING WHILE IT IS BEING CARRIED. The rule was written and nothing ever set the
        // class, so a node showed the open hand throughout a drag - the one moment the
        // cursor had something to say.
        if (this.#drag?.kind === 'node' && this.#drag.node === node.id) classes.push('dragging');

        const group = svg('g', {
            class: classes.join(' '),
            transform: `translate(${node.x} ${node.y})`,
            'data-node': node.id
        },
            // THE BORDER IS THE CATEGORY'S, not the accent's. Every node used to be outlined
            // in coral the moment it was selected and in the same grey otherwise, so the
            // canvas said nothing about what anything was until the header was read. The
            // hue is the one from the six-colour table (ADR-0030 §4); selection makes it
            // brighter and thicker rather than replacing it with a seventh colour.
            svg('rect', {
                class: 'box',
                width: size.width,
                height: size.height,
                rx: 6,
                stroke: hue
            }),
            // THE HEADER IS TINTED BY WHAT THE NODE IS. Six hues, reused between the
            // categories and the value types (ui/styles.js) — an Add node and a `number`
            // port are the same blue because they are the same idea seen twice. A colour
            // per category would be twenty colours and no meaning.
            svg('path', {
                class: 'header',
                fill: hue,
                d: `M 0 6 A 6 6 0 0 1 6 0 L ${size.width - 6} 0 A 6 6 0 0 1 ${size.width} 6 `
                    + `L ${size.width} ${HEADER_HEIGHT} L 0 ${HEADER_HEIGHT} Z`
            }),
            // A rule under the header rather than a full-strength band: the tint says which
            // family, the rule says where the header ends, and neither shouts.
            svg('path', {
                class: 'header-rule',
                stroke: hue,
                d: `M 0 ${HEADER_HEIGHT} L ${size.width} ${HEADER_HEIGHT}`
            }),
            glyphIn(iconForNode(definition ?? category), { x: 7, y: 5, size: 16, color: hue }),
            svg('text', { class: 'title', x: 27, y: 18 }, document.createTextNode(label))
        );

        // WHAT THE NODE DOES, WHERE THE NODE IS. The catalogue already carries the sentence
        // and the picker already shows it — but a creator reads it once, while choosing, and
        // then meets the node again on a canvas with no way to ask. A `<title>` is the whole
        // of the fix, and the ports' own titles still win where they overlap.
        //
        if (definition?.tooltip) {
            group.prepend(svg('title', {}, document.createTextNode(definition.tooltip)));
        }

        // WHICH LABELS THE CONTROLS SPEAK FOR — asked of the geometry, which also uses the
        // answer to decide how much room to leave (graph/view.js). Deciding it here as well
        // would be two opinions, and the day they differed a label would be drawn through
        // a field.
        const silenced = silencedPorts(rows);

        for (const placed of placePorts(node, ports, controls)) {
            const silent = silenced.has(`${placed.direction}:${placed.port.id}`);
            group.append(...this.#drawPort(node, placed, { silent }));
        }

        for (const box of controlBoxes(node, rows)) {
            group.append(this.#drawControl(node, box.control, box, hue));
        }

        return group;
    }

    /**
     * One editable param, inside the node.
     *
     * THE GRAPH IS WHERE A GRAPH IS EDITED. A `Number` node whose value could only be
     * changed in a panel on the other side of the window was a node that told you what it
     * was and not what it held — and reading `42` in one place while typing it in another
     * is the split ADR-0027 keeps the Inspector out of for Components.
     *
     * IT IS THE SAME CONTROL, NOT A SECOND ONE. `px-field` owns every line of value logic
     * in this Editor — parsing, clamping, the focus guard, the batch that makes a typing
     * session one undo — and none of that is worth writing twice for a canvas. A
     * `foreignObject` is what lets an HTML control live in an SVG, and it inherits the
     * content group's transform, so the field pans and zooms with the node it belongs to.
     *
     * @param {object} node - The node record
     * @param {object} descriptor - A field descriptor from inspector/node.js
     * @param {object} box - Where it goes, from `controlBoxes()` (graph/view.js)
     * @param {string} hue - The colour its node wears, so the field answers in it
     * @returns {SVGElement} The wrapper
     */
    #drawControl(node, descriptor, box, hue) {
        const holder = svg('foreignObject', {
            class: 'param',
            x: box.x - node.x,
            y: box.y - node.y,
            width: box.width,
            height: box.height
        });

        // TWO RECORDS, ONE DRAWING. A param is what the TYPE declares as configuration; an
        // input value is what THIS node holds on a port nothing is wired to (ADR-0031 §1).
        // They are read and written through different fields of the node, and they look
        // and behave identically, which is the point.
        // TWO RECORDS, AND WHICH ONE IS NOT DECIDED BY THE ROW. A control usually writes the
        // thing it sits beside — a port's input value — but the Object picker sits ON the
        // Object port and writes a PARAM, because what it names is a socket of this `.px` and
        // an identity may never be stored in a port's value (ADR-0034 §3.6). So the catalogue
        // says where a control is drawn (`port`) and what it writes (`param`), separately.
        const asParam = descriptor.param || !descriptor.port;
        const record = asParam ? 'params' : 'inputs';
        const key = asParam ? descriptor.name : descriptor.port;

        // Falls back to what the TYPE declares, not to nothing: an untouched value is not
        // an empty one, it is one still holding the default the interpreter will read.
        // A COMPOUND CONTROL SHOWS THE PAIR IT ASKS ABOUT, not the half filed under its own
        // name: the property picker's options are keyed by (Component, property), so the
        // value it is bound to has to be too (`referenceChoice`, inspector/node.js).
        const held = source => {
            if (descriptor.held !== undefined) return descriptor.held;
            return source?.[key] === undefined ? descriptor.default ?? null : source[key];
        };

        const view = makeReactive({ [descriptor.name]: held(node[record]) });
        this.track(observe(node, record, change => {
            const value = held(change.value);
            if (view[descriptor.name] !== value) view[descriptor.name] = value;
        }), 'graph');

        const write = (value, options) => (asParam
            ? this.#writeParam(node, descriptor.name, value, options)
            : this.#definition.graph.setInput(node.id, descriptor.port, value, options));

        // A RESOURCE IS AN IDENTITY, AND A TEXT BOX OVER ONE IS A DEBUGGER. The panel made
        // this decision already and `ui/resource-field.js` is the control it made it with —
        // it shows what the reference points at, and offers pick, drop and clear. Reaching
        // for it here rather than letting `px-field` fall through is the same rule the
        // Inspector follows (ADR-0030 §1), applied on the canvas.
        const field = descriptor.kind === FieldKind.RESOURCE
            ? el('px-resource').bind(view, descriptor, { project: this.#project, write })
            : el('px-field').bind(view, { ...descriptor, label: descriptor.label }, { write });

        // A CONNECTED PORT SHOWS ITS FALLBACK, GREYED. The wire is what runs; this is what
        // would run without it, and hiding it would make unwiring a surprise.
        // AN EMPTY LABEL DRAWS NOTHING, not an empty box that still takes its gap. It is
        // how a `Number` node gets down to one field and one socket.
        const row = el('div', {
            class: `param-row${descriptor.connected ? ' masked' : ''}`,
            style: `--px-node-hue: ${hue}`
        },
            descriptor.label ? el('span', { class: 'param-label', textContent: descriptor.label }) : null,
            field
        );
        if (descriptor.connected) row.title = `${descriptor.label} is coming from a connection`;

        // The canvas turns a press into a pan or a node drag; inside a field it is a
        // caret. Stopping here is what keeps typing from moving the node underneath.
        for (const kind of ['pointerdown', 'pointerup', 'pointermove', 'dblclick', 'wheel']) {
            row.addEventListener(kind, event => event.stopPropagation());
        }

        holder.append(row);
        return holder;
    }

    /**
     * Change one param, and drop any sibling the change has made meaningless.
     *
     * ONE BATCH, because it is one thing the creator did: choosing a different Component on
     * a `Get Property On` also abandons the property they had picked out of the old one, and
     * a single `Ctrl Z` has to put both back (ADR-0024 §4). WHICH siblings go is the model's
     * question, answered by `paramWrites()` from the references a node type declares — this
     * only submits the answer.
     *
     * The field mints the batch on the gesture, so the fallback below is a guard rather than
     * a path: it is what keeps "one gesture, one undo entry" true of the pair even if a
     * caller ever writes without one, which a single `setParam` never had to care about.
     *
     * @param {object} node - The node record
     * @param {string} name - The param the creator changed
     * @param {any} value - What they changed it to
     * @param {object} [options] - `{ batch }` from the field's typing session
     */
    #writeParam(node, name, value, options = {}) {
        const definition = this.#definition.registry.get(node.type);
        const batch = options.batch ?? `${node.id}:${name}`;

        for (const write of paramWrites(definition, node, name, value, this.#nodeContext())) {
            this.#definition.graph.setParam(node.id, write.name, write.value, { ...options, batch });
        }

    }

    #drawPort(node, placed, { silent = false } = {}) {
        const local = { x: placed.x - node.x, y: placed.y - node.y };
        const connected = placed.direction === 'in'
            ? Boolean(this.#definition.graph.incoming(node.id, placed.port.id))
            : this.#definition.graph.outgoing(node.id, placed.port.id).length > 0;

        // THE COLOUR OF A PORT IS THE SHAPE OF WHAT TRAVELS THROUGH IT, and it is the same
        // colour that property's type wears in the Inspector. A creator learns the palette
        // once. Flow is its own steel, because execution order is not a value.
        const hue = placed.port.kind === 'flow' ? FLOW_HUE : typeHue(placed.port.type);

        const classes = `port ${placed.port.kind}${connected ? ' connected' : ''}`;
        // Stamped so a wire in flight can find the one shape it is over without a second
        // registry of rectangles — the same trick the Inspector's drop zones use.
        const identity = {
            'data-node': node.id,
            'data-port': placed.port.id,
            'data-direction': placed.direction
        };

        const shape = placed.port.kind === 'flow'
            ? svg('path', {
                class: classes,
                stroke: hue,
                fill: connected ? hue : 'var(--px-surface)',
                ...identity,
                d: `M ${local.x - 4} ${local.y - 5} L ${local.x + 5} ${local.y} `
                    + `L ${local.x - 4} ${local.y + 5} Z`
            })
            : svg('circle', {
                class: classes,
                stroke: hue,
                fill: connected ? hue : 'var(--px-surface)',
                ...identity,
                cx: local.x,
                cy: local.y,
                r: PORT_RADIUS
            });

        // The tooltip falls back to the port's identity when the label was left blank on
        // purpose: a hidden label is a drawing decision, not a port without a name.
        const named = placed.port.label || humanise(placed.port.id);
        shape.append(svg('title', {}, document.createTextNode(
            `${named}${placed.port.kind === 'flow' ? '' : ` (${placed.port.type})`}`
        )));

        const text = silent ? null : svg('text', {
            class: 'port-label',
            x: placed.direction === 'in' ? local.x + 12 : local.x - 12,
            y: local.y + 3,
            'text-anchor': placed.direction === 'in' ? 'start' : 'end'
        }, document.createTextNode(placed.port.label ?? ''));

        // The generous invisible target every port carries, so a 5 px disc is still a
        // comfortable thing to aim at. It also carries the hover ring, because a ring drawn
        // on the disc itself would only appear once the pointer was already on target.
        const hit = svg('circle', {
            class: 'port-hit',
            cx: local.x,
            cy: local.y,
            r: 11,
            'data-port': placed.port.id,
            'data-direction': placed.direction
        });

        const halo = svg('circle', {
            class: 'port-halo',
            cx: local.x,
            cy: local.y,
            r: 9,
            stroke: hue,
            ...identity
        });

        // The halo is LAST so the hover rule can reach it: a sibling combinator only
        // looks forward.
        return [shape, text, hit, halo].filter(Boolean);
    }

    #showStatus() {
        const errors = this.#issues.filter(issue => issue.severity === GraphSeverity.ERROR);
        const warnings = this.#issues.filter(issue => issue.severity !== GraphSeverity.ERROR);
        const shown = errors[0] ?? this.#issues[0] ?? null;

        this.#status.hidden = !shown;
        if (!shown) return;

        // ONE LINE, THE MOST SEVERE, AND A COUNT PER SEVERITY. A panel that lists every
        // finding is a console; what a creator needs on the canvas is "something is wrong,
        // here is the first one, and here is how much else there is".
        //
        // AND IT LEADS THERE. A fault named without an address is a fault a creator has to
        // hunt for on a canvas they may have panned away from — so the banner selects the
        // node it is talking about and brings it into view.
        this.#status.classList.toggle('problem', errors.length > 0);
        this.#status.classList.toggle('locatable', Boolean(shown.node));
        this.#status.onclick = shown.node ? () => this.#revealNode(shown.node) : null;
        this.#status.title = shown.node ? 'Show the node this is about' : '';

        fill(this.#status,
            el('span', { textContent: shown.message }),
            errors.length > 1 || (errors.length > 0 && warnings.length > 0)
                ? el('span', { class: 'count errors', textContent: `${errors.length}` })
                : null,
            warnings.length > 0 && (errors.length > 0 || warnings.length > 1)
                ? el('span', { class: 'count', textContent: `${warnings.length}` })
                : null
        );
    }

    /**
     * Select a node and bring it into view, whatever the creator had been looking at.
     *
     * The pan is a view change and nothing else — no operation, no history entry — so it is
     * the cheapest possible answer to "where is that". It leaves the zoom alone: a creator
     * who chose a zoom level chose it.
     *
     * @param {string} id - The node's identifier
     */
    #revealNode(id) {
        const node = this.#definition?.graph.node(id);
        if (!node) return;

        const box = this.getBoundingClientRect();
        const size = nodeSize(this.#definition.graph.portsOf(node), []);
        const centre = toScreen({ x: node.x + size.width / 2, y: node.y + size.height / 2 }, this.#view);

        // Only if it is actually off screen, or close enough to the edge to be missed.
        const margin = 48;
        const outside = centre.x < margin || centre.y < margin
            || centre.x > box.width - margin || centre.y > box.height - margin;

        if (outside) {
            this.#view = {
                ...this.#view,
                x: this.#view.x + (box.width / 2 - centre.x),
                y: this.#view.y + (box.height / 2 - centre.y)
            };
        }

        this.#select(id);
        this.#draw();
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
            this.#drag = this.#beginWire(hit);
            this.#svg.classList.add('wiring');
            this.#pending.setAttribute('stroke', this.#drag.hue);
            capture(this.#svg, event.pointerId);
            // The wire being re-routed has to fade the moment it leaves the port, not on
            // the first pointer move.
            if (this.#drag.regrab) this.#draw();
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
            // THE HAND CLOSES ON THE PRESS, AND IT STAYS CLOSED WHEREVER THE POINTER GOES.
            // `.node.dragging` says it on the node being carried, which is the wrong element
            // to ask the moment the pointer is anywhere else — over another node, over one of
            // its fields, or ahead of the node on a fast drag (see the sheet).
            this.#svg.classList.add('moving');
            capture(this.#svg, event.pointerId);
            this.#draw();
            return;
        }

        this.#select(null);
    }

    /**
     * The wire gesture a press on a port starts.
     *
     * TWO GESTURES ON ONE PORT, AND THE MODEL DECIDES WHICH. Pressing a FREE port pulls a
     * new wire out of it. Pressing a CONNECTED INPUT picks the existing wire back up by its
     * far end — the gesture every node editor has, and the only way to move a connection
     * without first destroying it and hoping to remember where it came from.
     *
     * NOTHING IS WRITTEN UNTIL THE DROP (ADR-0028 2). The old connection stays in the model
     * for the whole gesture and is drawn faint; the drop replaces it in ONE batch, and
     * abandoning the gesture leaves it exactly as it was. Disconnecting at the press would
     * make "let go where you started" a destructive act.
     *
     * @param {object} hit - What `hitTest()` found: `{ node, port, direction }`
     * @returns {object} The drag state
     */
    #beginWire(hit) {
        const graph = this.#definition.graph;
        const existing = hit.direction === 'in' ? graph.incoming(hit.node.id, hit.port.id) : null;
        const source = existing ? graph.node(existing.from.node) : null;

        if (existing && source) {
            const ports = graph.portsOf(source);
            const port = ports.outputs.find(entry => entry.id === existing.from.port) ?? null;

            return {
                kind: 'wire',
                from: { node: existing.from.node, port: existing.from.port },
                direction: 'out',
                origin: portPosition(source, ports, 'out', existing.from.port, this.#controlsOf(source, ports)),
                regrab: existing.id,
                hue: port?.kind === 'flow' ? FLOW_HUE : typeHue(port?.type)
            };
        }

        return {
            kind: 'wire',
            from: { node: hit.node.id, port: hit.port.id },
            direction: hit.direction,
            origin: this.#portAt(hit.node, hit.direction, hit.port.id),
            regrab: null,
            // A WIRE IN FLIGHT WEARS WHAT IT WILL CARRY. Coral for every drag said only
            // "something is happening"; the type says what would arrive if it landed.
            hue: hit.port.kind === 'flow' ? FLOW_HUE : typeHue(hit.port.type)
        };
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
            this.#markWireTarget(point);
            return;
        }

        if (drag.kind === 'node') {
            const travelled = Math.hypot(point.x - drag.start.x, point.y - drag.start.y);
            if (!drag.moved && travelled < DRAG_THRESHOLD) return;
            drag.moved = true;

            const moved = this.#definition.graph.moveNode(
                drag.node,
                snap(point.x - drag.offsetX),
                snap(point.y - drag.offsetY),
                { batch: drag.batch }
            );
            // A node picked up and dragged within one grid cell submits nothing, so nothing
            // would repaint - and the closed hand would appear only once it had travelled.
            if (!moved) this.#draw();
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
            const point = this.#pointerAt(event);
            const hit = hitTest(this.#layout(), point);

            if (hit.kind === 'port' && hit.direction !== drag.direction) {
                const ends = drag.direction === 'out'
                    ? [drag.from, { node: hit.node.id, port: hit.port.id }]
                    : [{ node: hit.node.id, port: hit.port.id }, drag.from];

                const verdict = this.#definition.graph.canConnect(ends[0], ends[1]);
                if (verdict.allowed) this.#reconnect(drag, ends);
                else this.#report(verdict.reason);
                this.#cancelDrag(event.pointerId);
                return;
            }

            // A WIRE LET GO OVER NOTHING IS A QUESTION, NOT A MISTAKE. Cancelling it threw
            // away the one thing the creator had already said — what they want to connect —
            // and made them place a node, find it, and drag the wire again. Instead the
            // gesture finishes as an offer: the picker opens where the wire was dropped,
            // showing the node types that can actually take this port.
            const source = { ...drag.from, direction: drag.direction, regrab: drag.regrab };
            this.#cancelDrag(event.pointerId);
            this.#openNodeMenu(event, null, source);
            return;
        }

        this.#cancelDrag(event.pointerId);
    }

    /**
     * Land a wire, replacing the one it was re-routed from when there was one.
     *
     * ONE BATCH, so moving a connection from one port to another is ONE `Ctrl Z` — a move
     * is one thing the creator did, not a deletion they have to undo twice (ADR-0024 4).
     *
     * @param {object} drag - The wire gesture, carrying `regrab`
     * @param {Array<object>} ends - `[from, to]`, output side first
     * @returns {object|null} The connection
     */
    #reconnect(drag, ends) {
        const graph = this.#definition.graph;
        const batch = drag.regrab ? `${drag.regrab}:move` : undefined;

        if (drag.regrab) graph.disconnect(drag.regrab, { batch });
        return graph.connect(ends[0], ends[1], { batch });
    }

    /**
     * Say what releasing the wire here would do (ADR-0028 §3, applied to the canvas).
     *
     * `canConnect()` already answers whether two ends may be joined and why (ADR-0027),
     * and until now that answer only appeared AFTER the drop, as a red line in the corner.
     * A creator dragging a wire is asking the question continuously, so it is answered
     * continuously: the port under the pointer goes green or red, and every port that is
     * not a candidate dims so the ones that are become the thing to look at.
     *
     * @param {{x: number, y: number}} point - The pointer, in graph space
     */
    #markWireTarget(point) {
        const drag = this.#drag;
        if (drag?.kind !== 'wire') return;

        const hit = hitTest(this.#layout(), point);
        const over = hit.kind === 'port' && hit.direction !== drag.direction
            ? { node: hit.node.id, port: hit.port.id }
            : null;

        let allowed = false;
        if (over) {
            const ends = drag.direction === 'out' ? [drag.from, over] : [over, drag.from];
            allowed = this.#definition.graph.canConnect(ends[0], ends[1]).allowed;
        }

        for (const shape of this.#nodesLayer.querySelectorAll('.port, .port-halo')) {
            const marked = over
                && shape.dataset.node === over.node
                && shape.dataset.port === over.port
                && shape.dataset.direction === hit.direction;

            shape.classList.toggle('candidate', Boolean(marked && allowed));
            shape.classList.toggle('rejected', Boolean(marked && !allowed));
        }
    }

    /** Take the wiring marks off, whatever ended the gesture. */
    #clearWireMarks() {
        this.#svg.classList.remove('wiring');
        for (const shape of this.#nodesLayer?.querySelectorAll('.candidate, .rejected') ?? []) {
            shape.classList.remove('candidate', 'rejected');
        }
    }

    #cancelDrag(pointerId) {
        // WHAT THE NODES ARE DRAWN FROM IS ABOUT TO STOP BEING TRUE. `.dragging` is derived
        // from `#drag` inside `#drawNode()`, and the last repaint of a node drag happens on
        // the last pointermove — while the gesture is still on. Clearing `#drag` without
        // re-deriving left the carried node wearing `dragging`, so the closed hand survived
        // the release and every later hover over that node showed `grabbing`. A class read
        // off a field is only as fresh as the last draw; the field changing here is exactly
        // when it has to be read again.
        const derived = this.#drag !== null;

        this.#pending.removeAttribute('d');
        this.#svg.classList.remove('panning', 'moving');
        this.#clearWireMarks();
        if (pointerId !== undefined && this.#svg.hasPointerCapture?.(pointerId)) {
            this.#svg.releasePointerCapture(pointerId);
        }
        this.#drag = null;

        // Nothing was written, so putting a re-routed wire back is a repaint too. Abandoning
        // one is free, which is what makes trying it safe (ADR-0028 §2).
        if (derived) this.#draw();
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
    #openNodeMenu(event, anchor, source = null) {
        if (!this.#definition) return;

        // A right-click lands the node where the pointer is; the button has no pointer, so
        // it uses the middle of what the creator is looking at. Either way the spot is
        // nudged until it is free — two nodes at the same coordinates look like one, and a
        // creator who pressed the button twice would think the second press did nothing.
        const box = this.getBoundingClientRect();
        const at = this.#freeSpot(event
            ? this.#pointerAt(event)
            : toGraph({ x: box.width / 2, y: box.height / 2 }, this.#view));

        // CATEGORIES FIRST, ENTRIES SECOND, SEARCH ACROSS EVERYTHING. Twenty nodes behind
        // one scroll meant reading nineteen to find the twentieth; the menu now opens on
        // the eight groups, and typing leaves the groups behind entirely (ui/menu.js).
        //
        // EACH ENTRY CARRIES WHAT THE SCORER READS: its label, its type, its category and
        // the aliases the catalogue declares — so `float` finds Number, `times` finds
        // Multiply and `event` finds both event nodes (ui/relevance.js).
        // WHAT THE SOURCE PORT CARRIES NARROWS THE LIST. Dropping a wire from a `number`
        // output and being offered `On Start` is the picker ignoring the only thing the
        // creator has already told it. The compatibility question is the model's
        // (`compatibleTargets`, core/graph/nodes.js), so the menu asks rather than guesses.
        const wanted = source ? this.#sourcePort(source) : null;
        const targets = wanted
            ? compatibleTargets(this.#definition.registry, wanted, source.direction)
            : null;

        const items = [];
        for (const group of groupNodes(this.#definition.registry)) {
            const entries = targets
                ? group.entries.filter(entry => targets.has(entry.type))
                : group.entries;
            if (entries.length === 0) continue;

            items.push({ heading: group.category, icon: iconForNode(group.category) });
            for (const entry of entries) {
                items.push({
                    id: entry.type,
                    label: entry.label,
                    icon: iconForNode(entry),
                    category: group.category,
                    type: entry.type,
                    keywords: entry.keywords ?? null,
                    tooltip: entry.tooltip ?? ''
                });
            }
        }

        // A double-click opens the menu WHERE THE POINTER IS, so the node lands where the
        // creator was looking. `openMenu` positions from a rectangle, and a point is a
        // rectangle with no size — no second positioning API for one caller.
        const from = anchor ?? (event ? pointAnchor(event.clientX, event.clientY) : this);

        openMenu(from, items, type => {
            const node = this.#definition.graph.addNode({ type, x: at.x, y: at.y });
            if (!node) return;

            // ONE BATCH: placing the node and joining it are one thing the creator did, so
            // one Ctrl Z takes both back (ADR-0024 §4). A wire that was re-routed here
            // drops its old connection in the same batch.
            if (source) this.#connectNew(source, node, `${node.id}:link`);
            this.#select(node.id);
        }, {
            label: 'nodes',
            search: true,
            // A filtered list is already short and already about one thing; opening it on
            // its categories would add a step to a gesture that is mid-flow.
            browse: !source
        });
    }

    /**
     * The port a dropped wire started from.
     * @param {object} source - `{ node, port, direction }`
     * @returns {object|null} The port descriptor
     */
    #sourcePort(source) {
        const node = this.#definition.graph.node(source.node);
        if (!node) return null;

        const ports = this.#definition.graph.portsOf(node);
        const side = source.direction === 'out' ? ports.outputs : ports.inputs;
        return side.find(port => port.id === source.port) ?? null;
    }

    /**
     * Join a freshly created node to the port the wire came from.
     *
     * The FIRST port that would take it, in declaration order — which is the one a node
     * type puts first because it is the one that matters. Asking the creator to choose
     * again, immediately after they chose the node, would undo the point of the gesture.
     *
     * @param {object} source - `{ node, port, direction }` the wire started from
     * @param {object} node - The node that was just created
     * @param {string} batch - Groups the creation and the connection into one undo entry
     * @returns {boolean} True when a connection was made
     */
    #connectNew(source, node, batch) {
        const graph = this.#definition.graph;
        const ports = graph.portsOf(node);
        const side = source.direction === 'out' ? ports.inputs : ports.outputs;

        for (const port of side) {
            const ends = source.direction === 'out'
                ? [{ node: source.node, port: source.port }, { node: node.id, port: port.id }]
                : [{ node: node.id, port: port.id }, { node: source.node, port: source.port }];

            if (!graph.canConnect(ends[0], ends[1]).allowed) continue;
            if (source.regrab) graph.disconnect(source.regrab, { batch });
            graph.connect(ends[0], ends[1], { batch });
            return true;
        }

        // Nothing took it. The node is still placed where the creator dropped the wire,
        // which is the half of the gesture that always makes sense.
        return false;
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

    /**
     * Put the whole graph in view, once, when it is first looked at.
     *
     * TWO REASONS TO DECLINE, AND ONLY ONE OF THEM IS AN ANSWER — which is the whole of the
     * bug this shape fixes. A canvas that cannot be measured has not answered the question
     * and must be asked again; a canvas with nothing on it HAS answered it, because the view
     * a creator already has is the right one to keep. Treating the second like the first
     * left every new `.px` permanently unframed, so the first node added — which makes the
     * resource dirty, which makes the workbench call `wake()` — was framed on arrival and
     * slammed the canvas to 2.5x on a single card.
     *
     * ADDING A NODE IS NOT A CAMERA MOVE. Nothing here runs again once the question has been
     * answered; `Frame all` passes `force` and is the only way back in.
     */
    #frame(force = false) {
        if (!this.#definition) return;
        if (!force && this.#framed === this.#definition) return;

        // A CANVAS THAT IS NOT ON SCREEN HAS NOTHING TO FRAME INTO. The workbench keeps one
        // instance per open `.px` and hides the ones whose tab is not showing, so this runs
        // on a zero-sized box every time a second graph is opened. `fitView()` answers the
        // identity view for an empty viewport, which is a correct answer to a meaningless
        // question — so the attempt is declined WITHOUT being recorded, and `wake()` is what
        // tries again.
        const box = this.getBoundingClientRect();
        if (box.width <= 0 || box.height <= 0) return;

        // Measured, so the question is settled either way. An empty graph keeps the view it
        // has, and keeps it for good.
        this.#framed = this.#definition;

        const layout = this.#layout();
        if (layout.length === 0) return;

        this.#view = fitView(layout, { width: box.width, height: box.height });
    }

    #report(reason) {
        if (!reason) return;
        this.#status.hidden = false;
        this.#status.classList.add('problem');
        fill(this.#status, el('span', { textContent: reason }));
    }
}

/**
 * One of the Editor's icons, placed on the canvas.
 *
 * `icon()` builds an HTML span, which renders as nothing inside an SVG — so the drawing is
 * fetched and placed here, scaled from the 16-unit grid every glyph is drawn on, with the
 * stroke divided back out so it lands at the same weight as everywhere else.
 *
 * @param {string} name - An icon name
 * @param {object} at - `{ x, y, size, color }`
 * @returns {SVGElement} A group holding the glyph
 */
function glyphIn(name, { x, y, size, color }) {
    const group = svg('g', {
        class: 'glyph',
        transform: `translate(${x} ${y}) scale(${size / ICON_GRID})`,
        color,
        'stroke-width': (1.4 * ICON_GRID) / size
    });
    group.innerHTML = iconPaths(name);
    return group;
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

/**
 * A port identifier, as a creator would read it.
 *
 * The same transformation `core/graph/nodes.js` applies when a port declares no label; it
 * is repeated here for the ONE case the Core cannot cover - a label deliberately blanked so
 * the row can be compact, which still needs a name in its tooltip.
 *
 * @param {string} id - The port's identifier
 * @returns {string} The humanised name
 */
function humanise(id) {
    return globalThis.String(id ?? '')
        .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
        .replace(/^./, first => first.toUpperCase());
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
